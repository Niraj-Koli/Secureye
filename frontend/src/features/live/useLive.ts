import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer, useRef, type RefObject } from "react";

import alertSound from "@/assets/sounds/alert.mp3";
import { refreshAccessToken } from "@/shared/api/refresh";

import { liveKeys } from "./api";
import {
  LiveConnection,
  liveSocketUrl,
  type Detections,
  type NewObject,
  type Ready,
} from "./liveConnection";

export type CameraChoice =
  | { kind: "browser"; deviceId: string; label: string }
  | { kind: "camera"; cameraId: number; label: string };

export type LivePhase = "idle" | "starting" | "live" | "stopping" | "ended" | "failed";

export interface LiveState {
  phase: LivePhase;
  choice: CameraChoice | null;
  sessionId: number | null;
  detections: Detections | null;
  /** One row per newly seen object, as announced by the server. */
  events: NewObject[];
  /** Frames analysed per second, measured over the last second. */
  fps: number | null;
  /** Camera source: the latest annotated frame from the server, as an object URL. */
  cameraFrame: string | null;
  endReason: string | null;
  message: string | null;
  warning: string | null;
}

type Action =
  | { type: "starting"; choice: CameraChoice }
  | { type: "ready"; ready: Ready }
  | { type: "detections"; detections: Detections; fps: number }
  | { type: "new_object"; event: NewObject }
  | { type: "camera_frame"; url: string }
  | { type: "warning"; detail: string }
  | { type: "stopping" }
  | { type: "ended"; reason: string }
  | { type: "failed"; message: string };

const INITIAL: LiveState = {
  phase: "idle",
  choice: null,
  sessionId: null,
  detections: null,
  events: [],
  fps: null,
  cameraFrame: null,
  endReason: null,
  message: null,
  warning: null,
};

function reducer(state: LiveState, action: Action): LiveState {
  switch (action.type) {
    case "starting":
      return { ...INITIAL, phase: "starting", choice: action.choice };
    case "ready":
      return { ...state, phase: "live", sessionId: action.ready.session_id };
    case "detections":
      return { ...state, detections: action.detections, fps: action.fps };
    case "new_object":
      return { ...state, events: [...state.events, action.event] };
    case "camera_frame":
      return { ...state, cameraFrame: action.url };
    case "warning":
      return { ...state, warning: action.detail };
    case "stopping":
      return { ...state, phase: "stopping" };
    case "ended":
      return { ...state, phase: "ended", endReason: action.reason, detections: null };
    case "failed":
      return { ...state, phase: "failed", message: action.message, detections: null };
  }
}

// Frames sent to the server are scaled down to this width: plenty for the model (it works at
// 640 px) and a fraction of the upload of full-size camera frames.
const MAX_FRAME_WIDTH = 960;
const JPEG_QUALITY = 0.7;

/**
 * Runs a live-detection session. Browser source: shows the camera in `videoRef` and sends its
 * frames at the server's target rate. Camera source: the server reads the camera and sends
 * annotated frames back. Either way, new objects are announced with the alert sound.
 */
export function useLive(videoRef: RefObject<HTMLVideoElement | null>, soundOn: boolean) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const connection = useRef<LiveConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const capture = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cameraFrame = useRef<string | null>(null);
  const analysedAt = useRef<number[]>([]);
  const sound = useRef<HTMLAudioElement | null>(null);
  // Read by the socket callbacks, which outlive renders.
  const soundEnabled = useRef(soundOn);
  useEffect(() => {
    soundEnabled.current = soundOn;
  }, [soundOn]);

  function stopCapture() {
    clearInterval(capture.current);
    capture.current = undefined;
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function releaseCameraFrame() {
    if (cameraFrame.current) URL.revokeObjectURL(cameraFrame.current);
    cameraFrame.current = null;
  }

  function finish() {
    stopCapture();
    connection.current = null;
    void queryClient.invalidateQueries({ queryKey: liveKeys.history() });
  }

  function playAlert() {
    if (!soundEnabled.current) return;
    sound.current ??= new Audio(alertSound);
    sound.current.currentTime = 0;
    // Browsers may refuse until the user has interacted with the page; Start counts as that.
    sound.current.play().catch(() => undefined);
  }

  function startSending(targetFps: number) {
    const canvas = document.createElement("canvas");
    let encoding = false;
    capture.current = setInterval(
      () => {
        const video = videoRef.current;
        const live = connection.current;
        if (!video || !live || encoding || video.readyState < 2 || video.videoWidth === 0) return;
        const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        encoding = true;
        canvas.toBlob(
          (blob) => {
            encoding = false;
            if (blob) live.sendFrame(blob);
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      },
      Math.round(1000 / targetFps),
    );
  }

  async function start(choice: CameraChoice) {
    connection.current?.close();
    stopCapture();
    releaseCameraFrame();
    dispatch({ type: "starting", choice });

    try {
      if (choice.kind === "browser") {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: choice.deviceId }, width: { ideal: 1280 } },
          audio: false,
        });
        stream.current = media;
        const video = videoRef.current;
        if (video) {
          video.srcObject = media;
          await video.play();
        }
      }
      // A fresh token: the socket may outlive a 15-minute access token, but only the first
      // message is authenticated.
      const token = await refreshAccessToken();
      if (token === null) {
        stopCapture();
        dispatch({ type: "failed", message: "Your session has expired. Please log in again." });
        return;
      }

      const live = new LiveConnection(liveSocketUrl(), {
        onReady: (ready) => {
          dispatch({ type: "ready", ready });
          void queryClient.invalidateQueries({ queryKey: liveKeys.history() }); // list it as live
          if (choice.kind === "browser") startSending(ready.target_fps);
        },
        onDetections: (detections) => {
          const now = performance.now();
          analysedAt.current = [...analysedAt.current.filter((t) => now - t < 1000), now];
          dispatch({ type: "detections", detections, fps: analysedAt.current.length });
        },
        onNewObject: (event) => {
          dispatch({ type: "new_object", event });
          playAlert();
        },
        onCameraFrame: (frame) => {
          releaseCameraFrame();
          cameraFrame.current = URL.createObjectURL(frame);
          dispatch({ type: "camera_frame", url: cameraFrame.current });
        },
        onWarning: (detail) => {
          dispatch({ type: "warning", detail });
        },
        onEnded: (reason) => {
          finish();
          dispatch({ type: "ended", reason });
        },
        onFailed: (message) => {
          finish();
          dispatch({ type: "failed", message });
        },
      });
      connection.current = live;
      live.open(
        choice.kind === "browser"
          ? { source: "browser" }
          : { source: "camera", cameraId: choice.cameraId },
        token,
      );
    } catch (error) {
      stopCapture();
      dispatch({ type: "failed", message: cameraErrorMessage(error) });
    }
  }

  function stop() {
    // Stop sending at once; the server saves the session and replies "ended".
    clearInterval(capture.current);
    dispatch({ type: "stopping" });
    connection.current?.stop();
  }

  // Leaving the page ends the session (the server saves it as "disconnected").
  useEffect(
    () => () => {
      connection.current?.close();
      stopCapture();
      releaseCameraFrame();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
    [],
  );

  return { state, start, stop };
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera access was blocked. Allow it in your browser's site settings and try again.";
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "That camera isn't available any more. Choose another one.";
    }
    if (error.name === "NotReadableError") {
      return "The camera is in use by another application.";
    }
  }
  return "The camera couldn't be started.";
}
