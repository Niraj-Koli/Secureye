import { z } from "zod";

// The original forms' rules (Signup.jsx, Login.jsx, Password.jsx), which the API also enforces.
// The server adds the strength checks (common passwords, similarity to name or email).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[A-Za-z0-9 ]+$/;
const PASSWORD_MAX = 128; // the API's limit

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .regex(EMAIL_PATTERN, "Enter a valid email address.");

// Old rule: more than 7 characters after trimming, and no whitespace at all.
const password = z
  .string()
  .min(1, "Enter your password.")
  .regex(/^\S*$/, "Password must not contain spaces.")
  .min(8, "Password must be at least 8 characters long.")
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters long.`);

export const loginSchema = z.object({ email, password });
export type LoginValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a username.")
    .max(255, "Username must be at most 255 characters long.")
    .regex(NAME_PATTERN, "Use only letters, numbers and spaces."),
  email,
  password,
});
export type SignupValues = z.infer<typeof signupSchema>;

export const emailSchema = z.object({ email });
export type EmailValues = z.infer<typeof emailSchema>;

export const newPasswordSchema = z
  .object({
    newPassword: password,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
