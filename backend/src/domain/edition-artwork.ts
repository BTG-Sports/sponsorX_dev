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

type Tx = Prisma.TransactionClient;

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
  campaign: { select: { id: true, name: true, sponsorId: true, sponsor: { select: { name: true } } } },
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
 */
export async function presignArtworkUpload(
  actor: Actor,
  slotId: string,
  contentType: string,
): Promise<{ url: string; key: string }> {
  const slot = await reachSoldSlot(prisma, actor, slotId);
  const key = `${artworkKeyPrefix(slot.tenantId, slot.id)}${randomUUID()}`;
  const url = await presignPrivateUpload(actor, key, contentType, { entity: "AdSlot", entityId: slot.id });
  return { url, key };
}

/**
 * Record an uploaded file as the slot's artwork and put it on the board.
 *
 * The first upload creates the artwork in DRAFT_SUBMITTED (NOT_STARTED →
 * DRAFT_SUBMITTED, the deliverable chain's first move). Another upload while
 * it is still DRAFT_SUBMITTED — a revision, or a correction before BTG picks
 * it up — replaces the file, counts the version up and answers any open
 * revision request. Mid-review or once approved, the file cannot change.
 */
export async function registerArtwork(
  actor: Actor,
  slotId: string,
  input: { r2Key: string; title?: string | null },
): Promise<{ id: string; state: ArtworkState; version: number }> {
  return prisma.$transaction(async (tx) => {
    const slot = await reachSoldSlot(tx, actor, slotId);
    if (!input.r2Key.startsWith(artworkKeyPrefix(slot.tenantId, slot.id))) throw new ArtworkKeyError();
    if (!OPEN_EDITION_STATES.includes(slot.edition.state)) throw new ArtworkLockedError(slot.edition.state);

    const existing = await tx.editionAsset.findFirst({
      where: { tenantId: slot.tenantId, adSlotId: slot.id },
      select: { id: true, reviewState: true, artworkVersion: true, revisionNote: true },
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

    const version = (existing?.artworkVersion ?? 0) + 1;
    const now = new Date();
    const title = input.title?.trim() || `${slot.campaign.sponsor.name} — ${slot.slotCode} artwork`;
    const row = existing
      ? await tx.editionAsset.update({
          where: { id: existing.id },
          data: { r2Key: input.r2Key, artworkVersion: version, submittedAt: now, revisionNote: null, ...(input.title?.trim() ? { title } : {}) },
          select: { id: true },
        })
      : await tx.editionAsset.create({
          data: {
            tenantId: slot.tenantId, editionId: slot.editionId, kind: "AD_CREATIVE", title,
            /* The advertiser's own work, whoever uploads the file. */
            sourceKind: "THIRD_PARTY", r2Key: input.r2Key,
            adSlotId: slot.id, reviewState: "DRAFT_SUBMITTED", artworkVersion: version, submittedAt: now,
          },
          select: { id: true },
        });

    await audit(tx, actor, AUDIT_ACTIONS.editionArtwork.submit, "EditionAsset", row.id, {
      before: { state: from, version: existing?.artworkVersion ?? 0, revisionNote: existing?.revisionNote ?? null },
      after: { state: "DRAFT_SUBMITTED", version, r2Key: input.r2Key, slotId: slot.id, slotCode: slot.slotCode },
    });

    const subject: Subject = {
      id: row.id, tenantId: slot.tenantId, slotCode: slot.slotCode, editionLabel: slot.edition.label,
      campaignId: slot.campaign.id, campaignName: slot.campaign.name,
      sponsorId: slot.campaign.sponsorId, sponsorName: slot.campaign.sponsor.name,
    };
    /* The other party: a sponsor's upload goes to BTG's desk; BTG uploading
       for the sponsor tells the sponsor it is in. */
    await tell(tx, subject, isDesk(actor) ? "SPONSOR" : "BTG", "editionArtwork.submitted", `v${version}`, {
      version: String(version),
      by: isDesk(actor) ? "BTG" : slot.campaign.sponsor.name,
    });

    return { id: row.id, state: "DRAFT_SUBMITTED", version };
  });
}

/* ── the chain ──────────────────────────────────────────────────────────── */

const ROW_SELECT = {
  id: true, tenantId: true, reviewState: true, revisionNote: true, artworkVersion: true,
  edition: { select: { label: true } },
  adSlot: {
    select: {
      slotCode: true,
      campaign: { select: { id: true, name: true, sponsorId: true, sponsor: { select: { name: true } } } },
    },
  },
} as const;

type Decision = {
  action: "write" | "approve";
  tenantWide: boolean;
  auditAction: AuditAction;
  /** Narrows WHO may make this legal move, at which step. */
  turn?: (from: ArtworkState, row: { revisionNote: string | null }) => string | null;
  data?: Prisma.EditionAssetUpdateInput;
  after?: Record<string, unknown>;
  notify?: { party: Party; template: EmailTemplate; data?: Record<string, string> };
};

/**
 * The shared body of every review step — deliverable.ts's `move`, for this
 * subject: read the artwork the actor reaches, check the move against the
 * deliverable transition table, write, audit, email — in one transaction,
 * with the read inside so the state cannot move between check and write.
 */
async function decide(actor: Actor, artworkId: string, to: DeliverableState, d: Decision) {
  if (d.tenantWide) assertTenantWide(actor, "editionArtwork", d.action);
  else assertAllowed(actor, "editionArtwork", d.action);

  return prisma.$transaction(async (tx) => {
    const row = await tx.editionAsset.findFirst({
      where: { ...whereFor(actor, "editionArtwork", d.action), id: artworkId },
      select: ROW_SELECT,
    });
    if (!row || !row.reviewState || !row.adSlot?.campaign) throw new ForbiddenError("editionArtwork", d.action);

    const from = row.reviewState as ArtworkState;
    if (!canTransitionDeliverable(from, to)) throw new IllegalArtworkTransitionError(from, to);
    const refused = d.turn?.(from, row);
    if (refused) throw new ArtworkTurnError(refused);

    const updated = await tx.editionAsset.update({
      where: { id: row.id },
      data: { reviewState: to as Prisma.EditionAssetUpdateInput["reviewState"], ...d.data },
      select: { id: true, reviewState: true },
    });
    await audit(tx, actor, d.auditAction, "EditionAsset", row.id, {
      before: { state: from },
      after: { state: to, slotCode: row.adSlot.slotCode, ...d.after },
    });

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
    return { id: updated.id, state: updated.reviewState as ArtworkState };
  });
}

/** BTG picks it up: DRAFT_SUBMITTED → BTG_REVIEW. Not while a revision is
 *  open — there is nothing new to review until the next file lands. */
export function startArtworkReview(actor: Actor, artworkId: string) {
  return decide(actor, artworkId, "BTG_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.editionArtwork.btgReview,
    turn: (_from, row) => (row.revisionNote ? "Changes were asked for — the new version has to be uploaded before BTG reviews it again." : null),
  });
}

/** BTG sends it to the buying sponsor: BTG_REVIEW → SPONSOR_REVIEW. */
export function sendArtworkToSponsor(actor: Actor, artworkId: string) {
  return decide(actor, artworkId, "SPONSOR_REVIEW", {
    action: "write",
    tenantWide: true,
    auditAction: AUDIT_ACTIONS.editionArtwork.sponsorReview,
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
 */
export function approveArtwork(actor: Actor, artworkId: string) {
  return decide(actor, artworkId, "APPROVED", {
    action: "approve",
    tenantWide: false,
    auditAction: AUDIT_ACTIONS.editionArtwork.approve,
    turn: (from) => (from === "SPONSOR_REVIEW" ? null : "BTG reviews the artwork and sends it to you before you can approve it."),
    notify: { party: "BTG", template: "editionArtwork.approved" },
  });
}

/**
 * Either reviewer asks for changes, at their own step, with a note:
 * BTG_REVIEW (BTG) or SPONSOR_REVIEW (the buying sponsor) → DRAFT_SUBMITTED.
 * The note stays on the artwork until the next upload answers it, and goes
 * to the other party by email.
 */
export async function requestArtworkRevision(actor: Actor, artworkId: string, note: string) {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) throw new ArtworkRevisionNoteRequiredError();
  const desk = isDesk(actor);
  return decide(actor, artworkId, "DRAFT_SUBMITTED", {
    action: desk ? "write" : "approve",
    tenantWide: desk,
    auditAction: AUDIT_ACTIONS.editionArtwork.requestRevision,
    turn: (from) => {
      if (!canRequestRevision(from)) return "Changes can be asked for only while the artwork is being reviewed.";
      if (desk && from !== "BTG_REVIEW") return "The artwork is with the sponsor for sign-off — only they can ask for changes now.";
      if (!desk && from !== "SPONSOR_REVIEW") return "BTG is still reviewing this artwork — it reaches you once BTG sends it.";
      return null;
    },
    data: { revisionNote: trimmed },
    after: { reason: trimmed, by: desk ? "BTG" : "SPONSOR" },
    notify: { party: desk ? "SPONSOR" : "BTG", template: "editionArtwork.revisionRequested", data: { reason: trimmed, by: desk ? "BTG" : "the sponsor" } },
  });
}

/* ── reads ──────────────────────────────────────────────────────────────── */

const LIST_SELECT = {
  id: true, title: true, reviewState: true, artworkVersion: true, submittedAt: true, revisionNote: true, createdAt: true,
  edition: { select: { id: true, label: true, state: true, publication: { select: { name: true } } } },
  adSlot: {
    select: {
      id: true, slotCode: true, kind: true,
      campaign: { select: { id: true, name: true, sponsor: { select: { name: true } } } },
    },
  },
} as const;

type ListRow = {
  id: string; title: string; reviewState: string | null; artworkVersion: number | null;
  submittedAt: Date | null; revisionNote: string | null; createdAt: Date;
  edition: { id: string; label: string; state: string; publication: { name: string } };
  adSlot: { id: string; slotCode: string; kind: string; campaign: { id: string; name: string; sponsor: { name: string } } | null } | null;
};

/** The board's row: `subject` says which kind of thing is being approved. */
export function artworkOut(a: ListRow) {
  return {
    subject: "EDITION_ARTWORK" as const,
    id: a.id,
    title: a.title,
    state: a.reviewState as ArtworkState,
    version: a.artworkVersion ?? 0,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    revision: a.revisionNote ? { reason: a.revisionNote } : null,
    edition: { id: a.edition.id, label: a.edition.label, state: a.edition.state, publication: a.edition.publication.name },
    slot: a.adSlot ? { id: a.adSlot.id, slotCode: a.adSlot.slotCode, kind: a.adSlot.kind } : null,
    campaign: a.adSlot?.campaign
      ? { id: a.adSlot.campaign.id, name: a.adSlot.campaign.name, sponsorName: a.adSlot.campaign.sponsor.name }
      : null,
  };
}

/** GET /edition-artwork — the artwork the actor reaches (BTG: the tenant's;
 *  a sponsor: their own campaigns'), oldest submission first. */
export async function listArtwork(
  actor: Actor,
  filters: { states?: string[]; editionId?: string; campaignId?: string } = {},
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
      ],
    },
    select: LIST_SELECT,
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 300,
  })) as ListRow[];
  return rows.map(artworkOut);
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
    select: { slotCode: true, campaignId: true, artwork: { select: { reviewState: true, revisionNote: true } } },
    orderBy: { slotCode: "asc" },
  });
  const open = new Map(slots.map((s) => [s.slotCode, Boolean(s.artwork?.revisionNote)]));
  return artworkBlockers(slots).map((b) => ({ ...b, revisionOpen: open.get(b.slotCode) ?? false }));
}

export type { SlotArtworkState };
