import { expect, test } from "@playwright/test";

import { failOnConsoleErrors } from "./helpers";

test("the home page loads cleanly under its security policy", async ({ page }) => {
  const errors = failOnConsoleErrors(page);

  const response = await page.goto("/");

  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["x-frame-options"]).toBe("DENY");
  await expect(page.getByRole("heading", { name: "Secureye Tools" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Soldiers in a ruined building" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("unknown addresses show the 404 page; the old /webcam address still works", async ({
  page,
}) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: /doesn't exist/ })).toBeVisible();

  await page.goto("/webcam");
  await expect(page).toHaveURL("/login?next=%2Flive");
});

test("API responses carry a request ID and a deny-all policy", async ({ request }) => {
  const response = await request.get("/api/v1/health/ready");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f]{32}$/);
  expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
});

test("the admin site needs a superuser", async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (a superuser)");

  await page.goto("/admin/");
  await expect(page).toHaveURL(/\/admin\/login$/);
  // SQLAdmin's labels aren't linked to their inputs; the form calls the email "username".
  await page.locator('input[name="username"]').fill(email ?? "");
  await page.locator('input[name="password"]').fill(password ?? "");
  await page.getByRole("button", { name: "Login" }).click();

  await page.goto("/admin/camera/list");
  await expect(page.getByRole("heading", { name: "Cameras" })).toBeVisible();
  // The list is newest-first and fills up with test accounts: search for this one.
  await page.goto(`/admin/user/list?search=${encodeURIComponent(email ?? "")}`);
  await expect(page.getByRole("cell", { name: email ?? "", exact: true })).toBeVisible();
});
