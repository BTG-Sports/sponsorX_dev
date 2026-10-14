/**
 * The match engine — 3S3-BE-02 and 3S3-BE-03 (documentation/SponsorX-Match-Engine.md).
 *
 * For a sponsor brief it ranks three kinds of candidate — athletes,
 * properties (venues, teams, schools) and inventory items — best first, with
 * a 0–100 score, its factors and the reasons in words a salesperson can
 * repeat. The rules are match-rules.ts; this file gathers the facts.
 *
 * FILTER, THEN SCORE. Unavailable, category-conflicted and brand-unsafe
 * candidates are removed before anything is scored, and only counted: the
 * explorer never shows one (acceptance #3).
 *
 * RUNS. A ranking is stored as made — the run (model version, when, what was
 * filtered out) and its scores — and reused for RUN_REUSE_MS so every page
 * of it agrees; after that, or once the brief is edited, the next read ranks
 * again. All three kinds are ranked together, so the tabs' counts agree.
 *
 * WHO. BTG admins, campaign managers, network managers and Sales read
 * (`briefMatch`, RBAC matrix §29); BTG admins, campaign managers and network
 * managers save a brief's shortlist. Sponsors and athletes never see scores.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { Prisma } from "../generated/prisma/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import type { AthleteFeatures } from "./feature-snapshots";
import { lineFloor } from "./margin-floor";
import { packageLines } from "./match-score";
import { MATCH_CHANNELS, SHORTLIST_MAX } from "./match-vocabulary";
import {
  byScore, EXCLUDED_LOOKBACK_DAYS, filterCandidate, MATCH_KINDS, MATCH_MODEL_VERSION, scoreCandidate,
  type Availability, type BriefForMatch, type EligibilityFacts, type MatchKind, type ScoreFacts,
} from "./match-rules";

/** A ranking is reused this long, so its pages agree; then the next read ranks again. */
export const RUN_REUSE_MS = 10 * 60 * 1000;
/** The athletes in the network: applicants still in review are not candidates. */
const NETWORK_STATES = ["APPROVED", "ACTIVE", "FEATURED", "SUSPENDED"] as const;
const BOOKABLE_STATES = ["ACTIVE", "FEATURED"];
const WORKED_ORDER_STATES = ["ACCEPTED", "ACTIVE", "COMPLETED"] as const;
const SOLD_STATES = ["APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED"] as const;
const SOCIAL = new Set<string>(MATCH_CHANNELS.filter((c) => c !== "IN_PERSON"));
/** An item's kind → how it is delivered. */
const IN_PERSON_KINDS = new Set(["APPEARANCE", "AUTOGRAPH", "CAMP", "SIGNAGE", "TICKETS"]);
const VIDEO_CHANNELS = new Set(["YOUTUBE", "TIKTOK", "INSTAGRAM"]);

export class BriefNotFoundError extends Error {
  readonly status = 404;
  readonly code = "brief_not_found";
  constructor() {
    super("No such brief in this tenant.");
    this.name = "BriefNotFoundError";
  }
}

export class ShortlistEntryError extends Error {
  readonly status = 422;
  readonly code = "shortlist_entry";
  constructor(readonly entryIds: readonly string[]) {
    super(entryIds.length ? `Not ranked for this brief: ${entryIds.join(", ")}.` : `A shortlist holds at most ${SHORTLIST_MAX} entries.`);
    this.name = "ShortlistEntryError";
  }
}

type Candidate = { kind: MatchKind; refId: string; name: string; sub: string; facts: EligibilityFacts; score: ScoreFacts };
type Ranked = {
  matchId: string; kind: MatchKind; refId: string; name: string; sub: string; rank: number; score: number; confidence: number;
  factors: ReturnType<typeof scoreCandidate>["factors"]; reasons: string[]; availability: Availability;
};

const upper = (s: string | null | undefined) => (s ?? "").trim().toUpperCase() || null;

