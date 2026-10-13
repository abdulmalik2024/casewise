"""Sync the curated deadline rules (seeds/deadlines.yaml) to Postgres.

The YAML file is the source of truth and the attorney-review surface (changes
go through git). The loader replaces the table contents on every run and
verifies each citation exists in statute_sections.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg
import yaml
from dotenv import find_dotenv, load_dotenv

from ..statutes.loader import ensure_schema

SEED = Path(__file__).parents[3] / "seeds" / "deadlines.yaml"

SCHEMA = """
create table if not exists deadline_rules (
    id           bigint generated always as identity primary key,
    topic        text    not null unique,
    question     text    not null,
    jurisdiction text    not null default 'NY',
    rule         text    not null,
    citation     text    not null,
    verified     boolean not null default false,
    updated_at   timestamptz not null default now()
);
"""


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Sync deadline rules to Postgres")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    rows = yaml.safe_load(SEED.read_text())
    problems = [r["topic"] for r in rows if not all(r.get(k) for k in ("topic", "question", "rule", "citation"))]
    if problems:
        print(f"rows missing required fields: {problems}", file=sys.stderr)
        return 1
    print(f"{len(rows)} rules in seed file "
          f"({sum(1 for r in rows if r.get('verified'))} verified)")
    if args.dry_run:
        return 0

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    with psycopg.connect(db_url) as conn:
        ensure_schema(conn)
        conn.execute(SCHEMA)
        missing = []
        for r in rows:
            if not conn.execute(
                "select 1 from statute_sections where citation = %s and is_current limit 1",
                (r["citation"],),
            ).fetchone():
                missing.append(f"{r['topic']}: {r['citation']}")
        if missing:
            print("citations not found in statute_sections:", *missing, sep="\n  ", file=sys.stderr)
            return 1
        conn.execute("delete from deadline_rules")
        with conn.cursor() as cur:
            cur.executemany(
                """insert into deadline_rules (topic, question, jurisdiction, rule, citation, verified)
                   values (%s, %s, %s, %s, %s, %s)""",
                [
                    (r["topic"], r["question"], r.get("jurisdiction", "NY"),
                     r["rule"].strip(), r["citation"], bool(r.get("verified", False)))
                    for r in rows
                ],
            )
        conn.commit()
    print(f"synced {len(rows)} deadline rules")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
