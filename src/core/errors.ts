export class AetherError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const PUBLIC_CODES = new Set([
  "unauthorized",
  "forbidden",
  "not_found",
  "bad_request",
  "rate_limited",
  "csrf",
  "conflict",
  "skill_rejected",
  "file_too_large",
  "ai_unconfigured",
  "generation_error",
  "misconfigured",
]);

export function errorBody(err: unknown): {
  error: { code: string; message: string; details?: unknown };
  status: number;
} {
  if (err instanceof AetherError) {
    const exposeDetails = err.status < 500;
    return {
      error: {
        code: err.code,
        message: err.message,
        details: exposeDetails ? err.details : undefined,
      },
      status: err.status,
    };
  }
  if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ZodError") {
    return { error: { code: "bad_request", message: "Invalid request" }, status: 400 };
  }
  const prod = process.env.NODE_ENV === "production";
  const message = err instanceof Error ? err.message : "Internal error";
  return {
    error: {
      code: "internal_error",
      message: prod ? "The AI service is temporarily unavailable. Please try again." : message,
    },
    status: 500,
  };
}

export function isPublicError(code: string): boolean {
  return PUBLIC_CODES.has(code);
}