async function loadBrief(tenantId: string, briefId: string) {
  const b = await prisma.campaignBrief.findFirst({
    where: { id: briefId, tenantId },
    select: {
      id: true, sponsorId: true, budget: true, startDate: true, endDate: true, updatedAt: true,
      sports: true, stateCodes: true, categories: true, excludedCategories: true, channels: true, audienceTiers: true, audienceMinFollowers: true,
      package: { select: { lineItems: true, athleteCountMax: true } },
    },
  });
  if (!b) throw new BriefNotFoundError();
  const brief: BriefForMatch = {
    sponsorId: b.sponsorId, sports: b.sports, stateCodes: b.stateCodes.map((s) => s.toUpperCase()), categories: b.categories,
    excludedCategories: b.excludedCategories, channels: b.channels, audienceTiers: b.audienceTiers, audienceMinFollowers: b.audienceMinFollowers,
    budget: b.budget, slots: Math.max(1, b.package?.athleteCountMax ?? 1), startDate: b.startDate, endDate: b.endDate,
  };
  return { id: b.id, updatedAt: b.updatedAt, brief, lines: packageLines(b.package?.lineItems) };
}

/** Every candidate of every kind, with the facts the filter and the score need. */
async function gather(tenantId: string, brief: BriefForMatch, lines: { jobId: string; quantity: number }[], now: Date): Promise<Candidate[]> {
  const since = new Date(now.getTime() - EXCLUDED_LOOKBACK_DAYS * 86_400_000);
  const [athletes, properties, items, restrictions, orders, sold, snapshots, listings] = await Promise.all([
    prisma.athlete.findMany({
      /* tenant-scope: explicit — this tenant's network. */
      where: { tenantId, state: { in: [...NETWORK_STATES] } },
      select: {
        id: true, displayName: true, sport: true, stateCode: true, tier: true, state: true, ageBand: true, propertyId: true, restrictedCategories: true,
        socials: { select: { platform: true, followers: true, source: true } },
        rates: { select: { jobId: true, amount: true, version: true } },
      },
    }),
    prisma.property.findMany({
      /* tenant-scope: explicit — this tenant's properties. */
      where: { tenantId },
      select: { id: true, name: true, kind: true, city: true, stateCode: true },
    }),
    prisma.inventoryItem.findMany({
      /* tenant-scope: explicit — this tenant's active items. */
      where: { tenantId, active: true },
      select: {
        id: true, title: true, kind: true, description: true, priceCents: true, athleteId: true, propertyId: true,
        availableFrom: true, availableUntil: true, categories: true, restrictedCategories: true,
      },
    }),
    brief.categories.length
      ? prisma.brandRestriction.findMany({
        /* tenant-scope: explicit — this tenant's restrictions on the brief's categories. */
        where: { tenantId, category: { in: [...brief.categories] } },
        select: { athleteId: true, propertyId: true, category: true, type: true, startsOn: true, endsOn: true },
      })
      : Promise.resolve([]),
    prisma.campaignOrder.findMany({
      /* tenant-scope: explicit — this tenant's worked orders. */
      where: { tenantId, state: { in: [...WORKED_ORDER_STATES] } },
      select: { athleteId: true, acceptedAt: true, dueDate: true, campaign: { select: { sponsorId: true, sponsor: { select: { categories: true } } } } },
    }),
    prisma.marketplaceOrderLine.findMany({
      /* tenant-scope: explicit — this tenant's sold lines. */
      where: { tenantId, order: { state: { in: [...SOLD_STATES] } } },
      select: { inventoryItemId: true, propertyId: true, sellerAthleteId: true, order: { select: { sponsorId: true, createdAt: true } } },
    }),
    prisma.$queryRawUnsafe<Array<{ entityId: string; features: AthleteFeatures }>>(
      /* tenant-scope: explicit — this tenant's latest snapshot per athlete. */
      `SELECT DISTINCT ON ("entityId") "entityId", features FROM "FeatureSnapshot"
        WHERE "tenantId" = $1 AND "entityType" = 'ATHLETE' AND day <= $2::date ORDER BY "entityId", day DESC`,
      tenantId, now.toISOString().slice(0, 10),
    ),
    prisma.listing.findMany({
      /* tenant-scope: explicit — this tenant's published listings. */
      where: { tenantId, state: "PUBLISHED" },
      select: { inventoryItemId: true },
    }),
  ]);

  /* The sponsors of sold lines, for their categories. */
  const buyerIds = [...new Set(sold.map((l) => l.order.sponsorId))];
  const buyers = new Map((buyerIds.length ? await prisma.sponsor.findMany({
    /* tenant-scope: explicit — this tenant's buying sponsors. */
    where: { tenantId, id: { in: buyerIds } },
    select: { id: true, categories: true },
  }) : []).map((s) => [s.id, s.categories]));

  const published = new Set(listings.map((l) => l.inventoryItemId));
  const snapBy = new Map(snapshots.map((s) => [s.entityId, s.features]));
  const rates = [...snapBy.values()].map((f) => f.engagement.rate).filter((r): r is number => r !== null).sort((a, b) => a - b);
  const medianRate = rates.length ? (rates.length % 2 ? rates[(rates.length - 1) / 2]! : (rates[rates.length / 2 - 1]! + rates[rates.length / 2]!) / 2) : null;
  const restrictionsOf = (athleteId: string | null, propertyId: string | null) =>
    restrictions.filter((r) => (athleteId && r.athleteId === athleteId) || (propertyId && r.propertyId === propertyId));

  /* Athlete ties: categories of sponsors worked for or sold to in the lookback; affinity; this sponsor. */
  const athleteTies = new Map<string, Set<string>>();
  const athleteAffinity = new Map<string, number>();
  const athleteWithSponsor = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const tie = (m: Map<string, Set<string>>, k: string, cats: readonly string[]) => { const s = m.get(k) ?? new Set(); cats.forEach((c) => s.add(c)); m.set(k, s); };
  for (const o of orders) {
    const cats = o.campaign.sponsor.categories;
    if ((o.acceptedAt ?? o.dueDate) >= since) tie(athleteTies, o.athleteId, cats);
    if (cats.some((c) => brief.categories.includes(c))) bump(athleteAffinity, o.athleteId);
    if (o.campaign.sponsorId === brief.sponsorId) bump(athleteWithSponsor, o.athleteId);
  }
  const propertyTies = new Map<string, Set<string>>();
  const itemWithSponsor = new Map<string, number>();
  const propertyWithSponsor = new Map<string, number>();
  for (const l of sold) {
    const cats = buyers.get(l.order.sponsorId) ?? [];
    const recent = l.order.createdAt >= since;
    if (l.propertyId && recent) tie(propertyTies, l.propertyId, cats);
    if (l.sellerAthleteId && recent) tie(athleteTies, l.sellerAthleteId, cats);
    if (l.order.sponsorId === brief.sponsorId) {
      bump(itemWithSponsor, l.inventoryItemId);
      if (l.propertyId) bump(propertyWithSponsor, l.propertyId);
      if (l.sellerAthleteId) bump(athleteWithSponsor, l.sellerAthleteId);
    }
  }

  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const currentRate = (rows: { jobId: string; amount: number; version: number }[]) => {
    const best = new Map<string, { amount: number; version: number }>();
    for (const r of rows) { const had = best.get(r.jobId); if (!had || r.version > had.version) best.set(r.jobId, r); }
    return new Map([...best].map(([j, v]) => [j, v.amount]));
  };
  const athleteFacts = (a: (typeof athletes)[number]) => {
    const followers = a.socials.map((s) => s.followers).filter((x): x is number => x !== null);
    const platforms = a.socials.map((s) => s.platform).filter((p) => SOCIAL.has(p));
    const snap = snapBy.get(a.id);
    const r = currentRate(a.rates);
    let priceCents: number | null = null;
    let priceBasis = "";
    if (lines.length) {
      const costs = lines.map((l) => (r.has(l.jobId) ? r.get(l.jobId)! * l.quantity : null));
      priceCents = costs.every((c) => c !== null) ? lineFloor(costs.reduce((t, c) => t! + c!, 0)!) : null;
      priceBasis = "The package's jobs at the athlete's rates and the 1.4× floor:";
    } else if (r.size) {
      priceCents = lineFloor(Math.min(...r.values()));
      priceBasis = "The athlete's cheapest rate at the 1.4× floor:";
    }
    return {
      audience: { tier: a.tier, maxFollowers: followers.length ? Math.max(...followers) : null },
      platforms,
      history: { dueByToday: snap?.delivery.dueByToday ?? 0, onTimeRate: snap?.delivery.onTimeRate ?? null, engagementRate: snap?.engagement.rate ?? null, medianEngagementRate: medianRate },
      verified: a.socials.some((s) => s.source === "VERIFIED_API" || s.source === "VERIFIED_MANUAL"),
      priceCents, priceBasis, hasRates: r.size > 0,
    };
  };

  const out: Candidate[] = [];
  for (const a of athletes) {
    const x = athleteFacts(a);
    out.push({
      kind: "athlete", refId: a.id, name: a.displayName, sub: `${a.sport} · ${upper(a.stateCode) ?? "no state"}`,
      facts: {
        bookable: BOOKABLE_STATES.includes(a.state), restrictions: restrictionsOf(a.id, a.propertyId),
        profileRestricted: a.restrictedCategories, itemRestricted: [], youth: a.ageBand !== "18_PLUS",
        tiedCategories: [...(athleteTies.get(a.id) ?? [])],
      },
      score: {
        stateCode: upper(a.stateCode), audience: x.audience, channels: [...x.platforms, "IN_PERSON"],
        category: { pastInCategories: athleteAffinity.get(a.id) ?? 0 }, history: x.history,
        priceCents: x.priceCents, priceBasis: x.priceBasis, withSponsor: athleteWithSponsor.get(a.id) ?? 0,
        quality: [
          { met: x.verified, yes: "verified audience", no: "audience not verified" },
          { met: x.hasRates && a.socials.length > 0, yes: "rates and socials on file", no: "rates or socials missing" },
        ],
      },
    });
  }

  const inWindow = (i: { availableFrom: Date | null; availableUntil: Date | null }) =>
    !(i.availableFrom && i.availableFrom > brief.endDate) && !(i.availableUntil && i.availableUntil < brief.startDate);
  for (const p of properties) {
    const mine = items.filter((i) => i.propertyId === p.id);
    const open = mine.filter(inWindow);
    const prices = open.map((i) => i.priceCents);
    out.push({
      kind: "property", refId: p.id, name: p.name, sub: [p.kind.charAt(0) + p.kind.slice(1).toLowerCase(), p.city, upper(p.stateCode)].filter(Boolean).join(" · "),
      facts: {
        bookable: open.length > 0, restrictions: restrictionsOf(null, p.id), profileRestricted: [], itemRestricted: [],
        youth: p.kind === "SCHOOL", tiedCategories: [...(propertyTies.get(p.id) ?? [])],
      },
      score: {
        stateCode: upper(p.stateCode), channels: ["IN_PERSON"], category: { listedFor: [...new Set(mine.flatMap((i) => i.categories))] },
        priceCents: prices.length ? Math.min(...prices) : null, priceBasis: "Its cheapest available item:", withSponsor: propertyWithSponsor.get(p.id) ?? 0,
        quality: [
          { met: mine.some((i) => published.has(i.id)), yes: "a published listing", no: "no published listing" },
          { met: mine.some((i) => !!i.description?.trim()), yes: "items described", no: "items not described" },
        ],
      },
    });
  }

  for (const i of items) {
    const a = i.athleteId ? athleteById.get(i.athleteId) : undefined;
    const p = i.propertyId ? propertyById.get(i.propertyId) : undefined;
    if (!a && !p) continue; // an owner outside the network: not a candidate
    const x = a ? athleteFacts(a) : null;
    const channels = IN_PERSON_KINDS.has(i.kind) ? ["IN_PERSON"]
      : !x ? ["IN_PERSON"]
      : i.kind === "SOCIAL_POST" ? x.platforms
      : i.kind === "VIDEO" ? x.platforms.filter((c) => VIDEO_CHANNELS.has(c))
      : [...x.platforms, "IN_PERSON"];
    out.push({
      kind: "inventory", refId: i.id, name: i.title, sub: a ? a.displayName : p!.name,
      facts: {
        bookable: a ? BOOKABLE_STATES.includes(a.state) : true, window: { from: i.availableFrom, until: i.availableUntil },
        restrictions: restrictionsOf(a?.id ?? null, a?.propertyId ?? p?.id ?? null),
        profileRestricted: a?.restrictedCategories ?? [], itemRestricted: i.restrictedCategories,
        youth: a ? a.ageBand !== "18_PLUS" : p!.kind === "SCHOOL",
        tiedCategories: [...new Set([...i.categories, ...(a ? athleteTies.get(a.id) ?? [] : propertyTies.get(p!.id) ?? [])])],
      },
      score: {
        stateCode: upper(a?.stateCode ?? p?.stateCode), ...(x ? { audience: x.audience, history: x.history } : {}),
        channels, category: { listedFor: i.categories }, priceCents: i.priceCents, priceBasis: "Listed at",
        withSponsor: itemWithSponsor.get(i.id) ?? 0,
        quality: [
          { met: published.has(i.id), yes: "a published listing", no: "no published listing" },
          { met: !!i.description?.trim(), yes: "described", no: "no description" },
        ],
      },
    });
  }
  return out;
}

