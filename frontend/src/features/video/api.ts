import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type VideoJob = components["schemas"]["VideoJobRead"];
export type VideoTrack = components["schemas"]["VideoTrackRead"];
export type VideoJobStatus = VideoJob["status"];

/** The API's limits (it also checks duration, resolution and that the file decodes as video). */
export const MAX_VIDEO_MB = 500;
export const MAX_VIDEO_MINUTES = 10;
const HISTORY_PAGE_SIZE = 6;

export const isActive = (status: VideoJobStatus) => status === "queued" || status === "running";

export const videoKeys = {
  all: ["videos"] as const,
  history: () => [...videoKeys.all, "history"] as const,
  detail: (id: number) => [...videoKeys.all, "detail", id] as const,
};

/** A problem with the chosen file that can be reported before uploading it, or null. */
export function videoFileProblem(file: File): string | null {
  // Some systems report no type for valid videos (e.g. .mkv); the server decides then.
  if (file.type !== "" && !file.type.startsWith("video/")) return "Choose a video file.";
  if (file.size > MAX_VIDEO_MB * 1024 * 1024)
    return `The video is larger than ${String(MAX_VIDEO_MB)} MB.`;
  return null;
}

export function useVideoJob(id: number | null) {
  return useQuery({
    queryKey: videoKeys.detail(id ?? 0),
    queryFn: () =>
      unwrap(api.GET("/api/v1/videos/{job_id}", { params: { path: { job_id: id ?? 0 } } })),
    enabled: id !== null,
  });
}

export function useUploadVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (video: File) =>
      unwrap(
        api.POST("/api/v1/videos", {
          body: { video },
          bodySerializer: ({ video: file }) => {
            const form = new FormData();
            form.append("video", file);
            return form;
          },
        }),
      ),
    onSuccess: (job) => {
      queryClient.setQueryData(videoKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: videoKeys.history() });
    },
  });
}

export function useCancelVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.POST("/api/v1/videos/{job_id}/cancel", { params: { path: { job_id: id } } })),
    onSuccess: (job) => {
      queryClient.setQueryData(videoKeys.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: videoKeys.history() });
    },
  });
}

export function useVideoHistory() {
  return useInfiniteQuery({
    queryKey: videoKeys.history(),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/videos", {
          params: { query: { limit: HISTORY_PAGE_SIZE, offset: pageParam } },
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/v1/videos/{job_id}", { params: { path: { job_id: id } } })),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: videoKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: videoKeys.history() });
    },
  });
}
