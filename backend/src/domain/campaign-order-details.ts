/**
 * POL-BE-116 — a campaign's athlete order details (order-details-rules.ts):
 * set when the campaign is created (the builder, through the brief), kept on
 * the campaign, copied onto every offer and order for its job, and numbered.
 *
 *   - CREATED WITH THE CAMPAIGN. `prepareCampaignDetailsIn` reads the brief
 *     in the creating transaction: its details when the sponsor built them,
 *     else BTG's standard terms over the campaign's dates — the package's
 *     jobs and, where the package is exclusive and the sponsor has brand
 *     categories, its exclusivity. The campaign gets its three-letter code.
 *   - CHANGED UNTIL THE FIRST OFFER. `setCampaignOrderDetails` (BTG) changes
 *     them while nothing has been sent; after that every athlete's terms
 *     were fixed when sent, so a change would be a new campaign.
 *   - NUMBERED. `nextOrderNumberIn` gives each order SX-<code>-<year>-<n>,
 *     counted in the order's own transaction — a rollback uses no number,
 *     two orders at once get two.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { NIL_JOBS } from "./nil-jobs";
import { packageLines } from "./match-score";
import {
  DEFAULT_PAYMENT_DAYS, DEFAULT_USAGE_DAYS, FILMED_BY, JOB_IDS, ORDER_CHANNELS, ORDER_CODE, PAID_MEDIA_KINDS, PLATFORMS,
  defaultMedia, defaultOrderDetails, orderCodeCandidates, orderNumber, parseOrderDetails, suggestOrderCode,
  type JobId, type OrderDetails,
} from "./order-details-rules";

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;

export class OrderDetailsError extends Error {
  readonly status: number;
  readonly problems: string[];
  constructor(message: string, status = 422, problems: string[] = []) {
    super(problems.length ? `${message} ${problems.join("; ")}` : message);
    this.name = "OrderDetailsError";
    this.status = status;
    this.problems = problems;
  }
}

/** Parse, or refuse with every problem in words. */
export function requireOrderDetails(input: unknown): OrderDetails {
  const r = parseOrderDetails(input);
  if (!r.ok) throw new OrderDetailsError("The order details aren't complete:", 422, r.problems);
  return r.details;
}

/** A stored value read back; null when absent or no longer valid (never trusted blindly). */
export function storedOrderDetails(value: unknown): OrderDetails | null {
  if (value === null || value === undefined) return null;
  const r = parseOrderDetails(value);
  return r.ok ? r.details : null;
}

/* ── created with the campaign ───────────────────────────────────────────── */

/**
 * The details and code a campaign made from `briefId` starts with. Read in
 * the creating transaction (campaign-create.ts), so the three ways a
 * campaign is made — BTG by hand, BTG approving a held brief, the automatic
 * approval — all get them.
 */
export async function prepareCampaignDetailsIn(
  tx: Tx,
  brief: { id: string; tenantId: string; startDate: Date; endDate: Date },
  campaignName: string,
): Promise<{ orderDetails: OrderDetails; orderCode: string; orderCodeYear: number }> {
  const b = await tx.campaignBrief.findFirst({
    /* tenant-scope: the brief the caller found through its scope and locked, by id and tenant. */
    where: { id: brief.id, tenantId: brief.tenantId },
    select: {
      objective: true, orderDetails: true, orderCode: true,
      sponsor: { select: { name: true, categories: true } },
      package: { select: { lineItems: true, exclusivity: true, durationWeeks: true } },
    },
  });
  const built = storedOrderDetails(b?.orderDetails);
  let orderDetails: OrderDetails;
  if (built) {
    orderDetails = built;
  } else {
    const pkg = b?.package ?? null;
    const exclusive = pkg?.exclusivity && (b?.sponsor.categories.length ?? 0) > 0;
    const days = pkg?.durationWeeks ? pkg.durationWeeks * 7 : Math.max(1, Math.ceil((brief.endDate.getTime() - brief.startDate.getTime()) / DAY_MS));
    orderDetails = defaultOrderDetails({
      prompt: b?.objective ?? campaignName,
      start: brief.startDate,
      end: brief.endDate,
      jobIds: packageLines(pkg?.lineItems).map((l) => l.jobId),
      exclusivity: exclusive ? { category: b!.sponsor.categories.map((c) => c.toLowerCase().replace(/_/g, " ")).join(", "), days: Math.min(730, days) } : null,
    });
  }
  const year = new Date().getUTCFullYear();
  const orderCode = await freeOrderCode(tx, brief.tenantId, b?.orderCode ?? suggestOrderCode(campaignName), year);
  return { orderDetails, orderCode, orderCodeYear: year };
}