/** Rank every kind for a brief and store the runs. */
async function rankBrief(tenantId: string, briefId: string, brief: BriefForMatch, lines: { jobId: string; quantity: number }[], now: Date) {
  const started = Date.now();
  const all = await gather(tenantId, brief, lines, now);
  const runs: Array<{ kind: MatchKind; filteredOut: Record<string, number>; ranked: Ranked[] }> = [];
  for (const kind of MATCH_KINDS) {
    const filteredOut = { unavailable: 0, categoryConflict: 0, brandSafety: 0 };
    const kept: Array<Omit<Ranked, "rank">> = [];
    for (const c of all.filter((x) => x.kind === kind)) {
      const f = filterCandidate(c.facts, brief);
      if (!f.eligible) { filteredOut[f.reason] += 1; continue; }
      const s = scoreCandidate(c.score, brief);
      kept.push({ matchId: `${kind}:${c.refId}`, kind, refId: c.refId, name: c.name, sub: c.sub, score: s.score, confidence: s.confidence, factors: s.factors, reasons: s.reasons, availability: f.availability });
    }
    kept.sort(byScore);
    runs.push({ kind, filteredOut, ranked: kept.map((k, i) => ({ ...k, rank: i + 1 })) });
  }
  const durationMs = Date.now() - started;
  /* One stamp for all three kinds, on the real clock — the one a brief's updatedAt is set by. */
  const computedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const r of runs) {
      const run = await tx.matchRun.create({
        data: { tenantId, briefId, kind: r.kind, modelVersion: MATCH_MODEL_VERSION, filteredOut: r.filteredOut, candidates: r.ranked.length, durationMs, computedAt },
        select: { id: true },
      });
      if (r.ranked.length) {
        await tx.matchScore.createMany({
          data: r.ranked.map((m) => ({
            tenantId, runId: run.id, matchId: m.matchId, kind: m.kind, refId: m.refId, name: m.name, sub: m.sub, rank: m.rank, score: m.score,
            confidence: m.confidence, factors: m.factors as unknown as Prisma.InputJsonValue, reasons: m.reasons, availability: m.availability as unknown as Prisma.InputJsonValue,
          })),
        });
      }
    }
  });
}

