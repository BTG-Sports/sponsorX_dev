/**
 * The nightly fact check — 3S1-QA-01 (documentation/SponsorX-Fact-Ledger.md §9).
 *
 * Every night the worker runs the two checks the ledger already has, across
 * every tenant, read-only:
 *   - the daily summaries equal the sum of the facts (checkFactSummaries);
 *   - the facts agree with the app's own records (checkFactsAgainstApp).
 * Each night's result is kept (FactCheckRun), so a tenant's BTG admins are
 * emailed ONCE when its figures stop matching and ONCE when they match again —
 * never every night in between — and the admin portal's integration health
 * shows the latest result and since when a tenant has been failing.
 *
 * ONE RUN A DAY. The worker's timer is hourly; the check runs on the first
 * tick at or after FACT_CHECK_HOUR_UTC, and the unique `day` makes a second
 * worker, or a restart, find the day already taken. A run that started and
 * never finished (the worker died) is taken over an hour later; one that
 * could not run (its error recorded) is tried again on the next tick.
 *
 * EMAILS ARE SWITCHED ON PER ENVIRONMENT (FACT_CHECK_EMAILS), once that
 * environment's history is filled (3S1-OPS-04). The check runs and is
 * recorded either way. A check that could not run (a database error) is
 * recorded with its error and logged; it is never emailed as a mismatch.
 */
import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { checkFactSummaries } from "./facts";
import { checkFactsAgainstApp } from "./fact-check";
import type { FactMeasure } from "./fact-rules";
import { appUrl, btgAdmins, tell, usd } from "./order-mail";

type Db = PrismaClient;

/** 19:00 UTC — 3 am in Manila, outside BTG's working day and after the 12:00 UTC deploy. */
export const FACT_CHECK_HOUR_UTC = 19;
/** A run that started this long ago and never finished is taken over. */
const STALE_RUN_MS = 60 * 60_000;
/** At most this many differences are kept per run; the count is always exact. */
const KEEP_DIFFERENCES = 500;
/** The admin portal and the email show at most this many, then "and N more". */
const SHOW = 20;

/** One stored difference. `check`: which of the two checks found it. */
export type StoredDifference = {
  check: "summaries" | "app";
  tenantId: string;
  campaignId: string | null;
  measure: FactMeasure;
  /** For "app": the app's own figure. For "summaries": the summary's total. */
  app: number;
  facts: number;
  /** For "summaries": the day the totals disagree on. */
  day?: string;
};

const WORDS: Record<FactMeasure, string> = {
  booked_sell_cents: "amount booked (sponsor price)",
  booked_compensation_cents: "athlete pay booked",
  cancelled_sell_cents: "amount cancelled (sponsor price)",
  cancelled_compensation_cents: "athlete pay cancelled",
  deliverables_due: "deliverables due",
  deliverables_published: "deliverables published",
  deliverables_verified: "deliverables verified",
  revisions_requested: "drafts sent back",
  views_verified_api: "views (verified, API)",
  views_verified_manual: "views (verified by BTG)",
  views_self_reported: "views (self-reported)",
  views_estimated: "views (estimated)",
  views_attributed: "views (attributed)",
  engagements_verified_api: "engagements (verified, API)",
  engagements_verified_manual: "engagements (verified by BTG)",
  engagements_self_reported: "engagements (self-reported)",
  engagements_estimated: "engagements (estimated)",
  engagements_attributed: "engagements (attributed)",
  metric_corrections: "view corrections",
  earnings_paid_cents: "athlete pay paid out",
  ad_slot_sold_cents: "NEXT ad slots sold",
  invoiced_cents: "amount invoiced",
  invoice_paid_cents: "invoices paid",
  marketplace_gross_cents: "marketplace sales (gross)",
  marketplace_net_cents: "marketplace sales (net)",
  marketplace_refunded_cents: "marketplace refunds sent",
};
const amount = (measure: FactMeasure, n: number) => (measure.endsWith("_cents") ? usd(n) : n.toLocaleString("en-US"));

/** A difference in words, e.g. "Fall tacos — amount booked (sponsor price): the app says $200.00, the report figures say $0.00". */
export function inWords(d: StoredDifference, campaignName: string | null): string {
  const where = d.campaignId ? campaignName ?? "a campaign" : "Marketplace";
  return d.check === "app"
    ? `${where} — ${WORDS[d.measure]}: the app says ${amount(d.measure, d.app)}, the report figures say ${amount(d.measure, d.facts)}`
    : `${where} — ${WORDS[d.measure]} on ${d.day}: the day's total is ${amount(d.measure, d.app)} but its facts add up to ${amount(d.measure, d.facts)}`;
}

