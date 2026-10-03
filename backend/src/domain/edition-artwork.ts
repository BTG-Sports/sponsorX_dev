/**
 * Edition ad artwork on the approval board — P9-BE-16, NEXT spec §3, §11.
 *
 * OPTION B (programme owner, 2026-10-02): the approval board learns a second
 * kind of subject. A sold AdSlot's artwork is an `EditionAsset` (kind
 * AD_CREATIVE) carrying the deliverable review states — not a Deliverable on
 * a made-up Campaign Order, which an ad-only NEXT campaign never has.
 *
 * THE SAME CHAIN, NOT A COPY OF IT. Every move is checked against
 * `canTransitionDeliverable` / `canRequestRevision` from deliverable-state.ts.
 * The only additions are about who moves it (edition-artwork-rules.ts): the
 * sponsor's sign-off is mandatory, and only the BUYING sponsor gives it.
 *
 *   upload (sponsor or BTG) → DRAFT_SUBMITTED
 *   BTG starts review       → BTG_REVIEW         (BTG_ADMIN / CAMPAIGN_MGR)
 *   BTG sends it on         → SPONSOR_REVIEW     (the same desk roles)
 *   the buying sponsor      → APPROVED           (editionArtwork.approve)
 *   either reviewer, at their own step, with a note → DRAFT_SUBMITTED
 *
 * Every decision is audited (`editionArtwork.<verb>`) and emailed to the
 * other party in the same transaction — the deliverable chain's rule.
 *
 * THE GATE. `artworkGap` is what `transitionEdition` asks before production:
 * every sold slot whose artwork is missing or not APPROVED.
 *
 * P9-BE-22 (item 24) — PICKED UP ON UPLOAD. Every upload is checked the
 * moment it is recorded (`artwork-checks-rules.ts`): a file problem sends it
 * straight back to its supplier with the reasons emailed, and it never
 * reaches BTG; otherwise the system moves it DRAFT_SUBMITTED → BTG_REVIEW
 * itself — and, for a sponsor with a clean record (`artwork-trust.ts`), on
 * to SPONSOR_REVIEW, skipping BTG. BTG can still ask for changes on a
 * skipped artwork while the sponsor reviews it, and that resets the
 * sponsor's record. When the sponsor approves, the licence `rightsGap`
 * needs is recorded in the same transaction (`recordAdLicenceIn`).
 */
import { randomUUID } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS, type AuditAction } from "../db/audit";
import { env } from "../config/env";
import { send, type EmailTemplate } from "../lib/email";
import { presignPrivateDownload, presignPrivateUpload } from "../lib/storage";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, scopeOf, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  canRequestRevision,
  canTransitionDeliverable,
  legalDeliverableTransitions,
  type DeliverableState,
} from "./deliverable-state";
import {
  ARTWORK_STATES,
  artworkBlockers,
  artworkKeyPrefix,
  canUploadArtwork,
  type ArtworkBlocker,
  type ArtworkState,
  type SlotArtworkState,
} from "./edition-artwork-rules";
import {
  artworkChecks,
  artworkVerdict,
  readArtworkChecks,
  returnReasons,
  type ArtworkCheck,
  type ArtworkSkipDecision,
  type SponsorTrust,
} from "./artwork-checks-rules";
import { decideArtworkSkip, lockSponsorArtwork, sponsorTrustOf } from "./artwork-trust";
import { checkRestricted } from "./restricted-words";
import { recordAdLicenceIn } from "./content-rights";
import { normalizeContentType } from "./content-check-rules";

type Tx = Prisma.TransactionClient;

/** The system, for the moves it makes on its own (P9-BE-22). */
const SYSTEM = (tenantId: string) => ({ userId: null, tenantId });

/* ── errors ─────────────────────────────────────────────────────────────── */

export class IllegalArtworkTransitionError extends Error {
  readonly status = 409;
  constructor(from: DeliverableState, to: DeliverableState) {
    super(
      `Ad artwork cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${legalDeliverableTransitions(from).join(", ") || "none"}.`,
    );
    this.name = "IllegalArtworkTransitionError";
  }
}

/** A legal move, but not this person's to make at this step. */
export class ArtworkTurnError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "ArtworkTurnError";
  }
}

export class ArtworkRevisionNoteRequiredError extends Error {
  readonly status = 400;
  constructor() {
    super("Asking for changes needs a note — whoever supplies the artwork gets these words, and \"rejected\" alone is not an instruction.");
    this.name = "ArtworkRevisionNoteRequiredError";
  }
}

export class ArtworkKeyError extends Error {
  readonly status = 422;
  constructor() {
    super("That file was not uploaded for this ad slot. Start the upload again from this slot.");
    this.name = "ArtworkKeyError";
  }
}

