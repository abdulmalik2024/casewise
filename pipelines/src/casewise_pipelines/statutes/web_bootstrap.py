"""Bootstrap/backup statutes ingestion by crawling www.nysenate.gov law pages.

Same backend data as the Open Legislation API, served as HTML without an API
key — used for the initial load while the API portal is down, and as a fallback
whenever the API is unavailable. Rows are tagged source='nysenate_web'; the
authoritative API load replaces them (see run.py).
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from datetime import date

import httpx
import psycopg
from bs4 import BeautifulSoup
from dotenv import find_dotenv, load_dotenv

from .loader import delete_source_rows, ensure_schema, load_sections
from .parser import StatuteSection
from .run import DEFAULT_LAWS

SITE = "https://www.nysenate.gov"
SOURCE = "nysenate_web"
# nysenate.gov's WAF only admits classic CLI user agents (curl/, Wget/) and 403s
# everything else, including browser strings — keep the curl prefix, identify after it.
USER_AGENT = "curl/8.7.1 (Casewise corpus pipeline; +https://github.com/abdulmalik2024/casewise)"
LEAF_LABELS = ("SECTION", "RULE")
SUBDIVISION_PATH_LABELS = ("ARTICLE", "TITLE", "PART", "SUBPART")


def fetch(client: httpx.Client, url: str, retries: int = 4) -> str:
    for attempt in range(retries):
        try:
            resp = client.get(url)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code in (429, 500, 502, 503, 504):
                time.sleep(2**attempt)
                continue
            resp.raise_for_status()
        except httpx.TransportError:
            if attempt == retries - 1:
                raise
            time.sleep(2**attempt)
    raise RuntimeError(f"gave up fetching {url}")


def parse_listing(html: str) -> list[tuple[str, str]]:
    """(label, href) for each child item on a listing page, e.g. ('SECTION 227', '.../RPP/227')."""
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for a in soup.select("a.nys-openleg-result-item-link[href]"):
        name = a.select_one(".nys-openleg-result-item-name")
        label = re.sub(r"\s+", " ", name.get_text()).strip().upper() if name else ""
        items.append((label, a["href"]))
    return items


def _active_date(soup: BeautifulSoup, fallback: str) -> str:
    dates = [
        o["value"]
        for o in soup.select("select[id^=edit-history] option")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", o.get("value", ""))
    ]
    if dates:
        return max(dates)
    published = soup.select_one(".nys-openleg-history-published")
    if published:
        m = re.search(r"(\d{4}-\d{2}-\d{2})", published.get_text())
        if m:
            return m.group(1)
    return fallback


def _article_path(soup: BeautifulSoup) -> str:
    parts = []
    for name_div in soup.select(".nys-openleg-result-breadcrumb-name"):
        name = re.sub(r"\s+", " ", name_div.get_text()).strip()
        if not name.upper().startswith(SUBDIVISION_PATH_LABELS):
            continue
        desc_div = name_div.parent.select_one(".nys-openleg-result-breadcrumb-description")
        desc = re.sub(r"\s+", " ", desc_div.get_text()).strip() if desc_div else ""
        parts.append(f"{name} — {desc}" if desc else name)
    return " > ".join(parts)


def parse_section_page(
    html: str, law_id: str, location_id: str, crawl_date: str
) -> StatuteSection | None:
    soup = BeautifulSoup(html, "html.parser")
    text_div = soup.select_one("div.nys-openleg-result-text")
    if text_div is None:
        return None
    for br in text_div.find_all("br"):
        br.replace_with("\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text_div.get_text().split("\n")]
    text = "\n".join(lines).strip()
    if not text:
        return None

    heading_el = soup.select_one("h3.nys-openleg-result-title-short")
    heading = re.sub(r"\s+", " ", heading_el.get_text()).strip() if heading_el else None

    return StatuteSection(
        law_id=law_id,
        location_id=location_id,
        citation=f"{law_id} § {location_id}",
        heading=heading,
        article_path=_article_path(soup),
        text=text,
        active_date=_active_date(soup, fallback=crawl_date),
        source_url=f"{SITE}/legislation/laws/{law_id}/{location_id}",
        source=SOURCE,
    )


def crawl_law(client: httpx.Client, law_id: str, delay: float) -> list[StatuteSection]:
    crawl_date = date.today().isoformat()
    law_prefix = f"/legislation/laws/{law_id}/"
    visited: set[str] = set()
    sections: list[StatuteSection] = []
    # (url, is_leaf) — the law root is a listing
    queue: list[tuple[str, bool]] = [(f"{SITE}/legislation/laws/{law_id}", False)]

    while queue:
        url, is_leaf = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        html = fetch(client, url)
        time.sleep(delay)

        if is_leaf:
            location_id = url.rstrip("/").split("/")[-1]
            section = parse_section_page(html, law_id, location_id, crawl_date)
            if section:
                sections.append(section)
            continue

        for label, href in parse_listing(html):
            absolute = href if href.startswith("http") else SITE + href
            if law_prefix not in absolute:
                continue
            queue.append((absolute, label.startswith(LEAF_LABELS)))

    return sections


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Bootstrap NY statutes from nysenate.gov HTML")
    ap.add_argument("--laws", default=",".join(DEFAULT_LAWS), help="comma-separated law ids")
    ap.add_argument("--delay", type=float, default=0.7, help="seconds between requests")
    ap.add_argument("--dry-run", action="store_true", help="crawl and parse, skip the database")
    args = ap.parse_args()

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set (see .env.example)", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)

    client = httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=60.0, follow_redirects=True
    )
    total = 0
    try:
        for law_id in [x.strip().upper() for x in args.laws.split(",") if x.strip()]:
            sections = crawl_law(client, law_id, delay=args.delay)
            if conn:
                load_sections(conn, sections)
            total += len(sections)
            print(f"{law_id}: {len(sections)} sections" + (" (dry run)" if args.dry_run else ""))
    finally:
        client.close()
        if conn:
            conn.close()

    print(f"done: {total} sections total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
