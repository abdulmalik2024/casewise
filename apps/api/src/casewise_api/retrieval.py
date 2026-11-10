"""Semantic retrieval over the chunks table.

Quoted phrases in the query ("…") additionally require a literal, case-insensitive
match in the section text — attorneys argue from exact statutory language, and
vector similarity alone is weak at exact wording. If the literal filter matches
nothing, we fall back to pure semantic search rather than returning nothing.
"""

from __future__ import annotations

import re

import httpx
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from .config import settings

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"

PHRASE_RE = re.compile(r'[""]([^""\n]{2,100})[""]|"([^"\n]{2,100})"')

# The inner query runs over chunks alone so the planner can order through the
# HNSW index (joins push it onto a full scan of all 32k rows); the source-table
# joins for url/date happen only for the k winners. The as_of conditions are
# EXISTS subqueries for the same reason.
SEARCH_SQL = """
with top as (
  select c.citation, c.heading, c.text, c.source_type, c.source_id,
         c.embedding <=> %(vec)s::vector as dist
  from chunks c
  where c.embedding is not null
    and (%(stype)s::text is null or c.source_type = %(stype)s)
    and (
      %(as_of)s::date is null
      or c.source_type not in ('case', 'guidance')
      or (c.source_type = 'case' and exists (
            select 1 from case_decisions d
            where d.id = c.source_id and d.decided_date <= %(as_of)s::date))
      or (c.source_type = 'guidance' and exists (
            select 1 from agency_documents a
            where a.id = c.source_id
              and coalesce(a.revision_date, date '1900-01-01') <= %(as_of)s::date))
    )
    {phrase_filter}
  order by c.embedding <=> %(vec)s::vector
  limit %(k)s
)
select t.citation, t.heading, t.text, t.source_type,
       coalesce(s.source_url, d.url, a.url) as url,
       coalesce(s.active_date, d.decided_date, a.revision_date)::text as source_date,
       1 - t.dist as score
from top t
left join statute_sections s on t.source_type = 'statute'  and s.id = t.source_id
left join case_decisions  d on t.source_type = 'case'     and d.id = t.source_id
left join agency_documents a on t.source_type in ('guidance', 'rule', 'form') and a.id = t.source_id
order by t.dist
"""


class SearchResult(BaseModel):
    citation: str
    heading: str | None
    text: str
    source_type: str
    url: str | None
    source_date: str | None = None
    score: float


def embed_query(text: str) -> list[float]:
    resp = httpx.post(
        VOYAGE_URL,
        headers={"Authorization": f"Bearer {settings.voyage_api_key}"},
        json={"input": [text], "model": settings.voyage_model, "input_type": "query"},
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def _extract_phrases(query: str) -> list[str]:
    return [a or b for a, b in PHRASE_RE.findall(query)][:3]


def search(
    pool: ConnectionPool,
    query: str,
    k: int = 8,
    source_type: str | None = None,
    as_of: str | None = None,
) -> list[SearchResult]:
    vec = str(embed_query(query))
    params: dict = {"vec": vec, "stype": source_type, "as_of": as_of, "k": k}
    filters = []
    for i, ph in enumerate(_extract_phrases(query)):
        escaped = ph.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        params[f"ph{i}"] = f"%{escaped}%"
        filters.append(f"and c.text ilike %(ph{i})s")
    with pool.connection() as conn:
        # With the HNSW index on chunks.embedding, a plain index scan stops after
        # ef_search candidates; phrase/type/as_of filters can then leave fewer than
        # k rows. Iterative scan keeps fetching until the limit is satisfied.
        conn.execute("set local hnsw.iterative_scan = 'relaxed_order'")
        if filters:
            # For phrase queries the planner prefers a seq scan that ILIKEs the
            # whole corpus (~10s). Force the index: quoted phrases come from the
            # user's own query, so matching texts sit among the nearest vectors.
            # Cap the crawl so a phrase with no matches fails fast (~1s) into
            # the semantic fallback below instead of scanning 20k tuples.
            conn.execute("set local hnsw.max_scan_tuples = 2000")
            conn.execute("set local enable_seqscan = off")
        rows = conn.execute(
            SEARCH_SQL.format(phrase_filter=" ".join(filters)), params
        ).fetchall()
        if not rows and filters:  # phrase not in corpus verbatim — semantic fallback
            rows = conn.execute(
                SEARCH_SQL.format(phrase_filter=""),
                {"vec": vec, "stype": source_type, "as_of": as_of, "k": k},
            ).fetchall()
    return [
        SearchResult(
            citation=r[0], heading=r[1], text=r[2], source_type=r[3],
            url=r[4], source_date=r[5], score=r[6],
        )
        for r in rows
    ]
