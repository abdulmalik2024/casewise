"""Retrieval augmentation for statutes that similarity ranking misses.

Two deterministic layers, both feeding real corpus sections (so citations
stay construction-verified):

1. Topic anchors — common landlord-tenant questions phrased colloquially
   ("can my tenant withhold rent?") embed nowhere near the doctrinal text
   that answers them ("warranty of habitability"). A small curated map of
   question patterns -> anchor statutes guarantees the governing section is
   always among the sources. Every citation here is verified to exist in
   statute_sections.

2. Cross-reference expansion — NY statutes cite each other in words
   ("pursuant to ... subdivision two of section two hundred twenty-six-c of
   this article"). When a retrieved statute references a section we didn't
   retrieve, fetch it, so the answer never has to say "pull § 226-c yourself".
"""

from __future__ import annotations

import re

from psycopg_pool import ConnectionPool

from .retrieval import SearchResult

TOPIC_ANCHORS: list[tuple[re.Pattern, list[str]]] = [
    (
        re.compile(
            r"withhold(ing)?\s+rent|habitab|repair|no\s+heat|hot\s+water|mold|"
            r"vermin|mice|rats|roach|leak|unsafe\s+condition",
            re.I,
        ),
        ["RPP § 235-B", "MDW § 302", "RPA § 755"],
    ),
    (
        re.compile(r"month.to.month|monthly\s+tenan|notice\s+to\s+(terminate|quit)|holdover", re.I),
        ["RPP § 232-A", "RPP § 232-B", "RPP § 226-C"],
    ),
    (
        re.compile(r"rent\s+increase|non.?renew|renewal\s+notice", re.I),
        ["RPP § 226-C"],
    ),
    (
        re.compile(r"security\s+deposit", re.I),
        ["GOB § 7-108", "GOB § 7-103"],
    ),
    (
        re.compile(r"late\s+fee|late\s+charge", re.I),
        ["RPP § 238-A"],
    ),
    (
        re.compile(r"retaliat", re.I),
        ["RPP § 223-B"],
    ),
    (
        re.compile(r"lock(ed)?.?out|self.?help\s+evict|illegal\s+evict|changed?\s+the\s+locks", re.I),
        ["RPA § 768", "RPA § 711", "RPA § 713"],
    ),
    (
        re.compile(r"roommate|additional\s+occupant", re.I),
        ["RPP § 235-F"],
    ),
    (
        re.compile(r"sublet|sublease|assign\s+the\s+lease", re.I),
        ["RPP § 226-B"],
    ),
    (
        re.compile(r"nonpayment|rent\s+demand|pay\s+or\s+quit", re.I),
        ["RPA § 711", "RPA § 731"],
    ),
    (
        re.compile(r"warrant\s+of\s+eviction|marshal|stay\s+of\s+eviction", re.I),
        ["RPA § 749", "RPA § 753"],
    ),
]

_NUM_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
    "seventy": 70, "eighty": 80, "ninety": 90,
}

_XREF_RE = re.compile(
    r"section\s+((?:[a-z]+[\s-])*[a-z]+|\d+(?:-[a-z])?)\s+of\s+this\s+(?:article|chapter)",
    re.I,
)


def _words_to_section(phrase: str) -> str | None:
    """'two hundred twenty-six-c' -> '226-C'; '226-c' -> '226-C'."""
    phrase = phrase.strip().lower()
    if re.fullmatch(r"\d+(-[a-z])?", phrase):
        return phrase.upper()
    tokens = re.split(r"[\s-]+", phrase)
    suffix = ""
    if tokens and len(tokens[-1]) == 1 and tokens[-1].isalpha():
        suffix = tokens.pop().upper()
    total = 0
    for t in tokens:
        if t == "hundred":
            total = (total or 1) * 100
        elif t in _NUM_WORDS:
            total += _NUM_WORDS[t]
        else:
            return None
    if not total:
        return None
    return f"{total}-{suffix}" if suffix else str(total)


def anchor_citations(question: str) -> list[str]:
    out: list[str] = []
    for pattern, cites in TOPIC_ANCHORS:
        if pattern.search(question):
            out.extend(c for c in cites if c not in out)
    return out


def xref_citations(statute_citation: str, text: str) -> list[str]:
    """Sections this statute references within its own law, as full citations."""
    law = statute_citation.split(" ")[0]
    out: list[str] = []
    for m in _XREF_RE.finditer(text):
        sec = _words_to_section(m.group(1))
        if sec:
            cite = f"{law} § {sec}"
            if cite != statute_citation and cite not in out:
                out.append(cite)
    return out


def fetch_sections(pool: ConnectionPool, citations: list[str]) -> list[SearchResult]:
    if not citations:
        return []
    with pool.connection() as conn:
        rows = conn.execute(
            "select distinct on (citation) citation, heading, text, source_url, "
            "active_date::text from statute_sections where citation = any(%s) "
            "order by citation, active_date desc nulls last",
            (citations,),
        ).fetchall()
    by_cite = {r[0]: r for r in rows}
    return [
        SearchResult(
            citation=r[0], heading=r[1], text=r[2], source_type="statute",
            url=r[3], source_date=r[4], score=0.99,
        )
        for c in citations
        if (r := by_cite.get(c))
    ]


def augment_with_statutes(
    pool: ConnectionPool,
    question: str,
    retrieved: list[SearchResult],
    cap: int = 8,
    xref_cap: int = 2,
) -> list[SearchResult]:
    """Anchors first, then retrieved (deduped, capped), then cross-references."""
    have = {r.citation for r in retrieved}
    anchors = fetch_sections(pool, [c for c in anchor_citations(question) if c not in have])
    merged: list[SearchResult] = []
    seen: set[str] = set()
    for r in anchors + retrieved:
        if r.citation not in seen:
            seen.add(r.citation)
            merged.append(r)
        if len(merged) >= cap:
            break
    xrefs: list[str] = []
    for r in merged:
        if r.source_type == "statute":
            xrefs.extend(c for c in xref_citations(r.citation, r.text) if c not in seen and c not in xrefs)
    for extra in fetch_sections(pool, xrefs[:xref_cap]):
        seen.add(extra.citation)
        merged.append(extra)
    return merged
