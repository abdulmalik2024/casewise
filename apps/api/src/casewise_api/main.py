import json
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from psycopg_pool import ConnectionPool

from .config import settings
from .rag import AskResponse, ask, ask_stream
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


app = FastAPI(title="Casewise API", version="2.0.0", lifespan=lifespan)

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
    type: str | None = Query(default=None, pattern="^(statute|case|guidance|rule|form)$"),
):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    try:
        return search(app.state.pool, q, k, source_type=type)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(503, "embedding service is at its rate limit; retry shortly")
        raise


@app.get("/ask/stream")
def ask_stream_endpoint(q: str = Query(min_length=3, max_length=500)):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    if not settings.anthropic_api_key:
        raise HTTPException(501, "answer generation not yet enabled; set ANTHROPIC_API_KEY")

    def gen():
        try:
            for event in ask_stream(app.state.pool, q):
                yield f"data: {json.dumps(event)}\n\n"
        except httpx.HTTPStatusError as e:
            msg = (
                "embedding service is at its rate limit; retry shortly"
                if e.response.status_code == 429
                else "upstream error; retry shortly"
            )
            yield f"data: {json.dumps({'type': 'error', 'message': msg})}\n\n"
        except Exception:
            yield f"data: {json.dumps({'type': 'error', 'message': 'something went wrong; retry shortly'})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class FeedbackIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    answer: str = Field(min_length=1, max_length=50_000)
    model: str | None = Field(default=None, max_length=100)
    rating: Literal["up", "down"]
    comment: str | None = Field(default=None, max_length=2000)


@app.post("/feedback", status_code=204)
def feedback_endpoint(body: FeedbackIn):
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    with app.state.pool.connection() as conn:
        conn.execute(
            "insert into answer_feedback (question, answer, model, rating, comment) values (%s, %s, %s, %s, %s)",
            (body.question, body.answer, body.model, body.rating, body.comment or None),
        )


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
