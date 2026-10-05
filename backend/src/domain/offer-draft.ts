/**
 * An offer, filled in for BTG to check — P4-BE-08 (BTG admin review item 19;
 * programme owner, 2026-10-03).
 *
 * GET /campaigns/:id/offer-draft?athleteId=&jobId= answers the new-offer
 * form's every field from the records that already decide it, each with the
 * words saying where it came from. BTG reads it, changes what it likes, and
 * saves and sends through the routes it always used — which ask every rule
 * again. Nothing here writes: a draft that created a row would be an offer
 * nobody decided to make.
 *
 * WHERE EACH FIELD COMES FROM:
 *
 *   compensation  the athlete's current rate for the job (their rate card,
 *                 the highest version — the floor drafting enforces, so the
 *                 pay sits exactly on it); else the midpoint of the job's
 *                 base range
 *   sellPrice     the job's sell range for the athlete's tier: the tier's
 *                 published sell floor, never below the range's bottom
 *                 (Anchor, whose multiplier is negotiated, at the top
 *                 published floor; untiered at the bottom) — the price the
 *                 matching desk shows — and never below 1.4 × the pay, the
 *                 margin floor drafting enforces
 *   deliverables  the job's template (deliverable-template.ts), the last
 *                 item due on the campaign's end date — moved later only if
 *                 the first would fall within DELIVERABLE_LEAD_DAYS of the
 *                 offer's expiry; a job with no template owes one
 *                 deliverable named after it
 *   disclosures   "#ad", plus CATEGORY_DISCLOSURES for the brief's and the
 *                 sponsor's categories
 *   usageRights   OFFER_DRAFT_DEFAULTS.usageRights, stated over the
 *                 package's term when it has one
 *   exclusivity   the package's: none unless it is exclusive; then its term
 *                 (or the campaign's length), and only once the sponsor has
 *                 brand categories, as drafting requires
 *   expiresAt     DEFAULT_INVITE_WINDOW_DAYS (7) from now, end of that day
 *   brief         the sponsor brief's objective; the campaign's name when
 *                 it has no brief
 *
 * Catalogue prices (NilJob) are WHOLE DOLLARS (nil-jobs.ts); rates, offers
 * and budgets are cents. Converted here, once.
 *
 * WHO. BTG's offer writers (offer write, tenant-wide — campaign managers and
 * admins), on a campaign they may write, for an ACTIVE athlete of their own
 * tenant whom no restriction bars from the campaign's categories. Another
 * tenant's campaign, athlete or job answers 404, as an unknown id does.
 */
import { prisma } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { DELIVERABLE_TEMPLATES, deliverablesForOrder } from "./deliverable-template";
import { AthleteNotActiveError, CategoryConflictError, DEFAULT_INVITE_WINDOW_DAYS } from "./invitation";
import { lineFloor } from "./margin-floor";
import { athleteFloor, offerParty, PARTY_SELECT } from "./offer-desk";
import { OfferError } from "./offer";
import { restrictionConflicts } from "./restrictions";
import { SENSITIVE_CATEGORIES } from "./brand-categories";

export const OFFER_DRAFT_DEFAULTS = {
  usageRights: "Organic posts on the sponsor's own social channels during the campaign and for 90 days after it ends.",
  disclosure: "#ad",
  expiresInDays: DEFAULT_INVITE_WINDOW_DAYS,
} as const;

/** The first deliverable is due no sooner than this many days after the
 *  offer expires, so an athlete who accepts on the last day can still do it. */
export const DELIVERABLE_LEAD_DAYS = 7;

/** What a category adds to "#ad". Age-gated categories carry the age; BTG
 *  edits or adds to these per offer. P4-BE-11 — built from the one list of
 *  sensitive categories (brand-categories.ts), which also holds a brief in
 *  one of them for BTG. */
export const CATEGORY_DISCLOSURES: Readonly<Record<string, string>> = Object.fromEntries(
  SENSITIVE_CATEGORIES.map((c) => [c, "21+"]),
);

export class OfferDraftNotFoundError extends Error {
  readonly status = 404;
  constructor(what: "campaign" | "athlete" | "job") {
    super(`No such ${what} to draft an offer for.`);
    this.name = "OfferDraftNotFoundError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 23:59:59 UTC of the day — the instant the offer form saves a date as
 *  (admin-offers-live endOfDay), so a draft saved unchanged round-trips. */
const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 0));
const usd = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const dateWords = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const TIER_WORDS: Record<string, string> = { EMERGING: "Emerging", CREATOR: "Creator", PREMIUM: "Premium", ANCHOR: "Anchor" };

type Job = {
  id: string; name: string; baseLow: number; baseHigh: number; sellLow: number;
  sellFloorEmerging: number; sellFloorCreator: number; sellFloorPremium: number;
};

