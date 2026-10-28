# Troubleshooting

## Docker setup

### The API and migration containers exit with "SECRET_KEY must be set to a random value of 32+ characters."

The Docker setup runs in production mode, which refuses the built-in development key. Copy
`.env.example` to `.env` (next to `docker-compose.yml`), set `SECRET_KEY` (the file shows how to
generate one), and run `docker compose --profile app up` again.

### The API fails to start while loading the models

Check the size of the files in `ml-models/`. `bestM.pt` should be about 52 MB and `bestS.pt` about
22 MB. Files of a few hundred bytes are Git LFS pointers, which happens when the repository was
cloned without Git LFS. Fix it and rebuild:

```bash
git lfs install
git lfs pull
docker compose --profile app up --build
```

### A port is already in use

Ports 8080, 5433, 6379, 1025 and 8025 can be changed in the root `.env` with `WEB_PORT`,
`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, `MAILPIT_SMTP_PORT` and `MAILPIT_UI_PORT`. For local
development, update `DATABASE_URL`, `REDIS_URL` or `SMTP_PORT` in `backend/.env` to match.

### The first build takes a long time

The backend image installs PyTorch and the other ML libraries, a few hundred megabytes of
downloads. Later builds reuse Docker's cache.

### `docker compose exec api …` says the service isn't running

The application services belong to the `app` profile. Start them with
`docker compose --profile app up -d`; plain `docker compose up` starts only PostgreSQL, Redis and
Mailpit.

## Accounts and email

### No activation or password reset email

- Development and the default Docker setup deliver every email to Mailpit:
  <http://localhost:8025>.
- With a real SMTP server, check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` and
  `SMTP_STARTTLS` (or `SMTP_TLS` for port 465), and read the API's logs:
  `docker compose logs api`.
- To resend an activation email, call `POST /api/v1/auth/activate/resend` with `{"email": "…"}`.

### The activation or reset link says it's invalid or expired

Each link works once. Activation links expire after 48 hours and reset links after 2 hours. A reset
link also stops working once the password has changed. Request a new one.

### "Too many requests" (HTTP 429)

The auth and upload endpoints are rate limited per IP address (see the
[API reference](api.md#rate-limits)). Wait for the time in the `Retry-After` header. Turn the limits
off for automated tests with `RATE_LIMIT_ENABLED=false`.

### Logging in works, but a reload signs you out

The session is kept in a `Secure` refresh cookie. Browsers accept it on `https://` and on
`http://localhost`, but not on plain HTTP under another host name. Serve the app over HTTPS, or for
plain-HTTP testing on another host set `COOKIE_SECURE=false` in the root `.env`.

### Links in emails point at the wrong address

They are built from `PUBLIC_URL` (Docker) or `FRONTEND_URL` (development). Set it to the address
people actually open.

## Detection

### A video stays "Queued: waiting for the video worker…"

No worker is processing jobs.

- Docker: check `docker compose ps` and `docker compose logs worker`.
- Development: start the worker (see the [installation guide](installation.md#video-worker-terminal-2)),
  or set `JOB_RUNNER=inline` and `JOB_EVENTS_BACKEND=memory` in `backend/.env` and restart the API.

### The Celery worker fails on Windows

Celery's default process pool doesn't work on Windows. Start the worker with `--pool=solo`.

### Processing is slow

Detection runs on the CPU: about 0.6 s per photo, about 7 s per second of 720p video, and 3–4
analysed live frames per second on a typical laptop. Live detection skips frames rather than falling
behind. Shorter or lower-resolution videos finish sooner.

### The camera doesn't start on the Live page

- Browsers only allow cameras on `https://` pages and on `http://localhost`.
- Check the browser's camera permission for the site.
- Close other apps that are using the camera.
- **No camera found** means the browser reports no cameras; plug one in, or use a server camera.

### The live connection is refused

The WebSocket only accepts pages from origins in `CORS_ORIGINS` (`PUBLIC_URL` in Docker). Open the
app at that exact address (scheme, host and port). Each user can also run only two live sessions at
a time; stop one, or close the other tab.

### Images or clips stop loading after a while

Stored files are served through signed links that expire after an hour (`FILE_URL_TTL_SECONDS`).
Reload the page to get fresh links.

### A server camera can't be opened

The server reads the camera, not the browser. The source registered in the admin site must be a
device index the server can open (`0`, `1`, …) or a stream URL it can reach. Cameras attached to your
own computer are used through **This device** instead. Docker containers can't see the host's USB
cameras unless the device is passed through to the container.

## Development

### `uv run …` fails with "uv trampoline failed to canonicalize script path"

The `backend/.venv` virtual environment was created in another folder (the repository was moved or
renamed). Recreate it:

```bash
cd backend
rm -rf .venv            # PowerShell: Remove-Item -Recurse -Force .venv
uv sync
```

### The backend tests stop with "Test database unreachable"

Start PostgreSQL and Redis with `docker compose up -d --wait db redis`, or point `TEST_DATABASE_URL`
and `TEST_REDIS_URL` at your own servers.

### The frontend shows type errors after a backend change

Regenerate the API types from `frontend/`: `npm run api:generate`. It exports the backend's OpenAPI
schema (no server or database needed) and rebuilds `src/shared/api/schema.d.ts`.

### Requests from the dev server fail with CORS errors or a refused WebSocket

The backend allows `http://localhost:5173` by default. If you open the dev server under another
address (for example `127.0.0.1` or another port), add it to `CORS_ORIGINS` in `backend/.env`.

### The admin end-to-end test is skipped

Set `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` to a superuser's credentials (see
[Testing](testing.md#end-to-end)).

### Where the logs are

- Docker: `docker compose logs api worker web`. API and worker logs are JSON lines, and every line
  for a request carries its `request_id`, the same value as the response's `X-Request-ID` header.
- Development: the API and worker terminals, as colored console output (`LOG_JSON=true` for JSON).
