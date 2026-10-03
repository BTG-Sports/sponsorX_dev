/**
 * Sponsor briefs approved automatically; BTG handles only the exceptions —
 * P4-BE-11 (programme owner, 2026-10-03). The rules are brief-auto-rules.ts;
 * this is where they meet the database.
 *
 * WHEN. A brief a sponsor creates, or a DRAFT brief edited, is evaluated in
 * the same transaction (brief.ts). A daily sweep (`recheckHeldBriefs`)
 * re-checks DRAFT briefs held ONLY because too few athletes fit, since
 * athletes join later.
 *
 * APPROVED — every check passed — as the system (audited with no user and
 * `automatic: true`): DRAFT → QUALIFIED → APPROVED → CAMPAIGN_CREATED through
 * the same moves BTG's manual path makes (brief-moves.ts, campaign-create.ts)
 * — the follow-up CRM task, the campaign — with ONE Zoho Deal push, on the
 * campaign; `autoApproved` set; the sponsor's admins emailed once
 * ("Your request is approved — your campaign is being staffed").
 *
 * HELD — any check failed: the brief stays DRAFT with its reasons
 * (`heldKeys`, `heldReasons`) and when the hold began (`heldAt`). BTG's
 * campaign managers (BTG admins where the tenant has none) are emailed once
 * per hold — the idempotency key is the hold's start. A re-check that finds
 * the same reasons writes nothing; new reasons update the brief (audited) but
 * do not re-email: it is the same hold. The sponsor is told nothing about
 * why: their status reads "BTG is reviewing your request" either way.
 *
 * SAFETY. The brief's row lock is taken first (brief-moves.ts `lockBrief`):
 * a sponsor's edit and BTG's manual approve run one after the other, and the
 * second sees the first's result. Only a DRAFT brief that was never approved
 * automatically is evaluated, so a second run approves nothing more and an
 * edit after approval (refused anyway — brief.ts) cannot re-run it. Every
 * read is pinned to the brief's own tenant.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import { send } from "../lib/email";
import { applyBriefMove, lockBrief } from "./brief-moves";
import { createCampaignIn } from "./campaign-create";
import { startAutoStaffing } from "./auto-staffing";
import { lowestJobFloor, sponsorStanding } from "./brief-readiness-rules";
import { athleteFit } from "./matching";
import { autoApprovalHolds, holdKeys, type Hold } from "./brief-auto-rules";

type Tx = Prisma.TransactionClient;

const system = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const app = () => env.APP_URL.replace(/\/+$/, "");

export type AutoOutcome =
  | { outcome: "APPROVED"; campaignId: string }
  | { outcome: "HELD"; reasons: string[]; newHold: boolean }
  | { outcome: "SKIPPED"; why: string };

const BRIEF = {
  id: true, tenantId: true, sponsorId: true, state: true, objective: true, budget: true,
  startDate: true, endDate: true, sports: true, stateCodes: true, categories: true,
  autoApproved: true, heldAt: true, heldKeys: true, heldReasons: true,
  package: { select: { name: true, priceLow: true, athleteCountMin: true, athleteCountMax: true, lineItems: true, active: true } },
  sponsor: { select: { name: true, categories: true } },
} as const;
type BriefRow = Prisma.CampaignBriefGetPayload<{ select: typeof BRIEF }>;

/** The facts the rules need, read inside the transaction, in the brief's tenant. */
async function gather(tx: Tx, b: BriefRow) {
  const categories = [...new Set([...b.categories, ...b.sponsor.categories].filter(Boolean))];
  const [request, closure, jobs, fitCount] = await Promise.all([
    tx.inquiry.findFirst({
      /* tenant-scope: the brief's own tenant — its sponsor's latest request. */
      where: { tenantId: b.tenantId, sponsorId: b.sponsorId },
      select: { state: true },
      orderBy: { createdAt: "desc" },
    }),
    tx.accountClosure.findFirst({
      /* tenant-scope: the brief's own tenant — an open closure of its sponsor. */
      where: { tenantId: b.tenantId, subjectKind: "SPONSOR", subjectId: b.sponsorId, state: "CLOSED" },
      select: { id: true },
    }),
    tx.nilJob.findMany({
      /* tenant-scope: the brief's own tenant's NIL catalogue. */
      where: { tenantId: b.tenantId },
      select: { id: true, name: true, sellFloorEmerging: true, sellFloorCreator: true, sellFloorPremium: true },
    }),
    tx.athlete.count({
      /* tenant-scope: pinned to the brief's own tenant; athleteFit is the matching rule. */
      where: { tenantId: b.tenantId, ...athleteFit(b.sports.filter(Boolean), b.stateCodes.filter(Boolean), categories) },
    }),
  ]);
  return {
    sponsor: sponsorStanding({ latestRequestState: request?.state ?? null, closed: closure !== null }),
    lowestJobFloor: lowestJobFloor(jobs),
    fitCount,
  };
}

