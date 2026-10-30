# Casewise — Project Reference

**Version: V-2.17.0** (2026-10-30)

> Maintenance rule: this document is versioned with the product. When the
> version shown in the app sidebar changes, update this file in the same
> commit — current state only; history lives in git.

## What Casewise is

An AI legal research assistant for **solo and small-firm attorneys practicing
New York State property law** (landlord-tenant focus), live at
**https://casewise.si** (the app at /app; casewise-bice.vercel.app remains an alias). An attorney asks a question in plain
language and receives a drafted answer in which **every legal assertion cites
a source that provably exists in the corpus**, alongside a semantic search
over statutes, court decisions, and DHCR guidance.

- Built with a practicing NY property-law attorney as domain partner.
- Deliberately niche-first: one state, one practice area, expanding later.
- Positioned against BigLaw tools (Harvey et al., ~$1,200/seat) with
  small-firm pricing intent ($50–150/user/month); the real competitor is
  generic ChatGPT, beaten on NY-specific depth and verified citations.
- Attorney-facing only (avoids unauthorized-practice-of-law exposure).
- Note: a live USPTO application for "CASEWISE" (Serial 50062522, Torticity
  LLC, filed 2026-08-20) is a known trademark risk — keep branding
  investment reversible until cleared.

## Architecture

```
                   ┌─ Vercel ────────────────┐
  attorney ──────► │ apps/web  Next.js 15 UI │
                   └──────────┬──────────────┘
                              │ HTTPS (CORS allowlist)
                   ┌─ Railway ▼──────────────────────────────┐
                   │ apps/api  FastAPI "api" service          │
                   │  /search   semantic retrieval            │
                   │  /ask      RAG answer (non-streaming)    │
                   │  /ask/stream  SSE: status→deltas→done    │
                   │ "caselaw-refresh" worker (daily, xvfb)   │
                   └───────┬──────────────┬───────────────────┘
                           │              │
            ┌─ Supabase ───▼──┐   ┌───────▼─────────┐
            │ Postgres+pgvector│   │ Anthropic API    │ claude-opus-5-5
            │ corpus + chunks  │   │ (casewise wkspc) │ effort=high, fallbacks
            └──────────▲──────┘   └──────────────────┘
                       │                  ┌──────────────────┐
     pipelines/ (run locally or worker) ──│ Voyage AI         │ voyage-law-2
     statutes · caselaw · dhcr · deadlines│ embeddings (1024d)│
                                          └──────────────────┘
```

**The RAG loop** (`apps/api/src/casewise_api/rag.py`): embed question
(voyage-law-2, input_type=query) → pgvector cosine top-16 → dedupe to 8
sources labeled `[S1]..[S8]` → Claude drafts under a strict
cite-only-provided-markers system prompt → server strips any marker outside
the provided range and maps the rest to real citations. **Hallucinated
citations are structurally impossible in output.**

**Versioning model (statutes)**: one row per (law_id, location_id,
active_date); superseded versions kept, `is_current` flags latest. Supports
point-in-time questions ("what was the law when this lease was signed").

## Data corpus (as of V-2.0.0)

| Source type | Table | Contents | Count |
|---|---|---|---|
| statute | `statute_sections` | RPP, RPA (RPAPL), CVP (CPLR), GOB, MDW, ETP — full text, versioned, from nysenate.gov | 2,062 sections |
| case | `case_decisions` | 10-year corpus loaded from CourtListener bulk snapshots (Appellate Term 6,727, Court of Appeals 3,651, Civil Ct 27) + Official Reports slip-opinion feeds (daily refresh). The 85K-decision Appellate Division decade is archived on R2 (`ny-decisions/nyappdiv.jsonl.gz`), loaded at the Supabase Pro upgrade. API backfill retired. | 11,589 |
| guidance | `agency_documents` | DHCR operational bulletins, policy statements, advisory opinions, fact sheets (English), RSC amendment rule-texts | 166 docs |
| rule | `agency_documents` (doc_type court-rule) | Uniform Civil Rules Parts 208/210/212 (incl. housing part §208.42-.43), from committed seeds (`seeds/courtrules/*.txt`, captured via a real browser — nycourts.gov blocks bots) | 125 sections |
| form | `agency_documents` (doc_type court-form) | Hand-curated landlord-tenant form catalog (`seeds/forms.yaml`, reviewable like the deadline rules) | 5 forms |
| (feedback) | `answer_feedback` | Anonymous thumbs up/down + comments on answers; downvotes feed the future golden set | grows with use |
| (curated) | `deadline_rules` | Hand-built deadline/notice rules, citation-validated against the statute corpus; source of truth is `pipelines/seeds/deadlines.yaml` (attorney reviews via git) | 5 drafts, **all unverified** |
| (derived) | `chunks` | Embedded retrieval index over all of the above, 1024-dim pgvector | ~20,600 |

