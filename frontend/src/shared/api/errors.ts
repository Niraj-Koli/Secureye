/** Errors from the API, which always answers `{"detail": ..., "code": ...}` on failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: unknown;

  constructor(status: number, code: string, detail: unknown) {
    super(messageFromDetail(detail, status));
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

interface ValidationIssue {
  msg: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ValidationIssue).msg === "string"
  );
}

function messageFromDetail(detail: unknown, status: number): string {
  if (typeof detail === "string" && detail) return detail;
  // 422s carry a list of validation issues; Pydantic prefixes custom ones with "Value error, ".
  if (Array.isArray(detail) && detail.length > 0 && detail.every(isValidationIssue)) {
    return detail.map((issue) => issue.msg.replace(/^Value error, /, "")).join(" ");
  }
  return `Request failed (${status}).`;
}

/** Builds an ApiError from an error body already parsed by openapi-fetch (or anything else). */
export function apiErrorFrom(status: number, body: unknown): ApiError {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const { detail, code } = body as { detail: unknown; code?: unknown };
    return new ApiError(status, typeof code === "string" ? code : "http_error", detail);
  }
  return new ApiError(status, "http_error", null);
}

export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (e.g. a proxy error page): fall back to the status code.
  }
  return apiErrorFrom(response.status, body);
}

/** A message that is safe and useful to show to the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
