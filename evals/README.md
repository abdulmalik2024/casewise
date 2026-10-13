# Casewise evals

The golden-question set is the project's quality bar: real questions NY
property attorneys ask, with attorney-written expected answers and the
citations that must appear. Every retrieval/prompt/model change is measured
against it before shipping.

## For the attorney partner

Fill in `golden.yaml` — aim for 25–50 questions covering what you actually
research in a typical week. For each question:

- **question**: exactly as you'd ask it, in your own words
- **expected_citations**: the provisions/cases a correct answer MUST cite
  (use the corpus citation style: `RPP § 235-B`, `RPA § 711`, `GOB § 7-108`,
  `2026 NY Slip Op 26174`)
- **expected_answer**: 2–6 sentences stating the correct answer
- **jurisdiction**: `NY` or `NYC` when the answer differs inside the city
- **trap** (optional): what a lazy or outdated answer gets wrong — e.g. cites
  pre-HSTPA law, misses the NYC-specific rule, confuses holdover/nonpayment

The traps are the most valuable part: they encode your expertise about where
generic AI goes wrong.

## Scoring (runner lands with the RAG endpoint)

- citation recall: expected citations present and verified
- no hallucinated citations: every cited provision resolves in the corpus
- answer correctness: LLM-judged against expected_answer, attorney-audited
