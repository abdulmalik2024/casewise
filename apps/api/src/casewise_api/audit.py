"""Document cite auditor ("check my document", roadmap Now #2).

Takes brief/memo text, extracts New York citations, and verifies each:
statutes / court rules / slip opinions against our corpus; reporter
citations (AD3d, NY3d, Misc 3d…) against CourtListener's citation-lookup
API. Quoted passages are matched against the texts of the resolved corpus
sources. Works on anyone's filings, including opposing counsel's.
"""

from __future__ import annotations

import re

import httpx
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from . import catalog
from .config import settings
from .quotecheck import QuoteCheck, check_quotes

# Statute name → our law_id
LAW_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"(?:Real Property Actions (?:and|&) Proceedings Law|RPAPL)\s*§*\s*([\d]+(?:-[A-Za-z])?)"), "RPA"),
    (re.compile(r"(?:Real Property Law|RPL)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "RPP"),
    (re.compile(r"CPLR\s*§?\s*([\d]+(?:-[A-Za-z])?)"), "CVP"),
    (re.compile(r"(?:General Obligations Law|GOL)\s*§+\s*([\d]+(?:-[A-Za-z0-9]+)?)"), "GOB"),
    (re.compile(r"(?:Multiple Dwelling Law|MDL)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "MDW"),
    (re.compile(r"(?:Emergency Tenant Protection Act|ETPA)\s*§*\s*([\d]+(?:-[A-Za-z])?)"), "ETP"),
    (re.compile(r"(?:Banking Law)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "BNK"),
    (re.compile(r"(?:Business Corporation Law|BCL)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "BSC"),
    (re.compile(r"(?:Not-for-Profit Corporation Law|N-PCL)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "NPC"),
    (re.compile(r"(?:General Business Law|GBL)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "GBS"),
    (re.compile(r"(?:Lien Law)\s*§+\s*([\d]+(?:-[A-Za-z])?)"), "LIE"),
    (re.compile(r"(?:Uniform Commercial Code|UCC)\s*§*\s*([\d]+(?:-?[A-Za-z]?-?[\d]+)?)"), "UCC"),
]
NYCRR_RE = re.compile(r"(\d+)\s*N\.?Y\.?C\.?R\.?R\.?\s*§*\s*([\d]+\.[\d]+(?:-[a-z])?)")
SLIP_RE = re.compile(r"(\d{4})\s*N\.?Y\.?\s*Slip\s*Op\.?\s*(\d{4,6})(\s*\(U\))?", re.I)
REPORTER_RE = re.compile(
    r"\b\d+\s+(?:A\.?\s?D\.?|N\.?\s?Y\.?\s?S\.?|N\.?\s?Y\.?|Misc\.?)\s*[23]d\.?\s+\d+\b"
)


def _norm_cite(cite: str) -> str:
    return re.sub(r"[^a-z0-9]", "", cite.lower())

CL_LOOKUP = "https://www.courtlistener.com/api/rest/v4/citation-lookup/"


class AuditRow(BaseModel):
    citation: str
    kind: str  # statute | rule | slip-op | reporter
    status: str  # found_corpus | found_courtlistener | not_found | unchecked
    detail: str | None = None
    url: str | None = None


class AuditResponse(BaseModel):
    rows: list[AuditRow]
    quotes: QuoteCheck


def extract_statute_cites(text: str) -> list[tuple[str, str, str]]:
    """(display_citation, law_id, location) — deduped, order preserved."""
    seen: set[tuple[str, str]] = set()
    out = []
    for pattern, law_id in LAW_PATTERNS:
        for m in pattern.finditer(text):
            loc = m.group(1).upper()
            if (law_id, loc) in seen:
                continue
            seen.add((law_id, loc))
            out.append((m.group(0).strip(), law_id, loc))
    return out


def _lookup_statute(conn, law_id: str, loc: str):
    for candidate in (loc, f"R{loc}", loc.rstrip(".")):
        row = conn.execute(
            "select heading, source_url, text from statute_sections "
            "where law_id = %s and upper(location_id) = %s and is_current limit 1",
            (law_id, candidate),
        ).fetchone()
        if row:
            return row
    return None


def _check_courtlistener(text: str) -> dict[str, tuple[str, str | None]] | None:
    """reporter citation -> (status, url) via CourtListener's citation-lookup.
    Returns None when the lookup itself failed (rate limit, network)."""
    token = settings.courtlistener_api_token
    if not token:
        return None
    import time as _time

    resp = None
    for attempt in range(3):
        try:
            resp = httpx.post(
                CL_LOOKUP,
                headers={"Authorization": f"Token {token}"},
                data={"text": text[:60_000]},
                timeout=60.0,
            )
        except httpx.HTTPError:
            return None
        if resp.status_code == 429 and attempt < 2:
            # bounded patience: our own backfill may be consuming the quota
            _time.sleep(min(float(resp.headers.get("retry-after") or 8), 15))
            continue
        break
    if resp is None or resp.status_code != 200:
        return None
    results: dict[str, tuple[str, str | None]] = {}
    for item in resp.json():
        cite = item.get("citation") or ""
        clusters = item.get("clusters") or []
        if item.get("status") == 200 and clusters:
            url = "https://www.courtlistener.com" + (clusters[0].get("absolute_url") or "")
            name = clusters[0].get("case_name") or ""
            results[cite] = (f"found:{name}", url)
        else:
            results[cite] = ("not_found", None)
    return results


def audit_text(pool: ConnectionPool, text: str) -> AuditResponse:
    rows: list[AuditRow] = []
    resolved_texts: list[str] = []

    with pool.connection() as conn:
        for display, law_id, loc in extract_statute_cites(text):
            hit = _lookup_statute(conn, law_id, loc)
            if hit:
                rows.append(AuditRow(citation=display, kind="statute", status="found_corpus",
                                     detail=hit[0], url=hit[1]))
                resolved_texts.append(hit[2])
            else:
                rows.append(AuditRow(citation=display, kind="statute", status="not_found",
                                     detail=f"No current section {law_id} § {loc} in the corpus"))

        for m in NYCRR_RE.finditer(text):
            title, sec = m.group(1), m.group(2)
            if title == "22":
                hit = conn.execute(
                    "select title, url, text from agency_documents where slug = %s",
                    (f"rule-{sec}",),
                ).fetchone()
                if hit:
                    rows.append(AuditRow(citation=m.group(0), kind="rule", status="found_corpus",
                                         detail=hit[0], url=hit[1]))
                    resolved_texts.append(hit[2])
                else:
                    rows.append(AuditRow(citation=m.group(0), kind="rule", status="not_found",
                                         detail="Not in the Uniform Civil Rules parts we index (208/210/212)"))
            else:
                rows.append(AuditRow(citation=m.group(0), kind="rule", status="unchecked",
                                     detail=f"Title {title} NYCRR is not fully indexed; verify manually"))

        for m in SLIP_RE.finditer(text):
            year, num = m.group(1), m.group(2).lstrip("0") or "0"
            hit = conn.execute(
                "select case_name, url, text from case_decisions "
                "where slip_citation ilike %s limit 1",
                (f"{year} NY Slip Op %{num}%",),
            ).fetchone()
            if hit:
                rows.append(AuditRow(citation=m.group(0), kind="slip-op", status="found_corpus",
                                     detail=hit[0], url=hit[1]))
                resolved_texts.append(hit[2])
            else:
                rows.append(AuditRow(citation=m.group(0), kind="slip-op", status="unchecked",
                                     detail="Not in our decision window; verify on nycourts.gov"))

    # dedupe punctuation variants ("250 AD2d 845" == "250 A.D.2d 845")
    reporter_cites: dict[str, str] = {}
    for m in REPORTER_RE.finditer(text):
        reporter_cites.setdefault(_norm_cite(m.group(0)), m.group(0))

    pending: dict[str, str] = {}
    with pool.connection() as conn:
        for norm, cite in reporter_cites.items():
            # 1) our own corpus (backfilled decisions store reporter citations)
            local = conn.execute(
                "select case_name, url from case_decisions "
                "where regexp_replace(lower(slip_citation), '[^a-z0-9]', '', 'g') = %s limit 1",
                (norm,),
            ).fetchone()
            if local:
                rows.append(AuditRow(citation=cite, kind="reporter", status="found_corpus",
                                     detail=local[0], url=local[1]))
                continue
            # 2) offline catalog (all published citations, quarterly bulk snapshot)
            hit = catalog.lookup(norm)
            if hit:
                year = f", {hit['year']}" if hit.get("year") else ""
                rows.append(AuditRow(citation=cite, kind="reporter", status="found_corpus",
                                     detail=f"{hit['case_name']}{year}", url=hit["url"]))
                continue
            # 3) permanent lookup cache (found = forever; not_found = 30 days)
            cached = conn.execute(
                "select status, case_name, url from citation_lookups "
                "where norm_cite = %s and (status = 'found' or checked_at > now() - interval '30 days')",
                (norm,),
            ).fetchone()
            if cached:
                if cached[0] == "found":
                    rows.append(AuditRow(citation=cite, kind="reporter", status="found_courtlistener",
                                         detail=cached[1], url=cached[2]))
                else:
                    rows.append(AuditRow(citation=cite, kind="reporter", status="not_found",
                                         detail="No matching case found — possible fabricated citation"))
                continue
            pending[norm] = cite

    # 3) live CourtListener only for never-seen citations; results are stored
    cl = _check_courtlistener(text) if pending else {}
    cl_norm = {_norm_cite(k): v for k, v in cl.items()} if cl else {}
    with pool.connection() as conn:
        for norm, cite in pending.items():
            if cl is None:
                if catalog.available():
                    rows.append(AuditRow(citation=cite, kind="reporter", status="not_found",
                                         detail="Not among 5.1M published citations in the offline catalog — treat as suspect (live re-check unavailable right now)"))
                else:
                    rows.append(AuditRow(citation=cite, kind="reporter", status="unchecked",
                                         detail="CourtListener is rate-limited right now — re-run the check in a few minutes"))
                continue
            hit = cl_norm.get(norm)
            if hit is None:
                rows.append(AuditRow(citation=cite, kind="reporter", status="unchecked",
                                     detail="CourtListener did not recognize this citation format"))
                continue
            if hit[0].startswith("found:"):
                rows.append(AuditRow(citation=cite, kind="reporter", status="found_courtlistener",
                                     detail=hit[0][6:], url=hit[1]))
                conn.execute(
                    "insert into citation_lookups (norm_cite, display, status, case_name, url) "
                    "values (%s, %s, 'found', %s, %s) on conflict (norm_cite) do update set "
                    "status = 'found', case_name = excluded.case_name, url = excluded.url, checked_at = now()",
                    (norm, cite, hit[0][6:], hit[1]),
                )
            else:
                rows.append(AuditRow(citation=cite, kind="reporter", status="not_found",
                                     detail="No matching case found — possible fabricated citation"))
                conn.execute(
                    "insert into citation_lookups (norm_cite, display, status) values (%s, %s, 'not_found') "
                    "on conflict (norm_cite) do update set status = 'not_found', checked_at = now()",
                    (norm, cite),
                )
        conn.commit()

    quotes = check_quotes(text, resolved_texts) if resolved_texts else QuoteCheck(
        total=0, verified=0, unverified=[]
    )
    return AuditResponse(rows=rows, quotes=quotes)
