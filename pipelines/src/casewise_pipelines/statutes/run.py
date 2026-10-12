"""Statutes ingestion CLI.

Initial load:    ingest-statutes
Specific laws:   ingest-statutes --laws RPP,RPA
Point in time:   ingest-statutes --laws RPP --date 2021-06-01
Parse only:      ingest-statutes --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg
from dotenv import find_dotenv, load_dotenv

from .client import OpenLegClient
from .loader import ensure_schema, load_sections
from .parser import parse_law_tree

# Launch corpus per docs/data/corpus-plan.md (CVP ingested whole; RAG scoping
# to landlord-tenant-relevant articles happens at retrieval, not ingestion).
DEFAULT_LAWS = ["RPP", "RPA", "MDW", "GOB", "ETP", "CVP"]


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Ingest NY statutes from Open Legislation")
    ap.add_argument("--laws", default=",".join(DEFAULT_LAWS), help="comma-separated law ids")
    ap.add_argument("--date", default=None, help="ISO date for point-in-time snapshot")
    ap.add_argument("--dry-run", action="store_true", help="fetch and parse, skip the database")
    args = ap.parse_args()

    api_key = os.environ.get("NYSENATE_API_KEY")
    if not api_key:
        print("NYSENATE_API_KEY is not set (see .env.example)", file=sys.stderr)
        return 2

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set (see .env.example)", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)

    client = OpenLegClient(api_key)
    total = 0
    try:
        for law_id in [x.strip().upper() for x in args.laws.split(",") if x.strip()]:
            result = client.get_law(law_id, date=args.date)
            sections = parse_law_tree(result)
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
