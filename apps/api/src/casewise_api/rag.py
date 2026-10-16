"""RAG answer generation with verified citations.

Hallucination control by construction: the model may only cite the retrieved
sources, via [S1]..[Sn] markers that WE map back to real citations. Any marker
outside the provided range is stripped before the answer is returned, so every
citation shown to the attorney resolves to a real corpus document.
"""

from __future__ import annotations

import re

import anthropic
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from .building import building_record
from .config import settings
from .quotecheck import QuoteCheck, check_quotes
from .retrieval import SearchResult, search

ANSWER_MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """You are Casewise, a legal research assistant for licensed attorneys \
practicing New York State property law. You answer research questions strictly from \
the numbered source excerpts provided with each question.

Rules:
- Base every legal assertion ONLY on the provided sources, and cite the supporting \
source marker, e.g. [S1], immediately after each assertion. Multiple markers are fine.
- If the sources do not contain enough information to answer reliably, say exactly \
what is missing instead of guessing. A partial, well-cited answer beats a complete \
uncited one.
- Where New York City rules differ from the rest of the state (rent stabilization, \
housing court practice), flag the distinction.
- When a "Building record" source is provided for an address in the question, ground \
your analysis in that building's facts (stabilization indicators, violations, owner) \
and cite it; note that building data is an indicator to confirm, not proof.
- Quote statutory language when the exact wording matters (deadlines, notice periods).

Style — attorneys want the answer, not an essay:
- Open with "**Short answer:**" and 1–3 sentences that directly answer the question, cited.
- Then at most 3–5 short bullet points covering only the load-bearing rules: deadlines, \
notice periods, NYC-vs-state splits, key exceptions. Each cited.
- Stay under roughly 200 words unless the question has genuinely independent parts. \
No background essays, no restating the question, no surveying everything the sources \
mention — the attorney will ask follow-ups for depth.
- Exception: when the user explicitly asks to go deeper or expand (e.g., a follow-up \
requesting fuller analysis), drop the length limit and give the thorough treatment: \
authorities compared, exceptions, and edge cases, still fully cited.
- Never invent citations, case names, or section numbers. Only the [Sn] markers of \
the provided sources are valid citations.
- You may be continuing a research conversation; earlier exchanges, when provided, \
are context for understanding the current question. Cite only the sources provided \
with the CURRENT question, not sources from earlier answers.
- End with: "Verify against the cited sources before relying on this answer."
"""


class Source(BaseModel):
    marker: str
    citation: str
    heading: str | None
    url: str | None
    source_type: str
    amended_after: bool = False  # statute amended after the as-of date (text shown is current)


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]
    model: str
    quote_check: QuoteCheck | None = None


def _dedupe(results: list[SearchResult], cap: int = 8) -> list[SearchResult]:
    seen: set[str] = set()
    out = []
    for r in results:
        if r.citation not in seen:
            seen.add(r.citation)
            out.append(r)
        if len(out) >= cap:
            break
    return out


def _amended_after(s: SearchResult, as_of: str | None) -> bool:
    return bool(
        as_of and s.source_type == "statute" and s.source_date and s.source_date > as_of
    )


def _build_prompt(
    question: str,
    sources: list[SearchResult],
    history: list[dict] | None = None,
    as_of: str | None = None,
) -> str:
    parts = []
    for i, s in enumerate(sources, 1):
        head = f" — {s.heading}" if s.heading else ""
        note = (
            f"\n[NOTE: this section was amended effective {s.source_date}, AFTER the "
            "as-of date; the text shown is the CURRENT version — historical wording "
            "is not available. Caveat any reliance on it accordingly.]"
            if _amended_after(s, as_of)
            else ""
        )
        parts.append(f"[S{i}] {s.citation}{head} ({s.source_type}){note}\n{s.text}")
    joined = "\n\n".join(parts)
    prefix = ""
    if as_of:
        prefix += (
            f"RESEARCH AS-OF DATE: {as_of}. Answer as of this date. Decisions and "
            "guidance postdating it have been excluded from the sources. Statute "
            "texts are the current versions; flagged sections changed after the "
            "as-of date and must be caveated.\n\n"
        )
    if history:
        exchanges = "\n\n".join(
            f"Earlier question: {h['question']}\nEarlier answer (context only):\n{h['answer'][:1500]}"
            for h in history[-4:]
        )
        prefix += f"Conversation so far:\n\n{exchanges}\n\n---\n\n"
    return f"{prefix}Sources:\n\n{joined}\n\nCurrent question: {question}"


