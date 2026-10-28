# Dependencies

Every dependency is pinned by a lockfile: `backend/uv.lock` (uv), and `frontend/package-lock.json`
and `e2e/package-lock.json` (npm). The frontend pins exact versions in `package.json` as well.

## Backend (`backend/pyproject.toml`)

Python 3.13 (`requires-python = ">=3.13,<3.14"`).

| Package | Used for |
|---|---|
| `fastapi` | Web framework: REST endpoints, Server-Sent Events, WebSocket, OpenAPI schema |
| `uvicorn[standard]` | ASGI server (with WebSocket support) |
| `pydantic`, `pydantic-settings` | Request and response models; settings from environment variables |
| `sqlalchemy[asyncio]`, `asyncpg` | Async ORM and the PostgreSQL driver |
| `alembic` | Database migrations |
| `structlog` | Structured logs (JSON in production) with request IDs |
| `pyjwt` | Access tokens |
| `pwdlib[argon2]` | Argon2id password hashing |
| `aiosmtplib`, `jinja2` | Sending email; the HTML and text email templates |
| `email-validator` | Email address validation in Pydantic models |
| `limits` | Rate limiting, with counters in Redis (through the `redis` client) |
| `torch`, `torchvision` | PyTorch, the CPU builds from the PyTorch index (no multi-GB CUDA downloads) |
| `ultralytics` | YOLOv8 inference and the ByteTrack tracker |
| `lap` | Assignment solver used by Ultralytics' tracker |
| `opencv-python-headless` | Image processing and drawing (the version without GUI libraries, for servers) |
| `pillow` | Decoding and validating uploaded images |
| `numpy` | Arrays shared by the ML libraries |
| `av` (PyAV) | Reading videos and writing the H.264 clips (bundles FFmpeg) |
| `celery[redis]`, `redis` | Background video jobs; progress events over Redis pub/sub; the rate limiter's Redis connection (the project's only Redis client) |
| `python-multipart` | Multipart form parsing for uploads |
| `sqladmin[auth]` | The superuser admin site |

Two of Ultralytics' own dependencies are left out on purpose (`override-dependencies` in
`pyproject.toml`): `opencv-python`, the GUI build, which needs X11/GL libraries that servers
don't have (`opencv-python-headless` provides the same `cv2`); and `polars` (~180 MB), which
Ultralytics only imports for training, benchmarks and plots, none of which Secureye uses.

**Development group** (`uv sync` installs it; the Docker image doesn't):

| Package | Used for |
|---|---|
| `pytest`, `pytest-asyncio`, `pytest-cov` | Tests, async tests, coverage |
| `httpx`, `httpx2` | The async test client; `httpx2` is what Starlette's `TestClient` uses for the WebSocket tests |
| `ruff` | Linting and formatting |
| `mypy`, `celery-types` | Strict type checking, with type stubs for Celery |
| `pre-commit` | Git hooks |

## Frontend (`frontend/package.json`)

Node.js 22.12 or newer.

| Package | Used for |
|---|---|
| `react`, `react-dom` | UI (React 19) |
| `react-router` | Routing (data mode, lazy-loaded pages) |
| `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled` | Components and icons (MUI 9; Emotion is its styling engine) |
| `@fontsource/montserrat` | The original app's font, served by the app itself rather than a font CDN |
| `@tanstack/react-query` | Server state: caching, loading and error states |
| `zustand` | The session store (user and access token, in memory) |
| `openapi-fetch` | Typed API client, using types generated from the backend's schema |
| `react-hook-form`, `zod`, `@hookform/resolvers` | Forms and validation (the original app's rules) |
| `jspdf`, `jspdf-autotable` | PDF reports, generated in the browser |
| `react-compare-slider` | The before/after slider on the home page |

**Development:**

| Package | Used for |
|---|---|
| `vite`, `@vitejs/plugin-react` | Dev server and production build |
| `typescript`, `@types/react`, `@types/react-dom`, `@types/node` | Type checking |
| `vitest`, `@vitest/coverage-v8`, `jsdom` | Tests, coverage, a browser-like environment |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | Component tests |
| `msw` | Mocking the API in tests |
| `openapi-typescript` | Generating `schema.d.ts` from `openapi.json` |
| `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-jsx-a11y`, `globals` | Linting, including accessibility rules |
| `prettier` | Formatting |

## End-to-end tests (`e2e/package.json`)

| Package | Used for |
|---|---|
| `@playwright/test` | Browser tests (Chromium) |
| `typescript`, `@types/node` | Type checking the tests |
| `prettier` | Formatting |

## Containers and services

| Image | Used for |
|---|---|
| `python:3.13.16-slim-trixie` | Backend image (API, worker, migrations), with `ghcr.io/astral-sh/uv:0.12.3` at build time |
| `node:24.22-alpine3.24` | Builds the web app |
| `nginxinc/nginx-unprivileged:1.30-alpine3.24` | Serves the web app and proxies the API (non-root) |
| `postgres:18-alpine` | Database |
| `redis:8-alpine` | Celery broker, progress events, rate-limit counters |
| `axllent/mailpit:v1.31` | Catches outgoing email in development and the default Docker setup |

## Checking for vulnerabilities

```bash
cd backend && uv run --with pip-audit pip-audit       # Python packages
cd backend && uvx bandit -r app -q                    # Python code
cd frontend && npm audit                              # npm packages (also in e2e/)
```

CI runs these on every push, and scans both Docker images with Trivy.
