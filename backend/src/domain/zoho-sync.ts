/**
 * The Zoho sync — P8-INT-01, -02, -05, -06, -07; §18; field-mapping §7, §8.
 *
 * WORKER ONLY. Every function here is called from a job handler in
 * `worker/`, never from a route — `tests/zoho-boundary.test.ts` pins that.
 * Domain code on the request path only ever *enqueues* (outbox), in the same
 * transaction as the change that caused it.
 *
 * THE RULES, IN THE ORDER THEY BITE.
 *
 *  1. Dedupe on `SponsorX_ID`. A record Zoho has never seen is created by
 *     upsert with `duplicate_check_fields=SponsorX_ID`, so a retried job
 *     updates what the first attempt made rather than making a second. Once
 *     we hold Zoho's id, updates go by id.
 *
 *  2. Parents first. Account before contact, account and contact before
 *     deal, deal before task (§8.2). A push whose parent is not in Zoho yet
 *     pushes the parent first, in the same job — a parentless CRM record is
 *     litter someone has to clean by hand.
 *
 *  3. Echoes are dropped (P8-INT-02). Every Zoho-touched row carries
 *     `lastSyncOrigin` + `lastSyncHash` over the fields both sides write
 *     (`zoho-mapping.ts`). Outbound, a row Zoho wrote last whose hash is
 *     unchanged is not pushed; inbound, a record whose hash is what we last
 *     sent is not applied. The ping-pong cannot start from either end.
 *
 *  4. System of record settles real conflicts (§8.1 steps 3–4). A field
 *     changed on both sides since the last sync is written as the SoR says,
 *     and the loser goes to the audit log as `sync.conflict`. Never silently.
 *
 *  5. Zoho-owned fields are written once. Account_Name, contact details and
 *     Deal_Name are sent at creation and then belong to sales (§3 SoR,
 *     "SponsorX → then Zoho"): a background job reverting a correction ten
 *     seconds later is the failure the mapping exists to prevent.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { audit } from "../db/audit";
import type { ZohoClient, ZohoRecord } from "../lib/zoho";
import type { BriefState } from "./brief-state";
import type { CampaignState } from "./campaign-state";
import { SPONSOR_CONTACTABLE } from "./fan-consent";
import {
  accountShared,
  assertedStage,
  changedOnBothSides,
  contactShared,
  dealKey,
  dealShared,
  inboundDecision,
  outboundDecision,
  parseDealKey,
  syncHash,
  taskShared,
  toZohoAccountCreate,
  toZohoContactCreate,
  toZohoDealCreate,
  toZohoDealUpdate,
  toZohoLead,
  toZohoFanLead,
  toZohoRenewalCreate,
  toZohoTaskCreate,
  toZohoTaskUpdate,
  zohoAccountShared,
  zohoContactShared,
  zohoDealShared,
  zohoTaskShared,
  zohoToCents,
  type SyncOrigin,
} from "./zoho-mapping";

export type ZohoApi = Pick<ZohoClient, "upsert" | "update" | "get" | "coql" | "list" | "activeUsers">;

export type SyncCtx = {
  db: PrismaClient;
  zoho: ZohoApi;
  now?: () => Date;
  /** Pause between Zoho calls in bulk jobs — the backfill's rate bound. */
  pauseMs?: number;
};

export type PushOutcome =
  | { status: "pushed"; zohoId: string; action: string }
  | { status: "echo" | "unchanged"; zohoId: string }
  | { status: "skipped"; reason: string };

/* The fields each sync read needs, named — never a bare find (P2-OPS-06). */
const SYNC_MARKERS = { lastSyncOrigin: true, lastSyncHash: true, lastSyncAt: true, updatedAt: true } as const;
const SPONSOR_SYNC = { id: true, tenantId: true, name: true, zohoAccountId: true, ...SYNC_MARKERS } as const;
const CONTACT_SYNC = {
  id: true, tenantId: true, name: true, email: true, phone: true, title: true, zohoContactId: true, ...SYNC_MARKERS,
} as const;
const DEAL_OWNER_SYNC = { id: true, tenantId: true, budget: true, zohoDealId: true, ...SYNC_MARKERS } as const;
const TASK_SYNC = {
  id: true, tenantId: true, kind: true, subject: true, body: true, dueDate: true, completedAt: true,
  assigneeUserId: true, briefId: true, campaignId: true, zohoTaskId: true, ...SYNC_MARKERS,
} as const;
const INQUIRY_SYNC = {
  id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true,
  message: true, source: true, zohoLeadId: true,
} as const;

/** The audit actor for sync writes. Not a user: the worker. */
const SYNC_ACTOR = "system:zoho-sync";

const now = (ctx: SyncCtx) => (ctx.now ?? (() => new Date()))();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function markers(origin: SyncOrigin, hash: string, at: Date) {
  /* updatedAt is set to the same instant on purpose. Left to @updatedAt it
     would land a few microseconds after lastSyncAt, and every freshly synced
     row would then look locally modified to the concurrent-change test. */
  return { lastSyncOrigin: origin, lastSyncHash: hash, lastSyncAt: at, updatedAt: at };
}

/**
 * Did our row change since the last sync, in either direction? `markers()`
 * sets updatedAt and lastSyncAt to the same instant, so only a genuine
 * local write leaves updatedAt ahead.
 */
function changedLocally(row: { updatedAt: Date; lastSyncAt: Date | null }): boolean {
  return row.lastSyncAt === null || row.updatedAt > row.lastSyncAt;
}

/* ═══════════════════════════ OUTBOUND ═══════════════════════════════════ */