### Source quirks learned the hard way
- **nysenate.gov**: WAF admits ONLY classic CLI user agents (`curl/`,
  `Wget/`) — browser strings get 403. Cloudflare rate-limits sustained
  crawling (429 after ~150 requests); crawler waits it out, checkpoints to
  `pipelines/data/crawl-state/`. The Open Legislation API (same data, better
  version metadata) needs a free key — portal was down at build time; the
  web crawl is the bootstrap AND the standing fallback (`source` column;
  API load supersedes web rows).
- **nycourts.gov**: Cloudflare JS challenge on the whole domain incl. RSS.
  Only a HEADED browser clears it (headless always challenged). Navigations
  re-trigger the challenge → fetcher primes once, then in-page `fetch()`.
  Server-side this runs under xvfb (see `Dockerfile.caselaw`).
- **hcr.ny.gov (DHCR)**: no bot-blocking; document slugs 301-redirect to
  versioned PDFs (revision date in the path). DHCR does NOT publish the
  consolidated Rent Stabilization Code — official 9 NYCRR full text is
  Westlaw-hosted and **must not be scraped** (licensing red line).
- **CourtListener**: free-tier API throttles hard; 429s are waited out
  indefinitely (checkpointed). Filtered cluster queries can take minutes.
  NYC Civil Court coverage is nearly empty (27 docs/10 yrs) — historical
  housing-court decisions must come from Official Reports archive (future).

## Features (V-2.0.0)

**Platform (V-2.4.0):**
- Traffic analytics: Vercel Web Analytics (V-2.17.0; cookieless,
  `<Analytics />` in the root layout; page views/visitors/referrers in
  the Vercel dashboard once Web Analytics is enabled on the project).
- Domain: casewise.si on Vercel (Namecheap nameservers delegated to
  ns1/ns2.vercel-dns.com; SSL auto; app at /app). Deploy quirk: the live
  domain sometimes needs a SECOND `vercel deploy --prod` to pick up changes.
- Marketing site: landing (chatgpt.com/overview-style: framed real
  screenshots, alternating showcases, confidentiality section), Features
  (single column, real captures), Pricing (7-day no-card trial, $99.99/mo
  early-adopter placeholder), About. Screenshots regenerate via
  `scripts/capture_marketing_shots.py` (runs real flows against prod).
