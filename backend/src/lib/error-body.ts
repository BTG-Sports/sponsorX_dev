import { ZodError } from "zod";

/**
 * The one error → HTTP response mapping, in a module that imports nothing but
 * zod so tests can load it without the app's env/db chain (the same
 * "rules import nothing" split as athlete-state.ts and guardian-rules.ts).
 *
 * A ZodError is a 400 with named issues — it carries no `status`, so without
 * this branch a typo'd email in the public intake form answered 500
 * "internal_error", which tells the caller we broke when they did. Every
 * contract-validated route benefits: the portals, and §8's service account
 * reading the same API (P3-FE-01 surfaced it; the fix is for all callers).
 */
export function errorBody(err: unknown): {
  status: number;
  body: { error: Record<string, unknown> };
} {
  if (err instanceof ZodError) {
    return {
      status: 400,
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
  const status =
    typeof err === "object" && err && "status" in err
      ? Number((err as { status: unknown }).status) || 500
      : 500;
  return {
    status,
    body: {
      error: {
        code: status >= 500 ? "internal_error" : "bad_request",
        message: err instanceof Error ? err.message : "Unknown error",
      },
    },
  };
}
