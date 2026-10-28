import { expect, type APIRequestContext, type Page } from "@playwright/test";

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
export const PASSWORD = "Granite-Lynx-42";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function newUser(label: string): TestUser {
  const id = `${String(Date.now())}${String(Math.floor(Math.random() * 1000))}`;
  return { name: `E2E ${label}`, email: `e2e.${label}.${id}@example.com`, password: PASSWORD };
}

/** The path of the first link in the newest email to `to` whose subject contains `subject`. */
export async function emailLink(
  request: APIRequestContext,
  to: string,
  subject: string,
): Promise<string> {
  let path: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAILPIT}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const { messages } = (await search.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        const message = messages.find((m) => m.Subject.toLowerCase().includes(subject));
        if (!message) return null;
        const full = (await (
          await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)
        ).json()) as {
          Text: string;
        };
        const url = /https?:\/\/\S+/.exec(full.Text)?.[0];
        path = url ? new URL(url).pathname : undefined;
        return path ?? null;
      },
      { message: `an email "${subject}" to ${to}`, timeout: 20_000 },
    )
    .not.toBeNull();
  return path ?? "";
}

/** An activated account, created through the API (the UI flow has its own test). */
export async function createActiveUser(
  request: APIRequestContext,
  label: string,
): Promise<TestUser> {
  const user = newUser(label);
  const signup = await request.post("/api/v1/auth/signup", {
    data: { name: user.name, email: user.email, password: user.password },
  });
  expect(signup.status(), await signup.text()).toBe(201);
  const [, , uid, token] = (await emailLink(request, user.email, "activ")).split("/");
  const activate = await request.post("/api/v1/auth/activate", { data: { uid, token } });
  expect(activate.status()).toBe(204);
  return user;
}

/** Log in through the login page, then continue to `next`. */
export async function logIn(page: Page, user: TestUser, next = "/"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/^Email Address/).fill(user.email);
  await page.getByLabel(/^Password/).fill(user.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("dialog", { name: "Login Successful" }).getByRole("button").click();
  await expect(page).toHaveURL(next);
}

/**
 * Collects console errors and CSP violations (call before navigating; assert the list is empty).
 * A signed-out visitor's start-up session check (`/auth/refresh` answering 401) is expected:
 * browsers log every failed request, and that one only means "not signed in".
 */
export function failOnConsoleErrors(page: Page, allowed: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location().url;
    if (url.endsWith("/api/v1/auth/refresh") && message.text().includes("401")) return;
    if (allowed.some((pattern) => pattern.test(message.text()))) return;
    errors.push(`${message.text()} (${url})`);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
