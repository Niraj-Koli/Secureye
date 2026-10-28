import { expect, test } from "@playwright/test";

import { emailLink, failOnConsoleErrors, newUser } from "./helpers";

test("sign up, activate from the email, log in, reset the password", async ({ page, request }) => {
  const errors = failOnConsoleErrors(page, [/status of 40[01]/]); // the expected refusals below
  const user = newUser("account");

  // Sign up
  await page.goto("/signup");
  await page.getByLabel(/^Username/).fill(user.name);
  await page.getByLabel(/^Email Address/).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole("button", { name: "Signup" }).click();
  const signedUp = page.getByRole("dialog", { name: "Signup Successful" });
  await expect(signedUp).toContainText("A confirmation link has been sent to your email");
  await signedUp.getByRole("button", { name: "Login" }).click();
  // Wait for the login form: the signup form has fields with the same labels.
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { name: "Login", level: 1 })).toBeVisible();

  // Not activated yet: refused, as in the original app
  await page.getByLabel(/^Email Address/).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("dialog", { name: "Login Failed" })).toBeVisible();
  await page.getByRole("button", { name: "Okay" }).click();

  // Activate from the email
  await page.goto(await emailLink(request, user.email, "activ"));
  await expect(page.getByText("Your account is now active. You can log in.")).toBeVisible();

  // Log in, landing on the page that needed it
  await page.goto("/image");
  await expect(page).toHaveURL("/login?next=%2Fimage");
  await page.getByLabel(/^Email Address/).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page).toHaveURL("/image");

  // A reload keeps the session (refresh cookie)
  await page.reload();
  await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Login" })).toBeVisible();

  // Reset the password from the emailed link
  await page.goto("/reset-password");
  await page.getByLabel(/^Email Address/).fill(user.email);
  await page.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(page.getByRole("dialog", { name: "Reset Password Link Sent" })).toBeVisible();
  const newPassword = "Copper-Heron-77";
  await page.goto(await emailLink(request, user.email, "reset"));
  await page.getByLabel(/^New Password/).fill(newPassword);
  await page.getByLabel(/^Confirm Password/).fill(newPassword);
  await page.getByRole("button", { name: "Change" }).click();
  await expect(page.getByRole("dialog", { name: "Password Changed!" })).toBeVisible();
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Login", level: 1 })).toBeVisible();
  await page.getByLabel(/^Email Address/).fill(user.email);
  await page.getByLabel(/^Password/).fill(newPassword);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("dialog", { name: "Login Successful" })).toBeVisible();

  expect(errors).toEqual([]);
});
