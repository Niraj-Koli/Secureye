/**
 * Client side of the live-detection WebSocket (protocol: backend `app/api/live_socket.py`).
 * Plain TypeScript, no React, so it can be tested on its own.
 */

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TrackedObject {
  track_id: number;
  class_name: string;
  confidence: number;
  box: Box;
}

export interface Ready {
  session_id: number;
  source: "browser" | "camera";
  target_fps: number;
}

export interface Detections {
  frame: number;
  width: number;
  height: number;
  inference_ms: number;
  dropped_frames: number;
  objects: TrackedObject[];
}

export interface NewObject {
  event_id: number;
  track_id: number;
  class_name: string;
  confidence: number;
  detected_at: string;
}

export type StartRequest = { source: "browser" } | { source: "camera"; cameraId: number };

export interface LiveHandlers {
  onReady: (ready: Ready) => void;
  onDetections: (detections: Detections) => void;
  onNewObject: (event: NewObject) => void;
  /** Camera source only: the server-annotated frame that follows each detections message. */
  onCameraFrame: (frame: Blob) => void;
  /** A problem that doesn't end the session (e.g. one undecodable frame). */
  onWarning: (detail: string) => void;
  /** The session ended normally; `reason` is the server's (client_stopped, time_limit...). */
  onEnded: (reason: string) => void;
  /** The connection was refused or lost. */
  onFailed: (message: string) => void;
}

// Close codes the server uses (see CloseCode in the backend).
const CLOSE_MESSAGES: Record<number, string> = {
  1009: "A camera frame was too large for the server.",
  1011: "The server hit an error. Please try again.",
  1013: "The detection service isn't ready yet. Please try again in a moment.",
  4400: "The server didn't understand the request.",
  4401: "Your session has expired. Please log in again.",
  4403: "This page isn't allowed to connect to the live detection service.",
  4404: "That camera no longer exists.",
  4409: "You already have the maximum number of live sessions open (in other tabs or devices).",
};

/** How long to wait for the server's "ended" after asking it to stop. */
const STOP_TIMEOUT_MS = 5000;

export function liveSocketUrl(location: Location = window.location): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/api/v1/live/ws`;
}

export class LiveConnection {
  private socket: WebSocket | null = null;
  private finished = false;
  private started = false;
  /** Why the server refused the session (sent just before it closes the socket). */
  private refusal: string | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly url: string;
  private readonly handlers: LiveHandlers;

  constructor(url: string, handlers: LiveHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  /** Connect and start a session; the access token goes in the first message, not the URL. */
  open(request: StartRequest, accessToken: string): void {
    const socket = new WebSocket(this.url);
    socket.binaryType = "blob";
    this.socket = socket;

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "start",
          token: accessToken,
          source: request.source,
          ...(request.source === "camera" ? { camera_id: request.cameraId } : {}),
        }),
      );
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data === "string") {
        this.handleMessage(JSON.parse(event.data) as { type: string } & Record<string, unknown>);
      } else {
        // Binary: an annotated camera frame (a Blob, as binaryType asks; an ArrayBuffer is
        // accepted too).
        const data = event.data;
        this.handlers.onCameraFrame(
          data instanceof ArrayBuffer ? new Blob([data], { type: "image/jpeg" }) : (data as Blob),
        );
      }
    });
    socket.addEventListener("close", (event) => {
      clearTimeout(this.stopTimer);
      if (this.finished) return;
      this.finished = true;
      this.handlers.onFailed(
        this.refusal ??
          CLOSE_MESSAGES[event.code] ??
          "The connection to the live detection service was lost.",
      );
    });
  }

  /** Send one camera frame, unless the previous one is still on its way (keeps latency low). */
  sendFrame(frame: Blob): boolean {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN || socket.bufferedAmount > 0) return false;
    socket.send(frame);
    return true;
  }

  /** Ask the server to end the session (it saves the report and clips, then says "ended"). */
  stop(): void {
    const socket = this.socket;
    if (socket === null || this.finished) return;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "stop" }));
      this.stopTimer = setTimeout(() => {
        socket.close();
      }, STOP_TIMEOUT_MS);
    } else {
      socket.close();
    }
  }

  /** Drop the connection without waiting (leaving the page). */
  close(): void {
    this.finished = true;
    clearTimeout(this.stopTimer);
    this.socket?.close();
  }

  private handleMessage(message: { type: string } & Record<string, unknown>) {
    switch (message.type) {
      case "ready":
        this.started = true;
        this.handlers.onReady(message as unknown as Ready);
        break;
      case "detections":
        this.handlers.onDetections(message as unknown as Detections);
        break;
      case "new_object":
        this.handlers.onNewObject(message as unknown as NewObject);
        break;
      case "error": {
        const detail = typeof message.detail === "string" ? message.detail : "Unknown error.";
        // Before "ready" an error means the session was refused and the socket closes next.
        if (this.started) this.handlers.onWarning(detail);
        else this.refusal = detail;
        break;
      }
      case "ended":
        this.finished = true;
        clearTimeout(this.stopTimer);
        this.handlers.onEnded(typeof message.reason === "string" ? message.reason : "ended");
        break;
    }
  }
}
