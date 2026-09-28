import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

/**
 * The one error → HTTP response mapping, in a module that imports nothing but
 * zod (and a node built-in) so tests can load it without the app's env/db
 * chain (the same "rules import nothing" split as athlete-state.ts and
 * guardian-rules.ts).
 *
 * A ZodError is a 400 with named issues — it carries no `status`, so without
 * this branch a typo'd email in the public intake form answered 500
 * "internal_error", which tells the caller we broke when they did. Every
 * contract-validated route benefits: the portals, and §8's service account
 * reading the same API (P3-FE-01 surfaced it; the fix is for all callers).
 *
 * THE ERROR CONVENTION a domain error may follow:
 *   - `status`  — the HTTP status (default 500)
 *   - `code`    — a stable machine-readable code for a 4xx (default
 *                 "bad_request"); a client branches on this, never on text
 *   - `details` — extra fields merged into the error body (e.g. `missing`)
 *   - `retryAfter` — seconds, sent as `Retry-After` (QA-08)
 *
 * A 5xx NEVER echoes its message (QA-03, pass 5): a Prisma error's message
 * carries server file paths and source lines, and some of these routes are
 * public. The caller gets a generic sentence and a reference; the middleware
 * logs the detail under the same reference, so support can still find it.
 */
export function errorBody(err: unknown): {
  status: number;
  body: { error: Record<string, unknown> };
  headers: Record<string, string>;
  /** Set for a 5xx only — log the real error under it. */
  reference: string | null;
} {
  if (err instanceof ZodError) {
    return {
      status: 400,
      headers: {},
      reference: null,
      body: {
        error: {
          code: "validation",
          message: "The submission failed validation.",
          issues: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
      },
    };
  }
  const e = (typeof err === "object" && err ? err : {}) as {
    status?: unknown;
    code?: unknown;
    details?: unknown;
    retryAfter?: unknown;
  };
  const status = Number(e.status) || 500;

  const headers: Record<string, string> = {};
  const retryAfter = Number(e.retryAfter);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    headers["Retry-After"] = String(Math.ceil(retryAfter));
  }

  if (status >= 500) {
    const reference = randomUUID();
    return {
      status,
      /* A 503 that knows when to come back (RewardServiceBusyError) still says
         so — the header carries no detail, only a number of seconds. */
      headers,
      reference,
      body: {
        error: {
          code: "internal_error",
          message: "Something went wrong on our side. Nothing you did caused this — try again shortly.",
          reference,
        },
      },
    };
  }

  const details =
    e.details && typeof e.details === "object" && !Array.isArray(e.details)
      ? (e.details as Record<string, unknown>)
      : {};
  return {
    status,
    headers,
    reference: null,
    body: {
      error: {
        ...details,
        code: typeof e.code === "string" && e.code ? e.code : "bad_request",
        message: err instanceof Error ? err.message : "Unknown error",
      },
    },
  };
}
