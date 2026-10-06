/**
 * Ad sales that make themselves — P9-BE-18 (programme owner, 2026-10-03,
 * item 23). The rules are ad-sale-rules.ts; the sale is edition.ts `sellIn`.
 *
 * WHEN. A campaign is created whose package promises edition positions (its
 * `includes`, P9-BE-01): from BTG's approval, a brief approved
 * automatically, or the held-brief re-check — right after the transaction
 * that created it commits, as `startAutoStaffing` is (and before it, so an
 * ad sale is made while the campaign is still a DRAFT). Every ten minutes the
 * sweep retries the holds that can clear by themselves.
 *
 * WHICH EDITION. A brief names none, so the system picks only when there is
 * exactly one to pick: an edition SELLING with its close date ahead, at the
 * school the sponsor came through (the student code on the brief, else the
 * sponsor's school) or the regional edition — or, for a sponsor with no
 * school, any in the tenant. None: held, "no edition is selling yet" (retried).
 * More than one: held for SALES to choose.
 *
 * WHAT IT ASKS. Every check ad-sale-rules.ts lists, and then the sale asks
 * them all again, under the edition's and the campaign's locks, as a sale by
 * hand would. Any failure HOLDS the sale for SALES with the reasons in words
 * (`AdSaleHold`, one per campaign, audited), and SALES and BTG's admins are
 * emailed once per hold. Payment and invoicing are unchanged: the sale is
 * what BTG's sale by hand always was.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import {
  AdSaleRefusedError,
  categoryHolds,
  clashHold,
  RETRYABLE_HOLDS,
  retryable,
  SALE_HOLD_KEYS,
  saleCategories,
  type SaleHold,
} from "./ad-sale-rules";
import { heldAgainst, kindWords, positionsFor, sellIn } from "./edition";
import { logError } from "../lib/redact";

type Tx = Prisma.TransactionClient;

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const app = () => env.APP_URL.replace(/\/+$/, "");
const SOLD_REASON = "Sold automatically: every check for a student audience passed.";

export type AutoSaleOutcome =
  | { outcome: "SOLD"; editionId: string; slots: string[] }
  | { outcome: "HELD"; reasons: string[]; newHold: boolean }
  | { outcome: "NONE" };

let savepoints = 0;

/**
 * Sell the campaign's positions as the system, or hold the sale — in the
 * caller's transaction. Idempotent: a campaign already holding slots, or
 * whose hold was settled, is left alone.
 */
