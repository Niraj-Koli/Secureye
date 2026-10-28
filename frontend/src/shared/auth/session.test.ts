import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";

import {
  demoUser,
  server,
  signedInHandlers,
  signedOutHandlers,
  tokenResponse,
} from "@/test/server";

import { ensureSession, loginPath, logout, safeNext, startSession } from "./session";
import { setAccessToken, setSignedIn, useSession } from "./store";

describe("ensureSession", () => {
  it("restores a session from the refresh cookie", async () => {
    server.use(...signedInHandlers("access-1"));

    await ensureSession();

    expect(useSession.getState()).toMatchObject({
      status: "authenticated",
      user: demoUser,
      accessToken: "access-1",
    });
  });

  it("is signed out without a session", async () => {
    server.use(...signedOutHandlers());

    await ensureSession();

    expect(useSession.getState().status).toBe("anonymous");
  });

  it("is signed out when the server can't be reached", async () => {
    server.use(http.post("/api/v1/auth/refresh", () => HttpResponse.error()));

    await ensureSession();

    expect(useSession.getState().status).toBe("anonymous");
  });

  it("asks the server only once", async () => {
    let refreshes = 0;
    server.use(
      http.post("/api/v1/auth/refresh", () => {
        refreshes += 1;
        return tokenResponse("access-1");
      }),
      http.get("/api/v1/users/me", () => HttpResponse.json(demoUser)),
    );

    await Promise.all([ensureSession(), ensureSession()]);
    await ensureSession();

    expect(refreshes).toBe(1);
  });
});

describe("startSession and logout", () => {
  it("loads the profile after login", async () => {
    server.use(...signedInHandlers("access-9"));

    await startSession("access-9");

    expect(useSession.getState()).toMatchObject({ status: "authenticated", user: demoUser });
  });

  it("revokes the session and forgets it", async () => {
    setAccessToken("access-1");
    setSignedIn(demoUser);
    let revoked = false;
    server.use(
      http.post("/api/v1/auth/logout", () => {
        revoked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await logout();

    expect(revoked).toBe(true);
    expect(useSession.getState()).toMatchObject({ status: "anonymous", accessToken: null });
  });

  it("signs out locally even when offline", async () => {
    setAccessToken("access-1");
    setSignedIn(demoUser);
    server.use(http.post("/api/v1/auth/logout", () => HttpResponse.error()));

    await logout();

    expect(useSession.getState().status).toBe("anonymous");
  });
});

describe("redirect targets", () => {
  it("remembers where the user was going", () => {
    expect(loginPath("/image")).toBe("/login?next=%2Fimage");
    expect(loginPath("/")).toBe("/login");
  });

  it("only returns to pages on this site", () => {
    expect(safeNext("/video?job=3")).toBe("/video?job=3");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
});
