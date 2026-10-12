# Casewise

AI legal research assistant for solo attorneys — starting with New York State property law.

Every answer is grounded in a versioned corpus of NY statutes, regulations, and case law, with programmatically verified citations. Attorney-facing only.

## Repository layout

```
apps/web/        Next.js app (TypeScript) — attorney-facing UI
apps/api/        FastAPI service (Python) — RAG, retrieval, citation verification
pipelines/       Corpus ingestion, one directory per source
evals/           Golden-question set and eval harness
docs/            Project knowledge base
  product/       Feature specs
  architecture/  ADRs (see 001-stack.md for the stack decisions)
  data/          Corpus plan and data-source research
  compliance/    Ethics/compliance reviews
.claude/agents/  Role agents (product, architecture, data, compliance)
```

## Key documents

- [Corpus plan](docs/data/corpus-plan.md) — what data we ingest, in what order
- [Data sources & storage strategy](docs/data/data-sources.md) — where each data type comes from
- [ADR 001: Core stack](docs/architecture/001-stack.md) — frontend, backend, DB, hosting decisions

## Non-negotiable product rules

1. Every legal assertion carries a citation verified to exist in the corpus.
2. No Westlaw/Lexis content is ever ingested (licensing).
3. Attorney-facing only — never marketed as legal advice (UPL).
4. Customer data: zero-retention LLM terms, no training on user data, query logs treated as confidential.
