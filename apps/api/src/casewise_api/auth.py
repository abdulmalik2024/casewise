"""Authentication + trial enforcement.

Tokens are Supabase Auth access tokens sent as `Authorization: Bearer …`.
Validation delegates to Supabase's /auth/v1/user endpoint (no JWT secret to
manage) with a short in-process cache. The trial clock lives in
public.profiles (created by a signup trigger): 7 days from created_at,
unless plan = 'paid'. plan = 'blocked' always denies.
"""

from __future__ import annotations

import time

import httpx
from fastapi import Header, HTTPException
from psycopg_pool import ConnectionPool

from .config import settings

TRIAL_DAYS = 7
GUEST_LIMIT = 5
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 300
_guest_table_ready = False


def validate_token(authorization: str | None = Header(default=None)) -> dict:
    """-> Supabase user dict. 401 on anything else."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(503, "auth is not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "sign in to use Casewise")
    token = authorization.split(" ", 1)[1].strip()
    now = time.time()
    hit = _cache.get(token)
    if hit and now - hit[0] < _CACHE_TTL:
        return hit[1]
    try:
        resp = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "auth service unreachable; retry shortly")
    if resp.status_code != 200:
        raise HTTPException(401, "session expired; sign in again")
    user = resp.json()
    if len(_cache) > 2000:
        _cache.clear()
    _cache[token] = (now, user)
    return user


def trial_status(pool: ConnectionPool, user_id: str) -> dict:
    """-> {plan, days_left, active}."""
    with pool.connection() as conn:
        # calendar days, not elapsed 24h blocks: the day after signup reads
        # "6 days left", and access ends at the start of day 8
        row = conn.execute(
            "select plan, greatest(0, %s - (current_date - created_at::date))::int "
            "from profiles where id = %s",
            (TRIAL_DAYS, user_id),
        ).fetchone()
    if row is None:
        # profile trigger hasn't landed yet (brand-new signup) — treat as fresh trial
        return {"plan": "trial", "days_left": TRIAL_DAYS, "active": True}
    plan, days_left = row
    active = plan == "paid" or (plan == "trial" and days_left > 0)
    return {"plan": plan, "days_left": days_left if plan == "trial" else None, "active": active}


def _ensure_guest_table(pool: ConnectionPool) -> None:
    global _guest_table_ready
    if _guest_table_ready:
        return
    with pool.connection() as conn:
        conn.execute(
            "create table if not exists guest_usage ("
            "  guest_id text primary key,"
            "  ip text not null,"
            "  questions int not null default 0,"
            "  created_at timestamptz not null default now(),"
            "  updated_at timestamptz not null default now()"
            ")"
        )
        conn.execute("create index if not exists guest_usage_ip_idx on guest_usage (ip)")
    _guest_table_ready = True


def guest_remaining(pool: ConnectionPool, guest_id: str, ip: str) -> int:
    """Free questions left for this visitor: the worse of the per-guest-id
    count and the TOTAL for the IP. Summing per IP closes the rotation hole
    (a fresh guest id per request must not reset the quota)."""
    _ensure_guest_table(pool)
    with pool.connection() as conn:
        row = conn.execute(
            "select greatest("
            "  coalesce((select max(questions) from guest_usage where guest_id = %s), 0),"
            "  coalesce((select sum(questions) from guest_usage where ip = %s), 0)"
            ")",
            (guest_id, ip),
        ).fetchone()
    return max(0, GUEST_LIMIT - int(row[0] if row else 0))


def record_guest_question(pool: ConnectionPool, guest_id: str, ip: str) -> None:
    _ensure_guest_table(pool)
    with pool.connection() as conn:
        conn.execute(
            "insert into guest_usage (guest_id, ip, questions) values (%s, %s, 1) "
            "on conflict (guest_id) do update "
            "set questions = guest_usage.questions + 1, ip = excluded.ip, updated_at = now()",
            (guest_id, ip),
        )


def require_active(pool: ConnectionPool, user: dict) -> dict:
    status = trial_status(pool, user["id"])
    if not status["active"]:
        raise HTTPException(
            402,
            "Your 7-day free trial has ended. Visit casewise.si/pricing to continue; "
            "early adopters lock the launch rate.",
        )
    return status
