import { describe, expect, it } from "vitest";

import { createReport, type ReportImage } from "./reportPdf";

// A 4 x 3 px red JPEG.
const JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnqKKK8k/Qz//Z";

const image = (title: string): ReportImage => ({ title, dataUrl: JPEG, width: 4, height: 3 });

/** The text drawn on each page (jsPDF writes it uncompressed as `(text) Tj`). */
function pageTexts(pdf: Awaited<ReturnType<typeof createReport>>): string[][] {
  const pages = pdf
    .output()
    .split(/\/Type \/Page\b/)
    .slice(1);
  return pages.map((page) => [...page.matchAll(/\((.*?)\) Tj/g)].map((match) => match[1] ?? ""));
}

describe("createReport", () => {
  it("lays out the image report like the original: images first, then the analysis", async () => {
    const pdf = await createReport({
      title: "Image Prediction Report",
      images: [image("Original Image"), image("Predicted Image")],
      table: {
        heading: "Prediction Analysis",
        columns: ["No.", "Objects", "Confidence"],
        rows: [
          [1, "Soldier", "52 %"],
          [2, "Rifle", "29 %"],
        ],
      },
    });

    expect(pdf.getNumberOfPages()).toBe(2);
    const [first = [], second = []] = pageTexts(pdf);
    expect(first).toEqual(["Image Prediction Report", "Original Image", "Predicted Image"]);
    expect(second.slice(0, 1)).toEqual(["Prediction Analysis"]);
    expect(second).toEqual(
      expect.arrayContaining(["No.", "Objects", "Confidence", "Soldier", "52 %", "Rifle"]),
    );
    expect(second.at(-1)).toMatch(/Secureye$/);
  });

  it("puts the table straight under the title when there are no images", async () => {
    const pdf = await createReport({
      title: "Video Prediction Report",
      table: { columns: ["No.", "Objects", "Timestamps"], rows: [[1, "Tank", "3.2"]] },
    });

    expect(pdf.getNumberOfPages()).toBe(1);
    const [only = []] = pageTexts(pdf);
    expect(only.slice(0, 4)).toEqual(["Video Prediction Report", "No.", "Objects", "Timestamps"]);
    expect(only.at(-1)).toMatch(/Secureye$/);
  });

  it("continues long tables on new pages, clear of the footer", async () => {
    const rows = Array.from({ length: 80 }, (_, i) => [i + 1, "Soldier", "40 %"]);

    const pdf = await createReport({
      title: "Video Prediction Report",
      table: { columns: ["No.", "Objects", "Confidence"], rows },
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    const texts = pageTexts(pdf).flat();
    expect(texts.filter((t) => t === "Soldier")).toHaveLength(80);
  });
});