/** P9-BE-22 — the automatic checks sent this file back to its supplier. */
export class ArtworkFailedChecksError extends Error {
  readonly status = 409;
  constructor() {
    super("This file failed the automatic checks and is back with the sponsor — it reaches BTG once a file passes.");
    this.name = "ArtworkFailedChecksError";
  }
}

/** The edition has gone to production: its artwork is final. */
export class ArtworkLockedError extends Error {
  readonly status = 409;
  constructor(state: string) {
    super(`This edition is ${state} — its ad artwork can no longer change.`);
    this.name = "ArtworkLockedError";
  }
}

/* ── reach ──────────────────────────────────────────────────────────────── */

/** Editions still taking artwork. A slot is only sold while SELLING, and the
 *  artwork must be final before IN_PRODUCTION. */
const OPEN_EDITION_STATES = ["SELLING", "CLOSED"];

const SLOT_SELECT = {
  id: true, tenantId: true, editionId: true, slotCode: true, kind: true, campaignId: true,
  edition: { select: { label: true, state: true } },
  campaign: {
    select: {
      id: true, name: true, sponsorId: true,
      /* P9-BE-22 — the categories the trusted skip checks again. */
      sponsor: { select: { name: true, categories: true } },
      brief: { select: { categories: true } },
    },
  },
} as const;

/**
 * A SOLD slot the actor may supply artwork for: its campaign must be one the
 * actor reads (a sponsor: their own; BTG: the tenant's), and the actor must
 * hold `editionArtwork.write`. Composed from the two existing scopes, so the
 * slot's reach can never be wider than the campaign's.
 */
async function reachSoldSlot(db: Tx | typeof prisma, actor: Actor, slotId: string) {
  assertAllowed(actor, "editionArtwork", "write");
  const slot = await db.adSlot.findFirst({
    where: { id: slotId, campaignId: { not: null }, campaign: { is: whereFor(actor, "campaign", "read") } },
    select: SLOT_SELECT,
  });
  if (!slot || !slot.campaign) throw new ForbiddenError("editionArtwork", "write");
  return { ...slot, campaign: slot.campaign };
}

/** True when the actor is on BTG's side of the desk (tenant-wide write). */
function isDesk(actor: Actor): boolean {
  const scope = scopeOf(actor, "editionArtwork", "write");
  return scope === "any" || scope === "own-tenant";
}

/* ── notifications ──────────────────────────────────────────────────────── */

const appUrl = () => env.APP_URL.replace(/\/+$/, "");

/** BTG's side: the deliverable board's own roles. */
const DESK_ROLES = ["BTG_ADMIN", "CAMPAIGN_MGR"] as const;

type Party = "BTG" | "SPONSOR";
type Subject = {
  id: string; tenantId: string; slotCode: string; editionLabel: string;
  campaignId: string; campaignName: string; sponsorId: string; sponsorName: string;
};

async function recipients(tx: Tx, s: Subject, party: Party) {
  return tx.user.findMany({
    where: party === "BTG"
      ? { tenantId: s.tenantId, disabledAt: null, roles: { hasSome: [...DESK_ROLES] } }
      : { tenantId: s.tenantId, disabledAt: null, sponsorId: s.sponsorId, roles: { has: "SPONSOR_ADMIN" } },
    select: { id: true, email: true },
    take: 50,
  });
}

/** Email the other party, inside the decision's transaction. Keyed on the
 *  artwork, the step and the version, so a retry never sends twice and a
 *  second round of review sends again. */
async function tell(
  tx: Tx,
  s: Subject,
  party: Party,
  template: EmailTemplate,
  occurrence: string,
  data: Record<string, string> = {},
) {
  const reviewUrl = party === "BTG" ? `${appUrl()}/admin/approvals` : `${appUrl()}/sponsor/campaigns/${s.campaignId}`;
  for (const u of await recipients(tx, s, party)) {
    await send(tx, s.tenantId, {
      template,
      to: u.email,
      idempotencyKey: `${template}:${s.id}:${occurrence}:${u.id}`,
      data: {
        sponsorName: s.sponsorName, campaignName: s.campaignName, slotCode: s.slotCode,
        editionLabel: s.editionLabel, reviewUrl, ...data,
      },
    });
  }
}

/* ── upload (P5-BE-06's presign, reused) ────────────────────────────────── */

/**
 * Presign a direct-to-R2 upload of a sold slot's artwork, to the private
 * bucket. The key is built here — a client-chosen key is a client-chosen path
 * — and the register step accepts only a key under this slot's prefix.
 *
 * P9-BE-22 — the file's type AND size are signed into the PUT (the bucket
 * refuses a PUT with another Content-Type or another length) and recorded on
 * the grant's audit row, which is where the upload's checks read them from.
 */
export async function presignArtworkUpload(
  actor: Actor,
  slotId: string,
  contentType: string,
  bytes: number,
): Promise<{ url: string; key: string }> {
  const slot = await reachSoldSlot(prisma, actor, slotId);
  const key = `${artworkKeyPrefix(slot.tenantId, slot.id)}${randomUUID()}`;
  const url = await presignPrivateUpload(actor, key, contentType, { entity: "AdSlot", entityId: slot.id }, {
    contentLength: bytes,
    signContentType: true,
  });
  return { url, key };
}

