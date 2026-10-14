"""Deterministic quote verification.

Every quoted passage in an answer is string-matched against the retrieved
source texts (after aggressive normalization), so the attorney can see which
quotations provably appear in the sources and which could not be matched.
No model involved — this is exact matching, immune to hallucination.
"""

from __future__ import annotations

import re

from pydantic import BaseModel

QUOTE_RE = re.compile(r'"([^"\n]{15,400})"|“([^”\n]{15,400})”')
MIN_SEGMENT = 12  # normalized chars; shorter ellipsis segments are skipped


class QuoteCheck(BaseModel):
    total: int
    verified: int
    unverified: list[str]


def _normalize(text: str) -> str:
    # case-, punctuation- and whitespace-insensitive comparison space
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def extract_quotes(answer: str) -> list[str]:
    out = []
    for m in QUOTE_RE.finditer(answer):
        q = (m.group(1) or m.group(2) or "").strip()
        if q:
            out.append(q)
    return out


def _quote_in_sources(quote: str, haystack: str) -> bool:
    # an ellipsis means the model elided text: every segment must match
    segments = re.split(r"\.\.\.|…", quote)
    checked = 0
    for seg in segments:
        norm = _normalize(seg)
        if len(norm) < MIN_SEGMENT:
            continue
        checked += 1
        if norm not in haystack:
            return False
    return checked > 0


def check_quotes(answer: str, source_texts: list[str]) -> QuoteCheck:
    haystack = _normalize(" ".join(source_texts))
    quotes = extract_quotes(answer)
    unverified = [q for q in quotes if not _quote_in_sources(q, haystack)]
    return QuoteCheck(
        total=len(quotes), verified=len(quotes) - len(unverified), unverified=unverified
    )
