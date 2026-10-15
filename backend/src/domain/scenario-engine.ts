/**
 * The scenario planner — 3S7-BE-01 (documentation/SponsorX-Scenarios.md), read
 * by 3S7-FE-03 (/admin/intelligence/scenarios; contract: frontend/src/lib/scenarios-live.ts).
 * The rules are scenario-rules.ts; this file gathers the facts and keeps the
 * saved scenarios.
 *
 * WHO. BTG admins, campaign managers and Sales plan and save (`scenario`,
 * RBAC matrix §33). A scenario is a what-if: calculating stores nothing;
 * saving keeps the inputs and the answer with its model stamp, so two can be
 * compared later exactly as they were made.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { prisma } from "../db/client";
import type { Prisma } from "../generated/prisma/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import { BENCHMARK_METRIC } from "./benchmarks";
import type { AthleteFeatures } from "./feature-snapshots";
import { assertFeature } from "./model-registry";
import { NIL_JOBS } from "./nil-jobs";
import {
  calculate, inputProblems, MIN_SEGMENT_ATHLETES, percentile, SCENARIO_FORMATS,
  type ScenarioInputs, type ScenarioResult, type UnitPrice, type ViewsPerPost,
} from "./scenario-rules";

const BOOKED = ["ACCEPTED", "ACTIVE", "COMPLETED"] as const;
const BOOKABLE = ["ACTIVE", "FEATURED"] as const;
const NAME_MAX = 120;

export class ScenarioInputError extends Error {
  readonly status = 422;
  readonly code = "scenario_inputs";
  constructor(readonly issues: readonly string[]) {
    super(issues.join(" "));
    this.name = "ScenarioInputError";
  }
}

const median = (xs: number[]) => percentile([...xs].sort((a, b) => a - b), 0.5);

/** Each format's price per post: the tenant's median booked sell price in the last year, else the catalogue's sell band midpoint. */
async function prices(tenantId: string, now: Date): Promise<Record<string, UnitPrice>> {
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const rows = await prisma.campaignOrder.findMany({
    /* tenant-scope: explicit — this tenant's booked orders in the last year. */
    where: { tenantId, state: { in: [...BOOKED] }, acceptedAt: { gte: since } },
    select: { jobId: true, sellPrice: true },
  });
  const out: Record<string, UnitPrice> = {};
  for (const f of SCENARIO_FORMATS) {
    const jobs = new Set<string>(f.jobs);
    const booked = rows.filter((r) => jobs.has(r.jobId) && r.sellPrice > 0).map((r) => r.sellPrice);
    out[f.key] = booked.length
      ? { cents: Math.round(median(booked)), basis: "booked" }
      : { cents: Math.round(median(NIL_JOBS.filter((j) => jobs.has(j.id)).map((j) => ((j.sellLow + j.sellHigh) / 2) * 100))), basis: "catalogue" };
  }
  return out;
}

/** Verified views per published post, per athlete with a record — for the audience, else the whole tenant. */
async function viewsPerPost(tenantId: string, audience: ScenarioInputs["audience"], now: Date): Promise<ViewsPerPost> {
  const athletes = await prisma.athlete.findMany({
    /* tenant-scope: explicit — this tenant's bookable athletes. */
    where: { tenantId, state: { in: [...BOOKABLE] } },
    select: { id: true, sport: true, stateCode: true, ageBand: true },
  });
  const snaps = await prisma.$queryRawUnsafe<Array<{ entityId: string; features: AthleteFeatures }>>(
    /* tenant-scope: explicit — this tenant's latest snapshot per athlete. */
    `SELECT DISTINCT ON ("entityId") "entityId", features FROM "FeatureSnapshot"
      WHERE "tenantId" = $1 AND "entityType" = 'ATHLETE' AND day <= $2::date ORDER BY "entityId", day DESC`,
    tenantId, now.toISOString().slice(0, 10),
  );
  const per = new Map<string, number>();
  for (const s of snaps) {
    const posts = s.features.delivery?.published ?? 0;
    const views = s.features.engagement?.verifiedViews ?? 0;
    if (posts > 0 && views > 0) per.set(s.entityId, views / posts);
  }
  const up = (x: string | null | undefined) => (x ?? "").trim().toUpperCase();
  const states = (audience.stateCodes ?? []).map(up);
  const matches = athletes.filter((a) =>
    (!audience.sport || up(a.sport) === up(audience.sport)) && (!states.length || states.includes(up(a.stateCode))) && (!audience.ageBand || a.ageBand === audience.ageBand));
  const band = (ids: string[], basis: "segment" | "tenant"): ViewsPerPost => {
    const xs = ids.map((id) => per.get(id)!).sort((a, b) => a - b);
    return { p25: percentile(xs, 0.25), median: percentile(xs, 0.5), p75: percentile(xs, 0.75), athletes: xs.length, basis };
  };
  const segment = matches.map((a) => a.id).filter((id) => per.has(id));
  if (segment.length >= MIN_SEGMENT_ATHLETES) return band(segment, "segment");
  const tenant = athletes.map((a) => a.id).filter((id) => per.has(id));
  return tenant.length ? band(tenant, "tenant") : { p25: 0, median: 0, p75: 0, athletes: 0, basis: "none" };
}

