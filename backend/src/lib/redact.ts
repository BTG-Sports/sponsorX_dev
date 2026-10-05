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
