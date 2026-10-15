/**
 * Model and rule administration — 3S8-BE-01 and 3S8-OPS-01, read and written
 * by the models screen (3S8-FE-02, /admin/intelligence/models; contract:
 * frontend/src/lib/models-live.ts). The rules of the road are the governance
 * policy (documentation/SponsorX-Model-Governance.md, 3S0-PMO-02); the
 * settings themselves are model-registry.ts.
 *
 * WHO. BTG admins for their own tenant, super admins for any (`modelRegistry`,
 * RBAC matrix §35). Every write carries a reason and is audited.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide, scopeOf } from "../auth/scope";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import type { Prisma } from "../generated/prisma/client";
import { BENCHMARK_MIN_SAMPLE, listBenchmarks } from "./benchmarks";
import { MATCH_FACTORS } from "./match-rules";
import { activeModel, builtInSettings, FEATURES, MODEL_DEFS, MODEL_KEYS, type Feature, type ModelKey } from "./model-registry";

type Tx = Prisma.TransactionClient;
export const REASON_MIN = 10;
export const REASON_MAX = 500;
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

export class ModelNotFoundError extends Error {
  readonly status = 404;
  readonly code = "model_not_found";
  constructor(message = "No such model or version.") {
    super(message);
    this.name = "ModelNotFoundError";
  }
}

export class ModelStateError extends Error {
  readonly status = 409;
  readonly code = "model_state";
  constructor(message: string) {
    super(message);
    this.name = "ModelStateError";
  }
}

export class ModelInputError extends Error {
  readonly status = 422;
  readonly code = "model_input";
  constructor(readonly problems: readonly string[]) {
    super(problems.join(" "));
    this.name = "ModelInputError";
  }
}

const reasonOk = (r: string) => {
  const t = r.trim();
  if (t.length < REASON_MIN || t.length > REASON_MAX) throw new ModelInputError([`Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`]);
  return t;
};
const keyOf = (k: string): ModelKey => {
  if (!(MODEL_KEYS as readonly string[]).includes(k)) throw new ModelNotFoundError();
  return k as ModelKey;
};
const parse = (v: string) => v.split(".").map((x) => Number(x) || 0);
const cmp = (a: string, b: string) => { const x = parse(a); const y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!; return 0; };

/** The built-in version, stored the first time a tenant changes a model, so it can always be rolled back to. */
async function ensureBuiltIn(tx: Tx, tenantId: string, key: ModelKey) {
  const any = await tx.modelVersion.count({ where: { tenantId, key } });
  if (any) return;
  await tx.modelVersion.create({
    data: {
      tenantId, key, version: MODEL_DEFS[key].builtIn, status: "active", thresholds: builtInSettings(key),
      notes: "The built-in settings the engine shipped with.", reason: "Built in", createdBy: null, createdAt: new Date(0), activatedAt: new Date(0),
    },
    select: { id: true },
  });
}

/** Make one version active and retire the one that was. */
async function swapActive(tx: Tx, tenantId: string, key: ModelKey, toId: string, now: Date) {
  await tx.modelVersion.updateMany({ where: { tenantId, key, status: "active" }, data: { status: "retired", retiredAt: now } });
  await tx.modelVersion.update({ where: { id: toId, tenantId }, data: { status: "active", activatedAt: now, retiredAt: null }, select: { id: true } });
}

async function lockModel(tx: Tx, tenantId: string, key: ModelKey) {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `model:${tenantId}:${key}`);
}

/* ───────────────────────────── the desk ───────────────────────────── */

const OUTPUTS: Record<ModelKey, { table: string; column: string }> = {
  pricing: { table: "PricingRecommendation", column: "modelVersion" },
  matching: { table: "MatchRun", column: "modelVersion" },
  forecast: { table: "CampaignForecast", column: "modelVersion" },
  makegood: { table: "MakeGoodShortfall", column: "modelVersion" },
  anomalies: { table: "Anomaly", column: "ruleVersion" },
};

