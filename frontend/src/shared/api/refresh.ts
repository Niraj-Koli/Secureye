import { setAccessToken, setSignedOut } from "@/shared/auth/store";

import type { components } from "./schema";

type TokenResponse = components["schemas"]["TokenResponse"];

export const REFRESH_PATH = "/api/v1/auth/refresh";
const LOCK_NAME = "secureye-token-refresh";

let inFlight: Promise<string | null> | null = null;

/**
 * Trade the refresh cookie for a new access token. Returns null (and signs out) when the
 * session has ended; throws on network errors, which leave the session as it is.
 *
 * Calls are single-flight within the tab, and serialised across tabs with a Web Lock: the
 * server rotates the refresh token on every use and treats a reused one as theft, so two
 * tabs refreshing with the same cookie at once would sign the user out everywhere.
 */
export function refreshAccessToken(): Promise<string | null> {
  inFlight ??= withRefreshLock(requestNewToken).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function requestNewToken(): Promise<string | null> {
  const response = await fetch(new URL(REFRESH_PATH, window.location.origin), {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) {
    setSignedOut();
    return null;
  }
  const body = (await response.json()) as TokenResponse;
  setAccessToken(body.access_token);
  return body.access_token;
}

async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  // Web Locks exist in every current browser; the fallback covers older ones and jsdom.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!navigator.locks) return task();
  return await navigator.locks.request(LOCK_NAME, task);
}
