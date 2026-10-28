import { ws } from "msw/ws";
import { describe, expect, it, vi, type Mock } from "vitest";

import { server } from "@/test/server";

import { LiveConnection, liveSocketUrl, type LiveHandlers } from "./liveConnection";

const URL = "ws://localhost:3000/api/v1/live/ws";
const socket = ws.link(URL);

type MockHandlers = { [K in keyof LiveHandlers]: Mock<LiveHandlers[K]> };

function handlers(): MockHandlers {
  return {
    onReady: vi.fn(),
    onDetections: vi.fn(),
    onNewObject: vi.fn(),
    onCameraFrame: vi.fn(),
    onWarning: vi.fn(),
    onEnded: vi.fn(),
    onFailed: vi.fn(),
  };
}

const READY = { type: "ready", session_id: 7, source: "camera", target_fps: 10 };

/**
 * MSW delivers `client.send` asynchronously but applies `client.close` at once; a real socket
 * keeps them in order. Close a moment later, as a real server's close frame would arrive.
 */
function closeAfterMessages(
  client: { close: (code?: number, reason?: string) => void },
  code?: number,
) {
  setTimeout(() => {
    client.close(code);
  }, 20);
}

describe("LiveConnection", () => {
  it("builds the socket address from the page's", () => {
    expect(liveSocketUrl({ protocol: "https:", host: "secureye.example" } as Location)).toBe(
      "wss://secureye.example/api/v1/live/ws",
    );
    expect(liveSocketUrl({ protocol: "http:", host: "localhost:5173" } as Location)).toBe(
      "ws://localhost:5173/api/v1/live/ws",
    );
  });

  it("authenticates in the first message and relays the session's messages", async () => {
    const received: unknown[] = [];
    server.use(
      socket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", (event) => {
          received.push(JSON.parse(event.data as string));
          client.send(JSON.stringify(READY));
          client.send(
            JSON.stringify({ type: "detections", frame: 1, width: 960, height: 540, objects: [] }),
          );
          client.send(new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" }));
          client.send(
            JSON.stringify({
              type: "new_object",
              event_id: 3,
              track_id: 1,
              class_name: "Soldier",
              confidence: 0.8,
              detected_at: "2026-10-21T15:04:05Z",
            }),
          );
          client.send(JSON.stringify({ type: "error", code: "bad_frame", detail: "Bad frame." }));
        });
      }),
    );
    const on = handlers();

    new LiveConnection(URL, on).open({ source: "camera", cameraId: 4 }, "access-1");

    await vi.waitFor(() => {
      expect(on.onWarning).toHaveBeenCalledWith("Bad frame.");
    });
    expect(received).toEqual([
      { type: "start", token: "access-1", source: "camera", camera_id: 4 },
    ]);
    expect(on.onReady).toHaveBeenCalledWith(READY);
    expect(on.onDetections).toHaveBeenCalledWith(expect.objectContaining({ width: 960 }));
    expect(on.onCameraFrame).toHaveBeenCalledWith(expect.any(Blob));
    expect(on.onNewObject).toHaveBeenCalledWith(
      expect.objectContaining({ event_id: 3, class_name: "Soldier" }),
    );
    expect(on.onFailed).not.toHaveBeenCalled();
  });

  it("stops: asks the server, which saves the session and says it ended", async () => {
    const received: string[] = [];
    server.use(
      socket.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", (event) => {
          const message = JSON.parse(event.data as string) as { type: string };
          received.push(message.type);
          if (message.type === "start") client.send(JSON.stringify(READY));
          if (message.type === "stop") {
            client.send(JSON.stringify({ type: "ended", reason: "client_stopped" }));
            closeAfterMessages(client);
          }
        });
      }),
    );
    const on = handlers();
    const connection = new LiveConnection(URL, on);
    connection.open({ source: "browser" }, "access-1");
    await vi.waitFor(() => {
      expect(on.onReady).toHaveBeenCalled();
    });

    connection.stop();

    await vi.waitFor(() => {
      expect(on.onEnded).toHaveBeenCalledWith("client_stopped");
    });
    expect(received).toEqual(["start", "stop"]);
    expect(on.onFailed).not.toHaveBeenCalled(); // the close after "ended" is expected
  });

  it("reports why the server refused the session", async () => {
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
          closeAfterMessages(client, 4409);
        });
      }),
    );
    const on = handlers();

    new LiveConnection(URL, on).open({ source: "browser" }, "access-1");

    await vi.waitFor(() => {
      expect(on.onFailed).toHaveBeenCalledWith("You already have 2 live sessions open.");
    });
    expect(on.onWarning).not.toHaveBeenCalled();
  });

  it("explains a refusal by close code when no reason was sent", async () => {
    server.use(
      socket.addEventListener("connection", ({ client }) => {
        client.close(4401, "not_authenticated");
      }),
    );
    const on = handlers();

    new LiveConnection(URL, on).open({ source: "browser" }, "expired");

    await vi.waitFor(() => {
      expect(on.onFailed).toHaveBeenCalledWith("Your session has expired. Please log in again.");
    });
  });

  it("doesn't send frames before the socket is open", () => {
    const connection = new LiveConnection(URL, handlers());

    expect(connection.sendFrame(new Blob(["x"]))).toBe(false);
  });
});
