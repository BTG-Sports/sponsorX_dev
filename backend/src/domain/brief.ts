/**
 * Campaign briefs — P4-BE-02, §21, §26.
 *
 * What a sponsor asks for, before BTG turns it into a campaign. The brief is
 * the sponsor's object; the campaign is BTG's. Keeping them apart is what
 * lets a brief be qualified, reworked and closed without any of that
 * appearing in campaign reporting.
 *
 * `categories` IS THE CONFLICT INPUT. It is drawn from the same closed
 * vocabulary as an athlete's `restrictedCategories` (P3-BE-05), because a
 * conflict check compares the two and free text on either side makes the
 * comparison guesswork.
 */

import { Prisma } from "../generated/prisma/client";
import { OrderDetailsError, requireOrderDetails } from "./campaign-order-details";
import { ORDER_CODE, type OrderDetails } from "./order-details-rules";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import type { BriefState } from "./brief-state";
import type { BrandCategory } from "./brand-categories";
import { assertNoWantedExcluded, type AudienceTier, type MatchChannel } from "./match-vocabulary";
import { applyBriefMove, BRIEF_AUDIT_ACTIONS, lockBrief } from "./brief-moves";
import { autoApproveOrHold, notifyBriefWithdrawn } from "./brief-auto";
import { startAutoStaffing } from "./auto-staffing";
import { startAutoSale } from "./ad-sale-auto";
import { createCampaignIn } from "./campaign-create";
import { env } from "../config/env";
import { send } from "../lib/email";

/** A matching list is a set: a repeat in the body is stored once, in the order first sent (QA 2026-10-15). */
const uniq = <T>(xs: readonly T[] | undefined): T[] => [...new Set(xs ?? [])];
import { isAdOnlyPackage, sponsorBriefStatus, sponsorWaitingOn, type SponsorBriefStatus, type SponsorWaitingOn } from "./brief-auto-rules";
import { assertCountryStates, briefCountry } from "./brief-country";

export type BriefInput = {
  sponsorId: string;
  objective: string;
  /** Cents. The schema is explicit and so is this — a budget in dollars that
   *  reaches a cents column is a hundredfold error nobody notices until
   *  invoicing. */
  budget: number;
  packageId?: string | null;
  /** P9-BE-07 — the student code from /s/[code], if the sponsor came that way. */
  studentCode?: string | null;
  startDate: Date;
  endDate: Date;
  sports: readonly string[];
  /** POL-BE-107 — ISO 3166-1 alpha-2; absent means US. */
  countryCode?: string | null;
  stateCodes: readonly string[];
  categories: readonly BrandCategory[];
  /** 3S3-BE-01 — the matching inputs: categories the sponsor will not be associated with, channels, and the audience wanted. */
  excludedCategories?: readonly BrandCategory[];
  channels?: readonly MatchChannel[];
  audienceTiers?: readonly AudienceTier[];
  /** POL-BE-116 — the athlete order details the builder sets (order-details-rules.ts); null: BTG's standard terms. */
  orderDetails?: unknown;
  /** POL-BE-116 — the three letters its orders are numbered with; null: suggested from the campaign's name. */
  orderCode?: string | null;
  audienceMinFollowers?: number | null;
};

export class UnknownStudentCodeError extends Error {
  readonly status = 422;
  constructor() {
    super("That student code is not active.");
    this.name = "UnknownStudentCodeError";
  }
}

export class InvalidBriefWindowError extends Error {
  readonly status = 422;
  constructor() {
    super("A brief's end date must be after its start date.");
    this.name = "InvalidBriefWindowError";
  }
}

/** A package named on a brief that isn't one of this tenant's. */
export class UnknownPackageError extends Error {
  readonly status = 422;
  constructor() {
    super("That package isn't one of ours — pick a package from the catalogue, or leave it out for a custom request.");
    this.name = "UnknownPackageError";
  }
}

/** A brief changed after BTG — or the system — took it on. */
export class BriefNotEditableError extends Error {
  readonly status = 409;
  constructor(state: BriefState) {
    super(`A request can be changed only while it is waiting to be reviewed; this one is ${state}.`);
    this.name = "BriefNotEditableError";
  }
}

