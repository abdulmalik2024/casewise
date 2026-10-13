"""DHCR guidance ingestion (pipeline #3).

hcr.ny.gov publishes the rent-regulation practice layer as PDFs behind stable
Drupal slugs that 301-redirect to versioned files (the redirect path carries
the revision date, e.g. .../2026/07/fact-sheet-26-07-2026.pdf). We discover
documents from the sitemap, follow redirects, extract text with pypdf, and
load into agency_documents.

Covered doc types: operational bulletins, policy statements, advisory
opinions, fact sheets (English), plus curated regulation amendment texts.
DHCR does not publish the full consolidated RSC (that lives on the
Westlaw-hosted NYCRR viewer, which we must not scrape) — the amendments +
guidance corpus is the coverage.
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time

import httpx
import psycopg
from dotenv import find_dotenv, load_dotenv
from pypdf import PdfReader

from ..statutes.loader import ensure_schema

SITEMAP = "https://hcr.ny.gov/sitemap.xml?page={page}"
USER_AGENT = "curl/8.7.1 (Casewise corpus pipeline; +https://github.com/abdulmalik2024/casewise)"

DOC_PREFIXES = ("operational-bulletin", "policy-statement", "advisory-opinion", "fact-sheet")
# curated extras: regulation amendment rule-texts
EXTRA_SLUGS = ["rsc-rule-text"]
NON_ENGLISH = (
    "spanish", "chinese", "korean", "russian", "italian", "polish", "french",
    "arabic", "urdu", "bengali", "haitian", "creole", "yiddish", "espanol",
)

SCHEMA = """
create table if not exists agency_documents (
    id            bigint generated always as identity primary key,
    slug          text not null unique,
    doc_type      text not null,         -- operational-bulletin | policy-statement | advisory-opinion | fact-sheet | regulation-amendments
    citation      text not null,         -- e.g. 'DHCR Operational Bulletin 2024-1'
    title         text,
    url           text not null,         -- stable hcr.ny.gov slug URL
    pdf_url       text,                  -- versioned file it redirected to
    revision_date date,
    text          text not null,
    retrieved_at  timestamptz not null default now()
);
"""

UPSERT = """
insert into agency_documents (slug, doc_type, citation, title, url, pdf_url, revision_date, text)
values (%s, %s, %s, %s, %s, %s, %s, %s)
on conflict (slug) do update set
    citation = excluded.citation, title = excluded.title, pdf_url = excluded.pdf_url,
    revision_date = excluded.revision_date, text = excluded.text, retrieved_at = now()
"""


def doc_type_of(slug: str) -> str | None:
    if slug in EXTRA_SLUGS:
        return "regulation-amendments"
    for p in DOC_PREFIXES:
        if slug.startswith(p + "-") or slug == p:
            return p
    return None


def is_english(slug: str) -> bool:
    return not any(lang in slug for lang in NON_ENGLISH)


def citation_for(slug: str, doc_type: str) -> str:
    rest = slug[len(doc_type):].lstrip("-")
    number = "-".join(rest.split("-")[:3]) if doc_type == "advisory-opinion" else rest
    if doc_type == "operational-bulletin":
        return f"DHCR Operational Bulletin {rest}"
    if doc_type == "policy-statement":
        return f"DHCR Policy Statement {rest}"
    if doc_type == "advisory-opinion":
        m = re.match(r"(\d+-\d+)", rest)
        return f"DHCR Advisory Opinion {m.group(1) if m else rest}"
    if doc_type == "fact-sheet":
        return f"DHCR Fact Sheet #{rest}"
    return "RSC Amendments (rule text)"


def discover(client: httpx.Client) -> list[str]:
    slugs: set[str] = set()
    for page in range(1, 8):
        resp = client.get(SITEMAP.format(page=page))
        if resp.status_code != 200:
            break
        for loc in re.findall(r"<loc>https://hcr\.ny\.gov/([^<]+)</loc>", resp.text):
            slug = loc.strip().rstrip("/")
            if "/" in slug:
                continue
            if doc_type_of(slug) and is_english(slug):
                slugs.add(slug)
        time.sleep(0.5)
    slugs.update(EXTRA_SLUGS)
    return sorted(slugs)


def _revision_date(pdf_url: str) -> str | None:
    m = re.search(r"/documents/(\d{4})/(\d{2})/", pdf_url)
    return f"{m.group(1)}-{m.group(2)}-01" if m else None


def fetch_document(client: httpx.Client, slug: str) -> dict | None:
    url = f"https://hcr.ny.gov/{slug}"
    resp = client.get(url, follow_redirects=True)
    if resp.status_code != 200:
        print(f"  {slug}: HTTP {resp.status_code}", file=sys.stderr)
        return None
    final_url = str(resp.url)
    body = resp.content
    if body[:5] == b"%PDF-" or final_url.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(body))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            print(f"  {slug}: pdf parse failed ({e})", file=sys.stderr)
            return None
    else:
        # occasional HTML node: crude text extraction of the main content
        html = body.decode("utf-8", errors="replace")
        main = re.search(r"<main[^>]*>(.*?)</main>", html, re.S)
        text = re.sub(r"<[^>]+>", " ", main.group(1) if main else html)
    text = re.sub(r"[ \t]+", " ", text).strip()
    if len(text) < 200:
        print(f"  {slug}: too little text, skipped", file=sys.stderr)
        return None
    first_line = next((ln.strip() for ln in text.split("\n") if len(ln.strip()) > 10), "")
    doc_type = doc_type_of(slug) or "unknown"
    return {
        "slug": slug,
        "doc_type": doc_type,
        "citation": citation_for(slug, doc_type),
        "title": first_line[:200] or None,
        "url": url,
        "pdf_url": final_url if final_url != url else None,
        "revision_date": _revision_date(final_url),
        "text": text,
    }


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Ingest DHCR guidance documents")
    ap.add_argument("--limit", type=int, default=0, help="max documents (0 = all)")
    ap.add_argument("--delay", type=float, default=1.0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = None
    if not args.dry_run:
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            print("DATABASE_URL is not set", file=sys.stderr)
            return 2
        conn = psycopg.connect(db_url)
        ensure_schema(conn)
        conn.execute(SCHEMA)
        conn.commit()

    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60.0)
    try:
        slugs = discover(client)
        if args.limit:
            slugs = slugs[: args.limit]
        print(f"{len(slugs)} documents discovered")
        loaded = 0
        for slug in slugs:
            doc = fetch_document(client, slug)
            time.sleep(args.delay)
            if not doc:
                continue
            if conn:
                with conn.cursor() as cur:
                    cur.execute(
                        UPSERT,
                        (doc["slug"], doc["doc_type"], doc["citation"], doc["title"],
                         doc["url"], doc["pdf_url"], doc["revision_date"], doc["text"]),
                    )
                conn.commit()
            loaded += 1
            if loaded % 25 == 0:
                print(f"  {loaded}/{len(slugs)}", flush=True)
        print(f"done: {loaded} documents" + (" (dry run)" if args.dry_run else ""))
    finally:
        client.close()
        if conn:
            conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