const dayOf = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);

export type NightlyOutcome =
  | { status: "not-yet" | "already-ran" }
  | { status: "ran"; day: string; ok: boolean; differenceCount: number; failingTenants: string[]; emailsSent: number }
  | { status: "failed"; day: string; error: string };

/** The finished runs before `day`, newest first: what each tenant's state was. */
async function previousRuns(db: Db, day: Date) {
  return db.factCheckRun.findMany({
    /* tenant-scope: platform-wide runs; each tenant's part is read from failingTenants by the caller. */
    where: { day: { lt: day }, finishedAt: { not: null }, error: null },
    select: { day: true, failingTenants: true }, orderBy: { day: "desc" }, take: 120,
  });
}

/** The first day of the unbroken run of failing nights ending at `runs[0]` for this tenant, or null. */
function failingSince(runs: Array<{ day: Date; failingTenants: string[] }>, tenantId: string): Date | null {
  let since: Date | null = null;
  for (const r of runs) {
    if (!r.failingTenants.includes(tenantId)) break;
    since = r.day;
  }
  return since;
}

async function campaignNames(db: Db | Prisma.TransactionClient, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.campaign.findMany({
    /* tenant-scope: this tenant's own campaigns, named by id. */
    where: { tenantId, id: { in: ids } }, select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Run tonight's check, if it is time and nobody has. `tenantId` limits the
 * check to one tenant (tests, a support run); the worker checks every tenant.
 */
export async function runNightlyFactCheck(
  db: Db,
  now: Date,
  opts: { emails: boolean; tenantId?: string; hourUtc?: number },
): Promise<NightlyOutcome> {
  if (now.getUTCHours() < (opts.hourUtc ?? FACT_CHECK_HOUR_UTC)) return { status: "not-yet" };
  const day = dayOf(now);
  const iso = day.toISOString().slice(0, 10);
  const claimed = await db.$queryRawUnsafe<Array<{ id: string }>>(
    /* tenant-scope: platform-wide — one run per day for every tenant. */
    `INSERT INTO "FactCheckRun" (id, day, "startedAt") VALUES ($1, $2::date, $3)
     ON CONFLICT (day) DO UPDATE SET "startedAt" = EXCLUDED."startedAt", "finishedAt" = NULL
       WHERE ("FactCheckRun"."finishedAt" IS NULL AND "FactCheckRun"."startedAt" < $4) OR "FactCheckRun".error IS NOT NULL
     RETURNING id`, randomUUID(), iso, now, new Date(now.getTime() - STALE_RUN_MS));
  const runId = claimed[0]?.id;
  if (!runId) return { status: "already-ran" };

  const started = Date.now();
  let summaries: Awaited<ReturnType<typeof checkFactSummaries>>;
  let app: Awaited<ReturnType<typeof checkFactsAgainstApp>>;
  try {
    [summaries, app] = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return [await checkFactSummaries(tx, { tenantId: opts.tenantId }), await checkFactsAgainstApp(tx, { tenantId: opts.tenantId })] as const;
    }, { timeout: 10 * 60_000, maxWait: 30_000 });
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    await db.factCheckRun.update({
      /* tenant-scope: the platform-wide run this call just claimed. */
      where: { id: runId }, data: { finishedAt: new Date(), error: message, durationMs: Date.now() - started }, select: { id: true },
    });
    return { status: "failed", day: iso, error: message };
  }

  const differences: StoredDifference[] = [
    ...summaries.differences.map((d) => ({ check: "summaries" as const, tenantId: d.tenantId, campaignId: d.campaignId || null, measure: d.measure, app: d.summary, facts: d.facts, day: d.day })),
    ...app.differences.map((d) => ({ check: "app" as const, ...d })),
  ].sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  const failingTenants = [...new Set(differences.map((d) => d.tenantId))].sort();

  const before = await previousRuns(db, day);
  const inScope = (t: string) => !opts.tenantId || t === opts.tenantId;
  const wasFailing = new Set((before[0]?.failingTenants ?? []).filter(inScope));
  const startedFailing = failingTenants.filter((t) => !wasFailing.has(t));
  const recovered = [...wasFailing].filter((t) => !failingTenants.includes(t));

  let emailsSent = 0;
  await db.$transaction(async (tx) => {
    await tx.factCheckRun.update({
      /* tenant-scope: the platform-wide run this call just claimed. */
      where: { id: runId },
      data: {
        finishedAt: new Date(), error: null, summariesOk: summaries.ok, appOk: app.ok, differenceCount: differences.length, failingTenants,
        differences: differences.slice(0, KEEP_DIFFERENCES) as unknown as Prisma.InputJsonValue, durationMs: Date.now() - started,
      },
      select: { id: true },
    });
    if (!opts.emails) return;
    const healthUrl = appUrl("/admin/integrations");
    for (const tenantId of startedFailing) {
      const mine = differences.filter((d) => d.tenantId === tenantId);
      const names = await campaignNames(tx, tenantId, [...new Set(mine.map((d) => d.campaignId).filter((c): c is string => Boolean(c)))]);
      const lines = mine.slice(0, SHOW).map((d) => `• ${inWords(d, d.campaignId ? names.get(d.campaignId) ?? null : null)}`);
      if (mine.length > SHOW) lines.push(`• …and ${mine.length - SHOW} more`);
      for (const u of await btgAdmins(tx, tenantId)) {
        await tell(tx, { tenantId, email: u.email }, "facts.checkFailed", `${iso}:${tenantId}`, { count: String(mine.length), lines: lines.join("\n"), healthUrl });
        emailsSent++;
      }
    }
    for (const tenantId of recovered) {
      const since = failingSince(before, tenantId);
      for (const u of await btgAdmins(tx, tenantId)) {
        await tell(tx, { tenantId, email: u.email }, "facts.checkRecovered", `${iso}:${tenantId}`, { since: since ? since.toISOString().slice(0, 10) : "", healthUrl });
        emailsSent++;
      }
    }
  });
  return { status: "ran", day: iso, ok: differences.length === 0, differenceCount: differences.length, failingTenants, emailsSent };
}

export type FactCheckStatus = {
  /** When the last check finished; null if it has never run. */
  lastRunAt: string | null;
  /** Whether this tenant's figures matched at the last check; null if it has never run. */
  matches: boolean | null;
  /** The first night of the current run of failing nights, or null. */
  failingSince: string | null;
  /** This tenant's differences at the last check, in words, at most 20. */
  differences: Array<{ campaign: string | null; measure: string; what: string; app: number; facts: number }>;
  differenceCount: number;
  /** Whether BTG's admins are emailed in this environment. */
  emails: boolean;
  /** The last check could not run: its error, for the developers. */
  lastError: string | null;
};

/** What the admin portal shows for one tenant — read-only. */
export async function factCheckStatus(db: Db, tenantId: string, emails: boolean): Promise<FactCheckStatus> {
  const latest = await db.factCheckRun.findFirst({
    /* tenant-scope: platform-wide runs; only this tenant's differences are returned below. */
    where: { finishedAt: { not: null } }, orderBy: { day: "desc" },
    select: { day: true, finishedAt: true, error: true, failingTenants: true, differences: true },
  });
  if (!latest) return { lastRunAt: null, matches: null, failingSince: null, differences: [], differenceCount: 0, emails, lastError: null };
  const ran = await previousRuns(db, new Date(latest.day.getTime() + 86_400_000));
  const mine = ((latest.differences ?? []) as unknown as StoredDifference[]).filter((d) => d.tenantId === tenantId);
  const names = await campaignNames(db, tenantId, [...new Set(mine.map((d) => d.campaignId).filter((c): c is string => Boolean(c)))]);
  const since = failingSince(ran, tenantId);
  return {
    lastRunAt: latest.finishedAt!.toISOString(),
    matches: latest.error ? null : !latest.failingTenants.includes(tenantId),
    failingSince: since ? since.toISOString().slice(0, 10) : null,
    differences: mine.slice(0, SHOW).map((d) => {
      const campaign = d.campaignId ? names.get(d.campaignId) ?? null : null;
      return { campaign, measure: d.measure, what: inWords(d, campaign), app: d.app, facts: d.facts };
    }),
    differenceCount: mine.length,
    emails,
    lastError: latest.error,
  };
}
