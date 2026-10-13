from fastapi.testclient import TestClient

from casewise_api.main import app


def test_search_validates_query_length():
    with TestClient(app) as client:
        assert client.get("/search", params={"q": "ab"}).status_code == 422


def test_ask_validates_query_length():
    with TestClient(app) as client:
        assert client.get("/ask", params={"q": "ab"}).status_code == 422
