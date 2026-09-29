/* --------------------------------------------------------------------------
   P6-FE-01 — the reward desk's live side: GET /rewards / GET /rewards/{id}
   shapes, and the pure rules the desk and creator draw from.

   WHAT A REWARD HOLDS. The offer, the terms, single-use and the expiry, one
   opaque token per athlete (and a QR PNG per token, rendered by the worker),
   and since P6-BE-08: who it is for (eligibility + a note), a redemption cap
   across all its tokens, and the fan page's own headline and subhead.
   Eligibility is STATED, not checked — the fan page has no login (§16), so
   the page tells the fan and the booth staff what to check; the cap IS
   enforced, by the API under a row lock at redeem. The fan's consent line is
   versioned centrally (fan-consent.ts, P6-SEC-01, pending counsel) and shown,
   not edited: per-reward consent wording would break the version the claim
   records.
   -------------------------------------------------------------------------- */

export type ApiRewardState = "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "ARCHIVED";
export type Funnel = { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };
export type RewardEligibility = "ANYONE" | "AGE_18_PLUS" | "AGE_21_PLUS" | "TICKET_HOLDERS";

export type ApiReward = {
  id: string;
  offerText: string;
  terms: string;
  singleUse: boolean;
  expiresAt: string;
  state: ApiRewardState;
  /* P6-BE-08 — optional so a desk against an older API still renders. */
  eligibility?: RewardEligibility;
  eligibilityNote?: string | null;
  redemptionCap?: number | null;
  /* QA pass 5 — on a capped reward: the database's redemption counter (what
     the till enforces against; null when uncapped), the units claims hold
     right now, and the hold window in minutes. */
  redeemed?: number | null;
  held?: number;
  reserveMinutes?: number;
  landing?: { headline: string | null; subhead: string | null };
  campaign: { id: string; name: string; sponsorName: string; endDate: string };
  athletes: number;
  tokenCount: number;
  funnel?: Funnel;
};

export type ApiRewardDetail = ApiReward & {
  tokens: { id: string; athlete: { id: string; displayName: string } | null; qrReady: boolean; token?: string }[];
  consent: { version: string; text: string };
};

export type NewReward = {
  campaignId: string;
  offerText: string;
  terms: string;
  expiresAt: string;
  singleUse: boolean;
  eligibility: RewardEligibility;
  eligibilityNote: string | null;
  redemptionCap: number | null;
  landingHeadline: string | null;
  landingSubhead: string | null;
  /** QA-09 — how long a claim holds a unit of a capped reward. */
  reserveMinutes: number;
  athleteIds: string[];
  activate: boolean;
  /** A retry after a part-way failure: finish THIS reward (issue the tokens
   *  it is missing, go live if asked) instead of creating another. */
  resumeRewardId?: string;
};

export type CreateRewardResult =
  /** `offerText` is the SAVED offer — on a finished retry, the reward as it
   *  was first created, not whatever the form says now (QA pass 6, P6-FE-03). */
  | { ok: true; rewardId: string; tokens: number; activated: boolean; offerText?: string }
  | { ok: false; message: string; rewardId?: string };
export type SimpleResult = { ok: true } | { ok: false; message: string };
export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** reward-state.ts, as the desk offers it. `expired` (the expiry has
 *  passed): no move to ACTIVE — the API refuses it (F-09), so the desk
 *  doesn't offer "Go live" / "Resume" on an offer that is over. */
export function rewardMoves(s: ApiRewardState, expired = false): { to: ApiRewardState; label: string }[] {
  return movesFrom(s).filter((m) => !(expired && m.to === "ACTIVE"));
}

function movesFrom(s: ApiRewardState): { to: ApiRewardState; label: string }[] {
  switch (s) {
    case "DRAFT":
      return [
        { to: "ACTIVE", label: "Go live" },
        { to: "ARCHIVED", label: "Archive" },
      ];
    case "ACTIVE":
      return [
        { to: "PAUSED", label: "Pause" },
        { to: "EXPIRED", label: "End now" },
      ];
    case "PAUSED":
      return [
        { to: "ACTIVE", label: "Resume" },
        { to: "ARCHIVED", label: "Archive" },
      ];
    default:
      return [];
  }
}

export const STATE_COPY: Record<ApiRewardState, string> = {
  DRAFT: "Not live yet — fans who scan see nothing to claim.",
  ACTIVE: "Live — scans, claims and redemptions are counting.",
  PAUSED: "Paused — scans still land, but nothing can be claimed.",
  EXPIRED: "Ended — the page tells fans it's over.",
  ARCHIVED: "Archived — kept for the record.",
};

