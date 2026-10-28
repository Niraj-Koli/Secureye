import { redirect, type LoaderFunctionArgs } from "react-router";

import { api, unwrap } from "@/shared/api/client";
import { refreshAccessToken } from "@/shared/api/refresh";

import { setAccessToken, setSignedIn, setSignedOut, useSession } from "./store";

let bootstrap: Promise<void> | null = null;

/**
 * Find out once whether the browser still has a session: the refresh cookie survives reloads,
 * the in-memory access token doesn't. Every route waits for this, so the first screen already
 * knows whether the user is signed in.
 */
export function ensureSession(): Promise<void> {
  if (useSession.getState().status !== "unknown") return Promise.resolve();
  bootstrap ??= restoreSession().finally(() => {
    bootstrap = null;
  });
  return bootstrap;
}

async function restoreSession(): Promise<void> {
  try {
    if ((await refreshAccessToken()) === null) return; // no session: already marked signed out
    setSignedIn(await unwrap(api.GET("/api/v1/users/me")));
  } catch {
    // Server unreachable: carry on signed out rather than blocking the public pages.
    setSignedOut();
  }
}

/** After a successful login: keep the access token and load the user's profile. */
export async function startSession(accessToken: string): Promise<void> {
  setAccessToken(accessToken);
  setSignedIn(await unwrap(api.GET("/api/v1/users/me")));
}

/** Revoke the session on the server (best effort) and forget it here. */
export async function logout(): Promise<void> {
  try {
    await api.POST("/api/v1/auth/logout");
  } catch {
    // Offline: the cookie is cleared by the server next time; locally we sign out regardless.
  } finally {
    setSignedOut({ byUser: true });
  }
}

/** Where to send someone who must sign in first, remembering where they were going. */
export function loginPath(next: string): string {
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

/**
 * The page to return to after signing in. Only same-site paths are accepted, so a crafted
 * link like `/login?next=https://evil.example` can't bounce the user elsewhere.
 */
export function safeNext(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/** Route loader for pages that need a signed-in user. */
export async function requireAuth({ request }: LoaderFunctionArgs): Promise<null> {
  await ensureSession();
  if (useSession.getState().status !== "authenticated") {
    const url = new URL(request.url);
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Router's redirect idiom
    throw redirect(loginPath(url.pathname + url.search));
  }
  return null;
}