- Theme: judicial navy accent (#1e3a5a) on parchment/ink — two-color
  palette; green/red/amber reserved for semantic states.
- Auth (V-2.5.0): Supabase Auth — email/password live. Google OAuth
  button is shown DISABLED ("coming soon", V-2.6.1) until the provider
  is configured in Google Cloud + Supabase dashboard; re-enable by
  restoring signInWithOAuth in login/signup pages (see git history).
  /login + /signup pages; marketing CTAs route to /signup.
  The app at /app requires a session (redirects to /login signed out)
  and sends the Supabase access token on every API call.
- Trial enforcement (V-2.5.0): API validates tokens against Supabase
  (`auth.py`, 300s cache, no JWT secret needed); `public.profiles` row
  auto-created by `handle_new_user()` trigger; 7-day free trial, then
  product endpoints return 402 pointing at casewise.si/pricing. `/me`
  returns plan + days left; sidebar shows account, trial countdown,
  Sign out. Env: SUPABASE_URL/SUPABASE_ANON_KEY (API, Railway) and
  NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY (web, Vercel).
- Attorney-feedback round 1 (V-2.7.0): concise answers by default — the
  system prompt now opens with "**Short answer:**" + ≤5 cited bullets,
  ~200-word target; a "Go deeper" button on the latest answer sends a
  canned expand follow-up (prompt drops the length cap on such requests).
  Search: quoted "exact phrases" additionally require a literal ILIKE
  match in section text (semantic fallback if no verbatim hit); result
  cards expand to the full section text with query-term highlighting and
  a find-in-text box with match count. Pending from the same feedback:
  IRAC Draft mode — shipped as V-2.8.0 (below).
- IRAC Draft mode (V-2.8.0): new "Draft IRAC" tab — attorney supplies the
  legal issue + anonymized case facts; output is one complete
  Issue/Rule/Application/Conclusion unit per discrete issue with [Sn]
  verified citations, counteranalysis, and [FACT NEEDED] flags instead of
  assumed facts; ends "DRAFT — attorney work product for review…".
  API: POST /draft/stream (accounts only; draft.py), retrieval runs a
  statute-scoped search first (statutes-before-cases Rule grounding),
  max_tokens 20k (thinking shares the budget — 8k truncated drafts).
  Deterministic IRAC lint (irac_lint) on output: required headings, a
  citation on every Rule paragraph, Application cites only authorities the
  Rule introduced, fact-gap list — shown in the UI as a structure-check
  line next to quote verification. Memo export works on drafts. Design
  grounded in research report "IRAC drafting method and examples"
  (reports/; golden-set bar-exam PDFs in research_notes/…/source_pdfs —
  NCBE/BOLE items are internal-eval-only, licensing).
- V-2.13.0 (2026-10-21): free-tier corpus expansion COMPLETE (plan from
  2026-10-20): corpus now 15,766 decisions / 32,243 chunks / 5,746
  statute sections across 12 laws; DB 348MB of the 500MB free tier.
  Final piece: 4,000-opinion Appellate Division slice via new
  `load-appdiv-slice` pipeline (streams the 138MB R2 archive, scores
  opinions by 13 property/L&T keyword groups, keeps best opinion per
  cluster, score-then-recency ranking, download retries;
  feed_code='appdiv'). 92,264 opinions scanned, 4,444 matched, top
  4,000 loaded + embedded (7,441 chunks). Verified retrieval:
  foreclosure standing, Yellowstone, specific performance all return
  A.D. decisions. Remaining optional: agency guidance scrapers
  (DFS/DOS/AG); the full 85K AD decade still waits on Supabase Pro.
- V-2.12.2 (2026-10-21): SEO foundation + 2 keyword posts. metadataBase,
  per-page titles/descriptions (template '%s · Casewise'), OpenGraph +
  twitter cards with generated 1200x630 /brand/og.png, sitemap.xml and
  robots.txt (app/login/signup disallowed; /app also meta-noindexed),
  per-post generateMetadata with keywords + article OG. New posts:
  'Warranty of Habitability (RPL 235-b)' and 'Check Every Citation
  Before Filing' (use-case + keyword targeted; h2 subheadings now
  supported via '## ' prefix in posts.ts). Pending user action: Google
  Search Console verification + sitemap submission.
- V-2.12.1 (2026-10-20): marketing screenshots regenerated against the
  new UI (capture script: signs in via CASEWISE_TEST_EMAIL/_PASSWORD env
  since Check cites/Search are gated; panel-scoped selectors; new
  authorities-panel.png asset).
