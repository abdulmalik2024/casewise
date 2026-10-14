"""Extract 10 years of NY decisions from CourtListener bulk snapshots.

Phases (each caches its output in data/bulk/, so reruns skip done work):
  1 dockets:   stream dockets CSV -> {docket_id: court} for target NY courts
  2 clusters:  stream cached clusters CSV -> target cluster metadata since cutoff
  3 citations: cached citations CSV -> display citation per target cluster
  4 opinions:  STREAM the 55GB opinions CSV from S3 (never stored) -> per-court
               JSONL.gz archives in data/bulk/ny-decisions/

Then `--phase load` upserts chosen courts into case_decisions (feed 'bulk').
The Appellate Division archive stays R2-only until the Supabase Pro upgrade.
"""

from __future__ import annotations

import argparse
import bz2
import csv
import gzip
import io
import json
import re
import sys
from pathlib import Path

import httpx

from .build_catalog import BUCKET, bz2_rows, download, field, latest_snapshot

DATA_DIR = Path(__file__).parents[3] / "data" / "bulk"
OUT_DIR = DATA_DIR / "ny-decisions"
TARGET_COURTS = {"ny", "nyappterm", "nyappdiv", "nycivct"}
CUTOFF = "2016-10-13"

csv.field_size_limit(100_000_000)


class _HttpBz2Stream(io.RawIOBase):
    """File-like over an HTTP bz2 stream — the 55GB file is never stored."""

    def __init__(self, url: str):
        self._client = httpx.Client(timeout=None, follow_redirects=True)
        req = self._client.build_request("GET", url)
        self._resp = self._client.send(req, stream=True)
        self._resp.raise_for_status()
        self._iter = self._resp.iter_bytes(1 << 20)
        self._dec = bz2.BZ2Decompressor()
        self._buf = b""
        self.raw_read = 0

    def readable(self):
        return True

    def readinto(self, b):
        while not self._buf:
            try:
                chunk = next(self._iter)
            except StopIteration:
                return 0
            self.raw_read += len(chunk)
            self._buf = self._dec.decompress(chunk)
        n = min(len(b), len(self._buf))
        b[:n] = self._buf[:n]
        self._buf = self._buf[n:]
        return n


def phase_dockets(snapshot: str) -> None:
    out = DATA_DIR / "ny_dockets.json"
    if out.exists():
        print("dockets: cached")
        return
    client = httpx.Client(timeout=None, follow_redirects=True)
    path = download(client, "dockets", snapshot)
    client.close()
    mapping: dict[str, str] = {}
    n = 0
    for idx, row in bz2_rows(path):
        n += 1
        court = field(row, idx, "court_id")
        if court in TARGET_COURTS:
            mapping[field(row, idx, "id")] = court
        if n % 5_000_000 == 0:
            print(f"  dockets scanned {n:,}, kept {len(mapping):,}", flush=True)
    out.write_text(json.dumps(mapping))
    print(f"dockets: {len(mapping):,} target dockets of {n:,}")


def phase_clusters(snapshot: str) -> None:
    out = DATA_DIR / "ny_clusters.json"
    if out.exists():
        print("clusters: cached")
        return
    dockets = json.loads((DATA_DIR / "ny_dockets.json").read_text())
    client = httpx.Client(timeout=None, follow_redirects=True)
    path = download(client, "opinion-clusters", snapshot)
    client.close()
    meta: dict[str, dict] = {}
    n = 0
    for idx, row in bz2_rows(path):
        n += 1
        court = dockets.get(field(row, idx, "docket_id"))
        if not court:
            continue
        date = field(row, idx, "date_filed")
        if date < CUTOFF:
            continue
        cid = field(row, idx, "id")
        meta[cid] = {
            "court": court,
            "name": field(row, idx, "case_name")[:200],
            "date": date,
            "slug": field(row, idx, "slug")[:80],
        }
        if n % 2_000_000 == 0:
            print(f"  clusters scanned {n:,}, kept {len(meta):,}", flush=True)
    out.write_text(json.dumps(meta))
    counts: dict[str, int] = {}
    for m in meta.values():
        counts[m["court"]] = counts.get(m["court"], 0) + 1
    print(f"clusters: {len(meta):,} target -> {counts}")


def phase_citations(snapshot: str) -> None:
    out = DATA_DIR / "ny_citations.json"
    if out.exists():
        print("citations: cached")
        return
    meta = json.loads((DATA_DIR / "ny_clusters.json").read_text())
    client = httpx.Client(timeout=None, follow_redirects=True)
    path = download(client, "citations", snapshot)
    client.close()
    cites: dict[str, str] = {}
    for idx, row in bz2_rows(path):
        cid = field(row, idx, "cluster_id")
        if cid in meta and cid not in cites:
            cites[cid] = f"{field(row, idx, 'volume')} {field(row, idx, 'reporter')} {field(row, idx, 'page')}".strip()
    out.write_text(json.dumps(cites))
    print(f"citations: {len(cites):,} clusters with citations")


