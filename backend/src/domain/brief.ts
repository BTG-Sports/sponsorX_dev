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

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { scopeFor } from "../auth/policy";
import { ForbiddenError } from "../auth/errors";
import type { BriefState } from "./brief-state";
import type { BrandCategory } from "./brand-categories";
import { applyBriefMove, BRIEF_AUDIT_ACTIONS, lockBrief } from "./brief-moves";
import { autoApproveOrHold } from "./brief-auto";
import { startAutoStaffing } from "./auto-staffing";
import { sponsorBriefStatus, type SponsorBriefStatus } from "./brief-auto-rules";

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
  stateCodes: readonly string[];
  categories: readonly BrandCategory[];
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
        stateCodes: [...input.stateCodes],
        categories: [...input.categories],
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, "brief.create", "CampaignBrief", brief.id, {
      after: { state: "DRAFT", sponsorId: input.sponsorId, budget: input.budget },
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
    select: { id: true, state: true, autoApproved: true, campaign: { select: { id: true } } },
  });
  return {
    id: b.id,
    state: b.state as BriefState,
    autoApproved: b.autoApproved,
    status: sponsorBriefStatus(b.state),
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
        objective: true, budget: true, packageId: true, startDate: true, endDate: true, sports: true, stateCodes: true, categories: true,
        sponsorId: true, heldAt: true,
      },
    });
    const startDate = patch.startDate ?? before.startDate;
    const endDate = patch.endDate ?? before.endDate;
    if (endDate <= startDate) throw new InvalidBriefWindowError();
    if (patch.packageId !== undefined) await assertOwnPackage(tx, found.tenantId, patch.packageId);

    const data = {
      ...(patch.objective !== undefined ? { objective: patch.objective } : {}),
      ...(patch.budget !== undefined ? { budget: patch.budget } : {}),
      ...(patch.packageId !== undefined ? { packageId: patch.packageId || null } : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
      ...(patch.sports !== undefined ? { sports: [...patch.sports] } : {}),
      ...(patch.stateCodes !== undefined ? { stateCodes: [...patch.stateCodes] } : {}),
      ...(patch.categories !== undefined ? { categories: [...patch.categories] } : {}),
    };
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
): Promise<{ id: string; state: BriefState }> {
  assertAllowed(actor, "campaignBrief", to === "CLOSED" ? "write" : "approve");
  /* P4-FE-07 — BTG closing a brief says why; the queue shows it back and the
     audit row keeps it. A sponsor withdrawing their own brief owes no reason. */
  const closeReason = to === "CLOSED" ? reason?.trim() || null : null;
  const staffClose = to === "CLOSED" && ["own-tenant", "any"].includes(scopeFor(actor.roles, "campaignBrief", "approve"));
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
      select: { objective: true, sponsor: { select: { name: true } } },
    });

    return applyBriefMove(
      tx,
      actor,
      { id: found.id, tenantId: found.tenantId, state: from as BriefState, objective: brief.objective, sponsorName: brief.sponsor.name },
      to,
      { closeReason },
    );
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
