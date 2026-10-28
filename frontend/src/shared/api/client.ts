import createClient from "openapi-fetch";

import { useSession } from "@/shared/auth/store";

import { apiErrorFrom } from "./errors";
import { refreshAccessToken } from "./refresh";
import type { paths } from "./schema";

/**
 * fetch with the access token attached. On a 401 it refreshes the token (once, shared by all
 * requests that fail together) and retries the request.
 */
export async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone(); // a request body can only be read once
  const usedToken = useSession.getState().accessToken;
  const response = await fetch(withToken(request, usedToken));
  if (response.status !== 401 || usedToken === null || isAuthEndpoint(request.url)) {
    return response;
  }

  // Another request may already have refreshed the token while this one was in flight.
  const current = useSession.getState().accessToken;
  const fresh = current !== null && current !== usedToken ? current : await refreshAccessToken();
  return fresh === null ? response : fetch(withToken(retry, fresh));
}

/** authFetch for requests outside the typed client (event streams, downloads). */
export function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  return authFetch(new Request(new URL(path, window.location.origin), init));
}

function withToken(request: Request, token: string | null): Request {
  if (token === null) return request;
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(request, { headers });
}

function isAuthEndpoint(url: string): boolean {
  return new URL(url).pathname.startsWith("/api/v1/auth/");
}

/** Typed client generated from the backend's OpenAPI schema (`npm run api:generate`). */
export const api = createClient<paths>({
  baseUrl: window.location.origin,
  fetch: authFetch,
});

interface ClientResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Resolve to the response data, or throw an ApiError. */
export async function unwrap<T>(pending: Promise<ClientResult<T>>): Promise<T> {
  const { data, error, response } = await pending;
  if (error !== undefined || !response.ok) throw apiErrorFrom(response.status, error);
  return data as T;
}
