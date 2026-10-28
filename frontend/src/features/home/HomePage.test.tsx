import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/renderApp";
import { server, signedOutHandlers } from "@/test/server";

describe("home page", () => {
  it("has the original sections, in order", async () => {
    server.use(...signedOutHandlers());

    renderApp("/");

    await screen.findByRole("heading", { level: 1 });
    const main = screen.getByRole("main");
    expect(
      within(main)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(["Secureye Tools", "Image Comparison", "About Us"]);
    await waitFor(() => {
      expect(document.title).toBe("Secureye | Home Page");
    });
  });

  it("links each tool card to its page", async () => {
    server.use(...signedOutHandlers());

    renderApp("/");

    const tools = await screen.findByRole("region", { name: "Secureye Tools" });
    const links = within(tools).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Image File", "/image"],
      ["Video File", "/video"],
      ["Live Video", "/live"],
    ]);
    expect(tools).toHaveTextContent("generating timestamps for any identified object");
  });

  it("compares the photo before and after detection", async () => {
    server.use(...signedOutHandlers());

    renderApp("/");

    const compare = await screen.findByRole("region", { name: "Image Comparison" });
    expect(within(compare).getByAltText("Soldiers in a ruined building")).toBeInTheDocument();
    expect(within(compare).getByAltText(/with Secureye's detections/)).toBeInTheDocument();
    expect(within(compare).getByRole("slider")).toHaveAttribute("aria-valuenow", "50");
  });

  it("states the vision and mission", async () => {
    server.use(...signedOutHandlers());

    renderApp("/");

    const about = await screen.findByRole("region", { name: "About Us" });
    expect(within(about).getByRole("heading", { name: "Our Vision" })).toBeInTheDocument();
    expect(within(about).getByRole("heading", { name: "Our Mission" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Safeguarding Sovereignty");
  });
});
