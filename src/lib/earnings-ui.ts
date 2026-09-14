import { athleteCareer, type EarningState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Shared athlete-earnings UI copy (2026-09-14). Imported by both the server
   page (the money-journey section) and the ActivityExplorer client island
   (toolbar + detail drawer), so the plain-English stage language never
   drifts between the two views. Framework-free — data and one date helper.
   -------------------------------------------------------------------------- */

export const EARNING_TONE: Record<
  EarningState,
  "neutral" | "primary" | "accent" | "danger"
> = {
  PENDING: "neutral",
  ELIGIBLE: "primary",
  APPROVED_FOR_PAYOUT: "primary",
  PAID: "accent",
  HELD: "danger",
  DISPUTED: "danger",
};

/* The §21 pipeline, athlete-first: money reads left → right, intensity rises
   as it gets closer to being real. HELD/DISPUTED are not stages — they render
   as attention treatments instead. */
export const JOURNEY: {
  state: EarningState;
  title: string;
  blurb: string;
  dot: string;
}[] = [
  {
    state: "PENDING",
    title: "In review",
    blurb: "We're checking the proof you posted.",
    dot: "bg-surface-2 text-muted",
  },
  {
    state: "ELIGIBLE",
    title: "Cleared",
    blurb: "Verified — queued for finance approval.",
    dot: "bg-primary/15 text-primary-soft",
  },
  {
    state: "APPROVED_FOR_PAYOUT",
    title: "Payout approved",
    blurb: `Lands with the ${athleteCareer.nextPayout} payout run.`,
    dot: "bg-primary text-cta-ink",
  },
  {
    state: "PAID",
    title: "Paid",
    blurb: "Done — already sent your way.",
    dot: "bg-accent text-cta-ink",
  },
];

/** Select-option and stepper order — the pipeline first, then the off-ramps. */
export const STATE_ORDER: EarningState[] = [
  "PENDING",
  "ELIGIBLE",
  "APPROVED_FOR_PAYOUT",
  "PAID",
  "HELD",
  "DISPUTED",
];

/** Where a pipeline state sits on the 4-step journey (off-ramps excluded). */
export const STAGE_INDEX: Partial<Record<EarningState, number>> = {
  PENDING: 0,
  ELIGIBLE: 1,
  APPROVED_FOR_PAYOUT: 2,
  PAID: 3,
};

/** The detail view's plain-English "what this means / what happens next". */
export const STATUS_DETAIL: Record<EarningState, string> = {
  PENDING:
    "We're checking the proof you posted. Nothing to do on your end — it clears once the post is verified.",
  ELIGIBLE:
    "Verified. It's queued for BTG Finance to approve on the next payout run.",
  APPROVED_FOR_PAYOUT: `Approved — it lands with the ${athleteCareer.nextPayout} payout run.`,
  PAID: "Paid out. Keep the reference for your records.",
  HELD: "On hold — BTG Finance is re-checking this order before it can move again. They'll reach out if they need anything from you.",
  DISPUTED:
    "Disputed — BTG Finance is resolving it with the sponsor. Your earning is safe while that happens.",
};

/** Fixture dates are "May 16" strings — month-name + day sort key. */
export const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export const when = (s: string) => {
  const [mon, day] = s.split(" ");
  return (MONTHS[mon?.slice(0, 3)] ?? 0) * 100 + Number(day ?? 0);
};
