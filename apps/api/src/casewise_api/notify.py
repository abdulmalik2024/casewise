"""Admin notifications to info@casewise.si via the Resend API.

Fire-and-forget: a notification failure must never break the request
that triggered it. New-signup notices are claimed atomically through
profiles.notified_at, so each account notifies exactly once no matter
how many requests race on first load.
"""

from __future__ import annotations

import logging

import httpx
from psycopg_pool import ConnectionPool

from .config import settings

log = logging.getLogger(__name__)

ADMIN_EMAIL = "info@casewise.si"
FROM = "Casewise <no-reply@casewise.si>"

_column_ready = False


def notify_admin(subject: str, text: str) -> None:
    if not settings.resend_api_key:
        return
    try:
        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": FROM, "to": [ADMIN_EMAIL], "subject": subject, "text": text},
            timeout=10,
        ).raise_for_status()
    except Exception:
        log.exception("admin notification failed: %s", subject)


def _ensure_column(pool: ConnectionPool) -> None:
    global _column_ready
    if _column_ready:
        return
    with pool.connection() as conn:
        conn.execute(
            "alter table profiles add column if not exists notified_at timestamptz"
        )
    _column_ready = True


def notify_signup_once(pool: ConnectionPool, user_id: str) -> None:
    """On a profile's first sighting, email the admin. Safe to call every request."""
    _ensure_column(pool)
    with pool.connection() as conn:
        row = conn.execute(
            "update profiles set notified_at = now() "
            "where id = %s and notified_at is null "
            "returning email, plan, created_at::date",
            (user_id,),
        ).fetchone()
        if not row:
            return
        total = conn.execute("select count(*) from profiles").fetchone()[0]
    email, plan, created = row
    notify_admin(
        f"New signup: {email}",
        f"Email: {email}\nPlan: {plan}\nSigned up: {created}\n"
        f"Total accounts: {total}\n\nhttps://casewise.si",
    )


def notify_upgrade(pool: ConnectionPool, user_id: str) -> None:
    """Email the admin when an account becomes paid."""
    with pool.connection() as conn:
        row = conn.execute(
            "select email from profiles where id = %s", (user_id,)
        ).fetchone()
        paid = conn.execute("select count(*) from profiles where plan = 'paid'").fetchone()[0]
    email = row[0] if row else user_id
    notify_admin(
        f"New paid subscription: {email}",
        f"Email: {email}\nPaid accounts now: {paid}\n\nhttps://casewise.si",
    )
