"""IRAC draft generation with verified citations and a structural lint layer.

Same hallucination control as rag.py (marker-construction citations), plus the
legal-writing quality checks that graders and judges flag, run deterministically
on the output: required IRAC headings, a citation on every Rule paragraph,
Application citing only authorities the Rule introduced, and explicit
[FACT NEEDED] flags instead of invented facts.
"""

from __future__ import annotations

import re

import anthropic
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

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

DRAFT_SYSTEM_PROMPT = """You are Casewise Draft, producing an IRAC-structured legal \
analysis for a licensed New York attorney practicing property law, strictly from the \
numbered source excerpts provided. You receive the attorney's ISSUE and the FACTS of \
their case; your output is a draft the attorney will adapt into an attorney \
affirmation or memorandum of law.

Structure: use exactly these markdown headings, repeating the full set once per \
discrete legal issue the facts raise:
## Issue
One precise framing (75 words max): the legal premise plus the decisive facts.
## Rule
The governing law synthesized from the provided sources: statutes before cases, the \
general rule before exceptions. EVERY legal proposition carries a source marker, \
e.g. [S1]. Quote statutory language when the exact wording matters. Introduce here \
every case the Application will rely on.
## Application
Apply the Rule to the provided FACTS element by element, reusing the Rule's key \
terms. Connect each fact to the law with explicit reasoning ("because …"). \
Analogize to or distinguish the cited cases. Then a counteranalysis: the strongest \
argument the opposing party would make and why it fails, or a candid note that it \
may succeed. Cite only sources already cited in the Rule.
## Conclusion
The likely outcome, briefly. No new arguments, facts, or citations.

Rules:
- Base every legal assertion ONLY on the provided sources, citing [Sn] markers; \
never invent citations, case names, or section numbers.
- Base every factual assertion ONLY on the provided FACTS. Where a fact needed for \
an element is missing, write [FACT NEEDED: what is missing] instead of assuming it.
- If the sources do not support a necessary element, say so explicitly; a flagged \
gap beats an invented authority.
- Where New York City rules differ from the rest of the state, flag the distinction.
- Measured, precise register of a memorandum of law; no boilerplate openers.
- Never use an em dash in your writing; use commas, colons, periods, or parentheses.
- End with exactly: "DRAFT: attorney work product for review. Verify all citations \
and factual assertions before filing."
"""

_HEADINGS = ("Issue", "Rule", "Application", "Conclusion")


class DraftCheck(BaseModel):
    """Deterministic IRAC structure lint — all counts are defects (0 = clean)."""

    missing_sections: list[str]
    uncited_rule_paragraphs: int
    markers_only_in_application: list[str]
    fact_gaps: list[str]
    passed: bool


def _sections(answer: str) -> list[tuple[str, str]]:
    """-> [(heading, body)] for each '## <Heading>' block, heading normalized."""
    out: list[tuple[str, str]] = []
    current: str | None = None
    body: list[str] = []
    for line in answer.splitlines():
        # tolerate heading level, numbering, and bold-line variants
        m = re.match(
            r"^(?:#{1,4}\s*|\*\*)\s*(?:\d+[.)]?\s*)?(Issue|Rule|Application|Conclusion)\b",
            line.strip(),
        )
        if m:
            if current:
                out.append((current, "\n".join(body)))
            current, body = m.group(1), []
        elif current:
            body.append(line)
    if current:
        out.append((current, "\n".join(body)))
    return out


