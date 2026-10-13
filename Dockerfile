# Casewise API image — built from the repo root (railway up uploads the git
# root, so the build context is the monorepo; see railway.json).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1

COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/ .
RUN uv sync --frozen --no-dev

CMD ["sh", "-c", "uv run uvicorn casewise_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
