import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { streamEvents } from "@/shared/api/sse";

import { isActive, videoKeys, type VideoJobStatus } from "./api";

export interface JobProgress {
  /** 0..1 */
  progress: number | null;
  timeSeconds: number | null;
  tracksFound: number | null;
  /** The latest annotated preview frame, as a data URL. */
  frame: string | null;
}

const EMPTY: JobProgress = { progress: null, timeSeconds: null, tracksFound: null, frame: null };
const RECONNECT_DELAY_MS = 2000;
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Follows a running job's server-sent events: progress and the latest preview frame. Only the
 * newest frame is kept (the original appended every frame to the page). When the job ends, the
 * job query is refreshed, which brings the final status and the tracks.
 *
 * If the connection drops before the end, it checks the job and reconnects while it's active.
 * Mount it with `key={jobId}` so a different job starts from a clean state.
 */
export function useJobEvents(jobId: number, status: VideoJobStatus | undefined): JobProgress {
  const queryClient = useQueryClient();
  const [state, setState] = useState<JobProgress>(EMPTY);
  const following = status !== undefined && isActive(status);

  useEffect(() => {
    if (!following) return;
    const controller = new AbortController();
    const { signal } = controller;
    // A call, not a property read: TypeScript would otherwise assume it can't change across awaits.
    const stopped = () => signal.aborted;
    const refresh = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: videoKeys.detail(jobId) }),
        queryClient.invalidateQueries({ queryKey: videoKeys.history() }), // its status column
      ]);

    async function follow() {
      while (!stopped()) {
        try {
          for await (const message of streamEvents(`/api/v1/videos/${String(jobId)}/events`, {
            signal,
          })) {
            const data = JSON.parse(message.data) as Record<string, unknown>;
            if (message.event === "status" && typeof data.status === "string") {
              const latest = data.status as VideoJobStatus;
              queryClient.setQueryData<{ status: VideoJobStatus }>(
                videoKeys.detail(jobId),
                (job) => job && { ...job, status: latest },
              );
              void queryClient.invalidateQueries({ queryKey: videoKeys.history() });
            } else if (message.event === "progress") {
              setState((current) => ({
                ...current,
                progress: data.progress as number,
                timeSeconds: data.time_seconds as number,
                tracksFound: data.tracks_found as number,
              }));
            } else if (message.event === "frame") {
              const frame = `data:image/jpeg;base64,${data.image as string}`;
              setState((current) => ({ ...current, frame }));
            } else if (TERMINAL.has(message.event)) {
              await refresh(); // brings the final status and the tracks
              return;
            }
          }
        } catch {
          // Network error or the server restarted: fall through to check the job.
        }
        // The stream ended early (dropped connection, server restart): check, then reconnect.
        if (stopped()) return;
        await refresh();
        await wait(RECONNECT_DELAY_MS, signal);
        const job = queryClient.getQueryData<{ status: VideoJobStatus }>(videoKeys.detail(jobId));
        if (job === undefined || !isActive(job.status)) return;
      }
    }

    void follow();
    return () => {
      controller.abort();
    };
  }, [following, jobId, queryClient]);

  return state;
}