/** Sponsor → Accounts (§7.1). */
export async function pushAccount(ctx: SyncCtx, tenantId: string, sponsorId: string): Promise<PushOutcome> {
  const s = await ctx.db.sponsor.findFirst({
    where: { id: sponsorId, tenantId },
    select: { id: true, name: true, zohoAccountId: true, lastSyncOrigin: true, lastSyncHash: true, lastSyncAt: true },
  });
  if (!s) return { status: "skipped", reason: "sponsor not found" };
  const hash = syncHash(accountShared(s.name));

  if (s.zohoAccountId) {
    const decision = outboundDecision(s, hash);
    if (s.lastSyncAt) {
      /* Zoho has the account and our key; Account_Name is Zoho's (§7.1), so
         there is nothing further SponsorX may write. */
      return { status: decision === "echo" ? "echo" : "unchanged", zohoId: s.zohoAccountId };
    }
    /* Linked by id but never confirmed — write our key onto it so every
       later upsert dedupes against this record rather than beside it. */
    const r = await ctx.zoho.update("Accounts", s.zohoAccountId, { SponsorX_ID: s.id });
    await ctx.db.sponsor.update({ where: { id: s.id }, data: markers("SPONSORX", hash, now(ctx)) });
    return { status: "pushed", zohoId: r.id, action: r.action };
  }

  const r = await ctx.zoho.upsert("Accounts", toZohoAccountCreate(s));
  await ctx.db.sponsor.update({
    where: { id: s.id },
    data: { zohoAccountId: r.id, ...markers("SPONSORX", hash, now(ctx)) },
  });
  return { status: "pushed", zohoId: r.id, action: r.action };
}

async function ensureAccount(ctx: SyncCtx, tenantId: string, sponsorId: string): Promise<string> {
  const s = await ctx.db.sponsor.findFirst({ where: { id: sponsorId, tenantId }, select: { zohoAccountId: true } });
  if (s?.zohoAccountId) return s.zohoAccountId;
  const out = await pushAccount(ctx, tenantId, sponsorId);
  if (out.status === "skipped") throw new Error(`account ${sponsorId}: ${out.reason}`);
  return out.zohoId;
}

/** SponsorContact → Contacts (§7.2). The account goes first. */
export async function pushContact(ctx: SyncCtx, tenantId: string, contactId: string): Promise<PushOutcome> {
  const c = await ctx.db.sponsorContact.findFirst({
    where: { id: contactId, tenantId },
    select: {
      id: true, sponsorId: true, name: true, email: true, phone: true, title: true,
      zohoContactId: true, lastSyncOrigin: true, lastSyncHash: true,
    },
  });
  if (!c) return { status: "skipped", reason: "contact not found" };
  const hash = syncHash(contactShared(c));

  if (c.zohoContactId) {
    /* Every contact field is Zoho's once the record exists (§7.2). */
    const decision = outboundDecision(c, hash);
    return { status: decision === "echo" ? "echo" : "unchanged", zohoId: c.zohoContactId };
  }

  const accountId = await ensureAccount(ctx, tenantId, c.sponsorId);
  const r = await ctx.zoho.upsert("Contacts", toZohoContactCreate(c, accountId));
  await ctx.db.sponsorContact.update({
    where: { id: c.id },
    data: { zohoContactId: r.id, ...markers("SPONSORX", hash, now(ctx)) },
  });
  return { status: "pushed", zohoId: r.id, action: r.action };
}

/** The sponsor's primary contact in Zoho, pushing it if needed; null if none. */
async function ensurePrimaryContact(ctx: SyncCtx, tenantId: string, sponsorId: string): Promise<string | null> {
  const c = await ctx.db.sponsorContact.findFirst({
    where: { tenantId, sponsorId, isPrimary: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, zohoContactId: true },
  });
  if (!c) return null;
  if (c.zohoContactId) return c.zohoContactId;
  const out = await pushContact(ctx, tenantId, c.id);
  return out.status === "skipped" ? null : out.zohoId;
}

const BRIEF_SELECT = {
  id: true, state: true, sponsorId: true, budget: true, objective: true,
  startDate: true, endDate: true, zohoDealId: true,
  lastSyncOrigin: true, lastSyncHash: true, lastSyncAt: true, updatedAt: true,
  package: { select: { name: true } },
  sponsor: { select: { name: true } },
} as const;

const CAMPAIGN_SELECT = {
  id: true, state: true, sponsorId: true, briefId: true, name: true, budget: true,
  startDate: true, endDate: true, zohoDealId: true, zohoRenewalDealId: true,
  lastSyncOrigin: true, lastSyncHash: true, lastSyncAt: true, updatedAt: true,
  sponsor: { select: { name: true } },
} as const;

/**
 * Brief / Campaign → one Deal (§4.1, §7.4, field-mapping O-2).
 *
 * The Deal is born when the brief qualifies and is keyed on the brief, so
 * the key survives the brief becoming a campaign. The campaign owns the sync
 * markers from creation onward; a campaign with no brief is keyed on itself.
 */
