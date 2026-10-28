import { createReport, imageForReport } from "@/features/detection/reportPdf";

import type { ImageDetection } from "./api";

export const confidencePercent = (confidence: number) => `${Math.round(confidence * 100)}%`;

/** `image_prediction_report.pdf`, laid out like the original app's. */
export async function downloadImageReport(detection: ImageDetection): Promise<void> {
  const [original, predicted] = await Promise.all([
    imageForReport("Original Image", detection.original_url),
    imageForReport("Predicted Image", detection.annotated_url),
  ]);
  const pdf = await createReport({
    title: "Image Prediction Report",
    images: [original, predicted],
    table: {
      heading: "Prediction Analysis",
      columns: ["No.", "Objects", "Confidence"],
      rows: detection.detections.map((d, i) => [
        i + 1,
        d.class_name,
        // The original printed "52 %" in the PDF (and "52%" on screen).
        `${Math.round(d.confidence * 100)} %`,
      ]),
    },
  });
  pdf.save("image_prediction_report.pdf");
}
