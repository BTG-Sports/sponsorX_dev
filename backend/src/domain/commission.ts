/**
 * The commission rule engine — 2S5-BE-01.
 *
 * "Versioned rules for platform fee, management fee, property and athlete
 * share, referral fee, by scope and priority." Done when: "Rules apply in
 * priority order; editing a rule never alters a closed payout."
 *
 * PRIORITY. For each kind, the rule that applies is the matching rule with
 * the highest `priority` among those in effect at the moment asked; a tie
 * goes to the latest version (ledger design §3). A rule matches when its
 * scope does: GLOBAL, the property's kind, the property, or the sponsor.
 *
 * VERSIONS, NOT EDITS. `reviseRule` writes version n+1 and closes version
 * n's window at the same instant; Postgres refuses any other change to a rule
 * row (prisma/sql/ledger_immutable.sql). And rules are read in exactly one
 * place — `resolveRates`, called only when an order is contracted, whose
 * result is frozen onto the order (2S4-BE-04) and posted to the ledger
 * (2S5-BE-02). A payout draws on those entries and never asks the rules, so
 * an edit cannot reach a closed payout: tests/phase2-ledger.test.ts pins that
 * no other code reads this table.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { NO_RULE, RULE_KINDS, type AppliedRule, type RuleKind } from "./ledger-math";

export const RULE_SCOPES = ["GLOBAL", "PROPERTY_KIND", "PROPERTY", "SPONSOR"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export class CommissionRuleError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "CommissionRuleError";
    this.status = status;
  }
}

const SELECT = {
  id: true, ruleKey: true, version: true, kind: true, scope: true, scopeRef: true, bps: true, fixedCents: true,
  priority: true, effectiveFrom: true, effectiveTo: true, note: true, createdAt: true,
} as const;

export type RuleInput = {
  kind: RuleKind; scope: RuleScope; scopeRef?: string | null; bps: number; fixedCents?: number;
  priority: number; effectiveFrom?: Date; note?: string | null;
};

function assertShape(r: RuleInput) {
  if (!Number.isInteger(r.bps) || r.bps < 0 || r.bps > 10_000) throw new CommissionRuleError("bps: 0 to 10000.");
  if (r.fixedCents != null && (!Number.isInteger(r.fixedCents) || r.fixedCents < 0)) throw new CommissionRuleError("fixedCents: 0 or more.");
  if ((r.scope === "GLOBAL") !== !r.scopeRef) throw new CommissionRuleError("A GLOBAL rule names no scopeRef; every other scope names one.");
  if (!Number.isInteger(r.priority)) throw new CommissionRuleError("priority: a whole number.");
  if (r.fixedCents && r.kind !== "PLATFORM_FEE" && r.kind !== "PROCESSING") {
    throw new CommissionRuleError("Only the platform fee and processing carry a fixed amount.");
  }
}

export async function listRules(actor: Actor, opts: { current?: boolean } = {}) {
  return prisma.commissionRule.findMany({
    where: { ...whereFor(actor, "commissionRule", "read"), ...(opts.current ? { effectiveTo: null } : {}) },
    select: SELECT, orderBy: [{ kind: "asc" }, { priority: "desc" }, { version: "desc" }],
  });
}

export async function createRule(actor: Actor, input: RuleInput) {
  assertTenantWide(actor, "commissionRule", "write");
  assertShape(input);
  return prisma.$transaction(async (tx) => {
    const row = await tx.commissionRule.create({
      data: {
        tenantId: actor.tenantId, ruleKey: `cr_${randomBytes(8).toString("hex")}`, version: 1, kind: input.kind, scope: input.scope,
        scopeRef: input.scopeRef ?? null, bps: input.bps, fixedCents: input.fixedCents ?? 0, priority: input.priority,
        effectiveFrom: input.effectiveFrom ?? new Date(), note: input.note?.trim() || null, createdBy: actor.userId,
      },
      select: SELECT,
    });
    await audit(tx, actor, "commission.create", "CommissionRule", row.id, { after: { ...row, effectiveFrom: row.effectiveFrom.toISOString(), createdAt: undefined } });
    return row;
  });
}

/** An edit: version n+1 takes effect now, and version n's window closes at the same instant. */
export async function reviseRule(actor: Actor, id: string, change: Partial<Pick<RuleInput, "bps" | "fixedCents" | "priority" | "note">>, now = new Date()) {
  assertTenantWide(actor, "commissionRule", "write");
  return prisma.$transaction(async (tx) => {
    const current = await tx.commissionRule.findFirst({ where: { ...whereFor(actor, "commissionRule", "write"), id }, select: { ...SELECT, tenantId: true } });
    if (!current) throw new ForbiddenError("commissionRule", "write");
    if (current.effectiveTo) throw new CommissionRuleError("Only the current version of a rule can be revised.", 409);
    const next = {
      kind: current.kind as RuleKind, scope: current.scope as RuleScope, scopeRef: current.scopeRef,
      bps: change.bps ?? current.bps, fixedCents: change.fixedCents ?? current.fixedCents,
      priority: change.priority ?? current.priority, note: change.note === undefined ? current.note : change.note,
    };
    assertShape(next);
    await tx.commissionRule.update({
      /* tenant-scope: the row loaded above through whereFor(commissionRule, write). The trigger allows only this — closing the window. */
      where: { id: current.id }, data: { effectiveTo: now }, select: { id: true },
    });
    const row = await tx.commissionRule.create({
      data: { tenantId: current.tenantId, ruleKey: current.ruleKey, version: current.version + 1, ...next, effectiveFrom: now, createdBy: actor.userId },
      select: SELECT,
    });
    await audit(tx, actor, "commission.revise", "CommissionRule", row.id, {
      before: { ruleKey: current.ruleKey, version: current.version, bps: current.bps, fixedCents: current.fixedCents, priority: current.priority },
      after: { ruleKey: row.ruleKey, version: row.version, bps: row.bps, fixedCents: row.fixedCents, priority: row.priority },
    });
    return row;
  });
}

