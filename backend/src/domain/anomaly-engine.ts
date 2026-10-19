/**
 * Anomaly detection — 3S8-DATA-01 (documentation/SponsorX-Anomalies.md), read by
 * the data quality console (3S8-FE-01, /admin/intelligence/anomalies;
 * contract: frontend/src/lib/anomalies-live.ts). The rules are anomaly-rules.ts.
 *
 * NIGHTLY, in the worker's chain: the last LOOKBACK_DAYS of metric entries,
 * published posts, link clicks and redemptions are run through the rules. A
 * flag is kept once (unique fingerprint per tenant), however many nights it
 * is seen. The clear-cut case — the same post counted twice — is excluded
 * from reporting automatically, with the reason; everything else waits for a
 * person (user, 2026-10-15: automation first, held when judgement is needed).
 *
 * A DISPOSITION is one of confirmed_issue / false_positive /
 * excluded_from_reporting, always with a note, audited. A person's decision
 * is final; a person may replace SponsorX's automatic one. Excluding a flag
 * records the decision and flags the figure (user, 2026-10-15); taking
 * excluded figures out of sponsor reports is a later task.
 *
 * WHO. BTG admins and campaign managers (`anomaly`, RBAC matrix §34).
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import {
  botFlags, duplicateFlags, LOOKBACK_DAYS, manualFlags, redemptionFlags, repeatFanFlags, spikeFlags,
  type AnomalyKind, type Flag,
} from "./anomaly-rules";
import { activeModel, assertFeature, tenantsWithout } from "./model-registry";

export const ANOMALY_KINDS: readonly AnomalyKind[] = ["spike", "duplicate", "bot", "redemption", "manual_entry"];
export const OUTCOMES = ["confirmed_issue", "false_positive", "excluded_from_reporting"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const NOTE_MIN = 8;
export const NOTE_MAX = 2000;
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

export class AnomalyNotFoundError extends Error {
  readonly status = 404;
  readonly code = "anomaly_not_found";
  constructor() {
    super("No such anomaly in this tenant.");
    this.name = "AnomalyNotFoundError";
  }
}

export class AnomalyDecidedError extends Error {
  readonly status = 409;
  readonly code = "anomaly_decided";
  constructor() {
    super("A person has already decided this anomaly; the record stands.");
    this.name = "AnomalyDecidedError";
  }
}

export class AnomalyNoteError extends Error {
  readonly status = 422;
  readonly code = "anomaly_note";
  constructor() {
    super(`Every outcome needs a note of ${NOTE_MIN} to ${NOTE_MAX.toLocaleString("en-US")} characters.`);
    this.name = "AnomalyNoteError";
  }
}

/** Every flag the rules raise for one tenant over the lookback. */
async function detect(tenantId: string, now: Date, t: Record<string, number>): Promise<Flag[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const [metrics, posts, clicks, redeems, repeatFans] = await Promise.all([
    prisma.metricDaily.findMany({
      /* tenant-scope: explicit — this tenant's metric entries in the lookback. */
      where: { tenantId, day: { gte: since } },
      select: { deliverableId: true, day: true, source: true, views: true, engagements: true, deliverable: { select: { title: true } } },
    }),
    prisma.deliverable.findMany({
      /* tenant-scope: explicit — this tenant's published posts (all time: a duplicate of an old post still counts twice). */
      where: { tenantId, publishedUrl: { not: null } },
      select: { id: true, title: true, publishedUrl: true, publishedAt: true, order: { select: { campaignId: true, campaign: { select: { name: true } } } } },
    }),
    prisma.$queryRawUnsafe<Array<{ linkId: string; at: Date; campaignId: string; campaignName: string }>>(
      /* tenant-scope: explicit — this tenant's link clicks in the lookback, with their campaign. */
      `SELECT e."linkId", e.at, o."campaignId", c.name AS "campaignName"
         FROM "LinkEvent" e JOIN "TrackingLink" l ON l.id = e."linkId" JOIN "Deliverable" d ON d.id = l."deliverableId"
         JOIN "CampaignOrder" o ON o.id = d."orderId" JOIN "Campaign" c ON c.id = o."campaignId"
        WHERE e."tenantId" = $1 AND e.at >= $2`,
      tenantId, since,
    ),
    prisma.$queryRawUnsafe<Array<{ rewardId: string; offerText: string; at: Date }>>(
      /* tenant-scope: explicit — this tenant's redemptions in the lookback. */
      `SELECT t."rewardId", r."offerText", e.at
         FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId"
        WHERE e."tenantId" = $1 AND e.type = 'REDEEM' AND e.at >= $2`,
      tenantId, since,
    ),
    /* One fan, one reward, many redemptions — grouped in the database, so the
       fan's address is compared there and never selected (fan-pii.test.ts). */
    prisma.$queryRawUnsafe<Array<{ rewardId: string; offerText: string; n: bigint; firstEventId: string; firstAt: Date }>>(
      /* tenant-scope: explicit — this tenant's redemptions in the lookback, per fan. */
      `SELECT t."rewardId", r."offerText", count(*) AS n, min(e.id) AS "firstEventId", min(e.at) AS "firstAt"
         FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId"
        WHERE e."tenantId" = $1 AND e.type = 'REDEEM' AND e.at >= $2 AND e."fanEmail" IS NOT NULL
        GROUP BY t."rewardId", r."offerText", lower(trim(e."fanEmail"))
       HAVING count(*) >= $3`,
      tenantId, since, t.repeatFanRedeems!,
    ),
  ]);
  const entries = metrics.map((m) => ({ deliverableId: m.deliverableId, title: m.deliverable.title, day: m.day, source: m.source, views: m.views, engagements: m.engagements }));
  return [
    ...spikeFlags(entries, t.spikeFactor),
    ...duplicateFlags(posts.map((p) => ({
      deliverableId: p.id, title: p.title, publishedUrl: p.publishedUrl!, publishedAt: p.publishedAt, campaignId: p.order.campaignId, campaignName: p.order.campaign.name,
    }))),
    ...botFlags(clicks, t.botClicks),
    ...redemptionFlags(redeems, t.burstRedeems),
    ...repeatFanFlags(repeatFans.map((r) => ({ ...r, n: Number(r.n) })), t.repeatFanRedeems),
    ...manualFlags(entries, t.manualFactor),
  ];
}

