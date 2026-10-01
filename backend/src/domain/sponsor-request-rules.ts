/**
 * Sponsor requests — 2S1-BE-05. Pure.
 *
 * A business asks to sponsor through the public form (/brief → POST
 * /public/inquiries). The form's structured answers travel in the enquiry's
 * `message`, labelled one per line ("Brand category: Coffee shop / café"),
 * because the enquiry contract is the Zoho Lead's shape. These read them
 * back for BTG's review, and turn the business's own words for what it is
 * into a suggested category from the fixed list the clash check uses.
 */
import { BRAND_CATEGORIES, type BrandCategory } from "./brand-categories";

export const SPONSOR_REQUEST_STATES = ["NEW", "APPROVED", "DECLINED", "REJECTED"] as const;

/** 2S1-BE-17 — the business types BTG reviews by hand: athletes, and minors among them, are involved. */
export const RESTRICTED_SPONSOR_CATEGORIES: ReadonlySet<BrandCategory> = new Set([
  "ALCOHOL", "TOBACCO_VAPE", "GAMBLING", "CANNABIS", "FIREARMS", "ADULT", "POLITICAL", "CRYPTO",
]);

/** What the sponsor can pick on the form: every brand category, or OTHER with their own words. */
export const BUSINESS_TYPES = [...BRAND_CATEGORIES, "OTHER"] as const;

export type ApprovalFacts = {
  emailConfirmed: boolean;
  proofUploaded: boolean;
  businessType: string | null;
  businessTypeOther: string | null;
  /** Restricted words found in the Other description (2S1-BE-18). */
  restrictedWords: { word: string; kind: string }[];
  emailInUse: boolean;
  sameNameSponsors: string[];
};

export type ApprovalVerdict =
  /** Something the applicant still has to do — no decision yet. */
  | { outcome: "waiting"; missing: string[] }
  /** Everything checks out: open the account. */
  | { outcome: "approve"; categories: BrandCategory[] }
  /** Finished, but a person has to look. */
  | { outcome: "review"; reasons: string[] };

/**
 * 2S1-BE-17 — what happens to a sponsor's request. Approval is automatic
 * unless the business type is restricted, the Other description names
 * something restricted, the email already has a login, or a sponsor of the
 * same name exists; those wait for BTG, each with its reason in words.
 */
export function sponsorApprovalVerdict(f: ApprovalFacts): ApprovalVerdict {
  const missing: string[] = [];
  if (!f.emailConfirmed) missing.push("confirm your email");
  if (!f.proofUploaded) missing.push("upload your proof of business");
  if (!f.businessType || (f.businessType === "OTHER" && !f.businessTypeOther?.trim())) missing.push("tell us your business type");
  if (missing.length) return { outcome: "waiting", missing };

  const reasons: string[] = [];
  let categories: BrandCategory[] = [];
  if (f.businessType === "OTHER") {
    const suggested = suggestCategories(f.businessTypeOther);
    const restricted = suggested.filter((c) => RESTRICTED_SPONSOR_CATEGORIES.has(c));
    if (restricted.length) reasons.push(`Their description sounds like a restricted business type: ${restricted.map(label).join(", ")}`);
    categories = suggested.filter((c) => !RESTRICTED_SPONSOR_CATEGORIES.has(c));
  } else {
    const c = f.businessType as BrandCategory;
    if (RESTRICTED_SPONSOR_CATEGORIES.has(c)) reasons.push(`Restricted business type: ${label(c)}`);
    categories = [c];
  }
  if (f.restrictedWords.length) reasons.push(`Restricted words in their description: ${f.restrictedWords.map((w) => `"${w.word}"`).join(", ")}`);
  if (f.emailInUse) reasons.push("Their email already has a SponsorX login");
  if (f.sameNameSponsors.length) reasons.push(`A sponsor with the same name already exists: ${f.sameNameSponsors.join(", ")}`);
  return reasons.length ? { outcome: "review", reasons } : { outcome: "approve", categories };
}

