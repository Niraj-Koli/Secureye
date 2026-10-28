import { Navigate, Outlet, useLocation } from "react-router";
import { useShallow } from "zustand/react/shallow";

import { loginPath } from "@/shared/auth/session";
import { useSession } from "@/shared/auth/store";

/**
 * Wraps the pages that need a signed-in user. The route's loader checks before the page
 * loads; this also handles the session ending while the page is open: an expired session
 * goes to login (and back here afterwards), a deliberate logout goes home.
 */
export function RequireAuth() {
  const { status, loggedOut } = useSession(
    useShallow((state) => ({ status: state.status, loggedOut: state.loggedOut })),
  );
  const location = useLocation();

  if (status === "authenticated") return <Outlet />;
  const target = loggedOut ? "/" : loginPath(location.pathname + location.search);
  return <Navigate to={target} replace />;
}
