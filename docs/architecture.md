# Architecture

How Secureye is put together: the components, the folder structure, the data model and the main
flows.

## Overview

```
                      ┌───────────────────────────── Browser ─────────────────────────────┐
                      │ React 19 + TypeScript + MUI 9                                     │
                      │ TanStack Query (server state) · Zustand (session) · React Router  │
                      └──────┬──────────────────────┬─────────────────────┬───────────────┘
                     REST (JSON, multipart)     SSE (video job)     WebSocket (live)
                             │                      │                     │
                      ┌──────▼──────────────────────▼─────────────────────▼───────────────┐
                      │ Nginx: serves the web app, forwards /api and /admin               │
                      │ FastAPI (Uvicorn, ASGI)                                           │
                      │  api/v1: auth · users · images · videos · live · files · health   │
                      │  services: auth · email · storage · image/video/live detection    │
                      │  ml: model registry (bestM, bestS) · detector · per-session tracker│
                      └──┬───────────────┬──────────────────┬─────────────────┬───────────┘
                         │               │                  │                 │
                  ┌──────▼─────┐  ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼───────┐
                  │ PostgreSQL │  │    Redis    │   │   Storage    │   │ SMTP (Mailpit│
                  │ users, jobs│  │ broker,     │   │ local disk,  │   │ in dev)      │
                  │ detections │  │ pub/sub,    │   │ S3-shaped    │   └──────────────┘
                  └────────────┘  │ rate limits │   │ interface    │
                                  └──────┬──────┘   └───────▲──────┘
                                         │                  │
                                  ┌──────▼──────────────────┴──────┐
                                  │ Celery worker (video jobs)     │
                                  │ YOLO bestM + ByteTrack, PyAV   │
                                  └────────────────────────────────┘
```

| Component | Role |
|---|---|
| Web app (`frontend/`) | Single-page app. In production Nginx serves it and forwards `/api` (HTTP, SSE, WebSocket) and `/admin` to the API, so the browser talks to one origin. |
| API (`backend/app`) | REST endpoints, the video progress stream, the live WebSocket and the admin site. Loads both models at startup and runs image and live inference in a bounded thread pool, so the event loop never blocks. |
| Worker (`backend/app/workers`) | Celery worker that processes uploaded videos. Same image and code as the API, started with a different command. |
| PostgreSQL | Users, sessions (refresh tokens), detections, jobs, tracks, live sessions and events, cameras. |
| Redis | Celery's queue, video progress events (pub/sub), rate-limit counters. |
| Storage | Uploads, annotated images and clips on disk (`STORAGE_DIR`), served through signed, expiring links. |
| Mailpit | Catches outgoing email in development and the default Docker setup. |

## Folder structure

```
.
├─ backend/                     FastAPI app, Celery worker, migrations, tests
│  ├─ app/
│  │  ├─ main.py                app factory and lifespan (loads the models once)
│  │  ├─ admin.py               superuser admin site (SQLAdmin)
│  │  ├─ cli.py                 create-superuser, export-openapi
│  │  ├─ api/
│  │  │  ├─ deps.py             dependencies: database session, current user, services
│  │  │  ├─ uploads.py          reads multipart uploads with a hard size cap
│  │  │  ├─ live_socket.py      the live-detection WebSocket protocol
│  │  │  └─ v1/                 routers: auth, users, images, videos, live, files, health
│  │  ├─ core/                  settings, logging, errors, security (JWT, hashing, signed
│  │  │                         tokens), password policy, rate limiting, middleware
│  │  ├─ db/                    async engine and session, declarative base, model registry
│  │  ├─ models/                SQLAlchemy models
│  │  ├─ schemas/               Pydantic request and response models
│  │  ├─ services/              business logic: auth, email, storage, image detection,
│  │  │                         video jobs, job queue and events, live sessions
│  │  ├─ ml/                    model registry, detector, tracking, drawing, video and live
│  │  │                         pipelines (no HTTP or database code)
│  │  ├─ workers/               Celery app and the video job runner
│  │  └─ templates/email/       activation, password reset and password changed (HTML + text)
│  ├─ alembic/                  migrations
│  ├─ tests/                    unit/, api/, ml/ and integration tests
│  ├─ Dockerfile                image for the API, the worker and migrations
│  ├─ pyproject.toml, uv.lock   dependencies and tool settings
│  └─ .env.example
├─ frontend/                    React app
│  ├─ src/
│  │  ├─ main.tsx               mounts the providers and the router
│  │  ├─ app/                   providers, theme, routes, root layout, auth guard, error and 404 pages
│  │  ├─ shared/api/            generated API types, typed client (token and silent refresh), SSE reader
│  │  ├─ shared/auth/           session store and lifecycle (restore, login, logout)
│  │  ├─ shared/ui/             header, navbar, footer, page title, headings, loading and message cards
│  │  ├─ features/              home, auth, image, video, live; detection/ holds what the three
│  │  │                         detection pages share (frames, report table, history, PDF, clips)
│  │  ├─ assets/                images (WebP) and the alert sound
│  │  └─ test/                  Vitest setup and the MSW mock API
│  ├─ nginx/                    production Nginx config and security headers
│  ├─ scripts/                  API type generation
│  ├─ openapi.json              the backend's API schema (generated, committed)
│  └─ Dockerfile                builds the app and serves it with Nginx
├─ e2e/                         Playwright end-to-end tests and their fixtures
├─ ml-models/                   bestM.pt, bestS.pt (Git LFS) and the model card
├─ docs/                        this documentation and the screenshots
├─ .github/workflows/ci.yml     continuous integration
├─ docker-compose.yml           development services; the whole app with --profile app
├─ .env.example                 settings for the Docker setup
└─ .pre-commit-config.yaml      Git hooks
```

