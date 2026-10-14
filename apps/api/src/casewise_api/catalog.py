"""Offline citation catalog (SQLite, built quarterly from CourtListener bulk
data by pipelines/bulkdata). Resolves any published citation to case name,
year, and CourtListener link with zero external calls.

The file is fetched once from object storage (CATALOG_URL, e.g. a public R2
bucket) to local disk at startup/first use; absent configuration, the layer
degrades gracefully and the auditor falls back to cache + live lookup.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

import httpx

from .config import settings

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None
_unavailable = False


def _ensure_file() -> Path | None:
    path = Path(settings.catalog_path)
    if path.exists() and path.stat().st_size > 0:
        return path
    url = settings.catalog_url
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


def lookup(norm_cite: str) -> dict | None:
    """-> {case_name, year, url} or None (not in catalog / catalog absent)."""
    conn = _get_conn()
    if conn is None:
        return None
    row = conn.execute(
        "select cl.name, cl.year, cl.id, cl.slug from citations c "
        "join clusters cl on cl.id = c.cluster_id where c.norm = ? limit 1",
        (norm_cite,),
    ).fetchone()
    if not row:
        return None
    name, year, cid, slug = row
    return {
        "case_name": name or "(unnamed)",
        "year": year,
        "url": f"https://www.courtlistener.com/opinion/{cid}/{slug or 'opinion'}/",
    }


def available() -> bool:
    return _get_conn() is not None
