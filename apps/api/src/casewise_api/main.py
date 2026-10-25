import io
import json
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from pypdf import PdfReader

from fastapi.responses import Response

from .audit import AuditResponse, audit_text
from .auth import (
    GUEST_LIMIT,
    guest_remaining,
    record_guest_question,
    require_active,
    trial_status,
    validate_token,
)
from .memo import MemoIn, build_memo
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
    allow_origins=["http://localhost:3000", "https://casewise-bice.vercel.app", "https://casewise.si", "https://www.casewise.si"],
    allow_origin_regex=r"https://casewise-[a-z0-9]+-casewise1\.vercel\.app|http://localhost:\d+",  # preview deploys + local dev
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Guest-Remaining"],
)


from fastapi import Depends, Header, Request


def gated(user: dict = Depends(validate_token)) -> dict:
    """Signed-in + active trial/paid. 401/402 otherwise."""
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    require_active(app.state.pool, user)
    return user


GUEST_OVER_LIMIT_MSG = (
    f"You've used your {GUEST_LIMIT} free questions. Create a free account at "
    "casewise.si/signup (7-day trial, no credit card) to keep researching."
)


def _guest_identity(request: Request, x_guest_id: str | None) -> tuple[str, str]:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    guest_id = (x_guest_id or "").strip()[:64] or f"ip:{ip}"
    return guest_id, ip or "unknown"


def gated_or_guest(
    request: Request,
    authorization: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None),
) -> dict:
    """Signed-in users pass as usual; anonymous visitors get GUEST_LIMIT free
    questions, tracked server-side by browser guest id and IP."""
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    if authorization:
        user = validate_token(authorization)
        require_active(app.state.pool, user)
        return {"user": user}
    guest_id, ip = _guest_identity(request, x_guest_id)
    remaining = guest_remaining(app.state.pool, guest_id, ip)
    if remaining <= 0:
        raise HTTPException(402, GUEST_OVER_LIMIT_MSG)
    record_guest_question(app.state.pool, guest_id, ip)
    return {"guest": guest_id, "remaining": remaining - 1}


@app.get("/guest/status")
def guest_status(request: Request, x_guest_id: str | None = Header(default=None)):
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    guest_id, ip = _guest_identity(request, x_guest_id)
    return {"limit": GUEST_LIMIT, "remaining": guest_remaining(app.state.pool, guest_id, ip)}


class CheckoutIn(BaseModel):
    plan: Literal["starter", "monthly", "yearly"]


@app.post("/billing/checkout")
def billing_checkout(body: CheckoutIn, user: dict = Depends(validate_token)):
    # validate_token, not gated: an expired trial must still be able to upgrade
    from .billing import create_checkout

    return {"url": create_checkout(user, body.plan)}


@app.post("/billing/webhook")
async def billing_webhook(request: Request):
    from .billing import handle_event, verify_webhook

    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    payload = await request.body()
    event = verify_webhook(payload, request.headers.get("stripe-signature"))
    handle_event(app.state.pool, event)
    return {"received": True}


@app.get("/me")
def me_endpoint(user: dict = Depends(validate_token)):
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    status = trial_status(app.state.pool, user["id"])
    return {"email": user.get("email"), **status}


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/search", response_model=list[SearchResult])
def search_endpoint(
    q: str = Query(min_length=3, max_length=500),
    k: int = Query(default=8, ge=1, le=25),
    type: str | None = Query(default=None, pattern="^(statute|case|guidance|rule|form)$"),
    user: dict = Depends(gated),
):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    try:
        return search(app.state.pool, q, k, source_type=type)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(503, "embedding service is at its rate limit; retry shortly")
        raise


class HistoryTurn(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=50_000)


class AskStreamIn(BaseModel):
    q: str = Field(min_length=3, max_length=500)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=6)
    as_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


def _stream_response(q: str, history: list[dict] | None, as_of: str | None = None, caller: dict | None = None):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    if not settings.anthropic_api_key:
        raise HTTPException(501, "answer generation not yet enabled; set ANTHROPIC_API_KEY")

    def gen():
        try:
            for event in ask_stream(app.state.pool, q, history, as_of):
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

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    if caller and "guest" in caller:
        headers["X-Guest-Remaining"] = str(caller["remaining"])
    return StreamingResponse(gen(), media_type="text/event-stream", headers=headers)


@app.get("/ask/stream")
def ask_stream_get(q: str = Query(min_length=3, max_length=500), caller: dict = Depends(gated_or_guest)):
    return _stream_response(q, None, caller=caller)


@app.post("/ask/stream")
def ask_stream_post(body: AskStreamIn, caller: dict = Depends(gated_or_guest)):
    history = [t.model_dump() for t in body.history]
    return _stream_response(body.q, history or None, body.as_of, caller=caller)


