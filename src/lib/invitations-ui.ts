import type { InviteState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Invitation-inbox helpers shared by the athlete invitations page (server —
   stat strip) and the InvitationsInbox client island. Lives in a module with
   no "use client" directive so both sides can import it.
   -------------------------------------------------------------------------- */

/** Rough time-to-expiry in hours, parsed from the fixture's relative string
 *  ("9 hours", "2 days") — good enough to sort and flag urgency. */
export const urgencyHours = (s: string) => {
  const m = /(\d+)\s*(hour|day)/i.exec(s);
  if (!m) return Number.POSITIVE_INFINITY;
  return m[2].toLowerCase() === "day" ? Number(m[1]) * 24 : Number(m[1]);
};

export const isOpen = (s: InviteState) => s === "INVITED" || s === "VIEWED";