export async function autoSellIn(tx: Tx, tenantId: string, campaignId: string, now = new Date(), via: "create" | "sweep" = "create"): Promise<AutoSaleOutcome> {
  const c = await tx.campaign.findFirst({
    /* tenant-scope: the system's own campaign, by id and its tenant. */
    where: { tenantId, id: campaignId },
    select: {
      id: true, name: true, state: true, sponsorId: true,
      sponsor: { select: { name: true, categories: true, schoolPropertyId: true } },
      brief: {
        select: {
          categories: true,
          studentCode: { select: { student: { select: { propertyId: true } } } },
          package: { select: { name: true, includes: true, exclusivity: true } },
        },
      },
      adSaleHold: { select: { id: true, editionId: true, heldKeys: true, heldReasons: true, heldAt: true, resolvedAt: true } },
    },
  });
  if (!c) return { outcome: "NONE" };
  const wanted = positionsFor((c.brief?.package?.includes as Array<{ kind: string; code: string; quantity?: number }> | null) ?? null);
  if (wanted.length === 0) return { outcome: "NONE" };
  if (c.adSaleHold?.resolvedAt) return { outcome: "NONE" };
  if ((await tx.adSlot.count({ where: { tenantId, campaignId } })) > 0) {
    await settle(tx, tenantId, campaignId, now, "SOLD");
    return { outcome: "NONE" };
  }
  if (c.state === "CANCELLED") {
    await settle(tx, tenantId, campaignId, now, "CAMPAIGN_CANCELLED");
    return { outcome: "NONE" };
  }

  const categories = saleCategories(c.sponsor.categories, c.brief?.categories ?? []);
  const holds: SaleHold[] = categoryHolds(categories, { automatic: true, sponsorCategories: c.sponsor.categories });
  if (c.state !== "DRAFT") {
    holds.push({ key: "CAMPAIGN_STATE", text: `The campaign is ${c.state.toLowerCase()}, so it buys no more placements` });
  }

  const school = c.brief?.studentCode?.student.propertyId ?? c.sponsor.schoolPropertyId ?? null;
  const editions = await tx.edition.findMany({
    where: {
      tenantId, state: "SELLING", closeDate: { gt: now },
      ...(school ? { publication: { is: { OR: [{ propertyId: school }, { propertyId: null }] } } } : {}),
    },
    select: { id: true, label: true, publication: { select: { propertyId: true } } },
    orderBy: [{ closeDate: "asc" }, { id: "asc" }],
    take: 10,
  });
  const edition = editions.length === 1 ? editions[0]! : null;
  if (editions.length === 0) {
    holds.push({ key: "NO_EDITION", text: school ? "No edition at the sponsor's school is selling yet" : "No edition is selling yet" });
  } else if (editions.length > 1) {
    holds.push({ key: "EDITION_CHOICE", text: `${editions.length} editions are selling (${editions.map((e) => e.label).join(", ")}) — SALES chooses which` });
  }

  if (edition) {
    const held = await heldAgainst(tx, tenantId, { id: edition.id, propertyId: edition.publication.propertyId }, {
      campaignId, sponsorId: c.sponsorId, exclusive: wanted.includes("PRESENTING") || Boolean(c.brief?.package?.exclusivity),
    });
    const clash = clashHold(categories, held, edition.label);
    if (clash) holds.push(clash);
    const free = await tx.adSlot.groupBy({
      /* tenant-scope: the chosen edition's open slots, in the campaign's tenant. */
      where: { tenantId, editionId: edition.id, campaignId: null }, by: ["kind"], _count: { _all: true },
    });
    const need = new Map<string, number>();
    for (const k of wanted) need.set(k, (need.get(k) ?? 0) + 1);
    const short = [...need].filter(([k, n]) => (free.find((f) => f.kind === k)?._count._all ?? 0) < n).map(([k]) => k);
    if (short.length) {
      holds.push({ key: "NO_SLOT", text: `No ${short.map(kindWords).join(" or ")} is left in ${edition.label} yet` });
    }
  }

  if (holds.length === 0 && edition) {
    /* The sale asks everything again under its locks. Behind a savepoint: a
       refusal from Postgres (a slot sold a moment ago) must not abort the
       transaction the hold is written in. */
    const point = `auto_sale_${++savepoints}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${point}`);
    try {
      const sold = await sellIn(tx, SYSTEM(tenantId), tenantId, edition.id, campaignId, { automatic: { reason: SOLD_REASON }, now });
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);
      return { outcome: "SOLD", editionId: edition.id, slots: sold.slots.map((s) => s.slotCode) };
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);
      /* A sale by hand that won the race: the campaign is sold — nothing to hold. */
      if ((await tx.adSlot.count({ where: { tenantId, campaignId } })) > 0) {
        await settle(tx, tenantId, campaignId, now, "SOLD");
        return { outcome: "NONE" };
      }
      const message = String((error as Error).message ?? "");
      if (error instanceof AdSaleRefusedError) holds.push(...error.reasons);
      else if (/^A campaign that is /.test(message)) holds.push({ key: "CAMPAIGN_STATE", text: message.replace(/\.$/, "") });
      else if ((error as { status?: number }).status === 409 || /adslot_/.test(message)) {
        holds.push({ key: "NO_SLOT", text: message.replace(/\.$/, "") });
      } else throw error;
    }
  }
  return hold(tx, tenantId, c, holds, edition?.id ?? null, now, via);
}