/**
 * Redemption rate — redeemed of claimed, whole percent (F-04).
 *
 * WHY IT CAN'T SIMPLY DIVIDE. The booth's "Staff: redeem now" works on a code
 * nobody claimed first (the fan page offers it straight away — a fan who
 * just shows the screen), so REDEEM can exceed CLAIM and "redeemed of
 * claimed" read 200%. That flow stays: a claim is optional by design (§16 —
 * no barrier at a stall). So the rate is shown only when it means what it
 * says — claims cover the redemptions — and otherwise "—" with the reason.
 */
export function redemptionRate(f: Funnel | undefined): { rate: number | null; hint: string | null } {
  if (!f || (f.CLAIM === 0 && f.REDEEM === 0)) return { rate: null, hint: null };
  if (f.REDEEM > f.CLAIM) {
    return { rate: null, hint: "Some codes were redeemed at the booth without a claim first, so a rate of claims would overstate it." };
  }
  return { rate: Math.round((100 * f.REDEEM) / f.CLAIM), hint: null };
}

/** The rate alone — null whenever `redemptionRate` shows "—". */
export function redeemRate(f: Funnel | undefined): number | null {
  return redemptionRate(f).rate;
}

/* ------------------------------------------------- F-08 · one time zone */

/**
 * Every reward time — the desk, the creator, the fan page, a claim's hold —
 * reads in ONE zone, labelled: US Eastern. Before this the desk showed UTC
 * ("Oct 28") and the fan page Eastern ("Oct 27") for the same instant.
 */
export const REWARD_TIME_ZONE = "America/New_York";

/* ICU puts a narrow no-break space before AM/PM; plain text keeps a space. */
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

/** "Oct 27, 2026, 8:00 PM ET" */
export function fmtEt(iso: string): string {
  return `${plain(new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: REWARD_TIME_ZONE,
  }))} ET`;
}

/** "3:45 PM ET" */
export function fmtEtTime(iso: string): string {
  return `${plain(new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: REWARD_TIME_ZONE }))} ET`;
}

/** The ET calendar day of an instant, as "2026-10-01". */
function etDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: REWARD_TIME_ZONE });
}

/**
 * A time that may not be today — a claim's hold runs up to 7 days (QA pass 6,
 * P6-FE-01: "until 4:06 AM ET" for a week-long hold read as today). The time
 * alone when it falls on today's date in Eastern; otherwise the date too —
 * "Mon, Oct 5, 4:06 AM ET" — and the year when it isn't this year.
 */
export function fmtEtWhen(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (etDay(at) === etDay(now)) return fmtEtTime(iso);
  const sameYear = etDay(at).slice(0, 4) === etDay(now).slice(0, 4);
  return `${plain(at.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric", minute: "2-digit", timeZone: REWARD_TIME_ZONE,
  }))} ET`;
}

/* --------------------------------------------- QA-09 · the hold window */

export const HOLD_PRESETS = [
  { value: "15", label: "15 minutes" },
  { value: "60", label: "1 hour" },
  { value: "1440", label: "24 hours" },
  { value: "custom", label: "Custom…" },
] as const;
export type HoldPreset = (typeof HOLD_PRESETS)[number]["value"];

/** The creator's hold window in minutes, or "invalid" for a custom value
 *  outside 5 min – 7 days (the API's and the database's bounds). */
export function holdPreset(preset: HoldPreset, custom: string): number | "invalid" {
  if (preset !== "custom") return Number(preset);
  const t = custom.trim();
  if (!/^\d+$/.test(t)) return "invalid";
  const n = Number(t);
  return n >= 5 && n <= 10_080 ? n : "invalid";
}

/** The expiry presets, as real instants: n days out, or the campaign end. */
export function expiryFor(preset: "30" | "60" | "90" | "campaign", now: Date, campaignEnd: string): string {
  if (preset === "campaign") return new Date(campaignEnd).toISOString();
  return new Date(now.getTime() + Number(preset) * 86_400_000).toISOString();
}

/** The fan-facing claim page for a token (the QR encodes this). */
export function fanPath(token: string): string {
  return `/r/${encodeURIComponent(token)}`;
}

/* ------------------------------------------------------------ P6-BE-08 */

/** Who a reward is for — the desk's label and the fan page's line. The fan
 *  line is written for the fan; `staff` is the redeem step's reminder of
 *  what to check, because nothing else checks it (no login, §16). */
export const ELIGIBILITY: Record<RewardEligibility, { label: string; fan: string | null; staff: string | null }> = {
  ANYONE: { label: "Anyone", fan: null, staff: null },
  AGE_18_PLUS: { label: "18+ only", fan: "For fans 18 and over.", staff: "Check ID — 18+ only." },
  AGE_21_PLUS: { label: "21+ only", fan: "For fans 21 and over.", staff: "Check ID — 21+ only." },
  TICKET_HOLDERS: { label: "Ticket holders", fan: "For ticket holders at this event.", staff: "Check their ticket or wristband." },
};

/** The desk's cap line. `redeemed` is the database's counter (or the
 *  funnel's REDEEM count from an older API); `held` the units claims are
 *  holding right now (QA-09) — part of what is left, reserved for the fans
 *  who claimed them. */
