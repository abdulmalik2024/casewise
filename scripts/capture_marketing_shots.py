"""Capture real-product marketing screenshots against production.

Run: uv run --project pipelines python scripts/capture_marketing_shots.py
Outputs retina PNGs to apps/web/public/shots/. Re-run any time the UI
changes — marketing imagery stays authentic and regenerable.
Costs ~2 Ask calls (a few cents).
"""

from __future__ import annotations

import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "https://casewise.si/app"
OUT = Path(__file__).parents[1] / "apps" / "web" / "public" / "shots"

AUDIT_TEXT = (
    "Respondent relies on the warranty of habitability under Real Property Law "
    "§ 235-b and the rent demand requirement of RPAPL § 711. See Park West Mgt. "
    "Corp. v. Mitchell, 47 N.Y.2d 316 (1979); Edgemont Corp. v. Audet, 170 Misc. "
    "2d 1040 (App Term 1996). Petitioner's reliance on RPL § 999-z and Matter of "
    "Nobody v. Nowhere, 999 Misc 2d 12345, is misplaced. See also 22 NYCRR § 208.42."
)


def top_shot(page, path: Path, max_height: int = 1150) -> None:
    """Top slice of the main column (the app scrolls inside <main>)."""
    page.evaluate("document.querySelector('main').scrollTo(0, 0)")
    page.wait_for_timeout(300)
    col = page.locator("main div.max-w-3xl").first
    bb = col.bounding_box()
    page.screenshot(path=str(path), clip={
        "x": max(bb["x"] - 8, 0), "y": max(bb["y"], 0),
        "width": bb["width"] + 16,
        "height": min(bb["height"], max_height),
    })
    print(f"saved {path.name}")


def element_shot(locator, path: Path) -> None:
    locator.scroll_into_view_if_needed()
    locator.screenshot(path=str(path))
    print(f"saved {path.name}")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 1000},
            device_scale_factor=2,
            color_scheme="light",
        )
        page = ctx.new_page()

        # 1) Ask with verified quotations
        page.goto(BASE, wait_until="networkidle")
        page.get_by_placeholder(re.compile("Ask a legal question")).fill(
            "What does the warranty of habitability require, and what are the tenant's remedies?"
        )
        page.get_by_role("button", name="Research", exact=True).click()
        page.wait_for_selector("text=Verified sources", timeout=240_000)
        page.wait_for_timeout(500)
        top_shot(page, OUT / "ask-verified.png")
        quote_line = page.locator("text=verified word-for-word").locator("xpath=ancestor::div[1]")
        if quote_line.count():
            element_shot(quote_line.first, OUT / "quotes-verified.png")

        # 2) Building-grounded sources
        page.get_by_role("button", name="New research").click()
        page.get_by_placeholder(re.compile("Ask a legal question")).fill(
            "My client rents at 888 Grand Concourse, Bronx — no heat and mold. What are her rights?"
        )
        page.get_by_role("button", name="Research", exact=True).click()
        page.wait_for_selector("text=building record", timeout=240_000)
        page.wait_for_timeout(500)
        sources = page.locator("text=Verified sources").locator("xpath=ancestor::div[1]")
        element_shot(sources.first, OUT / "building-sources.png")

        # 3) Check cites audit with a fabricated citation flagged
        page.get_by_role("button", name="New research").click()
        page.get_by_role("button", name="Check cites").first.click()
        page.locator("textarea").fill(AUDIT_TEXT)
        page.get_by_role("button", name="Check cites").last.click()
        page.wait_for_selector("text=Citation audit", timeout=120_000)
        page.wait_for_timeout(500)
        card = page.locator("text=Citation audit").locator(
            "xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"
        )
        element_shot(card.first, OUT / "check-cites.png")

        # 4) Search with source filters and relevance grades
        page.get_by_role("button", name="New research").click()
        page.get_by_role("button", name="Search", exact=True).click()
        page.get_by_placeholder(re.compile("Search statutes")).fill(
            "notice required before rent increase"
        )
        page.get_by_role("button", name="Search", exact=True).last.click()
        page.wait_for_selector("text=Strong match", timeout=120_000)
        page.wait_for_timeout(500)
        top_shot(page, OUT / "search.png", max_height=1400)

        browser.close()
    print("done")


if __name__ == "__main__":
    main()
