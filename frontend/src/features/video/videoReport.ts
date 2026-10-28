import { formatSeconds } from "@/features/detection/format";
import { createReport } from "@/features/detection/reportPdf";

import type { VideoJob } from "./api";

/** `video_prediction_report.pdf`, laid out like the original app's (without its two blank pages). */
export async function downloadVideoReport(job: VideoJob): Promise<void> {
  const pdf = await createReport({
    title: "Video Prediction Report",
    table: {
      columns: ["No.", "Objects", "Timestamps"],
      rows: (job.tracks ?? []).map((track, index) => [
        index + 1,
        track.class_name,
        formatSeconds(track.first_seen_seconds),
      ]),
    },
  });
  pdf.save("video_prediction_report.pdf");
}
