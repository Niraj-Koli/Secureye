# Testing

| Suite | Tool | Tests | Runs against |
|---|---|---|---|
| Backend | pytest | 244 | a real PostgreSQL and Redis; fake models, except the `ml` tests |
| Frontend | Vitest + Testing Library + MSW | 96 | jsdom, with the API mocked |
| End-to-end | Playwright (Chromium) | 8 | the running Docker stack with the real models |

Counts are from the last full run; they change as tests are added.

## Backend

Start PostgreSQL and Redis first (from the repository root):

```bash
docker compose up -d --wait db redis
```

Then, from `backend/`:

| Task | Command |
|---|---|
| All tests | `uv run pytest` |
| Skip the real-model tests (faster) | `uv run pytest -m "not ml"` |
| One file or test | `uv run pytest tests/api/test_images.py -k oversized` |
| Coverage | `uv run pytest --cov --cov-report=term` |
| Lint and formatting | `uv run ruff check .` and `uv run ruff format --check .` |
| Types (strict) | `uv run mypy` |
| Migrations match the models | `uv run alembic upgrade head` then `uv run alembic check` |

The tests use their own database, `secureye_test` (created if missing and migrated once per run),
and Redis database 15. Override them with `TEST_DATABASE_URL` and `TEST_REDIS_URL`.

| Folder | What it covers |
|---|---|
| `tests/unit/` | No I/O: settings, security (hashing, tokens), password policy, emails, image validation, storage and signed links, drawing, tracking, the video and live pipelines |
| `tests/api/` | Every endpoint over HTTP: success paths, authentication, validation, rate limits, ownership (one user can't see another's data), the admin site, middleware (request IDs, security headers, CORS) and the live WebSocket |
| `tests/ml/` | Marked `ml`: the real weights. Includes the parity check against an output of the original app (see the [model card](../ml-models/README.md)), plus real image, video and live runs |
| `tests/test_*.py` | Migrations (upgrade and downgrade), the CLI, the video worker, and the Redis-backed event bus and rate limiter |

## Frontend

From `frontend/` (after `npm ci`):

| Task | Command |
|---|---|
| Tests | `npm test` |
| Watch mode | `npm run test:watch` |
| Coverage | `npm run coverage` |
| Lint | `npm run lint` |
| Types | `npm run typecheck` |
| Formatting | `npm run format:check` (fix with `npm run format`) |
| Production build | `npm run build` |

Tests sit next to the code they test (`*.test.ts`, `*.test.tsx`). The API is mocked with MSW
(`src/test/server.ts`); each test adds the responses it needs.

After changing the backend's API, regenerate the frontend's types with `npm run api:generate`. CI
fails if `frontend/openapi.json` doesn't match the backend.

## End-to-end

The tests drive Chromium against the running application, including the real models. A fake camera
(Chrome's test pattern) stands in for a webcam on the Live page.

1. Turn off rate limiting for the run, because every test comes from the same address. Add this
   line to the root `.env`, and remove it afterwards:

   ```
   RATE_LIMIT_ENABLED=false
   ```

2. Start the stack and wait until it is healthy:

   ```bash
   docker compose --profile app up -d --build --wait
   ```

3. Optional: create a superuser for the admin test (it's skipped otherwise):

   ```bash
   docker compose exec api python -m app.cli create-superuser --email e2e-admin@example.com --name "E2E Admin"
   ```

4. Run the tests from `e2e/`:

   ```bash
   npm ci
   npx playwright install chromium        # once
   E2E_ADMIN_EMAIL=e2e-admin@example.com E2E_ADMIN_PASSWORD='<the password>' npx playwright test
   ```

They run one at a time and take about two minutes. The tests cover sign-up, activation from the
email (read from Mailpit), login and password reset; image, video and live detection with their
reports and PDFs; the 404 page and the old `/webcam` address; the security headers; and the admin
site. After a failure, `npm run report` opens the HTML report with traces and screenshots.

Settings: `E2E_BASE_URL` (default `http://localhost:8080`) and `E2E_MAILPIT_URL` (default
`http://localhost:8025`).

## Pre-commit hooks

`.pre-commit-config.yaml` runs file checks (whitespace, end of file, YAML, TOML, merge conflicts,
large files, private keys), Ruff, mypy, Prettier, ESLint and the TypeScript compiler.

```bash
cd backend
uv run pre-commit install                 # run on every commit
uv run pre-commit run --all-files         # run now, on every committed file
```

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests and on demand:

| Job | Steps |
|---|---|
| Backend | Ruff, mypy, migrations (`alembic check`), all tests with coverage (weights from Git LFS), and a check that `frontend/openapi.json` is up to date |
| Frontend | Prettier, ESLint, TypeScript, tests with coverage, production build |
| Security audits | pip-audit, Bandit, npm audit (frontend and e2e) |
| End-to-end | Builds the images, starts the stack, creates a superuser, runs Playwright, then scans both images with Trivy (fails on fixable HIGH or CRITICAL issues) |
