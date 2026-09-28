/* --------------------------------------------------------------------------
   P6-FE-01 — the reward desk's live side: GET /rewards / GET /rewards/{id}
   shapes, and the pure rules the desk and creator draw from.

   WHAT A REWARD CAN HOLD TODAY. The Reward model persists the offer, the
   terms, single-use and the expiry, plus one opaque token per athlete (and a
   QR PNG per token, rendered by the worker). Eligibility rules, redemption
   limits and custom landing copy have NO columns yet — they are raised as a
   backend task rather than faked here. The fan's consent line is versioned
   centrally (fan-consent.ts, P6-SEC-01, pending counsel) and shown, not
   edited: per-reward consent wording would break the version the claim
   records.
   -------------------------------------------------------------------------- */

export type ApiRewardState = "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED" | "ARCHIVED";
export type Funnel = { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };

export type ApiReward = {
  id: string;
  offerText: string;
  terms: string;
  singleUse: boolean;
  expiresAt: string;
  state: ApiRewardState;
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
  athleteIds: string[];
  activate: boolean;
};

export type CreateRewardResult =
  | { ok: true; rewardId: string; tokens: number; activated: boolean }
  | { ok: false; message: string; rewardId?: string };
export type SimpleResult = { ok: true } | { ok: false; message: string };
export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** reward-state.ts, as the desk offers it. */
export function rewardMoves(s: ApiRewardState): { to: ApiRewardState; label: string }[] {
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

/** Redemption rate — redeemed of claimed, whole percent; null before claims. */
export function redeemRate(f: Funnel | undefined): number | null {
  if (!f || f.CLAIM === 0) return null;
  return Math.round((100 * f.REDEEM) / f.CLAIM);
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
