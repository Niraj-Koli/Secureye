# Configuration

Settings come from environment variables. The backend also reads a `.env` file in its working
directory. No secrets are stored in the code.

| File | Read by | Template |
|---|---|---|
| `.env` (repository root) | `docker compose` (the Docker setup) | `.env.example` |
| `backend/.env` | the API, the worker and the CLI when run on your machine | `backend/.env.example` |
| `frontend/.env` | the Vite dev server | `frontend/.env.example` |

All `.env` files are ignored by git.

## Docker setup (root `.env`)

`docker-compose.yml` passes these to the API, the worker and the migration job. It also fixes
several backend settings for containers: `ENVIRONMENT=production`, the database and Redis
addresses, `JOB_RUNNER=celery` and `JOB_EVENTS_BACKEND=redis`.

| Variable | Default | Meaning |
|---|---|---|
| `SECRET_KEY` | none (**required**) | Signs access tokens, email links, file links and the admin session. At least 32 random characters. |
| `PUBLIC_URL` | `http://localhost:8080` | Where people open the app. Used for links in emails (`FRONTEND_URL`) and as the only allowed origin (`CORS_ORIGINS`). |
| `WEB_PORT` | `8080` | Host port of the web app. |
| `COOKIE_SECURE` | `true` | Send the refresh cookie over HTTPS only. Browsers accept it on `http://localhost`; set `false` only for plain-HTTP use on another host name. |
| `SMTP_HOST`, `SMTP_PORT` | `mailpit`, `1025` | Mail server. By default all mail goes to Mailpit (<http://localhost:8025>). |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | empty | SMTP login, if the server needs one. |
| `SMTP_STARTTLS` | `false` | Upgrade the connection with STARTTLS (for example port 587). |
| `EMAIL_FROM` | `Secureye <no-reply@secureye.local>` | Sender of every email. |
| `RATE_LIMIT_ENABLED` | `true` | The end-to-end tests set it to `false`, because every test comes from the same address. |
| `POSTGRES_HOST_PORT` | `5433` | Host port of PostgreSQL. |
| `REDIS_HOST_PORT` | `6379` | Host port of Redis. |
| `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` | `1025`, `8025` | Host ports of Mailpit. |

If you change a host port for local development, change the matching URL in `backend/.env` too
(`DATABASE_URL`, `REDIS_URL` or `SMTP_PORT`).

## Backend (`backend/.env`)

Every variable is optional in development; the defaults live in `backend/app/core/config.py`.
Names aren't case-sensitive.

### General

| Variable | Default | Meaning |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. Production requires a real `SECRET_KEY`, hides `/docs` and the OpenAPI schema, and turns on JSON logs, secure cookies and HSTS. |
| `LOG_LEVEL` | `INFO` | Python log level. |
| `LOG_JSON` | on in production | `true` for JSON log lines, `false` for colored console output. |
| `DATABASE_URL` | `postgresql+asyncpg://secureye:secureye@localhost:5433/secureye` | SQLAlchemy async URL. Must use the `postgresql+asyncpg` scheme. |
| `DATABASE_ECHO` | `false` | Log every SQL statement. |
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker, video progress events and rate-limit counters. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins allowed to call the API. The live WebSocket checks the same list. |

### Authentication

| Variable | Default | Meaning |
|---|---|---|
| `SECRET_KEY` | a development-only key | **Required in production** (32+ characters; startup fails otherwise). |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | Lifetime of access tokens (JWT). |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Lifetime of a login session's refresh token. |
| `ACTIVATION_TOKEN_TTL_HOURS` | `48` | Validity of activation links. |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | `2` | Validity of password reset links. |
| `REFRESH_COOKIE_NAME` | `secureye_refresh` | Name of the refresh cookie. |
| `COOKIE_SECURE` | on in production | Send the refresh cookie over HTTPS only. |
| `FRONTEND_URL` | `http://localhost:5173` | Base URL of the web app, used for the links in emails. |

### Email

| Variable | Default | Meaning |
|---|---|---|
| `EMAIL_BACKEND` | `smtp` | `smtp` sends mail, `console` only logs it, `memory` keeps it for tests. |
| `EMAIL_FROM` | `Secureye <no-reply@secureye.local>` | Sender address. |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `1025` | Mail server (Mailpit by default). |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | unset | SMTP login. |
| `SMTP_STARTTLS` | `false` | Upgrade with STARTTLS (port 587). For Gmail use this with an app password. |
| `SMTP_TLS` | `false` | Connect over TLS (port 465). |
| `SMTP_TIMEOUT_SECONDS` | `10` | Connection timeout. |
| `SMTP_LOCAL_HOSTNAME` | the machine's name | Name sent in `EHLO`. Setting it (the template uses `localhost`) skips a reverse-DNS lookup that can take over a second on Windows. |

### Detection models

| Variable | Default | Meaning |
|---|---|---|
| `MODELS_DIR` | `../ml-models` (relative to `backend/`) | Folder holding the weights. |
| `IMAGE_MODEL_FILE` | `bestM.pt` | Model for image and video detection (YOLOv8m). |
| `LIVE_MODEL_FILE` | `bestS.pt` | Model for live detection (YOLOv8s, faster). |
| `LOAD_MODELS_ON_STARTUP` | `true` | Load and warm up the models at startup. The tests turn this off and use fakes. |
| `INFERENCE_DEVICE` | `cpu` | PyTorch device: `cpu`, `cuda`, `cuda:0` or `mps`. The installed PyTorch is the CPU build; a GPU needs a CUDA build (see `backend/pyproject.toml`). |
| `INFERENCE_CONCURRENCY` | `1` | Inferences that may run at once in the API. PyTorch already uses every core for each one. |

### Thresholds and sampling

The defaults are the original app's values, except live IoU (see the
[model card](../ml-models/README.md)).

