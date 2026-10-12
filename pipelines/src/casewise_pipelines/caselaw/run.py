"""Case-law ingestion CLI (daily refresh).

All feeds:      ingest-caselaw
Some feeds:     ingest-caselaw --feeds misc,AT1,AT2
Parse only:     ingest-caselaw --feeds misc --dry-run --limit 3
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg
from dotenv import find_dotenv, load_dotenv

from ..statutes.loader import ensure_schema
from .decision import build_decision
from .feeds import FEED_URL, FEEDS, parse_feed
from .fetcher import BrowserFetcher
from .loader import known_urls, load_decisions


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Ingest NY slip opinions from Official Reports RSS")
    ap.add_argument("--feeds", default=",".join(FEEDS), help="comma-separated feed codes")
    ap.add_argument("--limit", type=int, default=0, help="max new decisions per feed (0 = all)")
    ap.add_argument("--dry-run", action="store_true", help="fetch and parse, skip the database")
    args = ap.parse_args()

    codes = [c.strip() for c in args.feeds.split(",") if c.strip()]
    unknown = [c for c in codes if c not in FEEDS]
    if unknown:
        print(f"unknown feed codes: {unknown} (known: {list(FEEDS)})", file=sys.stderr)
        return 2

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set (see .env.example)", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)

    total = 0
    try:
        with BrowserFetcher() as fetcher:
            for code in codes:
                refs = parse_feed(fetcher.get_text(FEED_URL.format(code=code)), code)
                if conn:
                    seen = known_urls(conn, [r.url for r in refs])
                    refs = [r for r in refs if r.url not in seen]
                if args.limit:
                    refs = refs[: args.limit]
                decisions = []
                for ref in refs:
                    decision = build_decision(ref, fetcher.get_text(ref.url))
                    if decision:
                        decisions.append(decision)
                if conn:
                    load_decisions(conn, decisions)
                total += len(decisions)
                print(
                    f"{code}: {len(decisions)} new decisions"
                    + (" (dry run)" if args.dry_run else "")
                )
    finally:
        if conn:
            conn.close()

    print(f"done: {total} decisions total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
