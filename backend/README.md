# Secureye API

FastAPI backend for Secureye.

## Requirements

- [uv](https://docs.astral.sh/uv/) (installs Python 3.13 automatically)
- Docker (for PostgreSQL, Redis and Mailpit)

## Quick start

```bash
# from the repository root
docker compose up -d --wait          # postgres :5433, redis :6379, mailpit :1025 / UI :8025

# from backend/
cp .env.example .env
uv sync                              # creates .venv with Python 3.13 + dev tools
uv run alembic upgrade head          # apply migrations
uv run uvicorn app.main:app --reload # http://localhost:8000/docs

# video jobs run in a separate worker (second terminal)
uv run celery -A app.workers.celery_app worker --loglevel=info --pool=solo   # Windows
uv run celery -A app.workers.celery_app worker --loglevel=info --concurrency=1  # Linux/macOS
# ...or skip the worker and process videos inside the API: JOB_RUNNER=inline JOB_EVENTS_BACKEND=memory

# optional: an admin account (for /admin)
uv run python -m app.cli create-superuser --email admin@example.com --name "Admin"
```

Emails (activation, password reset, password changed) are delivered to Mailpit in development:
open http://localhost:8025.

## Everyday commands

| Task | Command |
|---|---|
| Run tests (needs `docker compose up -d db redis`) | `uv run pytest` |
| Fast tests (skip the real models) | `uv run pytest -m "not ml"` |
| Tests + coverage | `uv run pytest --cov` |
| Lint / autofix | `uv run ruff check . --fix` |
| Format | `uv run ruff format .` |
| Type-check | `uv run mypy` |
| New migration | `uv run alembic revision --autogenerate -m "describe change"` |
| Apply migrations | `uv run alembic upgrade head` |
| Export the OpenAPI schema for the frontend | `uv run python -m app.cli export-openapi ../frontend/openapi.json` (or `npm run api:generate` in `frontend/`) |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness: the process is up |
| GET | `/api/v1/health/ready` | Readiness: database reachable (503 otherwise) |
| POST | `/api/v1/auth/signup` | Create an inactive account, email an activation link |
| POST | `/api/v1/auth/activate` | Activate with `{uid, token}` from the link |
| POST | `/api/v1/auth/activate/resend` | Resend the activation email (always 202) |
| POST | `/api/v1/auth/login` | Access token in the body, refresh token as an httpOnly cookie |
| POST | `/api/v1/auth/refresh` | Rotate the refresh cookie, get a new access token |
| POST | `/api/v1/auth/logout` | Revoke the session, clear the cookie |
| POST | `/api/v1/auth/password-reset` | Email a reset link (always 202) |
| POST | `/api/v1/auth/password-reset/confirm` | Set a new password; signs out every session |
| GET | `/api/v1/users/me` | The signed-in user (`Authorization: Bearer <access token>`) |
| POST | `/api/v1/images` | Detect threats in an uploaded image (multipart field `image`) |
| GET | `/api/v1/images` | Your past image detections, newest first (`limit`, `offset`) |
| GET | `/api/v1/images/{id}` | One detection |
| DELETE | `/api/v1/images/{id}` | Delete a detection and its files |
| POST | `/api/v1/videos` | Upload a video (multipart field `video`); returns the queued job (202) |
| GET | `/api/v1/videos` | Your video jobs, newest first |
| GET | `/api/v1/videos/{id}` | Job status plus tracked objects (with clip links) |
| GET | `/api/v1/videos/{id}/events` | Live progress and preview frames (Server-Sent Events) |
| POST | `/api/v1/videos/{id}/cancel` | Stop a queued or running job |
| DELETE | `/api/v1/videos/{id}` | Delete a finished job, its video and clips |
| WS | `/api/v1/live/ws` | Live detection stream (browser or server camera), see below |
| GET | `/api/v1/live/cameras` | Server cameras you can pick (id and name) |
| GET | `/api/v1/live/sessions` | Your live sessions, newest first |
| GET | `/api/v1/live/sessions/{id}` | A session's report rows (objects first seen, with clip links) |
| DELETE | `/api/v1/live/sessions/{id}` | Delete a finished session and its clips |
| GET/POST/DELETE | `/api/v1/live/admin/cameras` | Manage server cameras (superuser) |
| GET | `/api/v1/files/{key}` | Download a stored file through a signed, expiring link |
| GET | `/docs` | Swagger UI (disabled in production) |

All errors share one JSON shape: `{"detail": ..., "code": "<machine_code>"}`.

## How authentication works

- **Passwords** are hashed with Argon2id. Rules match the original app (8+ characters, no
  whitespace) plus Django's server-side checks (not common, not all digits, not similar to name or
  email).
