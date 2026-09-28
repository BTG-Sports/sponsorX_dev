/* --------------------------------------------------------------------------
   P5-FE-01 — the Campaign Order as GET /orders/{id} answers it, and the one
   rule the acceptance lives or dies by.

   THE TEXT SHOWN IS THE TEXT HASHED. The page renders `agreement.body`
   verbatim (whitespace preserved); the accept action hashes that same string
   with the SAME canonicalisation the API checks against
   (backend/src/domain/agreement-hash.ts), and sends the fingerprint. If the
   issued text changed between render and click, the API refuses with 409 and
   the athlete is told to reload — an acceptance of words they didn't see is
   never recorded. A test pins this function to the backend's byte for byte.
   -------------------------------------------------------------------------- */

export type GuardianStatus = "not-required" | "missing" | "unverified" | "ready";

export type ApiOrder = {
  id: string;
  state: string;
  jobId: string;
  jobName: string;
  campaign: { id: string; name: string; sponsorName: string; startDate: string; endDate: string };
  athlete: { id: string; displayName: string };
  usageRights: string;
  exclusivity: string | null;
  dueDate: string;
  acceptedAt: string | null;
  /** cents — present for the athlete (their own pay) and BTG. */
  compensation?: number;
  guardian: { status: GuardianStatus; name: string | null };
  agreement: {
    id: string;
    kind: string;
    version: number;
    bodyHash: string;
    /** null when the issued text can't be served (file missing or changed). */
    body: string | null;
  } | null;
  acceptance: { acceptedAt: string; bodyHash: string; version: number } | null;
};

export type AcceptResult = { ok: true; state: string } | { ok: false; message: string; reload?: boolean };

/** Byte-for-byte the backend's canonicaliseAgreementBody: transport noise
 *  (BOM, CRLF/CR, trailing whitespace at the end) and nothing else. */
export function canonicaliseAgreementBody(body: string): string {
  return body
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+$/, "");
}

/** Whether this order can be accepted right now, and if not, why — in the
 *  athlete's words. The API enforces every one of these; this only stops
 *  the button promising something it will refuse. */
export function acceptBlocker(o: ApiOrder, viewerIsAthlete: boolean): string | null {
  if (o.state !== "SENT")
    return o.state === "DRAFT"
      ? "BTG is still drafting this order."
      : null; // resolved states render their own status, not a blocker
  if (!viewerIsAthlete) return "Only the athlete can accept this order.";
  if (!o.agreement) return "The Campaign Order agreement hasn't been issued yet — BTG will let you know.";
  if (o.agreement.body === null)
    return "The agreement text can't be shown right now, so it can't be accepted. BTG has been told.";
  if (o.guardian.status === "missing")
    return "You're under 18, so a parent or guardian has to be linked and verified before you can accept.";
  if (o.guardian.status === "unverified")
    return `${o.guardian.name ?? "Your guardian"} is linked but not verified yet. You can accept once BTG verifies them.`;
  return null;
}

export const ORDER_STATE_COPY: Record<string, string> = {
  DRAFT: "Being drafted",
  SENT: "Ready to sign",
  ACCEPTED: "Accepted",
  REJECTED: "Declined",
  ACTIVE: "Live",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