/**
 * Evaluate one brief, inside the caller's transaction: approve it as the
 * system, hold it for BTG, or leave it (not DRAFT, already approved, not in
 * this tenant). Takes the brief's row lock.
 */
export async function autoApproveOrHold(
  tx: Tx,
  tenantId: string,
  briefId: string,
  now = new Date(),
  via: "create" | "edit" | "sweep" = "create",
): Promise<AutoOutcome> {
  const state = await lockBrief(tx, briefId, tenantId);
  if (!state) return { outcome: "SKIPPED", why: "no such brief in this tenant" };
  if (state !== "DRAFT") return { outcome: "SKIPPED", why: `the brief is ${state}` };

  const b = await tx.campaignBrief.findFirst({
    /* tenant-scope: the brief just locked, by id and its own tenant. */
    where: { id: briefId, tenantId },
    select: BRIEF,
  });
  if (!b) return { outcome: "SKIPPED", why: "no such brief in this tenant" };
  if (b.autoApproved) return { outcome: "SKIPPED", why: "already approved automatically" };

  const facts = await gather(tx, b);
  const holds = autoApprovalHolds({
    objective: b.objective,
    startDate: b.startDate,
    endDate: b.endDate,
    budget: b.budget,
    package: b.package,
    lowestJobFloor: facts.lowestJobFloor,
    sponsor: facts.sponsor,
    fitCount: facts.fitCount,
    briefCategories: b.categories,
    sponsorCategories: b.sponsor.categories,
    now,
  });

  return holds.length === 0
    ? approveAutomatically(tx, b, facts.fitCount, via)
    : holdForBtg(tx, b, holds, now, via);
}

async function approveAutomatically(tx: Tx, b: BriefRow, fitCount: number, via: string): Promise<AutoOutcome> {
  const by = system(b.tenantId);
  const why = "Approved automatically: every safety check passed";
  const move = { id: b.id, tenantId: b.tenantId, objective: b.objective, sponsorName: b.sponsor.name };
  await applyBriefMove(tx, by, { ...move, state: "DRAFT" }, "QUALIFIED", { automatic: true, reason: why, pushDeal: false });
  await applyBriefMove(tx, by, { ...move, state: "QUALIFIED" }, "APPROVED", { automatic: true, reason: why, pushDeal: false });
  const campaign = await createCampaignIn(
    tx, by,
    { id: b.id, tenantId: b.tenantId, sponsorId: b.sponsorId, budget: b.budget, startDate: b.startDate, endDate: b.endDate, package: b.package },
    campaignName(b),
    { automatic: true },
  );

  await tx.campaignBrief.update({
    /* tenant-scope: the brief locked above, by id. */
    where: { id: b.id },
    data: { autoApproved: true, heldAt: null, heldKeys: [], heldReasons: [] },
    select: { id: true },
  });
  await audit(tx, by, "brief.autoApprove", "CampaignBrief", b.id, {
    before: { state: "DRAFT", ...(b.heldAt ? { heldReasons: b.heldReasons } : {}) },
    after: {
      state: "CAMPAIGN_CREATED", campaignId: campaign.id, automatic: true, via,
      checks: { readiness: "passed", package: b.package!.name, budget: "covers the package price", athletesFit: fitCount, sensitive: "none", sponsor: "good" },
    },
  });

  /* One email to the sponsor's admins, keyed on the brief: a re-run can't send a second. */
  const admins = await tx.user.findMany({
    /* tenant-scope: the brief's own tenant — its sponsor's admins. */
    where: { tenantId: b.tenantId, sponsorId: b.sponsorId, roles: { has: "SPONSOR_ADMIN" }, disabledAt: null },
    select: { id: true, email: true },
  });
  for (const u of admins) {
    await send(tx, b.tenantId, {
      template: "brief.autoApproved",
      to: u.email,
      idempotencyKey: `brief.autoApproved:${b.id}:${u.id}`,
      data: {
        sponsorName: b.sponsor.name,
        packageName: b.package?.name ?? "",
        campaignUrl: `${app()}/sponsor/campaigns/${campaign.id}`,
      },
    });
  }
  return { outcome: "APPROVED", campaignId: campaign.id };
}