/** The first of the code's candidates no other campaign in the tenant holds this year. */
async function freeOrderCode(tx: Tx, tenantId: string, wanted: string, year: number, exceptCampaignId?: string): Promise<string> {
  const taken = new Set((await tx.campaign.findMany({
    /* tenant-scope: tenantId pinned — the codes this tenant's campaigns hold this year. */
    where: { tenantId, orderCodeYear: year, orderCode: { not: null }, ...(exceptCampaignId ? { id: { not: exceptCampaignId } } : {}) },
    select: { orderCode: true },
  })).map((c) => c.orderCode));
  for (const code of orderCodeCandidates(ORDER_CODE.test(wanted) ? wanted : suggestOrderCode(wanted))) if (!taken.has(code)) return code;
  throw new OrderDetailsError("Every order code is taken this year.", 409);
}

/* ── numbered ────────────────────────────────────────────────────────────── */

/**
 * The next order number on a campaign, in the caller's transaction. A
 * campaign made before order codes existed is given its code here, once.
 */
export async function nextOrderNumberIn(tx: Tx, tenantId: string, campaignId: string, now = new Date()): Promise<string> {
  const c = await tx.campaign.findFirstOrThrow({
    /* tenant-scope: the campaign of the order being made, in its own tenant. */
    where: { id: campaignId, tenantId }, select: { id: true, name: true, orderCode: true, orderCodeYear: true },
  });
  let code = c.orderCode;
  if (!code) {
    const year = now.getUTCFullYear();
    code = await freeOrderCode(tx, tenantId, suggestOrderCode(c.name), year, c.id);
    /* tenant-scope: the campaign loaded above, by id and tenant; conditional on it still having no code. */
    await tx.campaign.updateMany({ where: { id: c.id, tenantId, orderCode: null }, data: { orderCode: code, orderCodeYear: year } });
    code = (await tx.campaign.findFirstOrThrow({ where: { id: c.id, tenantId }, select: { orderCode: true } })).orderCode!;
  }
  const year = now.getUTCFullYear();
  const [row] = await tx.$queryRaw<Array<{ last: number }>>`
    INSERT INTO "OrderNumberCounter" ("tenantId", "code", "year", "last") VALUES (${tenantId}, ${code}, ${year}, 1)
    ON CONFLICT ("tenantId", "code", "year") DO UPDATE SET "last" = "OrderNumberCounter"."last" + 1
    RETURNING "last"`;
  return orderNumber(code, year, Number(row!.last));
}

/* ── read and changed (BTG, until the first offer) ───────────────────────── */

async function sentAnything(tx: Tx | typeof prisma, tenantId: string, campaignId: string): Promise<boolean> {
  const [orders, offers] = await Promise.all([
    /* tenant-scope: the campaign reached through the caller's scope, in its tenant. */
    tx.campaignOrder.count({ where: { tenantId, campaignId } }),
    tx.offer.count({ where: { tenantId, campaignId, state: { not: "DRAFT" } } }),
  ]);
  return orders + offers > 0;
}

/** GET /campaigns/{id}/order-details — the campaign's details, its code, and whether they can still change. */
export async function readCampaignOrderDetails(actor: Actor, campaignId: string) {
  assertAllowed(actor, "campaign", "read");
  const c = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true, tenantId: true, name: true, startDate: true, endDate: true, orderDetails: true, orderCode: true, orderCodeYear: true },
  });
  if (!c) throw new ForbiddenError("campaign", "read");
  const stored = storedOrderDetails(c.orderDetails);
  return {
    campaignId: c.id,
    orderCode: c.orderCode,
    orderCodeYear: c.orderCodeYear,
    /* A campaign made before the builder shows BTG's standard terms, marked so. */
    orderDetails: stored ?? defaultOrderDetails({ prompt: c.name, start: c.startDate, end: c.endDate, jobIds: [] }),
    standardTerms: !stored,
    locked: await sentAnything(prisma, c.tenantId, c.id),
  };
}