- **Access tokens** are short-lived JWTs (15 min) sent as `Authorization: Bearer …`.
- **Refresh tokens** are random strings in an `httpOnly; SameSite=Lax` cookie scoped to
  `/api/v1/auth`. The database stores only their SHA-256 hash. Each refresh rotates the token; replaying an
  already-used token revokes that whole login session (theft detection). Clients should send one refresh request at
  a time, since two parallel refreshes with the same cookie look like a replay.
- **Activation / reset links** carry a signed, expiring token bound to a fingerprint of the
  account state (password hash, active flag, last login), so each link works once and nothing
  needs to be stored.
- **Rate limits** (per client IP, per endpoint, stored in Redis): signup 5/min, login 10/min,
  password reset 5/min, activation resend 3/min, activation/reset confirm 10/min, refresh 30/min,
  image uploads 30/min, video uploads 10/min.
  Exceeding one returns 429 with `Retry-After`.

## How image detection works

1. The upload is read with a size cap (15 MB) and **decoded** with Pillow to validate it: JPEG,
   PNG, WebP or BMP; at most 50 MP (blocks decompression bombs). The filename and
   Content-Type are not trusted, and the EXIF rotation is applied so phone photos aren't sideways.
2. `bestM` runs in a worker thread (the event loop never blocks) with the original thresholds,
   confidence 0.2 and IoU 0.3. A capacity limiter keeps inferences from piling up and competing for the CPU.
3. Boxes are drawn with the **original app's colors and style** (`app/ml/annotate.py`).
4. The original and the annotated JPEG are stored under `storage/images/<user>/<uuid>/`.
   The result row is saved per user (`image_detections`).
5. The response includes the detections plus **signed links** to both images. `<img src>` can't
   send an `Authorization` header, so files are served from `/files/…?expires=…&signature=…`
   (HMAC-SHA256, 1 h validity), the same approach as S3 presigned URLs.

The models load once at startup and run one warm-up inference (about 10 s on CPU), so the first request
isn't slow. Ultralytics is forced offline (`YOLO_OFFLINE`, `YOLO_AUTOINSTALL=false`): the server
never sends analytics, probes connectivity, or pip-installs packages at runtime.

## How video detection works

```
POST /videos ──► stream upload to disk (≤ 500 MB) ──► probe with FFmpeg (real video? ≤ 10 min, ≤ 4K)
             ──► store + video_jobs row (queued) ──► Celery task (Redis) ──► 202 {job}

Celery worker: decode (PyAV) ─► sample 10 fps by timestamp ─► bestM (conf 0.5, IoU 0.6,
               agnostic NMS) ─► ByteTrack (one tracker per job) ─► per-track H.264 clip
               └─► every analysed frame: progress + annotated preview ─► Redis pub/sub
                                                                          │
GET /videos/{id}/events (SSE) ◄─────────────────────────────────────────┘
```

- **One tracker per job.** The original `model.track(persist=True)` kept tracker state on the shared
  model, and one global processor plus a global results table served everyone. Here each job has
  its own tracker, its numbering starts at 1, and results belong to the uploader.
- **Reliable jobs.** Processing runs in a worker, not inside a request: closing the browser doesn't
  stop it, and a worker crash leads to redelivery (`acks_late`). Anything that escapes the runner
  still marks the job failed, so the progress stream always ends.
