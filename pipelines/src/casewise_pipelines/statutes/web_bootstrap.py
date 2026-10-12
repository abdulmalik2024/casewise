"""Bootstrap/backup statutes ingestion by crawling www.nysenate.gov law pages.

Same backend data as the Open Legislation API, served as HTML without an API
key — used for the initial load while the API portal is down, and as a fallback
whenever the API is unavailable. Rows are tagged source='nysenate_web'; the
authoritative API load replaces them (see run.py).
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

import httpx
import psycopg
from bs4 import BeautifulSoup
from dotenv import find_dotenv, load_dotenv

from .loader import delete_source_rows, ensure_schema, load_sections
from .parser import StatuteSection
from .run import DEFAULT_LAWS

SITE = "https://www.nysenate.gov"
SOURCE = "nysenate_web"
# nysenate.gov's WAF only admits classic CLI user agents (curl/, Wget/) and 403s
# everything else, including browser strings — keep the curl prefix, identify after it.
USER_AGENT = "curl/8.7.1 (Casewise corpus pipeline; +https://github.com/abdulmalik2024/casewise)"
LEAF_LABELS = ("SECTION", "RULE")
SUBDIVISION_PATH_LABELS = ("ARTICLE", "TITLE", "PART", "SUBPART")


def fetch(client: httpx.Client, url: str, retries: int = 6) -> str:
    """GET with patient backoff. Cloudflare rate-limits sustained crawling
    (429 + cf-mitigated: challenge); waiting it out works, so 429 sleeps
    long (Retry-After when sent, else 60s/120s/240s...) instead of failing."""
    for attempt in range(retries):
        try:
            resp = client.get(url)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code == 429:
                wait = float(resp.headers.get("retry-after") or 60 * 2**attempt)
                print(f"  rate limited, sleeping {wait:.0f}s ({url})", flush=True)
                time.sleep(min(wait, 600))
                continue
            if resp.status_code in (500, 502, 503, 504):
                time.sleep(5 * 2**attempt)
                continue
            resp.raise_for_status()
        except httpx.TransportError:
            if attempt == retries - 1:
                raise
            time.sleep(5 * 2**attempt)
    raise RuntimeError(f"gave up fetching {url}")


def parse_listing(html: str) -> list[tuple[str, str]]:
    """(label, href) for each child item on a listing page, e.g. ('SECTION 227', '.../RPP/227')."""
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for a in soup.select("a.nys-openleg-result-item-link[href]"):
        name = a.select_one(".nys-openleg-result-item-name")
        label = re.sub(r"\s+", " ", name.get_text()).strip().upper() if name else ""
        items.append((label, a["href"]))
    return items


def _active_date(soup: BeautifulSoup, fallback: str) -> str:
    dates = [
        o["value"]
        for o in soup.select("select[id^=edit-history] option")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", o.get("value", ""))
    ]
    if dates:
        return max(dates)
    published = soup.select_one(".nys-openleg-history-published")
    if published:
        m = re.search(r"(\d{4}-\d{2}-\d{2})", published.get_text())
        if m:
            return m.group(1)
    return fallback


def _article_path(soup: BeautifulSoup) -> str:
    parts = []
    for name_div in soup.select(".nys-openleg-result-breadcrumb-name"):
        name = re.sub(r"\s+", " ", name_div.get_text()).strip()
        if not name.upper().startswith(SUBDIVISION_PATH_LABELS):
            continue
        desc_div = name_div.parent.select_one(".nys-openleg-result-breadcrumb-description")
        desc = re.sub(r"\s+", " ", desc_div.get_text()).strip() if desc_div else ""
        parts.append(f"{name} — {desc}" if desc else name)
    return " > ".join(parts)


def parse_section_page(
    html: str, law_id: str, location_id: str, crawl_date: str
) -> StatuteSection | None:
    soup = BeautifulSoup(html, "html.parser")
    text_div = soup.select_one("div.nys-openleg-result-text")
    if text_div is None:
        return None
    for br in text_div.find_all("br"):
        br.replace_with("\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text_div.get_text().split("\n")]
    text = "\n".join(lines).strip()
    if not text:
        return None

    heading_el = soup.select_one("h3.nys-openleg-result-title-short")
    heading = re.sub(r"\s+", " ", heading_el.get_text()).strip() if heading_el else None

    return StatuteSection(
        law_id=law_id,
        location_id=location_id,
        citation=f"{law_id} § {location_id}",
        heading=heading,
        article_path=_article_path(soup),
        text=text,
        active_date=_active_date(soup, fallback=crawl_date),
        source_url=f"{SITE}/legislation/laws/{law_id}/{location_id}",
        source=SOURCE,
    )


def _state_path(law_id: str) -> Path:
    return Path(__file__).parents[3] / "data" / "crawl-state" / f"{law_id}.json"


def _load_state(law_id: str) -> dict | None:
    path = _state_path(law_id)
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_state(law_id: str, visited: set, queue: list, sections: list) -> None:
    path = _state_path(law_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "visited": sorted(visited),
                "queue": queue,
                "sections": [dataclasses.asdict(s) for s in sections],
            }
        )
    )


def crawl_law(
    client: httpx.Client, law_id: str, delay: float, resume: bool = True
) -> list[StatuteSection]:
    crawl_date = date.today().isoformat()
    law_prefix = f"/legislation/laws/{law_id}/"

    state = _load_state(law_id) if resume else None
    if state and not state["queue"] and state["sections"]:
        # completed crawl — reuse it (e.g. a dry run followed by the DB load);
        # --no-resume forces a fresh crawl
        sections = [StatuteSection(**s) for s in state["sections"]]
        print(f"  reusing completed crawl for {law_id}: {len(sections)} sections")
        return sections
    if state and state["queue"]:
        visited = set(state["visited"])
        queue = [tuple(x) for x in state["queue"]]
        sections = [StatuteSection(**s) for s in state["sections"]]
        print(f"  resuming {law_id}: {len(sections)} sections done, {len(queue)} urls queued")
    else:
        visited, sections = set(), []
        queue = [(f"{SITE}/legislation/laws/{law_id}", False)]

    since_checkpoint = 0
    while queue:
        url, is_leaf = queue.pop(0)
        if url in visited:
            continue
        html = fetch(client, url)
        visited.add(url)
        time.sleep(delay)

        if is_leaf:
            location_id = url.rstrip("/").split("/")[-1]
            section = parse_section_page(html, law_id, location_id, crawl_date)
            if section:
                sections.append(section)
        else:
            for label, href in parse_listing(html):
                absolute = href if href.startswith("http") else SITE + href
                if law_prefix in absolute:
                    queue.append((absolute, label.startswith(LEAF_LABELS)))

        since_checkpoint += 1
        if since_checkpoint >= 25:
            _save_state(law_id, visited, queue, sections)
            since_checkpoint = 0

    _save_state(law_id, visited, [], sections)
    return sections


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Bootstrap NY statutes from nysenate.gov HTML")
    ap.add_argument("--laws", default=",".join(DEFAULT_LAWS), help="comma-separated law ids")
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests")
    ap.add_argument("--dry-run", action="store_true", help="crawl and parse, skip the database")
    ap.add_argument("--no-resume", action="store_true", help="ignore saved crawl state")
    args = ap.parse_args()

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set (see .env.example)", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)

    client = httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=60.0, follow_redirects=True
    )
    total = 0
    try:
        for law_id in [x.strip().upper() for x in args.laws.split(",") if x.strip()]:
            sections = crawl_law(client, law_id, delay=args.delay, resume=not args.no_resume)
            if conn:
                load_sections(conn, sections)
            total += len(sections)
            print(f"{law_id}: {len(sections)} sections" + (" (dry run)" if args.dry_run else ""))
    finally:
        client.close()
        if conn:
            conn.close()

    print(f"done: {total} sections total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
