from fastapi.testclient import TestClient

from casewise_api.main import app


def test_search_validates_query_length():
    with TestClient(app) as client:
        assert client.get("/search", params={"q": "ab"}).status_code == 422


def test_ask_is_not_enabled_yet():
    with TestClient(app) as client:
        assert client.get("/ask", params={"q": "warranty of habitability"}).status_code == 501