def _verify_markers(answer: str, n_sources: int) -> tuple[str, set[int]]:
    """Strip markers that don't map to a provided source; collect the used ones."""
    used: set[int] = set()

    def repl(m: re.Match) -> str:
        idx = int(m.group(1))
        if 1 <= idx <= n_sources:
            used.add(idx)
            return m.group(0)
        return ""

    return re.sub(r"\[S(\d+)\]", repl, answer), used


def _source_counts(retrieved: list[SearchResult]) -> str:
    counts: dict[str, int] = {}
    for r in retrieved:
        counts[r.source_type] = counts.get(r.source_type, 0) + 1
    names = {"statute": "statutes", "case": "decisions", "guidance": "DHCR guidance"}
    parts = [f"{n} {names.get(t, t)}" for t, n in counts.items()]
    return f"Found {len(retrieved)} sources: " + ", ".join(parts)


def _sources_for(
    retrieved: list[SearchResult], used: set[int], as_of: str | None = None
) -> list[Source]:
    return [
        Source(
            marker=f"S{i}",
            citation=retrieved[i - 1].citation,
            heading=retrieved[i - 1].heading,
            url=retrieved[i - 1].url,
            source_type=retrieved[i - 1].source_type,
            amended_after=_amended_after(retrieved[i - 1], as_of),
        )
        for i in sorted(used)
    ]


def ask_stream(
    pool: ConnectionPool,
    question: str,
    history: list[dict] | None = None,
    as_of: str | None = None,
):
    """Yield SSE-able events: status -> delta* -> done. Real pipeline stages."""
    yield {"type": "status", "message": "Reading your question…"}
    # follow-ups often lean on the prior exchange ("what if rent-stabilized?"),
    # so retrieval sees the previous question too
    retrieval_q = f"{history[-1]['question']}\n{question}" if history else question
    retrieved = _dedupe(search(pool, retrieval_q, k=16, as_of=as_of))

    building = building_record(question)
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
            "answer": "No relevant sources found in the corpus for this question.",
            "sources": [],
            "model": ANSWER_MODEL,
        }
        return
    yield {"type": "status", "message": _source_counts(retrieved)}
    yield {"type": "status", "message": "Reading the sources and drafting a cited answer…"}

    headers = (
        {"anthropic-workspace-id": settings.anthropic_workspace_id}
        if settings.anthropic_workspace_id
        else None
    )
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, default_headers=headers)
    parts: list[str] = []
    with client.beta.messages.stream(
        model=ANSWER_MODEL,
        max_tokens=4096,
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": _build_prompt(question, retrieved, history, as_of)}
        ],
    ) as stream:
        for text in stream.text_stream:
            parts.append(text)
            yield {"type": "delta", "text": text}
        final = stream.get_final_message()

    if final.stop_reason == "refusal":
        yield {
            "type": "done",
            "answer": "The model declined to answer this question. Try rephrasing, or use Search to review sources directly.",
            "sources": [],
            "model": final.model,
        }
        return

    yield {"type": "status", "message": "Verifying citations and quotations against the corpus…"}
    answer, used = _verify_markers("".join(parts), len(retrieved))
    qc = check_quotes(answer, [r.text for r in retrieved])
    yield {
        "type": "done",
        "answer": answer.strip(),
        "sources": [s.model_dump() for s in _sources_for(retrieved, used, as_of)],
        "model": final.model,
        "quote_check": qc.model_dump(),
    }


def ask(pool: ConnectionPool, question: str) -> AskResponse:
    retrieved = _dedupe(search(pool, question, k=16))
    if not retrieved:
        return AskResponse(
            answer="No relevant sources found in the corpus for this question.",
            sources=[],
            model=ANSWER_MODEL,
        )

    headers = (
        {"anthropic-workspace-id": settings.anthropic_workspace_id}
        if settings.anthropic_workspace_id
        else None
    )
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, default_headers=headers)
    response = client.beta.messages.create(
        model=ANSWER_MODEL,
        max_tokens=4096,
        output_config={"effort": "high"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": _build_prompt(question, retrieved)}],
    )

    if response.stop_reason == "refusal":
        return AskResponse(
            answer="The model declined to answer this question. Try rephrasing, or use /search to review sources directly.",
            sources=[],
            model=response.model,
        )

    text = "".join(b.text for b in response.content if b.type == "text")
    answer, used = _verify_markers(text, len(retrieved))
    return AskResponse(
        answer=answer.strip(),
        sources=_sources_for(retrieved, used),
        model=response.model,
        quote_check=check_quotes(answer, [r.text for r in retrieved]),
    )
