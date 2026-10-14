"""Build the NYC building-facts SQLite (roadmap Now #4).

Aggregates free NYC datasets into one compact per-BBL record so Ask answers
can be grounded in the actual building: rent-stabilized unit counts
(JustFix/taxbills), open HPD violations by class, registered owner, and
marshal evictions. Output is hosted on R2 like the citation catalog; the
API resolves an address to a BBL live via NYC GeoSearch, then looks up
facts locally.

Datasets (all free, no keys):
- JustFix rent-stab counts:  s3://justfix-data/rentstab_counts_from_doffer_2024.csv
- HPD violations:            Socrata wvxf-dwi5
- HPD registrations:         Socrata tesw-yqqr
- HPD registration contacts: Socrata feu5-w2e2
- Marshal evictions:         Socrata 6z8x-wfk4
"""

from __future__ import annotations

import csv
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import httpx

DATA_DIR = Path(__file__).parents[3] / "data" / "bulk"
OUT = DATA_DIR / "buildingfacts.sqlite"

SOURCES = {
    "rentstab": "https://s3.amazonaws.com/justfix-data/rentstab_counts_from_doffer_2024.csv",
    "violations": "https://data.cityofnewyork.us/api/views/wvxf-dwi5/rows.csv?accessType=DOWNLOAD",
    "registrations": "https://data.cityofnewyork.us/api/views/tesw-yqqr/rows.csv?accessType=DOWNLOAD",
    "contacts": "https://data.cityofnewyork.us/api/views/feu5-w2e2/rows.csv?accessType=DOWNLOAD",
    "evictions": "https://data.cityofnewyork.us/api/views/6z8x-wfk4/rows.csv?accessType=DOWNLOAD",
}

csv.field_size_limit(10_000_000)


def download(client: httpx.Client, name: str) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{name}.csv"
    if path.exists() and path.stat().st_size > 0:
        print(f"{name}: cached ({path.stat().st_size/1e6:.0f} MB)")
        return path
    print(f"downloading {name}…", flush=True)
    tmp = path.with_suffix(".part")
    with client.stream("GET", SOURCES[name]) as resp:
        resp.raise_for_status()
        done = 0
        with open(tmp, "wb") as f:
            for chunk in resp.iter_bytes(1 << 20):
                f.write(chunk)
                done += len(chunk)
                if done % (500 << 20) < (1 << 20):
                    print(f"  {name}: {done/1e9:.2f} GB", flush=True)
    tmp.rename(path)
    print(f"{name}: {path.stat().st_size/1e6:.0f} MB")
    return path


def rows(path: Path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader)
        idx = {re.sub(r"[^a-z0-9]", "", h.lower()): i for i, h in enumerate(header)}
        for row in reader:
            yield idx, row


def field(row, idx, *names) -> str:
    for n in names:
        i = idx.get(n)
        if i is not None and i < len(row):
            return row[i].strip()
    return ""


def make_bbl(boro: str, block: str, lot: str) -> str | None:
    try:
        return f"{int(boro)}{int(block):05d}{int(lot):04d}"
    except ValueError:
        return None


def main() -> int:
    client = httpx.Client(timeout=None, follow_redirects=True)
    paths = {name: download(client, name) for name in SOURCES}
    client.close()

    print("aggregating rent-stab counts…", flush=True)
    stab: dict[str, tuple[int, int]] = {}  # bbl -> (units, year)
    for idx, row in rows(paths["rentstab"]):
        bbl = field(row, idx, "ucbbl")
        if not re.fullmatch(r"\d{10}", bbl):
            continue
        for year in range(2024, 2017, -1):
            v = field(row, idx, f"uc{year}")
            if v.isdigit() and int(v) > 0:
                stab[bbl] = (int(v), year)
                break
    print(f"  stabilized buildings: {len(stab):,}")

    print("aggregating open violations…", flush=True)
    viol: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])  # A,B,C,other
    n = 0
    for idx, row in rows(paths["violations"]):
        n += 1
        if field(row, idx, "violationstatus") != "Open":
            continue
        bbl = field(row, idx, "bbl") or make_bbl(
            field(row, idx, "boroid"), field(row, idx, "block"), field(row, idx, "lot")
        )
        if not bbl:
            continue
        cls = field(row, idx, "class")
        slot = {"A": 0, "B": 1, "C": 2}.get(cls, 3)
        viol[bbl][slot] += 1
        if n % 2_000_000 == 0:
            print(f"  violations scanned: {n:,}", flush=True)
    print(f"  buildings with open violations: {len(viol):,}")

    print("aggregating registrations/owners…", flush=True)
    reg_to_bbl: dict[str, str] = {}
    for idx, row in rows(paths["registrations"]):
        rid = field(row, idx, "registrationid")
        bbl = field(row, idx, "bbl") or make_bbl(
            field(row, idx, "boroid"), field(row, idx, "block"), field(row, idx, "lot")
        )
        if rid and bbl:
            reg_to_bbl[rid] = bbl
    owners: dict[str, str] = {}
    for idx, row in rows(paths["contacts"]):
        rid = field(row, idx, "registrationid")
        bbl = reg_to_bbl.get(rid)
        if not bbl:
            continue
        ctype = field(row, idx, "type")
        corp = field(row, idx, "corporationname")
        person = (field(row, idx, "firstname") + " " + field(row, idx, "lastname")).strip()
        name = corp or person
        if not name:
            continue
        # prefer corporate owner, then head officer, then anything
        rank = {"CorporateOwner": 0, "HeadOfficer": 1, "IndividualOwner": 2}.get(ctype, 3)
        prev = owners.get(bbl)
        if prev is None or rank < prev[0]:
            owners[bbl] = (rank, name[:120])  # type: ignore[assignment]
    owners = {b: v[1] for b, v in owners.items()}  # type: ignore[misc]
    print(f"  buildings with owners: {len(owners):,}")

    print("aggregating evictions…", flush=True)
    evic: dict[str, int] = defaultdict(int)
    for idx, row in rows(paths["evictions"]):
        bbl = field(row, idx, "bbl")
        if re.fullmatch(r"\d{10}", bbl):
            evic[bbl] += 1
    print(f"  buildings with executed evictions: {len(evic):,}")

    print("writing sqlite…", flush=True)
    OUT.unlink(missing_ok=True)
    db = sqlite3.connect(OUT)
    db.executescript(
        """
        pragma journal_mode = off; pragma synchronous = off;
        create table facts (
            bbl text primary key, stab_units integer, stab_year integer,
            viol_a integer, viol_b integer, viol_c integer, viol_other integer,
            owner text, evictions integer
        );
        """
    )
    all_bbls = set(stab) | set(viol) | set(owners) | set(evic)
    batch = []
    for bbl in all_bbls:
        s = stab.get(bbl)
        v = viol.get(bbl, [0, 0, 0, 0])
        batch.append((bbl, s[0] if s else None, s[1] if s else None,
                      v[0], v[1], v[2], v[3], owners.get(bbl), evic.get(bbl, 0)))
        if len(batch) >= 50_000:
            db.executemany("insert into facts values (?,?,?,?,?,?,?,?,?)", batch)
            batch = []
    db.executemany("insert into facts values (?,?,?,?,?,?,?,?,?)", batch)
    db.commit()
    db.execute("vacuum")
    db.close()
    print(f"done: {len(all_bbls):,} buildings -> {OUT} ({OUT.stat().st_size/1e6:.0f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
