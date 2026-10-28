import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { ClipDialog, type Clip } from "@/features/detection/ClipDialog";
import detectionStyles from "@/features/detection/Detection.module.css";
import { FileButton } from "@/features/detection/FileButton";
import { clipFileName, formatSeconds } from "@/features/detection/format";
import { MediaFrame } from "@/features/detection/MediaFrame";
import { ReportTable, type ReportColumn } from "@/features/detection/ReportTable";
import { useChosenFile } from "@/features/detection/useChosenFile";
import { errorMessage } from "@/shared/api/errors";
import { cx } from "@/shared/ui/cx";
import { Navbar } from "@/shared/ui/Navbar";
import { Page } from "@/shared/ui/Page";
import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import {
  MAX_VIDEO_MB,
  MAX_VIDEO_MINUTES,
  useCancelVideo,
  useUploadVideo,
  useVideoJob,
  videoFileProblem,
  videoKeys,
  type VideoJob,
  type VideoTrack,
} from "./api";
import { JobMonitor } from "./JobMonitor";
import { VideoHistory } from "./VideoHistory";
import { downloadVideoReport } from "./videoReport";

export default function VideoPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const idParam = Number(searchParams.get("id"));
  const jobId = Number.isInteger(idParam) && idParam > 0 ? idParam : null;

  const { chosen, choose, clear } = useChosenFile();
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  // As in the original, the table fills when Report is pressed (once processing has finished).
  const [reportFor, setReportFor] = useState<number | null>(null);
  const [playing, setPlaying] = useState<Clip | null>(null);

  const upload = useUploadVideo();
  const cancel = useCancelVideo();
  const jobQuery = useVideoJob(jobId);
  const job = jobId === null ? undefined : jobQuery.data;
  const report = useMutation({ mutationFn: (shown: VideoJob) => downloadVideoReport(shown) });

  const file = chosen?.file ?? null;
  const finished = job?.status === "succeeded";
  const showReport = finished && reportFor === jobId;

  function chooseFile(chosenFile: File) {
    const problem = videoFileProblem(chosenFile);
    setFileProblem(problem);
    if (problem === null) choose(chosenFile);
  }

  function predict() {
    if (file === null) return;
    upload.mutate(file, {
      onSuccess: (created) => {
        setSearchParams({ id: String(created.id) });
      },
    });
  }

  function clearWork() {
    clear();
    setFileProblem(null);
    setReportFor(null);
    upload.reset();
    cancel.reset();
    report.reset();
  }

  function reset() {
    clearWork();
    setSearchParams({});
  }

  function open(id: number) {
    clearWork();
    setReportFor(id); // a finished job from the history shows its report straight away
    setSearchParams({ id: String(id) });
    window.scrollTo({ top: 0 });
  }

  function deleted(id: number) {
    if (id === jobId) reset();
  }

  function loadReport() {
    if (jobId === null) return;
    setReportFor(jobId);
    // Fresh signed links for the clips.
    void queryClient.invalidateQueries({ queryKey: videoKeys.detail(jobId) });
  }

  const columns: ReportColumn<VideoTrack>[] = [
    { header: "No.", cell: (_row, index) => index + 1 },
    { header: "Objects", cell: (row) => row.class_name },
    { header: "Timestamps", cell: (row) => formatSeconds(row.first_seen_seconds) },
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
                title: `${row.class_name} #${String(row.track_id)} · first seen at ${formatSeconds(row.first_seen_seconds)}`,
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

  // The original video: the local file before upload, the stored copy afterwards.
  const originalSrc = chosen?.preview ?? job?.source_url ?? null;
  const error =
    fileProblem ??
    (upload.isError ? errorMessage(upload.error) : null) ??
    (jobQuery.isError ? errorMessage(jobQuery.error) : null) ??
    (cancel.isError ? errorMessage(cancel.error) : null) ??
    (job?.status === "failed" ? `Processing failed: ${job.error ?? "unknown error"}` : null) ??
    (report.isError ? `The report couldn't be created. ${errorMessage(report.error)}` : null);

  return (
    <Page title="Video Page">
      <Navbar />
      <main className={detectionStyles.page}>
        <h1 className={detectionStyles.visuallyHidden}>Video detection</h1>

        <div className={cx(detectionStyles.card, detectionStyles.uploadCard)}>
          <FileButton
            label="Video"
            accept="video/*"
            disabled={upload.isPending || file !== null || job !== undefined}
            onFile={chooseFile}
            className={detectionStyles.wideButton}
          />
          <p className={detectionStyles.hint}>
            Up to {MAX_VIDEO_MB} MB and {MAX_VIDEO_MINUTES} minutes
          </p>
        </div>

        <JobMonitor
          key={jobId ?? "none"}
          job={job}
          uploading={upload.isPending}
          cancelling={cancel.isPending}
          onCancel={() => {
            if (jobId !== null) cancel.mutate(jobId);
          }}
          original={
            <MediaFrame label="Original video">
              {originalSrc && (
                <video
                  src={originalSrc}
                  controls
                  muted
                  className={detectionStyles.media}
                  aria-label="Uploaded video"
                />
              )}
            </MediaFrame>
          }
        />

        {error && (
          <Alert severity="error" className={detectionStyles.alert}>
            {error}
          </Alert>
        )}

        <div className={detectionStyles.actions}>
          <div className={cx(detectionStyles.card, detectionStyles.actionCard)}>
            <Button
              variant="contained"
              size="large"
              loading={upload.isPending}
              disabled={file === null || job !== undefined}
              onClick={predict}
              className={detectionStyles.actionButton}
            >
              Predict
            </Button>
          </div>
          <div className={cx(detectionStyles.card, detectionStyles.actionCard)}>
            <Button
              variant="contained"
              size="large"
              disabled={!finished}
              onClick={loadReport}
              className={detectionStyles.actionButton}
            >
              Report
            </Button>
          </div>
          <div className={cx(detectionStyles.card, detectionStyles.actionCard)}>
            <Button
              variant="contained"
              size="large"
              disabled={
                upload.isPending || (file === null && jobId === null && fileProblem === null)
              }
              onClick={reset}
              className={detectionStyles.actionButton}
            >
              Reset
            </Button>
          </div>
        </div>

        <section
          aria-labelledby="report-heading"
          className={cx(detectionStyles.card, detectionStyles.reportCard)}
        >
          <RibbonHeading id="report-heading" tone="dark" size="small">
            Report
          </RibbonHeading>
          <ReportTable
            caption="Tracked objects"
            columns={columns}
            rows={showReport ? (job.tracks ?? []) : []}
            rowKey={(row) => row.track_id}
            empty={
              showReport
                ? "No objects were tracked."
                : finished
                  ? "Processing finished. Press Report to see the results."
                  : "Run a prediction to see the report."
            }
          />
          <Button
            variant="contained"
            size="large"
            loading={report.isPending}
            disabled={!showReport}
            onClick={() => {
              if (job) report.mutate(job);
            }}
            className={detectionStyles.printButton}
          >
            Print
          </Button>
        </section>

        <VideoHistory currentId={jobId} onOpen={open} onDeleted={deleted} />
      </main>

      <ClipDialog
        clip={playing}
        onClose={() => {
          setPlaying(null);
        }}
      />
    </Page>
  );
}
