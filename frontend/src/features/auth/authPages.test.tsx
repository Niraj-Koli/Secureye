import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { describe, expect, it } from "vitest";

import { useSession } from "@/shared/auth/store";
import { currentUrl, renderApp } from "@/test/renderApp";
import { apiError, demoUser, server, signedOutHandlers, tokenResponse } from "@/test/server";

const user = userEvent.setup();

/** Records the JSON bodies sent to an endpoint. */
function capture(path: string, respond: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post(path, async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

const noContent = () => new HttpResponse(null, { status: 204 });
const accepted = () => new HttpResponse(null, { status: 202 });

async function fill(label: RegExp, value: string) {
  await user.type(await screen.findByLabelText(label), value);
}

describe("login", () => {
  it("checks the fields before calling the server", async () => {
    server.use(...signedOutHandlers());
    const bodies = capture("/api/v1/auth/login", () => tokenResponse("x"));
    renderApp("/login");

    await user.click(await screen.findByRole("button", { name: "Login" }));

    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toEqual([]);
  });

  it("signs in, then continues to the page the user wanted", async () => {
    server.use(
      ...signedOutHandlers(),
      http.get("/api/v1/users/me", () => HttpResponse.json(demoUser)),
      http.get("/api/v1/images", () =>
        HttpResponse.json({ items: [], total: 0, limit: 6, offset: 0 }),
      ),
    );
    const bodies = capture("/api/v1/auth/login", () => tokenResponse("access-7"));
    const router = renderApp("/login?next=%2Fimage");

    await fill(/email address/i, "niraj.demo@example.com");
    await fill(/^password/i, "N3w-Basalt-Owl");
    await user.click(screen.getByRole("button", { name: "Login" }));

    const dialog = await screen.findByRole("dialog", { name: "Login Successful" });
    expect(dialog).toHaveTextContent("Welcome! You have successfully logged in.");
    expect(bodies).toEqual([{ email: "niraj.demo@example.com", password: "N3w-Basalt-Owl" }]);
    expect(useSession.getState()).toMatchObject({ status: "authenticated", user: demoUser });

    await user.click(within(dialog).getByRole("button", { name: "Explore" }));

    await screen.findByRole("heading", { name: "Image detection" });
    expect(currentUrl(router)).toBe("/image");
  });

  it("explains a failed login and lets the user try again", async () => {
    server.use(...signedOutHandlers());
    capture("/api/v1/auth/login", () =>
      apiError(401, "Invalid email or password.", "invalid_credentials"),
    );
    renderApp("/login");

    await fill(/email address/i, "niraj.demo@example.com");
    await fill(/^password/i, "wrong-password");
    await user.click(screen.getByRole("button", { name: "Login" }));

    const dialog = await screen.findByRole("dialog", { name: "Login Failed" });
    expect(dialog).toHaveTextContent("Invalid email or password. Please try again.");
    await user.click(within(dialog).getByRole("button", { name: "Okay" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email address/i)).toHaveValue("niraj.demo@example.com");
  });

  it("can show the password", async () => {
    server.use(...signedOutHandlers());
    renderApp("/login");
    const password = await screen.findByLabelText(/^password/i);

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("signup", () => {
  it("applies the original name and password rules", async () => {
    server.use(...signedOutHandlers());
    renderApp("/signup");

    await fill(/username/i, "Niraj!");
    await fill(/email address/i, "niraj@example.com");
    await fill(/^password/i, "has spaces in it");
    await user.click(screen.getByRole("button", { name: "Signup" }));

    expect(await screen.findByText("Use only letters, numbers and spaces.")).toBeInTheDocument();
    expect(screen.getByText("Password must not contain spaces.")).toBeInTheDocument();
  });

  it("creates the account and points to the activation email", async () => {
    server.use(...signedOutHandlers());
    const bodies = capture("/api/v1/auth/signup", () =>
      HttpResponse.json({ ...demoUser, is_active: false }, { status: 201 }),
    );
    const router = renderApp("/signup");

    await fill(/username/i, " Niraj Demo ");
    await fill(/email address/i, "niraj.demo@example.com");
    await fill(/^password/i, "N3w-Basalt-Owl");
    await user.click(screen.getByRole("button", { name: "Signup" }));

    const dialog = await screen.findByRole("dialog", { name: "Signup Successful" });
    expect(dialog).toHaveTextContent("A confirmation link has been sent to your email");
    expect(bodies).toEqual([
      { name: "Niraj Demo", email: "niraj.demo@example.com", password: "N3w-Basalt-Owl" },
    ]);

    await user.click(within(dialog).getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(currentUrl(router)).toBe("/login");
    });
  });

  it("shows the server's reason for refusing", async () => {
    server.use(...signedOutHandlers());
    capture("/api/v1/auth/signup", () =>
      apiError(409, "An account with this email already exists.", "email_already_registered"),
    );
    renderApp("/signup");

    await fill(/username/i, "Niraj Demo");
    await fill(/email address/i, "niraj.demo@example.com");
    await fill(/^password/i, "N3w-Basalt-Owl");
    await user.click(screen.getByRole("button", { name: "Signup" }));

    expect(await screen.findByRole("dialog", { name: "Signup Failed" })).toHaveTextContent(
      "An account with this email already exists.",
    );
  });
});

describe("activation", () => {
  it("activates the account from the emailed link and offers login", async () => {
    server.use(...signedOutHandlers());
    const bodies = capture("/api/v1/auth/activate", noContent);
    renderApp("/activate/MQ/tok-123");

    expect(await screen.findByText("Your account is now active. You can log in.")).toBeVisible();
    expect(within(screen.getByRole("main")).getByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(bodies).toEqual([{ uid: "MQ", token: "tok-123" }]);
  });

  it("treats a link opened twice as success", async () => {
    server.use(...signedOutHandlers());
    capture("/api/v1/auth/activate", () =>
      apiError(409, "This account is already active.", "already_active"),
    );
    renderApp("/activate/MQ/tok-123");

    expect(
      await screen.findByText("This account is already active. You can log in."),
    ).toBeVisible();
  });

  it("offers a new link when this one has expired", async () => {
    server.use(...signedOutHandlers());
    capture("/api/v1/auth/activate", () =>
      apiError(400, "This link is invalid or has expired.", "invalid_or_expired_link"),
    );
    const resent = capture("/api/v1/auth/activate/resend", accepted);
    renderApp("/activate/MQ/old-token");

    expect(await screen.findByText(/invalid or has expired/i)).toBeVisible();
    await fill(/email address/i, "niraj.demo@example.com");
    await user.click(screen.getByRole("button", { name: "Send New Link" }));

    expect(await screen.findByText(/we've sent a new link/i)).toBeVisible();
    expect(resent).toEqual([{ email: "niraj.demo@example.com" }]);
  });
});

describe("password reset", () => {
  it("requests the reset email, then returns to login", async () => {
    server.use(...signedOutHandlers());
    const bodies = capture("/api/v1/auth/password-reset", accepted);
    const router = renderApp("/reset-password");

    await fill(/email address/i, "niraj.demo@example.com");
    await user.click(await screen.findByRole("button", { name: "Send Reset Link" }));

    const dialog = await screen.findByRole("dialog", { name: "Reset Password Link Sent" });
    expect(bodies).toEqual([{ email: "niraj.demo@example.com" }]);
    await user.click(within(dialog).getByRole("button", { name: "Okay" }));
    await waitFor(() => {
      expect(currentUrl(router)).toBe("/login");
    });
  });

  it("checks that the new passwords match", async () => {
    server.use(...signedOutHandlers());
    renderApp("/password/reset/confirm/MQ/tok-9");

    await fill(/^new password/i, "N3w-Basalt-Owl");
    await fill(/^confirm password/i, "N3w-Basalt-Ow");
    await user.click(screen.getByRole("button", { name: "Change" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("sets the new password from the emailed link", async () => {
    server.use(...signedOutHandlers());
    const bodies = capture("/api/v1/auth/password-reset/confirm", noContent);
    const router = renderApp("/password/reset/confirm/MQ/tok-9");

    await fill(/^new password/i, "N3w-Basalt-Owl");
    await fill(/^confirm password/i, "N3w-Basalt-Owl");
    await user.click(screen.getByRole("button", { name: "Change" }));

    const dialog = await screen.findByRole("dialog", { name: "Password Changed!" });
    expect(bodies).toEqual([
      {
        uid: "MQ",
        token: "tok-9",
        new_password: "N3w-Basalt-Owl",
        re_new_password: "N3w-Basalt-Owl",
      },
    ]);
    await user.click(within(dialog).getByRole("button", { name: "Login" }));
    await waitFor(() => {
      expect(currentUrl(router)).toBe("/login");
    });
  });

  it("sends an expired link back to request a new one", async () => {
    server.use(...signedOutHandlers());
    capture("/api/v1/auth/password-reset/confirm", () =>
      apiError(400, "This link is invalid or has expired.", "invalid_or_expired_link"),
    );
    const router = renderApp("/password/reset/confirm/MQ/used");

    await fill(/^new password/i, "N3w-Basalt-Owl");
    await fill(/^confirm password/i, "N3w-Basalt-Owl");
    await user.click(screen.getByRole("button", { name: "Change" }));

    const dialog = await screen.findByRole("dialog", { name: "Password Change Process Failed" });
    expect(dialog).toHaveTextContent("This link is invalid or has expired.");
    await user.click(within(dialog).getByRole("button", { name: "Get a new link" }));
    await waitFor(() => {
      expect(currentUrl(router)).toBe("/reset-password");
    });
  });
});
