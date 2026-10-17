import hashlib
import hmac
import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from casewise_api import billing
from casewise_api.main import app


def test_checkout_requires_auth():
    with TestClient(app) as client:
        r = client.post("/billing/checkout", json={"plan": "monthly"})
        assert r.status_code in (401, 503)


def test_webhook_rejects_unsigned():
    with TestClient(app) as client:
        r = client.post("/billing/webhook", content=b"{}")
        assert r.status_code in (400, 503)


def test_webhook_signature_roundtrip(monkeypatch):
    monkeypatch.setattr(billing.settings, "stripe_webhook_secret", "whsec_test")
    payload = b'{"type": "checkout.session.completed"}'
    ts = str(int(time.time()))
    sig = hmac.new(b"whsec_test", f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    event = billing.verify_webhook(payload, f"t={ts},v1={sig}")
    assert event["type"] == "checkout.session.completed"

    with pytest.raises(HTTPException):
        billing.verify_webhook(payload, f"t={ts},v1={'0' * 64}")
    with pytest.raises(HTTPException):
        billing.verify_webhook(payload, f"t={int(time.time()) - 9000},v1={sig}")
