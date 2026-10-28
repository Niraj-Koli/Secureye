import type { jsPDF } from "jspdf";

/** An image already converted to a JPEG data URL, with its pixel size (for the aspect ratio). */
export interface ReportImage {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ReportSpec {
  title: string;
  /** Up to two images, shown on the first page (image report). */
  images?: ReportImage[];
  table: {
    /** Heading of the table's own page; without images the table follows the title directly. */
    heading?: string;
    columns: string[];
    rows: (string | number)[][];
  };
}

// Layout of the original reports, in millimetres on A4 (210 x 297).
const LEFT = 10;
const RIGHT = 200;
const CENTER = 105;
const IMAGE_BOX = { width: 165, height: 110 };
const IMAGE_SLOTS = [
  { titleY: 27, imageY: 32, ruleY: 148 },
  { titleY: 157, imageY: 162, ruleY: 278 },
];
const FOOTER_TOP = 278;
// The frame is 165 mm wide: about 1300 px at 200 dpi. Larger photos only bloat the file.
const MAX_IMAGE_SIDE = 1600;

function rule(pdf: jsPDF, y: number) {
  pdf.line(LEFT, y, RIGHT, y);
}

function heading(pdf: jsPDF, text: string, top: number, textY: number, bottom: number) {
  rule(pdf, top);
  pdf.setFontSize(20);
  pdf.text(text, CENTER, textY, { align: "center" });
  rule(pdf, bottom);
}

/** Scale to fit the original's 165 x 110 mm frame without stretching (the original stretched). */
function fit(image: ReportImage) {
  const scale = Math.min(IMAGE_BOX.width / image.width, IMAGE_BOX.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** Builds a report laid out like the original app's (jsPDF is loaded only when needed). */
export async function createReport(spec: ReportSpec): Promise<jsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const pdf = new jsPDF();

  heading(pdf, spec.title, 6, 15, 19);
  let tableStart = 25;

  const images = spec.images ?? [];
  if (images.length > 0) {
    images.slice(0, IMAGE_SLOTS.length).forEach((image, index) => {
      const slot = IMAGE_SLOTS[index];
      if (slot === undefined) return;
      const { width, height } = fit(image);
      pdf.setFontSize(16);
      pdf.text(image.title, CENTER, slot.titleY, { align: "center" });
      const x = CENTER - width / 2;
      const y = slot.imageY + (IMAGE_BOX.height - height) / 2;
      pdf.addImage(image.dataUrl, "JPEG", x, y, width, height);
      rule(pdf, slot.ruleY);
    });
    pdf.addPage();
    if (spec.table.heading) heading(pdf, spec.table.heading, 7, 16, 20);
    tableStart = 28;
  }

  autoTable(pdf, {
    head: [spec.table.columns],
    body: spec.table.rows,
    startY: tableStart,
    theme: "grid",
    styles: {
      cellPadding: 2,
      fontSize: 11,
      textColor: [0, 0, 0],
      valign: "middle",
      halign: "center",
    },
    headStyles: {
      fontSize: 13,
      fillColor: [242, 242, 242],
      textColor: [0, 0, 0],
      valign: "middle",
      halign: "center",
    },
    // Keep long tables clear of the footer.
    margin: { left: 20, right: 20, bottom: 297 - FOOTER_TOP + 5 },
  });

  rule(pdf, FOOTER_TOP);
  pdf.setFontSize(20);
  pdf.setTextColor(0, 0, 0);
  pdf.text("© Secureye", CENTER, 287, { align: "center" });
  rule(pdf, 292);

  return pdf;
}

/**
 * Load an image (any format the browser can decode) and re-encode it as JPEG for the PDF.
 * Fetching it first keeps the canvas untainted, so it can be exported.
 */
export async function imageForReport(title: string, source: Blob | string): Promise<ReportImage> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("Canvas is not available.");
    context.fillStyle = "#ffffff"; // transparent PNG areas would turn black in a JPEG
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      title,
      dataUrl: canvas.toDataURL("image/jpeg", 0.9),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
