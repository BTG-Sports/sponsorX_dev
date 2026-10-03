/* --------------------------------------------------------------------------
   P5-BE-10 / P4-FE-09 — content trust, as the screens word it. Pure.

   The API decides (content-trust-rules.ts in the backend): a passing draft
   from a trusted adult athlete, with no sensitive category and no earlier
   BTG revision on that deliverable, skips BTG's review and goes straight to
   the sponsor. What lives here is only how that reads:
     - BTG's athlete view — "Trusted for content: 3 of 3 clean", or
       "2 of 3 — needs one more";
     - BTG's content desk — the "Skipped BTG review" badge and tab;
     - the athlete's deliverable page — where a submitted draft went.
   -------------------------------------------------------------------------- */

export type ContentTrust = { trusted: boolean; cleanStreak: number; needed: number };

export const SKIPPED_LABEL = "Skipped BTG review";

const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five"];
const more = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** BTG's line for an athlete's content standing. */
export function trustLine(t: ContentTrust | null | undefined): string | null {
  if (!t || !(t.needed > 0)) return null;
  const clean = Math.max(0, Math.min(t.needed, Math.floor(t.cleanStreak)));
  if (t.trusted || clean >= t.needed) return `Trusted for content: ${t.needed} of ${t.needed} clean`;
  return `${clean} of ${t.needed} — needs ${more(t.needed - clean)} more`;
}

/** What trust means, under the line. */
export function trustHint(t: ContentTrust | null | undefined): string | null {
  if (!t) return null;
  return t.trusted
    ? "Their drafts that pass the automatic checks go straight to the sponsor — unless they're a minor or the campaign is in a sensitive category. Asking for changes on any draft resets this."
    : `Their drafts come to BTG until ${t.needed} in a row are approved by BTG without changes.`;
}

type Routed = {
  state: string;
  btgReviewSkipped?: boolean;
  revision?: unknown;
};

/**
 * Where the athlete's submitted draft went, or null when it isn't waiting on
 * a reviewer (not submitted, sent back, or past review).
 */
export function submittedRoute(d: Routed): { label: string; hint: string; on: "sponsor" | "btg" } | null {
  if (d.revision) return null;
  if (d.state === "SPONSOR_REVIEW" && d.btgReviewSkipped) {
    return {
      label: "Sent straight to the sponsor",
      hint: "Your recent drafts were approved without changes, so this one skipped BTG's review. BTG can still ask for changes.",
      on: "sponsor",
    };
  }
  if (d.state === "DRAFT_SUBMITTED" || d.state === "BTG_REVIEW") {
    return { label: "With BTG for review", hint: "BTG reviews it first, then it goes to the sponsor.", on: "btg" };
  }
  return null;
}