/** Where a registered upload went: back to its supplier, BTG, or the sponsor. */
export type ArtworkRoute = "RETURNED" | "BTG_REVIEW" | "SPONSOR_REVIEW";

/**
 * Record an uploaded file as the slot's artwork, check it, and route it.
 *
 * The first upload creates the artwork (NOT_STARTED → DRAFT_SUBMITTED, the
 * deliverable chain's first move). Another upload while it is DRAFT_SUBMITTED
 * — back with its supplier after a change request or a failed check —
 * replaces the file, counts the version up and answers the request.
 * Mid-review or once approved, the file cannot change.
 *
 * P9-BE-22 — in the same transaction:
 *   - the checks run on the file as its grant described it;
 *   - a file problem: it stays DRAFT_SUBMITTED, back with its supplier
 *     (`artworkChecksPassed = false`), audited as the system's return, and
 *     the sponsor is emailed every reason. It never reaches BTG;
 *   - otherwise the system picks it up: DRAFT_SUBMITTED → BTG_REVIEW, and
 *     for a clean-record sponsor on to SPONSOR_REVIEW (`btgReviewSkipped`,
 *     with the reason) — each step checked against the deliverable table,
 *     audited as the system, and emailed to whoever's turn it now is.
 *     Restricted words in the title hold it for BTG: picked up, never
 *     skipped.
 *
 * The write is conditional on the row being as it was read, so two uploads
 * racing record one and refuse the other — never two verdicts.
 */
