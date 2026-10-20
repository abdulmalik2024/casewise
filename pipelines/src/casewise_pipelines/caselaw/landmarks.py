"""Seed landmark pre-2016 NY property/landlord-tenant decisions.

The 10-year bulk corpus starts in late 2016, so the foundational Court of
Appeals cases attorneys cite daily (Park West, Braschi, Yellowstone…) can't
be retrieved or cited. This one-time seed pulls a curated set from
CourtListener (citation-lookup -> cluster -> opinion text) and loads them
through the normal loader, so chunking/embedding picks them up via
`embed-corpus --source caselaw`.

Usage: ingest-landmarks [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import time

import httpx
import psycopg

from .decision import Decision
from .loader import load_decisions

CL = "https://www.courtlistener.com/api/rest/v4"

# (reporter citation as it appears in our corpus style, case name, decided, topic)
LANDMARKS: list[tuple[str, str, str, str]] = [
    ("47 N.Y.2d 316", "Park West Mgt. Corp. v. Mitchell", "1979-05-08", "warranty of habitability"),
    ("74 N.Y.2d 201", "Braschi v. Stahl Assoc. Co.", "1989-07-06", "family/succession rights"),
    ("86 N.Y.2d 582", "Solow v. Wellner", "1995-11-20", "habitability — luxury building"),
    ("13 N.Y.3d 270", "Roberts v. Tishman Speyer Props.", "2009-10-22", "J-51 deregulation"),
    ("5 N.Y.3d 175", "Thornton v. Baron", "2005-07-06", "illusory tenancy / overcharge"),
    ("15 N.Y.3d 358", "Matter of Grimm v. DHCR", "2010-10-14", "overcharge fraud exception"),
    ("25 N.Y.3d 1", "Conason v. Megan Holding, LLC", "2015-02-12", "overcharge fraud"),
    ("21 N.Y.2d 630", "First Natl. Stores v. Yellowstone Shopping Ctr.", "1968-02-29", "Yellowstone injunction"),
    ("87 N.Y.2d 130", "Holy Props. v. Kenneth Cole Prods.", "1995-11-21", "no duty to mitigate (commercial)"),
    ("51 N.Y.2d 786", "Chinatown Apts. v. Chu Cho Lam", "1980-10-14", "defective termination notice"),
    ("1 N.Y.3d 117", "Domen Holding Co. v. Aranovich", "2003-11-20", "nuisance termination"),
    ("10 N.Y.3d 542", "Pultz v. Economakis", "2008-05-06", "owner-use withdrawal"),
    ("15 N.Y.3d 347", "Matter of Cintron v. Calogero", "2010-10-14", "rent reduction orders"),
    ("83 N.Y.2d 156", "Rent Stabilization Assn. v. Higgins", "1993-12-21", "succession regs upheld"),
    ("65 N.Y.2d 900", "Golub v. Frank", "1985-06-28", "nonrenewal (Golub) notice"),
    ("2 N.Y.3d 472", "Matter of ATM One v. Landaverde", "2004-06-10", "cure-notice service/timing"),
    ("72 N.Y.2d 784", "Matter of Salvati v. Eimicke", "1988-11-22", "DHCR deference / overcharge"),
    ("74 N.Y.2d 92", "Seawall Assoc. v. City of New York", "1989-06-06", "SRO takings"),
]


def _client() -> httpx.Client:
    token = os.environ.get("COURTLISTENER_API_TOKEN", "")
    headers = {"Authorization": f"Token {token}"} if token else {}
    return httpx.Client(headers=headers, timeout=60.0, follow_redirects=True)


def _get(client: httpx.Client, url: str, **params) -> dict:
    while True:
        resp = client.get(url, params=params or None)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", "30"))
            print(f"  429 — waiting {wait}s")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()


def resolve_clusters(client: httpx.Client) -> dict[str, int]:
    """citation -> cluster id via the citation-lookup endpoint.

    Chunked (the endpoint is slow on many citations) and retried on
    timeouts/429s, since this is the one unskippable step."""
    cites = [c for c, *_ in LANDMARKS]
    out: dict[str, int] = {}
    for i in range(0, len(cites), 5):
        chunk = " ".join(cites[i : i + 5])
        for attempt in range(5):
            try:
                resp = client.post(f"{CL}/citation-lookup/", data={"text": chunk}, timeout=120.0)
            except httpx.TimeoutException:
                print(f"  lookup timeout (chunk {i // 5 + 1}, try {attempt + 1}) — retrying")
                time.sleep(10)
                continue
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", "60"))
                print(f"  lookup 429 — waiting {wait}s")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            for item in resp.json():
                clusters = item.get("clusters") or []
                if item.get("status") == 200 and clusters:
                    out[item["citation"]] = clusters[0]["id"]
            break
        time.sleep(2)
    return out


def fetch_decision(client: httpx.Client, citation: str, name: str, decided: str, cluster_id: int) -> Decision | None:
    cluster = _get(client, f"{CL}/clusters/{cluster_id}/")
    sub_ops = cluster.get("sub_opinions") or []
    texts: list[str] = []
    for op_url in sub_ops[:2]:  # lead opinion (+ one concurrence/dissent at most)
        op = _get(client, op_url)
        body = op.get("plain_text") or ""
        if not body:
            import re as _re

            html = op.get("html_with_citations") or op.get("html") or ""
            body = _re.sub(r"<[^>]+>", " ", html)
            body = _re.sub(r"\s+", " ", body)
        if body.strip():
            texts.append(body.strip())
        time.sleep(1.0)
    if not texts:
        return None
    url = "https://www.courtlistener.com" + (cluster.get("absolute_url") or f"/opinion/{cluster_id}/x/")
    return Decision(
        case_name=cluster.get("case_name") or name,
        url=url,
        slip_citation=citation,
        court="New York Court of Appeals",
        decided_date=cluster.get("date_filed") or decided,
        feed_code="landmark",
        text="\n\n".join(texts)[:400_000],
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    client = _client()
    resolved = resolve_clusters(client)
    print(f"resolved {len(resolved)}/{len(LANDMARKS)} citations to clusters")

    decisions: list[Decision] = []
    for citation, name, decided, topic in LANDMARKS:
        cluster_id = resolved.get(citation)
        if not cluster_id:
            print(f"  MISS  {citation}  {name} — not resolved, skipping")
            continue
        d = fetch_decision(client, citation, name, decided, cluster_id)
        if d is None:
            print(f"  EMPTY {citation}  {name} — no opinion text")
            continue
        print(f"  OK    {citation}  {d.case_name[:50]}  ({len(d.text):,} chars) — {topic}")
        decisions.append(d)
        time.sleep(1.0)

    if args.dry_run:
        print(f"dry run: {len(decisions)} decisions ready, not loading")
        return 0
    dsn = os.environ["DATABASE_URL"]
    with psycopg.connect(dsn) as conn:
        n = load_decisions(conn, decisions)
    print(f"loaded {n} landmark decisions — now run: embed-corpus --source caselaw")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