export type BriefSubmitted = {
  id: string;
  state: BriefState;
  autoApproved: boolean;
  /** P4-BE-11 — what the sponsor is told; never why a brief waits. */
  status: SponsorBriefStatus;
  /** POL-FE-51 — who it waits on: ATHLETES (held only for too few athletes), BTG, or null. */
  waitingOn: SponsorWaitingOn;
  campaignId: string | null;
};

/** The package must be this tenant's — its price and athlete minimum decide
 *  an automatic approval, so another tenant's would decide it wrongly. */
async function assertOwnPackage(tx: Prisma.TransactionClient, tenantId: string, packageId: string | null | undefined) {
  if (!packageId) return;
  const pkg = await tx.sponsorPackage.findFirst({
    /* tenant-scope: the brief's own tenant's catalogue. */
    where: { id: packageId, tenantId },
    select: { id: true },
  });
  if (!pkg) throw new UnknownPackageError();
}

/**
 * Submit a brief. Starts in DRAFT — nothing a sponsor sends arrives already
 * qualified. P4-BE-11: a brief a SPONSOR files is then evaluated in the same
 * transaction (brief-auto.ts) — approved by the system, through the same
 * moves BTG makes, when every safety check passes; otherwise it stays DRAFT,
 * held for BTG with its reasons. A brief BTG staff file for a sponsor is
 * theirs to qualify, as before.
 */
