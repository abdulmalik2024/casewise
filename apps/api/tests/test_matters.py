from fastapi.testclient import TestClient

from casewise_api.main import app


def test_matters_require_auth():
    with TestClient(app) as client:
        assert client.get("/matters").status_code in (401, 503)
        assert client.post(
            "/matters",
            json={
                "title": "Test",
                "dispute": "Deposit dispute over damage",
                "facts": "x" * 60,
                "analysis": {"answer": "a"},
            },
        ).status_code in (401, 503)
        assert client.delete("/matters/00000000-0000-0000-0000-000000000000").status_code in (401, 503)
