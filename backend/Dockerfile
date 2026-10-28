# syntax=docker/dockerfile:1
# Image for the API, the video worker and migrations (they differ only in their command).
# Build context: the repository root (the image includes ../ml-models), e.g.
#   docker build -f backend/Dockerfile -t secureye-api .

FROM ghcr.io/astral-sh/uv:0.12.3 AS uv

# ---------------------------------------------------------------- dependencies
FROM python:3.13.16-slim-trixie AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /app/backend
# Dependencies only (the lockfile pins CPU-only PyTorch), so code changes don't reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ---------------------------------------------------------------- runtime
FROM python:3.13.16-slim-trixie
# The app never installs packages at runtime: drop pip (and the installers bundled with Python),
# whose vendored copies of certifi, urllib3 and msgpack lag behind the app's own.
RUN python -m pip uninstall --yes --quiet pip \
    && rm -rf /usr/local/lib/python3.13/ensurepip \
    && useradd --system --uid 10001 --user-group --home-dir /app --no-create-home secureye
COPY --from=build /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENVIRONMENT=production \
    STORAGE_DIR=/data/storage \
    # Ultralytics writes a settings file; keep it out of the read-only app directory.
    YOLO_CONFIG_DIR=/tmp/ultralytics \
    # Trust X-Forwarded-For from the web container (the API isn't published directly), so
    # rate limits see the visitor's address. Narrow it if the network is shared.
    FORWARDED_ALLOW_IPS=*

WORKDIR /app/backend
COPY ml-models/*.pt /app/ml-models/
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
RUN mkdir -p /data/storage && chown secureye:secureye /data/storage

USER secureye
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4)"]
# One process: each loads both models (~1 GB). Scale out with more containers, not workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
