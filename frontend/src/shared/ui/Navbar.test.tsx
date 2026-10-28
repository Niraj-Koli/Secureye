import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { AppProviders } from "@/app/AppProviders";

import { Navbar } from "./Navbar";

function renderNavbar() {
  const router = createMemoryRouter([{ path: "*", Component: Navbar }], {
    initialEntries: ["/image"],
  });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe("Navbar", () => {
  it("links to every page and marks the current one", () => {
    renderNavbar();

    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Image", "Video", "Live Video"]);
    expect(within(nav).getByRole("link", { name: "Image" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("has a menu for small screens that closes after choosing a page", async () => {
    const router = renderNavbar();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = await screen.findByRole("presentation");
    await userEvent.click(within(menu).getByRole("link", { name: "Video" }));

    expect(router.state.location.pathname).toBe("/video");
    await waitFor(() => {
      expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
    });
  });
});