export async function pushDeal(
  ctx: SyncCtx,
  tenantId: string,
  ref: { briefId?: string; campaignId?: string },
): Promise<PushOutcome> {
  let campaign = ref.campaignId
    ? await ctx.db.campaign.findFirst({ where: { id: ref.campaignId, tenantId }, select: CAMPAIGN_SELECT })
    : null;
  const briefId = ref.briefId ?? campaign?.briefId ?? null;
  const brief = briefId
    ? await ctx.db.campaignBrief.findFirst({ where: { id: briefId, tenantId }, select: BRIEF_SELECT })
    : null;
  if (!campaign && brief) {
    campaign = await ctx.db.campaign.findFirst({ where: { briefId: brief.id, tenantId }, select: CAMPAIGN_SELECT });
  }
  if (!brief && !campaign) return { status: "skipped", reason: "no brief or campaign" };

  const stage = assertedStage((brief?.state as BriefState) ?? null, (campaign?.state as CampaignState) ?? null);
  if (!stage) return { status: "skipped", reason: "a DRAFT brief has no Deal yet" };

  const key = dealKey(brief?.id ?? null, brief ? null : campaign!.id);
  const amountCents = campaign?.budget ?? brief!.budget;
  const hash = syncHash(dealShared(amountCents, stage));
  const owner = campaign ?? brief!;
  const zohoDealId = campaign?.zohoDealId ?? brief?.zohoDealId ?? null;

  let result: { id: string; action: string };
  if (zohoDealId) {
    const decision = outboundDecision(owner, hash);
    if (decision !== "push") return { status: decision, zohoId: zohoDealId };
    if (!changedLocally(owner)) {
      /* Nothing on our side moved since the last sync, so there is nothing
         for SponsorX to assert — the hashes differ only because sales moved
         the deal (an in-between Stage, a negotiated Amount). A redelivered
         job must not revert that: this is the half of the loop a hash alone
         cannot see. */
      return { status: owner.lastSyncOrigin === "ZOHO" ? "echo" : "unchanged", zohoId: zohoDealId };
    }
    result = await ctx.zoho.update(
      "Deals",
      zohoDealId,
      toZohoDealUpdate({ key, amountCents, stage, contracted: campaign !== null }),
    );
  } else {
    const sponsorId = (campaign ?? brief)!.sponsorId;
    const zohoAccountId = await ensureAccount(ctx, tenantId, sponsorId);
    const zohoContactId = await ensurePrimaryContact(ctx, tenantId, sponsorId);
    /* §7.4 Type: "New Business" unless the sponsor already has a won deal —
       any other campaign is one. */
    const priorWins = await ctx.db.campaign.count({
      where: { tenantId, sponsorId, ...(campaign ? { id: { not: campaign.id } } : {}) },
    });
    result = await ctx.zoho.upsert(
      "Deals",
      toZohoDealCreate({
        key,
        sponsorName: (campaign ?? brief)!.sponsor.name,
        subject: brief?.package?.name ?? brief?.objective ?? campaign!.name,
        objective: brief?.objective ?? null,
        amountCents,
        stage,
        startDate: (brief ?? campaign)!.startDate,
        endDate: (brief ?? campaign)!.endDate,
        zohoAccountId,
        zohoContactId,
        existingBusiness: priorWins > 0,
      }),
    );
  }

  const at = now(ctx);
  if (campaign) {
    await ctx.db.campaign.update({
      where: { id: campaign.id },
      data: { zohoDealId: result.id, ...markers("SPONSORX", hash, at) },
    });
  }
  if (brief && (!campaign || !brief.zohoDealId)) {
    /* The brief keeps the id either way, so a lookup by either row finds
       the Deal. Its markers only matter while it is the owner. */
    await ctx.db.campaignBrief.update({
      where: { id: brief.id },
      data: campaign ? { zohoDealId: result.id } : { zohoDealId: result.id, ...markers("SPONSORX", hash, at) },
    });
  }
  return { status: "pushed", zohoId: result.id, action: result.action };
}

/** §18 row 9 — a campaign that COMPLETED opens a second Deal. One-way. */
export async function pushRenewal(ctx: SyncCtx, tenantId: string, campaignId: string): Promise<PushOutcome> {
  const c = await ctx.db.campaign.findFirst({ where: { id: campaignId, tenantId }, select: CAMPAIGN_SELECT });
  if (!c) return { status: "skipped", reason: "campaign not found" };
  if (c.state !== "COMPLETED") return { status: "skipped", reason: `campaign is ${c.state}, not COMPLETED` };
  if (c.zohoRenewalDealId) return { status: "unchanged", zohoId: c.zohoRenewalDealId };

  const zohoAccountId = await ensureAccount(ctx, tenantId, c.sponsorId);
  const zohoContactId = await ensurePrimaryContact(ctx, tenantId, c.sponsorId);
  const r = await ctx.zoho.upsert(
    "Deals",
    toZohoRenewalCreate({
      campaignId: c.id,
      sponsorName: c.sponsor.name,
      budgetCents: c.budget,
      endDate: c.endDate,
      zohoAccountId,
      zohoContactId,
    }),
  );
  await ctx.db.campaign.update({ where: { id: c.id }, data: { zohoRenewalDealId: r.id } });
  return { status: "pushed", zohoId: r.id, action: r.action };
}

