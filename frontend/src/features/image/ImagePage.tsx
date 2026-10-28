import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";

import detectionStyles from "@/features/detection/Detection.module.css";
import { FileButton } from "@/features/detection/FileButton";
import { MediaFrame } from "@/features/detection/MediaFrame";
import { ReportTable, type ReportColumn } from "@/features/detection/ReportTable";
import { useChosenFile } from "@/features/detection/useChosenFile";
import { errorMessage } from "@/shared/api/errors";
import { cx } from "@/shared/ui/cx";
import { Navbar } from "@/shared/ui/Navbar";
import { Page } from "@/shared/ui/Page";
import { RibbonHeading } from "@/shared/ui/RibbonHeading";

import {
  ACCEPTED_IMAGE_TYPES,
  imageFileProblem,
  MAX_IMAGE_MB,
  useDetectImage,
  useImageDetection,
  type ImageDetection,
} from "./api";
import { ImageHistory } from "./ImageHistory";
import { confidencePercent, downloadImageReport } from "./imageReport";

type Detection = ImageDetection["detections"][number];

const COLUMNS: ReportColumn<Detection>[] = [
  { header: "No.", cell: (_row, index) => index + 1 },
  { header: "Objects", cell: (row) => row.class_name },
  { header: "Confidence", cell: (row) => confidencePercent(row.confidence) },
];

export default function ImagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const idParam = Number(searchParams.get("id"));
  const detectionId = Number.isInteger(idParam) && idParam > 0 ? idParam : null;

  const { chosen, choose, clear } = useChosenFile();
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const file = chosen?.file ?? null;

  const detect = useDetectImage();
  const result = useImageDetection(detectionId);
  const detection = detectionId === null ? undefined : result.data;
  const report = useMutation({
    mutationFn: (shown: ImageDetection) => downloadImageReport(shown),
  });

  function chooseFile(chosenFile: File) {
    const problem = imageFileProblem(chosenFile);
    setFileProblem(problem);
    if (problem === null) choose(chosenFile);
  }

  function predict() {
    if (file === null) return;
    detect.mutate(file, {
      onSuccess: (created) => {
        clear();
        setSearchParams({ id: String(created.id) });
      },
    });
  }

  function clearWork() {
    clear();
    setFileProblem(null);
    detect.reset();
    report.reset();
  }

  function reset() {
    clearWork();
    setSearchParams({});
  }

  function open(id: number) {
    clearWork();
    setSearchParams({ id: String(id) });
    window.scrollTo({ top: 0 });
  }

  function deleted(id: number) {
    if (id === detectionId) reset();
  }

  const busy = detect.isPending;
  const originalSrc = chosen?.preview ?? detection?.original_url ?? null;
  const error =
    fileProblem ??
    (detect.isError ? errorMessage(detect.error) : null) ??
    (result.isError ? errorMessage(result.error) : null) ??
    (report.isError ? `The report couldn't be created. ${errorMessage(report.error)}` : null);

  return (
    <Page title="Image Page">
      <Navbar />
      <main className={detectionStyles.page}>
        <h1 className={detectionStyles.visuallyHidden}>Image detection</h1>

        <div className={cx(detectionStyles.card, detectionStyles.uploadCard)}>
          <FileButton
            label="Image"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            disabled={busy || file !== null || detection !== undefined}
            onFile={chooseFile}
            className={detectionStyles.wideButton}
          />
          <p className={detectionStyles.hint}>JPEG, PNG, WebP or BMP, up to {MAX_IMAGE_MB} MB</p>
        </div>

        <div className={detectionStyles.frames}>
          <MediaFrame label="Original image">
            {originalSrc && (
              <img src={originalSrc} alt="Original" className={detectionStyles.media} />
            )}
          </MediaFrame>
          <MediaFrame label="Predicted image" busy={busy || result.isLoading}>
            {detection && (
              <img
                src={detection.annotated_url}
                alt={`Prediction: ${String(detection.detections.length)} objects detected`}
                className={detectionStyles.media}
              />
            )}
            {(busy || result.isLoading) && (
              <div className={detectionStyles.frameOverlay} role="status">
                <CircularProgress color="inherit" size={48} aria-hidden />
                {busy ? "Detecting…" : "Loading…"}
              </div>
            )}
          </MediaFrame>
        </div>

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
              loading={busy}
              disabled={file === null}
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
              disabled={busy || (file === null && detectionId === null && fileProblem === null)}
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
            caption="Detected objects"
            columns={COLUMNS}
            rows={detection?.detections ?? []}
            rowKey={(_row, index) => index}
            empty={detection ? "No objects detected." : "Run a prediction to see the report."}
          />
          <Button
            variant="contained"
            size="large"
            loading={report.isPending}
            disabled={detection === undefined}
            onClick={() => {
              if (detection) report.mutate(detection);
            }}
            className={detectionStyles.printButton}
          >
            Print
          </Button>
        </section>

        <ImageHistory currentId={detectionId} onOpen={open} onDeleted={deleted} />
      </main>
    </Page>
  );
}