export async function registerArtwork(
  actor: Actor,
  slotId: string,
  input: { r2Key: string; title?: string | null },
): Promise<{ id: string; state: ArtworkState; version: number; route: ArtworkRoute; checks: ArtworkCheck[]; btgReviewSkipped: boolean }> {
  return prisma.$transaction(async (tx) => {
    const slot = await reachSoldSlot(tx, actor, slotId);
    if (!input.r2Key.startsWith(artworkKeyPrefix(slot.tenantId, slot.id))) throw new ArtworkKeyError();
    if (!OPEN_EDITION_STATES.includes(slot.edition.state)) throw new ArtworkLockedError(slot.edition.state);

    const existing = await tx.editionAsset.findFirst({
      where: { tenantId: slot.tenantId, adSlotId: slot.id },
      select: { id: true, reviewState: true, artworkVersion: true, revisionNote: true, btgRevisionAt: true },
    });
    const from = (existing?.reviewState as ArtworkState | null) ?? "NOT_STARTED";
    if (!canUploadArtwork(from)) {
      throw new ArtworkTurnError(
        from === "APPROVED"
          ? "This artwork is approved — it can't be replaced."
          : "This artwork is being reviewed — it can't be replaced until a reviewer asks for changes.",
      );
    }
    /* The first upload is the deliverable chain's first move. */
    if (from === "NOT_STARTED" && !canTransitionDeliverable("NOT_STARTED", "DRAFT_SUBMITTED")) {
      throw new IllegalArtworkTransitionError("NOT_STARTED", "DRAFT_SUBMITTED");
    }

    /* P9-BE-22 — the file as its grant described it: the type and size the
       PUT was signed for, recorded server-side when the URL was handed out.
       A key this slot was never granted has neither, and fails. */
    const grant = await tx.auditLog.findFirst({
      /* tenant-scope: the grant was audited under the presigning actor's
         tenant — the slot's own (reached above through whereFor(campaign)),
         or this actor's; keyed by this slot and this key. */
      where: {
        tenantId: { in: [...new Set([slot.tenantId, actor.tenantId])] },
        entity: "AdSlot", entityId: slot.id,
        action: AUDIT_ACTIONS.storage.privateUploadGrant,
        after: { path: ["key"], equals: input.r2Key },
      },
      select: { after: true },
      orderBy: { at: "desc" },
    });
    const granted = (grant?.after ?? null) as { contentType?: unknown; bytes?: unknown } | null;
    const contentType = normalizeContentType(typeof granted?.contentType === "string" ? granted.contentType : null);
    const bytes = typeof granted?.bytes === "number" ? granted.bytes : null;
    const text = input.title?.trim() || null;
    const checks = artworkChecks({ contentType, bytes, text, restricted: text ? await checkRestricted(tx, slot.tenantId, text) : [] });
    const verdict = artworkVerdict(checks);
    const passed = verdict !== "RETURN";

    /* Read before any write: the lock, then the sponsor's record. */
    let skip: ArtworkSkipDecision | null = null;
    if (verdict === "PASS") {
      skip = await decideArtworkSkip(tx, {
        tenantId: slot.tenantId,
        sponsorId: slot.campaign.sponsorId,
        sponsorCategories: slot.campaign.sponsor.categories,
        briefCategories: slot.campaign.brief?.categories ?? [],
        btgRevisionAt: existing?.btgRevisionAt ?? null,
      });
    } else if (verdict === "HOLD") {
      skip = { skip: false, reason: "Restricted words in the title — reviewed by BTG" };
    }

    /* Each system step is the deliverable table's own. */
    const to: ArtworkState = !passed ? "DRAFT_SUBMITTED" : skip?.skip ? "SPONSOR_REVIEW" : "BTG_REVIEW";
    const via: ArtworkState[] = !passed ? [] : skip?.skip ? ["BTG_REVIEW", "SPONSOR_REVIEW"] : ["BTG_REVIEW"];
    let at: DeliverableState = "DRAFT_SUBMITTED";
    for (const next of via) {
      if (!canTransitionDeliverable(at, next)) throw new IllegalArtworkTransitionError(at, next);
      at = next;
    }

    const version = (existing?.artworkVersion ?? 0) + 1;
    const now = new Date();
    const title = text ?? `${slot.campaign.sponsor.name} — ${slot.slotCode} artwork`;
    const fields = {
      reviewState: to,
      r2Key: input.r2Key, artworkVersion: version, submittedAt: now, revisionNote: null,
      artworkContentType: contentType, artworkBytes: bytes,
      artworkChecks: checks as unknown as Prisma.InputJsonValue,
      artworkChecksPassed: passed, artworkCheckedAt: now,
      /* Recomputed on every upload. */
      btgReviewSkipped: Boolean(skip?.skip), skipReason: skip?.skip ? skip.reason : null,
    };
    let id: string;
    if (existing) {
      const written = await tx.editionAsset.updateMany({
        /* tenant-scope: the row read above in the slot's tenant, only while unchanged. */
        where: { id: existing.id, tenantId: slot.tenantId, reviewState: from, artworkVersion: existing.artworkVersion },
        data: { ...fields, ...(text ? { title } : {}) },
      });
      if (written.count !== 1) throw new ArtworkTurnError("Another upload landed a moment ago — refresh to see it.");
      id = existing.id;
    } else {
      id = (await tx.editionAsset.create({
        data: {
          tenantId: slot.tenantId, editionId: slot.editionId, kind: "AD_CREATIVE", title,
          /* The advertiser's own work, whoever uploads the file. */
          sourceKind: "THIRD_PARTY", adSlotId: slot.id, ...fields,
        },
        select: { id: true },
      })).id;
    }

    await audit(tx, actor, AUDIT_ACTIONS.editionArtwork.submit, "EditionAsset", id, {
      before: { state: from, version: existing?.artworkVersion ?? 0, revisionNote: existing?.revisionNote ?? null },
      after: {
        state: "DRAFT_SUBMITTED", version, r2Key: input.r2Key, slotId: slot.id, slotCode: slot.slotCode,
        checksPassed: passed, checks, ...(skip ? { btgReview: { skipped: skip.skip, reason: skip.reason } } : {}),
      },
    });

    const subject: Subject = {
      id, tenantId: slot.tenantId, slotCode: slot.slotCode, editionLabel: slot.edition.label,
      campaignId: slot.campaign.id, campaignName: slot.campaign.name,
      sponsorId: slot.campaign.sponsorId, sponsorName: slot.campaign.sponsor.name,
    };

    if (!passed) {
      const reasons = returnReasons(checks);
      await audit(tx, SYSTEM(slot.tenantId), AUDIT_ACTIONS.editionArtwork.systemReturn, "EditionAsset", id, {
        before: { state: "DRAFT_SUBMITTED" },
        after: { state: "DRAFT_SUBMITTED", version, reasons },
      });
      /* It is the sponsor's artwork: they hear every reason, whoever uploaded. */
      await tell(tx, subject, "SPONSOR", "editionArtwork.checksFailed", `v${version}`, {
        version: String(version),
        reasons: reasons.map((r) => `- ${r}`).join("\n"),
      });
      return { id, state: "DRAFT_SUBMITTED" as const, version, route: "RETURNED" as const, checks, btgReviewSkipped: false };
    }

    await audit(tx, SYSTEM(slot.tenantId), AUDIT_ACTIONS.editionArtwork.btgReview, "EditionAsset", id, {
      before: { state: "DRAFT_SUBMITTED" },
      after: { state: "BTG_REVIEW", slotCode: slot.slotCode, by: "SYSTEM", reason: "Passed the automatic checks" },
    });
    if (skip?.skip) {
      await audit(tx, SYSTEM(slot.tenantId), AUDIT_ACTIONS.editionArtwork.btgReviewSkipped, "EditionAsset", id, {
        before: { state: "BTG_REVIEW" },
        after: { state: "SPONSOR_REVIEW", via, reason: skip.reason },
      });
      /* Straight to the sponsor's sign-off. */
      await tell(tx, subject, "SPONSOR", "editionArtwork.readyForSignOff", `v${version}:SPONSOR_REVIEW`, { skipped: "yes" });
      return { id, state: "SPONSOR_REVIEW" as const, version, route: "SPONSOR_REVIEW" as const, checks, btgReviewSkipped: true };
    }

    /* On BTG's desk. The other party hears it is in: a sponsor's upload
       goes to BTG's desk; BTG uploading for the sponsor tells the sponsor. */
    await tell(tx, subject, isDesk(actor) ? "SPONSOR" : "BTG", "editionArtwork.submitted", `v${version}`, {
      version: String(version),
      by: isDesk(actor) ? "BTG" : slot.campaign.sponsor.name,
    });
    return { id, state: "BTG_REVIEW" as const, version, route: "BTG_REVIEW" as const, checks, btgReviewSkipped: false };
  });
}

