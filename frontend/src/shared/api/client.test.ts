import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";

import { setAccessToken, setSignedIn, useSession } from "@/shared/auth/store";
import { apiError, demoUser, server, signedOutHandlers, tokenResponse } from "@/test/server";

import { api, unwrap } from "./client";
import { ApiError } from "./errors";

/** /users/me that only accepts `validToken`. */
function meAccepting(validToken: string) {
  return http.get("/api/v1/users/me", ({ request }) =>
    request.headers.get("Authorization") === `Bearer ${validToken}`
      ? HttpResponse.json(demoUser)
      : apiError(401, "Not authenticated", "not_authenticated"),
  );
}

describe("api client", () => {
  it("sends the access token", async () => {
    setAccessToken("access-1");
    server.use(meAccepting("access-1"));

    await expect(unwrap(api.GET("/api/v1/users/me"))).resolves.toEqual(demoUser);
  });

  it("refreshes an expired token and retries the request", async () => {
    setAccessToken("expired");
    server.use(
      meAccepting("access-2"),
      http.post("/api/v1/auth/refresh", () => tokenResponse("access-2")),
    );

    await expect(unwrap(api.GET("/api/v1/users/me"))).resolves.toEqual(demoUser);
    expect(useSession.getState().accessToken).toBe("access-2");
  });

  it("refreshes once for requests that fail together", async () => {
    setAccessToken("expired");
    let refreshes = 0;
    server.use(
      meAccepting("access-2"),
      http.post("/api/v1/auth/refresh", () => {
        refreshes += 1;
        return tokenResponse("access-2");
      }),
    );

    const results = await Promise.all(
      Array.from({ length: 3 }, () => unwrap(api.GET("/api/v1/users/me"))),
    );

    expect(results).toEqual([demoUser, demoUser, demoUser]);
    expect(refreshes).toBe(1);
  });

  it("replays the request body on retry", async () => {
    setAccessToken("expired");
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/v1/auth/refresh", () => tokenResponse("access-2")),
      http.post("/api/v1/live/admin/cameras", async ({ request }) => {
        bodies.push(await request.json());
        return request.headers.get("Authorization") === "Bearer access-2"
          ? HttpResponse.json({ id: 1, name: "Gate", source: "0", enabled: true }, { status: 201 })
          : apiError(401, "Not authenticated");
      }),
    );

    await unwrap(
      api.POST("/api/v1/live/admin/cameras", {
        body: { name: "Gate", source: "0", enabled: true },
      }),
    );

    expect(bodies).toEqual([
      { name: "Gate", source: "0", enabled: true },
      { name: "Gate", source: "0", enabled: true },
    ]);
  });

  it("signs out when the session can't be refreshed", async () => {
    setAccessToken("expired");
    setSignedIn(demoUser);
    server.use(meAccepting("never"), ...signedOutHandlers());

    const error: unknown = await unwrap(api.GET("/api/v1/users/me")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(useSession.getState()).toMatchObject({
      status: "anonymous",
      user: null,
      accessToken: null,
    });
  });

  it("doesn't try to refresh after a failed login", async () => {
    let refreshes = 0;
    setAccessToken("stale");
    server.use(
      http.post("/api/v1/auth/login", () => apiError(401, "Invalid email or password.")),
      http.post("/api/v1/auth/refresh", () => {
        refreshes += 1;
        return tokenResponse("x");
      }),
    );

    const error: unknown = await unwrap(
      api.POST("/api/v1/auth/login", { body: { email: "a@example.com", password: "wrong" } }),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401, message: "Invalid email or password." });
    expect(refreshes).toBe(0);
  });
});
