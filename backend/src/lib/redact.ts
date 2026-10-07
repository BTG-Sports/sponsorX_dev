import { inspect } from "node:util";

/**
 * Email addresses out of the logs — 2S8-SEC-05 (security review §A09).
 *
 * The worker logged every recipient it mailed: fans were already kept out
 * (P6-SEC-02/03), but staff, athletes, guardians and applicants were logged
 * in full. A log line is retained, shipped and read far more widely than the
 * table the address lives in, and nothing that reads it needs to know who.
 * The domain is kept: "mail to …@school.org failed" is what tells someone
 * which provider is bouncing.
 */

/** `rosa@example.com` → `…@example.com`; anything that is not an address → `…`. */
export function maskEmail(address: string | null | undefined): string {
  const at = (address ?? "").lastIndexOf("@");
  return at > 0 ? `…@${address!.slice(at + 1)}` : "…";
}

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Every address in a log line masked, whatever else the line says. */
export function redactEmails(text: string): string {
  return text.replace(EMAIL, (_m, domain: string) => `…@${domain}`);
}

/* ── errors — 2S0-SEC-01 ──────────────────────────────────────────────── */

/**
 * An error, as it may be logged. Error messages are NOT only our own words:
 * a Prisma validation error prints the whole call it refused, arguments and
 * all (an applicant's email, legal name, date of birth, a guardian's
 * details); a Postgres unique violation names the value (`Key (email)=(…)`);
 * a provider's refusal can quote what it was sent. So every error that is
 * logged goes through here first:
 *
 *   - a Prisma validation error keeps its verdict ("Argument `x` is
 *     missing") and its stack, but not the arguments it echoed;
 *   - every email address, anywhere in it, is masked to its domain.
 */
export function redactForLog(part: unknown): string {
  if (typeof part === "string") return redactEmails(part);
  if (part instanceof Error && part.name === "PrismaClientValidationError") {
    /* "Invalid `prisma.x.y()` invocation…\n\n{ …the arguments… }\n\nArgument `z` is missing." —
       the first line and the verdict (the last paragraph, which names fields and types only). */
    const message = part.message.trim();
    const paragraphs = message.split(/\n\s*\n/);
    const verdict = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1]! : (message.split("\n").pop() ?? "");
    const frames = (part.stack ?? "").split("\n").filter((l) => /^\s+at /.test(l));
    return redactEmails([`${part.name}: ${message.split("\n")[0]} [the call's arguments are not logged]`, verdict, ...frames].join("\n"));
  }
  return redactEmails(inspect(part, { depth: 4, breakLength: 160 }));
}

/**
 * console.error, with every part redacted (`redactForLog`). The API and the
 * worker log errors only through this — security-hardening's static guard
 * fails on a console.error / console.warn anywhere else in src/ or worker/.
 */
export function logError(...parts: unknown[]): void {
  console.error(...parts.map(redactForLog));
}