/* ── the chain ──────────────────────────────────────────────────────────── */

const ROW_SELECT = {
  id: true, tenantId: true, reviewState: true, revisionNote: true, artworkVersion: true,
  artworkChecksPassed: true, btgReviewSkipped: true,
  edition: { select: { label: true, publishTarget: true, printDate: true } },
  adSlot: {
    select: {
      id: true, slotCode: true,
      campaign: { select: { id: true, name: true, sponsorId: true, sponsor: { select: { name: true } } } },
    },
  },
} as const;

type Row = {
  id: string; tenantId: string; reviewState: string | null; revisionNote: string | null; artworkVersion: number | null;
  artworkChecksPassed: boolean | null; btgReviewSkipped: boolean;
  edition: { label: string; publishTarget: Date; printDate: Date | null };
  adSlot: { id: string; slotCode: string; campaign: { id: string; name: string; sponsorId: string; sponsor: { name: string } } | null } | null;
};
type Reached = Row & { adSlot: { id: string; slotCode: string; campaign: { id: string; name: string; sponsorId: string; sponsor: { name: string } } } };

type Decision = {
  action: "write" | "approve";
  tenantWide: boolean;
  auditAction: AuditAction;
  /** Narrows WHO may make this legal move, at which step. */
  turn?: (from: ArtworkState, row: Row) => string | null;
  /** Inside the transaction, before the write — P9-BE-22's sponsor lock. */
  beforeWrite?: (tx: Tx, row: Reached) => Promise<void>;
  /** Computed when written, inside the transaction, not when called. */
  data?: (from: ArtworkState) => Prisma.EditionAssetUpdateManyMutationInput;
  /** Inside the transaction, after the write — P9-BE-22's ad licence. */
  afterWrite?: (tx: Tx, row: Reached) => Promise<void>;
  after?: Record<string, unknown>;
  notify?: { party: Party; template: EmailTemplate; data?: Record<string, string> };
};

/**
 * The shared body of every review step — deliverable.ts's `move`, for this
 * subject: read the artwork the actor reaches, check the move against the
 * deliverable transition table, write, audit, email — in one transaction,
 * with the read inside, and the write conditional on the state it read, so
 * two decisions racing on one artwork record one and refuse the other.
 */
async function decide(actor: Actor, artworkId: string, to: DeliverableState, d: Decision) {
  if (d.tenantWide) assertTenantWide(actor, "editionArtwork", d.action);
  else assertAllowed(actor, "editionArtwork", d.action);

  return prisma.$transaction(async (tx) => {
    const found = (await tx.editionAsset.findFirst({
      where: { ...whereFor(actor, "editionArtwork", d.action), id: artworkId },
      select: ROW_SELECT,
    })) as Row | null;
    if (!found || !found.reviewState || !found.adSlot?.campaign) throw new ForbiddenError("editionArtwork", d.action);
    const row = found as Reached;

    const from = row.reviewState as ArtworkState;
    if (!canTransitionDeliverable(from, to)) throw new IllegalArtworkTransitionError(from, to);
    const refused = d.turn?.(from, row);
    if (refused) throw new ArtworkTurnError(refused);

    await d.beforeWrite?.(tx, row);
    const written = await tx.editionAsset.updateMany({
      /* tenant-scope: the row read above through whereFor, only while it is in the state read. */
      where: { id: row.id, tenantId: row.tenantId, reviewState: from as Prisma.EditionAssetWhereInput["reviewState"] },
      data: { reviewState: to as Prisma.EditionAssetUpdateManyMutationInput["reviewState"], ...d.data?.(from) },
    });
    if (written.count !== 1) throw new ArtworkTurnError("Someone else decided on this artwork a moment ago — refresh to see where it is.");
    await audit(tx, actor, d.auditAction, "EditionAsset", row.id, {
      before: { state: from },
      after: { state: to, slotCode: row.adSlot.slotCode, ...d.after },
    });
    await d.afterWrite?.(tx, row);

    if (d.notify) {
      const c = row.adSlot.campaign;
      await tell(
        tx,
        {
          id: row.id, tenantId: row.tenantId, slotCode: row.adSlot.slotCode, editionLabel: row.edition.label,
          campaignId: c.id, campaignName: c.name, sponsorId: c.sponsorId, sponsorName: c.sponsor.name,
        },
        d.notify.party,
        d.notify.template,
        `v${row.artworkVersion ?? 0}:${to}`,
        d.notify.data,
      );
    }
    return { id: row.id, state: to as ArtworkState };
  });
}

