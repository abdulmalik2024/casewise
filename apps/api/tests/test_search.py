from fastapi.testclient import TestClient

from casewise_api.main import app


def test_search_requires_auth():
    with TestClient(app) as client:
        # 401 when auth is configured, 503 when it is not (local test env)
        assert client.get("/search", params={"q": "notice"}).status_code in (401, 503)


def test_ask_allows_guests_but_needs_db(monkeypatch):
    # /ask admits anonymous guests (quota-limited), so without a DB it's 503,
    # never 401
    from casewise_api.config import settings

    monkeypatch.setattr(settings, "database_url", "")
    with TestClient(app) as client:
        assert client.get("/ask", params={"q": "notice period"}).status_code == 503


def test_guest_status_needs_db(monkeypatch):
    from casewise_api.config import settings

    monkeypatch.setattr(settings, "database_url", "")
    with TestClient(app) as client:
        assert client.get("/guest/status").status_code == 503


def test_me_requires_auth():
    with TestClient(app) as client:
        assert client.get("/me").status_code in (401, 503)