/** SyncTask → Tasks (§7.5). Its deal goes first. */
export async function pushTask(ctx: SyncCtx, tenantId: string, taskId: string): Promise<PushOutcome> {
  const t = await ctx.db.syncTask.findFirst({ where: { id: taskId, tenantId }, select: TASK_SYNC });
  if (!t) return { status: "skipped", reason: "task not found" };
  const hash = syncHash(taskShared(t));

  if (t.zohoTaskId) {
    const decision = outboundDecision(t, hash);
    if (decision !== "push") return { status: decision, zohoId: t.zohoTaskId };
    if (!changedLocally(t)) {
      /* Status is Zoho's; if only it moved, there is nothing of ours to send. */
      return { status: t.lastSyncOrigin === "ZOHO" ? "echo" : "unchanged", zohoId: t.zohoTaskId };
    }
    const r = await ctx.zoho.update("Tasks", t.zohoTaskId, toZohoTaskUpdate(t));
    await ctx.db.syncTask.update({ where: { id: t.id }, data: markers("SPONSORX", hash, now(ctx)) });
    return { status: "pushed", zohoId: r.id, action: r.action };
  }

  /* Resolve the deal the task hangs off — pushing it first if Zoho does
     not have it — but never re-push one it already has: that would
     re-assert Stage over whatever sales has moved it to since. */
  let zohoDealId: string | null = null;
  let sponsorId: string | null = null;
  if (t.campaignId) {
    const c = await ctx.db.campaign.findFirst({
      where: { id: t.campaignId, tenantId },
      select: { sponsorId: true, zohoDealId: true, zohoRenewalDealId: true },
    });
    sponsorId = c?.sponsorId ?? null;
    if (t.kind === "RENEWAL") {
      zohoDealId = c?.zohoRenewalDealId ?? null;
      if (!zohoDealId) {
        const out = await pushRenewal(ctx, tenantId, t.campaignId);
        zohoDealId = out.status === "skipped" ? null : out.zohoId;
      }
    } else {
      zohoDealId = c?.zohoDealId ?? null;
      if (!zohoDealId && c) {
        const out = await pushDeal(ctx, tenantId, { campaignId: t.campaignId });
        zohoDealId = out.status === "skipped" ? null : out.zohoId;
      }
    }
  } else if (t.briefId) {
    const b = await ctx.db.campaignBrief.findFirst({
      where: { id: t.briefId, tenantId },
      select: { sponsorId: true, zohoDealId: true },
    });
    sponsorId = b?.sponsorId ?? null;
    zohoDealId = b?.zohoDealId ?? null;
    if (!zohoDealId && b) {
      const out = await pushDeal(ctx, tenantId, { briefId: t.briefId });
      zohoDealId = out.status === "skipped" ? null : out.zohoId;
    }
  }

  const zohoContactId = sponsorId ? await ensurePrimaryContact(ctx, tenantId, sponsorId) : null;
  /* O-5: the person who caused the task owns it in the CRM, if we know
     their Zoho user. Otherwise the API account owns it and nobody is
     notified — acceptable, and visible, rather than guessed. */
  const owner = t.assigneeUserId
    ? await ctx.db.user.findFirst({ where: { id: t.assigneeUserId, tenantId }, select: { zohoUserId: true } })
    : null;

  const r = await ctx.zoho.upsert(
    "Tasks",
    toZohoTaskCreate({ ...t, zohoOwnerId: owner?.zohoUserId ?? null, zohoDealId, zohoContactId }),
  );
  await ctx.db.syncTask.update({
    where: { id: t.id },
    data: { zohoTaskId: r.id, ...markers("SPONSORX", hash, now(ctx)) },
  });
  return { status: "pushed", zohoId: r.id, action: r.action };
}

/** Inquiry → Leads (§7.3, P8-INT-06). One-way: qualification is Zoho's. */
export async function pushLead(ctx: SyncCtx, tenantId: string, inquiryId: string): Promise<PushOutcome> {
  const i = await ctx.db.inquiry.findFirst({ where: { id: inquiryId, tenantId }, select: INQUIRY_SYNC });
  if (!i) return { status: "skipped", reason: "inquiry not found" };
  if (i.zohoLeadId) return { status: "unchanged", zohoId: i.zohoLeadId };
  const r = await ctx.zoho.upsert("Leads", toZohoLead(i));
  await ctx.db.inquiry.update({ where: { id: i.id }, data: { zohoLeadId: r.id } });
  return { status: "pushed", zohoId: r.id, action: r.action };
}

/**
 * A fan who asked to hear from the sponsor → a Zoho Lead (2S6-INT-03).
 *
 * The claim is re-read HERE, at push time, through `SPONSOR_CONTACTABLE`: a
 * claim without the sponsor-contact tick, or one withdrawn since it was
 * queued, is simply not found, and nothing is sent. Excluded at query level —
 * never fetched and then skipped.
 */
export async function pushFanLead(ctx: SyncCtx, tenantId: string, fanEventId: string): Promise<PushOutcome> {
  const claim = await ctx.db.rewardEvent.findFirst({
    where: { tenantId, id: fanEventId, ...SPONSOR_CONTACTABLE },
    select: {
      id: true, fanEmail: true, sponsorContactAt: true, zohoLeadId: true,
      token: { select: { reward: { select: { offerText: true, campaign: { select: { name: true, sponsor: { select: { name: true } } } } } } } },
    },
  });
  if (!claim) return { status: "skipped", reason: "no sponsor-contact consent on this claim (never given, or withdrawn)" };
  if (claim.zohoLeadId) return { status: "unchanged", zohoId: claim.zohoLeadId };
  const reward = claim.token.reward;
  const r = await ctx.zoho.upsert("Leads", toZohoFanLead({
    eventId: claim.id, email: claim.fanEmail!, sponsorName: reward.campaign.sponsor.name,
    campaignName: reward.campaign.name, offerText: reward.offerText, consentedAt: claim.sponsorContactAt,
  }));
  await ctx.db.rewardEvent.update({ where: { id: claim.id }, data: { zohoLeadId: r.id } });
  return { status: "pushed", zohoId: r.id, action: r.action };
}

/* ═══════════════════════════ INBOUND ════════════════════════════════════ */

export type ApplyOutcome =
  | { status: "applied"; entity: string; id: string; conflicts: string[] }
  | { status: "echo" | "unchanged"; entity: string; id: string }
  | { status: "unknown"; reason: string }
  | { status: "ignored"; reason: string };