**Backend rules:** routers handle HTTP only and delegate to services; services don't import
FastAPI; `ml/` has no database or HTTP code, so it can be tested on its own.

**Frontend rules:** `shared/` never imports from `app/` or `features/`. API types come only from
`schema.d.ts`, which is generated from the backend (`npm run api:generate`) and never edited by
hand. In development Vite forwards `/api` and `/admin` to FastAPI, the same single-origin setup as
production, which keeps the refresh cookie first-party and avoids CORS preflights.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, name, email (unique, lower-cased), password_hash, is_active, is_staff, is_superuser, last_login, created/updated_at | |
| `refresh_tokens` | id, user_id, token_hash (unique), family_id, created_at, expires_at, revoked_at | One family per login; rotation and reuse detection |
| `image_detections` | id, user_id, original_filename, original_key, annotated_key, width, height, model, thresholds, inference_ms, detections (JSONB), created_at | |
| `video_jobs` | id, user_id, status (queued/running/succeeded/failed/cancelled), original_filename, source_key, width, height, fps, duration_seconds, model, thresholds, target_fps, frames_processed, error, created/started/finished_at | |
| `video_tracks` | id, job_id, track_id, class_name, first/last_seen_seconds, best_confidence, frames, clip_key | One row per tracked object |
| `live_sessions` | id, user_id, source (browser/camera), camera_id, started_at, ended_at, end_reason, model, thresholds, frames_processed | |
| `live_events` | id, session_id, track_id, class_name, confidence, detected_at, clip_key | One row per newly seen object |
| `cameras` | id, name (unique), source (device index or stream URL), enabled | Server cameras, managed by admins |

Every user-owned row carries `user_id`, and every query filters by the current user. Files are
stored under keys such as `images/<user>/<uuid>/original.jpg`; rows hold the keys, not the files.

## Key flows

### Authentication

1. `POST /api/v1/auth/signup` creates an inactive user and emails
   `{FRONTEND_URL}/activate/{uid}/{token}`.
2. `POST /api/v1/auth/activate` `{uid, token}` activates the account. The token is signed and
   expires, and it is bound to a fingerprint of the account's state, so it works once and nothing
   needs to be stored.
3. `POST /api/v1/auth/login` returns a short-lived **access token** in the body and sets a
   **refresh token** as an `httpOnly; SameSite=Lax` cookie scoped to `/api/v1/auth` (`Secure` in
   production). The database stores only the refresh token's SHA-256 hash.
4. `POST /api/v1/auth/refresh` rotates the refresh cookie and returns a new access token. The web
   app calls it on startup (to restore the session after a reload) and on a 401, then retries the
   request. Refreshes are single-flight within a tab and take turns across tabs (Web Locks API),
   because reusing a rotated token revokes the whole session.