export async function createBrief(
  actor: Actor,
  input: BriefInput,
  now = new Date(),
): Promise<BriefSubmitted> {
  assertAllowed(actor, "campaignBrief", "write");
  if (input.endDate <= input.startDate) throw new InvalidBriefWindowError();
  /* POL-BE-116 — the order details, checked in full before anything is written. */
  const orderDetails = checkBriefOrderDetails(input.orderDetails, input.startDate, input.endDate);
  const orderCode = checkOrderCode(input.orderCode);
  /* POL-BE-107 — checked before anything is written: a real country, and US states only on a US brief. */
  const countryCode = briefCountry(input.countryCode);
  assertCountryStates(countryCode, input.stateCodes);

  return staffIfApproved(await prisma.$transaction(async (tx) => {
    /* The sponsor must be one this actor may reach. A SPONSOR_ADMIN filing a
       brief against another company's id is the obvious abuse, and the scope
       filter is what refuses it rather than a hand-written check. */
    const sponsor = await tx.sponsor.findFirst({
      where: { ...whereFor(actor, "sponsor", "read"), id: input.sponsorId },
      select: { id: true },
    });
    if (!sponsor) throw new ForbiddenError("campaignBrief", "write");
    await assertOwnPackage(tx, actor.tenantId, input.packageId);

    /* A code only credits a student who is still in the programme, in this
       tenant — a departed student's code attributes nothing new. */
    let studentCodeId: string | null = null;
    if (input.studentCode) {
      const code = await tx.studentCode.findFirst({
        where: { tenantId: actor.tenantId, code: input.studentCode, student: { is: { state: "ACTIVE" } } },
        select: { id: true },
      });
      if (!code) throw new UnknownStudentCodeError();
      studentCodeId = code.id;
    }

    assertNoWantedExcluded(input.categories, input.excludedCategories ?? []);
    const brief = await tx.campaignBrief.create({
      data: {
        tenantId: actor.tenantId,
        sponsorId: input.sponsorId,
        objective: input.objective,
        budget: input.budget,
        packageId: input.packageId || null,
        studentCodeId,
        startDate: input.startDate,
        endDate: input.endDate,
        sports: [...input.sports],
        countryCode,
        stateCodes: [...input.stateCodes],
        categories: [...input.categories],
        excludedCategories: uniq(input.excludedCategories),
        channels: uniq(input.channels),
        audienceTiers: uniq(input.audienceTiers),
        audienceMinFollowers: input.audienceMinFollowers ?? null,
        ...(orderDetails ? { orderDetails: orderDetails as Prisma.InputJsonValue } : {}),
        orderCode,
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, "brief.create", "CampaignBrief", brief.id, {
      after: { state: "DRAFT", sponsorId: input.sponsorId, budget: input.budget, countryCode, orderDetails: orderDetails !== null, orderCode },
    });

    /* P4-BE-11 — the sponsor's own brief is evaluated at once. */
    if (actor.sponsorId !== null && actor.sponsorId === input.sponsorId) {
      await autoApproveOrHold(tx, actor.tenantId, brief.id, now, "create");
    }
    return submitted(tx, actor.tenantId, brief.id);
  }));
}

/** The brief as its submitter is answered: state, how it was approved, and the sponsor-safe status. */
async function submitted(tx: Prisma.TransactionClient, tenantId: string, id: string): Promise<BriefSubmitted> {
  const b = await tx.campaignBrief.findFirstOrThrow({
    /* tenant-scope: the brief this transaction just wrote, in its own tenant. */
    where: { id, tenantId },
    select: { id: true, state: true, autoApproved: true, heldKeys: true, campaign: { select: { id: true } }, package: { select: { athleteCountMax: true, lineItems: true } } },
  });
  return {
    id: b.id,
    state: b.state as BriefState,
    autoApproved: b.autoApproved,
    status: sponsorBriefStatus(b.state, isAdOnlyPackage(b.package)),
    waitingOn: sponsorWaitingOn(b.state, b.heldKeys),
    campaignId: b.campaign?.id ?? null,
  };
}

export type BriefPatch = Partial<Omit<BriefInput, "sponsorId" | "studentCode">>;

/**
 * Change a brief while it is still DRAFT — P4-BE-11. Its own sponsor, or BTG
 * staff who write briefs (`campaignBrief.write`). Locked first, so an edit
 * and BTG's qualify run one after the other; refused (409) once the brief has
 * left DRAFT, so an edit after approval never re-runs the automatic check.
 * The edited brief is evaluated again in the same transaction — the
 * sponsor's own edit, or any edit of a brief held for BTG.
 */
export async function updateBrief(
  actor: Actor,
  briefId: string,
  patch: BriefPatch,
  now = new Date(),
): Promise<BriefSubmitted> {
  assertAllowed(actor, "campaignBrief", "write");
  return staffIfApproved(await prisma.$transaction(async (tx) => {
    const found = await tx.campaignBrief.findFirst({
      where: { ...whereFor(actor, "campaignBrief", "write"), id: briefId },
      select: { id: true, tenantId: true },
    });
    if (!found) throw new ForbiddenError("campaignBrief", "write");
    const state = await lockBrief(tx, found.id, found.tenantId);
    if (state !== "DRAFT") throw new BriefNotEditableError(state ?? "CLOSED");

    const { sponsorId, heldAt, ...before } = await tx.campaignBrief.findFirstOrThrow({
      /* tenant-scope: the brief found through whereFor(campaignBrief, write) and locked. */
      where: { id: found.id, tenantId: found.tenantId },
      select: {
        objective: true, budget: true, packageId: true, startDate: true, endDate: true, sports: true, countryCode: true, stateCodes: true, categories: true,
        excludedCategories: true, channels: true, audienceTiers: true, audienceMinFollowers: true,
        sponsorId: true, heldAt: true,
      },
    });
    const startDate = patch.startDate ?? before.startDate;
    const endDate = patch.endDate ?? before.endDate;
    if (endDate <= startDate) throw new InvalidBriefWindowError();
    if (patch.packageId !== undefined) await assertOwnPackage(tx, found.tenantId, patch.packageId);
    /* POL-BE-107 — the country and states as they will stand after the edit:
       moving a brief abroad needs its states cleared in the same edit. */
    const countryCode = patch.countryCode !== undefined ? briefCountry(patch.countryCode) : before.countryCode;
    assertCountryStates(countryCode, patch.stateCodes ?? before.stateCodes);

    const data = {
      ...(patch.objective !== undefined ? { objective: patch.objective } : {}),
      ...(patch.budget !== undefined ? { budget: patch.budget } : {}),
      ...(patch.packageId !== undefined ? { packageId: patch.packageId || null } : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
      ...(patch.sports !== undefined ? { sports: [...patch.sports] } : {}),
      ...(patch.countryCode !== undefined ? { countryCode } : {}),
      ...(patch.stateCodes !== undefined ? { stateCodes: [...patch.stateCodes] } : {}),
      ...(patch.categories !== undefined ? { categories: [...patch.categories] } : {}),
      ...(patch.excludedCategories !== undefined ? { excludedCategories: uniq(patch.excludedCategories) } : {}),
      ...(patch.channels !== undefined ? { channels: uniq(patch.channels) } : {}),
      ...(patch.audienceTiers !== undefined ? { audienceTiers: uniq(patch.audienceTiers) } : {}),
      ...(patch.audienceMinFollowers !== undefined ? { audienceMinFollowers: patch.audienceMinFollowers } : {}),
    };
    assertNoWantedExcluded(patch.categories ?? before.categories, patch.excludedCategories ?? before.excludedCategories);
    /* POL-BE-116 — the order details, checked against the window as it will stand. */
    if (patch.orderDetails !== undefined) {
      const checked = checkBriefOrderDetails(patch.orderDetails, startDate, endDate);
      (data as Record<string, unknown>).orderDetails = checked ?? Prisma.DbNull;
    }
    if (patch.orderCode !== undefined) (data as Record<string, unknown>).orderCode = checkOrderCode(patch.orderCode);
    await tx.campaignBrief.update({
      /* tenant-scope: the brief found through whereFor(campaignBrief, write) and locked. */
      where: { id: found.id },
      data,
      select: { id: true },
    });
    const changed = Object.keys(data) as (keyof typeof before)[];
    await audit(tx, actor, "brief.update", "CampaignBrief", found.id, {
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: data,
    });

    /* Evaluated again when the automatic path covers it: the sponsor's own
       edit, or a brief already held for BTG (BTG fixing it lets it through).
       A brief BTG filed itself and BTG edits stays BTG's to qualify, as on
       creation. */
    if (actor.sponsorId === sponsorId || heldAt !== null) {
      await autoApproveOrHold(tx, found.tenantId, found.id, now, "edit");
    }
    return submitted(tx, found.tenantId, found.id);
  }));
}

/**
 * P4-BE-12 — a brief approved automatically has just become a campaign; its
 * staffing starts now that the transaction has committed (the sweep is the
 * safety net). Returns the submitted brief unchanged.
 */
async function staffIfApproved(result: BriefSubmitted): Promise<BriefSubmitted> {
  if (!result.autoApproved || !result.campaignId) return result;
  const campaign = await prisma.campaign.findUnique({
    /* tenant-scope: the campaign this request's own transaction just created, by id — read for its tenant. */
    where: { id: result.campaignId },
    select: { tenantId: true, autoStaffing: true },
  });
  /* P9-BE-18 — its edition positions sell first, while it is a DRAFT. */
  if (campaign) await startAutoSale(campaign.tenantId, result.campaignId);
  if (campaign?.autoStaffing) await startAutoStaffing(campaign.tenantId, result.campaignId);
  return result;
}

/**
 * Move a brief through §21, or refuse.
 *
 * Qualification and approval are BTG acts — the matrix gives
 * `campaignBrief.approve` to BTG_ADMIN, CAMPAIGN_MGR and SUPER_ADMIN, and a
 * sponsor holds write on their own brief but not approve.
 */
export async function transitionBrief(
  actor: Actor,
  briefId: string,
  to: BriefState,
  reason?: string,
): Promise<{ id: string; state: BriefState; campaignId?: string }> {
  assertAllowed(actor, "campaignBrief", to === "CLOSED" ? "write" : "approve");
  /* P4-FE-07 — BTG closing a brief says why; the queue shows it back and the
     audit row keeps it. A sponsor withdrawing their own brief owes no reason. */
  const closeReason = to === "CLOSED" ? reason?.trim() || null : null;
  const staffClose = to === "CLOSED" && ["own-tenant", "any"].includes(scopeFor(actor.roles, "campaignBrief", "approve"));
  /* POL-BE-17 — the sponsor's own people withdrawing their request. */
  const sponsorWithdraw = to === "CLOSED" && scopeFor(actor.roles, "campaignBrief", "write") === "own";
  if (staffClose && !closeReason) throw new BriefCloseReasonRequiredError();

  return prisma.$transaction(async (tx) => {
    const found = await tx.campaignBrief.findFirst({
      where: { ...whereFor(actor, "campaignBrief", to === "CLOSED" ? "write" : "approve"), id: briefId },
      select: { id: true, tenantId: true },
    });
    if (!found) throw new ForbiddenError("campaignBrief", "write");

    /* P4-BE-11 — the row lock first: a sponsor's edit (which may approve
       the brief automatically) and this move run one after the other, and
       this one decides on the state read under the lock. */
    const from = await lockBrief(tx, found.id, found.tenantId);
    const brief = await tx.campaignBrief.findFirstOrThrow({
      /* tenant-scope: the brief found through whereFor(campaignBrief) and locked. */
      where: { id: found.id, tenantId: found.tenantId },
      select: {
        objective: true, heldAt: true, sponsorId: true, budget: true, startDate: true, endDate: true,
        sponsor: { select: { name: true } }, package: { select: { name: true, athleteCountMax: true, lineItems: true } },
      },
    });

    const moved = await applyBriefMove(
      tx,
      actor,
      { id: found.id, tenantId: found.tenantId, state: from as BriefState, objective: brief.objective, sponsorName: brief.sponsor.name },
      to,
      { closeReason },
    );
    if (sponsorWithdraw) {
      await notifyBriefWithdrawn(tx, {
        id: found.id, tenantId: found.tenantId, from: from as BriefState, heldAt: brief.heldAt,
        sponsorName: brief.sponsor.name, packageName: brief.package?.name ?? null, note: closeReason,
      });
    }
    /* POL-BE-64 (app review §2) — BTG closing a request emailed nobody. Their
       admins are now told it's closed, with the way to their request and to
       ask BTG. BTG's reason stays internal (it never reaches a sponsor — the
       close panel says so), so the email carries none. */
    if (staffClose && closeReason) {
      const admins = await tx.user.findMany({
        where: { tenantId: found.tenantId, disabledAt: null, sponsorId: brief.sponsorId, roles: { has: "SPONSOR_ADMIN" } },
        select: { id: true, email: true },
        take: 20,
      });
      for (const u of admins) {
        await send(tx, found.tenantId, {
          template: "brief.closedForSponsor",
          to: u.email,
          idempotencyKey: `brief.closedForSponsor:${found.id}:${u.id}`,
          data: {
            sponsorName: brief.sponsor.name, packageName: brief.package?.name ?? "your request",
            contactUrl: `${env.APP_URL.replace(/\/+$/, "")}/contact?topic=campaigns`,
            reviewUrl: `${env.APP_URL.replace(/\/+$/, "")}/sponsor/requests/${encodeURIComponent(found.id)}`,
          },
        });
      }
    }
    /* POL-BE-63 (app review §2) — BTG approving a held brief by hand makes its
       campaign at once, exactly as the automatic approval does (brief-auto.ts),
       instead of waiting silently for a Studio invite. Its staffing and edition
       sale start once this transaction commits (below). */
    if (to === "APPROVED") {
      const campaign = await createCampaignIn(
        tx, actor,
        { id: found.id, tenantId: found.tenantId, sponsorId: brief.sponsorId, budget: brief.budget, startDate: brief.startDate, endDate: brief.endDate, package: brief.package },
        `${brief.sponsor.name} · ${brief.package?.name ?? "Custom"}`.slice(0, 160),
      );
      return { ...moved, campaignId: campaign.id, autoStaffing: campaign.autoStaffing, tenantId: found.tenantId };
    }
    return moved;
  }).then(async (r) => {
    const out = r as { id: string; state: BriefState; campaignId?: string; autoStaffing?: boolean; tenantId?: string };
    if (out.campaignId && out.tenantId) {
      await startAutoSale(out.tenantId, out.campaignId);
      if (out.autoStaffing) await startAutoStaffing(out.tenantId, out.campaignId);
    }
    return { id: out.id, state: out.state, ...(out.campaignId ? { campaignId: out.campaignId } : {}) };
  });
}

export { BRIEF_AUDIT_ACTIONS };
export * from "./brief-state";

/** P4-FE-07 — BTG staff closing a brief must say why. */
export class BriefCloseReasonRequiredError extends Error {
  readonly status = 422;
  constructor() {
    super("Say why this brief is being closed — the reason is kept with it.");
    this.name = "BriefCloseReasonRequiredError";
  }
}

/** POL-BE-116 — the brief's order details: complete, and published inside the campaign's dates. Null: none given. */
function checkBriefOrderDetails(value: unknown, start: Date, end: Date): OrderDetails | null {
  if (value === undefined || value === null) return null;
  const d = requireOrderDetails(value);
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  if (d.publishWindow.start < s || d.publishWindow.end > e) {
    throw new OrderDetailsError(`The publish window (${d.publishWindow.start} to ${d.publishWindow.end}) has to sit inside the campaign's dates (${s} to ${e}).`);
  }
  return d;
}

function checkOrderCode(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!ORDER_CODE.test(value)) throw new OrderDetailsError("The order code is three capital letters.");
  return value;
}
