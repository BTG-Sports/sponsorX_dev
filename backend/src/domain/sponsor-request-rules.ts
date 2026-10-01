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

export const SPONSOR_REQUEST_STATES = ["NEW", "APPROVED", "DECLINED"] as const;
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