/** The brief's latest run of each kind, ranking again when it is stale or the brief changed since. */
async function currentRuns(tenantId: string, briefId: string, now: Date) {
  const b = await loadBrief(tenantId, briefId);
  const latest = async () => prisma.$queryRawUnsafe<Array<{ id: string; kind: MatchKind; modelVersion: string; filteredOut: Record<string, number>; candidates: number; computedAt: Date }>>(
    /* tenant-scope: explicit — this tenant's runs for this brief. */
    `SELECT DISTINCT ON (kind) id, kind, "modelVersion", "filteredOut", candidates, "computedAt" FROM "MatchRun"
      WHERE "tenantId" = $1 AND "briefId" = $2 ORDER BY kind, "computedAt" DESC, id DESC`,
    tenantId, briefId,
  );
  let runs = await latest();
  /* Fresh by the real clock — `now` dates the facts (the lookback, the snapshot day), not the cache. */
  const fresh = runs.length === MATCH_KINDS.length && runs.every((r) =>
    r.modelVersion === MATCH_MODEL_VERSION && r.computedAt.getTime() > Date.now() - RUN_REUSE_MS && r.computedAt >= b.updatedAt);
  if (!fresh) {
    await rankBrief(tenantId, briefId, b.brief, b.lines, now);
    runs = await latest();
  }
  return new Map(runs.map((r) => [r.kind, r]));
}

