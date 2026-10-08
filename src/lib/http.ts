import { NextResponse } from "next/server";
import { AetherError, errorBody, isPublicError } from "@/core/errors";

export function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(err: unknown) {
  const { error, status } = errorBody(err);
  return NextResponse.json({ error }, { status });
}

/** Public, already user-safe platform errors (503 "set OPENAI_MODEL", 403, …) stay readable. */
function streamErrorMessage(err: unknown): string {
  if (err instanceof AetherError && isPublicError(err.code)) return err.message;
  if (process.env.NODE_ENV === "production") return "The AI service is temporarily unavailable. Please try again.";
  const message = err instanceof Error ? err.message : "stream error";
  return /api key|secret|token|password/i.test(message) ? "stream error" : message;
}

export function sse(
  events: AsyncIterable<{ type: string }>,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const abort = () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      signal?.addEventListener("abort", abort);
      try {
        for await (const ev of events) {
          if (signal?.aborted) break;
          controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e) {
        const safe = streamErrorMessage(e);
        try {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ type: "error", error: safe })}\n\n`),
          );
        } catch {
          /* closed */
        }
      } finally {
        signal?.removeEventListener("abort", abort);
        try {
          controller.close();
        } catch {
          /* closed */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
