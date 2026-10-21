"""Load a property/landlord-tenant slice of the archived Appellate Division decade.

The full 85K-decision archive needs Supabase Pro; this loads only the opinions
relevant to our practice areas, scored by keyword groups, newest and most
relevant first, capped to stay inside the free tier.

Usage: load-appdiv-slice [--cap 4000] [--dry-run]
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re

import httpx

ARCHIVE_URL = "https://pub-58f122652b4f40d7b4f560a1099c1d08.r2.dev/ny-decisions/nyappdiv.jsonl.gz"

# one regex per topic group; an opinion's score = number of DISTINCT groups hit
GROUPS: list[re.Pattern] = [
    re.compile(r"landlord|tenant", re.I),
    re.compile(r"RPAPL|Real Property Actions", re.I),
    re.compile(r"Real Property Law|RPL §", re.I),
    re.compile(r"rent[- ]stabil|rent[- ]control|DHCR|overcharge", re.I),
    re.compile(r"holdover|nonpayment|eviction|warrant of eviction", re.I),
    re.compile(r"habitability|constructive eviction", re.I),
    re.compile(r"foreclos|mortgage", re.I),
    re.compile(r"mechanic'?s lien|Lien Law", re.I),
    re.compile(r"easement|adverse possession|quiet title|encroach", re.I),
    re.compile(r"condominium|cooperative (?:corporation|apartment)|co-op\b|proprietary lease", re.I),
    re.compile(r"commercial lease|Yellowstone", re.I),
    re.compile(r"broker.{0,20}commission|real estate broker", re.I),
    re.compile(r"contract of sale.{0,40}(?:real property|premises)|specific performance", re.I),
]
# a single hit on one of these is enough on its own
STRONG = re.compile(
    r"RPAPL|rent[- ]stabil|holdover|warranty of habitability|Yellowstone|mechanic'?s lien",
    re.I,
)
RANK = {"010": 0, "015": 1, "020": 2}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cap", type=int, default=4000)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    best: dict[str, tuple[int, int, dict]] = {}  # cluster -> (opinion_rank, score, rec)
    scanned = 0
    # buffer the 138MB archive to a temp file, then stream-decompress it
    import tempfile

    tmp_path = ""
    for attempt in range(4):
        try:
            with tempfile.NamedTemporaryFile(suffix=".jsonl.gz", delete=False) as tmp:
                with httpx.stream("GET", ARCHIVE_URL, timeout=120.0) as resp:
                    resp.raise_for_status()
                    for chunk in resp.iter_bytes(1 << 20):
                        tmp.write(chunk)
                tmp_path = tmp.name
            break
        except httpx.HTTPError as e:
            print(f"download attempt {attempt + 1} failed ({e}); retrying")
            import time

            time.sleep(10)
    else:
        raise RuntimeError("archive download failed after 4 attempts")
    print(f"downloaded archive to {tmp_path}")

    with gzip.open(tmp_path, "rt", encoding="utf-8") as f:
        for line in f:
            scanned += 1
            rec = json.loads(line)
            text = rec.get("text") or ""
            score = sum(1 for g in GROUPS if g.search(text))
            if score < 2 and not STRONG.search(text):
                continue
            rank = RANK.get((rec.get("type") or "")[:3], 9)
            slim = {
                "case_name": rec.get("case_name") or "Unknown",
                "url": rec["url"],
                "citation": rec.get("citation"),
                "date": rec.get("date"),
                "text": text,
            }
            cur = best.get(rec["cluster_id"])
            if cur is None or rank < cur[0]:
                best[rec["cluster_id"]] = (rank, score, slim)
            if scanned % 20000 == 0:
                print(f"  scanned {scanned:,}, matched clusters {len(best):,}", flush=True)
    os.unlink(tmp_path)

    # sort: score desc, then newest first
    picked = sorted(best.values(), key=lambda t: (-t[1], -(int((t[2]["date"] or "0000")[:4]))))
    picked = picked[: args.cap]
    print(f"scanned {scanned:,} opinions; matched {len(best):,} clusters; loading {len(picked):,}")
    if args.dry_run:
        for _, score, r in picked[:10]:
            print(f"  score {score}  {r['date']}  {(r['citation'] or r['case_name'])[:60]}")
        return 0

    import psycopg

    from ..caselaw.loader import UPSERT

    dsn = os.environ["DATABASE_URL"]
    conn = psycopg.connect(dsn)
    n = 0
    batch: list[tuple] = []
    for _, _, r in picked:
        batch.append(
            (
                r["case_name"],
                r["url"],
                r["citation"],
                "Appellate Division of the Supreme Court of New York",
                r["date"],
                "appdiv",
                r["text"],
            )
        )
        if len(batch) >= 25:
            with conn.cursor() as cur:
                cur.executemany(UPSERT, batch)
            conn.commit()
            n += len(batch)
            batch = []
            if n % 500 == 0:
                print(f"  loaded {n:,}", flush=True)
    if batch:
        with conn.cursor() as cur:
            cur.executemany(UPSERT, batch)
        conn.commit()
        n += len(batch)
    conn.close()
    print(f"loaded {n:,} Appellate Division decisions — now run: embed-corpus --source caselaw")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
