"""Build the offline citation catalog from CourtListener bulk data.

Downloads the quarterly `citations` and `opinion-clusters` snapshots (public
S3, no API, no rate limits) and builds a SQLite catalog mapping every
published citation to its case name, year, and CourtListener URL. The
catalog file is served to the API via object storage (R2) and makes the
cite auditor verify citations offline.

Quarterly refresh: re-run with --snapshot <YYYY-MM-DD> (or let it pick the
latest) and re-upload the catalog.
"""

from __future__ import annotations

import argparse
import bz2
import csv
import re
import sqlite3
import sys
from pathlib import Path

import httpx

BUCKET = "https://com-courtlistener-storage.s3-us-west-2.amazonaws.com"
DATA_DIR = Path(__file__).parents[3] / "data" / "bulk"

# keep the catalog to reporters a NY practice actually cites; drops size ~60%
REPORTER_KEEP = re.compile(
    r"^(U\.S\.|S\. ?Ct\.|L\. ?Ed\.|F\.[234]d|F\.|F\. ?Supp\.?|F\. ?Supp\. ?[23]d|"
    r"N\.Y\.|N\.Y\.[23]d|A\.D\.|A\.D\.[23]d|Misc\.|Misc\. ?[23]d|N\.Y\.S\.|N\.Y\.S\.[23]d|"
    r"NY Slip Op|B\.R\.|WL)$"
)

csv.field_size_limit(10_000_000)


def norm_cite(volume: str, reporter: str, page: str) -> str:
    return re.sub(r"[^a-z0-9]", "", f"{volume}{reporter}{page}".lower())


def latest_snapshot(client: httpx.Client) -> str:
    xml = client.get(
        BUCKET, params={"list-type": "2", "prefix": "bulk-data/citations-2026"}
    ).text
    dates = re.findall(r"citations-(\d{4}-\d{2}-\d{2})\.csv\.bz2", xml)
    if not dates:
        raise RuntimeError("no snapshots found")
    return max(dates)


def download(client: httpx.Client, name: str, snapshot: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{name}-{snapshot}.csv.bz2"
    if path.exists() and path.stat().st_size > 0:
        print(f"{path.name}: already downloaded")
        return path
    url = f"{BUCKET}/bulk-data/{name}-{snapshot}.csv.bz2"
    print(f"downloading {url}")
    tmp = path.with_suffix(".part")
    with client.stream("GET", url) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        done = 0
        with open(tmp, "wb") as f:
            for chunk in resp.iter_bytes(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if total and done % (200 << 20) < (1 << 20):
                    print(f"  {done/1e9:.2f}/{total/1e9:.2f} GB", flush=True)
    tmp.rename(path)
    return path


def field(row: list, idx: dict, name: str) -> str:
    i = idx.get(name)
    return row[i] if i is not None and i < len(row) else ""


def bz2_rows(path: Path):
    with bz2.open(path, "rt", newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)
        idx = {name: i for i, name in enumerate(header)}
        for row in reader:
            yield idx, row


def build(citations_path: Path, clusters_path: Path, out_path: Path) -> None:
    out_path.unlink(missing_ok=True)
    db = sqlite3.connect(out_path)
    db.executescript(
        """
        pragma journal_mode = off; pragma synchronous = off;
        create table clusters (id integer primary key, name text, year integer, slug text);
        create table citations (norm text, cluster_id integer);
        """
    )

    print("loading clusters…", flush=True)
    n = 0
    batch = []
    for idx, row in bz2_rows(clusters_path):
        try:
            cid = int(field(row, idx, "id"))
        except ValueError:
            continue
        name = (field(row, idx, "case_name") or field(row, idx, "case_name_short"))[:120]
        date = field(row, idx, "date_filed")
        slug = field(row, idx, "slug")[:80]
        year = int(date[:4]) if re.match(r"\d{4}", date) else None
        batch.append((cid, name, year, slug))
        n += 1
        if len(batch) >= 50_000:
            db.executemany("insert or ignore into clusters values (?,?,?,?)", batch)
            batch = []
            if n % 1_000_000 < 50_000:
                print(f"  clusters: {n:,}", flush=True)
    db.executemany("insert or ignore into clusters values (?,?,?,?)", batch)
    print(f"clusters loaded: {n:,}")

    print("loading citations…", flush=True)
    n = kept = 0
    batch = []
    for idx, row in bz2_rows(citations_path):
        n += 1
        reporter = field(row, idx, "reporter")
        if not REPORTER_KEEP.match(reporter):
            continue
        norm = norm_cite(field(row, idx, "volume"), reporter, field(row, idx, "page"))
        try:
            batch.append((norm, int(field(row, idx, "cluster_id"))))
        except ValueError:
            continue
        kept += 1
        if len(batch) >= 50_000:
            db.executemany("insert into citations values (?,?)", batch)
            batch = []
            if n % 2_000_000 < 50_000:
                print(f"  citations scanned {n:,}, kept {kept:,}", flush=True)
    db.executemany("insert into citations values (?,?)", batch)
    print(f"citations: scanned {n:,}, kept {kept:,}")

    print("indexing…", flush=True)
    db.execute("create index citations_norm on citations (norm)")
    # drop clusters that no kept citation references, then compact
    db.execute(
        "delete from clusters where id not in (select distinct cluster_id from citations)"
    )
    db.commit()
    db.execute("vacuum")
    db.close()
    print(f"catalog written: {out_path} ({out_path.stat().st_size/1e6:.0f} MB)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Build offline citation catalog from bulk data")
    ap.add_argument("--snapshot", default=None, help="YYYY-MM-DD; default latest")
    args = ap.parse_args()

    client = httpx.Client(timeout=None, follow_redirects=True)
    snapshot = args.snapshot or latest_snapshot(client)
    print(f"snapshot: {snapshot}")
    citations = download(client, "citations", snapshot)
    clusters = download(client, "opinion-clusters", snapshot)
    client.close()
    build(citations, clusters, DATA_DIR / "catalog.sqlite")
    return 0


if __name__ == "__main__":
    sys.exit(main())
