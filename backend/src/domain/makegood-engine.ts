/**
 * The make-good engine — 3S5-BE-01 and 3S5-BE-02 (documentation/SponsorX-Make-Goods.md).
 * The rules are makegood-rules.ts; this file gathers the facts, stores what
 * was made, approves, and answers the make-good centre (3S5-FE-01,
 * /admin/intelligence/make-goods).
 *
 * NIGHTLY, after the forecasts (the worker): every active campaign whose
 * forecast today says at risk, with its projection under the guarantee and
 * past the first fifth of its flight, gets a shortfall — opened, or
 * refreshed while it is still OPEN — with its substitutes. A campaign back on
 * track (or projected to reach its guarantee) closes its open shortfall. A
 * campaign that already had a make-good approved gets no second shortfall:
 * BTG takes it from there. A tenant whose fact check failed makes nothing
 * that night.
 *
 * SUBSTITUTES are the tenant's active inventory items, through the match
 * engine's own candidate gathering and filter (match-engine.ts), so a
 * substitute meets the same exclusivity and brand-safety rules as a match;
 * then the purchase paths' availability check (availability.ts) on the
 * make-good's dates, units and the sponsor's categories.
 *
 * APPROVAL. A BTG admin or campaign manager approves one substitute with a
 * note — or SponsorX does, automatically, when every safety check passes
 * (makegood-rules.ts autoDecision; user, 2026-10-15). Either way, in one
 * transaction: the checks run again, live, under the inventory lock the
 * carts and orders take; the units are committed (InventoryCommitment,
 * source MAKE_GOOD), so nobody else can buy them on those days; the decision
 * is recorded on the shortfall, which can never change after (a trigger);
 * and it is audited. The campaign's detail and its forecast list it.
 *
 * WHO. BTG admins and campaign managers read and approve (`makeGood`, RBAC
 * matrix §31). Sales, sponsors and athletes never see a make-good.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import { checkInventoryItem, unitsTaken, type AvailabilityReason } from "./availability";
import { BENCHMARK_METRIC } from "./benchmarks";
import { SENSITIVE_CATEGORIES } from "./brand-categories";
import type { AthleteFeatures } from "./feature-snapshots";
import { ALERT_MIN_ELAPSED, isoDay, type GuaranteeMetric } from "./forecast-rules";
import type { PackageRules } from "./inventory";
import {
  allPass, autoDecision, autoNote, BASIS_WEIGHT, chooseOptions, equivalency, makeGoodWindow, MAKEGOOD_MODEL_VERSION, NOTE_MAX, NOTE_MIN,
  optionReason, targetMisses, unitEstimate, unitsFor, type OptionDraft, type Target,
} from "./makegood-rules";
import { gatherCandidates } from "./match-engine";
import { filterCandidate, type BriefForMatch } from "./match-rules";
import { lockItems } from "./reservation";

type Tx = Prisma.TransactionClient;

/** Substitutes checked against the database each night, closest first; the rest are not shown. */
const CHECKED_PER_SHORTFALL = 20;
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const day = (d: Date) => new Date(`${isoDay(d)}T00:00:00Z`);

const KIND_WORDS: Record<string, string> = {
  SOCIAL_POST: "Social post", VIDEO: "Video", APPEARANCE: "Appearance", AUTOGRAPH: "Autograph session", CAMP: "Camp",
  SIGNAGE: "Signage", TICKETS: "Tickets", OTHER: "Item", PACKAGE: "Package",
};

export class MakeGoodNotFoundError extends Error {
  readonly status = 404;
  readonly code = "makegood_not_found";
  constructor(message = "No such shortfall in this tenant.") {
    super(message);
    this.name = "MakeGoodNotFoundError";
  }
}

export class MakeGoodDecidedError extends Error {
  readonly status = 409;
  readonly code = "makegood_decided";
  constructor() {
    super("This shortfall is already decided.");
    this.name = "MakeGoodDecidedError";
  }
}

