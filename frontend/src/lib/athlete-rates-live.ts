/* --------------------------------------------------------------------------
   POL-FE-51 — BTG's rate card editor, the pure half.

   Walkthrough practice (2026-11-15): the Matching Studio refused to shortlist
   an athlete with no rate for a package job, and no screen anywhere wrote
   one — POST /athletes/{id}/rates existed with nothing calling it. This
   module is everything the editor decides that isn't React: who may use it,
   where it lives, reading a typed amount, what a rate implies for the
   sponsor price, and the API's refusals in plain words.

   WHO. The API's matrix (backend/src/auth/policy.ts, athleteRate write and
   athlete write) gives setting a rate and a tier to BTG admins, network
   managers and SUPER_ADMIN, tenant-wide. A campaign manager READS rates but
   never sets them, so the editor is not theirs.

   UNITS. The NIL job catalogue is WHOLE DOLLARS (backend domain/nil-jobs.ts);
   a rate is CENTS (AthleteRate.amount). The editor reads dollars from the
   person, sends cents, and converts each catalogue band ×100 once.

   THE FLOOR. A sponsor may never be charged under the athlete's rate × 1.4
   on a line (P0-PMO-09, margin-floor.ts `lineFloor`, rounded UP to the
   cent). A rate whose floor is above the job's top catalogue price can be
   saved, but no sponsor price for that job could clear it — said before
   saving, not discovered by a refused order.
   -------------------------------------------------------------------------- */

import { signupHref } from "@/lib/signups-live";

/** Who may set a rate (and the tier a rate needs). */
export const RATE_WRITERS = ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR"] as const;

export function mayWriteRates(roles: readonly string[]): boolean {
  return roles.some((r) => (RATE_WRITERS as readonly string[]).includes(r));
}

/** P0-PMO-09 — the sponsor price may not go under rate × 1.4. */
export const RATE_FLOOR_MULTIPLIER = 1.4;

/** The API's largest amount: a Postgres int4. */
const INT4_MAX = 2_147_483_647;

/* ------------------------------------------------------------- the read */

export type ApiRateEditor = {
  athlete: { id: string; displayName: string; sport: string; stateCode: string | null; tier: string | null; state: string };
  jobs: Array<{ id: string; name: string; baseLowDollars: number; baseHighDollars: number; sellLowDollars: number; sellHighDollars: number }>;
  rates: Array<{ jobId: string; jobName: string; amount: number; version: number }>;
};

/** One row of the editor: a catalogue job, its bands in CENTS, and the
 *  athlete's current rate on it (null when none is on file). */
export type RateRow = {
  jobId: string;
  name: string;
  payLow: number;
  payHigh: number;
  sellLow: number;
  sellHigh: number;
  current: { amount: number; version: number } | null;
};

export function rateRows(editor: Pick<ApiRateEditor, "jobs" | "rates">): RateRow[] {
  const byJob = new Map(editor.rates.map((r) => [r.jobId, r]));
  return editor.jobs.map((j) => {
    const r = byJob.get(j.id);
    return {
      jobId: j.id,
      name: j.name,
      payLow: j.baseLowDollars * 100,
      payHigh: j.baseHighDollars * 100,
      sellLow: j.sellLowDollars * 100,
      sellHigh: j.sellHighDollars * 100,
      current: r ? { amount: r.amount, version: r.version } : null,
    };
  });
}

/* ------------------------------------------------------------ the tiers */

export const TIERS = ["EMERGING", "CREATOR", "PREMIUM", "ANCHOR"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_WORDS: Record<Tier, string> = {
  EMERGING: "Emerging",
  CREATOR: "Creator",
  PREMIUM: "Premium",
  ANCHOR: "Anchor",
};

export function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

export function tierWords(tier: string | null): string {
  return isTier(tier) ? TIER_WORDS[tier] : "No tier yet";
}

/* ----------------------------------------------------------- the amount */

/** Cents as dollars, showing cents only when there are some: $40, $40.50. */
export function dollars(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** A typed amount in dollars → cents, or why it can't be one.
 *  "45", "45.5", "$1,200.00" are fine; zero, negatives, fractions of a cent
 *  and words are not. */
export function parseRateDollars(input: string): { ok: true; cents: number } | { ok: false; message: string } {
  const text = (input ?? "").trim().replace(/^\$/, "").replace(/,/g, "").trim();
  if (!text) return { ok: false, message: "Enter the rate in dollars, for example 40." };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, message: "Enter the rate as a dollar amount, for example 40 or 40.50." };
  }
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > INT4_MAX) return { ok: false, message: "That amount is too large." };
  if (cents === 0) return { ok: false, message: "A rate must be more than $0 — the athlete is paid this for the job." };
  return { ok: true, cents };
}

/** The lowest a sponsor may be charged for one of this job, at this rate. */
export function impliedFloor(cents: number): number {
  return Math.ceil(cents * RATE_FLOOR_MULTIPLIER);
}

/** What a rate means before it is saved: the sponsor floor it sets, and
 *  anything worth a second look. Never blocks a save — the rate is BTG's
 *  call (§6) — but a floor no catalogue price can clear is a warning. */