function modifiedAt(r: ZohoRecord): Date | null {
  const t = r.Modified_Time;
  return typeof t === "string" ? new Date(t) : null;
}

async function recordConflicts(
  tx: Prisma.TransactionClient,
  tenantId: string,
  entity: string,
  entityId: string,
  diffs: { field: string; sponsorx: unknown; zoho: unknown; winner: SyncOrigin }[],
  localAt: Date,
  zohoAt: Date | null,
): Promise<void> {
  for (const d of diffs) {
    await audit(tx, { userId: SYNC_ACTOR, tenantId }, "sync.conflict", entity, entityId, {
      before: { field: d.field, sponsorx: d.sponsorx, sponsorxAt: localAt.toISOString() },
      after: { field: d.field, zoho: d.zoho, zohoAt: zohoAt?.toISOString() ?? null, winner: d.winner },
    });
  }
}

/**
 * Apply one Zoho record to our side. Called by the `zoho.ingestCrm` job
 * after the worker has fetched the record the notification named.
 *
 * Resolution is by Zoho id or by `SponsorX_ID`, and deliberately not by
 * tenant: a notification arrives before anything says which tenant it is
 * for. The row found carries its own tenant, and every write that follows
 * uses it.
 */
export async function applyZohoRecord(ctx: SyncCtx, module: string, r: ZohoRecord): Promise<ApplyOutcome> {
  const zohoId = String(r.id ?? "");
  const key = typeof r.SponsorX_ID === "string" ? r.SponsorX_ID : null;
  const at = now(ctx);
  const zAt = modifiedAt(r);

  switch (module) {
    case "Accounts": {
      /* cross-tenant: inbound resolution by external id; see above */
      const s = await ctx.db.sponsor.findFirst({
        where: { OR: [{ zohoAccountId: zohoId }, ...(key ? [{ id: key }] : [])] },
        select: SPONSOR_SYNC,
      });
      if (!s) return { status: "unknown", reason: `no sponsor for Zoho account ${zohoId}` };
      const shared = zohoAccountShared(r);
      const hash = syncHash(shared);
      const decision = inboundDecision(s, hash);
      if (decision !== "apply") return { status: decision, entity: "Sponsor", id: s.id };
      const both = changedOnBothSides(s.updatedAt, zAt, s.lastSyncAt);
      const diffs = both && s.name !== shared.Account_Name
        ? [{ field: "name", sponsorx: s.name, zoho: shared.Account_Name, winner: "ZOHO" as const }]
        : [];
      await ctx.db.$transaction(async (tx) => {
        await tx.sponsor.update({
          where: { id: s.id },
          data: { name: shared.Account_Name || s.name, zohoAccountId: zohoId, ...markers("ZOHO", hash, at) },
        });
        await recordConflicts(tx, s.tenantId, "Sponsor", s.id, diffs, s.updatedAt, zAt);
      });
      return { status: "applied", entity: "Sponsor", id: s.id, conflicts: diffs.map((d) => d.field) };
    }

    case "Contacts": {
      /* cross-tenant: inbound resolution by external id; see above */
      const c = await ctx.db.sponsorContact.findFirst({
        where: { OR: [{ zohoContactId: zohoId }, ...(key ? [{ id: key }] : [])] },
        select: CONTACT_SYNC,
      });
      if (!c) return { status: "unknown", reason: `no contact for Zoho contact ${zohoId}` };
      const shared = zohoContactShared(r);
      const hash = syncHash(shared);
      const decision = inboundDecision(c, hash);
      if (decision !== "apply") return { status: decision, entity: "SponsorContact", id: c.id };
      const local = contactShared(c);
      const both = changedOnBothSides(c.updatedAt, zAt, c.lastSyncAt);
      const diffs = both
        ? (Object.keys(shared) as (keyof typeof shared)[])
            .filter((f) => local[f] !== shared[f])
            .map((f) => ({ field: f, sponsorx: local[f], zoho: shared[f], winner: "ZOHO" as const }))
        : [];
      await ctx.db.$transaction(async (tx) => {
        await tx.sponsorContact.update({
          where: { id: c.id },
          data: {
            name: shared.name || c.name,
            email: shared.Email || c.email,
            phone: shared.Phone,
            title: shared.Title,
            zohoContactId: zohoId,
            ...markers("ZOHO", hash, at),
          },
        });
        await recordConflicts(tx, c.tenantId, "SponsorContact", c.id, diffs, c.updatedAt, zAt);
      });
      return { status: "applied", entity: "SponsorContact", id: c.id, conflicts: diffs.map((d) => d.field) };
    }

    case "Deals": {
      const parsed = parseDealKey(key);
      if (parsed?.kind === "renewal") {
        return { status: "ignored", reason: "renewal Deals are one-way (§18 row 9)" };
      }
      /* cross-tenant: inbound resolution by external id; see above */
      const campaign = await ctx.db.campaign.findFirst({
        where: {
          OR: [
            { zohoDealId: zohoId },
            ...(parsed?.kind === "campaign" ? [{ id: parsed.id }] : []),
            ...(parsed?.kind === "brief" ? [{ briefId: parsed.id }] : []),
          ],
        },
        select: { ...DEAL_OWNER_SYNC, briefId: true },
      });
      /* cross-tenant: inbound resolution by external id; see above */
      const brief = campaign?.briefId
        ? await ctx.db.campaignBrief.findFirst({
            where: { id: campaign.briefId, tenantId: campaign.tenantId },
            select: DEAL_OWNER_SYNC,
          })
        : await ctx.db.campaignBrief.findFirst({
            where: { OR: [{ zohoDealId: zohoId }, ...(parsed?.kind === "brief" ? [{ id: parsed.id }] : [])] },
            select: DEAL_OWNER_SYNC,
          });
      const owner = campaign ?? brief;
      if (!owner) return { status: "unknown", reason: `no brief or campaign for Zoho deal ${zohoId}` };

      const shared = zohoDealShared(r);
      const hash = syncHash(shared);
      const decision = inboundDecision(owner, hash);
      const entity = campaign ? "Campaign" : "CampaignBrief";
      if (decision !== "apply") return { status: decision, entity, id: owner.id };

      /* Amount has a split SoR (§7.4): Zoho's while negotiating, ours once
         contracted. Stage is never applied — Zoho owns the pipeline, and our
         states are facts about delivery, not sales judgement. */
      const zohoCents = zohoToCents(r.Amount);
      const localCents = owner.budget;
      const amountDiffers = zohoCents !== null && zohoCents !== localCents;
      const both = changedOnBothSides(owner.updatedAt, zAt, owner.lastSyncAt);
      const winner: SyncOrigin = campaign ? "SPONSORX" : "ZOHO";
      const diffs = both && amountDiffers
        ? [{ field: "budget", sponsorx: localCents, zoho: zohoCents, winner }]
        : [];

      await ctx.db.$transaction(async (tx) => {
        if (campaign) {
          await tx.campaign.update({
            where: { id: campaign.id },
            data: { zohoDealId: zohoId, ...markers("ZOHO", hash, at) },
          });
        } else {
          await tx.campaignBrief.update({
            where: { id: brief!.id },
            data: {
              ...(amountDiffers ? { budget: zohoCents! } : {}),
              zohoDealId: zohoId,
              ...markers("ZOHO", hash, at),
            },
          });
        }
        await recordConflicts(tx, owner.tenantId, entity, owner.id, diffs, owner.updatedAt, zAt);
      });
      return { status: "applied", entity, id: owner.id, conflicts: diffs.map((d) => d.field) };
    }

    case "Tasks": {
      /* cross-tenant: inbound resolution by external id; see above */
      const t = await ctx.db.syncTask.findFirst({
        where: { OR: [{ zohoTaskId: zohoId }, ...(key ? [{ id: key }] : [])] },
        select: TASK_SYNC,
      });
      if (!t) {
        /* Tasks staff create in Zoho stay in Zoho (§7.5) — not an error. */
        return { status: "ignored", reason: "a task SponsorX did not originate" };
      }
      const shared = zohoTaskShared(r);
      const hash = syncHash(shared);
      const decision = inboundDecision(t, hash);
      if (decision !== "apply") return { status: decision, entity: "SyncTask", id: t.id };
      /* Status is Zoho's; subject and due date are ours and not applied. */
      const completedAt = shared.completed ? (t.completedAt ?? at) : null;
      await ctx.db.syncTask.update({
        where: { id: t.id },
        data: { completedAt, zohoTaskId: zohoId, ...markers("ZOHO", hash, at) },
      });
      return { status: "applied", entity: "SyncTask", id: t.id, conflicts: [] };
    }

    default:
      return { status: "ignored", reason: `module ${module} is not synced inbound` };
  }
}

