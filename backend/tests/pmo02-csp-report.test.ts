import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-PMO-02, owner decision 1 — the CSP report endpoint.

   The web app sends its full policy report-only and points report-uri /
   report-to at its own /api/v1/public/csp-report, which it forwards here.
   Pinned: both browser formats are read; each violation is ONE log line
   through the redacting logger; nothing that could be a credential (a token
   path segment, a query string, a code sample) or an address reaches it;
   the route is rate-limited; and the answer never varies.
   -------------------------------------------------------------------------- */

process.env.DATABASE_URL ??= "postgresql://sponsorx@127.0.0.1:55432/none";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const limits: Array<{ key: string; max: number; window: number }> = [];
vi.mock("../src/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("../src/lib/rate-limit")>()),
  limit: async (key: string, _ip: string | undefined, max: number, window: number) => {
    limits.push({ key, max, window });
  },
}));

const { parseCspReports, recordCspReports, redactReportUrl } = await import("../src/domain/csp-report");
const { createApp } = await import("../src/app");

const TOKEN = "cl_9f8e7d6c5b4a3.1792345678.Zx_9aQ-signedsignedsigned";
const REPORT_URI = {
  "csp-report": {
    "document-uri": `https://sponsorx.net/r/AbCdEf0123456789xyzQRS?t=${TOKEN}#frag`,
    referrer: "https://mail.example/inbox?u=rosa@example.com",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy": "default-src 'self'; …",
    disposition: "report",
    "blocked-uri": "https://evil.example/x.js?session=secret",
    "line-number": 12,
    "source-file": "https://sponsorx.net/_next/static/chunks/app/page-3f2a9c.js",
    "script-sample": "alert(document.cookie) rosa@example.com",
    "status-code": 200,
  },
};
const REPORT_TO = [
  {
    type: "csp-violation",
    age: 10,
    url: "https://sponsorx.net/onboarding/confirm?t=x",
    user_agent: "Mozilla/5.0",
    body: {
      documentURL: `https://sponsorx.net/coming-of-age/${encodeURIComponent(TOKEN)}`,
      blockedURL: "inline",
      effectiveDirective: "style-src-attr",
      originalPolicy: "…",
      disposition: "report",
      sample: "color: red /* rosa@example.com */",
      lineNumber: 3,
      sourceFile: "https://sponsorx.net/u/AbCdEf0123456789xyzQRS",
      statusCode: 200,
    },
  },
  { type: "deprecation", body: { id: "x" } },
];

describe("parsing and redaction", () => {
  it("reads the report-uri format and keeps only origin + path, token segments masked", () => {
    expect(parseCspReports(REPORT_URI)).toEqual([
      {
        directive: "script-src-elem", blocked: "https://evil.example/x.js", document: "https://sponsorx.net/r/:token",
        source: "https://sponsorx.net/_next/static/chunks/app/page-3f2a9c.js", line: 12, disposition: "report",
      },
    ]);
  });

  it("reads the report-to format, ignoring reports that are not CSP violations", () => {
    expect(parseCspReports(REPORT_TO)).toEqual([
      { directive: "style-src-attr", blocked: "inline", document: "https://sponsorx.net/coming-of-age/:token", source: "https://sponsorx.net/u/:token", line: 3, disposition: "report" },
    ]);
  });

  it("anything else is no violation at all", () => {
    for (const junk of [null, undefined, "x", 3, {}, [], [{ type: "csp-violation" }], { "csp-report": "x" }]) {
      expect(parseCspReports(junk)).toEqual([]);
    }
    expect(parseCspReports(Array.from({ length: 500 }, () => REPORT_TO[0]))).toHaveLength(20);
  });

  it("page names stay readable; credentials, queries and non-web schemes do not", () => {
    expect(redactReportUrl("https://sponsorx.net/sponsor/campaigns/new")).toBe("https://sponsorx.net/sponsor/campaigns/new");
    expect(redactReportUrl("https://sponsorx.net/join/confirm?t=secret")).toBe("https://sponsorx.net/join/confirm");
    expect(redactReportUrl(`https://sponsorx.net/onboarding/${TOKEN}`)).toBe("https://sponsorx.net/onboarding/:token");
    expect(redactReportUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("data");
    expect(redactReportUrl("javascript:alert(1)")).toBe("javascript");
    expect(redactReportUrl("eval")).toBe("eval");
    expect(redactReportUrl(42)).toBe("-");
  });

  it("logs one compact line per violation, with no sample, referrer, agent or address", () => {
    const lines: string[] = [];
    expect(recordCspReports([REPORT_TO[0], REPORT_TO[0]], (l) => lines.push(l))).toBe(2);
    expect(recordCspReports(REPORT_URI, (l) => lines.push(l))).toBe(1);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe(
      "[csp-report] report script-src-elem blocked=https://evil.example/x.js doc=https://sponsorx.net/r/:token src=https://sponsorx.net/_next/static/chunks/app/page-3f2a9c.js:12",
    );
    for (const l of lines) expect(l).not.toMatch(/rosa@|alert|cookie|Mozilla|secret|1792345678|mail\.example/);
  });
});

describe("POST /api/v1/public/csp-report over HTTP", () => {
  let server: Server;
  let base = "";
  const logged: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => void logged.push(parts.join(" ")));

  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterAll(() => {
    spy.mockRestore();
    server?.close();
  });

  const post = (contentType: string, body: string) =>
    fetch(`${base}/api/v1/public/csp-report`, { method: "POST", headers: { "content-type": contentType }, body });

  it("accepts both browser formats, logs redacted lines, answers alike, rate-limited", async () => {
    const a = await post("application/csp-report", JSON.stringify(REPORT_URI));
    const b = await post("application/reports+json", JSON.stringify(REPORT_TO));
    const c = await post("application/json", JSON.stringify({ hello: "world" }));
    for (const r of [a, b, c]) {
      expect(r.status).toBe(202);
      expect(await r.json()).toEqual({ received: true });
    }
    const csp = logged.filter((l) => l.startsWith("[csp-report]"));
    expect(csp).toEqual([
      "[csp-report] report script-src-elem blocked=https://evil.example/x.js doc=https://sponsorx.net/r/:token src=https://sponsorx.net/_next/static/chunks/app/page-3f2a9c.js:12",
      "[csp-report] report style-src-attr blocked=inline doc=https://sponsorx.net/coming-of-age/:token src=https://sponsorx.net/u/:token:3",
    ]);
    expect(limits.filter((l) => l.key === "csp:report")).toHaveLength(3);
    expect(limits.find((l) => l.key === "csp:report")).toMatchObject({ max: 240, window: 60 });
  });

  it("refuses an oversized body without reading it", async () => {
    const r = await post("application/reports+json", JSON.stringify([{ type: "csp-violation", body: { sample: "x".repeat(70_000) } }]));
    expect(r.status).toBe(413);
  });
});
