import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the running application (`docker compose --profile app up`), with
 * the real models. They share one stack, and detection is CPU-bound, so they run one at a time.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Video processing on a CPU takes most of a minute.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    // A missing element should fail fast, not use up the whole (long) test timeout.
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A fake camera (Chrome's test pattern) with permission granted, for the Live page.
        permissions: ["camera"],
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
});
