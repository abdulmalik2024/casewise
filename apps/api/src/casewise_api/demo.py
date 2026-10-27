"""Cached demo answers for the common-question chips.

The chip questions are asked constantly (every curious visitor starts
there), so their answers are precomputed and replayed: the full status
sequence, the citation preview, then the answer streamed in small chunks
with realistic pacing. Zero model cost per view, ~6 seconds to a complete
verified answer. Refresh after corpus changes:

    uv run python -m casewise_api.demo --refresh
"""

from __future__ import annotations

import json
import re
import time

from psycopg_pool import ConnectionPool

DEMO_QUESTIONS = [
    "What habitability defenses can a tenant raise in a nonpayment proceeding?",
    "What notice must a landlord give to terminate a month-to-month tenancy in NYC?",
    "How quickly must a landlord return a security deposit, and what can be deducted?",
    "How much notice must a landlord give before raising the rent in New York?",
]

_table_ready = False


def _norm(q: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", q.lower()).strip()


def _ensure_table(pool: ConnectionPool) -> None:
    global _table_ready
    if _table_ready:
        return
    with pool.connection() as conn:
        conn.execute(
            "create table if not exists demo_answers ("
            "  norm text primary key,"
            "  question text not null,"
            "  payload jsonb not null,"
            "  created_at timestamptz not null default now()"
            ")"
        )
    _table_ready = True


def get_demo(pool: ConnectionPool, question: str) -> dict | None:
    _ensure_table(pool)
    with pool.connection() as conn:
        row = conn.execute(
            "select payload from demo_answers where norm = %s", (_norm(question),)
        ).fetchone()
    return row[0] if row else None


def replay(payload: dict):
    """Yield the recorded events with live-feeling pacing."""
    for msg in payload.get("statuses", []):
        yield {"type": "status", "message": msg}
        time.sleep(0.55)
    if payload.get("citations"):
        yield {"type": "sources_preview", "citations": payload["citations"]}
        time.sleep(0.4)
    answer = payload.get("answer", "")
    words = answer.split(" ")
    buf: list[str] = []
    for w in words:
        buf.append(w)
        if len(buf) >= 7:
            yield {"type": "delta", "text": " ".join(buf) + " "}
            buf = []
            time.sleep(0.03)
    if buf:
        yield {"type": "delta", "text": " ".join(buf)}
    done = {k: v for k, v in payload.items() if k not in ("statuses", "citations")}
    done["type"] = "done"
    yield done


def refresh(pool: ConnectionPool) -> None:
    """Run each demo question through the real pipeline and store the events."""
    from .rag import ask_stream

    _ensure_table(pool)
    for q in DEMO_QUESTIONS:
        print(f"caching: {q}")
        statuses: list[str] = []
        citations: list[str] = []
        done: dict = {}
        for ev in ask_stream(pool, q, _skip_demo=True):
            if ev["type"] == "status":
                statuses.append(ev["message"])
            elif ev["type"] == "sources_preview":
                citations = ev.get("citations", [])
            elif ev["type"] == "done":
                done = {k: v for k, v in ev.items() if k != "type"}
        if not done.get("answer"):
            print("  SKIPPED: no answer produced")
            continue
        payload = {"statuses": statuses, "citations": citations, **done}
        with pool.connection() as conn:
            conn.execute(
                "insert into demo_answers (norm, question, payload) values (%s, %s, %s) "
                "on conflict (norm) do update set payload = excluded.payload, "
                "question = excluded.question, created_at = now()",
                (_norm(q), q, json.dumps(payload)),
            )
        print(f"  cached ({len(done.get('sources', []))} sources, {len(statuses)} statuses)")


if __name__ == "__main__":
    import sys

    from .config import settings

    if "--refresh" not in sys.argv:
        print("usage: python -m casewise_api.demo --refresh")
        raise SystemExit(1)
    pool = ConnectionPool(settings.database_url, min_size=1, max_size=2, open=True)
    refresh(pool)
    pool.close()
    print("done")