/**
 * BTG picks it up: DRAFT_SUBMITTED → BTG_REVIEW. Since P9-BE-22 the system
 * does this on upload; by hand it is left for artwork uploaded before the
 * checks existed. Not while a revision is open, and never a file the checks
 * sent back — there is nothing new to review until the next file lands.
 */
export function startArtworkReview(actor: Actor, artworkId: string) {
  return decide(actor, artworkId, "BTG_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.editionArtwork.btgReview,
    turn: (_from, row) => {
      if (row.artworkChecksPassed === false) throw new ArtworkFailedChecksError();
      return row.revisionNote ? "Changes were asked for — the new version has to be uploaded before BTG reviews it again." : null;
    },
  });
}

/**
 * BTG sends it to the buying sponsor: BTG_REVIEW → SPONSOR_REVIEW.
 *
 * P9-BE-22 — a BTG reviewer passed it: one clean BTG review on the sponsor's
 * record (`btgPassedAt`). Tenant-wide write is BTG's alone, and the state
 * table allows this move only from BTG_REVIEW.
 */
export function sendArtworkToSponsor(actor: Actor, artworkId: string) {
  return decide(actor, artworkId, "SPONSOR_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.editionArtwork.sponsorReview,
    data: () => ({ btgPassedAt: new Date() }),
    notify: { party: "SPONSOR", template: "editionArtwork.readyForSignOff" },
  });
}

/**
 * The buying sponsor signs it off: SPONSOR_REVIEW → APPROVED.
 *
 * `approve` is held by SPONSOR_ADMIN alone (own-campaign), so a different
 * sponsor does not reach the row (403) and BTG cannot sign off for an
 * advertiser. BTG_REVIEW → APPROVED is a legal deliverable move, refused
 * here: an ad does not skip its sponsor.
 *
 * P9-BE-22 — in the same transaction, the sponsor's licence for this
 * artwork (`recordAdLicenceIn`): digital and print, for the edition's run.
 * Once per artwork.
 */
export function approveArtwork(actor: Actor, artworkId: string) {
  return decide(actor, artworkId, "APPROVED", {
    action: "approve",
    tenantWide: false,
    auditAction: AUDIT_ACTIONS.editionArtwork.approve,
    turn: (from) => (from === "SPONSOR_REVIEW" ? null : "BTG reviews the artwork and sends it to you before you can approve it."),
    afterWrite: async (tx, row) => {
      await recordAdLicenceIn(tx, row.tenantId, {
        id: row.id, version: row.artworkVersion ?? 1, slotId: row.adSlot.id,
        campaignId: row.adSlot.campaign.id, sponsorName: row.adSlot.campaign.sponsor.name,
        edition: { publishTarget: row.edition.publishTarget, printDate: row.edition.printDate },
      });
    },
    notify: { party: "BTG", template: "editionArtwork.approved" },
  });
}

/**
 * Either reviewer asks for changes, at their own step, with a note:
 * BTG_REVIEW (BTG) or SPONSOR_REVIEW (the buying sponsor) → DRAFT_SUBMITTED.
 * The note stays on the artwork until the next upload answers it, and goes
 * to the other party by email.
 *
 * P9-BE-22 — BTG may also ask from SPONSOR_REVIEW when the artwork skipped
 * BTG's review: a trusted sponsor's ad can still be stopped while they
 * review it. A BTG revision (never the sponsor's, never the system's) takes
 * the sponsor's artwork lock and stamps `btgRevisionAt`: this artwork goes
 * to BTG from now on, and the sponsor's clean record starts again from 0.
 */
