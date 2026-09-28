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
  | { ok: true; rewardId: string; tokens: number; activated: boolean }
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
  const left = Math.max(0, cap - (redeemed ?? 0));
  if (left === 0) return `all ${cap.toLocaleString("en-US")} used`;
  const line = `${left.toLocaleString("en-US")} of ${cap.toLocaleString("en-US")} left`;
  return held > 0 ? `${line} · ${held.toLocaleString("en-US")} held` : line;
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
