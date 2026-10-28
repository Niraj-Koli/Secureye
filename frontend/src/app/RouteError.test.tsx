import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "./AppProviders";
import { RouteError } from "./RouteError";

function renderFailingRoute(error: unknown) {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const router = createMemoryRouter([
    {
      path: "/",
      ErrorBoundary: RouteError,
      loader: () => {
        throw error;
      },
      Component: () => null,
    },
  ]);
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe("RouteError", () => {
  it("shows a friendly message instead of a crashed page", async () => {
    renderFailingRoute(new Error("Cannot read properties of undefined"));

    expect(
      await screen.findByRole("heading", { name: "Something went wrong." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/please try again/i)).toBeInTheDocument();
    expect(screen.queryByText(/cannot read properties/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return Home" })).toHaveAttribute("href", "/");
  });

  it("asks for a reload when the page's code was replaced by a new deploy", async () => {
    renderFailingRoute(
      new TypeError("Failed to fetch dynamically imported module: /assets/Video-1a2b.js"),
    );

    expect(await screen.findByText(/reload the page/i)).toBeInTheDocument();
  });
});
