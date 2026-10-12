# Corpus ingestion pipelines

One module per source (see [docs/data/data-sources.md](../docs/data/data-sources.md)).

## statutes — NY Senate Open Legislation API

Ingests the launch statutes (RPP, RPA, MDW, GOB, ETP, CVP) into the
`statute_sections` table, one row per section per version (`active_date`).
Superseded versions are kept; `is_current` marks the latest.

```bash
cd pipelines
uv sync
uv run ingest-statutes --dry-run          # fetch + parse, no DB
uv run ingest-statutes                    # full load
uv run ingest-statutes --laws RPP --date 2021-06-01   # point-in-time snapshot
```

Requires `NYSENATE_API_KEY` (free: https://legislation.nysenate.gov) and, unless
`--dry-run`, `DATABASE_URL` — both read from the repo-root `.env`.

Weekly refresh (planned): poll `GET /api/3/laws/updates/{from}/{to}` and
re-ingest only the law chapters that changed.

### bootstrap-statutes (backup source)

Crawls the same data from `www.nysenate.gov/legislation/laws/...` HTML — no API
key needed. Used for the initial load while the API portal is down and as a
fallback whenever the API is unavailable. Rows are tagged
`source='nysenate_web'` and replaced by the next API load. Resumable
(checkpoints in `data/crawl-state/`); patient with Cloudflare 429s.

```bash
uv run bootstrap-statutes --dry-run
uv run bootstrap-statutes --laws RPP
```

## caselaw — NY Official Reports slip opinions (RSS)

Daily refresh of new decisions from the Law Reporting Bureau feeds
(COA, AD1st–AD4th, AT1/AT2, misc, ComDiv) into `case_decisions`.

```bash
uv run playwright install chromium   # one-time
uv run ingest-caselaw --dry-run --feeds AT1 --limit 2
uv run ingest-caselaw                # all feeds, load DB
```

Backfill beyond what the feeds carry (they hold the recent window) will come
from the slip-opinion index pages and/or CourtListener — TBD.

## Source quirks

- **Open Legislation**: law tree is CHAPTER > ARTICLE > ... > SECTION; only
  SECTION nodes carry text. `date=` returns point-in-time versions.
- **nysenate.gov**: WAF admits only classic CLI user agents (curl/, Wget/);
  Cloudflare rate-limits sustained crawling (429) — the crawler waits it out.
- **nycourts.gov**: Cloudflare JS challenge on the whole domain, feeds
  included; headless browsers in any flavor stay challenged — only HEADED
  Chrome clears it (use xvfb-run on servers). Navigations re-trigger the
  challenge, so the fetcher primes once and uses in-page fetch() after.
