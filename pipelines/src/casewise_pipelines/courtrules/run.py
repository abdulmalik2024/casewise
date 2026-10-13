"""Court rules + official forms ingestion (V-2.1.0, corpus plan Tier 1 #4).

nycourts.gov's bot defenses make recurring scraping unreliable, so this
pipeline works from committed seeds instead:

- Rules: seeds/courtrules/part-{208,210,212}.txt — the rendered text of the
  Uniform Civil Rules pages (NYC Civil Court incl. housing part §208.42,
  City Courts outside NYC, District Courts), captured manually via a real
  browser. Refresh by re-saving the page text when rules change (rarely).
- Forms: seeds/forms.yaml — a hand-curated, reviewable catalog of
  landlord-tenant forms with stable nycourts.gov links.

Rows land in agency_documents (doc_type 'court-rule' / 'court-form') and
embed as source_type 'rule' / 'form'.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import psycopg
import yaml
from dotenv import find_dotenv, load_dotenv

from ..dhcr.run import SCHEMA, UPSERT
from ..statutes.loader import ensure_schema

SEEDS = Path(__file__).parents[3] / "seeds"
RULE_SOURCE_URLS = {
    "208": "https://www.nycourts.gov/rules/part-208-uniform-civil-rules-new-york-city-civil-court",
    "210": "https://www.nycourts.gov/rules/part-210-uniform-civil-rules-city-courts-outside-city-new-york",
    "212": "https://www.nycourts.gov/rules/part-212-uniform-civil-rules-district-courts",
}

SECTION_RE = re.compile(r"^Section\s+(2\d\d\.\d+(?:-[a-z])?)\s+(\S.{0,180})$", re.M)


def split_part_sections(text: str, part: str) -> list[tuple[str, str, str]]:
    """(section_number, heading, body) from a Part page's rendered text."""
    matches = [m for m in SECTION_RE.finditer(text) if m.group(1).startswith(part + ".")]
    out = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end():end].strip()
        if len(body) > 50:
            out.append((m.group(1), m.group(2).strip(), body))
    return out


def ingest_rules(conn: psycopg.Connection | None) -> int:
    n = 0
    for part, url in RULE_SOURCE_URLS.items():
        path = SEEDS / "courtrules" / f"part-{part}.txt"
        if not path.exists():
            print(f"Part {part}: seed file missing ({path}), skipped", file=sys.stderr)
            continue
        sections = split_part_sections(path.read_text(), part)
        for sec, heading, body in sections:
            row = (
                f"rule-{sec}",
                "court-rule",
                f"22 NYCRR § {sec}",
                heading[:200],
                url,
                None,
                None,
                f"{heading}\n{body}",
            )
            if conn:
                with conn.cursor() as cur:
                    cur.execute(UPSERT, row)
                conn.commit()
        n += len(sections)
        print(f"Part {part}: {len(sections)} sections")
    return n


def ingest_forms(conn: psycopg.Connection | None) -> int:
    rows = yaml.safe_load((SEEDS / "forms.yaml").read_text()) or []
    for f in rows:
        text = f"{f['name']}\nCategory: {f.get('category', '')}\n{(f.get('description') or '').strip()}\nForm page: {f['url']}"
        row = (
            f"form-{f['slug']}",
            "court-form",
            f"Court Form: {f['name'][:80]}",
            f["name"][:200],
            f["url"],
            None,
            None,
            text,
        )
        if conn:
            with conn.cursor() as cur:
                cur.execute(UPSERT, row)
            conn.commit()
    print(f"forms: {len(rows)}")
    return len(rows)


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Ingest court rules and landlord-tenant forms from seeds")
    ap.add_argument("--only", choices=["rules", "forms"], default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)
        conn.execute(SCHEMA)
        conn.commit()

    total = 0
    try:
        if args.only in (None, "rules"):
            total += ingest_rules(conn)
        if args.only in (None, "forms"):
            total += ingest_forms(conn)
    finally:
        if conn:
            conn.close()
    print(f"done: {total} documents" + (" (dry run)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
