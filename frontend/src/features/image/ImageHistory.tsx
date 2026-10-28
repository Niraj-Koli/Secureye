import { HistoryList } from "@/features/detection/HistoryList";
import { formatDateTime } from "@/features/detection/format";

import { useDeleteImage, useImageHistory, type ImageDetection } from "./api";

function objectCount(detection: ImageDetection): string {
  const count = detection.detections.length;
  return count === 1 ? "1 object" : `${String(count)} objects`;
}

interface ImageHistoryProps {
  currentId: number | null;
  onOpen: (id: number) => void;
  onDeleted: (id: number) => void;
}

export function ImageHistory({ currentId, onOpen, onDeleted }: ImageHistoryProps) {
  const history = useImageHistory();
  const remove = useDeleteImage();
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <HistoryList
      entries={items.map((item) => ({
        id: item.id,
        name: item.original_filename,
        details: `${formatDateTime(item.created_at)} · ${objectCount(item)}`,
        thumbnail: item.annotated_url,
      }))}
      currentId={currentId}
      emptyText="Your image detections will be listed here."
      error={history.error}
      hasMore={history.hasNextPage}
      loadingMore={history.isFetchingNextPage}
      onShowMore={() => void history.fetchNextPage()}
      onOpen={onOpen}
      onDelete={async (id) => {
        await remove.mutateAsync(id);
        onDeleted(id);
      }}
      deleteDetail="and its annotated image"
    />
  );
}
