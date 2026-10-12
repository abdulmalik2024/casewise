"""Minimal Voyage AI embeddings client."""

from __future__ import annotations

import time

import httpx

API_URL = "https://api.voyageai.com/v1/embeddings"
DEFAULT_MODEL = "voyage-law-2"  # legal-domain; 1024 dims (same as voyage-4 family)
# Free-tier accounts (no payment method) are capped at a few requests/min and
# ~10K tokens/min; small batches + long 429 waits keep us inside it. Adding a
# card bumps limits ~1000x — raise VOYAGE_BATCH_SIZE then.
BATCH_SIZE = int(__import__("os").environ.get("VOYAGE_BATCH_SIZE", "8"))


class VoyageClient:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        self.model = model
        self._http = httpx.Client(
            headers={"Authorization": f"Bearer {api_key}"}, timeout=120.0
        )

    def embed(self, texts: list[str], input_type: str = "document") -> list[list[float]]:
        """Embed texts in order. input_type: 'document' for corpus, 'query' for questions."""
        out: list[list[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            for attempt in range(8):
                resp = self._http.post(
                    API_URL,
                    json={"input": batch, "model": self.model, "input_type": input_type},
                )
                if resp.status_code == 200:
                    data = resp.json()["data"]
                    out.extend(item["embedding"] for item in data)
                    break
                if resp.status_code == 429:
                    time.sleep(min(20 * (attempt + 1), 120))
                    continue
                resp.raise_for_status()
            else:
                raise RuntimeError("voyage: exhausted retries on rate limit")
        return out

    def close(self) -> None:
        self._http.close()