/* ═══════════════════════════ RECONCILIATION (P8-INT-05) ═════════════════ */

const RECONCILE_FIELDS: Record<string, readonly string[]> = {
  Accounts: ["SponsorX_ID", "Account_Name"],
  Contacts: ["SponsorX_ID", "First_Name", "Last_Name", "Email", "Phone", "Title"],
  Deals: ["SponsorX_ID", "Amount", "Stage"],
  Tasks: ["SponsorX_ID", "Subject", "Due_Date", "Status"],
};

const CAP = 200;

/**
 * Every Zoho record carrying a SponsorX_ID. Paged through the records API
 * and filtered here, not in COQL: verified against the live org 2026-09-24,
 * COQL accepts only `=` and `!=` on the external field — `is not null` and
 * `like` are both refused — so there is no query that asks for exactly these.
 * The records API reads at most 2,000 rows without a page token; Phase 1 is
 * far below that, and hitting it marks the report truncated rather than
 * quietly under-counting.
 */
async function allZoho(ctx: SyncCtx, module: string): Promise<{ rows: ZohoRecord[]; truncated: boolean }> {
  const out: ZohoRecord[] = [];
  for (let page = 1; page <= 10; page++) {
    const { rows, more } = await ctx.zoho.list(module, RECONCILE_FIELDS[module]!, page);
    out.push(...rows.filter((r) => typeof r.SponsorX_ID === "string" && r.SponsorX_ID !== ""));
    if (!more) return { rows: out, truncated: false };
    if (ctx.pauseMs) await sleep(ctx.pauseMs);
  }
  return { rows: out, truncated: true };
}

type Local = { key: string; expected: boolean; divergence: (z: ZohoRecord) => string[] };

