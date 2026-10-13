"""Embed corpus rows into the chunks table.

All statutes:   embed-corpus --source statutes
Case law:       embed-corpus --source caselaw
Re-embed all:   embed-corpus --source statutes --re-embed
Search check:   embed-corpus --query "warranty of habitability"
"""

from __future__ import annotations

import argparse
import os
import sys

import psycopg
from dotenv import find_dotenv, load_dotenv

from ..statutes.loader import ensure_schema
from .chunker import chunk_text
from .voyage import DEFAULT_MODEL, VoyageClient

UPSERT = """
insert into chunks (source_type, source_id, chunk_index, citation, heading, text, embedding, embed_model)
values (%s, %s, %s, %s, %s, %s, %s::vector, %s)
on conflict (source_type, source_id, chunk_index) do update set
    citation = excluded.citation,
    heading = excluded.heading,
    text = excluded.text,
    embedding = excluded.embedding,
    embed_model = excluded.embed_model
"""

SOURCES = {
    # statutes: embed only current versions; citation + heading give retrieval context
    "statutes": """
        select s.id, s.citation, s.heading, s.text
        from statute_sections s
        where s.is_current
          and ({re_embed} or not exists (
              select 1 from chunks c where c.source_type = 'statute' and c.source_id = s.id))
        order by s.id
    """,
    "caselaw": """
        select d.id, coalesce(d.slip_citation, d.case_name), d.case_name, d.text
        from case_decisions d
        where ({re_embed} or not exists (
              select 1 from chunks c where c.source_type = 'case' and c.source_id = d.id))
        order by d.id
    """,
    "dhcr": """
        select a.id, a.citation, a.title, a.text
        from agency_documents a
        where ({re_embed} or not exists (
              select 1 from chunks c where c.source_type = 'guidance' and c.source_id = a.id))
        order by a.id
    """,
}
SOURCE_TYPE = {"statutes": "statute", "caselaw": "case", "dhcr": "guidance"}


def embed_source(conn: psycopg.Connection, client: VoyageClient, source: str, re_embed: bool) -> int:
    rows = conn.execute(
        SOURCES[source].format(re_embed="true" if re_embed else "false")
    ).fetchall()
    stype = SOURCE_TYPE[source]
    written = 0
    batch: list[tuple] = []  # (source_id, chunk_index, citation, heading, text)
    for source_id, citation, heading, text in rows:
        # heading prepended so short queries match on topic, not only body text
        prefix = f"{citation} — {heading}\n" if heading else f"{citation}\n"
        for idx, chunk in enumerate(chunk_text(text)):
            batch.append((source_id, idx, citation, heading, prefix + chunk))

    for i in range(0, len(batch), 256):
        part = batch[i : i + 256]
        vectors = client.embed([p[4] for p in part], input_type="document")
        with conn.cursor() as cur:
            cur.executemany(
                UPSERT,
                [
                    (stype, sid, idx, cit, head, txt, str(vec), client.model)
                    for (sid, idx, cit, head, txt), vec in zip(part, vectors)
                ],
            )
        conn.commit()
        written += len(part)
        print(f"  embedded {written}/{len(batch)}", flush=True)
    return written


def search(conn: psycopg.Connection, client: VoyageClient, query: str, k: int = 5) -> None:
    vec = client.embed([query], input_type="query")[0]
    rows = conn.execute(
        """select citation, heading, left(text, 90), 1 - (embedding <=> %s::vector) as score
           from chunks order by embedding <=> %s::vector limit %s""",
        (str(vec), str(vec), k),
    ).fetchall()
    for citation, heading, preview, score in rows:
        print(f"{score:.3f}  {citation:22} {heading or ''}")


def main() -> int:
    load_dotenv(find_dotenv(usecwd=True))
    ap = argparse.ArgumentParser(description="Embed corpus into the chunks table")
    ap.add_argument("--source", choices=list(SOURCES), help="which corpus to embed")
    ap.add_argument("--re-embed", action="store_true", help="re-embed rows that already have chunks")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--query", help="run a semantic search against existing chunks and exit")
    args = ap.parse_args()

    api_key = os.environ.get("VOYAGE_API_KEY")
    db_url = os.environ.get("DATABASE_URL")
    if not api_key or not db_url:
        print("VOYAGE_API_KEY and DATABASE_URL must be set (see .env.example)", file=sys.stderr)
        return 2

    client = VoyageClient(api_key, model=args.model)
    with psycopg.connect(db_url) as conn:
        ensure_schema(conn)
        if args.query:
            search(conn, client, args.query)
            return 0
        if not args.source:
            print("--source or --query is required", file=sys.stderr)
            return 2
        n = embed_source(conn, client, args.source, args.re_embed)
        print(f"done: {n} chunks embedded ({args.model})")
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
