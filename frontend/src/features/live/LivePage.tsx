import VolumeOffRoundedIcon from "@mui/icons-material/VolumeOffRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { ClipDialog, type Clip } from "@/features/detection/ClipDialog";
import detectionStyles from "@/features/detection/Detection.module.css";
import { clipFileName, formatDateTime, formatLiveTimestamp } from "@/features/detection/format";
import { MediaFrame } from "@/features/detection/MediaFrame";
import { ReportTable, type ReportColumn } from "@/features/detection/ReportTable";
import { errorMessage } from "@/shared/api/errors";
import { cx } from "@/shared/ui/cx";
import { Navbar } from "@/shared/ui/Navbar";
import { Page } from "@/shared/ui/Page";
import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import { END_REASONS, useLiveSession } from "./api";
import { CameraDialog } from "./CameraDialog";
import { DetectionOverlay } from "./DetectionOverlay";
import styles from "./Live.module.css";
import { LiveHistory } from "./LiveHistory";
import { downloadLiveReport } from "./liveReport";
import { useLive, type LiveState } from "./useLive";

interface ReportRow {
  key: number;
  track_id: number;
  class_name: string;
  detected_at: string;
  clip_url: string | null;
}

function objects(count: number): string {
  return count === 1 ? "1 object" : `${String(count)} objects`;
}

function liveStatus(state: LiveState): string | null {
  const label = state.choice?.label ?? "camera";
  switch (state.phase) {
    case "starting":
      return `Connecting to ${label}…`;
    case "live":
      return [
        `Live · ${label}`,
        state.fps === null ? null : `${String(state.fps)} frames/s analysed`,
        objects(state.events.length),
      ]
        .filter(Boolean)
        .join(" · ");
    case "stopping":
      return "Stopping: saving the session…";
    case "ended": {
      const reason = state.endReason ? (END_REASONS[state.endReason] ?? state.endReason) : "";
      return `Session ended${reason ? ` (${reason})` : ""}: ${objects(state.events.length)} recorded.`;
    }
    case "idle":
    case "failed":
      return null;
  }
}

