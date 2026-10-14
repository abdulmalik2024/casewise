# Casewise Feature Roadmap

Source: competitive research 2026-10-13 (`reports/Legal AI competitor feature scan.md`).
Rule: the **Next** list is not started until all five **Now** items are built AND
tested (user acceptance + attorney feedback where applicable). Update this file
as items ship; move completed items to the log at the bottom.

## Now — top 5 (value + moat, fastest first)

| # | Feature | Why | Effort | Target |
|---|---------|-----|--------|--------|
| 1 | **Quote-level verification on every answer** — every quoted passage deterministically string-matched against the retrieved sources; verified ✓ / unverifiable flagged | The market's strongest trust signal (Midpage pattern); our local corpus makes it a cheap exact match. Makes the "can't invent citations" architecture visible on every answer | Days | V-2.2 |
| 2 | **"Check my document" cite auditor** — upload/paste any brief (incl. opposing counsel's); audit table: citation → exists? → quote matches source? → verdict | Best growth feature found: post-Mata every attorney wants it; each audit is a shareable demo. Reuses #1's machinery; case cites resolved via CourtListener citation lookup | <1 week | V-2.2 |
| 3 | **Research memo export (.docx) with verification appendix** — one click: question, analysis, table of authorities + per-citation verification status | Word output is table stakes; the memo+verification combo is shipped by nobody. Upgrades output from chat answer to work product | Days | V-2.2 |
| 4 | **Building-grounded answers (nycdb)** — address lookup grounds answers in the building: HPD violations, rent-stabilization indicators, owner portfolio, eviction filings | The moat: no generalist will build NYC-building-level grounding. Open data, plumbing already solved by nycdb/JustFix ecosystem | 1–2 wks | V-2.3 |
| 5 | **DHCR rent-history parser + overcharge calculator** — upload the DHCR printout → parsed rent timeline, suspicious-jump flags, draft overcharge analysis (HSTPA lookback) | Sharpest wedge found: no commercial tool exists; attorneys do this by hand. Build with attorney-partner review | 2–3 wks | V-2.3 |

## Next — queued until the five above are done and tested

1. **Saved-research alerts** — "authority behind your memo changed": re-run saved
   questions against corpus updates; email digest. (Fixes Alexi's #1 complaint;
   retention feature.)
2. **Visible research plan + depth tiers** — show the plan before executing;
   quick vs deep research modes (CoCounsel pattern).
3. **NY-scoped citator + published eval** — negative-treatment signals for NY
   property authorities; publish a reproducible accuracy benchmark (Paxton's
   GitHub-eval trust tactic) once the golden set exists.
4. **NY lease compliance checker** — upload a lease; flag against RSC riders,
   GOB § 7-103, HSTPA, Good Cause requirements. (Jurisdiction-aware lease AI is
   white space.)
5. **NY L&T pleadings assembly** — guided drafting of nonpayment/holdover
   papers wired to the verified deadline rules and official forms.
6. **Accounts + server-side encrypted history** (pilot prerequisite), Word
   add-in / connector second surface, casewise.si landing page.

### Deliberate non-goals (per research)
- General deadline calendaring (LawToolBox/CalendarRules duopoly).
- Housing-court judge analytics (OCA data politics; if ever: judges/landlords,
  never tenants).

## Shipped log
- **Now #1 — Quote verification** (V-2.2.0): deterministic, ellipsis-aware
  matching of every quoted passage against retrieved sources; shown per answer.
- **Now #2 — Check cites auditor** (V-2.2.0, exceeded scope): paste or upload
  PDF/Word (streamed size caps); NY statutes/rules/slip-ops vs corpus;
  reporter cites vs the **offline 5.1M-citation catalog** (CourtListener bulk
  snapshot → SQLite on R2) with permanent lookup cache and live CL as rare
  fallback; catalog-miss = suspect; per-citation copy buttons.
- **Now #3 — Memo export** (V-2.2.0): .docx with Question Presented,
  Discussion, Table of Authorities, Verification Appendix.
- V-2.1.x: streaming answers, conversation mode, feedback, court rules & forms,
  point-in-time (partial), collapse/pin UX. See PROJECT.md.