async function shortlistOf(tenantId: string, briefId: string) {
  const s = await prisma.briefShortlist.findFirst({
    where: { tenantId, briefId },
    select: { id: true, briefId: true, entries: true, savedAt: true, savedBy: true },
  });
  if (!s) return null;
  const by = await prisma.user.findFirst({ where: { tenantId, id: s.savedBy }, select: { email: true } });
  return { id: s.id, briefId: s.briefId, entries: s.entries as Array<{ matchId: string; kind: MatchKind; name: string; score: number }>, savedAt: s.savedAt.toISOString(), savedBy: by?.email ?? "a former user" };
}

/** GET /intelligence/briefs/:briefId/matches — one page of one kind, best first. */
export async function matchPage(actor: Actor, briefId: string, kind: MatchKind, page: PageRequest, now = new Date()) {
  assertTenantWide(actor, "briefMatch", "read");
  const runs = await currentRuns(actor.tenantId, briefId, now);
  const run = runs.get(kind)!;
  const rows = await prisma.matchScore.findMany({
    where: { tenantId: actor.tenantId, runId: run.id },
    orderBy: { rank: "asc" },
    skip: page.skip,
    take: page.take,
    select: { matchId: true, kind: true, refId: true, name: true, sub: true, rank: true, score: true, confidence: true, factors: true, reasons: true, availability: true },
  });
  const info: PageInfo = { page: page.page, size: page.size, total: run.candidates, pages: Math.max(1, Math.ceil(run.candidates / page.size)) };
  return {
    briefId,
    kind,
    counts: Object.fromEntries(MATCH_KINDS.map((k) => [k, runs.get(k)?.candidates ?? 0])) as Record<MatchKind, number>,
    filteredOut: run.filteredOut as { unavailable: number; categoryConflict: number; brandSafety: number },
    matches: rows.map((r) => ({
      id: r.matchId, kind: r.kind as MatchKind, refId: r.refId, name: r.name, sub: r.sub, rank: r.rank, score: r.score,
      factors: r.factors, reasons: r.reasons, availability: r.availability,
      stamp: { modelVersion: run.modelVersion, confidence: r.confidence, computedAt: run.computedAt.toISOString() },
    })),
    page: info,
    shortlist: await shortlistOf(actor.tenantId, briefId),
    run: { modelVersion: run.modelVersion, computedAt: run.computedAt.toISOString() },
  };
}

