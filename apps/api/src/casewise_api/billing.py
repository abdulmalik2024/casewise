"""Stripe billing: checkout sessions + webhook that flips profiles.plan.

Raw Stripe REST via httpx (no SDK dependency). The webhook verifies the
Stripe-Signature header (HMAC-SHA256 over "{t}.{payload}") before trusting
anything in the body. plan='paid' is set on checkout.session.completed and
reverted to 'trial' when the subscription is deleted (an expired trial then
gates naturally).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import httpx
from fastapi import HTTPException
from psycopg_pool import ConnectionPool

from .config import settings

STRIPE_API = "https://api.stripe.com/v1"
SUCCESS_URL = "https://casewise.si/app?upgraded=1"
CANCEL_URL = "https://casewise.si/pricing"
_customers_table_ready = False


def billing_configured() -> bool:
    return bool(
        settings.stripe_secret_key
        and settings.stripe_price_monthly
        and settings.stripe_price_yearly
    )


def create_checkout(user: dict, plan: str) -> str:
    """-> Stripe Checkout URL for this signed-in user. plan: monthly|yearly."""
    if not billing_configured():
        raise HTTPException(503, "billing is not configured yet — check back shortly")
    price = settings.stripe_price_monthly if plan == "monthly" else settings.stripe_price_yearly
    data = {
        "mode": "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        "client_reference_id": user["id"],
        "customer_email": user.get("email") or "",
        "success_url": SUCCESS_URL,
        "cancel_url": CANCEL_URL,
        "allow_promotion_codes": "true",
    }
    try:
        resp = httpx.post(
            f"{STRIPE_API}/checkout/sessions",
            auth=(settings.stripe_secret_key, ""),
            data=data,
            timeout=15.0,
        )
    except httpx.HTTPError:
        raise HTTPException(503, "billing service unreachable; retry shortly")
    if resp.status_code != 200:
        raise HTTPException(503, "could not start checkout; retry shortly")
    return resp.json()["url"]


def verify_webhook(payload: bytes, sig_header: str | None) -> dict:
    """-> parsed event after signature check. 400 on anything suspect."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(503, "billing webhook is not configured")
    if not sig_header:
        raise HTTPException(400, "missing signature")
    parts = dict(
        p.split("=", 1) for p in sig_header.split(",") if "=" in p
    )
    ts, v1 = parts.get("t"), parts.get("v1")
    if not ts or not v1:
        raise HTTPException(400, "malformed signature")
    if abs(time.time() - int(ts)) > 300:
        raise HTTPException(400, "stale signature")
    expected = hmac.new(
        settings.stripe_webhook_secret.encode(),
        f"{ts}.".encode() + payload,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise HTTPException(400, "bad signature")
    return json.loads(payload)


def _ensure_customers_table(pool: ConnectionPool) -> None:
    global _customers_table_ready
    if _customers_table_ready:
        return
    with pool.connection() as conn:
        conn.execute(
            "create table if not exists billing_customers ("
            "  user_id uuid primary key,"
            "  stripe_customer text,"
            "  stripe_subscription text,"
            "  created_at timestamptz not null default now()"
            ")"
        )
    _customers_table_ready = True


def handle_event(pool: ConnectionPool, event: dict) -> None:
    kind = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    if kind == "checkout.session.completed":
        user_id = obj.get("client_reference_id")
        if not user_id:
            return
        _ensure_customers_table(pool)
        with pool.connection() as conn:
            conn.execute("update profiles set plan = 'paid' where id = %s", (user_id,))
            conn.execute(
                "insert into billing_customers (user_id, stripe_customer, stripe_subscription) "
                "values (%s, %s, %s) on conflict (user_id) do update "
                "set stripe_customer = excluded.stripe_customer, "
                "    stripe_subscription = excluded.stripe_subscription",
                (user_id, obj.get("customer"), obj.get("subscription")),
            )
    elif kind == "customer.subscription.deleted":
        customer = obj.get("customer")
        if not customer:
            return
        _ensure_customers_table(pool)
        with pool.connection() as conn:
            conn.execute(
                "update profiles set plan = 'trial' where id in "
                "(select user_id from billing_customers where stripe_customer = %s)",
                (customer,),
            )
