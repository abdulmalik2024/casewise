"""Opt-in saved matters: the ONLY user content Casewise stores server-side.

Product decision (2026-10-24): nothing an attorney types is stored unless
they explicitly save it to a matter. Each row is one saved Case Prep
analysis: the inputs (dispute, facts, objective, scenario) and the verified
result, scoped to the authenticated user, deletable by them at any time.
"""

from __future__ import annotations

import json

from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field

_table_ready = False


def _ensure_table(pool: ConnectionPool) -> None:
    global _table_ready
    if _table_ready:
        return
    with pool.connection() as conn:
        conn.execute(
            "create table if not exists saved_matters ("
            "  id uuid primary key default gen_random_uuid(),"
            "  user_id uuid not null,"
            "  title text not null,"
            "  dispute text not null,"
            "  objective text not null default 'evaluate-claim',"
            "  scenario text,"
            "  facts text not null,"
            "  analysis jsonb not null,"
            "  created_at timestamptz not null default now()"
            ")"
        )
        conn.execute(
            "create index if not exists saved_matters_user_idx on saved_matters (user_id, created_at desc)"
        )
    _table_ready = True


class MatterIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    dispute: str = Field(min_length=10, max_length=500)
    objective: str = Field(default="evaluate-claim", max_length=40)
    scenario: str | None = Field(default=None, max_length=500)
    facts: str = Field(min_length=50, max_length=12_000)
    analysis: dict  # the done-event payload: answer, sources, quote_check, meter


def save_matter(pool: ConnectionPool, user_id: str, m: MatterIn) -> str:
    _ensure_table(pool)
    with pool.connection() as conn:
        row = conn.execute(
            "insert into saved_matters (user_id, title, dispute, objective, scenario, facts, analysis) "
            "values (%s, %s, %s, %s, %s, %s, %s) returning id",
            (
                user_id,
                m.title,
                m.dispute,
                m.objective,
                m.scenario,
                m.facts,
                json.dumps(m.analysis)[:400_000],
            ),
        ).fetchone()
    return str(row[0])


def list_matters(pool: ConnectionPool, user_id: str) -> list[dict]:
    _ensure_table(pool)
    with pool.connection() as conn:
        rows = conn.execute(
            "select id, title, dispute, objective, created_at from saved_matters "
            "where user_id = %s order by created_at desc limit 100",
            (user_id,),
        ).fetchall()
    return [
        {
            "id": str(r[0]),
            "title": r[1],
            "dispute": r[2],
            "objective": r[3],
            "created_at": r[4].isoformat(),
        }
        for r in rows
    ]


def get_matter(pool: ConnectionPool, user_id: str, matter_id: str) -> dict | None:
    _ensure_table(pool)
    with pool.connection() as conn:
        r = conn.execute(
            "select id, title, dispute, objective, scenario, facts, analysis, created_at "
            "from saved_matters where user_id = %s and id = %s",
            (user_id, matter_id),
        ).fetchone()
    if r is None:
        return None
    return {
        "id": str(r[0]),
        "title": r[1],
        "dispute": r[2],
        "objective": r[3],
        "scenario": r[4],
        "facts": r[5],
        "analysis": r[6],
        "created_at": r[7].isoformat(),
    }


def delete_matter(pool: ConnectionPool, user_id: str, matter_id: str) -> bool:
    _ensure_table(pool)
    with pool.connection() as conn:
        cur = conn.execute(
            "delete from saved_matters where user_id = %s and id = %s",
            (user_id, matter_id),
        )
        return cur.rowcount > 0