export function capLine(cap: number | null | undefined, redeemed: number | undefined, held = 0): string {
  if (cap == null) return "unlimited";
  const n = (x: number) => x.toLocaleString("en-US");
  const unredeemed = Math.max(0, cap - (redeemed ?? 0));
  if (unredeemed === 0) return `all ${n(cap)} used`;
  if (held <= 0) return `${n(unredeemed)} of ${n(cap)} left`;
  /* QA pass 6 (P6-FE-04): a held unit is not "left" for anyone else. The fan
     page's rule is redeemed + live holds ≥ cap ⇒ run out for a non-holder,
     so the desk counts the same way: only unheld units are free. */
  const free = Math.max(0, unredeemed - held);
  if (free === 0) return `all ${n(cap)} taken · ${n(Math.min(held, unredeemed))} held`;
  return `${n(free)} of ${n(cap)} free · ${n(held)} held`;
}

/** The hold window, short: "15 min", "90 min", "1 h", "2 h", "1 day",
 *  "7 days", "1 day 6 h". */
export function holdLabel(minutes: number): string {
  if (minutes < 60 || minutes % 60 !== 0) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days} day${days === 1 ? "" : "s"}${rest ? ` ${rest} h` : ""}`;
}

/** The creator's cap field: blank = unlimited (null); otherwise a whole
 *  number from 1 up, or "invalid" so the form can say so before the API does. */
export function parseCap(input: string): number | null | "invalid" {
  const t = input.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "invalid";
  const n = Number(t);
  return n >= 1 && n <= 1_000_000 ? n : "invalid";
}

/* --------------------------------------------------------------------------
   Server-paged desk (2026-09-29). The desk's tab, search and campaign filter
   live in the URL and are answered by the API — GET /rewards?page= for one
   page, GET /rewards/summary for the tab counts and the strip — instead of
   fetching 200 rewards to filter them in the browser.
   -------------------------------------------------------------------------- */

/** The desk's tabs, by reward state — the API maps the same keys (rewards.ts
 *  REWARD_TABS): "ended" is EXPIRED or ARCHIVED. */
export const REWARD_TABS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Draft" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Ended" },
] as const;
export type RewardTab = (typeof REWARD_TABS)[number]["key"];
export const REWARD_TAB_KEYS: readonly string[] = REWARD_TABS.map((t) => t.key);

/** GET /rewards/summary. `funnel` null for a caller who doesn't read events. */
export type RewardSummary = {
  tabs: Record<RewardTab, number>;
  live: number;
  funnel: { SCAN: number; CLAIM: number; REDEEM: number } | null;
};

export const EMPTY_SUMMARY: RewardSummary = {
  tabs: { all: 0, live: 0, draft: 0, paused: 0, ended: 0 },
  live: 0,
  funnel: null,
};

/** The desk's URL filters → the extras the API list is sent. "all" is the
 *  default tab and is not sent. */
export function rewardDeskFilters(sp: Record<string, string | string[] | undefined>): { q: string; tab: RewardTab; campaignId: string } {
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  const tab = one(sp.tab);
  return {
    q: one(sp.q).slice(0, 100),
    tab: REWARD_TAB_KEYS.includes(tab) ? (tab as RewardTab) : "all",
    campaignId: one(sp.campaignId).slice(0, 100),
  };
}

/** What a reward can attach to: a campaign with athletes signed onto it. */
export const REWARDABLE_STATES = ["STAFFING", "APPROVAL", "ACTIVE", "REPORTING"] as const;
export const PICKER_SIZE = 24;

/** The creator's campaign picker query — one page of rewardable campaigns,
 *  by name, searched in the database (never every campaign). */
export function campaignPickerPath(q: string): string {
  const u = new URLSearchParams({ page: "1", size: String(PICKER_SIZE), sort: "name", state: REWARDABLE_STATES.join(",") });
  const t = q.trim().slice(0, 100);
  if (t) u.set("q", t);
  return `/campaigns?${u}`;
}

export type CampaignOption = { id: string; name: string; sponsorName: string; endDate: string };

/** A picker result: the options shown and how many matched in all. */
export type CampaignSearch = { ok: true; campaigns: CampaignOption[]; total: number } | { ok: false; message: string };

/** GET /campaigns?page= rows → picker options, filtered to what can take a
 *  reward (belt and braces — the query already asks for those states). */
export function pickerOptions(rows: { id: string; name: string; sponsorName: string; endDate: string; state?: string }[]): CampaignOption[] {
  const ok = new Set<string>(REWARDABLE_STATES);
  return rows
    .filter((c) => c.state === undefined || ok.has(c.state))
    .map((c) => ({ id: c.id, name: c.name, sponsorName: c.sponsorName, endDate: c.endDate }));
}
