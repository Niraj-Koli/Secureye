import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw/http";
import { ws } from "msw/ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentUrl, renderApp } from "@/test/renderApp";
import { server, signedInHandlers } from "@/test/server";

import type { LiveSession } from "./api";

const user = userEvent.setup();
const socket = ws.link("ws://localhost:3000/api/v1/live/ws");

const NEW_SOLDIER = {
  type: "new_object",
  event_id: 31,
  track_id: 1,
  class_name: "Soldier",
  confidence: 0.81,
  detected_at: "2026-10-21T15:04:05Z",
};

function savedSession(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    id: 7,
    source: "camera",
    camera_id: 1,
    started_at: "2026-10-21T15:03:00Z",
    ended_at: "2026-10-21T15:05:30Z",
    end_reason: "client_stopped",
    model: "bestS",
    confidence_threshold: 0.4,
    iou_threshold: 0.45,
    frames_processed: 640,
    events: [
      {
        id: 31,
        track_id: 1,
        class_name: "Soldier",
        confidence: 0.81,
        detected_at: "2026-10-21T15:04:05Z",
        clip_url: "/api/v1/files/live/7/track_1_soldier.mp4?sig=x",
      },
    ],
    ...overrides,
  };
}

/** A fake camera: getUserMedia hands out a stream whose tracks can be stopped. */
function fakeCameras(options: { denied?: boolean } = {}) {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn(() =>
    options.denied
      ? Promise.reject(new DOMException("Permission denied", "NotAllowedError"))
      : Promise.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: () =>
        Promise.resolve([
          { kind: "videoinput", deviceId: "cam-1", label: "Laptop Camera", groupId: "g" },
          { kind: "audioinput", deviceId: "mic-1", label: "Microphone", groupId: "g" },
        ]),
      getUserMedia,
    },
  });
  return { getUserMedia, stopTrack };
}

let played: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  server.use(
    ...signedInHandlers(),
    http.get("/api/v1/live/cameras", () => HttpResponse.json([{ id: 1, name: "Gate camera" }])),
    http.get("/api/v1/live/sessions", () =>
      HttpResponse.json({ items: [], total: 0, limit: 6, offset: 0 }),
    ),
  );
  // jsdom can't play media; record what would have played (the alert sound, the camera).
  played = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
});

