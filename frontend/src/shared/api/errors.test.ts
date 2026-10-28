import { describe, expect, it } from "vitest";

import { ApiError, apiErrorFrom, apiErrorFromResponse, errorMessage } from "./errors";

describe("ApiError messages", () => {
  it("uses the server's message", () => {
    const error = apiErrorFrom(409, { detail: "Email already registered.", code: "email_taken" });

    expect(error).toMatchObject({ status: 409, code: "email_taken" });
    expect(error.message).toBe("Email already registered.");
  });

  it("joins validation issues without Pydantic's prefix", () => {
    const error = apiErrorFrom(422, {
      detail: [
        { loc: ["body", "password"], msg: "Value error, This password is too common." },
        { loc: ["body", "email"], msg: "value is not a valid email address" },
      ],
      code: "validation_error",
    });

    expect(error.message).toBe("This password is too common. value is not a valid email address");
  });

  it("falls back to the status for bodies it doesn't understand", async () => {
    const response = new Response("<html>Bad gateway</html>", { status: 502 });

    const error = await apiErrorFromResponse(response);

    expect(error).toMatchObject({ status: 502, code: "http_error" });
    expect(error.message).toBe("Request failed (502).");
  });
});

describe("errorMessage", () => {
  it("explains network failures and hides unexpected errors", () => {
    expect(errorMessage(new ApiError(400, "bad_request", "Invalid link."))).toBe("Invalid link.");
    expect(errorMessage(new TypeError("Failed to fetch"))).toMatch(/can't reach the server/i);
    expect(errorMessage(new Error("x is undefined"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
