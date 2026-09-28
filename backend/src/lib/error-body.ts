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
 * The one exception is its `code`, and only from `SAFE_5XX_CODES` — a fixed
 * word such as `busy`, which lets a client say "try again" rather than
 * "we broke" (QA pass 6, P6-BE-06). The message is never echoed.
 *
 * A DATABASE CONSTRAINT THE DOMAIN DID NOT PRE-EMPT is the caller's input,
 * not an outage (QA pass 6, P6-BE-04): a foreign-key violation (Prisma P2003,
 * or Postgres 23503 through a raw query) is a 422 `invalid_reference`, and a
 * unique violation (P2002 / 23505) a 409 `conflict`. Both are GENERIC — the
 * Prisma message names the constraint and column, which is schema detail a
 * public caller has no business reading. Domain code that can say something
 * better (athlete-rate, offer, listing…) still catches these first.
 */

/** 5xx codes safe to hand back: fixed words that describe no internals. */
const SAFE_5XX_CODES: ReadonlySet<string> = new Set(["busy"]);

/** Prisma's code, or the SQLSTATE a raw query carries under P2010. */
function dbConstraint(err: unknown): "fk" | "unique" | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as {
    status?: unknown;
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };
  /* A domain error that already chose its status is never reinterpreted. */
  if (e.status !== undefined) return null;
  const state = e.meta?.driverAdapterError?.cause?.originalCode ?? e.meta?.code;
  if (e.code === "P2003" || state === "23503") return "fk";
  if (e.code === "P2002" || state === "23505") return "unique";
  return null;
}

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
  const constraint = dbConstraint(err);
  if (constraint) {
    return {
      status: constraint === "fk" ? 422 : 409,
      headers: {},
      reference: null,
      body: {
        error: constraint === "fk"
          ? { code: "invalid_reference", message: "Something this refers to doesn't exist (or isn't yours to use)." }
          : { code: "conflict", message: "That already exists — reload and try again." },
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
          code: typeof e.code === "string" && SAFE_5XX_CODES.has(e.code) ? e.code : "internal_error",
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
  /* A refusal that says what to change carries it as data too (Phase 2):
     the availability check's reasons, a restriction's conflicts, a
     listing's governance problems, an application's missing fields. Only
     for a 4xx, only these named arrays — never an arbitrary property. */
  const detail: Record<string, unknown> = {};
  if (typeof err === "object" && err) {
    for (const key of ["reasons", "conflicts", "problems", "missing"] as const) {
      const v = (err as Record<string, unknown>)[key];
      if (Array.isArray(v)) detail[key] = v;
    }
    /* And a named refusal kind, when one needs telling apart (P6-BE-08: a
       redemption cap is not the same 409 as "already used"). */
    const kind = (err as Record<string, unknown>).kind;
    if (typeof kind === "string" && /^[A-Z_]{1,40}$/.test(kind)) detail.kind = kind;
  }
  return {
    status,
    headers,
    reference: null,
    body: {
      error: {
        ...details,
        code: typeof e.code === "string" && e.code ? e.code : "bad_request",
        message: err instanceof Error ? err.message : "Unknown error",
        ...detail,
      },
    },
  };
}
