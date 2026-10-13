"""Semantic retrieval over the chunks table."""

from __future__ import annotations

import httpx
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from .config import settings

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"

SEARCH_SQL = """
select c.citation, c.heading, c.text, c.source_type,
       coalesce(s.source_url, d.url, a.url) as url,
       coalesce(s.active_date, d.decided_date, a.revision_date)::text as source_date,
       1 - (c.embedding <=> %(vec)s::vector) as score
from chunks c
left join statute_sections s on c.source_type = 'statute'  and s.id = c.source_id
left join case_decisions  d on c.source_type = 'case'     and d.id = c.source_id
left join agency_documents a on c.source_type in ('guidance', 'rule', 'form') and a.id = c.source_id
where c.embedding is not null
  and (%(stype)s::text is null or c.source_type = %(stype)s)
  and (
    %(as_of)s::date is null
    or c.source_type not in ('case', 'guidance')
    or (c.source_type = 'case' and d.decided_date <= %(as_of)s::date)
    or (c.source_type = 'guidance'
        and coalesce(a.revision_date, date '1900-01-01') <= %(as_of)s::date)
  )
order by c.embedding <=> %(vec)s::vector
limit %(k)s
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


def search(
    pool: ConnectionPool,
    query: str,
    k: int = 8,
    source_type: str | None = None,
    as_of: str | None = None,
) -> list[SearchResult]:
    vec = str(embed_query(query))
    with pool.connection() as conn:
        rows = conn.execute(
            SEARCH_SQL, {"vec": vec, "stype": source_type, "as_of": as_of, "k": k}
        ).fetchall()
    return [
        SearchResult(
            citation=r[0], heading=r[1], text=r[2], source_type=r[3],
            url=r[4], source_date=r[5], score=r[6],
        )
        for r in rows
    ]