| Variable | Default | Meaning |
|---|---|---|
| `IMAGE_CONFIDENCE`, `IMAGE_IOU` | `0.2`, `0.3` | Image detection. |
| `VIDEO_CONFIDENCE`, `VIDEO_IOU` | `0.5`, `0.6` | Video detection. |
| `VIDEO_AGNOSTIC_NMS` | `true` | Suppress overlapping boxes across classes in videos. |
| `VIDEO_TARGET_FPS` | `10` | Frames analysed per second of video. |
| `VIDEO_PREVIEW_MAX_WIDTH` | `960` | Width of the preview frames streamed while a video is processed. |
| `VIDEO_PREVIEW_JPEG_QUALITY` | `70` | Their JPEG quality. |
| `LIVE_CONFIDENCE`, `LIVE_IOU` | `0.4`, `0.45` | Live detection. |
| `LIVE_TARGET_FPS` | `10` | Frames per second read from server cameras; browsers are told to send at this rate. |
| `LIVE_MAX_FRAME_BYTES` | `2097152` (2 MB) | Largest frame a browser may send. |
| `LIVE_MAX_FRAME_PIXELS` | `2073600` (1920×1080) | Largest frame resolution. |
| `LIVE_MAX_SESSION_MINUTES` | `60` | Live sessions end after this time. |
| `LIVE_MAX_SESSIONS_PER_USER` | `2` | Concurrent live sessions per user (counted per API process). |
| `LIVE_AUTH_TIMEOUT_SECONDS` | `10` | Time a WebSocket client has to send its start message. |

### Background jobs

| Variable | Default | Meaning |
|---|---|---|
| `JOB_RUNNER` | `celery` | `celery`: video jobs run in the worker. `inline`: inside the API process (development without a worker). |
| `JOB_EVENTS_BACKEND` | `redis` | How progress reaches the API: `redis` (required with `celery`) or `memory` (single process only). |
| `CELERY_BROKER_URL` | `REDIS_URL` | Celery broker. |

### Uploads and storage

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_DIR` | `backend/storage` (`/data/storage` in Docker) | Where uploads, results and clips are stored. |
| `MAX_IMAGE_UPLOAD_MB` | `15` | Largest image upload. |
| `MAX_IMAGE_PIXELS` | `50000000` | Largest decoded image (blocks decompression bombs). |
| `MAX_VIDEO_UPLOAD_MB` | `500` | Largest video upload. Nginx allows 510 MB (`client_max_body_size`). |
| `MAX_VIDEO_DURATION_SECONDS` | `600` | Longest video. |
| `MAX_VIDEO_PIXELS` | `8294400` (3840×2160) | Highest video resolution. |
| `FILE_URL_TTL_SECONDS` | `3600` | Lifetime of the signed links to stored files. |

### Admin and rate limits

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_ENABLED` | `true` | Serve the superuser admin site at `/admin`. |
| `RATE_LIMIT_ENABLED` | `true` | Per-IP limits on the auth and upload endpoints (see the [API reference](api.md#rate-limits)). |
| `RATE_LIMIT_STORAGE_URL` | `async+<REDIS_URL>` | Where counters live. `async+memory://` runs without Redis (single process only). |

`APP_NAME` (`Secureye API`) and `API_V1_PREFIX` (`/api/v1`) can also be set, but the web app and
the Nginx config expect the default prefix.

## Frontend (`frontend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `API_PROXY_TARGET` | `http://localhost:8000` | Where the dev server forwards `/api` (HTTP and WebSocket) and `/admin`. |

The production image needs no settings: Nginx serves the app and forwards `/api` and `/admin` to
the `api` container (`frontend/nginx/default.conf.template`).

## Tests and tools

| Variable | Default | Used by |
|---|---|---|
| `TEST_DATABASE_URL` | `postgresql+asyncpg://secureye:secureye@localhost:5433/secureye_test` | Backend tests. The database is created if missing. |
| `TEST_REDIS_URL` | `redis://localhost:6379/15` | Backend Redis tests. |
| `E2E_BASE_URL` | `http://localhost:8080` | End-to-end tests. |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | End-to-end tests (they read the emails). |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | unset | A superuser for the admin end-to-end test; it's skipped without them. |
| `SECUREYE_SUPERUSER_PASSWORD` | unset | `create-superuser` reads the password from here instead of prompting (scripted setups). |
