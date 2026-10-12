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

## Source quirks

- **Open Legislation**: law tree is CHAPTER > ARTICLE > ... > SECTION; only
  SECTION nodes carry text. `date=` returns point-in-time versions.
- **nycourts.gov** (case-law feeds, future pipeline): behind Cloudflare bot
  protection — fetch via headless browser, not plain HTTP.
