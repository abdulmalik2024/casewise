# Casewise Data Sources & Storage Strategy

Status: researched 2026-10-12. Companion to [corpus-plan.md](corpus-plan.md).

## Storage decision: ingest-and-store for the corpus, live queries for records

**Everything the RAG pipeline answers from gets ingested, stored, chunked, and embedded locally** (Postgres + pgvector). Live-querying source APIs at question time is not viable because:

1. Embeddings/semantic search require a local, pre-processed corpus.
2. Citation verification must resolve against a corpus we control.
3. Source rate limits (CourtListener free tier: 5/min) can't sit in the answer path.
4. Versioning/point-in-time answers require keeping superseded text ourselves.
5. Source outages must not take the product down.

**Freshness is handled by scheduled refresh pipelines, not live reads.** Each source below has a refresh cadence; the UI shows per-source "current as of" dates.

**Exceptions (live at query time):** ACRIS property-record lookups (Tier 2 tool, dataset too large/dynamic to mirror at MVP) and optional CourtListener existence checks for citations outside our corpus.

## Tier 1 sources

### 1. State statutes — NY Senate Open Legislation API
- **Access**: REST API, free API key ([docs](https://legislation.nysenate.gov/static/docs/html/index.html), [laws endpoints](https://legislation.nysenate.gov/static/docs/html/laws.html)).
- **Key endpoints**: `GET /api/3/laws` (list of law ids), `GET /api/3/laws/{lawId}` (structure; `full=true` for all text; **`date=` param returns point-in-time versions** — use this for the versioning requirement), plus a laws *updates* endpoint for detecting changes since a date.
- **Law IDs to ingest**: RPL, RPP (RPAPL), CVP (CPLR — selected articles), MDW (Multiple Dwelling Law), GOB (General Obligations — selected), ETP (Emergency Tenant Protection Act).
- **Format**: JSON, structured by section — ideal for section-level chunking.
- **Refresh**: weekly poll of the updates endpoint; on change, re-ingest affected sections, mark old version superseded.
- **Licensing**: public government data, no restrictions. ✅ Lowest-risk source; build this pipeline first.

### 2. Regulations — DHCR publications (hcr.ny.gov)
- **Access**: PDFs/HTML on [hcr.ny.gov](https://hcr.ny.gov) — Rent Stabilization Code, ETPA regs, Tenant Protection Regulations, [operational bulletins](https://hcr.ny.gov/operational-bulletin-2024-1), fact sheets, policy statements.
- **⚠️ Do NOT scrape the NYCRR viewer hosted at govt.westlaw.com** (Thomson Reuters hosts the state's NYCRR compilation; their terms are the problem we're avoiding). Use DHCR's own published documents, which DHCR issues directly.
- **Format**: PDF (mostly) — needs a PDF→structured-text parsing step; retain section numbering (e.g., 9 NYCRR §2524.2) for citability.
- **Refresh**: monthly scrape + diff of the DHCR documents index; bulletins/fact sheets are versioned by number (e.g., OB-2024-1 supersedes OB-2023-x) — capture supersession explicitly.
- **Licensing**: NY State agency publications — public. ✅

### 3. Case law — CourtListener API + NY Official Reports
- **Primary: CourtListener REST API** ([help](https://courtlistener.com/help)) — opinions for NY Court of Appeals, Appellate Division. Free tier: **5 req/min, 50/hr, 125/day — fine for incremental refresh, not initial load**. Use their **bulk data downloads** for the initial corpus load, then API for daily incremental updates. [Commercial agreement with Free Law Project required before launch](https://free.law/2026/05/07/api-included-in-memberships/) for higher limits — they're startup-friendly; budget a modest annual fee.
- **Supplement: NY Official Reports / Law Reporting Bureau slip opinion service** ([nycourts.gov/reporter](https://www.nycourts.gov/reporter/Index.htm)) — free; **critical for Appellate Term and selected trial-court (Misc 3d) decisions**, where CourtListener's NY lower-court coverage must be verified, not assumed. NY is unusual in publishing many trial-level landlord-tenant decisions here — this partially covers the "previous case outcomes" goal from day one.
- **Format**: JSON (CourtListener), HTML (Official Reports).
- **Refresh**: daily incremental.
- **Action item**: before pipeline build, verify CourtListener's Appellate Term coverage with a sample query; if thin, Official Reports becomes the primary for housing appeals.

### 4. Court rules + official forms — nycourts.gov
- **Access**: [Landlord & Tenant forms](https://www.nycourts.gov/forms/landlordtenant/) (UCS-LTN series, fillable PDFs, organized by non-payment/holdover, inside vs. outside NYC); Uniform Court Rules (22 NYCRR) pages; [Housing Court section](https://www.nycourts.gov/courtsnychousing/forms.shtml).
- **Format**: PDF forms + HTML rules pages. Store forms as files with metadata (form id, use-case, court, inside/outside NYC); ingest rules text into RAG corpus.
- **Refresh**: monthly diff.
- **Licensing**: public. ✅

### 5. Curated deadlines/notices table — hand-built
- **Source**: authored by us, every row validated and signed off by the attorney partner, each row citing its controlling provision (statute ingested in #1, so citations link internally).
- **Storage**: structured table in Postgres (not embeddings). Query path: deadline-type questions route here first; RAG is the fallback.
- **Refresh**: re-validated whenever pipeline #1 detects a change in a cited provision — this linkage is the whole point of the design.

## Tier 2 sources (researched, queued)

### 6. NYC Admin Code / Housing Maintenance Code — ⚠️ licensing conversation needed
- The official full text is hosted by **American Legal Publishing** ([codelibrary.amlegal.com/codes/newyorkcity](https://dev-codelibrary.amlegal.com/codes/newyorkcity/latest/NYCadmin/0-0-0-1)) — free to *view*, but it's a commercial publisher and bulk scraping likely violates their ToS. **Options**: (a) contact ALP for a licensing/API arrangement, (b) check NYC Council's own publications of local laws, (c) at MVP, cover HMC obligations indirectly via MDW statute + DHCR/HPD guidance already in Tier 1. Going with (c) until (a) is resolved.
- Note: NYC Open Data has HMC *violations/complaints datasets* (enforcement records), not the code text — potentially a useful Tier 3 feature (building violation lookups), distinct from the corpus.

### 7. DHCR PAR decisions — no public database exists
- Research confirms there is **no official searchable database of PAR orders**; filing is paper-based and decisions are not systematically published. Alternatives: FOIL requests (slow), unofficial archives (licensing unclear), or — better — rely on **Article 78 review decisions** (court challenges to DHCR orders), which ARE in the case-law corpus. Deprioritized accordingly.

### 8. ACRIS — NYC Open Data (Socrata)
- **Access**: Socrata API, no auth needed (~1000 req/hr): Real Property **Master** (`bnx9-e6tj`), **Legals** (`8h5j-fqxa`), **Parties** (`636b-3b5g`), **References** (`uqqa-hym2`) at data.cityofnewyork.us; joinable on document id; BBL lookups via Legals.
- **Storage**: **live queries** (the exception to ingest-and-store) — build as a lookup tool the assistant calls at question time.
- **Licensing**: NYC Open Data terms — open. ✅

### 9. Pending legislation — NY Senate Open Legislation API
- Same API as #1 (bills endpoints + search). Zero new infrastructure; add when the "pending changes" feature is specced.

## Build order

1. **Statutes pipeline** (cleanest API, core content, versioning model proven here first)
2. **Case law pipeline** (bulk load + incremental; verify Appellate Term coverage first)
3. **DHCR documents pipeline** (PDF parsing — hardest engineering)
4. **Forms/rules pipeline** (easy)
5. **Deadlines table** (attorney-driven, parallel with all of the above)

## Open action items

- [ ] Verify CourtListener NY Appellate Term coverage (sample queries)
- [ ] Contact Free Law Project re: commercial terms before launch
- [ ] Decide NYC Admin Code path (ALP license vs. defer) — Tier 2 gate
- [ ] Attorney partner: ratify sub-domain → final statute article list
