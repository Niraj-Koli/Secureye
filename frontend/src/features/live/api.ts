import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type LiveSession = components["schemas"]["LiveSessionRead"];
export type LiveEvent = components["schemas"]["LiveEventRead"];
export type ServerCamera = components["schemas"]["CameraPublic"];

const HISTORY_PAGE_SIZE = 6;

/** How the server says a session ended, in words. */
export const END_REASONS: Record<string, string> = {
  client_stopped: "stopped",
  source_ended: "camera stream ended",
  time_limit: "time limit reached",
  disconnected: "connection closed",
  camera_unavailable: "camera unavailable",
  error: "error",
};

export const liveKeys = {
  all: ["live"] as const,
  cameras: () => [...liveKeys.all, "cameras"] as const,
  history: () => [...liveKeys.all, "history"] as const,
  session: (id: number) => [...liveKeys.all, "session", id] as const,
};

/** Cameras attached to the server (registered by an admin); every user may pick them. */
export function useServerCameras(enabled: boolean) {
  return useQuery({
    queryKey: liveKeys.cameras(),
    queryFn: () => unwrap(api.GET("/api/v1/live/cameras")),
    enabled,
  });
}

export function useLiveSession(id: number | null) {
  return useQuery({
    queryKey: liveKeys.session(id ?? 0),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/live/sessions/{session_id}", {
          params: { path: { session_id: id ?? 0 } },
        }),
      ),
    enabled: id !== null,
  });
}

export function useLiveHistory() {
  return useInfiniteQuery({
    queryKey: liveKeys.history(),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/live/sessions", {
          params: { query: { limit: HISTORY_PAGE_SIZE, offset: pageParam } },
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}

export function useDeleteLiveSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE("/api/v1/live/sessions/{session_id}", {
          params: { path: { session_id: id } },
        }),
      ),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: liveKeys.session(id) });
      void queryClient.invalidateQueries({ queryKey: liveKeys.history() });
    },
  });
}
