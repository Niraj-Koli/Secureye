import { formatDateTime, formatDuration } from "@/features/detection/format";
import { HistoryList } from "@/features/detection/HistoryList";

import { END_REASONS, useDeleteLiveSession, useLiveHistory, type LiveSession } from "./api";

function describe(session: LiveSession): string {
  const source = session.source === "browser" ? "browser camera" : "server camera";
  if (session.ended_at === null) return `${formatDateTime(session.started_at)} · ${source} · live`;
  const seconds = (Date.parse(session.ended_at) - Date.parse(session.started_at)) / 1000;
  const reason = session.end_reason ? (END_REASONS[session.end_reason] ?? session.end_reason) : "";
  return [formatDateTime(session.started_at), source, formatDuration(seconds), reason]
    .filter(Boolean)
    .join(" · ");
}

interface LiveHistoryProps {
  currentId: number | null;
  onOpen: (id: number) => void;
  onDeleted: (id: number) => void;
}

/** New: past live sessions with their report rows and clips (saved by the server since Phase 5). */
export function LiveHistory({ currentId, onOpen, onDeleted }: LiveHistoryProps) {
  const history = useLiveHistory();
  const remove = useDeleteLiveSession();
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <HistoryList
      entries={items.map((session) => ({
        id: session.id,
        name: `Session ${String(session.id)}`,
        details: describe(session),
        deleteBlockedReason:
          session.ended_at === null ? "Stop the session before deleting it." : undefined,
      }))}
      currentId={currentId}
      emptyText="Your live sessions will be listed here."
      error={history.error}
      hasMore={history.hasNextPage}
      loadingMore={history.isFetchingNextPage}
      onShowMore={() => void history.fetchNextPage()}
      onOpen={onOpen}
      onDelete={async (id) => {
        await remove.mutateAsync(id);
        onDeleted(id);
      }}
      deleteDetail="with its report and clips"
    />
  );
}
