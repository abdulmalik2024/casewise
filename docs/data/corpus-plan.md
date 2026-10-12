# Casewise Corpus Plan

Status: draft — pending attorney partner ratification (esp. sub-domain choice: landlord-tenant vs. residential transactions).
Scope: New York State property law, statewide + NYC. Other NY cities are Tier 3.

## Cross-cutting requirement: versioning

"Changes in the law" is not a data type — it is a required dimension on every document in every type:

- `effective_date`, `amended_by`, `superseded_by`, `retrieval_date` on every record.
- Superseded versions are kept, never deleted (point-in-time questions arise in litigation: "what was the law when this lease was signed?").
- Per-source freshness is tracked and surfaced to the user ("current as of …").

## Tier 1 — launch corpus

| # | Type | Contents | Source | Notes |
|---|------|----------|--------|-------|
| 1 | State statutes | RPL, RPAPL, CPLR (landlord-tenant-relevant articles), Multiple Dwelling Law, General Obligations Law (lease provisions), HSTPA 2019 amendments | NY Senate Open Legislation API (free, JSON) | Chunk by section/subsection; each chunk independently citable |
| 2 | Regulations | Rent Stabilization Code (9 NYCRR), NYC Admin Code (esp. Housing Maintenance Code), DHCR operational bulletins + fact sheets | DHCR publications, NYC open data/publications | Where NYC practice actually lives |
| 3 | Appellate case law | Court of Appeals, Appellate Division, **Appellate Term** (decides most housing appeals — do not omit) | CourtListener REST API (free; check bulk/commercial terms with Free Law Project) | NY jurisdiction filters |
| 4 | Court rules + official forms | Uniform Court Rules (22 NYCRR), housing court local rules, official petition/notice forms | nycourts.gov | Cheap data, high value for solos ("what form, where to file") |
| 5 | Curated deadlines/notices table | Structured table: every deadline + notice requirement in the niche (notice periods by tenancy length, answer deadlines, cure periods), each row citing its controlling provision | Hand-built; validated row-by-row by attorney partner | **The differentiator.** Verified lookup, not RAG, for the highest-risk queries |

## Tier 2 — post-launch

| # | Type | Contents | Source | Notes |
|---|------|----------|--------|-------|
| 6 | DHCR administrative decisions | PAR orders | DHCR | How the agency actually rules |
| 7 | Trial-level housing court decisions | Published housing court / Civil Court decisions | CourtListener, NY Official Reports | Coverage is spotty (most unpublished) — set product expectations accordingly |
| 8 | Property records | ACRIS deeds, mortgages, liens | NYC ACRIS open data | Build as a lookup *tool*, not RAG corpus |
| 9 | Pending legislation | Bills touching property law | NY Senate Open Legislation API | Enables "a pending bill would change this" |

## Tier 3 — later

- Local codes for other NY cities (Buffalo, Rochester, Albany, Yonkers).
- Other practice areas / states per expansion strategy.

## Licensing red lines

- Never ingest Westlaw/Lexis editorial content (headnotes, key numbers, annotations, treatises) — terms prohibit AI/commercial use.
- Check CourtListener bulk-use terms with Free Law Project before commercial launch.
- Bar association practice materials require a licensing check before any use.