async function settle(tx: Tx, tenantId: string, campaignId: string, now: Date, resolution: "SOLD" | "CAMPAIGN_CANCELLED") {
  await tx.adSaleHold.updateMany({
    /* tenant-scope: the campaign's own hold, by its unique campaign id and tenant. */
    where: { tenantId, campaignId, resolvedAt: null },
    data: { resolvedAt: now, resolution },
  });
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function hold(
  tx: Tx,
  tenantId: string,
  c: { id: string; name: string; sponsor: { name: string }; adSaleHold: { editionId: string | null; heldKeys: string[]; heldReasons: string[]; heldAt: Date } | null },
  holds: SaleHold[],
  editionId: string | null,
  now: Date,
  via: string,
): Promise<AutoSaleOutcome> {
  const keys = holds.map((h) => h.key);
  const reasons = holds.map((h) => h.text);
  const before = c.adSaleHold;
  const newHold = before === null;
  if (before && sameList(before.heldKeys, keys) && sameList(before.heldReasons, reasons) && before.editionId === editionId) {
    await tx.adSaleHold.updateMany({ where: { tenantId, campaignId: c.id }, data: { checkedAt: now } });
    return { outcome: "HELD", reasons, newHold: false };
  }
  const heldAt = before?.heldAt ?? now;
  await tx.adSaleHold.upsert({
    where: { campaignId: c.id },
    create: { tenantId, campaignId: c.id, editionId, heldKeys: keys, heldReasons: reasons, heldAt, checkedAt: now },
    update: { editionId, heldKeys: keys, heldReasons: reasons, checkedAt: now },
    select: { id: true },
  });
  await audit(tx, SYSTEM(tenantId), "adSale.hold", "Campaign", c.id, {
    before: before ? { heldKeys: before.heldKeys, heldReasons: before.heldReasons, editionId: before.editionId } : null,
    after: { heldKeys: keys, heldReasons: reasons, editionId, via },
  });

  if (newHold) {
    /* SALES and BTG's admins, once per hold: the key is the hold's start. */
    const staff = await tx.user.findMany({
      /* tenant-scope: the campaign's own tenant — its sales team and BTG admins. */
      where: { tenantId, roles: { hasSome: ["SALES", "BTG_ADMIN"] }, disabledAt: null },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    for (const u of staff) {
      await send(tx, tenantId, {
        template: "adSale.heldForSales",
        to: u.email,
        idempotencyKey: `adSale.heldForSales:${c.id}:${heldAt.toISOString()}:${u.id}`,
        data: {
          sponsorName: c.sponsor.name,
          campaignName: c.name,
          reasons: reasons.map((r) => `• ${r}`).join("\n"),
          reviewUrl: `${app()}/admin/next/editions${editionId ? `?edition=${encodeURIComponent(editionId)}` : ""}#hold-${c.id}`,
        },
      });
    }
  }
  return { outcome: "HELD", reasons, newHold };
}

/**
 * Right after a campaign is created and its transaction has committed. Never
 * throws: a failure is logged, and the campaign can still be sold by hand.
 */
export async function startAutoSale(tenantId: string, campaignId: string): Promise<AutoSaleOutcome | null> {
  try {
    return await prisma.$transaction((tx) => autoSellIn(tx, tenantId, campaignId, new Date(), "create"));
  } catch (error) {
    logError(`[ad-sale] the automatic sale of ${campaignId} failed; SALES can sell it by hand:`, error);
    return null;
  }
}

/**
 * The sweep (worker, every ten minutes): every open hold whose every reason
 * can clear by itself — no edition selling yet, no slot free yet — tried
 * again, each in its own transaction. Platform-wide, or only
 * `opts.tenantIds` (tests). Idempotent: a sold hold is settled and never
 * picked up again; one still short changes nothing and emails no one.
 */
export async function sweepHeldSales(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { checked: 0, sold: 0, held: 0, failed: 0 };
  const due = await prisma.adSaleHold.findMany({
    /* tenant-scope: the system sweep — every tenant's (or opts.tenantIds') open holds; each is retried in its own tenant. */
    /* Only holds made entirely of reasons that clear by themselves — so a
       backlog of holds waiting for a person never crowds them out. */
    where: {
      ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}),
      resolvedAt: null,
      NOT: { heldKeys: { hasSome: SALE_HOLD_KEYS.filter((k) => !RETRYABLE_HOLDS.has(k)) } },
    },
    select: { tenantId: true, campaignId: true, heldKeys: true },
    orderBy: [{ heldAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  for (const h of due) {
    if (!retryable(h.heldKeys)) continue;
    out.checked++;
    try {
      const r = await prisma.$transaction((tx) => autoSellIn(tx, h.tenantId, h.campaignId, now, "sweep"));
      if (r.outcome === "SOLD") out.sold++;
      else if (r.outcome === "HELD") out.held++;
    } catch (error) {
      out.failed++;
      logError(`[ad-sale] retrying the held sale of ${h.campaignId} failed, will retry:`, error);
    }
  }
  return out;
}

/**
 * GET /ad-sale-holds — SALES and BTG, tenant-wide: the sales held for a
 * person, open first, with the reasons in words; `?editionId=` narrows to
 * the holds tried against one edition.
 */
export async function listSaleHolds(actor: Actor, opts: { editionId?: string; all?: boolean } = {}) {
  assertTenantWide(actor, "adSlot", "write");
  const rows = await prisma.adSaleHold.findMany({
    where: {
      ...whereFor(actor, "adSlot", "write"),
      ...(opts.all ? {} : { resolvedAt: null }),
      ...(opts.editionId ? { editionId: opts.editionId } : {}),
    },
    select: {
      id: true, campaignId: true, editionId: true, heldKeys: true, heldReasons: true, heldAt: true, checkedAt: true,
      resolution: true, resolvedAt: true,
      campaign: { select: { name: true, state: true, sponsor: { select: { name: true } }, brief: { select: { package: { select: { code: true, name: true } } } } } },
      edition: { select: { label: true } },
    },
    orderBy: [{ resolvedAt: { sort: "desc", nulls: "first" } }, { heldAt: "asc" }],
    take: 200,
  });
  return rows.map((h) => ({
    id: h.id,
    campaignId: h.campaignId,
    campaign: h.campaign.name,
    campaignState: h.campaign.state,
    sponsor: h.campaign.sponsor.name,
    package: h.campaign.brief?.package ? { code: h.campaign.brief.package.code, name: h.campaign.brief.package.name } : null,
    edition: h.editionId ? { id: h.editionId, label: h.edition?.label ?? "Edition" } : null,
    reasons: h.heldKeys.map((key, i) => ({ key, text: h.heldReasons[i] ?? key })),
    retriesItself: retryable(h.heldKeys),
    heldAt: h.heldAt.toISOString(),
    checkedAt: h.checkedAt.toISOString(),
    resolution: h.resolution,
    resolvedAt: h.resolvedAt?.toISOString() ?? null,
  }));
}