/** POST /intelligence/briefs/:briefId/shortlist — replaces the brief's shortlist with exactly these ranked matches. */
export async function saveShortlist(actor: Actor, briefId: string, entryIds: readonly string[], now = new Date()) {
  assertTenantWide(actor, "briefMatch", "write");
  const ids = [...new Set(entryIds)];
  if (ids.length > SHORTLIST_MAX) throw new ShortlistEntryError([]);
  const runs = await currentRuns(actor.tenantId, briefId, now);
  const scored = ids.length ? await prisma.matchScore.findMany({
    where: { tenantId: actor.tenantId, runId: { in: [...runs.values()].map((r) => r.id) }, matchId: { in: ids } },
    select: { matchId: true, kind: true, name: true, score: true },
  }) : [];
  const found = new Map(scored.map((s) => [s.matchId, s]));
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length) throw new ShortlistEntryError(unknown);
  const entries = ids.map((id) => { const s = found.get(id)!; return { matchId: s.matchId, kind: s.kind, name: s.name, score: s.score }; });
  await prisma.$transaction(async (tx) => {
    const saved = await tx.briefShortlist.upsert({
      /* tenant-scope: the brief was found in the caller's tenant (currentRuns → loadBrief); its id is unique. */
      where: { briefId },
      create: { tenantId: actor.tenantId, briefId, entries, savedBy: actor.userId, savedAt: now },
      update: { entries, savedBy: actor.userId, savedAt: now },
      select: { id: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.match.shortlistSave, "BriefShortlist", saved.id, { after: { briefId, entries: ids } });
  });
  return (await shortlistOf(actor.tenantId, briefId))!;
}
