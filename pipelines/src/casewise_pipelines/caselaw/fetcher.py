"""Headless-browser fetcher for nycourts.gov.

The whole domain (RSS feeds included) sits behind a Cloudflare JS challenge:
every plain HTTP client gets 403, and (verified 2026-10-12) headless Chromium
in any flavor stays challenged — only HEADED Chrome clears it. So this runs a
headed browser: fine on a dev machine; on a Linux server run under xvfb
(`xvfb-run uv run ingest-caselaw`). Setup: `uv run playwright install chromium`
(Chrome channel is used when present, falling back to Playwright chromium).
"""

from __future__ import annotations

import time


class ChallengeNotCleared(RuntimeError):
    pass


class BrowserFetcher:
    def __init__(self, delay: float = 2.0, timeout_ms: int = 45_000):
        self._delay = delay
        self._timeout = timeout_ms
        self._pw = None
        self._browser = None
        self._page = None

    def __enter__(self) -> "BrowserFetcher":
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        try:
            self._browser = self._pw.chromium.launch(channel="chrome", headless=False)
        except Exception:
            self._browser = self._pw.chromium.launch(headless=False)
        self._page = self._browser.new_page()
        return self

    def __exit__(self, *exc) -> None:
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()

    def _prime(self, url: str) -> None:
        """Navigate once so Cloudflare's challenge runs and sets clearance cookies.
        Every navigation risks a fresh challenge, so after priming, all requests
        go through in-page fetch() instead of page.goto(). Slow challenges get
        a longer wait and one retry on a fresh page."""
        for attempt in range(3):
            self._page.goto(url, wait_until="domcontentloaded", timeout=self._timeout)
            for _ in range(45):
                if "just a moment" not in (self._page.title() or "").lower():
                    return
                time.sleep(1)
            if attempt < 2:
                self._page.close()
                self._page = self._browser.new_page()
                time.sleep(5)
        raise ChallengeNotCleared(self._page.url)

    def get_page_html(self, url: str) -> str:
        """Navigate and return the rendered DOM. For HTML pages on hosts where
        in-page fetch() is challenged separately (the redesigned www pages);
        feeds/raw bodies should keep using get_text()."""
        self._prime(url)
        time.sleep(self._delay)
        return self._page.content()

    def get_text(self, url: str) -> str:
        """Raw response body (XML feeds and HTML pages alike)."""
        if self._page.url in ("about:blank", ""):
            self._prime(url)
        for attempt in range(2):
            time.sleep(self._delay)
            result = self._page.evaluate(
                "async url => { const r = await fetch(url); return [r.status, await r.text()]; }",
                url,
            )
            status, body = int(result[0]), result[1]
            if status == 200 and "<title>Just a moment" not in body[:2000]:
                return body
            if attempt == 0:  # clearance expired — re-prime and retry once
                self._prime(url)
                continue
        raise ChallengeNotCleared(url)
