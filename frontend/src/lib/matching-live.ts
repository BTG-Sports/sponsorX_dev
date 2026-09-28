import type { MatchAthlete, MatchData, MatchTier } from "@/lib/matching";

/* --------------------------------------------------------------------------
   P4-FE-02 / P4-FE-03 — the Matching Studio's live translation.

   GET /briefs/{id} + GET /briefs/{id}/eligible-athletes → the MatchData the
   Studio renders. Pure, like applications-live: data in, a bundle out.

   HOW A PACKAGE BECOMES SLOTS. A §7 package is a set of job lines each
   athlete delivers ("SX-02 ×1"), for between athleteCountMin and
   athleteCountMax athletes. So the live Studio has ONE job row — the
   package — with athleteCountMax slots, and each pick becomes one
   invitation per line. That is what the backend's invitation actually is
   (one job, one offer), so the roster can't promise a shape it can't send.

   MONEY, per pick, in cents:
     cost = Σ athlete's current rate for the line's job × quantity
     sell = Σ the job's sell floor for the athlete's tier × quantity
   The sell floor is the sponsor price the catalogue says this tier earns
   (NilJob.sellFloor*), never below the job's band.

   UNITS. The NIL job catalogue is WHOLE DOLLARS (backend domain/nil-jobs.ts
   — the schema's "integer cents" comment on NilJob is stale); athlete rates
   and invitation offers are CENTS. Catalogue prices are ×100 here, once, so
   cost and sell meet in the same unit before any margin is computed. A missing rate is not
   zero: the row is kept, marked "No rate on file", and can't be picked —
   there is no offer to send.

   NOTHING INVENTED. Unscored → null (a dash); no follower counts → null
   reach; conflicted athletes never arrive (the query excludes them, §26),
   so live rows carry no conflict and the Studio says so.
   -------------------------------------------------------------------------- */

/** Catalogue prices in WHOLE DOLLARS (see UNITS above). */
export type ApiBriefJob = {
  jobId: string;
  name: string;
  quantity: number;
  sellLow: number;
  sellHigh: number;
  sellFloors: { EMERGING: number; CREATOR: number; PREMIUM: number };
};

export type ApiBrief = {
  id: string;
  objective: string;
  state: string;
  budget: number;
  startDate: string;
  endDate: string;
  sports: string[];
  stateCodes: string[];
  categories: string[];
  createdAt: string;
  sponsorName: string;
  package: {
    code: string;
    name: string;
    lineItems: unknown;
    athleteCountMin: number;
    athleteCountMax: number;
  } | null;
  campaign: { id: string; name: string; state: string } | null;
  jobs?: ApiBriefJob[];
  invites?: { id: string; athleteId: string; jobId: string; state: string; offered?: number; expiresAt: string }[];
};

export type ApiEligibleAthlete = {
  id: string;
  displayName: string;
  sport: string;
  stateCode: string | null;
  tier: string | null;
  matched: { sport: boolean; geography: boolean };
  city?: string | null;
  score?: { value: number; factors: unknown; method: string; scoredAt: string } | null;
  reach?: { followers: number | null; verified: boolean };
  rates?: { jobId: string; amount: number }[];
};

/** The Studio's comparison rows, in COMPARE_FACTORS order, keyed as the
 *  §14 breakdown stores them (applications-live's FACTOR_LABELS). */
const FACTOR_KEYS = [
  "engagement",
  "contentQuality",
  "audience",
  "reliability",
  "geography",
  "sportBrandFit",
] as const;

const TIER: Record<string, MatchTier> = {
  ANCHOR: "Anchor",
  PREMIUM: "Premium",
  CREATOR: "Creator",
  EMERGING: "Emerging",
};

/** Which catalogue floor a tier earns, in CENTS. Anchor prices at the top
 *  published floor; an untiered athlete at the bottom — never guessed up. */
function floorFor(tier: string | null, j: ApiBriefJob): number {
  const f =
    tier === "ANCHOR" || tier === "PREMIUM"
      ? j.sellFloors.PREMIUM
      : tier === "CREATOR"
        ? j.sellFloors.CREATOR
        : j.sellFloors.EMERGING;
  return Math.max(f, j.sellLow) * 100;
}

