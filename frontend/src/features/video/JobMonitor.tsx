import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LinearProgress from "@mui/material/LinearProgress";
import type { ReactNode } from "react";

import detectionStyles from "@/features/detection/Detection.module.css";
import { formatSeconds } from "@/features/detection/format";
import { MediaFrame } from "@/features/detection/MediaFrame";
import { cx } from "@/shared/ui/cx";

import { isActive, type VideoJob } from "./api";
import { useJobEvents, type JobProgress } from "./useJobEvents";
import styles from "./Video.module.css";

interface JobMonitorProps {
  /** The left-hand frame (the original video). */
  original: ReactNode;
  job: VideoJob | undefined;
  uploading: boolean;
  cancelling: boolean;
  onCancel: () => void;
}

function objects(count: number): string {
  return count === 1 ? "1 object" : `${String(count)} objects`;
}

function statusText(job: VideoJob | undefined, uploading: boolean, live: JobProgress): string {
  if (uploading) return "Uploading the video…";
  if (job === undefined) return "";
  switch (job.status) {
    case "queued":
      return "Queued: waiting for the video worker…";
    case "running": {
      if (live.progress === null) return "Processing…";
      const parts = [`Processing: ${String(Math.round(live.progress * 100))}%`];
      if (live.timeSeconds !== null) {
        parts.push(`${formatSeconds(live.timeSeconds)} of ${formatSeconds(job.duration_seconds)}`);
      }
      if (live.tracksFound !== null) parts.push(`${objects(live.tracksFound)} so far`);
      return parts.join(" · ");
    }
    case "succeeded":
      return `Finished: ${objects(job.tracks?.length ?? 0)} tracked in ${formatSeconds(job.duration_seconds)} of video.`;
    case "cancelled":
      return "Cancelled.";
    case "failed":
      return "Processing failed.";
  }
}

/**
 * The live side of the Video page: the latest annotated frame while the job runs, and its
 * progress. Render it with `key={jobId}`.
 */
export function JobMonitor({ original, job, uploading, cancelling, onCancel }: JobMonitorProps) {
  const live = useJobEvents(job?.id ?? 0, job?.status);
  const active = job !== undefined && isActive(job.status);
  const working = uploading || active;
  const text = statusText(job, uploading, live);
  const determinate = job?.status === "running" && live.progress !== null;

  return (
    <>
      <div className={detectionStyles.frames}>
        {original}
        <MediaFrame label="Detection preview" busy={working}>
          {live.frame && (
            <img src={live.frame} alt="Latest analysed frame" className={detectionStyles.media} />
          )}
          {working && live.frame === null && (
            <div className={detectionStyles.frameOverlay}>
              <CircularProgress color="inherit" size={48} aria-hidden />
            </div>
          )}
        </MediaFrame>
      </div>

      {text && (
        <div className={cx(detectionStyles.card, styles.statusCard)}>
          <p className={styles.statusText} role="status">
            {text}
          </p>
          {working && (
            <LinearProgress
              color="secondary"
              className={styles.progress}
              aria-label="Processing progress"
              {...(determinate
                ? { variant: "determinate", value: Math.round((live.progress ?? 0) * 100) }
                : {})}
            />
          )}
          {active && (
            <Button variant="outlined" color="error" loading={cancelling} onClick={onCancel}>
              Cancel processing
            </Button>
          )}
        </div>
      )}
    </>
  );
}
