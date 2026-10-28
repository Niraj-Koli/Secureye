import { create } from "zustand";

import type { components } from "@/shared/api/schema";

export type User = components["schemas"]["UserRead"];

/**
 * - `unknown`: not checked yet (the app asks the server once, at startup)
 * - `authenticated`: we hold an access token and the user's profile
 * - `anonymous`: signed out, or the session expired
 */
export type SessionStatus = "unknown" | "authenticated" | "anonymous";

interface SessionState {
  status: SessionStatus;
  user: User | null;
  /** Kept in memory only; the refresh token lives in an httpOnly cookie the page can't read. */
  accessToken: string | null;
  /** True after the user logged out themselves (rather than the session expiring). */
  loggedOut: boolean;
}

export const useSession = create<SessionState>()(() => ({
  status: "unknown",
  user: null,
  accessToken: null,
  loggedOut: false,
}));

export function setAccessToken(accessToken: string): void {
  useSession.setState({ accessToken });
}

export function setSignedIn(user: User): void {
  useSession.setState({ status: "authenticated", user, loggedOut: false });
}

export function setSignedOut({ byUser = false }: { byUser?: boolean } = {}): void {
  useSession.setState({ status: "anonymous", user: null, accessToken: null, loggedOut: byUser });
}
