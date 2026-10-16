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
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 300


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
        raise HTTPException(401, "session expired — sign in again")
    user = resp.json()
    if len(_cache) > 2000:
        _cache.clear()
    _cache[token] = (now, user)
    return user


def trial_status(pool: ConnectionPool, user_id: str) -> dict:
    """-> {plan, days_left, active}."""
    with pool.connection() as conn:
        row = conn.execute(
            "select plan, greatest(0, %s - extract(day from now() - created_at))::int "
            "from profiles where id = %s",
            (TRIAL_DAYS, user_id),
        ).fetchone()
    if row is None:
        # profile trigger hasn't landed yet (brand-new signup) — treat as fresh trial
        return {"plan": "trial", "days_left": TRIAL_DAYS, "active": True}
    plan, days_left = row
    active = plan == "paid" or (plan == "trial" and days_left > 0)
    return {"plan": plan, "days_left": days_left if plan == "trial" else None, "active": active}


def require_active(pool: ConnectionPool, user: dict) -> dict:
    status = trial_status(pool, user["id"])
    if not status["active"]:
        raise HTTPException(
            402,
            "Your 7-day free trial has ended. Visit casewise.si/pricing to continue — "
            "early adopters lock the launch rate.",
        )
    return status