async function answer(tenantId: string, inputs: ScenarioInputs, now: Date): Promise<ScenarioResult> {
  const issues = inputProblems(inputs);
  if (issues.length) throw new ScenarioInputError(issues);
  const [p, v] = await Promise.all([prices(tenantId, now), viewsPerPost(tenantId, inputs.audience, now)]);
  return calculate(inputs, { prices: p, views: v }, now.toISOString());
}

/** POST /intelligence/scenarios/calculate — a what-if; nothing is stored. */
export async function calculateScenario(actor: Actor, inputs: ScenarioInputs, now = new Date()) {
  assertTenantWide(actor, "scenario", "read");
  await assertFeature(prisma, actor.tenantId, "scenarios");
  return answer(actor.tenantId, inputs, now);
}

/** POST /intelligence/scenarios — calculate and keep, with the answer's model stamp. */
export async function saveScenario(actor: Actor, input: { name: string; inputs: ScenarioInputs }, now = new Date()) {
  assertTenantWide(actor, "scenario", "write");
  await assertFeature(prisma, actor.tenantId, "scenarios");
  const name = input.name.trim();
  if (!name || name.length > NAME_MAX) throw new ScenarioInputError([`Name the scenario (1 to ${NAME_MAX} characters).`]);
  const result = await answer(actor.tenantId, input.inputs, now);
  const row = await prisma.scenario.create({
    data: {
      tenantId: actor.tenantId, name, inputs: input.inputs as unknown as Prisma.InputJsonValue, result: result as unknown as Prisma.InputJsonValue,
      savedBy: actor.userId, savedAt: now,
    },
    select: { id: true },
  });
  return (await views(actor.tenantId, [row.id]))[0]!;
}

async function views(tenantId: string, ids: string[]) {
  const rows = await prisma.scenario.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, inputs: true, result: true, savedAt: true, savedBy: true },
  });
  const users = new Map((await prisma.user.findMany({
    where: { tenantId, id: { in: [...new Set(rows.map((r) => r.savedBy))] } }, select: { id: true, email: true },
  })).map((u) => [u.id, u.email]));
  const by = new Map(rows.map((r) => [r.id, {
    id: r.id, name: r.name, inputs: r.inputs as unknown as ScenarioInputs, result: r.result as unknown as ScenarioResult,
    savedAt: r.savedAt.toISOString(), savedBy: users.get(r.savedBy) ?? "a former user",
  }]));
  return ids.map((id) => by.get(id)).filter((v): v is NonNullable<typeof v> => !!v);
}

/** GET /intelligence/scenarios — the saved scenarios (newest first), the suggested starting inputs, and what the planner can calculate for. */
export async function scenarioDesk(actor: Actor, page: PageRequest) {
  assertTenantWide(actor, "scenario", "read");
  await assertFeature(prisma, actor.tenantId, "scenarios");
  const tenantId = actor.tenantId;
  const [total, rows, athletes, benchmark] = await Promise.all([
    prisma.scenario.count({ where: { tenantId } }),
    prisma.scenario.findMany({ where: { tenantId }, orderBy: [{ savedAt: "desc" }, { id: "asc" }], skip: page.skip, take: page.take, select: { id: true } }),
    prisma.athlete.findMany({ where: { tenantId, state: { in: [...BOOKABLE] } }, select: { sport: true, stateCode: true, ageBand: true } }),
    prisma.benchmark.findFirst({ where: { tenantId, dimension: "ALL", segment: "", metric: BENCHMARK_METRIC }, select: { median: true } }),
  ]);
  const sorted = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x && !!x.trim()))].sort();
  const info: PageInfo = { page: page.page, size: page.size, total, pages: Math.max(1, Math.ceil(total / page.size)) };
  return {
    scenarios: await views(tenantId, rows.map((r) => r.id)),
    page: info,
    defaults: {
      budgetCents: 10_000_00, cpmCents: benchmark?.median ?? 20_00, audience: {},
      mix: [{ format: "SOCIAL_POST", share: 0.6 }, { format: "VIDEO", share: 0.4 }],
    } satisfies ScenarioInputs,
    options: {
      formats: SCENARIO_FORMATS.map((f) => ({ key: f.key, label: f.label })),
      sports: sorted(athletes.map((a) => a.sport)),
      stateCodes: sorted(athletes.map((a) => a.stateCode?.toUpperCase() ?? null)),
      ageBands: sorted(athletes.map((a) => a.ageBand)),
    },
  };
}