def irac_lint(answer: str) -> DraftCheck:
    secs = _sections(answer)
    names = [h for h, _ in secs]
    missing = [h for h in _HEADINGS if h not in names]

    uncited = 0
    for h, body in secs:
        if h != "Rule":
            continue
        for para in re.split(r"\n\s*\n", body):
            p = para.strip()
            if len(p) >= 80 and not re.search(r"\[S\d+\]", p):
                uncited += 1

    rule_markers = set()
    app_markers = set()
    for h, body in secs:
        markers = set(re.findall(r"\[S(\d+)\]", body))
        if h == "Rule":
            rule_markers |= markers
        elif h == "Application":
            app_markers |= markers
    only_app = sorted(app_markers - rule_markers, key=int)

    fact_gaps = [g.strip() for g in re.findall(r"\[FACT NEEDED:([^\]]+)\]", answer)]

    return DraftCheck(
        missing_sections=missing,
        uncited_rule_paragraphs=uncited,
        markers_only_in_application=[f"S{m}" for m in only_app],
        fact_gaps=fact_gaps,
        passed=not missing and uncited == 0 and not only_app,
    )


def _build_draft_prompt(
    issue: str, facts: str, sources: list[SearchResult], as_of: str | None
) -> str:
    parts = []
    for i, s in enumerate(sources, 1):
        head = f" · {s.heading}" if s.heading else ""
        parts.append(f"[S{i}] {s.citation}{head} ({s.source_type})\n{s.text}")
    joined = "\n\n".join(parts)
    prefix = f"RESEARCH AS-OF DATE: {as_of}. Draft as of this date.\n\n" if as_of else ""
    return (
        f"{prefix}Sources:\n\n{joined}\n\n"
        f"ISSUE (as framed by the attorney): {issue}\n\n"
        f"FACTS (as provided by the attorney; the only facts you may use):\n{facts}"
    )


def draft_stream(
    pool: ConnectionPool, issue: str, facts: str, as_of: str | None = None
):
    """Yield SSE-able events: status -> delta* -> done (with draft_check)."""
    yield {"type": "status", "message": "Reading the issue and facts…"}
    retrieval_q = f"{issue}\n{facts[:1200]}"
    # statutes first: the Rule section should open with the governing statute,
    # and pure similarity ranking often buries it under factually-similar cases
    from .anchors import augment_with_statutes

    statutes = search(pool, retrieval_q, k=4, source_type="statute", as_of=as_of)
    retrieved = augment_with_statutes(
        pool,
        f"{issue}\n{facts}",
        _dedupe(statutes + search(pool, retrieval_q, k=16, as_of=as_of), cap=8),
    )

    building = building_record(f"{issue}\n{facts}")
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
            "answer": "No relevant sources found in the corpus for this issue.",
            "sources": [],
            "model": ANSWER_MODEL,
        }
        return
    yield {"type": "status", "message": _source_counts(retrieved)}
    yield {"type": "status", "message": "Drafting the IRAC analysis with cited authorities…"}

    headers = (
        {"anthropic-workspace-id": settings.anthropic_workspace_id}
        if settings.anthropic_workspace_id
        else None
    )
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, default_headers=headers)
    parts: list[str] = []
    with client.beta.messages.stream(
        model=ANSWER_MODEL,
        max_tokens=20_000,  # thinking shares this budget; 8k truncated real drafts
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=DRAFT_SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": _build_draft_prompt(issue, facts, retrieved, as_of)}
        ],
    ) as stream:
        for text in stream.text_stream:
            parts.append(text)
            yield {"type": "delta", "text": text}
        final = stream.get_final_message()

    if final.stop_reason == "refusal":
        yield {
            "type": "done",
            "answer": "The model declined to draft this analysis. Try reframing the issue.",
            "sources": [],
            "model": final.model,
        }
        return

    yield {"type": "status", "message": "Verifying citations, quotations, and IRAC structure…"}
    text_out = "".join(parts)
    if final.stop_reason == "max_tokens":
        text_out += "\n\n*[Draft cut off at the length limit; narrow the issue or split it into two drafts.]*"
    answer, used = _verify_markers(text_out, len(retrieved))
    qc = check_quotes(answer, [r.text for r in retrieved])
    yield {
        "type": "done",
        "answer": answer.strip(),
        "sources": [s.model_dump() for s in _sources_for(retrieved, used, as_of)],
        "model": final.model,
        "quote_check": qc.model_dump(),
        "draft_check": irac_lint(answer).model_dump(),
    }