export async function requestArtworkRevision(actor: Actor, artworkId: string, note: string) {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) throw new ArtworkRevisionNoteRequiredError();
  const desk = isDesk(actor);
  return decide(actor, artworkId, "DRAFT_SUBMITTED", {
    action: desk ? "write" : "approve",
    tenantWide: desk,
    auditAction: AUDIT_ACTIONS.editionArtwork.requestRevision,
    turn: (from, row) => {
      if (!canRequestRevision(from)) return "Changes can be asked for only while the artwork is being reviewed.";
      if (desk && from === "SPONSOR_REVIEW" && !row.btgReviewSkipped) {
        return "The artwork is with the sponsor for sign-off — only they can ask for changes now.";
      }
      if (desk && from !== "BTG_REVIEW" && from !== "SPONSOR_REVIEW") return "Changes can be asked for only while the artwork is being reviewed.";
      if (!desk && from !== "SPONSOR_REVIEW") return "BTG is still reviewing this artwork — it reaches you once BTG sends it.";
      return null;
    },
    ...(desk
      ? {
          /* The sponsor's lock BEFORE the stamp — the same lock an upload
             takes before it reads the record — so an upload racing this
             revision never skips on the record it breaks. */
          beforeWrite: (tx: Tx, row: Reached) => lockSponsorArtwork(tx, row.tenantId, row.adSlot.campaign.sponsorId),
          data: () => ({ revisionNote: trimmed, btgRevisionAt: new Date() }),
        }
      : { data: () => ({ revisionNote: trimmed }) }),
    after: { reason: trimmed, by: desk ? "BTG" : "SPONSOR" },
    notify: { party: desk ? "SPONSOR" : "BTG", template: "editionArtwork.revisionRequested", data: { reason: trimmed, by: desk ? "BTG" : "the sponsor" } },
  });
}


/* ── reads ──────────────────────────────────────────────────────────────── */

const LIST_SELECT = {
  id: true, tenantId: true, title: true, reviewState: true, artworkVersion: true, submittedAt: true, revisionNote: true, createdAt: true,
  artworkChecks: true, artworkChecksPassed: true, artworkCheckedAt: true, btgReviewSkipped: true, skipReason: true,
  edition: { select: { id: true, label: true, state: true, publication: { select: { name: true } } } },
  adSlot: {
    select: {
      id: true, slotCode: true, kind: true,
      campaign: { select: { id: true, name: true, sponsorId: true, sponsor: { select: { name: true } } } },
    },
  },
} as const;

type ListRow = {
  id: string; tenantId: string; title: string; reviewState: string | null; artworkVersion: number | null;
  submittedAt: Date | null; revisionNote: string | null; createdAt: Date;
  artworkChecks: unknown; artworkChecksPassed: boolean | null; artworkCheckedAt: Date | null;
  btgReviewSkipped: boolean; skipReason: string | null;
  edition: { id: string; label: string; state: string; publication: { name: string } };
  adSlot: { id: string; slotCode: string; kind: string; campaign: { id: string; name: string; sponsorId: string; sponsor: { name: string } } | null } | null;
};

/**
 * The board's row: `subject` says which kind of thing is being approved.
 *
 * P9-BE-22 — `checks` (the latest upload's, null before the checks existed)
 * and `checksPassed`; `sentBack` when the checks returned it to its supplier,
 * with each failure in words; `btgReviewSkipped`. BTG's desk also gets the
 * skip's reason and the sponsor's trust (`listArtwork`).
 */
export function artworkOut(a: ListRow, desk = false) {
  const checks = readArtworkChecks(a.artworkChecks);
  const returned = a.reviewState === "DRAFT_SUBMITTED" && a.artworkChecksPassed === false;
  return {
    subject: "EDITION_ARTWORK" as const,
    id: a.id,
    title: a.title,
    state: a.reviewState as ArtworkState,
    version: a.artworkVersion ?? 0,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    revision: a.revisionNote ? { reason: a.revisionNote } : null,
    checks,
    checksPassed: a.artworkChecksPassed,
    sentBack: returned
      ? { by: "SYSTEM" as const, at: a.artworkCheckedAt?.toISOString() ?? null, failed: returnReasons(checks ?? []) }
      : null,
    btgReviewSkipped: a.btgReviewSkipped,
    ...(desk ? { skipReason: a.skipReason } : {}),
    edition: { id: a.edition.id, label: a.edition.label, state: a.edition.state, publication: a.edition.publication.name },
    slot: a.adSlot ? { id: a.adSlot.id, slotCode: a.adSlot.slotCode, kind: a.adSlot.kind } : null,
    campaign: a.adSlot?.campaign
      ? { id: a.adSlot.campaign.id, name: a.adSlot.campaign.name, sponsorName: a.adSlot.campaign.sponsor.name }
      : null,
  };
}

/**
 * GET /edition-artwork — the artwork the actor reaches (BTG: the tenant's;
 * a sponsor: their own campaigns'), oldest submission first.
 *
 * P9-BE-22 — `btgSkipped: true` lists only artwork that skipped BTG's
 * review (BTG's "Skipped BTG review" tab). For BTG's desk each row carries
 * the sponsor's trust: `{ trusted, cleanStreak, needed }` — "3 of 3 clean".
 */