export type AnomalyReport = { tenants: number; flagged: number; excludedAutomatically: number; skipped: string[] };

/** The nightly run, for every tenant or one. New flags are kept; the clear-cut ones are decided automatically and audited. */
export async function runAnomalies(db: PrismaClient, now: Date, opts: { tenantId?: string; skipTenants?: string[] } = {}): Promise<AnomalyReport> {
  /* 3S8-OPS-01 — a tenant with anomaly detection switched off is not checked. */
  const skip = new Set([...(opts.skipTenants ?? []), ...(await tenantsWithout(db, "anomalies"))]);
  const tenants = opts.tenantId ? [opts.tenantId] : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const report: AnomalyReport = { tenants: 0, flagged: 0, excludedAutomatically: 0, skipped: tenants.filter((t) => skip.has(t)) };
  for (const tenantId of tenants.filter((t) => !skip.has(t))) {
    report.tenants += 1;
    /* 3S8-BE-01 — the tenant's active settings, and the version stamp on every flag raised with them. */
    const model = await activeModel(db, tenantId, "anomalies");
    const flags = await detect(tenantId, now, model.t);
    const known = new Set((flags.length ? await db.anomaly.findMany({
      where: { tenantId, fingerprint: { in: flags.map((f) => f.fingerprint) } }, select: { fingerprint: true },
    }) : []).map((a) => a.fingerprint));
    for (const f of flags.filter((x) => !known.has(x.fingerprint))) {
      await db.$transaction(async (tx) => {
        const made = await tx.anomaly.createMany({
          data: [{
            tenantId, kind: f.kind, severity: f.severity, ruleId: f.ruleId, ruleVersion: model.stamp,
            subjectType: f.subject.type, subjectId: f.subject.id, subjectName: f.subject.name, fingerprint: f.fingerprint,
            evidence: f.evidence as unknown as Prisma.InputJsonValue, detectedAt: now,
            ...(f.auto ? { outcome: f.auto.outcome, note: f.auto.note, automatic: true, decidedAt: now } : {}),
          }],
          skipDuplicates: true,
        });
        if (!made.count) return;
        report.flagged += 1;
        if (f.auto) {
          const row = await tx.anomaly.findFirstOrThrow({ where: { tenantId, fingerprint: f.fingerprint }, select: { id: true } });
          await audit(tx, SYSTEM(tenantId), AUDIT_ACTIONS.anomaly.autoDispose, "Anomaly", row.id, { after: { outcome: f.auto.outcome, note: f.auto.note, ruleId: f.ruleId } });
          report.excludedAutomatically += 1;
        }
      });
    }
    await db.anomalyScan.upsert({
      /* tenant-scope: keyed by tenantId (unique). */
      where: { tenantId }, create: { tenantId, ranAt: now }, update: { ranAt: now }, select: { tenantId: true },
    });
  }
  return report;
}