- **Progress stream.** Late or reconnecting clients first get the current status and progress.
  If the stream goes quiet, the API re-checks the database so it never hangs on a dead job. The SSE
  endpoint needs `Authorization: Bearer`, so browsers use a fetch-based SSE client
  (`EventSource` can't send headers).
- **Clips** are H.264/yuv420p MP4 with `faststart`, so browsers can play them (the old `mp4v`
  clips couldn't be played in a browser).
- Measured on this machine (CPU): a 6 s 1280×720 video takes about 39 s (≈ 0.65 s per analysed frame).

## How live detection works

One WebSocket per session (full protocol in `app/api/live_socket.py`):

1. The client connects and sends `{"type": "start", "token": "<access token>", "source": "browser"}`
   (or `"source": "camera", "camera_id": N`). The token goes in the first message, not the URL, so it never
   lands in access logs. It must arrive within 10 s. Connections from origins outside
   `CORS_ORIGINS` are refused, which guards against cross-site WebSocket hijacking.
2. **Browser source (default):** the client sends camera frames as binary JPEGs. The server answers with
   `detections` JSON (track ids, classes, boxes) and the browser draws its own overlay, so only
   small JSON travels back. **Server camera:** an admin-registered device index or stream URL is read
   in a background thread, and the server also sends the annotated JPEG.
3. Each newly seen object produces one `new_object` message (the report row and the alert sound) and a
   `live_events` row. Each tracked object gets a clip of annotated frames, filed by date as in the
   original (`live/<user>/<session>/<YYYY-MM-DD>/<hhmmssam>_track_<id>_<class>.mp4`).
4. **Only the newest frame is analysed.** Frames arriving while the model is busy are dropped and
   counted, so latency never builds up.
5. Sessions end on `{"type": "stop"}`, disconnect, end of the source, or a 60-minute limit; the session
   is always saved. Each user can have 2 concurrent sessions.

Live detection uses `bestS` with confidence 0.4 (as before) and **IoU 0.45**. The original 0.0 discarded
any overlapping same-class objects, about 12% fewer detections on our test footage.

Measured on this machine (CPU): about 250 ms per frame with `bestS`, so a browser session runs at about
4 analysed frames per second.

## Docker

`Dockerfile` builds one image for the API, the worker and migrations (build context: the repository root, so
the model weights are included); `docker-compose.yml` runs them with the web app:
`docker compose --profile app up --build`. The image runs as a non-root user, without pip, logs
JSON, and holds both models in memory (about 1 GB per API or worker process).

## Admin site

`/admin` (also through the frontend's dev server) is a superuser-only admin built with SQLAdmin:
users, image detections, video jobs and tracks, live sessions and events, and cameras. Sign in with
a superuser's email and password (the form calls it "Username"). Create one with
`uv run python -m app.cli create-superuser`. Records with stored files are read-only there; delete
them through the app so their files go too. Turn it off with `ADMIN_ENABLED=false`.

## Security and operations

- **Request IDs.** Every response has an `X-Request-ID` (a caller's own ID is kept if it looks
  sane, e.g. from a load balancer). It's on every log line for that request, on the access log line
  (`request`: method, path, status, duration), in the body of 500 errors, and it travels with video
  jobs into the worker's log lines.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Cross-Origin-Opener-Policy: same-origin`; a Content-Security-Policy that blocks everything on API
  responses and allows only the admin's own files on `/admin`; HSTS in production. The web app's
  own headers (CSP, `Permissions-Policy` for the camera) are set by its Nginx
  (`frontend/nginx/security-headers.conf`).
- **CORS** allows only the origins in `CORS_ORIGINS`, only GET/POST/DELETE, and only the headers
  the web app sends. The live-detection WebSocket checks the same origins.
- **Behind a reverse proxy**, uvicorn must trust the proxy's `X-Forwarded-For`, or rate limits
  see the proxy's address instead of each visitor's. The Docker image runs with
  `--proxy-headers` and `FORWARDED_ALLOW_IPS=*`, which is safe there because the API container
  isn't published, only reachable through the web container, and that container's Nginx *replaces*
  any `X-Forwarded-For` a visitor sends with the address it sees (appending would let a visitor pick
  the address the rate limits count). Narrow it if the network is shared; behind another proxy, set
  up Nginx's realip module first.
- **Audits** (CI runs all of them on every push):

  | Check | Command | Result (2026-10-21) |
  |---|---|---|
  | Container images | Trivy, fixable HIGH/CRITICAL | none (after removing pip from the runtime image: its vendored certifi, urllib3 and msgpack were flagged) |
  | Known vulnerabilities in dependencies | `uv run --with pip-audit pip-audit` | none; `torch`/`torchvision` (+cpu builds from the PyTorch index) checked against OSV separately: none |
  | Static security analysis | `uvx bandit -r app` | none (2 reviewed false positives marked `# nosec`) |
  | Frontend dependencies | `npm audit` (in `frontend/`) | none |

## Layout

```
app/
├─ main.py        app factory + lifespan
├─ admin.py       superuser admin site (SQLAdmin)
├─ cli.py         management commands (create-superuser, export-openapi)
├─ core/          settings, logging, errors, security, password policy, rate limiting,
│                 request-ID / security-header middleware
├─ db/            engine/session, declarative base, model registry for Alembic
├─ models/        SQLAlchemy models
├─ schemas/       Pydantic request/response models
├─ ml/            detector, tracker, drawing, video + live pipelines (no HTTP or DB code)
├─ services/      business logic (auth, email, image/video detection, storage, job events/queue)
├─ workers/       Celery app + the video job runner
├─ templates/     email templates (HTML + text)
└─ api/           dependencies + v1 routers
alembic/          migrations (async)
tests/            unit/ (no I/O) · api/ (HTTP against PostgreSQL, fake detector) ·
                  ml/ (real weights, incl. parity with the old app) · migrations · CLI
```
