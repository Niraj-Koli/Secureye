import { formatDateTime, formatDuration } from "@/features/detection/format";
import { HistoryList } from "@/features/detection/HistoryList";

import { isActive, useDeleteVideo, useVideoHistory, type VideoJob } from "./api";

const STATUS_LABEL: Record<VideoJob["status"], string> = {
  queued: "queued",
  running: "processing",
  succeeded: "done",
  failed: "failed",
  cancelled: "cancelled",
};

interface VideoHistoryProps {
  currentId: number | null;
  onOpen: (id: number) => void;
  onDeleted: (id: number) => void;
}

export function VideoHistory({ currentId, onOpen, onDeleted }: VideoHistoryProps) {
  const history = useVideoHistory();
  const remove = useDeleteVideo();
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <HistoryList
      entries={items.map((job) => ({
        id: job.id,
        name: job.original_filename,
        details: `${formatDateTime(job.created_at)} · ${formatDuration(job.duration_seconds)} · ${STATUS_LABEL[job.status]}`,
        deleteBlockedReason: isActive(job.status)
          ? "Cancel the processing before deleting it."
          : undefined,
      }))}
      currentId={currentId}
      emptyText="Your video detections will be listed here."
      error={history.error}
      hasMore={history.hasNextPage}
      loadingMore={history.isFetchingNextPage}
      onShowMore={() => void history.fetchNextPage()}
      onOpen={onOpen}
      onDelete={async (id) => {
        await remove.mutateAsync(id);
        onDeleted(id);
      }}
      deleteDetail="with its video and clips"
    />
  );
}