/* ───────────────────────────── reads and decisions ───────────────────────────── */

const ROLE_WORDS: Record<string, string> = { SUPER_ADMIN: "Super admin", BTG_ADMIN: "BTG admin", CAMPAIGN_MGR: "Campaign manager" };

/**
 * Who decided, in words a reader knows: "email (Role)", or "a former user"
 * once the row is gone. One lookup for a page of rows; shared with the
 * attribution queue (3S6-BE-04), so a decider is never a raw user id.
 */
export async function peopleWords(tenantId: string, ids: readonly (string | null | undefined)[]): Promise<(id: string | null | undefined) => string | null> {
  const want = [...new Set(ids.filter((u): u is string => !!u))];
  const users = new Map(
    want.length
      ? (await prisma.user.findMany({ where: { tenantId, id: { in: want } }, select: { id: true, email: true, roles: true } })).map((u) => [u.id, u])
      : [],
  );
  return (id) => {
    if (!id) return null;
    const u = users.get(id);
    if (!u) return "a former user";
    const role = u.roles.map((x) => ROLE_WORDS[x]).find(Boolean);
    return role ? `${u.email} (${role})` : u.email;
  };
}

const ROW = {
  id: true, kind: true, severity: true, ruleId: true, ruleVersion: true, subjectType: true, subjectId: true, subjectName: true,
  evidence: true, detectedAt: true, outcome: true, note: true, decidedBy: true, automatic: true, decidedAt: true,
} as const;
type Row = { id: string; kind: string; severity: string; ruleId: string; ruleVersion: string; subjectType: string; subjectId: string; subjectName: string;
  evidence: unknown; detectedAt: Date; outcome: string | null; note: string | null; decidedBy: string | null; automatic: boolean; decidedAt: Date | null };

async function toViews(tenantId: string, rows: readonly Row[]) {
  const users = new Map((await prisma.user.findMany({
    where: { tenantId, id: { in: rows.map((r) => r.decidedBy).filter((u): u is string => !!u) } }, select: { id: true, email: true, roles: true },
  })).map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = r.decidedBy ? users.get(r.decidedBy) : undefined;
    const role = u?.roles.map((x) => ROLE_WORDS[x]).find(Boolean);
    const by = r.automatic ? "SponsorX (automatic)" : u ? (role ? `${u.email} (${role})` : u.email) : "a former user";
    return {
      id: r.id, kind: r.kind as AnomalyKind, severity: r.severity as "high" | "medium" | "low",
      subject: { type: r.subjectType as "campaign" | "athlete" | "reward" | "metric_stream", id: r.subjectId, name: r.subjectName },
      detectedAt: r.detectedAt.toISOString(), rule: { id: r.ruleId, version: r.ruleVersion },
      evidence: r.evidence as Array<{ label: string; value: string }>,
      disposition: r.outcome && r.decidedAt ? { outcome: r.outcome as Outcome, note: r.note ?? "", by, at: r.decidedAt.toISOString(), automatic: r.automatic } : null,
    };
  });
}