5. `POST /api/v1/auth/logout` revokes the refresh token and clears the cookie.
6. Password reset: `POST /auth/password-reset` (same answer whether or not the email exists) emails
   `{FRONTEND_URL}/password/reset/confirm/{uid}/{token}`; `POST /auth/password-reset/confirm` sets
   the password, revokes every session and sends a "password changed" email.

### Image detection

`POST /api/v1/images` reads the upload with a size cap and decodes it to validate it (format,
pixel limit, EXIF rotation). `bestM` runs in a worker thread (confidence 0.2, IoU 0.3), the boxes
are drawn in the original app's style, both images are stored and the row is saved. The response
holds the detections and signed links to both images. `GET /api/v1/images` lists the history.

### Video detection

1. `POST /api/v1/videos` streams the upload to disk (500 MB cap) and probes it with PyAV (a real
   video, at most 10 minutes and 4K). It saves a `queued` job, enqueues a Celery task and returns
   `202` with the job.
2. The worker decodes the video, samples 10 frames per second by timestamp, and runs `bestM`
   (confidence 0.5, IoU 0.6, class-agnostic NMS) with a ByteTrack tracker that belongs to this job
   alone. It writes one H.264 clip per tracked object, records when each was first seen, and
   publishes progress and annotated preview frames to Redis.
3. `GET /api/v1/videos/{id}/events` (SSE, authenticated, ownership checked) relays them:
   `status`, `progress`, `frame`, then `completed`, `failed` or `cancelled`.
4. `GET /api/v1/videos/{id}` returns the job and its tracks (the report table).
5. Working files are removed when the job ends. Jobs can be cancelled, and a worker crash leads to
   redelivery (`acks_late`).

### Live detection

`WS /api/v1/live/ws`: the first message authenticates and picks the source (see the
[API reference](api.md#live-detection-websocket)).

- **Browser source (default):** the web app captures the camera with `getUserMedia` and sends JPEG
  frames at the rate the server asks for (10 per second by default). The server runs `bestS`
  (confidence 0.4, IoU 0.45) with a tracker that belongs to this session and replies with
  detections (boxes, classes, track ids). The web app draws the boxes over its own video. Newly seen
  objects become `new_object` messages, which add a report row and play the alert sound.
- **Server camera source:** the server reads an admin-registered device or stream URL in a
  background thread and also sends the annotated frames back over the socket.
- Only the newest frame is analysed; frames that arrive while the model is busy are dropped.
- In both modes the server records one clip per tracked object under a date folder and saves the
  `live_sessions` and `live_events` rows.

## Cross-cutting concerns

- **Configuration:** `pydantic-settings` from environment variables; see
  [Configuration](configuration.md). No secrets in the code; production refuses to start without a
  real `SECRET_KEY`.
- **Logging:** structlog, JSON in production. Every request gets an ID (`X-Request-ID`, created or
  kept by Nginx) that appears on all its log lines and travels with video jobs into the worker.
- **Errors:** one JSON shape, `{"detail": …, "code": …}`; 500 responses never include a stack trace.
- **Security:** Argon2id password hashing; short-lived JWTs with rotating refresh cookies and reuse
  detection; rate limits on the auth and upload endpoints; a CORS allow-list (origins, methods and
  headers); security headers, with a deny-all Content-Security-Policy on API responses and a strict
  one on the web app (`frontend/nginx/security-headers.conf`); uploads validated by decoding them;
  files served through signed, expiring links; a WebSocket origin check; non-root containers.
- **Admin:** SQLAdmin at `/admin`, superusers only, with its own signed session cookie.
- **Testing:** see [Testing](testing.md). `ml/` is unit-tested with stub models and
  regression-tested with the real weights.

## Delivery

- **Images:** `backend/Dockerfile` builds one image for the API, the worker and migrations
  (non-root, no pip at runtime, both models included); `frontend/Dockerfile` builds the app and
  serves it with unprivileged Nginx.
- **Compose:** `docker-compose.yml` runs PostgreSQL, Redis and Mailpit for development, and with
  `--profile app` the whole application: `migrate` (runs once), `api`, `worker` and `web` on port
  8080, with named volumes for the database, Redis and stored files.
- **CI:** `.github/workflows/ci.yml` (see [Testing](testing.md#continuous-integration)).
