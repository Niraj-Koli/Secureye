import { describe, expect, it } from "vitest";

import { loginSchema, newPasswordSchema, signupSchema } from "./schemas";

function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : (result.error?.issues[0]?.message ?? null);
}

describe("the original form rules", () => {
  it("accepts a valid signup and trims the name and email", () => {
    const result = signupSchema.parse({
      name: "  Niraj Demo ",
      email: " niraj@example.com ",
      password: "N3w-Basalt-Owl",
    });

    expect(result).toEqual({
      name: "Niraj Demo",
      email: "niraj@example.com",
      password: "N3w-Basalt-Owl",
    });
  });

  it.each([
    ["Niraj!", "Use only letters, numbers and spaces."],
    ["   ", "Enter a username."],
  ])("rejects the name %j", (name, message) => {
    expect(
      firstError(signupSchema.safeParse({ name, email: "a@b.co", password: "Long-enough1" })),
    ).toBe(message);
  });

  it.each([
    ["", "Enter your email address."],
    ["niraj@example", "Enter a valid email address."],
    ["niraj example@x.com", "Enter a valid email address."],
  ])("rejects the email %j", (email, message) => {
    expect(firstError(loginSchema.safeParse({ email, password: "Long-enough1" }))).toBe(message);
  });

  it.each([
    ["", "Enter your password."],
    ["short1", "Password must be at least 8 characters long."],
    ["has a space", "Password must not contain spaces."],
    ["x".repeat(129), "Password must be at most 128 characters long."],
  ])("rejects the password %j", (password, message) => {
    expect(firstError(loginSchema.safeParse({ email: "a@b.co", password }))).toBe(message);
  });

  it("requires the new passwords to match", () => {
    const result = newPasswordSchema.safeParse({
      newPassword: "N3w-Basalt-Owl",
      confirmPassword: "N3w-Basalt-Owl!",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    });
  });
});