async function localRows(ctx: SyncCtx, tenantId: string, module: string): Promise<Local[]> {
  switch (module) {
    case "Accounts":
      return (await ctx.db.sponsor.findMany({ where: { tenantId }, select: SPONSOR_SYNC })).map((s) => ({
        key: s.id,
        expected: s.zohoAccountId !== null,
        divergence: (z) =>
          accountShared(s.name).Account_Name !== zohoAccountShared(z).Account_Name ? ["Account_Name"] : [],
      }));
    case "Contacts":
      return (await ctx.db.sponsorContact.findMany({ where: { tenantId }, select: CONTACT_SYNC })).map((c) => ({
        key: c.id,
        expected: c.zohoContactId !== null,
        divergence: (z) => {
          const a = contactShared(c);
          const b = zohoContactShared(z);
          return (Object.keys(a) as (keyof typeof a)[]).filter((f) => a[f] !== b[f]);
        },
      }));
    case "Deals": {
      const briefs = await ctx.db.campaignBrief.findMany({
        where: { tenantId },
        select: { id: true, state: true, budget: true, campaign: { select: { state: true, budget: true } } },
      });
      const lone = await ctx.db.campaign.findMany({
        where: { tenantId, briefId: null },
        select: { id: true, state: true, budget: true },
      });
      const withRenewal = await ctx.db.campaign.findMany({
        where: { tenantId, zohoRenewalDealId: { not: null } },
        select: { id: true },
      });
      const deal = (budget: number, stage: string | null) => (z: ZohoRecord) => {
        const d: string[] = [];
        if (Math.round(Number(z.Amount ?? 0) * 100) !== budget) d.push("Amount");
        /* In-between stages are Zoho's (§7.4). Only a closed stage SponsorX
           asserted can drift. */
        if (stage?.startsWith("Closed") && z.Stage !== stage) d.push("Stage");
        return d;
      };
      return [
        ...briefs.map((b) => {
          const stage = assertedStage(b.state as BriefState, (b.campaign?.state as CampaignState) ?? null);
          return { key: `brief:${b.id}`, expected: stage !== null, divergence: deal(b.campaign?.budget ?? b.budget, stage) };
        }),
        ...lone.map((c) => ({
          key: `campaign:${c.id}`,
          expected: true,
          divergence: deal(c.budget, assertedStage(null, c.state as CampaignState)),
        })),
        ...withRenewal.map((c) => ({ key: `renewal:${c.id}`, expected: true, divergence: () => [] })),
      ];
    }
    case "Tasks":
      return (await ctx.db.syncTask.findMany({ where: { tenantId }, select: TASK_SYNC })).map((t) => ({
        key: t.id,
        expected: true,
        divergence: (z) => {
          const a = taskShared(t);
          const b = zohoTaskShared(z);
          return (Object.keys(a) as (keyof typeof a)[]).filter((f) => a[f] !== b[f]);
        },
      }));
    default:
      return [];
  }
}

export type ReconcileReport = {
  module: string;
  checked: number;
  /** Zoho held more than one read can page through — counts are partial. */
  truncated: boolean;
  missingInZoho: string[];
  unknownInSponsorX: string[];
  diverged: { key: string; fields: string[] }[];
};

/**
 * Compare both sides by `SponsorX_ID` and REPORT the three kinds of drift
 * (§8.3). Never repairs: on a mapping this new, repairing would hide the
 * bug that caused the drift. One `ZohoReconciliation` row per module.
 */
export async function reconcile(
  ctx: SyncCtx,
  tenantId: string,
  modules: readonly string[] = ["Accounts", "Contacts", "Deals", "Tasks"],
): Promise<ReconcileReport[]> {
  const reports: ReconcileReport[] = [];
  for (const module of modules) {
    const { rows: zoho, truncated } = await allZoho(ctx, module);
    const byKey = new Map(zoho.map((z) => [String(z.SponsorX_ID), z]));
    const local = await localRows(ctx, tenantId, module);
    const known = new Set(local.map((l) => l.key));

    const report: ReconcileReport = {
      module,
      checked: local.length,
      truncated,
      missingInZoho: local.filter((l) => l.expected && !byKey.has(l.key)).map((l) => l.key),
      unknownInSponsorX: zoho.filter((z) => !known.has(String(z.SponsorX_ID))).map((z) => String(z.id)),
      diverged: local
        .filter((l) => byKey.has(l.key))
        .map((l) => ({ key: l.key, fields: l.divergence(byKey.get(l.key)!) }))
        .filter((d) => d.fields.length > 0),
    };
    await ctx.db.zohoReconciliation.create({
      data: {
        tenantId,
        module,
        checked: report.checked,
        missingInZoho: report.missingInZoho.slice(0, CAP),
        unknownInSponsorX: report.unknownInSponsorX.slice(0, CAP),
        diverged: report.diverged.slice(0, CAP),
      },
    });
    reports.push(report);
  }
  return reports;
}

/* ═══════════════════════════ BACKFILL (P8-INT-07) ═══════════════════════ */

export type BackfillModule = "Users" | "Accounts" | "Contacts";

export type BackfillOutcome = {
  module: BackfillModule;
  seen: number;
  created: number;
  linked: number;
  skipped: { id: string; reason: string }[];
};

/**
 * Import what Zoho already knows — sponsors (Accounts), their people
 * (Contacts) and the staff user mapping (Users, O-5).
 *
 * KEPT AND RE-RUNNABLE. Every step is idempotent: a record already linked is
 * skipped, a record we created on a previous run is found by its
 * `SponsorX_ID`, so a second run over the same org does nothing new.
 *
 * BOUNDED. One page of 200 at a time with `pauseMs` between calls — Zoho's
 * API allowance is per org per day and the sales team is using it too.
 *
 * Deals and Tasks are not imported: a Zoho deal has no brief behind it, and
 * a staff-created task stays in Zoho by design (§7.5).
 */