export default function LivePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = Number(searchParams.get("session"));
  const viewingId = Number.isInteger(sessionParam) && sessionParam > 0 ? sessionParam : null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    setVideo(element);
  }, []);

  const [soundOn, setSoundOn] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [playing, setPlaying] = useState<Clip | null>(null);
  const { state, start, stop } = useLive(videoRef, soundOn);
  const report = useMutation({ mutationFn: (rows: ReportRow[]) => downloadLiveReport(rows) });

  const running =
    state.phase === "starting" || state.phase === "live" || state.phase === "stopping";
  // The saved copy of a session (with its clips): one opened from the history, or the one that
  // just ended here.
  const savedId = viewingId ?? (state.phase === "ended" ? state.sessionId : null);
  const saved = useLiveSession(savedId);

  const rows: ReportRow[] =
    savedId !== null && saved.data?.events
      ? saved.data.events.map((event) => ({ ...event, key: event.id }))
      : viewingId === null
        ? state.events.map((event) => ({ ...event, key: event.event_id, clip_url: null }))
        : [];

  const columns: ReportColumn<ReportRow>[] = [
    { header: "No.", cell: (_row, index) => index + 1 },
    { header: "Objects", cell: (row) => row.class_name },
    { header: "Timestamps", cell: (row) => formatLiveTimestamp(row.detected_at) },
    {
      header: "Clip",
      cell: (row) =>
        row.clip_url ? (
          <Button
            size="small"
            variant="outlined"
            className={detectionStyles.clipButton}
            onClick={() => {
              setPlaying({
                title: `${row.class_name} #${String(row.track_id)} · ${formatLiveTimestamp(row.detected_at)}`,
                label: `Clip of ${row.class_name} ${String(row.track_id)}`,
                url: row.clip_url ?? "",
                downloadName: clipFileName(row.track_id, row.class_name),
              });
            }}
            aria-label={`Play clip of ${row.class_name} ${String(row.track_id)}`}
          >
            Play
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  function openHistory(id: number) {
    setSearchParams({ session: String(id) });
    window.scrollTo({ top: 0 });
  }

  function deleted(id: number) {
    if (id === viewingId) setSearchParams({});
  }

  const browserLive = state.choice?.kind === "browser" && running;
  const status =
    viewingId !== null && saved.data
      ? `Session ${String(viewingId)} from ${formatDateTime(saved.data.started_at)}: ${objects(rows.length)} recorded.`
      : liveStatus(state);

  return (
    <Page title="Live Video Page">
      <Navbar />
      <main className={detectionStyles.page}>
        <h1 className={detectionStyles.visuallyHidden}>Live detection</h1>

        <MediaFrame
          label="Live view"
          busy={state.phase === "starting"}
          className={styles.liveFrame}
        >
          <div className={styles.stage}>
            {/* Always mounted, so the camera can be attached before the session starts. */}
            <video
              ref={attachVideo}
              muted
              playsInline
              className={cx(styles.video, !browserLive && styles.hidden)}
              aria-label="Your camera"
            />
            {browserLive && <DetectionOverlay detections={state.detections} video={video} />}
            {state.choice?.kind === "camera" && running && state.cameraFrame && (
              <img
                src={state.cameraFrame}
                alt="Annotated camera view"
                className={detectionStyles.media}
              />
            )}
            {state.phase === "starting" && (
              <div className={detectionStyles.frameOverlay}>
                <CircularProgress color="inherit" size={48} aria-hidden />
              </div>
            )}
          </div>
        </MediaFrame>

        {status && (
          <div className={cx(detectionStyles.card, styles.statusCard)}>
            <p className={styles.statusText} role="status">
              {state.phase === "live" && viewingId === null && (
                <span className={styles.liveDot} aria-hidden />
              )}
              {status}
            </p>
          </div>
        )}

        {state.phase === "failed" && state.message && (
          <Alert severity="error" className={detectionStyles.alert}>
            {state.message}
          </Alert>
        )}
        {running && state.warning && (
          <Alert severity="warning" className={detectionStyles.alert}>
            {state.warning}
          </Alert>
        )}
        {saved.isError && (
          <Alert severity="error" className={detectionStyles.alert}>
            {errorMessage(saved.error)}
          </Alert>
        )}

        <div className={detectionStyles.actions}>
          <div className={cx(detectionStyles.card, detectionStyles.actionCard)}>
            <Button
              variant="contained"
              size="large"
              loading={state.phase === "starting"}
              disabled={running}
              onClick={() => {
                setChoosing(true);
              }}
              className={detectionStyles.actionButton}
            >
              Start
            </Button>
          </div>
          <div className={cx(detectionStyles.card, detectionStyles.actionCard)}>
            <Button
              variant="contained"
              size="large"
              loading={state.phase === "stopping"}
              disabled={!(state.phase === "live" || state.phase === "starting")}
              onClick={stop}
              className={detectionStyles.actionButton}
            >
              Stop
            </Button>
          </div>
          <IconButton
            onClick={() => {
              setSoundOn((on) => !on);
            }}
            aria-label={soundOn ? "Turn the alert sound off" : "Turn the alert sound on"}
            aria-pressed={!soundOn}
            title={soundOn ? "Alert sound on" : "Alert sound off"}
          >
            {soundOn ? (
              <VolumeUpRoundedIcon fontSize="large" />
            ) : (
              <VolumeOffRoundedIcon fontSize="large" />
            )}
          </IconButton>
        </div>

        <section
          aria-labelledby="report-heading"
          className={cx(detectionStyles.card, detectionStyles.reportCard)}
        >
          <RibbonHeading id="report-heading" tone="dark" size="small">
            Report
          </RibbonHeading>
          <ReportTable
            caption="Objects seen"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            empty={
              running || viewingId !== null || state.phase === "ended"
                ? "No objects seen yet."
                : "Start a session to see the report."
            }
          />
          <Button
            variant="contained"
            size="large"
            loading={report.isPending}
            disabled={rows.length === 0}
            onClick={() => {
              report.mutate(rows);
            }}
            className={detectionStyles.printButton}
          >
            Print
          </Button>
        </section>

        <LiveHistory currentId={viewingId} onOpen={openHistory} onDeleted={deleted} />
      </main>

      <CameraDialog
        open={choosing}
        onClose={() => {
          setChoosing(false);
        }}
        onSelect={(choice) => {
          setChoosing(false);
          setSearchParams({});
          void start(choice);
        }}
      />
      <ClipDialog
        clip={playing}
        onClose={() => {
          setPlaying(null);
        }}
      />
    </Page>
  );
}
