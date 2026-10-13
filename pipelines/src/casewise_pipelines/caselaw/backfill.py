"""Historical case-law backfill from CourtListener (10-year window).

Flow per court: page the clusters endpoint (case name, date, citations),
then fetch each cluster's opinion text, and upsert into case_decisions
(feed_code='backfill'). Cursor + processed ids checkpoint to
data/backfill-state/ so interrupted runs resume.

Requires COURTLISTENER_API_TOKEN (free account). Respects rate limits by
pacing and honoring 429 Retry-After.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx
import psycopg
from dotenv import find_dotenv, load_dotenv

from ..statutes.loader import ensure_schema
from .loader import UPSERT

API = "https://www.courtlistener.com/api/rest/v4"

COURTS = {
    "ny": "New York Court of Appeals",
    "nyappdiv": "Appellate Division of the Supreme Court of New York",
    "nyappterm": "Appellate Term of the Supreme Court of New York",
    "nycivct": "Civil Court of the City of New York",
}


def slip_citation_of(cluster: dict) -> str | None:
    for c in cluster.get("citations") or []:
        if (c.get("reporter") or "") == "NY Slip Op":
            return f"{c.get('volume')} NY Slip Op {c.get('page')}"
    # fall back to the first citation of any reporter
    for c in cluster.get("citations") or []:
        if c.get("reporter"):
            return f"{c.get('volume')} {c['reporter']} {c.get('page')}".strip()
    return None


def best_text(opinion: dict) -> str | None:
    for field in ("plain_text", "html_with_citations", "html", "html_lawbox"):
        v = (opinion.get(field) or "").strip()
        if v:
            if field != "plain_text":
                v = re.sub(r"<[^>]+>", " ", v)
                v = re.sub(r"[ \t]+", " ", v)
            return v.strip() or None
    return None


class CLClient:
    def __init__(self, token: str, pace: float):
        self._http = httpx.Client(
            headers={"Authorization": f"Token {token}"}, timeout=60.0
        )
        self._pace = pace

    def get(self, url: str, **params) -> dict:
        for attempt in range(8):
            resp = self._http.get(url, params=params or None)
            if resp.status_code == 200:
                time.sleep(self._pace)
                return resp.json()
            if resp.status_code == 429:
                wait = float(resp.headers.get("retry-after") or 60)
                print(f"  rate limited, sleeping {wait:.0f}s", flush=True)
                time.sleep(min(wait + 1, 3600))
                continue
            if resp.status_code >= 500:
                time.sleep(10 * (attempt + 1))
                continue
            resp.raise_for_status()
        raise RuntimeError(f"gave up on {url}")


def _state_path(court: str) -> Path:
    return Path(__file__).parents[3] / "data" / "backfill-state" / f"{court}.json"


def _load_state(court: str) -> dict:
    p = _state_path(court)
    if p.exists():
        return json.loads(p.read_text())
    return {"next_url": None, "done_pages": 0, "loaded": 0, "finished": False}


def _save_state(court: str, state: dict) -> None:
    p = _state_path(court)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state))


def backfill_court(
    client: CLClient, conn: psycopg.Connection | None, court: str, since: str, limit: int
) -> int:
    state = _load_state(court)
    if state["finished"]:
        print(f"{court}: already finished ({state['loaded']} loaded)")
        return 0

    url = state["next_url"] or f"{API}/clusters/"
    params = (
        {}
        if state["next_url"]
        else {
            "docket__court": court,
            "date_filed__gte": since,
            "order_by": "date_filed",
            "fields": "id,case_name,date_filed,citations,sub_opinions,absolute_url",
        }
    )

    loaded = 0
    while url:
        page = client.get(url, **params)
        params = {}
        for cluster in page.get("results", []):
            sub = cluster.get("sub_opinions") or []
            if not sub:
                continue
            opinion = client.get(sub[0])
            text = best_text(opinion)
            if not text or len(text) < 300:
                continue
            row = (
                re.sub(r"\s+", " ", cluster.get("case_name") or "Unknown"),
                "https://www.courtlistener.com" + (cluster.get("absolute_url") or f"/c/{cluster['id']}"),
                slip_citation_of(cluster),
                COURTS.get(court, court),
                cluster.get("date_filed"),
                "backfill",
                text,
            )
            if conn:
                with conn.cursor() as cur:
                    cur.execute(UPSERT, row)
                conn.commit()
            loaded += 1
            state["loaded"] += 1
            if limit and loaded >= limit:
                state["next_url"] = url
                _save_state(court, state)
                print(f"{court}: limit reached ({loaded} this run, {state['loaded']} total)")
                return loaded
        url = page.get("next")
        state["next_url"] = url
        state["done_pages"] += 1
        _save_state(court, state)
        if state["done_pages"] % 10 == 0:
            print(f"  {court}: {state['loaded']} loaded, page {state['done_pages']}", flush=True)

    state["finished"] = True
    _save_state(court, state)
    print(f"{court}: finished ({state['loaded']} total)")
    return loaded


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Backfill historical NY decisions from CourtListener")
    ap.add_argument("--since", default="2016-10-13", help="earliest date_filed (ISO)")
    ap.add_argument("--courts", default=",".join(COURTS), help="comma-separated court ids")
    ap.add_argument("--limit", type=int, default=0, help="max decisions per court this run")
    ap.add_argument("--pace", type=float, default=1.0, help="seconds between requests")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("COURTLISTENER_API_TOKEN")
    if not token:
        print("COURTLISTENER_API_TOKEN is not set (free account: courtlistener.com)", file=sys.stderr)
        return 2

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)

    client = CLClient(token, pace=args.pace)
    total = 0
    try:
        for court in [c.strip() for c in args.courts.split(",") if c.strip()]:
            total += backfill_court(client, conn, court, args.since, args.limit)
    finally:
        if conn:
            conn.close()
    print(f"done: {total} decisions this run")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
