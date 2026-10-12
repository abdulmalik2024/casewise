"""Load parsed statute sections into Postgres, idempotently."""

from __future__ import annotations

from pathlib import Path

import psycopg

from .parser import StatuteSection

UPSERT = """
insert into statute_sections
    (law_id, location_id, citation, heading, article_path, text, active_date, source_url, source)
values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
on conflict (law_id, location_id, active_date) do update set
    citation = excluded.citation,
    heading = excluded.heading,
    article_path = excluded.article_path,
    text = excluded.text,
    source_url = excluded.source_url,
    source = excluded.source,
    retrieved_at = now()
"""

RECOMPUTE_CURRENT = """
update statute_sections s
set is_current = (s.active_date = m.max_date)
from (
    select law_id, location_id, max(active_date) as max_date
    from statute_sections
    group by law_id, location_id
) m
where s.law_id = m.law_id and s.location_id = m.location_id
"""


def ensure_schema(conn: psycopg.Connection) -> None:
    schema = (Path(__file__).parents[3] / "db" / "schema.sql").read_text()
    # `create extension` takes a catalog lock that deadlocks concurrent
    # pipelines; skip it when the extension is already installed.
    if conn.execute("select 1 from pg_extension where extname = 'vector'").fetchone():
        schema = schema.replace("create extension if not exists vector;", "")
    conn.execute(schema)
    conn.commit()


def load_sections(conn: psycopg.Connection, sections: list[StatuteSection]) -> int:
    with conn.cursor() as cur:
        cur.executemany(
            UPSERT,
            [
                (
                    s.law_id,
                    s.location_id,
                    s.citation,
                    s.heading,
                    s.article_path,
                    s.text,
                    s.active_date,
                    s.source_url,
                    s.source,
                )
                for s in sections
            ],
        )
        cur.execute(RECOMPUTE_CURRENT)
    conn.commit()
    return len(sections)


def delete_source_rows(conn: psycopg.Connection, law_id: str, source: str) -> int:
    """Remove rows from one source for a law (e.g. bootstrap rows after an API load)."""
    with conn.cursor() as cur:
        cur.execute(
            "delete from statute_sections where law_id = %s and source = %s",
            (law_id, source),
        )
        deleted = cur.rowcount
        cur.execute(RECOMPUTE_CURRENT)
    conn.commit()
    return deleted
