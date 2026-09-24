/* --------------------------------------------------------------------------
   From the marketplace's brief drawer to POST /api/v1/briefs — P4-FE-01.

   Pure, so the exact body the frontend sends is testable on its own — and
   the backend's contract suite parses this function's output with the real
   CampaignBriefInput, so a drift between the two fails a build rather than a
   sponsor's request.

   The rules are the API's: budget in CENTS (the form shows dollars), dates as
   calendar dates, categories from the closed vocabulary. Phase 1 is a managed
   marketplace: this is a request BTG qualifies and prices, not a purchase.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, type BrandCategory } from "./brand-categories";

export type BriefRequest = {
  sponsorId: string;
  objective: string;
  /** As typed — "$1,500–$3,000", "1500", "$750". */
  budget: string;
  /** yyyy-mm-dd, or "" for "as soon as BTG can". */
  start: string;
  durationWeeks: number;
  sport: string;
  geo: string;
  tier: string;
  category: string;
  message: string;
  packageId?: string | null;
  jobName?: string | null;
};

export type BriefBody = {
  sponsorId: string;
  objective: string;
  budget: number;
  packageId: string | null;
  startDate: string;
  endDate: string;
  sports: string[];
  stateCodes: string[];
  categories: BrandCategory[];
};

export class BriefRequestInvalid extends Error {}

/** The first dollar amount in the text, in cents. A band's LOWER bound — the
 *  brief records what the sponsor is prepared to start at; BTG prices it. */
export function budgetCents(text: string): number {
  const m = text.replace(/,/g, "").match(/\d+(\.\d{1,2})?/);
  if (!m) throw new BriefRequestInvalid("Enter a budget in dollars, e.g. 1500.");
  return Math.round(Number(m[0]) * 100);
}

/** The 50 states and DC — NIL is US law, and targeting is by US state. */
const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH " +
    "NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" "),
);

/** "DMV" → DC, MD, VA; "Baltimore, MD" → MD; outside the US → no state. */
export function stateCodesFor(geo: string): string[] {
  const g = geo.trim();
  if (!g) return [];
  if (/^dmv$/i.test(g)) return ["DC", "MD", "VA"];
  const code = g.match(/,\s*([A-Z]{2})$/)?.[1] ?? (/^[A-Z]{2}$/.test(g) ? g : null);
  return code && US_STATES.has(code) ? [code] : [];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function toBriefBody(r: BriefRequest, today = new Date()): BriefBody {
  const objective = r.objective.trim();
  if (!objective) throw new BriefRequestInvalid("Say what the campaign should achieve.");
  const start = r.start ? new Date(`${r.start}T00:00:00Z`) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 14));
  if (Number.isNaN(start.getTime())) throw new BriefRequestInvalid("That start date is not a date.");
  const end = new Date(start.getTime() + Math.max(1, r.durationWeeks) * 7 * 864e5);

  /* The API keeps objective only; everything else the sponsor typed that has
     no column of its own travels with it, so BTG reads it at qualification. */
  const extras = [
    r.jobName ? `Requested job: ${r.jobName}` : "",
    r.tier ? `Preferred tier: ${r.tier}` : "",
    r.message.trim() ? `Note: ${r.message.trim()}` : "",
  ].filter(Boolean);

  const category = r.category as BrandCategory;
  return {
    sponsorId: r.sponsorId,
    objective: [objective, ...extras].join("\n\n").slice(0, 2000),
    budget: budgetCents(r.budget),
    packageId: r.packageId ?? null,
    startDate: day(start),
    endDate: day(end),
    sports: r.sport ? [r.sport] : [],
    stateCodes: stateCodesFor(r.geo),
    categories: (BRAND_CATEGORIES as readonly string[]).includes(category) ? [category] : [],
  };
}