async function chooseCamera(name: string) {
  await user.click(await screen.findByRole("button", { name: "Start" }));
  const dialog = await screen.findByRole("dialog", { name: "Choose Webcam" });
  await user.click(await within(dialog).findByRole("radio", { name }));
  await user.click(within(dialog).getByRole("button", { name: "Select" }));
  // While the dialog animates out, the rest of the page is hidden from assistive technology.
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
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

describe("live detection", () => {
  it("runs a server-camera session: annotated view, report, alert, stop and saved clips", async () => {
    fakeCameras();
    const received: unknown[] = [];
    server.use(
      http.get("/api/v1/live/sessions/7", () => HttpResponse.json(savedSession())),
      socket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", (event) => {
          const message = JSON.parse(event.data as string) as { type: string };
          received.push(message);
          if (message.type === "start") {
            client.send(
              JSON.stringify({ type: "ready", session_id: 7, source: "camera", target_fps: 10 }),
            );
            client.send(
              JSON.stringify({
                type: "detections",
                frame: 1,
                width: 1280,
                height: 720,
                objects: [],
              }),
            );
            client.send(new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" }));
            client.send(JSON.stringify(NEW_SOLDIER));
          }
          if (message.type === "stop") {
            client.send(JSON.stringify({ type: "ended", reason: "client_stopped" }));
            setTimeout(() => {
              client.close();
            }, 20);
          }
        });
      }),
    );
    renderApp("/live");

    await chooseCamera("Gate camera");

    expect(
      await screen.findByText("Live · Gate camera · 1 frames/s analysed · 1 object"),
    ).toBeVisible();
    expect(received[0]).toEqual({
      type: "start",
      token: "access-1",
      source: "camera",
      camera_id: 1,
    });
    expect(screen.getByRole("img", { name: "Annotated camera view" })).toHaveAttribute(
      "src",
      expect.stringMatching(/^blob:/),
    );
    expect(reportRows()).toEqual([["1", "Soldier", "21-October-2026 03:04 PM", "—"]]);
    expect(played).toHaveBeenCalledTimes(1); // the alert sound

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("Session ended (stopped): 1 object recorded.")).toBeVisible();
    // The saved session brings each object's clip.
    expect(
      await screen.findByRole("button", { name: "Play clip of Soldier 1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("streams this device's camera to the server", async () => {
    const { getUserMedia, stopTrack } = fakeCameras();
    const starts: unknown[] = [];
    server.use(
      socket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", (event) => {
          if (typeof event.data !== "string") return;
          const message = JSON.parse(event.data) as { type: string };
          if (message.type === "start") {
            starts.push(message);
            client.send(
              JSON.stringify({ type: "ready", session_id: 8, source: "browser", target_fps: 10 }),
            );
          }
        });
      }),
    );
    renderApp("/live");

    await chooseCamera("Laptop Camera");

    expect(await screen.findByText(/^Live · Laptop Camera/)).toBeVisible();
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: { exact: "cam-1" }, width: { ideal: 1280 } },
      audio: false,
    });
    expect(starts).toEqual([{ type: "start", token: "access-1", source: "browser" }]);
    expect(screen.getByLabelText("Your camera")).toBeVisible();

    // Leaving the page turns the camera off.
    await user.click(await screen.findByRole("link", { name: "Home" }));
    await waitFor(() => {
      expect(stopTrack).toHaveBeenCalled();
    });
  });

  it("explains a refused session", async () => {
    fakeCameras();
    server.use(
      socket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", () => {
          client.send(
            JSON.stringify({
              type: "error",
              code: "too_many_sessions",
              detail: "You already have 2 live sessions open.",
            }),
          );
          setTimeout(() => {
            client.close(4409);
          }, 20);
        });
      }),
    );
    renderApp("/live");

    await chooseCamera("Gate camera");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have 2 live sessions open.",
    );
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("explains a blocked camera", async () => {
    fakeCameras({ denied: false });
    renderApp("/live");
    // Permission is withdrawn between listing the cameras and starting.
    await user.click(await screen.findByRole("button", { name: "Start" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose Webcam" });
    await within(dialog).findByRole("radiogroup", { name: "Camera" });
    fakeCameras({ denied: true });
    await user.click(within(dialog).getByRole("button", { name: "Select" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Camera access was blocked.");
  });

  it("can keep quiet", async () => {
    fakeCameras();
    server.use(
      socket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", () => {
          client.send(
            JSON.stringify({ type: "ready", session_id: 9, source: "camera", target_fps: 10 }),
          );
          setTimeout(() => {
            client.send(JSON.stringify(NEW_SOLDIER));
          }, 50);
        });
      }),
    );
    renderApp("/live");
    await user.click(await screen.findByRole("button", { name: "Turn the alert sound off" }));

    await chooseCamera("Gate camera");

    await waitFor(() => {
      expect(reportRows()).toHaveLength(1);
    });
    expect(played).not.toHaveBeenCalled();
  });
});

describe("past sessions", () => {
  it("opens a saved session with its report and clips", async () => {
    fakeCameras();
    server.use(
      http.get("/api/v1/live/sessions", () =>
        HttpResponse.json({
          items: [savedSession({ events: null })],
          total: 1,
          limit: 6,
          offset: 0,
        }),
      ),
      http.get("/api/v1/live/sessions/7", () => HttpResponse.json(savedSession())),
    );
    const router = renderApp("/live");

    const history = await screen.findByRole("region", { name: "History" });
    expect(await within(history).findByText(/server camera · 2:30 · stopped$/)).toBeInTheDocument();
    await user.click(within(history).getByRole("button", { name: "Open Session 7" }));

    expect(await screen.findByText(/^Session 7 from .*: 1 object recorded\.$/)).toBeVisible();
    expect(currentUrl(router)).toBe("/live?session=7");
    expect(reportRows()).toEqual([["1", "Soldier", "21-October-2026 03:04 PM", "Play"]]);

    await user.click(screen.getByRole("button", { name: "Play clip of Soldier 1" }));
    const dialog = await screen.findByRole("dialog", { name: /Soldier #1/ });
    expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute(
      "download",
      "track_1_soldier.mp4",
    );
  });

  it("won't delete a session that is still running", async () => {
    fakeCameras();
    server.use(
      http.get("/api/v1/live/sessions", () =>
        HttpResponse.json({
          items: [savedSession({ ended_at: null, end_reason: null, events: null })],
          total: 1,
          limit: 6,
          offset: 0,
        }),
      ),
    );
    renderApp("/live");

    const history = await screen.findByRole("region", { name: "History" });
    expect(await within(history).findByRole("button", { name: "Delete Session 7" })).toBeDisabled();
  });
});
