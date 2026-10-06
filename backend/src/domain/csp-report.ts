/**
 * Content-Security-Policy violation reports — 2S8-PMO-02, owner decision 1
 * (2026-10-06).
 *
 * The web app sends its full policy as Content-Security-Policy-Report-Only
 * (frontend/next.config.ts). Browsers POST each violation to the web app's
 * /api/v1/public/csp-report, which forwards it here. Nothing is stored: a
 * report is a log line, read while the policy is tuned and before it is
 * switched to enforce.
 *
 * Two formats arrive:
 *   - `report-uri` (Firefox, Safari, older Chrome) — application/csp-report,
 *     `{ "csp-report": { "document-uri", "blocked-uri", "effective-directive", … } }`;
 *   - `report-to` (the Reporting API, Chrome) — application/reports+json, an
 *     array of `{ type: "csp-violation", url, body: { documentURL, blockedURL,
 *     effectiveDirective, … } }`.
 *
 * WHAT IS NEVER LOGGED. A report quotes the page's URL and, for some
 * violations, a sample of the offending code. Several of our URLs ARE the
 * credential (the fan's /r and /u links, ?t= confirmation links, the
 * onboarding and coming-of-age links), and a sample can hold anything typed
 * into the page. So a URL is cut to its origin and path, with any segment that
 * looks like a token replaced, and samples, referrers, user agents and the
 * policy text are dropped. What is left goes through the redacting logger,
 * which masks any email address that survived.
 */
import { logError } from "../lib/redact";

/** At most this many violations are read from one request. */
const MAX_PER_REQUEST = 20;

export type CspViolation = {
  directive: string;
  blocked: string;
  document: string;
  source: string | null;
  line: number | null;
  disposition: "report" | "enforce";
};

/* A path segment that could be a credential: 12+ characters that are not a
   plain lowercase word-with-hyphens (a page name), or anything with a dot
   in the middle (a signed link's `<id>.<expiry>.<signature>`). */
const TOKENISH = /^(?:[A-Za-z0-9_~-]{12,}|[^/]*\.[^/]*\.[^/]*)$/;
const WORDY = /^[a-z]+(?:-[a-z]+)*$/;

/** `https://host/r/AbC…xyz?t=…#f` → `https://host/r/:token`. Keywords (inline, eval…) pass. */
export function redactReportUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "-";
  if (!raw.includes(":") || /^[a-z-]+$/.test(raw)) return raw.slice(0, 40).replace(/[^a-z-]/g, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "-";
  }
  if (url.protocol === "data:" || url.protocol === "blob:") return url.protocol.slice(0, -1);
  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "ws:" && url.protocol !== "wss:") {
    return url.protocol.slice(0, -1);
  }
  /* Next's own build files are hashes, not credentials — keep them whole. */
  const keep = url.pathname.startsWith("/_next/");
  const path = url.pathname
    .split("/")
    .map((seg) => (keep || !seg || WORDY.test(seg) || !TOKENISH.test(seg) ? seg : ":token"))
    .join("/")
    .slice(0, 160);
  return `${url.origin}${path}`;
}

const directiveOf = (v: unknown): string => (typeof v === "string" ? v.split(" ")[0]!.replace(/[^a-z-]/g, "").slice(0, 40) : "") || "-";
const lineOf = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);

/** Both formats → a list of violations, each already redacted. Anything else → []. */
export function parseCspReports(body: unknown): CspViolation[] {
  const raw: Array<Record<string, unknown>> = [];
  if (Array.isArray(body)) {
    for (const r of body.slice(0, MAX_PER_REQUEST)) {
      const report = r as { type?: unknown; body?: unknown };
      if (report && report.type === "csp-violation" && report.body && typeof report.body === "object") {
        const b = report.body as Record<string, unknown>;
        raw.push({
          directive: b.effectiveDirective ?? b.violatedDirective,
          blocked: b.blockedURL,
          document: b.documentURL,
          source: b.sourceFile,
          line: b.lineNumber,
          disposition: b.disposition,
        });
      }
    }
  } else if (body && typeof body === "object" && "csp-report" in body) {
    const b = (body as Record<string, unknown>)["csp-report"];
    if (b && typeof b === "object") {
      const r = b as Record<string, unknown>;
      raw.push({
        directive: r["effective-directive"] ?? r["violated-directive"],
        blocked: r["blocked-uri"],
        document: r["document-uri"],
        source: r["source-file"],
        line: r["line-number"],
        disposition: r.disposition,
      });
    }
  }
  return raw.map((r) => ({
    directive: directiveOf(r.directive),
    blocked: redactReportUrl(r.blocked),
    document: redactReportUrl(r.document),
    source: r.source ? redactReportUrl(r.source) : null,
    line: lineOf(r.line),
    disposition: r.disposition === "enforce" ? "enforce" : "report",
  }));
}

/** One compact line per violation. Returns how many were read. */
export function recordCspReports(body: unknown, log: (line: string) => void = logError): number {
  const violations = parseCspReports(body);
  for (const v of violations) {
    log(
      `[csp-report] ${v.disposition} ${v.directive} blocked=${v.blocked} doc=${v.document}` +
        (v.source ? ` src=${v.source}${v.line !== null ? `:${v.line}` : ""}` : ""),
    );
  }
  return violations.length;
}
