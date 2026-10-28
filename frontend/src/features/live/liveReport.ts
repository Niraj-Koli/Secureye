import { formatLiveTimestamp } from "@/features/detection/format";
import { createReport } from "@/features/detection/reportPdf";

export interface LiveReportRow {
  class_name: string;
  detected_at: string;
}

/**
 * New: `live_video_report.pdf` (the original Live page had no Print button), in the same layout
 * as the video report.
 */
export async function downloadLiveReport(rows: LiveReportRow[]): Promise<void> {
  const pdf = await createReport({
    title: "Live Video Report",
    table: {
      columns: ["No.", "Objects", "Timestamps"],
      rows: rows.map((row, index) => [
        index + 1,
        row.class_name,
        formatLiveTimestamp(row.detected_at),
      ]),
    },
  });
  pdf.save("live_video_report.pdf");
}