export class MakeGoodCheckError extends Error {
  readonly status = 409;
  readonly code = "makegood_check";
  constructor(readonly problems: readonly string[]) {
    super(`This substitute can't be approved: ${problems.join("; ")}.`);
    this.name = "MakeGoodCheckError";
  }
}

export class MakeGoodNoteError extends Error {
  readonly status = 422;
  readonly code = "makegood_note";
  constructor() {
    super(`Say why this substitute, in ${NOTE_MIN} to ${NOTE_MAX.toLocaleString("en-US")} characters — the note goes on the audit record and the campaign.`);
    this.name = "MakeGoodNoteError";
  }
}

/** The availability check's refusals, sorted into the two checks they belong to. */
function liveProblems(reasons: readonly AvailabilityReason[]): { available: string[]; exclusivity: string[] } {
  const out = { available: [] as string[], exclusivity: [] as string[] };
  for (const r of reasons) {
    if (r.code === "CATEGORY_CONFLICT" || r.code === "NO_CATEGORY") out.exclusivity.push(r.message);
    else if (r.code !== "SUB_FLOOR") out.available.push(r.message);
  }
  return out;
}

/* ───────────────────────────── the nightly run (3S5-BE-01) ───────────────────────────── */

type ForecastRow = {
  campaignId: string; metric: GuaranteeMetric; guarantee: number; mid: number; elapsed: number; risk: string;
  budget: number; sponsorId: string; briefId: string | null;
};

/** The campaign's sold value: the ledger's booked sell net of cancellations, or its budget before anything is booked. */
async function soldValueCents(tenantId: string, campaignId: string, budget: number): Promise<number> {
  const [r] = await prisma.$queryRawUnsafe<Array<{ net: bigint | null }>>(
    /* tenant-scope: explicit — this campaign's daily summaries. */
    `SELECT sum("bookedSellCents" - "cancelledSellCents") AS net FROM "CampaignDaySummary" WHERE "tenantId" = $1 AND "campaignId" = $2`,
    tenantId, campaignId,
  );
  const net = Number(r?.net ?? 0);
  return net > 0 ? net : budget;
}

/** The sponsor's categories and target, and the brief-shaped facts the match filter takes, for the make-good's days. */
async function sponsorSide(tenantId: string, f: Pick<ForecastRow, "sponsorId" | "briefId">, window: { startsOn: Date; endsOn: Date }) {
  const [sponsor, brief] = await Promise.all([
    prisma.sponsor.findFirst({ where: { tenantId, id: f.sponsorId }, select: { categories: true } }),
    f.briefId ? prisma.campaignBrief.findFirst({
      where: { tenantId, id: f.briefId },
      select: { sports: true, stateCodes: true, categories: true, excludedCategories: true, channels: true, audienceTiers: true, audienceMinFollowers: true },
    }) : Promise.resolve(null),
  ]);
  const categories = [...new Set([...(sponsor?.categories ?? []), ...(brief?.categories ?? [])])];
  const target: Target = {
    stateCodes: (brief?.stateCodes ?? []).map((s) => s.toUpperCase()), sports: brief?.sports ?? [], channels: brief?.channels ?? [],
    audienceTiers: brief?.audienceTiers ?? [], audienceMinFollowers: brief?.audienceMinFollowers ?? null,
  };
  const forMatch: BriefForMatch = {
    sponsorId: f.sponsorId, sports: target.sports, stateCodes: target.stateCodes, categories, excludedCategories: brief?.excludedCategories ?? [],
    channels: target.channels, audienceTiers: target.audienceTiers, audienceMinFollowers: target.audienceMinFollowers,
    budget: 0, slots: 1, startDate: window.startsOn, endDate: window.endsOn,
  };
  return { categories, target, forMatch, sensitive: categories.some((c) => (SENSITIVE_CATEGORIES as readonly string[]).includes(c)) };
}

