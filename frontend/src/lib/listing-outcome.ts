/* --------------------------------------------------------------------------
   2S3-FE-04 — what a seller is told about going live, over 2S3-BE-06
   (programme owner, 2026-10-02): listings publish automatically; BTG
   handles the exceptions.

     POST /listings/:id/submit (and resume) → PUBLISHED when the checks pass
     and nothing flags it — from its publish day when it has one — else
     PENDING_APPROVAL, with `hold`:
       restrictedWords  the words on BTG's list, in full, so the seller can
                        edit them out
       accountCheck     something about the seller's standing — told only as
                        "BTG is checking your account"
       pausedByBtg      BTG paused it earlier, so BTG puts it back live
     BTG can pause or end a live listing: `btgAction` PAUSED | ENDED with
     `btgReason`, which the seller was emailed.

   Shared by the property and athlete listing editors. Pure.
   -------------------------------------------------------------------------- */

export type ListingHold = { restrictedWords: string[]; accountCheck: boolean; pausedByBtg: boolean; message: string };

export type OutcomeListing = {
  state: "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
  publishAt: string | null;
  hold?: ListingHold | null;
  btgAction?: "PAUSED" | "ENDED" | null;
  btgReason?: string | null;
};

/** Said beside Submit, before it is pressed. */
export const GOES_LIVE_COPY = "This goes live as soon as the checks pass.";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Restricted words: "poker", "casino"" — the words the seller can fix. */
export function restrictedWordsLine(words: readonly string[]): string | null {
  const unique = [...new Set(words)];
  return unique.length ? `Restricted words: ${unique.map((w) => `“${w}”`).join(", ")}` : null;
}

export type Outcome = { tone: "accent" | "warn"; headline: string; lines: string[] };

/**
 * After a submit or a resume: "Live ✓", "Goes live on …", or "BTG is taking a
 * look — we'll email you" with the restricted words (to fix) and, for
 * anything else, only that BTG is checking the account. Null in any other
 * state.
 */
export function submitOutcome(l: OutcomeListing, now = new Date()): Outcome | null {
  if (l.state === "PUBLISHED") {
    const later = l.publishAt && new Date(l.publishAt) > now;
    return later
      ? { tone: "accent", headline: `Checks passed ✓ Goes live on ${day(l.publishAt!)}`, lines: [] }
      : { tone: "accent", headline: "Live ✓", lines: ["Sponsors can find it on the marketplace now."] };
  }
  if (l.state !== "PENDING_APPROVAL") return null;
  const h = l.hold;
  const lines: string[] = [];
  const words = restrictedWordsLine(h?.restrictedWords ?? []);
  if (words) lines.push(`${words}. Edit them out and submit again, or wait for BTG.`);
  if (h?.accountCheck) lines.push("BTG is checking your account. Nothing for you to do.");
  if (h?.pausedByBtg) lines.push("BTG paused this listing earlier, so BTG puts it back live.");
  return { tone: "warn", headline: "BTG is taking a look — we'll email you", lines };
}

/** A BTG pause or end, with BTG's reason (the seller was emailed it). Null when BTG has not acted. */
export function btgNote(l: OutcomeListing): string | null {
  const reason = l.btgReason?.trim();
  if (!l.btgAction || !reason) return null;
  const said = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  if (l.btgAction === "ENDED") return `BTG ended this listing: ${said}`;
  return l.state === "PAUSED"
    ? `BTG paused this listing: ${said} You can edit it; when you resume it, it goes to BTG, and BTG puts it back live.`
    : `BTG paused this listing: ${said}`;
}
