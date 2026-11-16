/* --------------------------------------------------------------------------
   POL-FE-53 (app review B2) — Finance's actions on a campaign earning.
   POST /earnings/:id/transition {to, reference?} and /adjustment
   {adjustment, reason} existed with no caller, so an earning sat at
   Eligible or Approved for payout for ever. The moves mirror
   earning-state.ts only to decide what to SHOW; the API is the gate, and
   only FINANCE and SUPER_ADMIN hold `earning.approve` (BTG_ADMIN does not —
   decided with the plan, 2026-11-15).
   -------------------------------------------------------------------------- */

export const EARNING_ACTION_ROLES = ["SUPER_ADMIN", "FINANCE"] as const;

export function mayActOnEarnings(roles: readonly string[]): boolean {
  return roles.some((r) => (EARNING_ACTION_ROLES as readonly string[]).includes(r));
}

/* POL-FE-87 — PENDING (back from a hold) and VOIDED (nothing owed) join the moves; Void asks first. */
export type EarningMove = { to: "APPROVED_FOR_PAYOUT" | "PAID" | "HELD" | "ELIGIBLE" | "PENDING" | "VOIDED"; label: string; needsReference?: boolean; needsConfirm?: boolean; primary?: boolean };

/** The moves offered from a state. PAID needs a transfer reference. */
export function earningMoves(state: string): EarningMove[] {
  switch (state) {
    case "PENDING":
      return [{ to: "HELD", label: "Hold" }, { to: "VOIDED", label: "Void", needsConfirm: true }];
    case "ELIGIBLE":
      return [{ to: "APPROVED_FOR_PAYOUT", label: "Approve", primary: true }, { to: "HELD", label: "Hold" }];
    case "APPROVED_FOR_PAYOUT":
      return [{ to: "PAID", label: "Mark paid", needsReference: true, primary: true }, { to: "HELD", label: "Hold" }];
    /* POL-BE-87 — Release makes it payable, which the API allows only once its work is verified;
       Back to pending is the way out otherwise (and the step before Void). */
    case "HELD":
      return [{ to: "ELIGIBLE", label: "Release", primary: true }, { to: "PENDING", label: "Back to pending" }];
    case "DISPUTED":
      return [{ to: "ELIGIBLE", label: "Resolve — back to eligible" }, { to: "HELD", label: "Hold" }];
    default:
      return [];
  }
}

/** An adjustment may be recorded only before the earning is approved or sent (earning-state MUTABLE). */
export function mayAdjust(state: string): boolean {
  return ["PENDING", "ELIGIBLE", "HELD", "DISPUTED"].includes(state);
}

/** "-12.50" → -1250; null when it isn't a non-zero dollar amount. */
export function dollarsToCents(raw: string): number | null {
  const t = raw.trim().replace(/[$,\s]/g, "");
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents === 0 || !Number.isSafeInteger(cents) ? null : cents;
}

export function referenceProblem(ref: string): string | null {
  const t = ref.trim();
  if (!t) return "Add the transfer reference (Zoho or bank) before marking it paid.";
  if (t.length > 200) return "Keep the reference under 200 characters.";
  return null;
}

export function adjustmentProblem(amount: string, reason: string): string | null {
  if (dollarsToCents(amount) === null) return "Enter the change in dollars, e.g. 25 or -12.50.";
  if (!reason.trim()) return "Say why — the reason is kept on the earning's record.";
  if (reason.trim().length > 2000) return "Keep the reason under 2,000 characters.";
  return null;
}

/** What Finance reads after a move. */
export function earningMovedLine(to: EarningMove["to"]): string {
  if (to === "APPROVED_FOR_PAYOUT") return "Approved for payout.";
  if (to === "PAID") return "Marked paid.";
  if (to === "HELD") return "Held.";
  if (to === "PENDING") return "Back to pending — it becomes eligible on its own once its work is verified.";
  if (to === "VOIDED") return "Voided — nothing is owed on it.";
  return "Released — back to eligible.";
}

/** The API's refusal, in its words. */
export function earningRefusal(status: number, body: unknown): string {
  const said = (body as { error?: { message?: string } } | null)?.error?.message;
  if (typeof said === "string" && said) return said;
  if (status === 403) return "Only Finance approves and pays earnings.";
  if (status === 409) return "This earning changed meanwhile — reload the page.";
  return `SponsorX couldn't save that (HTTP ${status}). Nothing changed.`;
}
