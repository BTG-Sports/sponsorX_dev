/* --------------------------------------------------------------------------
   The §11 profile sections — shared between the profile editor island and
   the server pages that deep-link into it (dashboard checklist, completion
   nudges). Server-safe: data only.

   Every section declares its scope, because "who sees this?" is the first
   question every athlete asks: public sections render on /athletes/[slug],
   private ones stay between the athlete and BTG (§26).
   -------------------------------------------------------------------------- */

export type SectionKey =
  | "identity"
  | "sport"
  | "socials"
  | "capabilities"
  | "interests"
  | "restrictions"
  | "rates"
  | "payment"
  | "agreements";

export const SECTIONS: {
  key: SectionKey;
  label: string;
  scope: "public" | "private";
  blurb: string;
}[] = [
  { key: "identity", label: "Identity", scope: "public", blurb: "Name, region, photo and your bio — the top of your public profile." },
  { key: "sport", label: "Sport & team", scope: "public", blurb: "What you play and where — shown under your name." },
  { key: "socials", label: "Social accounts", scope: "public", blurb: "Handles and follower counts. Self-reported until platform verification lands (Phase 3)." },
  { key: "capabilities", label: "Content capabilities", scope: "public", blurb: "The SX catalogue jobs you're willing to deliver — this becomes your public inventory." },
  { key: "interests", label: "Brand interests", scope: "public", blurb: "Categories you want to work with — shown as chips on your profile." },
  { key: "restrictions", label: "Restrictions & conflicts", scope: "private", blurb: "What you can never promote. Never shown publicly — it powers the conflict check before any invitation reaches you (§26)." },
  { key: "rates", label: "Rate card", scope: "private", blurb: "What you're paid per job. BTG sets these with you; sponsors see different (higher) catalogue prices, never these." },
  { key: "payment", label: "Payment recipient", scope: "private", blurb: "Who BTG Finance pays. No bank details and no tax ID — ever (§26)." },
  { key: "agreements", label: "Agreements", scope: "private", blurb: "The legal basis for campaigns. Accepting records exactly what you saw, and when." },
];

/** Checklist label (fixtures) → section key, so server pages can deep-link. */
export const CHECKLIST_SECTION: Record<string, SectionKey> = {
  "Identity": "identity",
  "Sport & team": "sport",
  "Social accounts": "socials",
  "Content capabilities": "capabilities",
  "Brand interests": "interests",
  "Restrictions & conflicts": "restrictions",
  "Rate card confirmed": "rates",
  "Payment recipient": "payment",
  "Agreements signed": "agreements",
};
