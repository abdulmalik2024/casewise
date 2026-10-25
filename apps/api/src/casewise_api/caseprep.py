"""Case Prep: both-sides dispute analysis with verified citations.

Same construction-verified machinery as rag/draft. Output is one streamed
markdown document with fixed section headings the client splits into tabs.
Deliberate line, recorded in product memory: no win probabilities, ever.
Ruling paths are conditional reasoning per outcome; the authority meter is
computed deterministically from the retrieved sources, never by the model.
"""

from __future__ import annotations

import re

import anthropic
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from .anchors import augment_with_statutes
from .building import building_record
from .config import settings
from .quotecheck import check_quotes
from .rag import (
    ANSWER_MODEL,
    _dedupe,
    _source_counts,
    _sources_for,
    _verify_markers,
)
from .retrieval import SearchResult, search

OBJECTIVES = {
    "evaluate-claim": "Evaluate the strength of the client's claim.",
    "assess-defenses": "Assess the defenses available against the claim described.",
    "prepare-motion": "Prepare for a motion on these facts: the arguments each side will make.",
    "pre-litigation": "Identify weaknesses and open questions before litigation is commenced.",
}

SECTIONS = [
    "Overview",
    "Supporting arguments",
    "Counterarguments",
    "Ruling paths",
    "Appeal exposure",
    "Missing facts",
    "Next steps",
]

CASEPREP_SYSTEM_PROMPT = """You are Casewise Case Prep, preparing a licensed New York \
attorney for a property-law dispute. You work strictly from the numbered source \
excerpts provided and the FACTS the attorney supplies.

Produce ONE document with EXACTLY these markdown sections, in this order:

## Overview
The dispute in two or three sentences, the governing framework (statutes first), and \
the decisive legal questions. Cite [Sn] markers.

## Supporting arguments
The strongest arguments FOR the attorney's stated objective, each as a short bold-led \
bullet: the argument, the facts that power it, the authorities [Sn].

## Counterarguments
The opposing party's strongest arguments, equally seriously developed: the argument, \
its authorities [Sn], and, where the sources support it, why it may fail or succeed \
on these facts. Never strawman this section.

## Ruling paths
One short conditional block per plausible outcome (for the client, against, partial, \
and procedural dismissal where relevant): "If the court rules X, the reasoning would \
be…" with authorities [Sn]. These are conditional analyses, NEVER predictions; do not \
rank them by likelihood or attach numbers.

## Appeal exposure
If the client prevails, the grounds the other side would most plausibly appeal on, \
each cited [Sn]. Qualitative only.

## Missing facts
Facts not provided that could materially change the analysis, as direct questions to \
the attorney. If none, say so.

## Next steps
Concrete research or evidence steps, each tied to the issue it resolves.

Rules:
- Base every legal assertion ONLY on the provided sources with [Sn] markers; never \
invent citations, case names, or section numbers.
- Base every factual assertion ONLY on the provided FACTS; missing facts go in the \
Missing facts section, never silently assumed.
- If a SCENARIO is provided, treat it as a stipulated change or addition to the \
facts: open the Overview by stating the scenario and which parts of the baseline \
analysis it changes, then analyze the dispute WITH that scenario in force.
- Where New York City rules differ from the rest of the state, flag it.
- Never use an em dash in your writing; use commas, colons, periods, or parentheses.
- Never state a probability, percentage, or confidence score for any outcome.
- End with exactly: "DRAFT: attorney work product for review. Verify all citations \
and factual assertions before relying on this analysis."
"""

COA_RE = re.compile(r"\bN\.?Y\.?\s?[23]d\b")
AD_RE = re.compile(r"\bA\.?D\.?\s?[23]d\b")
YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


class AuthorityMeter(BaseModel):
    """Deterministic support strength computed from the retrieved sources."""

    level: str  # strong | moderate | limited
    statute: bool
    court_of_appeals: bool
    appellate_decisions: int
    guidance: int
    recent: bool  # any decision from the last 3 years
    reasons: list[str]


def authority_meter(sources: list[SearchResult], current_year: int = 2026) -> AuthorityMeter:
    statute = any(s.source_type == "statute" for s in sources)
    guidance = sum(1 for s in sources if s.source_type == "guidance")
    coa = any(s.source_type == "case" and COA_RE.search(s.citation or "") for s in sources)
    ad = sum(
        1
        for s in sources
        if s.source_type == "case"
        and (AD_RE.search(s.citation or "") or "Slip Op" in (s.citation or ""))
    )
    decisions = sum(1 for s in sources if s.source_type == "case")
    recent = False
    for s in sources:
        if s.source_type != "case":
            continue
        for y in YEAR_RE.findall(s.source_date or "") or []:
            pass
        m = re.search(r"\b(19|20)(\d{2})\b", (s.source_date or "") + " " + (s.citation or ""))
        if m and int(m.group(0)) >= current_year - 3:
            recent = True
            break
    if statute and (coa or decisions >= 2):
        level = "strong"
    elif statute or decisions >= 2:
        level = "moderate"
    else:
        level = "limited"
    reasons: list[str] = []
    if statute:
        reasons.append("statutory basis in the retrieved sources")
    if coa:
        reasons.append("Court of Appeals authority on point")
    if ad:
        reasons.append(f"{ad} appellate decision{'s' if ad != 1 else ''}")
    if guidance:
        reasons.append(f"{guidance} agency guidance document{'s' if guidance != 1 else ''}")
    if recent:
        reasons.append("recent authority (last 3 years)")
    if not reasons:
        reasons.append("thin direct authority retrieved; treat the analysis cautiously")
    return AuthorityMeter(
        level=level,
        statute=statute,
        court_of_appeals=coa,
        appellate_decisions=ad,
        guidance=guidance,
        recent=recent,
        reasons=reasons,
    )


