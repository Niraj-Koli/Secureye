import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it } from "vitest";

import { setSignedOut } from "@/shared/auth/store";
import { currentUrl, renderApp } from "@/test/renderApp";
import { server, signedInHandlers, signedOutHandlers } from "@/test/server";

const loginHeading = { level: 1, name: "Login" } as const;
const homeHeading = { level: 1, name: /threat detection/i } as const;
const imageHeading = { level: 1, name: "Image detection" } as const;

// The detection pages load the user's history.
beforeEach(() => {
  const empty = () => HttpResponse.json({ items: [], total: 0, limit: 6, offset: 0 });
  server.use(http.get("/api/v1/images", empty), http.get("/api/v1/live/sessions", empty));
});

describe("routing", () => {
  it("sends signed-out visitors of a detection page to login, remembering the page", async () => {
    server.use(...signedOutHandlers());

    const router = renderApp("/image");

    expect(await screen.findByRole("heading", loginHeading)).toBeInTheDocument();
    expect(currentUrl(router)).toBe("/login?next=%2Fimage");
  });

  it("opens detection pages for a signed-in user", async () => {
    server.use(...signedInHandlers());

    renderApp("/image");

    expect(await screen.findByRole("heading", imageHeading)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Image" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expect(document.title).toBe("Secureye | Image Page");
    });
  });

  it("leaves a detection page when the session ends", async () => {
    server.use(...signedInHandlers());
    const router = renderApp("/image");
    await screen.findByRole("heading", imageHeading);

    setSignedOut();

    await screen.findByRole("heading", loginHeading);
    expect(currentUrl(router)).toBe("/login?next=%2Fimage");
  });

  it("keeps the original app's old addresses working", async () => {
    server.use(...signedInHandlers());

    const router = renderApp("/webcam");

    await screen.findByRole("heading", { level: 1, name: "Live detection" });
    expect(currentUrl(router)).toBe("/live");
  });

  it("shows the 404 page for unknown addresses", async () => {
    server.use(...signedOutHandlers());

    renderApp("/no-such-page");

    expect(
      await screen.findByRole("heading", { name: /page you are looking for doesn't exist/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return Home" })).toHaveAttribute("href", "/");
  });

  it("keeps the public pages up when the API is down", async () => {
    server.use(http.post("/api/v1/auth/refresh", () => HttpResponse.error()));

    renderApp("/");

    expect(await screen.findByRole("heading", homeHeading)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
  });
});

describe("header", () => {
  it("offers login and signup to visitors", async () => {
    server.use(...signedOutHandlers());

    renderApp("/");

    const header = await screen.findByRole("banner");
    expect(within(header).getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(within(header).getByRole("link", { name: "Signup" })).toHaveAttribute("href", "/signup");
  });

  it("logs out and returns home", async () => {
    let revoked = false;
    server.use(
      ...signedInHandlers(),
      http.post("/api/v1/auth/logout", () => {
        revoked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const router = renderApp("/image");
    await screen.findByRole("heading", imageHeading);

    await userEvent.click(screen.getByRole("button", { name: "Logout" }));

    await screen.findByRole("heading", homeHeading);
    expect(currentUrl(router)).toBe("/");
    expect(revoked).toBe(true);
    expect(await screen.findByRole("link", { name: "Login" })).toBeInTheDocument();
  });
});
