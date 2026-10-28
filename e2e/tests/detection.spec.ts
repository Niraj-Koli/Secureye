import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { createActiveUser, failOnConsoleErrors, logIn } from "./helpers";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

function reportRows(page: import("@playwright/test").Page) {
  return page.getByRole("region", { name: "Report" }).getByRole("row");
}

test("image detection: predict, report, PDF, history", async ({ page, request }) => {
  const errors = failOnConsoleErrors(page);
  await logIn(page, await createActiveUser(request, "image"), "/image");

  await page.getByLabel("Image", { exact: true }).setInputFiles(fixture("soldiers.jpg"));
  await expect(page.getByRole("img", { name: "Original" })).toBeVisible();
  await page.getByRole("button", { name: "Predict" }).click();

  await expect(page.getByRole("img", { name: /^Prediction: \d+ objects detected$/ })).toBeVisible({
    timeout: 60_000,
  });
  // The old app's own sample photo: soldiers and rifles, as in the parity test.
  await expect(reportRows(page).filter({ hasText: "Soldier" }).first()).toBeVisible();
  await expect(reportRows(page).filter({ hasText: "Rifle" }).first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Print" }).click();
  expect((await download).suggestedFilename()).toBe("image_prediction_report.pdf");

  await expect(
    page.getByRole("region", { name: "History" }).getByText("soldiers.jpg"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("video detection: live progress, report with clips, PDF", async ({ page, request }) => {
  const errors = failOnConsoleErrors(page);
  await logIn(page, await createActiveUser(request, "video"), "/video");

  await page.getByLabel("Video", { exact: true }).setInputFiles(fixture("patrol.mp4"));
  await page.getByRole("button", { name: "Predict" }).click();

  await expect(page.getByText(/^Processing: \d+%/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "Latest analysed frame" })).toBeVisible();
  await expect(page.getByText(/^Finished: \d+ objects? tracked/)).toBeVisible({
    timeout: 150_000,
  });

  await page.getByRole("button", { name: "Report" }).click();
  await expect(reportRows(page).filter({ hasText: "Soldier" }).first()).toBeVisible();

  // An object's clip plays in the browser (H.264).
  await page
    .getByRole("button", { name: /^Play clip of / })
    .first()
    .click();
  const clip = page.getByRole("dialog").locator("video");
  await expect
    .poll(() => clip.evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Close" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Print" }).click();
  expect((await download).suggestedFilename()).toBe("video_prediction_report.pdf");
  expect(errors).toEqual([]);
});

test("live detection: browser camera session is saved", async ({ page, request }) => {
  const errors = failOnConsoleErrors(page);
  await logIn(page, await createActiveUser(request, "live"), "/live");

  await page.getByRole("button", { name: "Start" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose Webcam" });
  // Chrome's fake camera is the only device; it's selected already.
  await expect(dialog.getByRole("radio").first()).toBeChecked();
  await dialog.getByRole("button", { name: "Select" }).click();

  await expect(page.getByText(/^Live · .* frames\/s analysed/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Your camera")).toBeVisible();

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText(/^Session ended \(stopped\)/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "History" }).getByText(/browser camera · .* · stopped$/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