/** The tier's sell price for a job, in cents, and why — pure. */
export function tierSellPrice(job: Job, tier: string | null): { cents: number; why: string } {
  const floor = tier === "ANCHOR" || tier === "PREMIUM" ? job.sellFloorPremium : tier === "CREATOR" ? job.sellFloorCreator : job.sellFloorEmerging;
  const whose = tier === "ANCHOR"
    ? "Anchor is negotiated, so the Premium sell floor"
    : tier ? `the ${TIER_WORDS[tier] ?? tier} sell floor` : "untiered, so the Emerging sell floor";
  if (job.sellLow > floor) {
    return { cents: job.sellLow * 100, why: `The bottom of ${job.name}'s sell range (${usd(job.sellLow * 100)}) — above ${whose} for it` };
  }
  return { cents: floor * 100, why: `${whose[0]!.toUpperCase()}${whose.slice(1)} for ${job.name} (${usd(floor * 100)})` };
}

/** The draft's deliverables, in date order — pure. */
export function draftDeliverables(
  job: { id: string; name: string },
  campaignEnd: Date,
  expiresAt: Date,
): { items: { title: string; dueDate: Date }[]; why: string } {
  const template = DELIVERABLE_TEMPLATES[job.id];
  const lead = Math.max(0, ...(template ?? []).map((t) => t.daysBeforeDue));
  const earliestLast = new Date(expiresAt.getTime() + (DELIVERABLE_LEAD_DAYS + lead) * DAY_MS);
  const moved = endOfDay(campaignEnd) < earliestLast;
  const last = endOfDay(moved ? earliestLast : campaignEnd);
  const when = moved
    ? `the last due ${dateWords(last)} — after the campaign's end, so the first is due a week after the offer expires`
    : "the last due on the campaign's end date";
  if (!template?.length) {
    return { items: [{ title: job.name, dueDate: last }], why: `${job.name} has no deliverable template, so one deliverable named after it — ${when}` };
  }
  return {
    items: deliverablesForOrder({ jobId: job.id, dueDate: last }),
    why: `From the ${job.name} template, ${when}`,
  };
}

/** The draft. Reads only. */
export async function offerDraft(actor: Actor, campaignId: string, q: { athleteId?: string; jobId?: string }) {
  return draftOfferIn(prisma as unknown as Prisma.TransactionClient, actor, campaignId, q);
}

/**
 * The draft, read through `db` — offerDraft's body, and P4-BE-12's automatic
 * staffing, which reads it inside its own transaction and asks for its own
 * answer window (`expiresAt`, AUTO_OFFER_WINDOW_DAYS from now) in place of
 * the default. Every other field comes from the same sources.
 */