export async function listArtwork(
  actor: Actor,
  filters: { states?: string[]; editionId?: string; campaignId?: string; btgSkipped?: boolean } = {},
) {
  const states = (filters.states ?? []).filter((s): s is ArtworkState => (ARTWORK_STATES as readonly string[]).includes(s));
  const rows = (await prisma.editionAsset.findMany({
    where: {
      AND: [
        whereFor(actor, "editionArtwork", "read"),
        { adSlotId: { not: null } },
        ...(states.length ? [{ reviewState: { in: states } }] : []),
        ...(filters.editionId ? [{ editionId: filters.editionId }] : []),
        ...(filters.campaignId ? [{ adSlot: { is: { campaignId: filters.campaignId } } }] : []),
        ...(filters.btgSkipped ? [{ btgReviewSkipped: true }] : []),
      ],
    },
    select: LIST_SELECT,
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 300,
  })) as ListRow[];

  const desk = isDeskReader(actor);
  if (!desk) return rows.map((a) => artworkOut(a));
  /* One record per sponsor on the page, read in the row's own tenant. */
  const trust = new Map<string, SponsorTrust>();
  for (const a of rows) {
    const c = a.adSlot?.campaign;
    if (!c || trust.has(c.sponsorId)) continue;
    trust.set(c.sponsorId, await sponsorTrustOf(prisma, a.tenantId, c.sponsorId));
  }
  return rows.map((a) => ({
    ...artworkOut(a, true),
    sponsorTrust: a.adSlot?.campaign ? trust.get(a.adSlot.campaign.sponsorId) ?? null : null,
  }));
}

/** True when the actor reads artwork across the tenant — BTG's desk. */
function isDeskReader(actor: Actor): boolean {
  const scope = scopeOf(actor, "editionArtwork", "read");
  return scope === "any" || scope === "own-tenant";
}


/**
 * GET /campaigns/:id/artwork — every slot the campaign bought, each with its
 * artwork or null: the sponsor's page lists what still needs a file as well
 * as what needs their sign-off.
 */
export async function campaignArtwork(actor: Actor, campaignId: string) {
  assertAllowed(actor, "editionArtwork", "read");
  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true, tenantId: true },
  });
  if (!campaign) throw new ForbiddenError("campaign", "read");
  const slots = await prisma.adSlot.findMany({
    /* tenant-scope: keyed by the campaign loaded above through whereFor(campaign). */
    where: { tenantId: campaign.tenantId, campaignId: campaign.id },
    select: {
      id: true, slotCode: true, kind: true, soldAt: true,
      edition: { select: { id: true, label: true, state: true, closeDate: true, publication: { select: { name: true } } } },
    },
    orderBy: [{ editionId: "asc" }, { slotCode: "asc" }],
  });
  const art = slots.length
    ? ((await prisma.editionAsset.findMany({
        where: { ...whereFor(actor, "editionArtwork", "read"), adSlotId: { in: slots.map((s) => s.id) } },
        select: LIST_SELECT,
      })) as ListRow[])
    : [];
  const bySlot = new Map(art.map((a) => [a.adSlot!.id, artworkOut(a)]));
  return slots.map((s) => ({
    slotId: s.id,
    slotCode: s.slotCode,
    kind: s.kind,
    edition: {
      id: s.edition.id, label: s.edition.label, state: s.edition.state,
      closeDate: s.edition.closeDate.toISOString(), publication: s.edition.publication.name,
    },
    /* Artwork may be supplied while the edition is still SELLING or CLOSED. */
    open: OPEN_EDITION_STATES.includes(s.edition.state),
    artwork: bySlot.get(s.id) ?? null,
  }));
}

/** A short-lived, audited signed read of the artwork file (private bucket). */
export async function artworkFileUrl(actor: Actor, artworkId: string): Promise<{ url: string }> {
  const row = await prisma.editionAsset.findFirst({
    where: { ...whereFor(actor, "editionArtwork", "read"), id: artworkId },
    select: { id: true, r2Key: true },
  });
  if (!row?.r2Key) throw new ForbiddenError("editionArtwork", "read");
  return { url: await presignPrivateDownload(actor, row.r2Key, { entity: "EditionAsset", entityId: row.id }) };
}

/* ── the production gate ────────────────────────────────────────────────── */

/**
 * Every SOLD slot in the edition whose artwork is missing or not approved.
 * Empty means the artwork condition holds. One query, inside the caller's
 * transaction, so the gate and the transition see the same rows.
 */
export async function artworkGap(tx: Tx, tenantId: string, editionId: string): Promise<Array<ArtworkBlocker & { revisionOpen: boolean }>> {
  const slots = await tx.adSlot.findMany({
    where: { tenantId, editionId, campaignId: { not: null } },
    select: { slotCode: true, campaignId: true, artwork: { select: { reviewState: true, revisionNote: true, artworkChecksPassed: true } } },
    orderBy: { slotCode: "asc" },
  });
  const open = new Map(slots.map((s) => [s.slotCode, Boolean(s.artwork?.revisionNote) || s.artwork?.artworkChecksPassed === false]));
  return artworkBlockers(slots).map((b) => ({ ...b, revisionOpen: open.get(b.slotCode) ?? false }));
}

export type { SlotArtworkState };