def best_text(idx, row) -> str | None:
    for col in ("plain_text", "html_with_citations", "html", "html_lawbox", "html_columbia", "xml_harvard"):
        v = field(row, idx, re.sub(r"[^a-z0-9]", "", col))
        if v and len(v) > 200:
            if col != "plain_text":
                v = re.sub(r"<[^>]+>", " ", v)
                v = re.sub(r"[ \t]+", " ", v)
            return v.strip()
    return None


def phase_opinions(snapshot: str) -> None:
    done_marker = OUT_DIR / ".done"
    if done_marker.exists():
        print("opinions: cached")
        return
    meta = json.loads((DATA_DIR / "ny_clusters.json").read_text())
    cites = json.loads((DATA_DIR / "ny_citations.json").read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    writers = {
        c: gzip.open(OUT_DIR / f"{c}.jsonl.gz", "wt", encoding="utf-8")
        for c in TARGET_COURTS
    }
    url = f"{BUCKET}/bulk-data/opinions-{snapshot}.csv.bz2"
    print(f"streaming {url}", flush=True)
    stream = _HttpBz2Stream(url)
    text_stream = io.TextIOWrapper(io.BufferedReader(stream, 1 << 22), encoding="utf-8", errors="replace", newline="")
    reader = csv.reader(text_stream)
    header = next(reader)
    idx = {re.sub(r"[^a-z0-9]", "", h.lower()): i for i, h in enumerate(header)}
    n = kept = 0
    for row in reader:
        n += 1
        cid = field(row, idx, "clusterid")
        m = meta.get(cid)
        if m:
            text = best_text(idx, row)
            if text:
                rec = {
                    "cluster_id": cid,
                    "court": m["court"],
                    "case_name": m["name"],
                    "date": m["date"],
                    "citation": cites.get(cid),
                    "url": f"https://www.courtlistener.com/opinion/{cid}/{m['slug'] or 'opinion'}/",
                    "type": field(row, idx, "type"),
                    "text": text[:400_000],
                }
                writers[m["court"]].write(json.dumps(rec) + "\n")
                kept += 1
        if n % 500_000 == 0:
            print(f"  opinions scanned {n:,}, kept {kept:,}, raw {stream.raw_read/1e9:.1f} GB", flush=True)
    for w in writers.values():
        w.close()
    done_marker.write_text(f"{n},{kept}")
    print(f"opinions: scanned {n:,}, kept {kept:,}")
    for c in sorted(TARGET_COURTS):
        p = OUT_DIR / f"{c}.jsonl.gz"
        print(f"  {c}: {p.stat().st_size/1e6:.1f} MB")


def phase_load(courts: set[str]) -> None:
    import os

    import psycopg
    from dotenv import find_dotenv, load_dotenv

    from ..caselaw.loader import UPSERT
    from ..statutes.loader import ensure_schema

    load_dotenv(find_dotenv(usecwd=True))
    conn = psycopg.connect(os.environ["DATABASE_URL"])
    ensure_schema(conn)
    court_names = {
        "ny": "New York Court of Appeals",
        "nyappterm": "Appellate Term of the Supreme Court of New York",
        "nyappdiv": "Appellate Division of the Supreme Court of New York",
        "nycivct": "Civil Court of the City of New York",
    }
    total = 0
    for c in courts:
        path = OUT_DIR / f"{c}.jsonl.gz"
        if not path.exists():
            print(f"{c}: no archive, skipped")
            continue
        n = 0
        batch = []
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                batch.append((r["case_name"] or "Unknown", r["url"], r["citation"],
                              court_names[c], r["date"], "bulk", r["text"]))
                if len(batch) >= 25:
                    with conn.cursor() as cur:
                        cur.executemany(UPSERT, batch)
                    conn.commit()
                    n += len(batch)
                    batch = []
        if batch:
            with conn.cursor() as cur:
                cur.executemany(UPSERT, batch)
            conn.commit()
            n += len(batch)
        total += n
        print(f"{c}: loaded {n:,}")
    conn.close()
    print(f"load done: {total:,}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Extract NY decisions from bulk snapshots")
    ap.add_argument("--phase", default="all",
                    choices=["dockets", "clusters", "citations", "opinions", "load", "all"])
    ap.add_argument("--load-courts", default="ny,nyappterm,nycivct",
                    help="courts to load into Postgres (AD stays archive-only)")
    ap.add_argument("--snapshot", default=None)
    args = ap.parse_args()

    client = httpx.Client(timeout=60)
    snapshot = args.snapshot or latest_snapshot(client)
    client.close()
    print(f"snapshot: {snapshot}")

    if args.phase in ("dockets", "all"):
        phase_dockets(snapshot)
    if args.phase in ("clusters", "all"):
        phase_clusters(snapshot)
    if args.phase in ("citations", "all"):
        phase_citations(snapshot)
    if args.phase in ("opinions", "all"):
        phase_opinions(snapshot)
    if args.phase == "load":
        phase_load({c.strip() for c in args.load_courts.split(",") if c.strip()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
