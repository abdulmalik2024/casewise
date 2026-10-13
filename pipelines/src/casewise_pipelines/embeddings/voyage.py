"""Minimal Voyage AI embeddings client."""

from __future__ import annotations

import os
import time

import httpx

API_URL = "https://api.voyageai.com/v1/embeddings"
DEFAULT_MODEL = "voyage-law-2"  # legal-domain; 1024 dims (same as voyage-4 family)
# Accounts without a payment method are capped at 3 requests/min and ~10K
# tokens/min (the API says so explicitly on 429). Small batches + a fixed
# pause between requests glide under both caps. With a card on file, set
# VOYAGE_BATCH_SIZE=64 and VOYAGE_REQUEST_INTERVAL=0.
BATCH_SIZE = int(os.environ.get("VOYAGE_BATCH_SIZE", "4"))
REQUEST_INTERVAL = float(os.environ.get("VOYAGE_REQUEST_INTERVAL", "21"))


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
            if i:
                time.sleep(REQUEST_INTERVAL)
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