/** PUT /campaigns/{id}/order-details — BTG sets them (and the code) until the first offer goes out. */
export async function setCampaignOrderDetails(actor: Actor, campaignId: string, input: { orderDetails: unknown; orderCode?: string | null }) {
  assertTenantWide(actor, "campaign", "write");
  const details = requireOrderDetails(input.orderDetails);
  if (input.orderCode != null && !ORDER_CODE.test(input.orderCode)) throw new OrderDetailsError("The order code is three capital letters.");
  const id = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.findFirst({
      where: { ...whereFor(actor, "campaign", "write"), id: campaignId },
      select: { id: true, tenantId: true, orderDetails: true, orderCode: true, orderCodeYear: true },
    });
    if (!c) throw new ForbiddenError("campaign", "write");
    if (await sentAnything(tx, c.tenantId, c.id)) {
      throw new OrderDetailsError("Offers or orders have already gone out on this campaign, so its order details are fixed — each athlete's were fixed when sent.", 409);
    }
    let code = c.orderCode;
    let year = c.orderCodeYear;
    if (input.orderCode && input.orderCode !== c.orderCode) {
      year = new Date().getUTCFullYear();
      const free = await freeOrderCode(tx, c.tenantId, input.orderCode, year, c.id);
      if (free !== input.orderCode) throw new OrderDetailsError(`Another campaign already uses ${input.orderCode} this year — try ${free}.`, 409);
      code = free;
    }
    /* tenant-scope: the campaign loaded above through whereFor(campaign, write). */
    await tx.campaign.update({ where: { id: c.id }, data: { orderDetails: details as Prisma.InputJsonValue, orderCode: code, orderCodeYear: year } });
    await audit(tx, actor, "campaign.orderDetails", "Campaign", c.id, {
      before: { orderCode: c.orderCode, hadDetails: c.orderDetails !== null },
      after: { orderCode: code, jobs: details.jobs.map((j) => j.jobId), paidMedia: details.paidMedia.included, exclusivity: details.exclusivity.included, paymentDays: details.paymentTiming.daysAfterVerified },
    });
    return c.id;
  });
  /* Read after the commit, so the answer is what was saved. */
  return readCampaignOrderDetails(actor, id);
}

/* ── the builder's catalogue ─────────────────────────────────────────────── */

/** The field each medium asks for, for the builder to draw: name, kind, choices and limits. */
const MEDIA_FIELDS: Record<JobId, Array<{ field: string; kind: string; choices?: readonly string[]; min?: number; max?: number }>> = {
  "SX-01": [{ field: "frames", kind: "integer", min: 1, max: 10 }, { field: "platform", kind: "choice", choices: PLATFORMS }, { field: "link", kind: "choice", choices: ["NONE", "LINK_STICKER", "SWIPE_UP"] }, { field: "hoursLive", kind: "integer", min: 1, max: 72 }],
  "SX-02": [{ field: "format", kind: "choice", choices: ["SINGLE_IMAGE", "CAROUSEL", "VIDEO"] }, { field: "images", kind: "integer", min: 1, max: 10 }, { field: "platform", kind: "choice", choices: PLATFORMS }, { field: "caption", kind: "text?", max: 500 }, { field: "daysLive", kind: "integer", min: 1, max: 365 }],
  "SX-03": [{ field: "videos", kind: "integer", min: 1, max: 5 }, { field: "minSeconds", kind: "integer", min: 5, max: 180 }, { field: "maxSeconds", kind: "integer", min: 5, max: 180 }, { field: "orientation", kind: "choice", choices: ["VERTICAL", "HORIZONTAL", "SQUARE"] }, { field: "platform", kind: "choice", choices: PLATFORMS }],
  "SX-04": [{ field: "product", kind: "text", max: 200 }, { field: "contentFormat", kind: "choice", choices: ["VIDEO", "PHOTO", "BOTH"] }, { field: "productKept", kind: "boolean" }],
  "SX-05": [{ field: "event", kind: "text", max: 200 }, { field: "startsAt", kind: "datetime" }, { field: "place", kind: "text", max: 300 }, { field: "hoursOnSite", kind: "number", min: 0.5, max: 12 }, { field: "activities", kind: "text", max: 500 }, { field: "filmedBy", kind: "choice", choices: FILMED_BY }],
  "SX-06": [{ field: "shootDate", kind: "date" }, { field: "place", kind: "text", max: 300 }, { field: "hours", kind: "number", min: 1, max: 12 }, { field: "finishedPieces", kind: "integer", min: 1, max: 50 }, { field: "filmedBy", kind: "choice", choices: FILMED_BY }, { field: "rawFootageIncluded", kind: "boolean" }],
  "SX-07": [{ field: "months", kind: "integer", min: 1, max: 12 }, { field: "monthlyMix", kind: "list", choices: ["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06"] }],
};

/** GET /campaign-builder/catalogue — everything the builder needs to draw its steps. */
export function builderCatalogue(today = new Date()) {
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 30 * DAY_MS).toISOString().slice(0, 10);
  const names = new Map(NIL_JOBS.map((j) => [j.id, j.name]));
  return {
    jobs: JOB_IDS.map((jobId) => ({ jobId, name: names.get(jobId) ?? jobId, fields: MEDIA_FIELDS[jobId], defaults: defaultMedia(jobId, { start, end }) })),
    channels: ORDER_CHANNELS,
    platforms: PLATFORMS,
    paidMediaKinds: PAID_MEDIA_KINDS,
    defaults: { usagePeriodDays: DEFAULT_USAGE_DAYS, paymentDaysAfterVerified: DEFAULT_PAYMENT_DAYS, disclosures: ["#ad"], territory: "United States", sponsorApproval: false },
    limits: { usagePeriodDays: 730, exclusivityDays: 730, paymentDaysAfterVerified: 90 },
  };
}
