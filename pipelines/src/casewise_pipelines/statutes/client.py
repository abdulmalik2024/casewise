"""Client for the NY Senate Open Legislation API v3.

Docs: https://legislation.nysenate.gov/static/docs/html/laws.html
"""

from __future__ import annotations

import httpx

BASE_URL = "https://legislation.nysenate.gov/api/3"


class OpenLegError(RuntimeError):
    pass


class OpenLegClient:
    def __init__(self, api_key: str, base_url: str = BASE_URL, timeout: float = 120.0):
        self._key = api_key
        self._http = httpx.Client(base_url=base_url, timeout=timeout)

    def _get(self, path: str, **params) -> dict:
        resp = self._http.get(path, params={"key": self._key, **params})
        resp.raise_for_status()
        payload = resp.json()
        if not payload.get("success", False):
            raise OpenLegError(f"{path}: {payload.get('message', 'unknown API error')}")
        return payload["result"]

    def list_laws(self) -> list[dict]:
        """All law chapters (id, name, type)."""
        return self._get("/laws", limit=1000)["items"]

    def get_law(self, law_id: str, date: str | None = None) -> dict:
        """Full law tree with text. `date` (ISO) returns the law as of that date."""
        params: dict = {"full": "true"}
        if date:
            params["date"] = date
        return self._get(f"/laws/{law_id}", **params)

    def get_updates(self, from_datetime: str, to_datetime: str) -> list[dict]:
        """Law documents updated in the window (ISO datetimes). Drives incremental refresh."""
        result = self._get(f"/laws/updates/{from_datetime}/{to_datetime}", limit=1000)
        return result["items"]

    def close(self) -> None:
        self._http.close()