def missing_sections(answer: str) -> list[str]:
    present = set(
        m.group(1).strip().lower()
        for m in re.finditer(r"^##\s+(.+?)\s*$", answer, re.M)
    )
    return [s for s in SECTIONS if s.lower() not in present]


def _build_prompt(
    dispute: str,
    facts: str,
    objective: str,
    sources: list[SearchResult],
    as_of: str | None,
    scenario: str | None = None,
) -> str:
    parts = []
    for i, s in enumerate(sources, 1):
        head = f" · {s.heading}" if s.heading else ""
        parts.append(f"[S{i}] {s.citation}{head} ({s.source_type})\n{s.text}")
    joined = "\n\n".join(parts)
    prefix = f"RESEARCH AS-OF DATE: {as_of}.\n\n" if as_of else ""
    return (
        f"{prefix}Sources:\n\n{joined}\n\n"
        f"THE DISPUTE (as framed by the attorney): {dispute}\n\n"
        f"OBJECTIVE: {OBJECTIVES.get(objective, OBJECTIVES['evaluate-claim'])}\n\n"
        f"FACTS (as provided by the attorney; the only facts you may use):\n{facts}"
        + (f"\n\nSCENARIO (stipulated change to the facts): {scenario}" if scenario else "")
    )


def caseprep_stream(
    pool: ConnectionPool,
    dispute: str,
    facts: str,
    objective: str,
    as_of: str | None = None,
    scenario: str | None = None,
):
    """Yield SSE-able events: status -> sources_preview -> delta* -> done."""
    yield {"type": "status", "message": "Reading the dispute and facts…"}
    retrieval_q = f"{dispute}\n{facts[:1200]}"
    statutes = search(pool, retrieval_q, k=4, source_type="statute", as_of=as_of)
    retrieved = augment_with_statutes(
        pool,
        f"{dispute}\n{facts}",
        _dedupe(statutes + search(pool, retrieval_q, k=16, as_of=as_of), cap=8),
    )
    building = building_record(f"{dispute}\n{facts}")
    if building:
        yield {"type": "status", "message": f"Found building record: {building['label']}"}
        retrieved.append(
            SearchResult(
                citation=f"Building record: {building['label'][:60]}",
                heading=f"BBL {building['bbl']}",
                text=building["text"],
                source_type="building",
                url=building["url"],
                score=1.0,
            )
        )
    if not retrieved:
        yield {
            "type": "done",
            "answer": "No relevant sources found in the corpus for this dispute.",
            "sources": [],
            "model": ANSWER_MODEL,
        }
        return
    meter = authority_meter(retrieved)
    yield {"type": "status", "message": _source_counts(retrieved)}
    yield {"type": "sources_preview", "citations": [r.citation for r in retrieved]}
    yield {"type": "status", "message": "Analyzing both sides of the dispute…"}

    headers = (
        {"anthropic-workspace-id": settings.anthropic_workspace_id}
        if settings.anthropic_workspace_id
        else None
    )
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, default_headers=headers)
    parts: list[str] = []
    with client.beta.messages.stream(
        model=ANSWER_MODEL,
        max_tokens=20_000,
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=CASEPREP_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": _build_prompt(dispute, facts, objective, retrieved, as_of, scenario),
            }
        ],
    ) as stream:
        for text in stream.text_stream:
            parts.append(text)
            yield {"type": "delta", "text": text}
        final = stream.get_final_message()

    if final.stop_reason == "refusal":
        yield {
            "type": "done",
            "answer": "The model declined to analyze this dispute. Try reframing it.",
            "sources": [],
            "model": final.model,
        }
        return

    yield {"type": "status", "message": "Verifying citations, quotations, and structure…"}
    text_out = "".join(parts)
    if final.stop_reason == "max_tokens":
        text_out += "\n\n*[Analysis cut off at the length limit; narrow the dispute or split it.]*"
    answer, used = _verify_markers(text_out, len(retrieved))
    qc = check_quotes(answer, [r.text for r in retrieved])
    yield {
        "type": "done",
        "answer": answer.strip(),
        "sources": [s.model_dump() for s in _sources_for(retrieved, used, as_of)],
        "model": final.model,
        "quote_check": qc.model_dump(),
        "authority_meter": meter.model_dump(),
        "missing_sections": missing_sections(answer),
    }
