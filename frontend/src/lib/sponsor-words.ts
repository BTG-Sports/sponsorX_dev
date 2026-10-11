/* --------------------------------------------------------------------------
   Sponsor words (P1-ART-23) — every status a sponsor page shows, in plain
   language. Pages never print a raw enum: a non-technical sponsor reads
   "Needs your OK", not APPROVAL. Each word carries the chip tone the
   Stadium Board paints it with (colour + word, never colour alone).
   -------------------------------------------------------------------------- */

export type WordTone = "live" | "you" | "late" | "done" | "info";
export type Word = { text: string; tone: WordTone };

/** An unknown enum still reads as words: "SOMETHING_NEW" → "Something new". */
const humanize = (s: string) => {
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const pick = (map: Record<string, Word>, key: string): Word => map[key] ?? { text: humanize(key), tone: "info" };

const CAMPAIGN: Record<string, Word> = {
  DRAFT: { text: "Being set up", tone: "info" },
  STAFFING: { text: "Finding athletes", tone: "info" },
  APPROVAL: { text: "Needs your OK", tone: "you" },
  ACTIVE: { text: "Running", tone: "live" },
  REPORTING: { text: "Wrapping up", tone: "info" },
  COMPLETED: { text: "Finished", tone: "done" },
  CANCELLED: { text: "Cancelled", tone: "done" },
};
const BRIEF: Record<string, Word> = {
  DRAFT: { text: "Draft", tone: "info" },
  QUALIFIED: { text: "Being matched by BTG", tone: "info" },
  APPROVED: { text: "Ready for you", tone: "you" },
  CAMPAIGN_CREATED: { text: "Became a campaign", tone: "live" },
  CLOSED: { text: "Closed", tone: "done" },
};
const ORDER: Record<string, Word> = {
  PENDING_SELLER: { text: "Waiting for approval", tone: "info" },
  PENDING_APPROVAL: { text: "Waiting for approval", tone: "info" },
  APPROVED: { text: "Ready to pay", tone: "you" },
  AWAITING_PAYMENT: { text: "Ready to pay", tone: "you" },
  PAID: { text: "In progress", tone: "live" },
  IN_DELIVERY: { text: "In progress", tone: "live" },
  FULFILLED: { text: "Delivered", tone: "done" },
  CLOSED: { text: "Delivered", tone: "done" },
  CANCELLED: { text: "Cancelled", tone: "done" },
  REFUNDED: { text: "Refunded", tone: "done" },
};
const DELIVERABLE: Record<string, Word> = {
  NOT_STARTED: { text: "Not started", tone: "info" },
  IN_PROGRESS: { text: "Being made", tone: "info" },
  DRAFT_SUBMITTED: { text: "Being checked", tone: "info" },
  BTG_REVIEW: { text: "Being checked by BTG", tone: "info" },
  SPONSOR_REVIEW: { text: "Waiting for your OK", tone: "you" },
  REVISION_REQUESTED: { text: "Changes asked for", tone: "info" },
  APPROVED: { text: "Approved", tone: "live" },
  PUBLISHED: { text: "Posted", tone: "live" },
  VERIFIED: { text: "Posted & checked", tone: "done" },
};

export const campaignWord = (s: string) => pick(CAMPAIGN, s);
export const briefWord = (s: string) => pick(BRIEF, s);
export const orderWord = (s: string) => pick(ORDER, s);
export const deliverableWord = (s: string) => pick(DELIVERABLE, s);

/** Where a number came from, for the "How sure are we?" panel. */
export function sourceWord(source: string, platform?: string): string {
  switch (source) {
    case "VERIFIED_API": return `Checked with ${platform ?? "the platform"}`;
    case "VERIFIED_MANUAL": return "Checked by BTG";
    case "SELF_REPORTED": return "Reported by the athlete";
    case "ESTIMATED": return "Estimate";
    case "ATTRIBUTED": return "Linked to your campaign";
    default: return humanize(source);
  }
}

/** The fan journey's steps, in order. */
export const FUNNEL_WORDS = { scan: "Scanned QR", landing: "Opened offer", claim: "Claimed", redeem: "Redeemed" } as const;

/** Change against the previous window as a fraction (0.18 = +18%); null when there is nothing to compare. */
export function delta(now: number, prev: number | null | undefined): number | null {
  if (prev === null || prev === undefined || prev === 0) return null;
  return (now - prev) / prev;
}

/** 54100 → "54.1k"; for tiles where the full figure is in the tooltip / sr text. */
export function compactNumber(n: number): string {
  const f = (v: number, s: string) => `${(Math.round(v * 10) / 10).toLocaleString("en-US")}${s}`;
  if (Math.abs(n) >= 1_000_000) return f(n / 1_000_000, "M");
  if (Math.abs(n) >= 10_000) return f(n / 1_000, "k");
  return Math.round(n).toLocaleString("en-US");
}
