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

## Platform track (in progress 2026-10-16) — prioritized over Now #5
1. ✅ casewise.si live (Vercel nameservers, SSL, app at /app) — V-2.4.0
2. ✅ Marketing pages (landing w/ real-screenshot showcases, Features,
   Pricing, About; navy theme; capture script) — V-2.4.0
3. ✅ Auth: Supabase email/password + 7-day trial enforced in the API
   (402 after expiry); /login + /signup; session-gated app — V-2.5.0.
   Remaining: Google OAuth provider config (button shipped).
4. ✅ Guest preview: 5 free Ask questions without login (server-tracked
   by guest id + IP); Search/cite-check/memo require an account — V-2.6.0
5. ✅ Billing: Stripe Checkout — $99.99/mo + $999.99/yr (2 months free), upgrade any time
   incl. during trial; webhook flips plan; no "unlimited" wording
   (higher-volume firm plan reserved) — V-2.9.0. Live keys configured.
6. ✅ V-2.9.1: calendar-day trial countdown; quote-check wording per
   attorney feedback ("not an exact match — check wording", no more
   "unverified"). Payment+recurring test planned at trial expiry
   (Oct 23) with a $1 promo code.

## Attorney feedback round 1 (2026-10-16)
1. ✅ Concise answers (Short answer + ≤5 cited bullets) + "Go deeper"
   expand button — V-2.7.0
2. ✅ Search: quoted exact-phrase matching, full-section expand,
   term highlighting, find-in-text — V-2.7.0
3. ✅ IRAC Draft mode (issue + case facts → verified-citation
   Issue/Rule/Application/Conclusion with counteranalysis, FACT NEEDED
   flags, deterministic structure lint, Word export) — V-2.8.0. Built
   against public golden set (bar-exam answers, CUNY memo, Housing Part
   habitability decisions) per deep-research report — no client material
   needed. Awaiting attorney field test.

**Now #5 (DHCR parser) is PARKED pending a real rent-history printout** —
official references secured in pipelines/seeds/dhcr-refs/ (RAI guide 07/2026
incl. 2020-27 guideline rates, RGB chart through Order #57, RR-2A sample);
resume the build when a genuine document arrives from a tester/attorney.

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
- **Now #4 — Building-grounded answers** (V-2.3.0): address in the question
  -> GeoSearch -> BBL -> building facts (rent-stab counts, open HPD
  violations by class, owner, evictions; 229K-building SQLite on R2) injected
  as a citable 'Building record' source linking to Who Owns What.
- **Now #3 — Memo export** (V-2.2.0): .docx with Question Presented,
  Discussion, Table of Authorities, Verification Appendix.
- V-2.1.x: streaming answers, conversation mode, feedback, court rules & forms,
  point-in-time (partial), collapse/pin UX. See PROJECT.md.

## Field-test fixes (2026-10-20)
1. ✅ V-2.10.0: statute topic-anchors + cross-reference expansion — fixes
   "withhold rent" missing RPL § 235-b and "pull § 226-c yourself"
   (marketing-agent test report). Applies to Ask and Draft.
2. ⬜ Landmark decisions seed: curated pre-2015 foundational cases
   (Park West v. Mitchell, Braschi, etc.) — attorneys expect them;
   10-yr corpus can't cite them. Small one-time CourtListener fetch.

## Future: research records (from cases.ai comparison, 2026-10-20)
Question → organized memo + authorities + verified quotes + counteranalysis
+ reusable research record, sources attached. Staged plan agreed:
1. Export bundle first: one "Download research record" capturing the whole
   thread (not just one answer) — no storage-posture change, mostly
   existing pieces.
2. Opt-in saved matters later ("New case prep" slot, likely paid-tier):
   named server-side workspaces. Requires honest confidentiality copy
   ("nothing stored unless you save it to a matter"). Competitors ALL
   store research history by default (cases.ai Pro: "saved research
   history"; Team: "firm-wide search history"; Westlaw/Lexis history) —
   "storage as an explicit choice" is our empty-lane differentiator and
   pairs with the saved-research alerts idea in Next.

## UI/UX redesign round (2026-10-20) — V-2.12.0 SHIPPED
Phases A-D from Abdul's mockups + cases.ai study, approved via preview
deploys: app shell (collapsible sidebar, start screen, chips, mobile
drawer), answer experience (verification banner, color-coded authorities
panel, in-place follow-ups), Check cites step flow, landing hero. Plus
nav dropdowns, How it works, Who it's for, Blog (post #1), Starter $49
tier (pro se excluded). TODO next: per-plan feature gating (Starter is
research-only on paper, full-access in practice); regenerate marketing
screenshots against the new UI; STRIPE_PRICE_STARTER once Abdul creates
the $49 price.

## Free-tier corpus expansion (2026-10-20/21) — COMPLETE, V-2.13.0
1. ✅ Landmark seed: 17 pre-2016 COA decisions (V-2.11.0)
2. ✅ Six gap laws crawled + embedded: UCC, Banking, BSC, NPC, GBS, Lien
   (3,684 sections; 12 laws total)
3. ✅ AD slice: 4,000 property/L&T Appellate Division opinions from the
   R2 archive (load-appdiv-slice). DB at 348MB/500MB.
4. ⬜ Optional: agency guidance (DFS mortgage regs, DOS broker, AG condo)
Full AD decade (85K) + Supreme Court remain the Supabase Pro unlock.

## Case Prep build (approved 2026-10-24, mockup on canvas)
1. ✅ Phase 1 workspace shell: hub + /app/<ws> URLs, shallow-history
   switching, per-workspace empty states — V-2.14.0 (+ Next RCE patch)
2. ✅ Phase 2: Case Prep engine + tabbed workspace UI — V-2.15.0
3. ✅ Phase 3: what-if scenario chips (stipulated-fact re-runs) — V-2.15.0
4. ✅ Phase 4: opt-in saved matters + confidentiality copy sweep — V-2.15.0
Post-ship decision: Case Prep is Professional-only (trial covers the
other four workspaces). Next: attorney field test; case-comparison
(v1.2) when she validates the core.

## Corpus demand signals (steering which partial area deepens next)
1. Purchases/residential transactions — law student tester (2026-10-27):
   "I wish it covered purchases." Partially closed already (GOL, UCC,
   RPL 462, AD contract/specific-performance cases); deepening would mean
   title/escrow materials + more contract-of-sale decisions, and promoting
   Residential Real Estate out of the partial tier. Watch for a second vote.