/** The shortfall's figures and its substitutes, as the rules make them. */
async function buildShortfall(tenantId: string, f: ForecastRow, today: Date) {
  const sold = f.guarantee;
  const shortfall = sold - f.mid;
  const unitValueCents = (await soldValueCents(tenantId, f.campaignId, f.budget)) / sold;
  const shortfallValueCents = Math.round(shortfall * unitValueCents);
  const window = makeGoodWindow(today);
  const side = await sponsorSide(tenantId, f, window);

  const candidates = (await gatherCandidates(tenantId, side.forMatch, [], today)).filter((c) => c.kind === "inventory");
  const ids = candidates.map((c) => c.refId);
  const [items, snapshots, benchmark] = await Promise.all([
    ids.length ? prisma.inventoryItem.findMany({
      /* tenant-scope: explicit — this tenant's candidate items. */
      where: { tenantId, id: { in: ids } },
      select: {
        id: true, title: true, kind: true, quantity: true, packageRules: true, priceCents: true, athleteId: true,
        athlete: { select: { displayName: true, sport: true, tier: true } }, property: { select: { name: true } },
      },
    }) : Promise.resolve([]),
    prisma.$queryRawUnsafe<Array<{ entityId: string; features: AthleteFeatures }>>(
      /* tenant-scope: explicit — this tenant's latest snapshot per athlete. */
      `SELECT DISTINCT ON ("entityId") "entityId", features FROM "FeatureSnapshot"
        WHERE "tenantId" = $1 AND "entityType" = 'ATHLETE' AND day <= $2::date ORDER BY "entityId", day DESC`,
      tenantId, isoDay(today),
    ),
    prisma.benchmark.findFirst({ where: { tenantId, dimension: "ALL", segment: "", metric: BENCHMARK_METRIC }, select: { median: true, sampleSize: true } }),
  ]);
  const itemBy = new Map(items.map((i) => [i.id, i]));
  const snapBy = new Map(snapshots.map((s) => [s.entityId, s.features]));

  const drafts: Array<OptionDraft & { basisWords: string; priceCents: number }> = [];
  for (const c of candidates) {
    const item = itemBy.get(c.refId);
    if (!item) continue;
    const snap = item.athleteId ? snapBy.get(item.athleteId) : undefined;
    const est = unitEstimate(f.metric, {
      athlete: item.athleteId ? {
        published: snap?.delivery.published ?? 0, verifiedViews: snap?.engagement.verifiedViews ?? 0,
        verifiedEngagements: snap?.engagement.verifiedEngagements ?? 0, profileAvgViews: snap?.audience.totalAvgViews ?? 0,
      } : undefined,
      priceCents: item.priceCents,
      benchmark: benchmark ? { cpmCents: benchmark.median, sampleSize: benchmark.sampleSize } : null,
    });
    if (!est) continue;
    const rules = (item.packageRules ?? {}) as PackageRules;
    const units = unitsFor(shortfall, est.perUnit, { quantity: item.quantity, min: rules.minQuantity, max: rules.maxQuantity });
    const estimatedDelivery = Math.round(units * est.perUnit);
    const costCents = units * item.priceCents;

    const problems: string[] = [];
    const filter = filterCandidate(c.facts, side.forMatch);
    const available = filter.eligible || filter.reason !== "unavailable";
    if (!available) problems.push("not bookable on the make-good's dates");
    let exclusivityClear = filter.eligible || filter.reason === "unavailable";
    if (!filter.eligible && filter.reason === "categoryConflict") problems.push("held exclusively in, or tied to, a category that conflicts with the sponsor");
    if (!filter.eligible && filter.reason === "brandSafety") problems.push("restricted from the sponsor's category");
    if (!side.categories.length) { exclusivityClear = false; problems.push("the sponsor's brand category is not set"); }
    const misses = targetMisses(side.target, {
      stateCode: c.score.stateCode,
      athlete: item.athlete ? { sport: item.athlete.sport, tier: item.athlete.tier, maxFollowers: c.score.audience?.maxFollowers ?? null } : null,
      channels: c.score.channels,
    });
    problems.push(...misses);
    drafts.push({
      inventoryItemId: item.id, inventoryName: item.title, propertyName: item.property?.name ?? item.athlete?.displayName ?? c.sub,
      format: `${KIND_WORDS[item.kind] ?? item.kind} ×${units}`, units, estimatedDelivery, basis: est.basis, verifiedEstimate: est.verified,
      equivalencyScore: equivalency(shortfall, estimatedDelivery), costCents, costImpactCents: costCents - shortfallValueCents,
      checks: { available, exclusivityClear, meetsTarget: misses.length === 0 }, problems, youth: c.facts.youth, reason: "",
      basisWords: est.words, priceCents: item.priceCents,
    });
  }

  /* The closest are checked against what is already committed, and the owners' restrictions, on the make-good's days. */
  const checked = drafts.sort((a, b) => b.equivalencyScore - a.equivalencyScore || a.inventoryItemId.localeCompare(b.inventoryItemId)).slice(0, CHECKED_PER_SHORTFALL);
  for (const d of checked) {
    const live = await checkInventoryItem(prisma, d.inventoryItemId, tenantId, {
      quantity: d.units, startsOn: window.startsOn, endsOn: window.endsOn, categories: side.categories, unitPriceCents: d.priceCents,
    }, today);
    const p = liveProblems(live.reasons);
    if (p.available.length) { d.checks.available = false; d.problems.push(...p.available); }
    if (p.exclusivity.length && side.categories.length) { d.checks.exclusivityClear = false; d.problems.push(...p.exclusivity); }
    d.problems = [...new Set(d.problems)];
    d.reason = optionReason(d, shortfall, f.metric, d.basisWords);
  }
  const shown = chooseOptions(checked);
  const confidence = shown.length ? Math.round((shown.reduce((t, o) => t + BASIS_WEIGHT[o.basis], 0) / shown.length) * 100) / 100 : 0;
  return {
    figures: { metric: f.metric, sold, projected: f.mid, shortfall, unitValueCents, shortfallValueCents, elapsed: f.elapsed, confidence },
    options: shown, categories: side.categories, sensitive: side.sensitive,
  };
}

