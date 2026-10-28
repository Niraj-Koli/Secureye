# Secureye web app

React 19 + TypeScript single-page app for Secureye. The [project README](../README.md) covers the
full stack and [`docs/`](../docs/) has the detailed guides; this file covers working on the frontend
alone.

## Requirements

- Node.js 22.12 or newer (developed on Node 26)
- The backend running on http://localhost:8000 (see `../backend/README.md`)

## Quick start

```bash
# from frontend/
npm ci
npm run dev        # http://localhost:5173
```

The dev server forwards `/api` (HTTP and WebSocket) to the backend, so the browser talks to a single
origin and the refresh cookie stays first-party. Set `API_PROXY_TARGET` (see `.env.example`) if the
backend runs somewhere else. Port 5173 is fixed because the backend's `CORS_ORIGINS` (also checked
on the live-detection WebSocket) and `FRONTEND_URL` (used in email links) expect it. Browsers only
allow camera access on `localhost` or HTTPS.

## Everyday commands

| Task                                        | Command                                       |
| ------------------------------------------- | --------------------------------------------- |
| Dev server                                  | `npm run dev`                                 |
| Tests                                       | `npm test` (watch mode: `npm run test:watch`) |
| Tests + coverage                            | `npm run coverage`                            |
| Lint                                        | `npm run lint`                                |
| Type-check                                  | `npm run typecheck`                           |
| Format / check formatting                   | `npm run format` / `npm run format:check`     |
| Production build                            | `npm run build` (output in `dist/`)           |
| Regenerate API types after a backend change | `npm run api:generate`                        |

`api:generate` asks the backend for its OpenAPI schema (`openapi.json`; no server or database needed)
and regenerates `src/shared/api/schema.d.ts` (`scripts/generate-api-types.mjs`, which types file
uploads as `Blob`). Both files are committed, so a backend change that
breaks the frontend shows up as a type error.

## How it fits together

| Concern        | Choice                                                                                                  | Where                                |
| -------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| UI             | MUI 9 with the original theme (Montserrat, black/orange, camouflage pattern), CSS modules per component | `src/app/theme.ts`, `src/shared/ui/` |
| Routing        | React Router 8 (data mode); pages load lazily; the original URLs are kept                               | `src/app/routes.tsx`                 |
| API calls      | `openapi-fetch` typed from the backend's schema; `unwrap()` turns errors into `ApiError`                | `src/shared/api/client.ts`           |
| Server state   | TanStack Query (cache cleared on sign-out)                                                              | `src/app/queryClient.ts`             |
| Session        | Zustand store: status, user, access token (memory only)                                                 | `src/shared/auth/`                   |
| Video progress | Fetch-based Server-Sent Events reader (`EventSource` can't send the token)                              | `src/shared/api/sse.ts`              |
| Tests          | Vitest + Testing Library, API mocked with MSW                                                           | `src/**/*.test.ts(x)`, `src/test/`   |
| Forms          | React Hook Form + Zod (the original validation rules)                                                   | `src/features/auth/schemas.ts`       |

### Sessions

- Login returns an access token (kept in memory, never in `localStorage`) and sets the refresh token
  as an httpOnly cookie that scripts can't read.
- On startup the app calls `/auth/refresh` once to find out whether the browser still has a session,
  so a reload keeps the user signed in.
- A request that gets a 401 refreshes the token and is retried once. Requests that fail together share
  one refresh, and tabs take turns using the Web Locks API: the server rotates the refresh token on
  every use and treats a reused one as stolen, so two tabs refreshing at once would sign the user out.
- `/image`, `/video` and `/live` need a signed-in user. Visitors are sent to `/login?next=<page>`, and
  only same-site `next` values are honoured. If the session expires while one of these pages is open,
  the user is sent to login; logging out sends them home.

## Production

`Dockerfile` builds the app and serves it with Nginx (non-root, port 8080), which also forwards
`/api` (HTTP, Server-Sent Events, WebSocket) and `/admin` to the API: `nginx/default.conf.template`.
The browser-side security headers live in `nginx/security-headers.conf`: a Content-Security-Policy
allowing only this site's scripts, and `Permissions-Policy` allowing the camera on this site only.

## How it was built

The app was rebuilt in phases (see the project's [feature parity checklist](../docs/feature-parity.md)):

- Phase 6: shell (theme, routing, sessions, API client, header, navbar, footer, loading, 404 and
  error screens).
- Phase 7: home page and the account screens: login, signup, activation, password reset and new
  password (`src/features/home/`, `src/features/auth/`). Forms use React Hook Form with Zod schemas
  holding the original app's rules (`src/features/auth/schemas.ts`); the server's messages are shown
  for anything only it can check (email taken, weak password, expired link).
- Phase 8a: the Image page with its report, PDF and history (`src/features/image/`), and the parts
  the Video and Live pages will share (`src/features/detection/`: media frames, report table, file
  button, PDF builder).
- Phase 8b: the Video page (`src/features/video/`): upload, live progress over Server-Sent Events
  (`useJobEvents`, which reconnects after a dropped connection), report with playable clips, PDF,
  cancel and history. History lists are shared (`src/features/detection/HistoryList.tsx`).
- Phase 8c: the Live page (`src/features/live/`): camera picker (this device's cameras and the
  server's), the WebSocket client (`liveConnection.ts`, plain TypeScript) and session hook
  (`useLive.ts`), boxes drawn over the user's video, alert sound, report with clips, PDF and history.
- Phase 10: Docker image with Nginx; end-to-end tests in `../e2e`.
