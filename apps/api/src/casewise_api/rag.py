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

from .config import settings
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
- Quote statutory language when the exact wording matters (deadlines, notice periods).
- Be concise and precise; write for an attorney, not a consumer.
- Never invent citations, case names, or section numbers. Only the [Sn] markers of \
the provided sources are valid citations.
- End with: "Verify against the cited sources before relying on this answer."
"""


class Source(BaseModel):
    marker: str
    citation: str
    heading: str | None
    url: str | None
    source_type: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]
    model: str


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


def _build_prompt(question: str, sources: list[SearchResult]) -> str:
    parts = []
    for i, s in enumerate(sources, 1):
        head = f" — {s.heading}" if s.heading else ""
        parts.append(f"[S{i}] {s.citation}{head} ({s.source_type})\n{s.text}")
    joined = "\n\n".join(parts)
    return f"Sources:\n\n{joined}\n\nQuestion: {question}"


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
    sources = [
        Source(
            marker=f"S{i}",
            citation=retrieved[i - 1].citation,
            heading=retrieved[i - 1].heading,
            url=retrieved[i - 1].url,
            source_type=retrieved[i - 1].source_type,
        )
        for i in sorted(used)
    ]
    return AskResponse(answer=answer.strip(), sources=sources, model=response.model)