- V-2.12.0 (2026-10-20, SHIPPED as one release): full UI/UX redesign
  round (Abdul's mockups + cases.ai study), previews approved phase by
  phase. Phase B: navy verification banner per answer (citations/quotes/
  IRAC summary; amber on flags) + sticky "Verified authorities" desktop
  panel — type-colored top bars (navy statute, green decision, ochre
  guidance, plum rule, gray form, terracotta building), grouped in
  authority order, VERIFIED badges, official-text links; follow-ups swap
  IN PLACE (priors auto-collapse, scroll to top, answer window max-h 62vh
  with internal scroll that follows the stream). Rotating wait lines
  (real retrieved citations via sources_preview event; honest generic
  fallback). Phase C: Check cites 3-step flow, Paste/Upload tabs,
  match-status legend, measured coverage copy (5.1M records to the
  1800s; 12 statutes listed; audit patterns extended to all 12 laws).
  Phase D: niche landing hero ("Verified legal research for NY
  landlord-tenant and real estate litigation attorneys", Try 5 questions
  free). Marketing expansion: nav dropdowns (Features, Who it's for) +
  How it works page + Who it's for page + Blog (5 SEO posts: seller
  disclosure RPL § 462, security deposits GOL § 7-108, fabricated
  citations, habitability § 235-b, citation checking; V-2.16.1 also adds
  the cleared law-student testimonial to the landing page) + Features
  gains Draft IRAC card/anchors + About refresh
  (12 laws, landmarks, confidentiality-by-architecture paragraph).
  Pricing: four tiers — NEW Starter $49.99/mo (research only: Ask/Search/
  phrase/buildings/point-in-time; solo attorneys, paralegals, law
  students; PRO SE EXCLUDED on UPL grounds), Professional $99.99,
  Annual $999.99. Billing plan "starter" + STRIPE_PRICE_STARTER (503s
  until the Stripe price exists). KNOWN GAP: no per-plan feature gating
  yet — any paid checkout grants full access (Starter buyers
  over-served; build plan-aware gating before Starter volume). "← New
  research" back button; localhost CORS any port.
  Collapsible sidebar (« / » toggle, expanded by default, state in
  localStorage casewise-sidebar); empty state is now eyebrow "NEW YORK
  LEGAL RESEARCH" + "What are you researching today?" + mode subline +
  three example-question chips (fill the Ask box: habitability,
  month-to-month notice, security deposits — all anchor-backed);
  "As of" relabeled "Research date" with a "current law" hint when
  empty; "Private by design" note in the sidebar footer. Mobile: new
  sticky header (wordmark + navy hamburger) opening the sidebar as a
  drawer — previously phones had NO access to history/account/guest
  counter; drawer closes on restore/new-research; composer toolbar
  wraps cleanly (Research button no longer clips off-screen). Workflow note:
  UI changes now go out as Vercel PREVIEW deploys for Abdul's approval
  before production (preview URLs sit behind Vercel auth; he opens them
  logged in, or tests locally via npx next dev).
- V-2.11.0 (2026-10-20): landmark decisions seed, part 1 of the free-tier
  corpus expansion. New pipeline `ingest-landmarks` (CourtListener
  citation-lookup → cluster → opinion text; chunked resolver with 429/
  timeout retries): 17 foundational pre-2016 Court of Appeals decisions
  loaded + embedded (205 chunks) — Park West, Braschi, Solow, Roberts v.
  Tishman Speyer, Yellowstone, Thornton, Grimm, Conason, Chinatown Apts,
  Domen, Pultz, Cintron, RSA v. Higgins, Landaverde, Salvati, Seawall,
  Holy Props. Golub v. Frank excluded (65 NY2d 900 is a multi-case memo
  page; lookup resolves to the wrong case). feed_code='landmark'.
  Corpus now 11,694 decisions / 20,779 chunks; DB 216MB of the 500MB
  free tier. In progress: six gap laws crawling (UCC/BNK/BSC/NPC/GBS/
  LIE); pending: agency guidance (DFS/DOS/AG), filtered AD slice.
- V-2.10.1 (2026-10-20): COPY STYLE RULE, permanent — no em dashes (—)
  anywhere user-facing: all website/app copy rewritten (commas, colons,
  periods, parentheses, or " · " separators), API error messages and memo
  output cleaned, and both system prompts (Ask + Draft) now carry an
  explicit "never use an em dash" rule so model answers comply too. The
  Draft footer label is now "DRAFT: attorney work product for review…".
  Abdul: dashes "look too AI chat bot written." Check every future copy
  change against this.
- V-2.10.0 (2026-10-20): statute anchors + cross-reference expansion
  (anchors.py), fixing field-tested retrieval misses: "withhold rent for
  repairs" never surfaced RPL § 235-b (ranked 19th even statute-only) and
  the month-to-month-notice answer told the user to "pull § 226-c"
  themselves. Two deterministic layers on Ask AND Draft retrieval:
  (1) curated topic→anchor-statute map (11 patterns: habitability,
  month-to-month notice, security deposits, late fees, retaliation,
  lockouts, roommates, sublets, nonpayment, warrants — every citation
  verified present in statute_sections); (2) worded cross-reference
  parser ("section two hundred twenty-six-c of this article" → fetch
  RPP § 226-C, up to 2 per answer). Anchors rank first (score .99);
  everything stays construction-verified corpus text. Known remaining
  gap: landmark pre-2015 decisions (e.g., Park West v. Mitchell, 47
  NY2d 316) aren't in the 10-yr corpus — seed a curated landmark set
  later.
- V-2.9.2 (2026-10-20): wise-owl mascot in the app (assets from the
  brand pack in files/wise-owl, gitignored staging; servable copies at
  apps/web/public/owl/). Owl appears: bobbing loader on the Ask/Draft
  status line, centered loader for Search ("Searching the library…") and
  Check cites ("Checking citations…"), small static owl on the empty-app
  hero. CSS keyframes in globals.css (cw-owl-bob, reduced-motion safe).
  Note: owl art is AI-generated — have an illustrator redraw before print
  or trademark use (per pack README).
- V-2.9.1 (2026-10-17): trial countdown counts calendar days (day after
  signup reads "6 days left"; access ends at the start of day 8) — was 24h
  blocks that showed "7 days left" a day in. Quote-check copy per attorney
  feedback: "unverified" (read as provenance doubt) → "check wording
  against the source before citing. Not an exact match." in the app flag
  and the memo verification appendix, plus a one-line explainer of the
  word-for-word comparison. Stripe live keys configured (Railway); live
  checkout verified server-side; first real-payment webhook test pending
  trial expiry (Abdul's account, Oct 23). Policy from this release: EVERY
  change ships with a version bump + doc update in the same commit.
- Billing (V-2.9.0): Stripe Checkout — $99.99/mo and $999.99/yr (2 months free)
  Professional plans, upgrade allowed any time INCLUDING during the trial
  (pricing cards + in-app "Upgrade" link in the sidebar). API:
  POST /billing/checkout (validate_token only, so expired trials can pay)
  → Stripe-hosted checkout with client_reference_id = user id;
  POST /billing/webhook (HMAC signature verified, raw httpx — no Stripe
  SDK) flips profiles.plan to 'paid' on checkout.session.completed and
  back to 'trial' on customer.subscription.deleted (billing_customers
  table maps Stripe customer → user, auto-created). Env: STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY (503
  "billing is being switched on" until set). Copy rule: never say
  "unlimited" — plans are "full daily practice use / fair professional
  use"; a higher-volume firm plan is reserved for later.
- Guest preview (V-2.6.0): anonymous visitors get 5 free Ask questions,
  no login. Server-tracked in `guest_usage` (auto-created table; keyed by
  a localStorage guest id AND the request IP — max across both, so
  clearing storage doesn't reset the quota). API: `gated_or_guest` on
  /ask + /ask/stream, GET /guest/status, `X-Guest-Remaining` response
  header (CORS-exposed), 402 over-limit message pointing at /signup.
  Web: /app no longer redirects signed-out visitors; sidebar shows
  "Guest preview: N of 5 free questions left" + trial/sign-in links;
  Search/Check cites/memo/feedback prompt signup for guests; landing
  hero CTA → /app "Try it now — no sign-up".

**Product (https://casewise.si/app):**
- Ask: streaming RAG answers — live pipeline status (real source counts),
  token-by-token answer, verified-citation sources list with type badges
  and links to official texts; copy-to-clipboard (rich text for Word +
  plain fallback, sources and caveat appended).
- Conversation mode: follow-up questions carry up to 4 prior exchanges
  (POST /ask/stream); retrieval sees the previous question; each turn
  cites only its own freshly retrieved sources.
- Thumbs up/down on every answer with optional what-was-wrong comment
  (POST /feedback → answer_feedback).
- Building-grounded answers: a NYC address in an Ask question resolves via
  GeoSearch to its BBL; the building's record (rent-stabilized unit counts,
  open HPD violations by class, registered owner, marshal evictions — from a
  229K-building SQLite aggregate on R2) joins the sources as a citable
  'Building record' linking to Who Owns What.
- Point-in-time (PARTIAL): optional "as of" date on Ask — decisions and
  guidance after the date are excluded; statutes amended after it are
  flagged ("amended after date" badge + model caveats). FULL historical
  statute text awaits the Open Legislation API key (`date=` param).
- Search: semantic search across all source types; filter (statutes /
  decisions / DHCR guidance) acting as pre-filter and live post-filter;
  relevance buckets (Strong match ≥0.50 / Relevant ≥0.40 / Related).
- History sidebar: local-only (privacy by default), date-grouped with
  Ask/Search subsections, per-entry delete, instant restore of stored
  results (no re-spend). "New case prep" teaser for Phase 2.
- Claude-style warm UI: cream palette, Source Serif 4 for brand + answers,
  terracotta accent, dark mode.

**Platform:**
- 4 ingestion pipelines with CLIs (see Runbook), all idempotent/resumable.
- Daily case-law refresh worker on Railway.
- Deadline rules loader that refuses rules whose citations don't resolve.
- Eval scaffold: `evals/golden.yaml` awaiting attorney partner's 25–50
  golden questions (the project's quality bar; runner not yet built).

## Bulk data layer (zero-subscription storage, added 2026-10-14)

CourtListener publishes **quarterly full-database snapshots on public S3**
(`com-courtlistener-storage.s3-us-west-2.amazonaws.com/bulk-data/`, see
wiki.free.law → Bulk Data) — no API, no rate limits, free. This supersedes
API crawling for historical data. Architecture decision (deliberate, to
avoid monthly subscriptions until a pilot justifies Supabase Pro $25/mo):

- **Offline citation catalog**: `build-citation-catalog` streams the
  `citations` + `opinion-clusters` snapshots into a SQLite file
  (pipelines/data/bulk/catalog.sqlite; NY + common federal reporters kept)
  mapping every published citation → case name/year/CourtListener URL. The
  API fetches it once from object storage (`CATALOG_URL` → local
  `CATALOG_PATH`) and the cite auditor then verifies reporter citations
  **offline**. Resolution order: corpus → catalog → `citation_lookups`
  cache → live CourtListener (rare).
- **NY decisions archive**: full-text NY extraction from the 55 GB
  `opinions` snapshot is archived to **Cloudflare R2 free tier** (10 GB,
  zero egress) rather than loaded into Supabase; it gets loaded into
  RAG when the Supabase Pro upgrade happens. Appellate Division (~100K
  decisions) is thereby acquired for free.
- The API-based `backfill-caselaw` remains only as a fallback; bulk
  snapshots are the primary historical path.

## Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 (TS, app router), Tailwind v4, react-markdown, Source Serif 4 | `apps/web`, deployed Vercel (project "casewise") |
| API | Python 3.12, FastAPI, uvicorn, psycopg3 + pool | `apps/api`, uv-managed, Docker on Railway |
| DB | Supabase Postgres + pgvector (free tier) | **IPv4 must use session pooler** `aws-1-us-west-2.pooler.supabase.com` — direct host is IPv6-only |
| LLM | Anthropic `claude-opus-5-5`, effort high, server-side refusal fallbacks (`server-side-fallback-2026-07-01`) | isolated "casewise" workspace; ~$0.02–0.04/answer |
| Embeddings | Voyage `voyage-law-2` (1024d), batch 64 w/ card, 200M free tokens | no-card tier = 3 RPM (env `VOYAGE_BATCH_SIZE`/`VOYAGE_REQUEST_INTERVAL`) |
| Pipelines | Python/uv: httpx, BeautifulSoup, Playwright (headed), pypdf, pyyaml | `pipelines/`, 20 pytest tests |
| Hosting | Railway project "casewise" (services: `api`, `caselaw-refresh`), Vercel, GitHub `abdulmalik2024/casewise` | Railway only auto-detects a ROOT `Dockerfile`; extra services select theirs via `RAILWAY_DOCKERFILE_PATH` var |
| Bulk data | CourtListener quarterly S3 snapshots; SQLite citation catalog; Cloudflare R2 free tier (archive + catalog hosting) | See "Bulk data layer" section |

**Secrets**: `.env` at repo root (gitignored), documented in `.env.example`.
Keys: `DATABASE_URL` (pooler), `ANTHROPIC_API_KEY` (workspace-scoped),
`VOYAGE_API_KEY`, `COURTLISTENER_API_TOKEN`, `NYSENATE_API_KEY` (pending
portal recovery). Never commit; never paste into chat.

## Runbook (from `pipelines/`, `uv run …`)

| Command | Purpose |
|---|---|
| `bootstrap-statutes [--laws RPP,…] [--dry-run]` | Statutes from nysenate.gov HTML (checkpointed; completed crawls reused) |
| `ingest-statutes` | Statutes via Open Legislation API (needs key; supersedes web rows) |
| `ingest-caselaw [--feeds AT1,misc] [--limit N]` | Slip-opinion feeds via headed browser |
| `backfill-caselaw [--since 2016-10-13] [--courts …]` | CourtListener historical backfill (resumable) |
| `ingest-dhcr` | DHCR guidance PDFs |
| `load-deadlines` | Sync seeds/deadlines.yaml (citation-validated) |
| `embed-corpus --source statutes\|caselaw\|dhcr [--query "…"]` | Chunk+embed into pgvector; `--query` = ad-hoc search check |

Deploy: API `railway up --service api --detach` (repo root); web
`cd apps/web && vercel deploy --prod --yes`. API smoke:
`GET /health`, `GET /search?q=…`, `GET /ask/stream?q=…`.

## Compliance guardrails (product requirements, not suggestions)

1. Every legal assertion cites a verified corpus source (ABA Formal Op 512,
   NYSBA Op 24-87, Mata v. Avianca). Enforced by construction in RAG.
2. No Westlaw/Lexis content ever ingested (licensing).
3. Attorney-facing only; never marketed as legal advice (UPL). The UI
   carries the disclaimer; copied answers carry the verify caveat.
4. Confidentiality: zero-retention LLM terms, no training on user data,
   query history client-side only (until authenticated accounts exist),
   query logs treated as confidential.
5. Deadline rules ship `verified:false` until the attorney signs off.

## Known gaps / debt (V-2.0.0)

- No auth/accounts, no rate limiting, API is open CORS-gated only — fine
  for demo, required before real users.
- Golden-question evals not populated; no automated answer-quality gate.
- Consolidated RSC text missing (licensing); NYC Admin Code deferred
  (American Legal Publishing licensing conversation).
- Historical housing-court decisions missing (CourtListener gap).
- Appellate Division 10-yr backfill (~100K docs) awaits budget approval
  (Supabase Pro $25/mo + ~$30–50 embeddings).
- DHCR PDF titles are rough (first-line extraction).
- Sentry/Langfuse observability not yet wired. Court rules & forms
  pipeline (plan step 3) not yet built.

## Repo map

```
PROJECT.md              ← this file (versioned with the product)
Dockerfile              api image (root: Railway auto-detects only here)
Dockerfile.caselaw      refresh worker (xvfb + headed Chromium)
apps/api, apps/web      product
pipelines/              ingestion (+ seeds/, db/schema.sql, tests/)
evals/                  golden.yaml + instructions for the attorney
docs/product|architecture|data|compliance   decision log (ADRs, corpus plan)
.claude/agents/         role charters (product, architect, data, compliance)
```