/** The stored §14 breakdown → six values; a missing factor is null. */
export function factorsOf(raw: unknown): (number | null)[] {
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { factors?: unknown }).factors)
      ? ((raw as { factors: { factor?: unknown; value?: unknown }[] }).factors)
      : [];
  return FACTOR_KEYS.map((k) => {
    const hit = list.find((f) => f.factor === k);
    return typeof hit?.value === "number" ? hit.value : null;
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Why a brief can't send yet, or null. */
export function sendBlockedFor(b: ApiBrief): string | null {
  if (!b.package || !(b.jobs?.length))
    return "This brief has no package with priced jobs yet — BTG sets one before invitations can go out.";
  if (b.state !== "APPROVED" && b.state !== "CAMPAIGN_CREATED")
    return `The brief is ${b.state.toLowerCase().replace(/_/g, " ")} — it must be approved before invitations go out.`;
  return null;
}

/** One eligible row → the Studio's athlete, priced against the package. */
export function toMatchAthlete(
  a: ApiEligibleAthlete,
  jobs: ApiBriefJob[],
  pkgId: string,
  inviteState: string | null,
): MatchAthlete {
  const rates = a.rates ?? [];
  let noRate: string | null = null;
  const lines = jobs.map((j) => {
    const rate = rates.find((r) => r.jobId === j.jobId);
    if (!rate && !noRate) noRate = j.jobId;
    return { jobId: j.jobId, quantity: j.quantity, offered: rate ? rate.amount * j.quantity : 0 };
  });
  const cost = lines.reduce((n, l) => n + l.offered, 0);
  const sell = jobs.reduce((n, j) => n + floorFor(a.tier, j) * j.quantity, 0);

  return {
    id: a.id,
    name: a.displayName,
    sport: a.sport,
    market: [a.city, a.stateCode].filter(Boolean).join(", ") || "—",
    tier: (a.tier && TIER[a.tier]) || "Untiered",
    score: a.score ? a.score.value : null,
    factors: a.score ? factorsOf(a.score.factors) : FACTOR_KEYS.map(() => null),
    reach: a.reach?.followers ?? null,
    /* `verified` means "no social is self-reported", and AthleteSocial.source
       is only ever written VERIFIED_MANUAL or SELF_REPORTED today
       (athlete-social.ts) — so verified reach is staff-checked, never
       platform-read. Labelled for the weakest thing it can be (P7-QA-02). */
    reachSource: a.reach?.verified ? "VERIFIED_MANUAL" : "SELF_REPORTED",
    cost,
    sell,
    jobId: pkgId,
    /* The query returns ACTIVE athletes only, and ACTIVE already required a
       verified guardian for a minor (§37) — so live rows are never pending. */
    guardian: "na",
    active: true,
    conflict: null,
    noRate,
    lines: noRate ? [] : lines,
    invite: inviteState,
  };
}

/** Latest invite state per athlete on this campaign — the roster's SENT. */
function inviteStates(b: ApiBrief): Map<string, string> {
  const out = new Map<string, string>();
  for (const i of b.invites ?? []) out.set(i.athleteId, i.state); // oldest→newest
  return out;
}

export function toMatchData(b: ApiBrief, eligible: ApiEligibleAthlete[]): MatchData {
  const jobs = b.jobs ?? [];
  const pkgId = b.package?.code ?? "NO_PACKAGE";
  const needed = b.package?.athleteCountMax ?? 0;
  const invites = inviteStates(b);
  const roster = eligible.map((a) => toMatchAthlete(a, jobs, pkgId, invites.get(a.id) ?? null));

  const scored = eligible.filter((a) => a.score).map((a) => a.score!);
  const latest = scored.length
    ? scored.reduce((x, y) => (x.scoredAt > y.scoredAt ? x : y))
    : null;

  return {
    brief: {
      campaign: b.campaign?.name ?? b.objective,
      sponsor: b.sponsorName,
      code: b.package ? b.package.code : b.id.slice(-8).toUpperCase(),
      budget: b.budget,
      window: `${fmtDate(b.startDate)} – ${fmtDate(b.endDate)}`,
      windowNote: "invitations expire 7 days after send",
      market: b.stateCodes.length ? b.stateCodes.join(", ") : "Any market",
      marketNote: b.sports.length ? b.sports.join(", ") : "any sport",
      needed,
      sponsorCategory: b.categories.length ? b.categories.join(", ") : "—",
      responseDeadline: "7 days after send",
      scoreSnapshot: latest ? `latest ${fmtDate(latest.scoredAt)}` : "none scored yet",
      scoreMethod: latest?.method ?? "rules-v1",
    },
    jobs: [
      {
        id: pkgId,
        label: b.package?.name ?? "No package",
        perAthlete: jobs.map((j) => `${j.jobId} ×${j.quantity}`).join(" · ") || "—",
        slots: needed,
        deliverable: jobs.map((j) => `${j.quantity} × ${j.name}`).join(", ") || "no priced jobs",
      },
    ],
    roster,
    defaultShortlist: [],
    conflicts: {},
    live: true,
    sendBlocked: sendBlockedFor(b),
  };
}
