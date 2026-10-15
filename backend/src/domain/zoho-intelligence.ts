/**
 * Intelligence into Zoho — 3S7-INT-01 (documentation/SponsorX-Zoho-Field-Mapping.md §12.3).
 *
 * The sales team works in Zoho, so each sponsor's Account carries SponsorX's
 * renewal score and recommended next action, from the same renewal advice
 * the sponsor's hub shows (sponsor-intelligence.ts buildRenewals):
 *
 *   SponsorX_Renewal_Score  0–100: the share of the promise the campaign that
 *                           matters most is on course to deliver (capped);
 *                           blank when no campaign ends within 45 days or
 *                           ended within 30;
 *   SponsorX_Next_Action    the advice in words, naming the campaign and the
 *                           first reason ("Renew: Fall push — On course to
 *                           deliver 27,000 of the 30,000 impressions promised
 *                           (90%).").
 *
 * The campaign that matters most is the soonest still to end, else the one
 * that ended most recently.
 *
 * AUTOMATIC (user, 2026-10-15: automation first). Nightly, after the
 * forecasts, every sponsor already in Zoho whose values changed gets a
 * `zoho.pushIntelligence` job — only those, so Zoho is not written to for
 * nothing. The job writes the two fields by the Account's id and records
 * what it sent. Zoho down: the job waits in the outbox like every Zoho job.
 * Zoho never touches a request path.
 */
import { createHash } from "node:crypto";

import { enqueue } from "../db/outbox";
import type { PrismaClient } from "../generated/prisma/client";
import { tenantsWithout } from "./model-registry";
import { sponsorRenewals } from "./renewal-advice";
import type { PushOutcome, SyncCtx } from "./zoho-sync";

export const ZOHO_RENEWAL_SCORE = "SponsorX_Renewal_Score";
export const ZOHO_NEXT_ACTION = "SponsorX_Next_Action";
const NEXT_ACTION_MAX = 255;
const ADVICE_WORDS = { RENEW: "Renew", ADJUST: "Renew with changes", LET_END: "Let it end" } as const;

export type ZohoIntelligence = { [ZOHO_RENEWAL_SCORE]: number | null; [ZOHO_NEXT_ACTION]: string };

/** What a sponsor's Account should say now. */
export async function zohoIntelligenceFor(db: PrismaClient, tenantId: string, sponsorId: string, now: Date): Promise<ZohoIntelligence> {
  const renewals = await sponsorRenewals(db, tenantId, sponsorId, now);
  const upcoming = renewals.filter((r) => !r.ended);
  const pick = upcoming[0] ?? [...renewals].reverse()[0];
  if (!pick) return { [ZOHO_RENEWAL_SCORE]: null, [ZOHO_NEXT_ACTION]: "No campaign ending soon." };
  const text = `${ADVICE_WORDS[pick.recommendation]}: ${pick.campaignName} — ${pick.reasons[0]}`;
  return {
    [ZOHO_RENEWAL_SCORE]: Math.round(pick.renewalScore * 100),
    [ZOHO_NEXT_ACTION]: text.length > NEXT_ACTION_MAX ? `${text.slice(0, NEXT_ACTION_MAX - 1)}…` : text,
  };
}

export const intelHash = (v: ZohoIntelligence) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export type ZohoIntelReport = { tenants: number; sponsors: number; queued: number; skipped: string[] };

/** Nightly: queue a push for every sponsor in Zoho whose values changed since the last one sent. */
export async function queueZohoIntelligence(db: PrismaClient, now: Date, opts: { tenantId?: string; skipTenants?: string[] } = {}): Promise<ZohoIntelReport> {
  /* 3S8-OPS-01 — a tenant with Zoho intelligence switched off sends nothing. */
  const skip = new Set([...(opts.skipTenants ?? []), ...(await tenantsWithout(db, "zohoIntelligence"))]);
  const tenants = opts.tenantId ? [opts.tenantId] : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const report: ZohoIntelReport = { tenants: 0, sponsors: 0, queued: 0, skipped: tenants.filter((t) => skip.has(t)) };
  for (const tenantId of tenants.filter((t) => !skip.has(t))) {
    report.tenants += 1;
    const sponsors = await db.sponsor.findMany({
      where: { tenantId, zohoAccountId: { not: null } },
      select: { id: true, zohoIntelHash: true },
      orderBy: { id: "asc" },
    });
    for (const s of sponsors) {
      report.sponsors += 1;
      if (intelHash(await zohoIntelligenceFor(db, tenantId, s.id, now)) === s.zohoIntelHash) continue;
      await db.$transaction((tx) => enqueue(tx, tenantId, "zoho.pushIntelligence", { sponsorId: s.id }));
      report.queued += 1;
    }
  }
  return report;
}

/** `zoho.pushIntelligence` — write the two fields on the sponsor's Account, and record what was sent. */
export async function pushIntelligence(ctx: SyncCtx, tenantId: string, sponsorId: string): Promise<PushOutcome> {
  const s = await ctx.db.sponsor.findFirst({ where: { id: sponsorId, tenantId }, select: { id: true, zohoAccountId: true, zohoIntelHash: true } });
  if (!s) return { status: "skipped", reason: "sponsor not found" };
  if (!s.zohoAccountId) return { status: "skipped", reason: "sponsor not in Zoho yet" };
  const values = await zohoIntelligenceFor(ctx.db, tenantId, s.id, ctx.now?.() ?? new Date());
  const hash = intelHash(values);
  if (hash === s.zohoIntelHash) return { status: "unchanged", zohoId: s.zohoAccountId };
  const r = await ctx.zoho.update("Accounts", s.zohoAccountId, values);
  await ctx.db.sponsor.update({
    /* tenant-scope: the sponsor just found by id in this tenant. */
    where: { id: s.id }, data: { zohoIntelHash: hash, zohoIntelPushedAt: ctx.now?.() ?? new Date() }, select: { id: true },
  });
  return { status: "pushed", zohoId: r.id, action: r.action };
}
