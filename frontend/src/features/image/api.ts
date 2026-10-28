import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "@/shared/api/client";
import type { components } from "@/shared/api/schema";

export type ImageDetection = components["schemas"]["ImageDetectionRead"];

/** What the API accepts (it checks the actual content, not just the name). */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];
export const MAX_IMAGE_MB = 15;
const HISTORY_PAGE_SIZE = 6;

export const imageKeys = {
  all: ["images"] as const,
  history: () => [...imageKeys.all, "history"] as const,
  detail: (id: number) => [...imageKeys.all, "detail", id] as const,
};

/** A problem with the chosen file that can be reported before uploading it, or null. */
export function imageFileProblem(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG, WebP or BMP image.";
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    return `The image is larger than ${MAX_IMAGE_MB} MB.`;
  }
  return null;
}

export function useImageDetection(id: number | null) {
  return useQuery({
    queryKey: imageKeys.detail(id ?? 0),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/images/{detection_id}", { params: { path: { detection_id: id ?? 0 } } }),
      ),
    enabled: id !== null,
  });
}

export function useDetectImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (image: File) =>
      unwrap(
        api.POST("/api/v1/images", {
          body: { image },
          bodySerializer: ({ image: file }) => {
            const form = new FormData();
            form.append("image", file);
            return form;
          },
        }),
      ),
    onSuccess: (detection) => {
      queryClient.setQueryData(imageKeys.detail(detection.id), detection);
      void queryClient.invalidateQueries({ queryKey: imageKeys.history() });
    },
  });
}

export function useImageHistory() {
  return useInfiniteQuery({
    queryKey: imageKeys.history(),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/images", {
          params: { query: { limit: HISTORY_PAGE_SIZE, offset: pageParam } },
        }),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.offset + last.items.length < last.total ? last.offset + last.items.length : undefined,
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(
        api.DELETE("/api/v1/images/{detection_id}", { params: { path: { detection_id: id } } }),
      ),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: imageKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: imageKeys.history() });
    },
  });
}
