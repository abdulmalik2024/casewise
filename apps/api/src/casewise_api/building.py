"""Building-grounded answers (roadmap Now #4).

When a question mentions a NYC street address, resolve it to a BBL via the
city's free GeoSearch API and attach that building's official record
(rent-stabilized unit counts, open HPD violations, registered owner,
marshal evictions) as an extra citable source. Facts come from a compact
SQLite aggregate of NYC open data (pipelines/bulkdata/build_building_facts),
hosted on R2 and fetched once like the citation catalog.
"""

from __future__ import annotations

import os
import re
import sqlite3
import threading
from pathlib import Path

import httpx

from .config import settings

GEOSEARCH = "https://geosearch.planninglabs.nyc/v2/search"

ADDRESS_RE = re.compile(
    r"\b(\d{1,5}(?:-\d{1,4})?[A-Za-z]?\s+[A-Za-z][A-Za-z0-9.' -]{2,40}?"
    r"\s(?:Street|Avenue|Ave\.?|St\.?|Road|Rd\.?|Boulevard|Blvd\.?|Place|Pl\.?|"
    r"Drive|Dr\.?|Parkway|Pkwy\.?|Court|Ct\.?|Lane|Ln\.?|Terrace|Ter\.?|Way|Broadway)"
    r"(?:\s*,?\s*(?:in\s+)?(?:the\s+)?(Bronx|Brooklyn|Manhattan|Queens|Staten\s+Island))?)",
    re.I,
)

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_unavailable = False


def _ensure_file() -> Path | None:
    path = Path(settings.building_facts_path)
    if path.exists() and path.stat().st_size > 0:
        return path
    url = settings.building_facts_url
    if not url:
        return None
    tmp = path.with_suffix(".part")
    path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=None, follow_redirects=True) as resp:
        resp.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in resp.iter_bytes(1 << 20):
                f.write(chunk)
    os.replace(tmp, path)
    return path


def _get_conn() -> sqlite3.Connection | None:
    global _conn, _unavailable
    if _conn is not None or _unavailable:
        return _conn
    with _lock:
        if _conn is not None or _unavailable:
            return _conn
        try:
            path = _ensure_file()
        except Exception:
            path = None
        if path is None:
            _unavailable = True
            return None
        _conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    return _conn


def extract_address(question: str) -> str | None:
    m = ADDRESS_RE.search(question)
    return m.group(1).strip() if m else None


def building_record(question: str) -> dict | None:
    """Detect an address in the question -> {label, bbl, text, url} or None."""
    address = extract_address(question)
    if not address:
        return None
    conn = _get_conn()
    if conn is None:
        return None
    try:
        resp = httpx.get(GEOSEARCH, params={"text": address, "size": 1}, timeout=8.0)
        feats = resp.json().get("features") or []
    except Exception:
        return None
    if not feats:
        return None
    props = feats[0].get("properties", {})
    bbl = (props.get("addendum", {}) or {}).get("pad", {}).get("bbl") or props.get("pad_bbl")
    label = props.get("label") or address
    if not bbl:
        return None
    row = conn.execute(
        "select stab_units, stab_year, viol_a, viol_b, viol_c, viol_other, owner, evictions "
        "from facts where bbl = ?",
        (bbl,),
    ).fetchone()

    lines = [f"OFFICIAL BUILDING RECORD — {label} (BBL {bbl})."]
    if row is None:
        lines.append(
            "No rent-stabilization filings, open HPD violations, registration, or "
            "marshal evictions on record for this lot in the aggregated city data. "
            "This often means a small/owner-occupied or non-residential building."
        )
    else:
        stab_units, stab_year, va, vb, vc, vo, owner, evictions = row
        if stab_units:
            lines.append(
                f"Rent-stabilized units reported on {stab_year} tax filings: {stab_units} "
                "— the building likely contains rent-stabilized apartments (confirm the "
                "specific unit's status with a DHCR rent history)."
            )
        else:
            lines.append(
                "No rent-stabilized units reported on recent tax filings (this is an "
                "indicator, not proof — units can be misreported; confirm with DHCR)."
            )
        total_viol = va + vb + vc + vo
        if total_viol:
            lines.append(
                f"Open HPD violations: {total_viol} total — class A (non-hazardous): {va}, "
                f"class B (hazardous): {vb}, class C (immediately hazardous): {vc}, other: {vo}. "
                "Open B/C violations are probative on warranty-of-habitability issues."
            )
        else:
            lines.append("No open HPD violations on record.")
        if owner:
            lines.append(f"Registered owner/head officer per HPD registration: {owner}.")
        if evictions:
            lines.append(f"Marshal-executed evictions recorded at this building since 2017: {evictions}.")
    lines.append(
        "Data: NYC HPD registrations/violations, DOF tax bills (JustFix rent-stab counts), "
        "city marshals — via NYC Open Data aggregates; snapshot, not real-time."
    )
    return {
        "label": label,
        "bbl": bbl,
        "text": "\n".join(lines),
        "url": f"https://whoownswhat.justfix.org/bbl/{bbl}",
    }
