/**
 * Editions that move by themselves — P9-BE-17 (programme owner, 2026-10-03,
 * item 23). The rules, pure; edition-automation.ts meets the database.
 *
 * "A step is automatic when every safety check passes, and held for the
 * right person, with the reason, when one fails." Four moves are the
 * system's:
 *
 *   PLANNING      → SELLING            on `salesOpenAt` (null: BTG opens by
 *                                      hand), with at least one priced slot;
 *   SELLING       → CLOSED             at `closeDate` (the split resolves as
 *                                      it always has);
 *   CLOSED        → IN_PRODUCTION      when all four production gates pass —
 *                                      `contentReady` stays BTG's call;
 *   IN_PRODUCTION → PUBLISHED_DIGITAL  at `publishTarget`, if every gate
 *                                      still passes.
 *
 * PRINTED, DISTRIBUTED and CANCELLED stay BTG's. A gate that fails is not an
 * error: the edition stays where it is and `editionNextStep` says why.
 */
import type { EditionState } from "./edition-state";

/** What the rules need to know about one edition, read under its lock. */
export type EditionFacts = {
  state: EditionState;
  salesOpenAt: Date | null;
  closeDate: Date;
  publishTarget: Date;
  contentReady: boolean;
  revenueMet: boolean;
  thresholdCents: number;
  /** cents sold so far (what closing will freeze as revenue) */
  soldCents: number;
  /** slots with a price above zero */
  pricedSlots: number;
  /** sold slots whose artwork is not APPROVED (P9-BE-16) */
  artworkPending: number;
  /** assets with no digital right on the publish target (P9-BE-10) */
  rightsPending: number;
};

export type EditionMove = { to: EditionState; reason: string };
export type EditionNextStepWho = "SYSTEM" | "BTG" | "NONE";
export type EditionNextStep = { who: EditionNextStepWho; text: string };

const day = (d: Date) => d.toISOString().slice(0, 10);
const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What stands between this edition and the press, in words — the four
 * production gates (edition-state.ts), each that fails. Empty: all pass.
 */
export function productionProblems(f: EditionFacts): string[] {
  const out: string[] = [];
  if (!f.contentReady) out.push("Waiting for content ready");
  if (!f.revenueMet) out.push(`Revenue not met: ${usd(f.soldCents)} sold of the ${usd(f.thresholdCents)} needed`);
  if (f.artworkPending > 0) {
    out.push(`${plural(f.artworkPending, "sold ad")} ${f.artworkPending === 1 ? "has" : "have"} no approved artwork`);
  }
  if (f.rightsPending > 0) {
    out.push(`${plural(f.rightsPending, "asset")} ${f.rightsPending === 1 ? "has" : "have"} no digital right`);
  }
  return out;
}

/** The one move the facts make true now, or null. The transition still
 *  asks edition-state.ts — this names a destination, it does not license it. */
export function automaticEditionMove(f: EditionFacts, now: Date): EditionMove | null {
  switch (f.state) {
    case "PLANNING":
      if (!f.salesOpenAt || f.salesOpenAt.getTime() > now.getTime() || f.pricedSlots === 0) return null;
      return { to: "SELLING", reason: `Sales opened on their date (${day(f.salesOpenAt)}).` };
    case "SELLING":
      if (f.closeDate.getTime() > now.getTime()) return null;
      return { to: "CLOSED", reason: `The ad deadline (${day(f.closeDate)}) passed.` };
    case "CLOSED":
      if (productionProblems(f).length) return null;
      return { to: "IN_PRODUCTION", reason: "Every production gate passed: content ready, revenue met, artwork approved, rights cleared." };
    case "IN_PRODUCTION":
      if (f.publishTarget.getTime() > now.getTime() || productionProblems(f).length) return null;
      return { to: "PUBLISHED_DIGITAL", reason: `The publish date (${day(f.publishTarget)}) came and every gate still passes.` };
    default:
      return null;
  }
}

/** What happens next, in BTG's words — who acts, and why it is waiting. */
export function editionNextStep(f: EditionFacts, now: Date): EditionNextStep {
  switch (f.state) {
    case "PLANNING":
      if (f.pricedSlots === 0) {
        return { who: "BTG", text: f.salesOpenAt ? `Sales open on ${day(f.salesOpenAt)} once a priced ad slot is added` : "Waiting for BTG to add priced ad slots" };
      }
      if (!f.salesOpenAt) return { who: "BTG", text: "No sales-open date: BTG opens sales by hand" };
      if (f.salesOpenAt.getTime() > now.getTime()) return { who: "SYSTEM", text: `Sales open on ${day(f.salesOpenAt)}` };
      return { who: "SYSTEM", text: "Opening for sales" };
    case "SELLING":
      return f.closeDate.getTime() > now.getTime()
        ? { who: "SYSTEM", text: `Ads close on ${day(f.closeDate)}` }
        : { who: "SYSTEM", text: "Closing for ads" };
    case "CLOSED": {
      const problems = productionProblems(f);
      return problems.length ? { who: "BTG", text: problems.join(" · ") } : { who: "SYSTEM", text: "Going into production" };
    }
    case "IN_PRODUCTION": {
      const problems = productionProblems(f);
      if (problems.length) return { who: "BTG", text: problems.join(" · ") };
      return f.publishTarget.getTime() > now.getTime()
        ? { who: "SYSTEM", text: `Publishes digitally on ${day(f.publishTarget)}` }
        : { who: "SYSTEM", text: "Publishing" };
    }
    case "PUBLISHED_DIGITAL":
      return { who: "BTG", text: "Published digitally. Printing is BTG's call" };
    case "PRINTED":
      return { who: "BTG", text: "Printed. Distribution is BTG's call" };
    case "DISTRIBUTED":
      return { who: "NONE", text: "Distributed" };
    case "CANCELLED":
      return { who: "NONE", text: "Cancelled" };
  }
}

/** One stage change as the edition page shows it, from its audit row. */
export type EditionStageChange = { from: EditionState | null; to: EditionState; at: string; movedAutomatically: boolean; reason: string | null };

export function editionStageChangeOf(row: { at: Date; actorId: string | null; before: unknown; after: unknown }): EditionStageChange | null {
  const after = (row.after ?? {}) as { state?: unknown; automatic?: unknown; reason?: unknown };
  const before = (row.before ?? {}) as { state?: unknown };
  if (typeof after.state !== "string") return null;
  const automatic = after.automatic === true && row.actorId === null;
  return {
    from: typeof before.state === "string" ? (before.state as EditionState) : null,
    to: after.state as EditionState,
    at: row.at.toISOString(),
    movedAutomatically: automatic,
    reason: typeof after.reason === "string" ? after.reason : null,
  };
}