export async function backfill(
  ctx: SyncCtx,
  tenantId: string,
  module: BackfillModule,
  opts: { maxPages?: number } = {},
): Promise<BackfillOutcome> {
  const out: BackfillOutcome = { module, seen: 0, created: 0, linked: 0, skipped: [] };
  const pause = async () => ctx.pauseMs && (await sleep(ctx.pauseMs));

  if (module === "Users") {
    for (const u of await ctx.zoho.activeUsers()) {
      out.seen++;
      const user = await ctx.db.user.findFirst({
        where: { tenantId, email: { equals: u.email, mode: "insensitive" } },
        select: { id: true, zohoUserId: true },
      });
      if (!user) { out.skipped.push({ id: u.id, reason: "no SponsorX user with that email" }); continue; }
      if (user.zohoUserId === u.id) continue;
      await ctx.db.user.update({ where: { id: user.id }, data: { zohoUserId: u.id } });
      out.linked++;
    }
    return out;
  }

  const fields = module === "Accounts"
    ? ["Account_Name", "SponsorX_ID", "Modified_Time"]
    : ["First_Name", "Last_Name", "Email", "Phone", "Title", "Account_Name", "SponsorX_ID", "Modified_Time"];

  for (let page = 1; page <= (opts.maxPages ?? 50); page++) {
    const { rows, more } = await ctx.zoho.list(module, fields, page);
    for (const r of rows) {
      out.seen++;
      const zohoId = String(r.id);
      const key = typeof r.SponsorX_ID === "string" ? r.SponsorX_ID : null;
      const at = now(ctx);

      if (module === "Accounts") {
        const existing = await ctx.db.sponsor.findFirst({
          where: { tenantId, OR: [{ zohoAccountId: zohoId }, ...(key ? [{ id: key }] : [])] },
          select: { id: true, zohoAccountId: true },
        });
        if (existing?.zohoAccountId === zohoId) continue;
        if (existing) {
          await ctx.db.sponsor.update({ where: { id: existing.id }, data: { zohoAccountId: zohoId } });
          out.linked++;
          continue;
        }
        if (key) {
          /* Carries a SponsorX_ID we do not have — written by another
             environment. Importing it would fork that sponsor's identity. */
          out.skipped.push({ id: zohoId, reason: `SponsorX_ID ${key} belongs to another environment` });
          continue;
        }
        const shared = zohoAccountShared(r);
        const s = await ctx.db.sponsor.create({
          data: { tenantId, name: shared.Account_Name, zohoAccountId: zohoId, ...markers("ZOHO", syncHash(shared), at) },
          select: { id: true },
        });
        /* Our key goes onto their record, so every later push dedupes
           against it rather than creating a twin. */
        await ctx.zoho.update("Accounts", zohoId, { SponsorX_ID: s.id });
        await pause();
        out.created++;
      } else {
        const existing = await ctx.db.sponsorContact.findFirst({
          where: { tenantId, OR: [{ zohoContactId: zohoId }, ...(key ? [{ id: key }] : [])] },
          select: { id: true, zohoContactId: true },
        });
        if (existing?.zohoContactId === zohoId) continue;
        if (existing) {
          await ctx.db.sponsorContact.update({ where: { id: existing.id }, data: { zohoContactId: zohoId } });
          out.linked++;
          continue;
        }
        if (key) { out.skipped.push({ id: zohoId, reason: `SponsorX_ID ${key} belongs to another environment` }); continue; }
        const accountId = (r.Account_Name as { id?: string } | null)?.id;
        const sponsor = accountId
          ? await ctx.db.sponsor.findFirst({ where: { tenantId, zohoAccountId: String(accountId) }, select: { id: true } })
          : null;
        if (!sponsor) { out.skipped.push({ id: zohoId, reason: "its account is not a SponsorX sponsor" }); continue; }
        const shared = zohoContactShared(r);
        if (!shared.Email) { out.skipped.push({ id: zohoId, reason: "no email address" }); continue; }
        const hasPrimary = await ctx.db.sponsorContact.count({ where: { tenantId, sponsorId: sponsor.id, isPrimary: true } });
        const c = await ctx.db.sponsorContact.create({
          data: {
            tenantId,
            sponsorId: sponsor.id,
            name: shared.name || shared.Email,
            email: shared.Email,
            phone: shared.Phone,
            title: shared.Title,
            isPrimary: hasPrimary === 0,
            zohoContactId: zohoId,
            ...markers("ZOHO", syncHash(shared), at),
          },
          select: { id: true },
        });
        await ctx.zoho.update("Contacts", zohoId, { SponsorX_ID: c.id });
        await pause();
        out.created++;
      }
    }
    if (!more) break;
    await pause();
  }
  return out;
}

/* ═══════════════════════════ REQUESTING A BACKFILL ══════════════════════ */

export class BackfillNeedsConfirmationError extends Error {
  constructor() {
    super(
      "This is production. The backfill writes SponsorX_ID onto every Zoho " +
        "Account and Contact it imports, so it runs against staging and the " +
        "sandbox first (field-mapping §8.2, O-6). Once that run is clean, re-run " +
        "here with --confirm-production.",
    );
    this.name = "BackfillNeedsConfirmationError";
  }
}

/**
 * Queue a backfill — what `npm run zoho:backfill` calls. Through the outbox
 * like everything else, so it runs on the worker that holds the credentials.
 * Staging first: production refuses without an explicit confirmation.
 */
export async function requestBackfill(
  db: PrismaClient,
  opts: { tenantId: string; modules?: BackfillModule[]; environment?: string; confirmProduction?: boolean },
): Promise<{ environment: string }> {
  const environment = opts.environment ?? "local";
  if (environment === "production" && !opts.confirmProduction) throw new BackfillNeedsConfirmationError();
  await db.$transaction(async (tx) => {
    await tx.outboxJob.create({
      data: {
        tenantId: opts.tenantId,
        name: "zoho.backfill",
        payload: opts.modules ? { modules: opts.modules } : {},
      },
    });
  });
  return { environment };
}