class DraftIn(BaseModel):
    issue: str = Field(min_length=10, max_length=500)
    facts: str = Field(min_length=50, max_length=12_000)
    as_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


@app.post("/draft/stream")
def draft_stream_endpoint(body: DraftIn, user: dict = Depends(gated)):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    if not settings.anthropic_api_key:
        raise HTTPException(501, "answer generation not yet enabled; set ANTHROPIC_API_KEY")

    from .draft import draft_stream

    def gen():
        try:
            for event in draft_stream(app.state.pool, body.issue, body.facts, body.as_of):
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


class CasePrepIn(BaseModel):
    dispute: str = Field(min_length=10, max_length=500)
    facts: str = Field(min_length=50, max_length=12_000)
    objective: Literal[
        "evaluate-claim", "assess-defenses", "prepare-motion", "pre-litigation"
    ] = "evaluate-claim"
    scenario: str | None = Field(default=None, min_length=10, max_length=500)
    as_of: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


@app.post("/caseprep/stream")
def caseprep_stream_endpoint(body: CasePrepIn, user: dict = Depends(gated)):
    if app.state.pool is None or not settings.voyage_api_key:
        raise HTTPException(503, "search is not configured (DATABASE_URL / VOYAGE_API_KEY)")
    if not settings.anthropic_api_key:
        raise HTTPException(501, "answer generation not yet enabled; set ANTHROPIC_API_KEY")

    from .caseprep import caseprep_stream

    def gen():
        try:
            for event in caseprep_stream(
                app.state.pool, body.dispute, body.facts, body.objective, body.as_of, body.scenario
            ):
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


class AuditIn(BaseModel):
    text: str = Field(min_length=50, max_length=300_000)


@app.post("/audit", response_model=AuditResponse)
def audit_endpoint(body: AuditIn, user: dict = Depends(gated)):
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    return audit_text(app.state.pool, body.text)


MAX_PDF_BYTES = 15_000_000
MAX_DOCX_BYTES = 10_000_000
MAX_PDF_PAGES = 300
MAX_AUDIT_CHARS = 300_000


async def _read_capped(file: UploadFile, cap: int) -> bytes:
    """Stream the upload, rejecting at the cap instead of buffering past it."""
    chunks: list[bytes] = []
    size = 0
    while chunk := await file.read(1 << 20):
        size += len(chunk)
        if size > cap:
            raise HTTPException(413, f"file too large (limit {cap // 1_000_000}MB)")
        chunks.append(chunk)
    return b"".join(chunks)


@app.post("/audit/pdf", response_model=AuditResponse)
async def audit_file_endpoint(file: UploadFile, user: dict = Depends(gated)):
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    name = (file.filename or "").lower()
    if name.endswith(".docx"):
        data = await _read_capped(file, MAX_DOCX_BYTES)
        try:
            from docx import Document as DocxDocument

            doc = DocxDocument(io.BytesIO(data))
            text = "\n".join(p.text for p in doc.paragraphs)
        except Exception:
            raise HTTPException(422, "could not read this Word document")
    elif name.endswith(".pdf"):
        data = await _read_capped(file, MAX_PDF_BYTES)
        try:
            reader = PdfReader(io.BytesIO(data))
            if len(reader.pages) > MAX_PDF_PAGES:
                raise HTTPException(413, f"PDF too long (limit {MAX_PDF_PAGES} pages)")
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, "could not read this PDF")
    else:
        raise HTTPException(415, "upload a .pdf or .docx file")
    if len(text.strip()) < 50:
        raise HTTPException(
            422,
            "no extractable text found. If this is a scanned document, "
            "OCR isn't supported yet; paste the text instead",
        )
    return audit_text(app.state.pool, text[:MAX_AUDIT_CHARS])


@app.post("/memo")
def memo_endpoint(body: MemoIn, user: dict = Depends(gated)):
    docx_bytes = build_memo(body)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="casewise-memo.docx"'},
    )


class FeedbackIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    answer: str = Field(min_length=1, max_length=50_000)
    model: str | None = Field(default=None, max_length=100)
    rating: Literal["up", "down"]
    comment: str | None = Field(default=None, max_length=2000)


@app.post("/feedback", status_code=204)
def feedback_endpoint(body: FeedbackIn, user: dict = Depends(validate_token)):
    if app.state.pool is None:
        raise HTTPException(503, "database is not configured")
    with app.state.pool.connection() as conn:
        conn.execute(
            "insert into answer_feedback (question, answer, model, rating, comment) values (%s, %s, %s, %s, %s)",
            (body.question, body.answer, body.model, body.rating, body.comment or None),
        )


@app.get("/ask", response_model=AskResponse)
def ask_endpoint(q: str = Query(min_length=3, max_length=500), caller: dict = Depends(gated_or_guest)):
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
