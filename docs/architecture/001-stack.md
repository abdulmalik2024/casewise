# ADR 001: Core Stack

Status: proposed 2026-10-12. Decisions are MVP-stage and reversible; optimize for 2-engineer operability, not scale.

## Context

Casewise MVP = RAG chat over the NY property corpus (see docs/data/) + ingestion pipelines + attorney-facing web app. Constraints: managed services only, confidentiality by design (zero-retention LLM terms, encryption, future tenancy isolation), $<500/mo infra during development.

## Decisions

### Languages: TypeScript frontend, Python backend
Python for the API + pipelines because the RAG/data ecosystem (PDF parsing, embeddings tooling, evals) is Python-native and the pipelines are the hard part of this product. TypeScript/React for the web app because that's where the hiring pool and component ecosystem are.
*Alternative considered*: all-TypeScript (one language, simpler). Rejected: PDF parsing and corpus tooling in TS is a constant headwind. Revisit only if the founding engineers are TS-only.

### Frontend: Next.js (TypeScript, Tailwind, shadcn/ui), deployed on Vercel
Boring, fast to build, SSR for the marketing site + app in one framework. casewise.si DNS → Vercel.

### Backend: Python FastAPI, deployed on Railway (or Render — equivalent)
One service for the API; pipelines run as scheduled jobs in the same project (Railway cron) — low-frequency pipelines (monthly scrapes) can run as GitHub Actions scheduled workflows instead, free.
*Not* AWS directly at MVP: more knobs than a 2-person team should operate. Migrate when SOC 2 work starts (Phase 2); nothing in this design blocks that.

### Database: Managed Postgres + pgvector via Supabase
One service provides: Postgres (corpus, versions, deadlines table, app data), pgvector (embeddings/semantic search), auth (email + OAuth — don't build auth), and object storage (court-form PDFs). Row-Level Security gives per-tenant isolation primitives we'll need in Phase 2.
*Alternative*: Neon (nicer Postgres, no auth/storage) + Clerk (auth). Fine too; Supabase chosen to minimize vendor count.
Dedicated vector DBs (Pinecone etc.) rejected: corpus is single-digit GB; pgvector is ample and keeps joins between chunks, metadata, and citations in one database — which citation verification relies on.

### LLM + embeddings: Claude API; Voyage AI embeddings
- Generation: claude-sonnet-5-5 default; claude-haiku-4-5-20251001 for pipeline steps (classification, extraction); escalate to opus/fable only if evals demand it.
- API terms: zero data retention / no training on inputs — required by the confidentiality posture (see compliance charter).
- Embeddings: Voyage AI (voyage-law-2 or current legal-domain model — benchmark against general model on the golden set before committing).
- Prompt caching for the system prompt + retrieved context patterns to cut cost.

### Repo: single GitHub monorepo (`casewise`)
```
apps/web/        Next.js app
apps/api/        FastAPI service (RAG, auth-guarded endpoints)
pipelines/       one dir per source (statutes/, caselaw/, dhcr/, forms/)
evals/           golden set + eval harness
docs/            product/ architecture/ data/ compliance/ (already started)
.claude/agents/  role agents (already created)
```
GitHub Actions: lint + tests on PR; eval suite runnable on demand (not on every PR — LLM cost); scheduled workflows for low-frequency pipelines. Branch protection on main once there are two committers.

### Observability
- Sentry (errors, both apps) — free tier.
- Langfuse (LLM tracing: every query → retrieved chunks → answer → citations; indispensable for debugging RAG and for the attorney review loop) — cloud free tier to start.
- Supabase/Railway built-in logs otherwise. No Datadog-class spend at MVP.

### Email/domain
casewise.si DNS at registrar or Cloudflare (free). Transactional email: Resend or Postmark. Warm up sending from the domain early.

## Security posture (MVP)
- TLS everywhere (platform-default), encryption at rest (Supabase default).
- Secrets in platform env vars; never in repo.
- Query logs = confidential data: restrict access, no third-party analytics on query content.
- LLM calls under zero-retention terms; no customer data in any training pipeline.
- Deferred to Phase 2 (flagged, not forgotten): SOC 2, SSO, audit logs, VPC/private networking, AWS migration.

## Cost estimates (monthly)
| Stage | Infra | LLM | Total |
|---|---|---|---|
| Development | ~$70 (Supabase Pro 25 + Railway 25 + Vercel 20) | $100–300 (dev usage + evals) | **$200–400** |
| 10 subscribers | ~$100 | $150–500 | **$250–600** |
| 100 subscribers | $300–500 | $1.5k–4k (≈40 queries/user/mo, caching on) | **$2k–4.5k** (vs ~$10k MRR @ $99) |
| 1,000 subscribers | $1k–2k (AWS migration done) | $10k–30k | **$11k–32k** (vs ~$99k MRR) |

LLM cost is the margin driver → prompt caching, Haiku routing for cheap steps, and retrieval precision (fewer, better chunks) are economic work, not just quality work.

## Consequences
- Two deploy targets (Vercel + Railway) and one DB vendor; a weekend to stand up.
- Supabase lock-in is shallow (it's Postgres; pg_dump exits cleanly).
- Python/TS split means two toolchains — accepted for pipeline productivity.
- Nothing here needs rework for SOC 2 except hosting (planned AWS migration) and audit logging.