export type MakeGoodReport = { tenants: number; shortfalls: number; opened: number; closed: number; autoApproved: number; held: number; skipped: string[] };

/**
 * The nightly run, for every tenant or one, after the forecasts. Opens or
 * refreshes each at-risk campaign's shortfall with its substitutes, closes the
 * shortfalls of campaigns back on track, and approves automatically where
 * every safety check passes.
 */
export async function runMakeGoods(db: PrismaClient, now: Date, opts: { tenantId?: string; skipTenants?: string[] } = {}): Promise<MakeGoodReport> {
  const skip = new Set(opts.skipTenants ?? []);
  const tenants = opts.tenantId ? [opts.tenantId] : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const today = day(now);
  const report: MakeGoodReport = { tenants: 0, shortfalls: 0, opened: 0, closed: 0, autoApproved: 0, held: 0, skipped: tenants.filter((t) => skip.has(t)) };
  for (const tenantId of tenants.filter((t) => !skip.has(t))) {
    report.tenants += 1;
    const forecasts = await db.$queryRawUnsafe<ForecastRow[]>(
      /* tenant-scope: explicit — this tenant's active campaigns' forecasts made today. */
      `SELECT f."campaignId", f.metric, f.guarantee, f.mid, f.elapsed, f.risk, c.budget, c."sponsorId", c."briefId"
         FROM "CampaignForecast" f JOIN "Campaign" c ON c.id = f."campaignId" AND c."tenantId" = f."tenantId"
        WHERE f."tenantId" = $1 AND f.day = $2::date AND c.state = 'ACTIVE' ORDER BY f."campaignId"`,
      tenantId, isoDay(today),
    );
    const existing = await db.makeGoodShortfall.findMany({
      where: { tenantId, status: { in: ["OPEN", "APPROVED"] } },
      select: { id: true, campaignId: true, status: true },
    });
    const openBy = new Map(existing.filter((s) => s.status === "OPEN").map((s) => [s.campaignId, s.id]));
    const approved = new Set(existing.filter((s) => s.status === "APPROVED").map((s) => s.campaignId));

    for (const f of forecasts) {
      const open = openBy.get(f.campaignId);
      const short = f.mid < f.guarantee && f.elapsed >= ALERT_MIN_ELAPSED && (f.risk === "at_risk" || (!!open && f.risk === "watch"));
      if (!short) {
        if (open) {
          await db.makeGoodShortfall.updateMany({ where: { tenantId, id: open, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
          report.closed += 1;
        }
        continue;
      }
      if (approved.has(f.campaignId)) continue;
      const built = await buildShortfall(tenantId, f, today);
      const outcome = await db.$transaction(async (tx) => {
        const data = { ...built.figures, modelVersion: MAKEGOOD_MODEL_VERSION, computedAt: now };
        let id = open;
        if (id) {
          const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            /* tenant-scope: explicit — this tenant's open shortfall, locked against a concurrent approval. */
            `SELECT id FROM "MakeGoodShortfall" WHERE id = $1 AND "tenantId" = $2 AND status = 'OPEN' FOR UPDATE`, id, tenantId,
          );
          if (!locked.length) return "decided" as const;
          await tx.makeGoodShortfall.update({ where: { id, tenantId }, data, select: { id: true } });
          await tx.makeGoodOption.deleteMany({ where: { tenantId, shortfallId: id } });
        } else {
          id = (await tx.makeGoodShortfall.create({ data: { tenantId, campaignId: f.campaignId, ...data }, select: { id: true } })).id;
        }
        if (built.options.length) {
          await tx.makeGoodOption.createMany({
            data: built.options.map((o, i) => ({
              tenantId, shortfallId: id!, inventoryItemId: o.inventoryItemId, rank: i + 1, inventoryName: o.inventoryName, propertyName: o.propertyName,
              format: o.format, units: o.units, estimatedDelivery: o.estimatedDelivery, basis: o.basis, verifiedEstimate: o.verifiedEstimate,
              equivalencyScore: o.equivalencyScore, costCents: o.costCents, costImpactCents: o.costImpactCents, available: o.checks.available,
              exclusivityClear: o.checks.exclusivityClear, meetsTarget: o.checks.meetsTarget, youth: o.youth, problems: o.problems, reason: o.reason,
            })),
          });
        }

        /* 3S5-BE-02 — automatic when every safety check passes; otherwise held, with every reason. */
        const decision = autoDecision(built.options, { shortfall: built.figures.shortfall, elapsed: f.elapsed, sensitive: built.sensitive });
        let held = decision.approve ? [] : decision.held;
        if (decision.approve) {
          const option = await tx.makeGoodOption.findFirstOrThrow({
            where: { tenantId, shortfallId: id, inventoryItemId: decision.option.inventoryItemId },
            select: OPTION_FOR_APPROVAL,
          });
          try {
            await approveInTx(tx, SYSTEM(tenantId), { id, tenantId, campaignId: f.campaignId }, option, built.categories,
              autoNote(decision.option, built.figures.shortfall, f.metric), now, true);
            return "approved" as const;
          } catch (error) {
            if (!(error instanceof MakeGoodCheckError)) throw error;
            held = [`The best substitute failed its live check: ${error.problems.join("; ")}.`];
          }
        }
        await tx.makeGoodShortfall.update({ where: { id, tenantId }, data: { heldReasons: held }, select: { id: true } });
        return open ? ("held" as const) : ("opened" as const);
      });
      if (outcome === "decided") continue;
      report.shortfalls += 1;
      if (!open) report.opened += 1;
      if (outcome === "approved") report.autoApproved += 1;
      else report.held += 1;
    }

    /* A cancelled campaign's open shortfall closes with it. */
    const cancelled = await db.makeGoodShortfall.findMany({
      where: { tenantId, status: "OPEN", campaignId: { in: (await db.campaign.findMany({ where: { tenantId, state: "CANCELLED" }, select: { id: true } })).map((c) => c.id) } },
      select: { id: true },
    });
    if (cancelled.length) {
      await db.makeGoodShortfall.updateMany({ where: { tenantId, id: { in: cancelled.map((c) => c.id) }, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
      report.closed += cancelled.length;
    }
  }
  return report;
}

/* ───────────────────────────── approval (3S5-BE-02) ───────────────────────────── */

const OPTION_FOR_APPROVAL = {
  id: true, inventoryItemId: true, units: true, costCents: true, available: true, exclusivityClear: true, meetsTarget: true, problems: true,
} as const;
type OptionForApproval = { id: string; inventoryItemId: string; units: number; costCents: number; available: boolean; exclusivityClear: boolean; meetsTarget: boolean; problems: string[] };

/**
 * Approve one substitute, inside the caller's transaction: run the checks
 * again live under the inventory lock, commit the units for the make-good's
 * days, record the decision, audit it. Throws MakeGoodCheckError (and writes
 * nothing of its own) when the substitute fails now.
 */
async function approveInTx(
  tx: Tx, actor: AuditActor, s: { id: string; tenantId: string; campaignId: string }, o: OptionForApproval, categories: readonly string[],
  note: string, now: Date, automatic: boolean,
) {
  if (!allPass(o)) throw new MakeGoodCheckError(o.problems.length ? o.problems : ["it fails a check"]);
  const window = makeGoodWindow(now);
  const takes = await unitsTaken(tx, o.inventoryItemId, s.tenantId, o.units);
  await lockItems(tx, takes.map((t) => t.inventoryItemId));
  const item = await tx.inventoryItem.findFirst({ where: { tenantId: s.tenantId, id: o.inventoryItemId }, select: { priceCents: true } });
  const live = await checkInventoryItem(tx, o.inventoryItemId, s.tenantId, {
    quantity: o.units, startsOn: window.startsOn, endsOn: window.endsOn, categories, unitPriceCents: item?.priceCents ?? 0,
  }, now);
  if (!live.ok) {
    const p = liveProblems(live.reasons);
    throw new MakeGoodCheckError([...p.available, ...p.exclusivity]);
  }
  await tx.inventoryCommitment.createMany({
    data: takes.map((t) => ({ ...t, source: "MAKE_GOOD", sourceId: s.id, startsOn: window.startsOn, endsOn: window.endsOn, contracted: true })),
  });
  await tx.makeGoodShortfall.update({
    where: { id: s.id, tenantId: s.tenantId },
    data: {
      status: "APPROVED", decidedOptionId: o.id, decidedBy: actor.userId, automatic, decidedAt: now, note,
      runsFrom: window.startsOn, runsUntil: window.endsOn, ...(automatic ? { heldReasons: [] } : {}),
    },
    select: { id: true },
  });
  await audit(tx, actor, automatic ? AUDIT_ACTIONS.makeGood.autoApprove : AUDIT_ACTIONS.makeGood.approve, "MakeGoodShortfall", s.id, {
    after: {
      campaignId: s.campaignId, optionId: o.id, inventoryItemId: o.inventoryItemId, units: o.units, costCents: o.costCents,
      runsFrom: isoDay(window.startsOn), runsUntil: isoDay(window.endsOn), note,
    },
  });
}

/** POST /intelligence/make-goods/:shortfallId/approve — a BTG admin or campaign manager approves one substitute, with a note. */
export async function approveMakeGood(actor: Actor, shortfallId: string, input: { optionId: string; note: string }, now = new Date()) {
  assertTenantWide(actor, "makeGood", "approve");
  const note = input.note.trim();
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) throw new MakeGoodNoteError();
  await prisma.$transaction(async (tx) => {
    const [s] = await tx.$queryRawUnsafe<Array<{ id: string; tenantId: string; campaignId: string; status: string }>>(
      /* tenant-scope: explicit — the caller's tenant's shortfall, locked against the nightly refresh. */
      `SELECT id, "tenantId", "campaignId", status FROM "MakeGoodShortfall" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`, shortfallId, actor.tenantId,
    );
    if (!s) throw new MakeGoodNotFoundError();
    if (s.status !== "OPEN") throw new MakeGoodDecidedError();
    const o = await tx.makeGoodOption.findFirst({ where: { tenantId: actor.tenantId, shortfallId: s.id, id: input.optionId }, select: OPTION_FOR_APPROVAL });
    if (!o) throw new MakeGoodNotFoundError("No such substitute on this shortfall.");
    const campaign = await tx.campaign.findFirst({ where: { tenantId: actor.tenantId, id: s.campaignId }, select: { sponsorId: true, briefId: true } });
    const side = await sponsorSide(actor.tenantId, { sponsorId: campaign?.sponsorId ?? "", briefId: campaign?.briefId ?? null }, makeGoodWindow(now));
    await approveInTx(tx, actor, s, o, side.categories, note, now, false);
  });
  return (await views(actor.tenantId, [shortfallId]))[0]!;
}

/* ───────────────────────────── reads ───────────────────────────── */

const ROLE_WORDS: Record<string, string> = { SUPER_ADMIN: "Super admin", BTG_ADMIN: "BTG admin", CAMPAIGN_MGR: "Campaign manager" };

/** The shortfalls, as the make-good centre's contract shapes them, in the order asked. */
async function views(tenantId: string, ids: readonly string[]) {
  if (!ids.length) return [];
  const rows = await prisma.makeGoodShortfall.findMany({
    where: { tenantId, id: { in: [...ids] } },
    select: {
      id: true, status: true, campaignId: true, metric: true, sold: true, projected: true, shortfall: true, shortfallValueCents: true,
      modelVersion: true, confidence: true, computedAt: true, heldReasons: true, decidedOptionId: true, decidedBy: true, automatic: true,
      decidedAt: true, note: true, runsFrom: true, runsUntil: true,
      options: {
        orderBy: { rank: "asc" },
        select: {
          id: true, inventoryName: true, propertyName: true, format: true, equivalencyScore: true, estimatedDelivery: true, costImpactCents: true,
          available: true, exclusivityClear: true, meetsTarget: true, reason: true,
        },
      },
    },
  });
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId, id: { in: [...new Set(rows.map((r) => r.campaignId))] } },
    select: { id: true, name: true, endDate: true, sponsor: { select: { name: true } } },
  });
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: rows.map((r) => r.decidedBy).filter((u): u is string => !!u) } },
    select: { id: true, email: true, roles: true },
  });
  const campaignBy = new Map(campaigns.map((c) => [c.id, c]));
  const userBy = new Map(users.map((u) => [u.id, u]));
  const by = (r: (typeof rows)[number]) => {
    if (r.automatic) return "SponsorX (automatic)";
    const u = r.decidedBy ? userBy.get(r.decidedBy) : undefined;
    if (!u) return "a former user";
    const role = u.roles.map((x) => ROLE_WORDS[x]).find(Boolean);
    return role ? `${u.email} (${role})` : u.email;
  };
  const out = new Map(rows.map((r) => {
    const c = campaignBy.get(r.campaignId);
    return [r.id, {
      id: r.id,
      status: r.status.toLowerCase() as "open" | "approved" | "closed",
      campaign: { id: r.campaignId, name: c?.name ?? "" },
      sponsorName: c?.sponsor.name ?? "",
      metric: r.metric as GuaranteeMetric,
      sold: r.sold,
      projected: r.projected,
      shortfall: r.shortfall,
      shortfallValueCents: r.shortfallValueCents,
      endsAt: c?.endDate.toISOString() ?? "",
      stamp: { modelVersion: r.modelVersion, confidence: r.confidence, computedAt: r.computedAt.toISOString() },
      options: r.options.map((o) => ({
        id: o.id, inventoryName: o.inventoryName, propertyName: o.propertyName, format: o.format, equivalencyScore: o.equivalencyScore,
        estimatedDelivery: o.estimatedDelivery, costImpactCents: o.costImpactCents,
        checks: { available: o.available, exclusivityClear: o.exclusivityClear, meetsTarget: o.meetsTarget }, reason: o.reason,
      })),
      decision: r.status === "APPROVED" && r.decidedOptionId && r.decidedAt ? {
        optionId: r.decidedOptionId, by: by(r), at: r.decidedAt.toISOString(), note: r.note ?? "",
        automatic: r.automatic, runsFrom: r.runsFrom ? isoDay(r.runsFrom) : null, runsUntil: r.runsUntil ? isoDay(r.runsUntil) : null,
      } : null,
      /* Why SponsorX did not approve it on its own (3S5-BE-02). */
      automatic: { approved: r.automatic, heldBecause: r.heldReasons },
    }] as const;
  }));
  return ids.map((id) => out.get(id)).filter((v): v is NonNullable<typeof v> => !!v);
}