export function rateAdvice(cents: number, row: Pick<RateRow, "payLow" | "payHigh" | "sellHigh">): {
  floor: string;
  warning: string | null;
  note: string | null;
} {
  const floor = impliedFloor(cents);
  const warning =
    floor > row.sellHigh
      ? `At this rate a sponsor must pay at least ${dollars(floor)} for this job, above its top catalogue price of ${dollars(row.sellHigh)}. Offers for it would be refused.`
      : null;
  const note =
    cents < row.payLow || cents > row.payHigh
      ? `The usual pay for this job is ${dollars(row.payLow)}–${dollars(row.payHigh)}.`
      : null;
  return { floor: `Sponsors can't be charged under ${dollars(floor)} for this job at this rate.`, warning, note };
}

/* ------------------------------------------------------------ the links */

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function validId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID.test(id);
}

/** The editor for one athlete, with the job to open and, from the Matching
 *  Studio, the brief to go back to — or, from the athlete's profile, a way
 *  back there. */
export function rateEditorHref(
  athleteId: string,
  opts: { job?: string | null; brief?: string | null; from?: "profile" } = {},
): string {
  const u = new URLSearchParams();
  if (opts.job && validId(opts.job)) u.set("job", opts.job);
  if (opts.brief && validId(opts.brief)) u.set("brief", opts.brief);
  if (opts.from === "profile") u.set("from", "profile");
  const q = u.toString();
  return `/admin/athletes/${encodeURIComponent(athleteId)}/rates${q ? `?${q}` : ""}`;
}

/** Where the rate card's back link goes. The Studio's brief wins (that is
 *  the work in hand); `from=profile` goes back to the athlete's profile;
 *  anything else goes to the Studio. Built from ids, never from the URL. */
export function rateBackLink(
  athleteId: string,
  opts: { brief?: string | null; from?: string | null },
): { href: string; label: string } {
  if (!(opts.brief && validId(opts.brief)) && opts.from === "profile" && validId(athleteId)) {
    return { href: signupHref("ATHLETE", athleteId), label: "Back to the athlete's profile" };
  }
  return { href: studioHref(opts.brief), label: "Back to the Matching Studio" };
}

/** POL-FE-51 close-out — the rate card from the athlete's profile, for an
 *  approved athlete and a role that sets rates; otherwise no link. */
export function profileRateCardHref(
  s: { kind: string; state: string; id: string },
  roles: readonly string[],
): string | null {
  if (s.kind !== "ATHLETE" || (s.state !== "APPROVED" && s.state !== "AUTO_APPROVED")) return null;
  if (!mayWriteRates(roles) || !validId(s.id)) return null;
  return rateEditorHref(s.id, { from: "profile" });
}

/** Back to the Matching Studio on that brief — built here from an id, never
 *  taken from the URL as a path, so the link can't be pointed elsewhere. */
export function studioHref(briefId: string | null | undefined): string {
  return briefId && validId(briefId)
    ? `/admin/campaigns/match?${new URLSearchParams({ brief: briefId })}`
    : "/admin/campaigns/match";
}

/* --------------------------------------------------------- the refusals */

type ApiErrorBody = { error?: { message?: string; code?: string; issues?: Array<{ message?: string }> } } | null;

/** The API's refusal of a rate or a tier, in words a network manager acts on. */
export function rateRefusal(status: number, body: unknown, what: "rate" | "tier"): string {
  const said = (body as ApiErrorBody)?.error;
  const msg = said?.issues?.[0]?.message ?? said?.message ?? "";
  if (status === 403) {
    return `Your role can't set ${what === "rate" ? "rates" : "tiers"}, or this athlete isn't in your organisation. BTG admins and network managers set them.`;
  }
  if (status === 401) return "Your session has ended. Sign in again, then set it once more.";
  if (/no tier/i.test(msg)) return "Set this athlete's tier first. The tier is what the rate's sponsor price is checked against.";
  if (/featured athlete/i.test(msg)) return "This athlete is featured, not represented, so they hold no rates until they claim their profile and are activated.";
  if (status === 409 && /someone else/i.test(msg)) return "Someone else changed this rate just now. Reload the page to see it, then set yours again — nothing was overwritten.";
  if (status === 404) return "That job isn't in your catalogue any more. Reload the page.";
  if (status >= 500) return `Something went wrong on our side, so nothing was saved. Try again in a minute.`;
  return msg || `The ${what} wasn't saved (HTTP ${status}).`;
}

/** What the editor says after a save. */
export function savedRateLine(r: { jobId: string; jobName: string; amount: number; version: number; impliedMinimumSellPrice: number }, athlete: string): string {
  const v = r.version > 1 ? ` (version ${r.version}; earlier offers keep the rate they quoted)` : "";
  const job = r.jobName ? `${r.jobId} ${r.jobName}` : r.jobId;
  return `Saved. ${athlete} is now paid ${dollars(r.amount)} for ${job}${v}. Sponsors can't be charged under ${dollars(r.impliedMinimumSellPrice)} for it.`;
}
