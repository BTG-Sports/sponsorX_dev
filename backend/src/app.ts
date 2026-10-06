/**
 * The Express application — routes and middleware only, no listen(). Kept
 * separate from src/index.ts so tests (and, later, supertest) can import the
 * app without binding a port.
 *
 * Express 5: async route handlers that reject are forwarded to the error
 * middleware automatically, so handlers throw instead of calling next(err).
 */
import express, { type ErrorRequestHandler } from "express";
import { errorBody } from "./lib/error-body";
import { healthRouter } from "./routes/health";
import { v1Router } from "./routes/v1";
import { logError } from "./lib/redact";

/** Sent on every API response (2S8-SEC-02). HSTS is the web app's job — it
 *  owns the public hostname; the API's public domain only takes webhooks. */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
};

export function createApp() {
  const app = express();

  /* 2S8-SEC-02 (OWASP A05) — don't advertise Express, and send the headers
     a JSON API wants: never sniffed as HTML, never framed, no script/style
     of any kind, no Referer. Set by hand rather than through helmet: six
     fixed headers do not justify a dependency. */
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set(API_SECURITY_HEADERS);
    next();
  });

  /* The webhook routes verify an HMAC over the bytes the sender signed, so
     the raw body is kept for them (and only them) alongside the parsed one. */
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        if ((req as { url?: string }).url?.startsWith("/api/v1/webhooks/")) (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  // Health lives outside /api/v1 so a load balancer can probe it without
  // versioning concerns.
  app.use("/health", healthRouter);

  // The Phase 1 API. Contracts are schema-first (Zod), shared with the
  // frontend — the OpenAPI spec is generated from the same Zod registry.
  app.use("/api/v1", v1Router);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found" } });
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    /* A request body that fails its Zod contract is the CALLER's mistake —
       400, as the published spec says. It used to fall through to 500
       (ZodError carries no status), which logged every bad request as an
       outage and hid, from the cross-tenant sweep, which routes never
       reached their scope check (P8-SEC-02 follow-up). Both sides of the
       2026-09-25 merge fixed this independently; errorBody() is the kept
       version because it also names the failing paths (issues[]), which
       the /join wizard's field mapping consumes (P3-FE-01). */
    const { status, body, headers, reference } = errorBody(err);
    /* The detail stays server-side (QA-03): the caller sees only the
       reference, and this line is where that reference leads. */
    if (status >= 500) logError(`[error ${reference}]`, err);
    res.set(headers).status(status).json(body);
  };
  app.use(onError);

  return app;
}
