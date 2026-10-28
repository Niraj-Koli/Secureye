import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { eventStream } from "@/test/eventStream";
import { currentUrl, renderApp } from "@/test/renderApp";
import { server, signedInHandlers } from "@/test/server";

import type { VideoJob, VideoJobStatus } from "./api";
import { downloadVideoReport } from "./videoReport";

vi.mock("./videoReport", () => ({ downloadVideoReport: vi.fn(() => Promise.resolve()) }));

const user = userEvent.setup();

const TRACKS = [
  {
    track_id: 1,
    class_name: "Soldier",
    first_seen_seconds: 0,
    last_seen_seconds: 5.9,
    best_confidence: 0.81,
    frames: 60,
    clip_url: "/api/v1/files/clips/5/track_1.mp4?sig=c",
  },
  {
    track_id: 2,
    class_name: "Tank",
    first_seen_seconds: 3.2,
    last_seen_seconds: 5.9,
    best_confidence: 0.66,
    frames: 28,
    clip_url: null,
  },
];

function job(status: VideoJobStatus, overrides: Partial<VideoJob> = {}): VideoJob {
  return {
    id: 5,
    status,
    error: null,
    created_at: "2026-10-21T09:30:00Z",
    started_at: null,
    finished_at: null,
    original_filename: "patrol.mp4",
    width: 1280,
    height: 720,
    fps: 30,
    duration_seconds: 6,
    model: "bestM",
    confidence_threshold: 0.5,
    iou_threshold: 0.6,
    target_fps: 10,
    frames_processed: 0,
    source_url: "/api/v1/files/videos/5.mp4?sig=v",
    tracks: status === "succeeded" ? TRACKS : [],
    ...overrides,
  };
}

/** GET /videos/5 answers with whatever `current.job` is when asked. */
function jobEndpoint(initial: VideoJob) {
  const current = { job: initial };
  server.use(http.get("/api/v1/videos/5", () => HttpResponse.json(current.job)));
  return current;
}