/** GET /intelligence/anomalies?tab=open|resolved&kind&page&size — open: highest severity first, newest first; resolved: newest decision first. */
export async function anomalyDesk(actor: Actor, q: { tab: "open" | "resolved"; kind?: AnomalyKind; page: PageRequest }) {
  assertTenantWide(actor, "anomaly", "read");
  await assertFeature(prisma, actor.tenantId, "anomalies");
  const tenantId = actor.tenantId;
  const [all, scan] = await Promise.all([
    prisma.anomaly.findMany({ where: { tenantId }, select: { id: true, kind: true, severity: true, ruleId: true, outcome: true, detectedAt: true, decidedAt: true } }),
    prisma.anomalyScan.findFirst({ where: { tenantId }, select: { ranAt: true } }),
  ]);
  const open = all.filter((a) => !a.outcome);
  const openByKind = Object.fromEntries(ANOMALY_KINDS.map((k) => [k, open.filter((a) => a.kind === k).length])) as Record<AnomalyKind, number>;
  const shown = (q.tab === "resolved" ? all.filter((a) => a.outcome) : open)
    .filter((a) => !q.kind || a.kind === q.kind)
    .sort((a, b) => q.tab === "resolved"
      ? (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0) || a.id.localeCompare(b.id)
      : SEVERITY_RANK[a.severity]! - SEVERITY_RANK[b.severity]! || b.detectedAt.getTime() - a.detectedAt.getTime() || a.ruleId.localeCompare(b.ruleId) || a.id.localeCompare(b.id));
  const ids = shown.slice(q.page.skip, q.page.skip + q.page.take).map((a) => a.id);
  const rows = ids.length ? await prisma.anomaly.findMany({ where: { tenantId, id: { in: ids } }, select: ROW }) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const page: PageInfo = { page: q.page.page, size: q.page.size, total: shown.length, pages: Math.max(1, Math.ceil(shown.length / q.page.size)) };
  return {
    asOf: (scan?.ranAt ?? new Date(0)).toISOString(),
    counts: { open: open.length, resolved: all.length - open.length, openByKind },
    anomalies: await toViews(tenantId, ids.map((id) => byId.get(id)!)),
    page,
  };
}

/** POST /intelligence/anomalies/:id/disposition — a person decides, with a note. Final; it may replace SponsorX's automatic decision. */
export async function disposeAnomaly(actor: Actor, id: string, input: { outcome: Outcome; note: string }, now = new Date()) {
  assertTenantWide(actor, "anomaly", "write");
  await assertFeature(prisma, actor.tenantId, "anomalies");
  const note = input.note.trim();
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) throw new AnomalyNoteError();
  const row = await prisma.$transaction(async (tx) => {
    const a = await tx.anomaly.findFirst({ where: { tenantId: actor.tenantId, id }, select: { id: true, outcome: true, automatic: true, note: true } });
    if (!a) throw new AnomalyNotFoundError();
    if (a.outcome && !a.automatic) throw new AnomalyDecidedError();
    await tx.anomaly.update({
      where: { id: a.id, tenantId: actor.tenantId },
      data: { outcome: input.outcome, note, decidedBy: actor.userId, automatic: false, decidedAt: now },
      select: { id: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.anomaly.dispose, "Anomaly", a.id, {
      before: a.outcome ? { outcome: a.outcome, automatic: true } : undefined, after: { outcome: input.outcome, note },
    });
    return tx.anomaly.findFirstOrThrow({ where: { tenantId: actor.tenantId, id: a.id }, select: ROW });
  });
  return { anomaly: (await toViews(actor.tenantId, [row]))[0]! };
}
