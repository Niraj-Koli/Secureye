import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { currentUrl, renderApp } from "@/test/renderApp";
import { apiError, server, signedInHandlers } from "@/test/server";

import type { ImageDetection } from "./api";
import { downloadImageReport } from "./imageReport";

vi.mock("./imageReport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./imageReport")>()),
  downloadImageReport: vi.fn(() => Promise.resolve()),
}));

const user = userEvent.setup();

function detectionFixture(id: number, filename = "patrol.jpg"): ImageDetection {
  return {
    id,
    created_at: "2026-10-21T09:30:00Z",
    original_filename: filename,
    width: 640,
    height: 480,
    model: "bestM",
    confidence_threshold: 0.2,
    iou_threshold: 0.3,
    inference_ms: 612,
    detections: [
      { class_name: "Soldier", confidence: 0.5234, box: { x1: 1, y1: 2, x2: 30, y2: 90 } },
      { class_name: "Rifle", confidence: 0.2891, box: { x1: 5, y1: 20, x2: 40, y2: 35 } },
    ],
    original_url: `/api/v1/files/originals/${String(id)}.jpg?sig=a`,
    annotated_url: `/api/v1/files/annotated/${String(id)}.jpg?sig=b`,
  };
}

function historyHandler(items: ImageDetection[]) {
  return http.get("/api/v1/images", () =>
    HttpResponse.json({ items, total: items.length, limit: 6, offset: 0 }),
  );
}

const photo = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "patrol.jpg", { type: "image/jpeg" });

async function chooseImage(file: File) {
  await user.upload(await screen.findByLabelText("Image"), file);
}

function reportRows() {
  const table = within(screen.getByRole("region", { name: "Report" })).getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    );
}

beforeEach(() => {
  server.use(...signedInHandlers(), historyHandler([]));
});

describe("image detection", () => {
  it("uploads the image, shows the prediction and fills the report", async () => {
    const uploads: { name: string; type: string }[] = [];
    server.use(
      http.post("/api/v1/images", async ({ request }) => {
        const image = (await request.formData()).get("image");
        if (image instanceof File) uploads.push({ name: image.name, type: image.type });
        return HttpResponse.json(detectionFixture(7), { status: 201 });
      }),
    );
    const router = renderApp("/image");

    await chooseImage(photo());

    expect(screen.getByRole("img", { name: "Original" })).toHaveAttribute(
      "src",
      "blob:test/patrol.jpg",
    );
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Predict" }));

    expect(
      await screen.findByRole("img", { name: "Prediction: 2 objects detected" }),
    ).toHaveAttribute("src", "/api/v1/files/annotated/7.jpg?sig=b");
    expect(uploads).toEqual([{ name: "patrol.jpg", type: "image/jpeg" }]);
    expect(currentUrl(router)).toBe("/image?id=7");
    expect(reportRows()).toEqual([
      ["1", "Soldier", "52%"],
      ["2", "Rifle", "29%"],
    ]);
    expect(screen.getByLabelText("Image")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => {
      expect(downloadImageReport).toHaveBeenCalledWith(detectionFixture(7));
    });
  });

  it("starts over on Reset", async () => {
    server.use(http.get("/api/v1/images/7", () => HttpResponse.json(detectionFixture(7))));
    const router = renderApp("/image?id=7");
    await screen.findByRole("img", { name: /prediction/i });

    await user.click(screen.getByRole("button", { name: "Reset" }));

    // The router updates first; React re-renders in a transition just after.
    await waitFor(() => {
      expect(screen.queryAllByRole("img", { name: /prediction|original/i })).toEqual([]);
    });
    expect(currentUrl(router)).toBe("/image");
    expect(reportRows()).toEqual([["Run a prediction to see the report."]]);
    expect(screen.getByLabelText("Image")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Predict" })).toBeDisabled();
  });

  it("refuses files the API won't accept, before uploading", async () => {
    // A browser's file dialog can still hand over other files (e.g. "All files"), so the page
    // checks too; user-event would otherwise filter by `accept` itself.
    const anyFile = userEvent.setup({ applyAccept: false });
    renderApp("/image");

    await anyFile.upload(
      await screen.findByLabelText("Image"),
      new File(["GIF89a"], "anim.gif", { type: "image/gif" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, WebP or BMP image.",
    );
    expect(screen.getByRole("button", { name: "Predict" })).toBeDisabled();
  });

  it("shows why the server rejected an upload", async () => {
    server.use(
      http.post("/api/v1/images", () =>
        apiError(422, "The file is not a valid image.", "invalid_image"),
      ),
    );
    renderApp("/image");

    await chooseImage(photo());
    await user.click(screen.getByRole("button", { name: "Predict" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The file is not a valid image.");
    expect(screen.getByRole("button", { name: "Predict" })).toBeEnabled(); // can try again
  });

  it("says so when nothing was found", async () => {
    server.use(
      http.get("/api/v1/images/8", () =>
        HttpResponse.json({ ...detectionFixture(8), detections: [] }),
      ),
    );
    renderApp("/image?id=8");

    await screen.findByRole("img", { name: "Prediction: 0 objects detected" });
    expect(reportRows()).toEqual([["No objects detected."]]);
  });
});

describe("history", () => {
  it("lists earlier detections and opens one", async () => {
    server.use(
      historyHandler([detectionFixture(9, "gate.png"), detectionFixture(7)]),
      http.get("/api/v1/images/9", () => HttpResponse.json(detectionFixture(9, "gate.png"))),
    );
    const router = renderApp("/image");

    const history = await screen.findByRole("region", { name: "History" });
    expect(await within(history).findByText("gate.png")).toBeInTheDocument();
    expect(within(history).getAllByText(/2 objects/)).toHaveLength(2);

    await user.click(within(history).getByRole("button", { name: "Open gate.png" }));

    await screen.findByRole("img", { name: /prediction/i });
    expect(currentUrl(router)).toBe("/image?id=9");
    expect(within(history).getByRole("button", { name: "Open gate.png" })).toBeDisabled();
  });

  it("deletes a detection after confirmation", async () => {
    let items = [detectionFixture(7)];
    const deleted: string[] = [];
    server.use(
      http.get("/api/v1/images", () =>
        HttpResponse.json({ items, total: items.length, limit: 6, offset: 0 }),
      ),
      http.get("/api/v1/images/7", () => HttpResponse.json(detectionFixture(7))),
      http.delete("/api/v1/images/7", () => {
        deleted.push("7");
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const router = renderApp("/image?id=7");
    const history = await screen.findByRole("region", { name: "History" });

    await user.click(await within(history).findByRole("button", { name: "Delete patrol.jpg" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this detection?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await within(history).findByText("Your image detections will be listed here."),
    ).toBeInTheDocument();
    expect(deleted).toEqual(["7"]);
    expect(currentUrl(router)).toBe("/image"); // the open detection was the deleted one
  });
});