export type RateContext = { propertyId?: string | null; propertyKind?: string | null; sponsorId?: string | null };

/**
 * The rule that applies for each kind, at `at` — highest priority first,
 * latest version on a tie. Called ONLY at contract time (ledger.ts); the
 * answer is frozen, never asked again.
 */
export async function resolveRates(
  tx: Prisma.TransactionClient, operatorTenantId: string, ctx: RateContext, at: Date, kinds: readonly RuleKind[] = RULE_KINDS,
): Promise<Record<RuleKind, AppliedRule>> {
  const scopes: Prisma.CommissionRuleWhereInput[] = [{ scope: "GLOBAL" }];
  if (ctx.propertyKind) scopes.push({ scope: "PROPERTY_KIND", scopeRef: ctx.propertyKind });
  if (ctx.propertyId) scopes.push({ scope: "PROPERTY", scopeRef: ctx.propertyId });
  if (ctx.sponsorId) scopes.push({ scope: "SPONSOR", scopeRef: ctx.sponsorId });
  const rows = await tx.commissionRule.findMany({
    where: {
      tenantId: operatorTenantId, kind: { in: [...kinds] }, effectiveFrom: { lte: at },
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] }, { OR: scopes }],
    },
    select: { id: true, ruleKey: true, version: true, kind: true, bps: true, fixedCents: true, priority: true },
    orderBy: [{ priority: "desc" }, { version: "desc" }, { createdAt: "desc" }],
  });
  const out = Object.fromEntries(RULE_KINDS.map((k) => [k, NO_RULE])) as Record<RuleKind, AppliedRule>;
  for (const kind of kinds) {
    const r = rows.find((x) => x.kind === kind);
    if (r) out[kind] = { ruleId: r.id, ruleKey: r.ruleKey, version: r.version, bps: r.bps, fixedCents: r.fixedCents };
  }
  return out;
}
