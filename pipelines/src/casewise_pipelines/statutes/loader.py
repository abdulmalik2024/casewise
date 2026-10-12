"""Load parsed statute sections into Postgres, idempotently."""

from __future__ import annotations

from pathlib import Path

import psycopg

from .parser import StatuteSection

UPSERT = """
insert into statute_sections
    (law_id, location_id, citation, heading, article_path, text, active_date, source_url)
values (%s, %s, %s, %s, %s, %s, %s, %s)
on conflict (law_id, location_id, active_date) do update set
    citation = excluded.citation,
    heading = excluded.heading,
    article_path = excluded.article_path,
    text = excluded.text,
    source_url = excluded.source_url,
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
    conn.execute(schema)


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
                )
                for s in sections
            ],
        )
        cur.execute(RECOMPUTE_CURRENT)
    conn.commit()
    return len(sections)
