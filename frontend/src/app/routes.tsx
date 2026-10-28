import type { ComponentType } from "react";
import { createBrowserRouter, redirect, type RouteObject } from "react-router";

import { ensureSession, requireAuth } from "@/shared/auth/session";
import { Loading } from "@/shared/ui/Loading";

import { NotFoundPage } from "./NotFoundPage";
import { RequireAuth } from "./RequireAuth";
import { RootLayout } from "./RootLayout";
import { RouteError } from "./RouteError";

/** A lazily loaded page module (its default export), in its own bundle. */
function page(load: () => Promise<{ default: ComponentType }>): Pick<RouteObject, "lazy"> {
  return { lazy: async () => ({ Component: (await load()).default }) };
}

// The same URLs as the original app, including the links in its activation and reset emails.
export const routes: RouteObject[] = [
  {
    path: "/",
    Component: RootLayout,
    HydrateFallback: Loading,
    ErrorBoundary: RouteError,
    loader: async () => {
      await ensureSession();
      return null;
    },
    children: [
      { index: true, ...page(() => import("@/features/home/HomePage")) },
      { path: "home", loader: () => redirect("/") },
      { path: "login", ...page(() => import("@/features/auth/LoginPage")) },
      { path: "signup", ...page(() => import("@/features/auth/SignupPage")) },
      { path: "reset-password", ...page(() => import("@/features/auth/ResetPage")) },
      {
        path: "password/reset/confirm/:uid/:token",
        ...page(() => import("@/features/auth/PasswordPage")),
      },
      { path: "activate/:uid/:token", ...page(() => import("@/features/auth/ActivationPage")) },
      {
        // The detection pages need an account (the original only hid the links).
        loader: requireAuth,
        Component: RequireAuth,
        children: [
          { path: "image", ...page(() => import("@/features/image/ImagePage")) },
          { path: "video", ...page(() => import("@/features/video/VideoPage")) },
          { path: "live", ...page(() => import("@/features/live/LivePage")) },
        ],
      },
      // The live page was called "webcam" in the original.
      { path: "webcam", loader: () => redirect("/live") },
      { path: "*", Component: NotFoundPage },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