/** What each version made: the outputs stamped with it — the compare view's figure until backtests (3S9-QA-01) add theirs. */
async function outputsBy(tenantId: string, key: ModelKey): Promise<Map<string, number>> {
  const o = OUTPUTS[key];
  const rows = await prisma.$queryRawUnsafe<Array<{ v: string; n: bigint }>>(
    /* tenant-scope: explicit — this tenant's outputs of one model, by version stamp. */
    `SELECT "${o.column}" AS v, count(*) AS n FROM "${o.table}" WHERE "tenantId" = $1 GROUP BY 1`, tenantId,
  );
  return new Map(rows.map((r) => [r.v, Number(r.n)]));
}

async function modelView(tenantId: string, key: ModelKey) {
  const def = MODEL_DEFS[key];
  const [rows, active, outputs] = await Promise.all([
    prisma.modelVersion.findMany({
      where: { tenantId, key },
      select: { version: true, status: true, createdAt: true, createdBy: true, notes: true, reason: true, thresholds: true },
    }),
    activeModel(prisma, tenantId, key),
    outputsBy(tenantId, key),
  ]);
  const users = new Map((await prisma.user.findMany({
    where: { tenantId, id: { in: rows.map((r) => r.createdBy).filter((u): u is string => !!u) } }, select: { id: true, email: true },
  })).map((u) => [u.id, u.email]));
  const versions = (rows.length ? rows : [{
    version: def.builtIn, status: "active", createdAt: new Date(0), createdBy: null, notes: "The built-in settings the engine shipped with.", reason: "Built in", thresholds: builtInSettings(key),
  }]).map((r) => ({
    version: r.version, status: r.status as "draft" | "validated" | "active" | "retired", createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy ? users.get(r.createdBy) ?? "a former user" : "SponsorX (built in)",
    notes: r.notes || r.reason, settings: r.thresholds as Record<string, number>,
    metrics: [{ label: "Outputs made", value: outputs.get(`${def.base}@${r.version}`) ?? 0 }],
  })).sort((a, b) => cmp(b.version, a.version));
  return {
    key, name: def.name, activeVersion: active.version, versions,
    thresholds: def.thresholds.map((t) => ({ key: t.key, label: t.label, value: active.t[t.key]!, unit: t.unit, min: t.min, max: t.max })),
    ...(key === "matching" ? { factors: MATCH_FACTORS.map((f) => ({ key: f.key, label: f.label, weight: f.points })) } : {}),
  };
}