export type MakeGoodView = Awaited<ReturnType<typeof views>>[number];

/** The calendar month `now` falls in (UTC): the period the approved count covers. */
function monthOf(now: Date) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from, to, until: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

/** GET /intelligence/make-goods?status=open|approved&campaign&page&size — open first by value at risk, largest first; approved newest first. */
export async function makeGoodList(actor: Actor, q: { status: "open" | "approved"; campaignId?: string; page: PageRequest }, now = new Date()) {
  assertTenantWide(actor, "makeGood", "read");
  const all = await prisma.makeGoodShortfall.findMany({
    where: { tenantId: actor.tenantId, status: { in: ["OPEN", "APPROVED"] }, ...(q.campaignId ? { campaignId: q.campaignId } : {}) },
    select: { id: true, status: true, shortfallValueCents: true, decidedAt: true },
  });
  const period = monthOf(now);
  const open = all.filter((s) => s.status === "OPEN");
  const decided = all.filter((s) => s.status === "APPROVED");
  const counts = {
    open: open.length,
    approved: decided.length,
    openValueCents: open.reduce((t, s) => t + s.shortfallValueCents, 0),
    approvedThisPeriod: decided.filter((s) => s.decidedAt && s.decidedAt >= period.from && s.decidedAt < period.until).length,
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
  };
  const shown = q.status === "approved"
    ? decided.sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0) || a.id.localeCompare(b.id))
    : open.sort((a, b) => b.shortfallValueCents - a.shortfallValueCents || a.id.localeCompare(b.id));
  const page: PageInfo = { page: q.page.page, size: q.page.size, total: shown.length, pages: Math.max(1, Math.ceil(shown.length / q.page.size)) };
  return { counts, shortfalls: await views(actor.tenantId, shown.slice(q.page.skip, q.page.skip + q.page.take).map((s) => s.id)), page };
}

/** A campaign's open and approved make-goods, newest first — for its detail and its forecast (BTG admins and campaign managers only). */
export async function campaignMakeGoods(tenantId: string, campaignId: string) {
  const rows = await prisma.makeGoodShortfall.findMany({
    where: { tenantId, campaignId, status: { in: ["OPEN", "APPROVED"] } },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  });
  return views(tenantId, rows.map((r) => r.id));
}
