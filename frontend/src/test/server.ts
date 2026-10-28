import { http, HttpResponse } from "msw/http";
import { setupServer } from "msw/node";

import type { User } from "@/shared/auth/store";

/** Mock API for tests; each test adds the handlers it needs with `server.use(...)`. */
export const server = setupServer();

export const demoUser: User = {
  id: 1,
  name: "Niraj Demo",
  email: "niraj.demo@example.com",
  is_active: true,
  is_staff: false,
  created_at: "2026-10-01T10:00:00Z",
};

export function tokenResponse(token: string) {
  return HttpResponse.json({ access_token: token, token_type: "bearer", expires_in: 900 });
}

export function apiError(status: number, detail: unknown, code = "http_error") {
  return HttpResponse.json({ detail, code }, { status });
}

/** A browser with a live session: the refresh cookie works and /users/me answers. */
export function signedInHandlers(token = "access-1") {
  return [
    http.post("/api/v1/auth/refresh", () => tokenResponse(token)),
    http.get("/api/v1/users/me", ({ request }) =>
      request.headers.get("Authorization") === `Bearer ${token}`
        ? HttpResponse.json(demoUser)
        : apiError(401, "Not authenticated", "not_authenticated"),
    ),
  ];
}

/** A browser without a session: refreshing fails like it does with no cookie. */
export function signedOutHandlers() {
  return [
    http.post("/api/v1/auth/refresh", () =>
      apiError(401, "Session expired. Please log in again.", "invalid_refresh_token"),
    ),
  ];
}