/** The tenants a caller may switch features for: its own, or every one for a super admin. */
async function flagTenants(actor: Actor) {
  const all = scopeOf(actor, "modelRegistry", "write") === "any" || scopeOf(actor, "modelRegistry", "read") === "any";
  return prisma.tenant.findMany({
    /* tenant-scope: the caller's own tenant, or every tenant for a super admin (scope "any"). */
    where: all ? {} : { id: actor.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}

/** GET /intelligence/models — every model with its versions, settings and outputs; benchmarks; feature flags. */
export async function modelRegistry(actor: Actor, now = new Date()) {
  assertTenantWide(actor, "modelRegistry", "read");
  const tenantId = actor.tenantId;
  const tenants = await flagTenants(actor);
  const flagRows = await prisma.featureFlag.findMany({
    /* tenant-scope: the tenants just resolved for this caller. */
    where: { tenantId: { in: tenants.map((t) => t.id) } }, select: { tenantId: true, feature: true, enabled: true },
  });
  const flagBy = new Map(flagRows.map((f) => [`${f.feature}::${f.tenantId}`, f.enabled]));
  return {
    asOf: now.toISOString(),
    models: await Promise.all(MODEL_KEYS.map((k) => modelView(tenantId, k))),
    benchmarks: (await listBenchmarks(prisma, tenantId)).map((b) => ({
      segment: b.dimension === "ALL" ? "All" : `${b.dimension.charAt(0)}${b.dimension.slice(1).toLowerCase()}: ${b.segment}`,
      p25: b.p25, median: b.median, p75: b.p75, sampleSize: b.sampleSize, refreshedAt: b.refreshedAt,
    })),
    benchmarkMinSample: BENCHMARK_MIN_SAMPLE,
    flags: FEATURES.flatMap((feature) => tenants.map((t) => ({ feature, tenantId: t.id, tenantName: t.name, enabled: flagBy.get(`${feature}::${t.id}`) ?? true }))),
    rollouts: [] as Array<{ model: ModelKey; version: string; stage: string; tenants: Array<{ id: string; name: string }> }>,
  };
}

/* ───────────────────────────── writes ───────────────────────────── */

/**
 * PATCH /intelligence/models/:key/thresholds — save the new settings as the
 * next version. Every value inside its safe range: validated and made active
 * at once, automatically. Otherwise held as a draft for a second person.
 */
export async function changeSettings(actor: Actor, keyIn: string, input: { values: Record<string, number>; reason: string }, now = new Date()) {
  assertTenantWide(actor, "modelRegistry", "write");
  const key = keyOf(keyIn);
  const reason = reasonOk(input.reason);
  const def = MODEL_DEFS[key];
  const problems: string[] = [];
  const outside: string[] = [];
  const entries = Object.entries(input.values ?? {});
  if (!entries.length) problems.push("Change at least one setting.");
  for (const [k, v] of entries) {
    const t = def.thresholds.find((x) => x.key === k);
    if (!t) { problems.push(`"${k}" is not a setting of the ${def.name}.`); continue; }
    if (!Number.isFinite(v) || v <= 0) { problems.push(`${t.label} must be above zero.`); continue; }
    if (t.unit === "share" && v > 1) { problems.push(`${t.label} is a share, at most 1.`); continue; }
    if (t.integer && !Number.isInteger(v)) { problems.push(`${t.label} is a whole number.`); continue; }
    if (v < t.min || v > t.max) outside.push(`${t.label} is ${v}, outside the safe range ${t.min}–${t.max}`);
  }
  if (problems.length) throw new ModelInputError(problems);
  const tenantId = actor.tenantId;
  const made = await prisma.$transaction(async (tx) => {
    await lockModel(tx, tenantId, key);
    await ensureBuiltIn(tx, tenantId, key);
    const [current, all] = await Promise.all([
      activeModel(tx, tenantId, key),
      tx.modelVersion.findMany({ where: { tenantId, key }, select: { version: true } }),
    ]);
    const top = all.map((r) => r.version).sort(cmp).at(-1) ?? def.builtIn;
    const [maj, min] = parse(top);
    const version = `${maj}.${(min ?? 0) + 1}.0`;
    const automatic = outside.length === 0;
    const row = await tx.modelVersion.create({
      data: {
        tenantId, key, version, status: automatic ? "validated" : "draft", thresholds: { ...current.t, ...input.values },
        notes: automatic ? `${reason} (inside the safe ranges: validated and activated automatically)` : `${reason} (held: ${outside.join("; ")})`,
        reason, createdBy: actor.userId, createdAt: now, ...(automatic ? { validatedAt: now } : {}),
      },
      select: { id: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.model.versionCreate, "ModelVersion", row.id, { after: { key, version, values: input.values, reason, held: outside } });
    if (automatic) {
      await swapActive(tx, tenantId, key, row.id, now);
      await audit(tx, SYSTEM(tenantId), AUDIT_ACTIONS.model.autoActivate, "ModelVersion", row.id, { before: { version: current.version }, after: { key, version } });
    }
    return { version, automatic };
  });
  return {
    version: made.version,
    status: made.automatic ? "active" : "draft",
    heldBecause: made.automatic ? [] : outside.map((o) => `${o}; a second person must validate it before it can go live.`),
    model: await modelView(tenantId, key),
  };
}

/** POST /intelligence/models/:key/versions/:version/validate — a second person checks a held draft. */
export async function validateVersion(actor: Actor, keyIn: string, version: string, input: { reason: string }, now = new Date()) {
  assertTenantWide(actor, "modelRegistry", "write");
  const key = keyOf(keyIn);
  const reason = reasonOk(input.reason);
  await prisma.$transaction(async (tx) => {
    await lockModel(tx, actor.tenantId, key);
    const v = await tx.modelVersion.findFirst({ where: { tenantId: actor.tenantId, key, version }, select: { id: true, status: true, createdBy: true } });
    if (!v) throw new ModelNotFoundError();
    if (v.status !== "draft") throw new ModelStateError("Only a draft is validated.");
    if (v.createdBy === actor.userId) throw new ModelStateError("A second person must validate it — not the one who proposed it.");
    await tx.modelVersion.update({ where: { id: v.id, tenantId: actor.tenantId }, data: { status: "validated", validatedBy: actor.userId, validatedAt: now }, select: { id: true } });
    await audit(tx, actor, AUDIT_ACTIONS.model.validate, "ModelVersion", v.id, { after: { key, version, reason } });
  });
  return modelView(actor.tenantId, key);
}

/** POST /intelligence/models/:key/versions/:version/activate — only a validated version. */
export async function activateVersion(actor: Actor, keyIn: string, version: string, input: { reason: string }, now = new Date()) {
  assertTenantWide(actor, "modelRegistry", "write");
  const key = keyOf(keyIn);
  const reason = reasonOk(input.reason);
  await prisma.$transaction(async (tx) => {
    await lockModel(tx, actor.tenantId, key);
    const v = await tx.modelVersion.findFirst({ where: { tenantId: actor.tenantId, key, version }, select: { id: true, status: true } });
    if (!v) throw new ModelNotFoundError();
    if (v.status !== "validated") throw new ModelStateError("Only a validated version is activated.");
    const before = await activeModel(tx, actor.tenantId, key);
    await swapActive(tx, actor.tenantId, key, v.id, now);
    await audit(tx, actor, AUDIT_ACTIONS.model.activate, "ModelVersion", v.id, { before: { version: before.version }, after: { key, version, reason } });
  });
  return modelView(actor.tenantId, key);
}

/** POST /intelligence/models/:key/rollback — make a retired version active again. */
export async function rollbackModel(actor: Actor, keyIn: string, input: { toVersion: string; reason: string }, now = new Date()) {
  assertTenantWide(actor, "modelRegistry", "write");
  const key = keyOf(keyIn);
  const reason = reasonOk(input.reason);
  await prisma.$transaction(async (tx) => {
    await lockModel(tx, actor.tenantId, key);
    const v = await tx.modelVersion.findFirst({ where: { tenantId: actor.tenantId, key, version: input.toVersion }, select: { id: true, status: true } });
    if (!v) throw new ModelNotFoundError();
    if (v.status !== "retired") throw new ModelStateError("Only a retired version is rolled back to.");
    const before = await activeModel(tx, actor.tenantId, key);
    await swapActive(tx, actor.tenantId, key, v.id, now);
    await audit(tx, actor, AUDIT_ACTIONS.model.rollback, "ModelVersion", v.id, { before: { version: before.version }, after: { key, version: input.toVersion, reason } });
  });
  return modelView(actor.tenantId, key);
}

/** PATCH /intelligence/flags — switch one feature on or off for one tenant the caller may manage. */
export async function setFlag(actor: Actor, input: { feature: string; tenantId: string; enabled: boolean; reason: string }, now = new Date()) {
  assertTenantWide(actor, "modelRegistry", "write");
  const reason = reasonOk(input.reason);
  if (!(FEATURES as readonly string[]).includes(input.feature)) throw new ModelInputError([`"${input.feature}" is not an intelligence feature.`]);
  const tenants = await flagTenants(actor);
  const tenant = tenants.find((t) => t.id === input.tenantId);
  if (!tenant) throw new ModelNotFoundError("No such tenant for you to manage.");
  const feature = input.feature as Feature;
  await prisma.$transaction(async (tx) => {
    const before = await tx.featureFlag.findFirst({ where: { tenantId: tenant.id, feature }, select: { enabled: true } });
    await tx.featureFlag.upsert({
      /* tenant-scope: the tenant resolved for this caller above (its own, or any for a super admin). */
      where: { tenantId_feature: { tenantId: tenant.id, feature } },
      create: { tenantId: tenant.id, feature, enabled: input.enabled, reason, updatedBy: actor.userId, updatedAt: now },
      update: { enabled: input.enabled, reason, updatedBy: actor.userId, updatedAt: now },
      select: { tenantId: true },
    });
    await audit(tx, { userId: actor.userId, tenantId: tenant.id }, AUDIT_ACTIONS.model.flagSet, "FeatureFlag", `${tenant.id}:${feature}`, {
      before: { enabled: before?.enabled ?? true }, after: { feature, enabled: input.enabled, reason },
    });
  });
  return { feature, tenantId: tenant.id, tenantName: tenant.name, enabled: input.enabled };
}
