# Installation and setup

There are two ways to run Secureye:

- **With Docker (recommended to try it):** the whole application in containers, one command.
- **For development:** PostgreSQL, Redis and Mailpit in containers; the API, the worker and the
  web app on your machine with hot reload.

| Port | Service | Used by |
|---|---|---|
| 8080 | Web app (Nginx), which also forwards `/api` and `/admin` | Docker setup |
| 5173 | Vite dev server | Development |
| 8000 | API (Uvicorn) | Development |
| 5433 | PostgreSQL (host port; 5432 inside the container) | Both |
| 6379 | Redis | Both |
| 1025 / 8025 | Mailpit SMTP / web inbox | Both |

PostgreSQL, Redis and Mailpit listen on `127.0.0.1` only, because they use default credentials.
The API container isn't published in the Docker setup; everything goes through the web app.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| [Git](https://git-scm.com/) + [Git LFS](https://git-lfs.com/) | any recent | the model weights are stored with Git LFS |
| [Docker](https://docs.docker.com/get-docker/) with Compose v2 | any recent | both setups |
| [uv](https://docs.astral.sh/uv/) | 0.12 or newer (CI uses 0.12.3) | development: the backend (uv installs Python 3.13 itself) |
| [Node.js](https://nodejs.org/) | 22.12 or newer (CI uses 24) | development: the frontend and the end-to-end tests |

No GPU is needed: the backend installs CPU builds of PyTorch on every platform.

## 1. Get the code and the model weights

```bash
git lfs install                  # once per machine
git clone https://github.com/Niraj-Koli/Secureye.git
cd Secureye
git lfs pull                     # only needed if Git LFS was installed after cloning
```

Check that the weights were downloaded: `ml-models/bestM.pt` is about 52 MB and `bestS.pt` about
22 MB. Files of a few hundred bytes are Git LFS pointers, not weights (see
[Troubleshooting](troubleshooting.md#the-api-fails-to-start-while-loading-the-models)).

## 2a. Run everything with Docker

```bash
cp .env.example .env
```

Open `.env` and set `SECRET_KEY` to a random value of at least 32 characters. The file shows a
command that generates one:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then build and start the stack:

```bash
docker compose --profile app up --build
```

The first build downloads PyTorch and takes several minutes. Compose starts PostgreSQL, Redis and
Mailpit, runs the database migrations once (`migrate`), then starts the API, the video worker and
the web app. The API loads and warms up both models at startup (about 10 s on a CPU).

When the services report healthy:

1. Open <http://localhost:8080> and sign up.
2. Open Mailpit at <http://localhost:8025> and click the activation link in the email.
3. Log in and use the Image, Video and Live pages (see the [user guide](usage.md)).

Optional: create a superuser for the admin site at <http://localhost:8080/admin>. You are asked
for the password twice.

```bash
docker compose exec api python -m app.cli create-superuser --email you@example.com --name "Your Name"
```

Stop and restart:

```bash
docker compose --profile app stop          # stop, keep everything
docker compose --profile app up -d         # start again in the background
docker compose --profile app down          # remove the containers, keep the data volumes
```

`docker compose --profile app down -v` also deletes the volumes, which means **every account,
detection and stored file**.

## 2b. Development setup

### Services

From the repository root:

```bash
docker compose up -d --wait      # PostgreSQL :5433, Redis :6379, Mailpit :1025 / :8025
```

Without `--profile app`, only these three services start.

### Backend (terminal 1)

```bash
cd backend
cp .env.example .env             # works as is for local development
uv sync                          # creates .venv with Python 3.13 and the dev tools
uv run alembic upgrade head      # create the tables
uv run uvicorn app.main:app --reload
```

The API runs on <http://localhost:8000>. Its interactive documentation is at
<http://localhost:8000/docs> (development only).

### Video worker (terminal 2)

Video jobs run in a Celery worker:

```bash
cd backend
uv run celery -A app.workers.celery_app worker --loglevel=info --pool=solo          # Windows
uv run celery -A app.workers.celery_app worker --loglevel=info --concurrency=1      # Linux / macOS
```

To skip the worker, set `JOB_RUNNER=inline` and `JOB_EVENTS_BACKEND=memory` in `backend/.env`.
Videos are then processed inside the API process, which is fine on a single development machine.

### Frontend (terminal 3)

```bash
cd frontend
npm ci
npm run dev                      # http://localhost:5173
```

The dev server forwards `/api` (HTTP and WebSocket) and `/admin` to the API on port 8000. Keep
port 5173: the backend's defaults for `CORS_ORIGINS` and `FRONTEND_URL` (the links in emails)
expect it.

Then sign up at <http://localhost:5173> and activate the account from Mailpit
(<http://localhost:8025>), as above.

### Admin account (optional)

```bash
cd backend
uv run python -m app.cli create-superuser --email admin@example.com --name "Admin"
```

The admin site is at <http://localhost:5173/admin> (through the dev server) or
<http://localhost:8000/admin>.

### Git hooks (optional)

```bash
cd backend
uv run pre-commit install
```

On every commit this runs whitespace and file checks, Ruff, mypy, Prettier, ESLint and the
TypeScript compiler on the changed parts. The frontend and e2e hooks use their own
`node_modules`, so run `npm ci` in `frontend/` and `e2e/` first.

## Next steps

- [Configuration](configuration.md): every setting and its default.
- [Testing](testing.md): running the test suites.
- [Troubleshooting](troubleshooting.md): common problems and their fixes.
