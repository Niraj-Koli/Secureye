import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useState, type ReactNode } from "react";

import { errorMessage } from "@/shared/api/errors";
import { cx } from "@/shared/ui/cx";
import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import detectionStyles from "./Detection.module.css";
import styles from "./HistoryList.module.css";

export interface HistoryEntry {
  id: number;
  name: string;
  details: ReactNode;
  thumbnail?: string | undefined;
  /** Why it can't be deleted yet (e.g. still processing), or undefined if it can. */
  deleteBlockedReason?: string | undefined;
}

interface HistoryListProps {
  entries: HistoryEntry[];
  currentId: number | null;
  emptyText: string;
  error: unknown;
  hasMore: boolean;
  loadingMore: boolean;
  onShowMore: () => void;
  onOpen: (id: number) => void;
  /** Deletes the entry; resolves when done, rejects with the API error. */
  onDelete: (id: number) => Promise<unknown>;
  /** What deleting removes, e.g. "and its annotated image". */
  deleteDetail: string;
}

/** New: the user's earlier detections (the original stored results but never showed them). */
export function HistoryList({
  entries,
  currentId,
  emptyText,
  error,
  hasMore,
  loadingMore,
  onShowMore,
  onOpen,
  onDelete,
  deleteDetail,
}: HistoryListProps) {
  const [confirming, setConfirming] = useState<HistoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  async function confirmDelete() {
    if (confirming === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(confirming.id);
    } catch (problem) {
      setDeleteError(problem);
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  }

  return (
    <section
      aria-labelledby="history-heading"
      className={cx(detectionStyles.card, detectionStyles.reportCard)}
    >
      <RibbonHeading id="history-heading" tone="dark" size="small">
        History
      </RibbonHeading>

      {error !== null && (
        <Alert severity="error" className={styles.message}>
          {errorMessage(error)}
        </Alert>
      )}
      {deleteError !== null && (
        <Alert severity="error" className={styles.message}>
          {errorMessage(deleteError)}
        </Alert>
      )}
      {error === null && entries.length === 0 && <p className={styles.message}>{emptyText}</p>}

      <ul className={styles.list}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={styles.item}
            aria-current={entry.id === currentId ? "true" : undefined}
          >
            {entry.thumbnail !== undefined && (
              <img src={entry.thumbnail} alt="" loading="lazy" className={styles.thumbnail} />
            )}
            <div className={styles.details}>
              <span className={styles.name} title={entry.name}>
                {entry.name}
              </span>
              <span>{entry.details}</span>
            </div>
            <div className={styles.buttons}>
              <Button
                variant="contained"
                size="small"
                disabled={entry.id === currentId}
                onClick={() => {
                  onOpen(entry.id);
                }}
                aria-label={`Open ${entry.name}`}
              >
                Open
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="error"
                disabled={entry.deleteBlockedReason !== undefined}
                title={entry.deleteBlockedReason}
                onClick={() => {
                  setConfirming(entry);
                }}
                aria-label={`Delete ${entry.name}`}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <Button
          variant="contained"
          size="large"
          loading={loadingMore}
          onClick={onShowMore}
          className={detectionStyles.printButton}
        >
          Show more
        </Button>
      )}

      <Dialog
        open={confirming !== null}
        onClose={() => {
          setConfirming(null);
        }}
      >
        <DialogTitle className={styles.dialogTitle}>Delete this detection?</DialogTitle>
        <DialogContent className={styles.dialogText}>
          {confirming?.name} {deleteDetail} will be deleted for good.
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirming(null);
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            loading={deleting}
            onClick={() => void confirmDelete()}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
}