export async function draftOfferIn(
  db: Prisma.TransactionClient,
  actor: Actor,
  campaignId: string,
  q: { athleteId?: string; jobId?: string },
  opts: { now?: Date; expiresAt?: Date; expiresWhy?: string } = {},
) {
  assertTenantWide(actor, "offer", "write");
  const now = opts.now ?? new Date();

  /* The campaign must be one the caller may write — as drafting asks. */
  const campaign = await db.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "write"), id: campaignId },
    select: {
      id: true, name: true, startDate: true, endDate: true,
      sponsor: { select: { name: true, categories: true } },
      brief: {
        select: {
          objective: true, categories: true,
          package: { select: { name: true, exclusivity: true, durationWeeks: true } },
        },
      },
    },
  });
  if (!campaign) throw new OfferDraftNotFoundError("campaign");
  if (!q.athleteId || !q.jobId) throw new OfferError("Name the athlete and the NIL job to draft an offer for.");

  const athlete = await db.athlete.findFirst({
    where: { AND: [whereFor(actor, "athlete", "read"), { tenantId: actor.tenantId, id: q.athleteId }] },
    select: { id: true, state: true, tier: true, ...PARTY_SELECT },
  });
  if (!athlete) throw new OfferDraftNotFoundError("athlete");
  const job = await db.nilJob.findFirst({
    where: { tenantId: actor.tenantId, id: q.jobId },
    select: {
      id: true, name: true, baseLow: true, baseHigh: true, sellLow: true,
      sellFloorEmerging: true, sellFloorCreator: true, sellFloorPremium: true,
    },
  });
  if (!job) throw new OfferDraftNotFoundError("job");

  /* Never a draft the shortlist would not show, or the invitation refuse:
     an athlete who cannot take paid work, or one a restriction bars from
     this campaign's categories (the brief's and the sponsor's, as drafting
     asks) over its dates. */
  if (athlete.state !== "ACTIVE") throw new AthleteNotActiveError(athlete.state);
  const categories = [...new Set([...(campaign.brief?.categories ?? []), ...campaign.sponsor.categories])];
  const expiresAt = opts.expiresAt ?? endOfDay(new Date(now.getTime() + OFFER_DRAFT_DEFAULTS.expiresInDays * DAY_MS));
  const deliverables = draftDeliverables(job, campaign.endDate, expiresAt);
  const lastDue = deliverables.items.reduce((d, i) => (i.dueDate > d ? i.dueDate : d), campaign.endDate);
  const conflicts = await restrictionConflicts(db, {
    tenantId: actor.tenantId, athleteId: athlete.id, categories,
    startsOn: new Date(Math.min(campaign.startDate.getTime(), ...deliverables.items.map((i) => i.dueDate.getTime()))),
    endsOn: lastDue,
  });
  if (conflicts.length) throw new CategoryConflictError([...new Set(conflicts.map((c) => c.category))]);

  const who = firstName(athlete.displayName);

  /* Pay: the rate card, else the base range's midpoint. */
  const rate = await athleteFloor(db, actor.tenantId, athlete.id, job.id, null);
  const compensation = rate.floorCents ?? Math.round(((job.baseLow + job.baseHigh) / 2) * 100);
  const compensationWhy = rate.floorCents !== null
    ? `From ${who}'s rate card for ${job.name}`
    : `No rate on file for ${who} — the middle of ${job.name}'s base range (${usd(job.baseLow * 100)}–${usd(job.baseHigh * 100)})`;

  /* Sell: the tier's point in the sell range, never under the margin floor. */
  const tierPrice = tierSellPrice(job, athlete.tier);
  const marginFloor = lineFloor(compensation);
  const sellPrice = Math.max(tierPrice.cents, marginFloor);
  const sellWhy = sellPrice > tierPrice.cents
    ? `Raised to 1.4 × the pay (${usd(marginFloor)}), the margin floor — ${tierPrice.why.charAt(0).toLowerCase()}${tierPrice.why.slice(1)} is below it`
    : tierPrice.why;

  /* Disclosures: #ad, and what the categories add. */
  const extra = [...new Set(categories.flatMap((c) => (CATEGORY_DISCLOSURES[c] ? [CATEGORY_DISCLOSURES[c]] : [])))];
  const disclosures = [OFFER_DRAFT_DEFAULTS.disclosure, ...extra];
  const disclosuresWhy = extra.length
    ? `"#ad" on every paid post, and ${extra.join(", ")} for the ${categories.filter((c) => CATEGORY_DISCLOSURES[c]).map((c) => c.toLowerCase().replace(/_/g, " ")).join(" and ")} category`
    : `"#ad" on every paid post — nothing more for this campaign's categories`;

  /* Usage and exclusivity: the package's terms where it has them. */
  const pkg = campaign.brief?.package ?? null;
  const weeks = pkg?.durationWeeks ?? null;
  const usageRights = weeks
    ? `Organic posts on the sponsor's own social channels for the package's ${weeks} weeks and for 90 days after.`
    : OFFER_DRAFT_DEFAULTS.usageRights;
  const usageWhy = weeks
    ? `BTG's standard usage terms over the ${pkg!.name} package's ${weeks}-week term`
    : pkg ? `BTG's standard usage terms — the ${pkg.name} package sets no term` : "BTG's standard usage terms — the campaign has no package";
  let exclusivityDays: number | null = null;
  let exclusivityWhy: string;
  if (!pkg) exclusivityWhy = "No package, so no exclusivity";
  else if (!pkg.exclusivity) exclusivityWhy = `The ${pkg.name} package is not exclusive`;
  else if (!campaign.sponsor.categories.length) {
    exclusivityWhy = `The ${pkg.name} package is exclusive, but ${campaign.sponsor.name} has no brand categories yet — BTG sets them before exclusivity can be offered`;
  } else {
    const days = weeks ? weeks * 7 : Math.max(1, Math.ceil((campaign.endDate.getTime() - campaign.startDate.getTime()) / DAY_MS));
    exclusivityDays = Math.min(730, days);
    exclusivityWhy = weeks
      ? `The ${pkg.name} package is exclusive for its ${weeks} weeks`
      : `The ${pkg.name} package is exclusive — for the campaign's ${days} days`;
  }

  const brief = campaign.brief?.objective.trim() || campaign.name;
  const briefWhy = campaign.brief?.objective.trim() ? "From the sponsor's brief" : "The campaign has no brief, so its name";

  return {
    campaignId: campaign.id,
    athlete: { id: athlete.id, ...offerParty(actor, athlete, now) },
    job: { id: job.id, name: job.name },
    /* OfferInput exactly — POST /offers takes it unchanged. */
    offer: {
      campaignId: campaign.id,
      athleteId: athlete.id,
      jobId: job.id,
      inventoryItemId: null,
      brief,
      compensation,
      sellPrice,
      deliverables: deliverables.items.map((d) => ({ title: d.title, dueDate: d.dueDate.toISOString() })),
      usageRights,
      exclusivityDays,
      disclosures,
      expiresAt: expiresAt.toISOString(),
    },
    sources: {
      brief: briefWhy,
      compensation: compensationWhy,
      sellPrice: sellWhy,
      deliverables: deliverables.why,
      usageRights: usageWhy,
      exclusivityDays: exclusivityWhy,
      disclosures: disclosuresWhy,
      expiresAt: opts.expiresWhy ?? `Offers expire ${OFFER_DRAFT_DEFAULTS.expiresInDays} days after they are drafted, as invitations do`,
    },
  };
}