/** "TOBACCO_VAPE" → "Tobacco vape". */
function label(c: string): string {
  const s = c.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export type SponsorRequestState = (typeof SPONSOR_REQUEST_STATES)[number];

/** "Label: value" lines of the brief, in the order the form wrote them. */
export function briefAnswers(message: string | null): { label: string; value: string }[] {
  if (!message) return [];
  return message
    .split("\n")
    .map((line) => line.match(/^([A-Z][A-Za-z ]{1,40}):\s*(.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ label: m[1]!.trim(), value: m[2]!.trim() }));
}

/** The business's own words for what it is — the brief's "Brand category". */
export function categoryText(message: string | null): string | null {
  return briefAnswers(message).find((a) => a.label.toLowerCase() === "brand category")?.value ?? null;
}

/** Words → the category they most plainly mean. First match wins per rule; order is the list's. */
const HINTS: readonly [RegExp, BrandCategory][] = [
  [/\b(brewer(y|ies)|wine|winery|bar|pub|distiller(y|ies)|liquor|beer|spirits)\b/i, "ALCOHOL"],
  [/\b(vape|vaping|tobacco|cigar|smoke shop)\b/i, "TOBACCO_VAPE"],
  [/\b(casino|betting|sportsbook|lottery|gambling)\b/i, "GAMBLING"],
  [/\b(cannabis|dispensary|cbd|marijuana)\b/i, "CANNABIS"],
  [/\b(energy drink)s?\b/i, "ENERGY_DRINK"],
  [/\b(supplements?|protein|nutrition)\b/i, "SUPPLEMENTS"],
  [/\b(fast[- ]food|quick[- ]service|qsr|burgers?|pizza|drive[- ]thru|fried chicken)\b/i, "FAST_FOOD"],
  [/\b(coffee|caf[eé]s?|restaurants?|diner|bistro|bakery|bakeries|eatery|deli|grill|kitchen)\b/i, "RESTAURANT"],
  [/\b(gyms?|fitness|yoga|pilates|crossfit|martial arts)\b/i, "FITNESS"],
  [/\b(clothing|apparel|fashion)\b/i, "APPAREL"],
  [/\b(shoes?|footwear|sneakers?)\b/i, "FOOTWEAR"],
  [/\b(car|cars|auto|automotive|dealership|tyres?|tires?|mechanic)\b/i, "AUTOMOTIVE"],
  [/\b(bank|credit union|insurance|financial|mortgage|accounting)\b/i, "FINANCIAL"],
  [/\b(wireless|mobile phones?|telecom|internet provider|broadband)\b/i, "TELECOM"],
  [/\b(video games?|esports|gaming)\b/i, "GAMING"],
  [/\b(clinic|dental|dentist|health|medical|physio|physical therapy|chiropract\w*|hospital)\b/i, "HEALTHCARE"],
  [/\b(schools?|tutor\w*|academy|college|university|education)\b/i, "EDUCATION"],
  [/\b(charity|nonprofit|non-profit|foundation)\b/i, "NONPROFIT"],
];
/* Only when nothing more specific matched — "coffee shop" is a café, not a retailer. */
const FALLBACK: readonly [RegExp, BrandCategory][] = [
  [/\b(shops?|stores?|retail|boutique|florist|hardware)\b/i, "LOCAL_RETAIL"],
];

/** What BTG is offered pre-ticked — a suggestion only; BTG decides. */
export function suggestCategories(text: string | null): BrandCategory[] {
  if (!text) return [];
  const out: BrandCategory[] = [];
  for (const [re, category] of HINTS) if (re.test(text) && !out.includes(category)) out.push(category);
  if (!out.length) for (const [re, category] of FALLBACK) if (re.test(text)) out.push(category);
  return out.filter((c) => (BRAND_CATEGORIES as readonly string[]).includes(c));
}

/** The name the new sponsor account gets: the company, else the person. */
export function sponsorNameFor(r: { companyName: string | null; firstName: string | null; lastName: string }): string {
  return r.companyName?.trim() || [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
}
