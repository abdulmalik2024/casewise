from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg_pool import ConnectionPool

from .config import settings
from .rag import AskResponse, ask
from .retrieval import SearchResult, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = None
    if settings.database_url:
        pool = ConnectionPool(settings.database_url, min_size=1, max_size=5, open=True)
    app.state.pool = pool
    yield
    if pool:
        pool.close()


app = FastAPI(title="Casewise API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://casewise-bice.vercel.app"],
    allow_origin_regex=r"https://casewise-[a-z0-9]+-casewise1\.vercel\.app",  # preview deploys
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/search", response_model=list[SearchResult])
def search_endpoint(
    q: str = Query(min_length=3, max_length=500),
    k: int = Query(default=8, ge=1, le=25),
    type: str | None = Query(default=None, pattern="^(statute|case|guidance)$"),
):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    try:
        return search(app.state.pool, q, k, source_type=type)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(503, "embedding service is at its rate limit; retry shortly")
        raise


@app.get("/ask", response_model=AskResponse)
def ask_endpoint(q: str = Query(min_length=3, max_length=500)):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    if not settings.anthropic_api_key:
        raise HTTPException(501, "answer generation not yet enabled; set ANTHROPIC_API_KEY")
    try:
        return ask(app.state.pool, q)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(503, "embedding service is at its rate limit; retry shortly")
        raise