function historyHandler(items: VideoJob[]) {
  return http.get("/api/v1/videos", () =>
    HttpResponse.json({ items, total: items.length, limit: 6, offset: 0 }),
  );
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

describe("video detection", () => {
  it("uploads, follows the processing live, then shows the report", async () => {
    const uploads: string[] = [];
    const current = jobEndpoint(job("queued"));
    const stream = eventStream();
    server.use(
      http.post("/api/v1/videos", async ({ request }) => {
        const video = (await request.formData()).get("video");
        if (video instanceof File) uploads.push(video.name);
        return HttpResponse.json(job("queued"), { status: 202 });
      }),
      http.get("/api/v1/videos/5/events", () => stream.response()),
    );
    const router = renderApp("/video");

    await user.upload(
      await screen.findByLabelText("Video"),
      new File(["video"], "patrol.mp4", { type: "video/mp4" }),
    );
    expect(screen.getByLabelText("Uploaded video")).toHaveAttribute("src", "blob:test/patrol.mp4");
    await user.click(screen.getByRole("button", { name: "Predict" }));

    expect(await screen.findByText("Queued: waiting for the video worker…")).toBeVisible();
    expect(uploads).toEqual(["patrol.mp4"]);
    expect(currentUrl(router)).toBe("/video?id=5");

    stream.send("status", { type: "status", status: "running" });
    stream.send("progress", { progress: 0.5, time_seconds: 3, tracks_found: 2 });
    stream.send("frame", { image: "AAAA", time_seconds: 3 });
    expect(
      await screen.findByText("Processing: 50% · 3.00 sec of 6.00 sec · 2 objects so far"),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Latest analysed frame" })).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,AAAA",
    );
    expect(screen.getByRole("button", { name: "Report" })).toBeDisabled();

    current.job = job("succeeded");
    stream.send("completed", { type: "completed", status: "succeeded", error: null });
    stream.close();

    expect(
      await screen.findByText("Finished: 2 objects tracked in 6.00 sec of video."),
    ).toBeVisible();
    // The last frame stays up after the end.
    expect(screen.getByRole("img", { name: "Latest analysed frame" })).toBeInTheDocument();
    expect(reportRows()).toEqual([["Processing finished. Press Report to see the results."]]);
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Report" }));

    expect(reportRows()).toEqual([
      ["1", "Soldier", "0.00 sec", "Play"],
      ["2", "Tank", "3.20 sec", "—"],
    ]);
    await user.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => {
      expect(downloadVideoReport).toHaveBeenCalledWith(job("succeeded"));
    });
  });

  it("cancels a running job", async () => {
    jobEndpoint(job("running"));
    const stream = eventStream();
    server.use(
      http.get("/api/v1/videos/5/events", () => stream.response()),
      http.post("/api/v1/videos/5/cancel", () => HttpResponse.json(job("cancelled"))),
    );
    renderApp("/video?id=5");
    stream.send("status", { type: "status", status: "running" });

    await user.click(await screen.findByRole("button", { name: "Cancel processing" }));

    expect(await screen.findByText("Cancelled.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel processing" })).not.toBeInTheDocument();
  });

  it("reconnects when the event stream drops, and catches up with the job", async () => {
    const current = jobEndpoint(job("running"));
    const streams: ReturnType<typeof eventStream>[] = [];
    server.use(
      http.get("/api/v1/videos/5/events", () => {
        const stream = eventStream();
        streams.push(stream);
        return stream.response();
      }),
    );
    renderApp("/video?id=5");
    await waitFor(() => {
      expect(streams).toHaveLength(1);
    });

    // The connection drops; meanwhile the job finished.
    current.job = job("succeeded");
    streams[0]?.close();

    expect(
      await screen.findByText("Finished: 2 objects tracked in 6.00 sec of video."),
    ).toBeVisible();
  });

  it("shows why processing failed", async () => {
    jobEndpoint(job("failed", { error: "The video could not be decoded." }));
    renderApp("/video?id=5");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Processing failed: The video could not be decoded.",
    );
    expect(screen.getByRole("button", { name: "Report" })).toBeDisabled();
  });

  it("refuses files that aren't videos", async () => {
    const anyFile = userEvent.setup({ applyAccept: false });
    renderApp("/video");

    await anyFile.upload(
      await screen.findByLabelText("Video"),
      new File(["%PDF"], "report.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a video file.");
    expect(screen.getByRole("button", { name: "Predict" })).toBeDisabled();
  });
});

describe("history and clips", () => {
  it("opens a finished job with its report, and plays an object's clip", async () => {
    server.use(historyHandler([job("succeeded")]));
    jobEndpoint(job("succeeded"));
    const router = renderApp("/video");

    const history = await screen.findByRole("region", { name: "History" });
    expect(await within(history).findByText(/0:06 · done/)).toBeInTheDocument();
    await user.click(within(history).getByRole("button", { name: "Open patrol.mp4" }));

    await waitFor(() => {
      expect(reportRows()).toHaveLength(2);
    });
    expect(currentUrl(router)).toBe("/video?id=5");
    expect(screen.getByLabelText("Uploaded video")).toHaveAttribute(
      "src",
      "/api/v1/files/videos/5.mp4?sig=v",
    );

    await user.click(screen.getByRole("button", { name: "Play clip of Soldier 1" }));
    const dialog = await screen.findByRole("dialog", { name: /Soldier #1/ });
    expect(within(dialog).getByLabelText("Clip of Soldier 1")).toHaveAttribute(
      "src",
      TRACKS[0]?.clip_url,
    );
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      "track_1_soldier.mp4",
    );
  });

  it("won't delete a job that is still processing", async () => {
    server.use(historyHandler([job("running")]));
    renderApp("/video");

    const history = await screen.findByRole("region", { name: "History" });
    expect(
      await within(history).findByRole("button", { name: "Delete patrol.mp4" }),
    ).toBeDisabled();
    expect(within(history).getByText(/processing$/)).toBeInTheDocument();
  });
});