/** "Acme Coffee · Local Blitz" — the campaign's working name; BTG can rename it. */
function campaignName(b: BriefRow): string {
  return `${b.sponsor.name} · ${b.package?.name ?? "Custom"}`.slice(0, 160);
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function holdForBtg(tx: Tx, b: BriefRow, holds: Hold[], now: Date, via: string): Promise<AutoOutcome> {
  const keys = holdKeys(holds);
  const reasons = holds.map((h) => h.text);
  const newHold = b.heldAt === null;
  const changed = newHold || !sameList(b.heldKeys, keys) || !sameList(b.heldReasons, reasons);
  if (!changed) return { outcome: "HELD", reasons, newHold: false };

  const heldAt = b.heldAt ?? now;
  await tx.campaignBrief.update({
    /* tenant-scope: the brief locked above, by id. */
    where: { id: b.id },
    data: { heldAt, heldKeys: keys, heldReasons: reasons },
    select: { id: true },
  });
  await audit(tx, system(b.tenantId), "brief.hold", "CampaignBrief", b.id, {
    before: newHold ? { state: "DRAFT" } : { state: "DRAFT", heldReasons: b.heldReasons },
    after: { state: "DRAFT", heldKeys: keys, heldReasons: reasons, via },
  });

  if (newHold) {
    /* BTG's campaign managers in the brief's tenant — its admins where it has
       none, so a hold never goes unseen. Once per hold: the key is its start. */
    const where = (role: "CAMPAIGN_MGR" | "BTG_ADMIN") => ({ tenantId: b.tenantId, roles: { has: role }, disabledAt: null });
    let staff = await tx.user.findMany({
      /* tenant-scope: the brief's own tenant — its campaign managers. */
      where: where("CAMPAIGN_MGR"), select: { id: true, email: true },
    });
    if (staff.length === 0) {
      staff = await tx.user.findMany({
        /* tenant-scope: the brief's own tenant — its BTG admins. */
        where: where("BTG_ADMIN"), select: { id: true, email: true },
      });
    }
    for (const u of staff) {
      await send(tx, b.tenantId, {
        template: "brief.heldForBtg",
        to: u.email,
        idempotencyKey: `brief.heldForBtg:${b.id}:${heldAt.toISOString()}:${u.id}`,
        data: {
          sponsorName: b.sponsor.name,
          packageName: b.package?.name ?? "Custom request",
          reasons: reasons.map((r) => `• ${r}`).join("\n"),
          reviewUrl: `${app()}/admin/briefs?tab=held#brief-${b.id}`,
        },
      });
    }
  }
  return { outcome: "HELD", reasons, newHold };
}

/** Bound on one pass of the sweep. */
const SWEEP_BATCH = 500;

/**
 * The daily re-check: DRAFT briefs held ONLY because too few athletes fit
 * are evaluated again, each in its own transaction — approved once enough
 * athletes have joined, otherwise left held (or, if something else now
 * fails, re-held with the new reasons, without a second email). Idempotent:
 * a brief approved on one pass is not DRAFT on the next. `opts.tenantIds`
 * scopes it (tests).
 */
export async function recheckHeldBriefs(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const out = { checked: 0, approved: 0, held: 0, failed: 0 };
  const due = await prisma.campaignBrief.findMany({
    /* tenant-scope: the system sweep — every tenant's DRAFT briefs held only for athletes; each is evaluated in its own tenant. */
    where: {
      ...(opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {}),
      state: "DRAFT",
      autoApproved: false,
      heldAt: { not: null },
      heldKeys: { equals: ["ATHLETES"] },
    },
    select: { id: true, tenantId: true },
    orderBy: [{ heldAt: "asc" }, { id: "asc" }],
    take: SWEEP_BATCH,
  });
  for (const { id, tenantId } of due) {
    out.checked++;
    try {
      const r = await prisma.$transaction((tx) => autoApproveOrHold(tx, tenantId, id, now, "sweep"));
      if (r.outcome === "APPROVED") {
        out.approved++;
        await startAutoStaffing(tenantId, r.campaignId);
      }
      else if (r.outcome === "HELD") out.held++;
    } catch (error) {
      out.failed++;
      console.error(`[briefs] re-checking ${id} failed, will retry tomorrow:`, error);
    }
  }
  return out;
}
