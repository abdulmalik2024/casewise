"""Load decisions into Postgres, idempotently (keyed on the decision URL)."""

from __future__ import annotations

import psycopg

from .decision import Decision

UPSERT = """
insert into case_decisions
    (case_name, url, slip_citation, court, decided_date, feed_code, text)
values (%s, %s, %s, %s, %s, %s, %s)
on conflict (url) do update set
    case_name = excluded.case_name,
    slip_citation = excluded.slip_citation,
    court = excluded.court,
    decided_date = excluded.decided_date,
    feed_code = excluded.feed_code,
    text = excluded.text,
    retrieved_at = now()
"""


def load_decisions(conn: psycopg.Connection, decisions: list[Decision], batch_size: int = 25) -> int:
    """Commit in small batches: decisions carry long opinion texts, and one
    big executemany exceeds Supabase's statement timeout."""
    for i in range(0, len(decisions), batch_size):
        batch = decisions[i : i + batch_size]
        with conn.cursor() as cur:
            cur.executemany(
                UPSERT,
                [
                    (d.case_name, d.url, d.slip_citation, d.court, d.decided_date, d.feed_code, d.text)
                    for d in batch
                ],
            )
        conn.commit()
    return len(decisions)


def known_urls(conn: psycopg.Connection, urls: list[str]) -> set[str]:
    if not urls:
        return set()
    with conn.cursor() as cur:
        cur.execute("select url from case_decisions where url = any(%s)", (urls,))
        return {row[0] for row in cur.fetchall()}
