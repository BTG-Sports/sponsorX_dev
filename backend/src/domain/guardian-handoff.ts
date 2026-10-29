/**
 * Changing a minor's guardian (the handoff) — 2S1-BE-15.
 *
 * Built on the existing Guardian model and the Athlete.guardianId link
 * (guardian.ts). The rules (programme owner, 2026-10-01):
 *
 *   1. IT STARTS ONLY WITH THE NEW GUARDIAN'S REQUEST, on the public request
 *      page. There is no route by which the current guardian, the minor, or
 *      anyone signed in can start one.
 *   2. The new guardian identifies the athlete (the athlete's email), gives
 *      their details, CONFIRMS THEIR EMAIL, uploads a GOVERNMENT ID and
 *      PROOF OF GUARDIANSHIP (private bucket, the same document kinds as the
 *      guardian's own sign-up page, 2S1-BE-10) and accepts the guardian
 *      agreement. Only then is the request sent to the current guardian.
 *   3. ONLY THE CURRENT GUARDIAN ANSWERS: Hand off or Decline, from their
 *      portal. The minor can read the request but never answer it.
 *   4. NO GAP IN CONTROL. The current guardian keeps acting until the
 *      switch, and the switch is one transaction: the new guardian approved
 *      automatically (their checks already passed), the athlete's link moved
 *      — only if it still points at the guardian who handed off — the new
 *      guardian's login provisioned, the request closed, and every other
 *      open request for this athlete cancelled.
 *   5. WHAT STAYS: orders and campaigns already agreed are not touched.
 *      Payouts already sent stay sent. The athlete's payout account is
 *      DETACHED from the previous guardian at the switch
 *      (payout-account-holder.ts, POL-BE-01, decided 2026-10-28 in place of
 *      "money already earned stays with the account it was earned under"):
 *      anything not yet sent waits for the new guardian's own payout
 *      account and goes to it. A guardian's other children keep their
 *      guardian and their accounts.
 *   4a. NEVER A SWITCH TO SOMEONE WHO CAN'T SIGN IN. The new guardian's
 *      login is provisioned inside the switch; if it can't be (the address
 *      is another account's sign-in, or their login is switched off), the
 *      whole switch is refused with a clear message, so the current
 *      guardian stays in control.
 *   4b. "BTG STAFF CONFIRM MINORS" (2S1-BE-10's per-tenant setting) applies
 *      here too: when it is on, Hand off moves the request to HANDED_OFF
 *      and BTG admins are emailed; the current guardian keeps control until
 *      a BTG admin confirms (the switch) or declines it.
 *   5a. NEVER STUCK (POL-BE-10). A request with the current guardian is
 *      reminded after 3 days; after 7 with no answer it is ESCALATED: on
 *      BTG's desk under "Waiting for BTG", where an admin confirms (the
 *      switch) or declines it with the documents. The current guardian can
 *      still answer; the first answer decides, under the request's row lock.
 *   6. A DISPUTE IS NEVER AUTOMATED. A decline (or a custody question, a
 *      court order, an unreachable guardian) points the new guardian to BTG
 *      support (2S1-BE-16); BTG decides by hand.
 *
 * Every step is audited.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, scopeOf, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import type { ARENA_HANDOFF_GROUPS, HANDOFF_GROUPS } from "../contracts/guardian-handoff";
import { issuePurposeToken, readPurposeToken } from "../lib/purpose-token";
import { checkPrivateUpload, presignPrivateDownload, presignPrivateUpload, SENSITIVE_DOCUMENT_TTL_SECONDS, uploadRefusal } from "../lib/storage";
import { provisionGuardianLoginIn } from "./athlete-login";
import { detachAthletePayoutAccountIn } from "./payout-account-holder";
import { currentAgreementOf } from "./current-agreement";
import { requiresGuardian } from "./guardian-rules";
import { safeFilename } from "./onboarding-documents";
import type { ExpectedName, ReadKind } from "./document-check-rules";
import { checkView, documentHolds, readDocument } from "./document-reading";
import { deleteSentBackFile, recordSendBack, returnedColumns, SendBackError, sendBackReason } from "./document-send-back";
import { GUARDIAN_PROOF_KINDS } from "./signup-rules";
import { readPage, type PageInfo, type PageRequest } from "../lib/paging";

type Tx = Prisma.TransactionClient;

export class HandoffError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "HandoffError";
    this.status = status;
  }
}

/** Agreed 2026-10-01: an ID upload is PDF, JPEG or PNG, at most 10 MB. */
export const MAX_ID_BYTES = 10 * 1024 * 1024;
const ID_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const appUrl = () => env.APP_URL.replace(/\/+$/, "");
const firstWord = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] ?? "";
const OPEN_STATES = ["REQUESTED", "WAITING"];
const RELATIONSHIP_WORDS: Record<string, string> = { PARENT: "Parent", LEGAL_GUARDIAN: "Legal guardian", AUTHORIZED_REP: "Authorized representative" };

const SELECT = {
  id: true, tenantId: true, athleteId: true, fromGuardianId: true, requesterName: true, requesterEmail: true, requesterPhone: true,
  relationship: true, state: true, emailConfirmedAt: true, agreementAcceptedAt: true, agreementVersion: true, submittedAt: true,
  decidedAt: true, declineNote: true, documentsCheckedAt: true, switchedAt: true, newGuardianId: true, createdAt: true,
  remindedAt: true, escalatedAt: true,
  athlete: { select: { displayName: true, legalName: true, sport: true, email: true } },
  documents: {
    select: {
      id: true, kind: true, proofKind: true, filename: true, uploadedAt: true,
      checkState: true, checkFindings: true, checkedAt: true, returnedAt: true, returnedReason: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;
type Row = Prisma.GuardianHandoffGetPayload<{ select: typeof SELECT }>;

/** The documents that count: arrived, and not sent back by BTG (P8-BE-10). */
const counted = (r: Pick<Row, "documents">, kind: string) => r.documents.filter((d) => d.kind === kind && d.uploadedAt && !d.returnedAt);

/** Which of the two documents have really arrived. */
function uploaded(r: Pick<Row, "documents">) {
  return { id: counted(r, "GUARDIAN_ID").length > 0, proof: counted(r, "GUARDIANSHIP_PROOF").length > 0 };
}

/** P8-BE-11 — what reading the new guardian's documents found: any reason sends the switch to BTG. */
function documentHoldsOf(r: Pick<Row, "documents">): string[] {
  return [
    ...documentHolds("New guardian's government ID", counted(r, "GUARDIAN_ID")),
    ...documentHolds("Proof of guardianship", counted(r, "GUARDIANSHIP_PROOF")),
  ];
}

/** What is still needed before the request can go to the current guardian. */
function missingOf(r: Row): string[] {
  const docs = uploaded(r);
  const missing: string[] = [];
  if (!r.emailConfirmedAt) missing.push("confirm your email");
  if (!docs.id) missing.push("upload your government ID");
  if (!docs.proof) missing.push("upload proof you're the guardian");
  if (!r.agreementAcceptedAt) missing.push("accept the guardian agreement");
  return missing;
}

/**
 * The one shape every side reads — the new guardian's request page, the
 * current guardian's card, the athlete's notice. `full` adds the names a
 * signed-in guardian or athlete already knows; the public page gets first
 * names only.
 */
async function view(db: Tx | typeof prisma, r: Row, full: boolean) {
  const from = await db.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true } });
  const docs = uploaded(r);
  const athleteName = r.athlete.displayName || r.athlete.legalName;
  return {
    id: r.id,
    state: r.state as "REQUESTED" | "WAITING" | "HANDED_OFF" | "SWITCHED" | "DECLINED" | "CANCELLED",
    athlete: { name: full ? athleteName : firstWord(athleteName), firstName: firstWord(athleteName), sport: r.athlete.sport },
    current: { name: full ? from?.legalName ?? "" : firstWord(from?.legalName), firstName: firstWord(from?.legalName) },
    requester: { name: r.requesterName, firstName: firstWord(r.requesterName), relationship: RELATIONSHIP_WORDS[r.relationship] ?? r.relationship },
    emailConfirmed: Boolean(r.emailConfirmedAt),
    idUploaded: docs.id,
    proofUploaded: docs.proof,
    documentsUploaded: docs.id && docs.proof,
    agreementAccepted: Boolean(r.agreementAcceptedAt),
    missing: r.state === "REQUESTED" ? missingOf(r) : [],
    requestedAt: (r.submittedAt ?? r.createdAt).toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    documentsCheckedAt: r.documentsCheckedAt?.toISOString() ?? null,
    switchedAt: r.switchedAt?.toISOString() ?? null,
    /* POL-BE-10 — how long it has waited for the current guardian, the reminder, and BTG stepping in. */
    sentAt: r.submittedAt?.toISOString() ?? null,
    waitingDays: r.state === "WAITING" && r.submittedAt ? Math.floor((Date.now() - r.submittedAt.getTime()) / DAY_MS) : null,
    remindedAt: r.remindedAt?.toISOString() ?? null,
    escalatedAt: r.escalatedAt?.toISOString() ?? null,
    /** BTG may confirm or decline it now: handed off for BTG's check, or escalated with no answer. */
    btgMayDecide: btgMayDecide(r),
    supportEmail: env.SUPPORT_EMAIL,
  };
}

const DAY_MS = 86_400_000;
/** POL-BE-10 — days after it was sent: the current guardian is reminded, then BTG may decide. */
export const HANDOFF_REMIND_AFTER_DAYS = 3;
export const HANDOFF_ESCALATE_AFTER_DAYS = 7;

/** Waiting for BTG: handed off for BTG's check, or escalated after 7 days with no answer. */
const btgMayDecide = (r: Pick<Row, "state" | "escalatedAt">) => r.state === "HANDED_OFF" || (r.state === "WAITING" && r.escalatedAt !== null);

/** The request's row, locked for this transaction: the current guardian and BTG may answer at once, and the first decides. */
async function lockHandoff(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "GuardianHandoff" WHERE id = ${id} FOR UPDATE`;
}
export type HandoffView = Awaited<ReturnType<typeof view>>;

/** The minor this email belongs to, with a guardian to hand off from. */
async function minorByEmail(tenantId: string, athleteEmail: string) {
  const a = await prisma.athlete.findFirst({
    where: { tenantId, email: { equals: athleteEmail.trim(), mode: "insensitive" }, guardianId: { not: null } },
    select: { id: true, displayName: true, legalName: true, sport: true, birthDate: true, ageBand: true, guardianId: true, email: true, guardian: { select: { legalName: true, email: true } } },
  });
  if (!a || !requiresGuardian(a)) return null;
  return a;
}

/** GET /public/guardian-handoffs/lookup — "is this the athlete?" First names only. */
export async function lookupAthleteForHandoff(athleteEmail: string) {
  const a = await minorByEmail(env.PUBLIC_INTAKE_TENANT_ID, athleteEmail);
  if (!a) return { found: false as const };
  return { found: true as const, athlete: { firstName: firstWord(a.displayName || a.legalName), sport: a.sport }, current: { firstName: firstWord(a.guardian?.legalName) } };
}

/* ═══════════════════════ the new guardian's side (public) ══════════════════ */

const requestToken = (id: string) => issuePurposeToken("handoff", id, new Date(Date.now() + 30 * 86_400_000));

function idFrom(token: string): string {
  const id = readPurposeToken("handoff", token);
  if (!id) throw new HandoffError("This link has expired or isn't valid. Start the request again.", 400);
  return id;
}

async function rowById(db: Tx | typeof prisma, id: string): Promise<Row> {
  const r = await db.guardianHandoff.findFirst({
    /* tenant-scope: found by the id inside a signed token only this request's guardian was given. */
    where: { id }, select: SELECT,
  });
  if (!r) throw new HandoffError("This request no longer exists.", 404);
  return r;
}

/**
 * POST /public/guardian-handoffs — the ONLY way a handoff starts. Refused
 * when the athlete isn't a minor with a guardian, when the "new" guardian is
 * the current one or the athlete themselves, or when the email already signs
 * in to SponsorX as something other than a guardian (the switch must leave
 * the new guardian a working login, or there would be a gap in control).
 */
export async function startHandoff(input: { athleteEmail: string; name: string; email: string; phone?: string; relationship: string }) {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const a = await minorByEmail(tenantId, input.athleteEmail);
  if (!a || !a.guardianId) throw new HandoffError("We couldn't find an athlete under 18 with a guardian for that email. Check it with the family, or contact BTG.", 404);
  const email = input.email.trim().toLowerCase();
  if (email === a.guardian?.email.toLowerCase()) throw new HandoffError("That is the current guardian's email. The new guardian asks with their own.", 422);
  if (email === a.email?.toLowerCase()) throw new HandoffError("That is the athlete's own email. The new guardian asks with their own.", 422);
  const login = await prisma.user.findFirst({
    /* tenant-scope: identity is global — a sign-in is claimed by email across every tenant (athlete-login.ts). */
    where: { email: { equals: email, mode: "insensitive" } }, select: { guardianId: true },
  });
  if (login && !login.guardianId) throw new HandoffError("That email already signs in to SponsorX for something else. Use another email for your guardian account.", 422);

  return prisma.$transaction(async (tx) => {
    const open = await tx.guardianHandoff.findFirst({
      where: { tenantId, athleteId: a.id, requesterEmail: email, state: { in: OPEN_STATES } }, select: { id: true },
    });
    if (open) throw new HandoffError("You already have a request open for this athlete. Use the link in your email to carry on.");
    const r = await tx.guardianHandoff.create({
      data: {
        tenantId, athleteId: a.id, fromGuardianId: a.guardianId!, requesterName: input.name.trim(), requesterEmail: email,
        requesterPhone: input.phone?.trim() || null, relationship: input.relationship,
      },
      select: { id: true },
    });
    await audit(tx, SYSTEM(tenantId), "guardianHandoff.request", "GuardianHandoff", r.id, {
      after: { athleteId: a.id, fromGuardianId: a.guardianId, relationship: input.relationship },
    });
    await send(tx, tenantId, {
      template: "handoff.confirmEmail", to: email, idempotencyKey: `handoff.confirmEmail:${r.id}`,
      data: {
        name: firstWord(input.name), athleteFirstName: firstWord(a.displayName || a.legalName), supportEmail: env.SUPPORT_EMAIL,
        confirmUrl: `${appUrl()}/guardian/handoff?e=${encodeURIComponent(issuePurposeToken("handoff-email", r.id, new Date(Date.now() + 7 * 86_400_000)))}`,
      },
    });
    return { token: requestToken(r.id), request: await view(tx, await rowById(tx, r.id), false) };
  });
}

/** POST /public/guardian-handoffs/confirm-email — the link in the email: proves the mailbox. */
export async function confirmHandoffEmail(emailToken: string) {
  const id = readPurposeToken("handoff-email", emailToken);
  if (!id) throw new HandoffError("This confirmation link has expired or isn't valid.", 400);
  return prisma.$transaction(async (tx) => {
    const r = await rowById(tx, id);
    if (!r.emailConfirmedAt) {
      await tx.guardianHandoff.update({
        /* tenant-scope: the request named inside the signed email token. */
        where: { id: r.id }, data: { emailConfirmedAt: new Date() },
      });
      await audit(tx, SYSTEM(r.tenantId), "guardianHandoff.emailConfirmed", "GuardianHandoff", r.id, { after: { email: r.requesterEmail } });
    }
    /* Opening the emailed link proves the mailbox, so it may carry on from any device. */
    return { token: requestToken(r.id), request: await view(tx, await rowById(tx, r.id), false) };
  });
}

/**
 * Who declined a DECLINED request, and the reason the requester reads:
 * BTG's decline (a staff decision on a handed-off request, audited as
 * guardianHandoff.staffDecline) carries BTG's reason, which was emailed to
 * them; the current guardian's decline carries no note to the requester —
 * their portal asks for none and its email has none, by design (a dispute
 * goes to BTG support, never through the request).
 */
async function declineOf(db: Tx | typeof prisma, r: Row): Promise<{ declinedBy: "BTG" | "CURRENT_GUARDIAN" | null; declineNote: string | null }> {
  if (r.state !== "DECLINED") return { declinedBy: null, declineNote: null };
  const byBtg = await db.auditLog.findFirst({
    where: { tenantId: r.tenantId, entity: "GuardianHandoff", entityId: r.id, action: "guardianHandoff.staffDecline" }, select: { id: true },
  });
  return byBtg ? { declinedBy: "BTG", declineNote: r.declineNote } : { declinedBy: "CURRENT_GUARDIAN", declineNote: null };
}

/** GET /public/guardian-handoffs/:token — where the request stands; once declined, who declined it and BTG's reason. */
export async function handoffStatus(token: string) {
  const r = await rowById(prisma, idFrom(token));
  /* P8-FE-08 — the Guardian Agreement in force, which the new guardian reads
     and accepts on this page (submitHandoff records its version), so the
     page shows the served words rather than a copy of its own. */
  const a = await currentAgreementOf(prisma, r.tenantId, "GUARDIAN");
  return {
    ...(await view(prisma, r, false)),
    ...(await declineOf(prisma, r)),
    agreement: a ? { version: a.version, body: a.body } : null,
  };
}

/** Step one of a document: a private-bucket PUT for exactly this file. Audited as a grant. */
export async function requestHandoffDocumentUpload(token: string, input: { kind: string; proofKind?: string; filename: string; contentType: string; bytes: number }) {
  const r = await rowById(prisma, idFrom(token));
  if (r.state !== "REQUESTED") throw new HandoffError("This request has already been sent.");
  if (!ID_TYPES.has(input.contentType)) throw new HandoffError("Upload a PDF, JPEG or PNG.", 422);
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_ID_BYTES) throw new HandoffError("That file is over 10 MB. Upload a smaller scan or photo.", 422);
  if (input.kind === "GUARDIANSHIP_PROOF" && !input.proofKind) throw new HandoffError("Say what the proof is: a birth certificate, a court order or a school record.", 422);
  if (r.documents.length >= 6) throw new HandoffError("A request holds at most 6 files.");
  const id = `hdoc_${randomBytes(12).toString("hex")}`;
  const filename = safeFilename(input.filename);
  const r2Key = `guardian-handoffs/${r.id}/${id}/${filename}`;
  const doc = await prisma.guardianHandoffDocument.create({
    data: {
      id, tenantId: r.tenantId, handoffId: r.id, kind: input.kind, proofKind: input.kind === "GUARDIANSHIP_PROOF" ? input.proofKind! : null,
      filename, contentType: input.contentType, bytes: input.bytes, r2Key,
    },
    select: { id: true, kind: true, proofKind: true, filename: true },
  });
  /* 2S8-SEC-03 — the PUT is signed for exactly this type and size. */
  const uploadUrl = await presignPrivateUpload(SYSTEM(r.tenantId), r2Key, input.contentType, { entity: "GuardianHandoffDocument", entityId: id }, {
    signContentType: true, contentLength: input.bytes,
  });
  return { document: doc, uploadUrl, contentType: input.contentType };
}

/**
 * Step two: counted only if the file is really in the bucket and can be
 * read (P8-BE-09); then read (P8-BE-11) — the new guardian's ID must name
 * them, and the proof both them and the athlete.
 */
export async function confirmHandoffDocumentUpload(token: string, documentId: string) {
  const r = await rowById(prisma, idFrom(token));
  const doc = await prisma.guardianHandoffDocument.findFirst({
    where: { tenantId: r.tenantId, handoffId: r.id, id: documentId },
    select: { id: true, kind: true, proofKind: true, r2Key: true, contentType: true, bytes: true, uploadedAt: true, returnedAt: true },
  });
  if (!doc) throw new HandoffError("That file isn't part of this request.", 404);
  if (doc.returnedAt) throw new HandoffError("BTG sent that file back — upload a new one.", 409);
  if (doc.uploadedAt) return view(prisma, r, false);
  /* 2S8-SEC-03 — what arrived must be what the grant pinned; P8-BE-09 — and readable. Anything else is deleted. */
  const arrived = await checkPrivateUpload(SYSTEM(r.tenantId), doc.r2Key,
    { contentType: doc.contentType, bytes: doc.bytes, maxBytes: MAX_ID_BYTES, document: true }, { entity: "GuardianHandoffDocument", entityId: doc.id });
  if (!arrived.ok && arrived.problem === "missing") throw new HandoffError("That file hasn't arrived yet — upload it, then confirm.");
  if (!arrived.ok) throw new HandoffError(uploadRefusal(arrived), 422);
  const requester: ExpectedName = { who: "The new guardian", name: r.requesterName, kind: "person" };
  const check = await readDocument(arrived.document, doc.kind === "GUARDIAN_ID"
    ? { label: "New guardian's government ID", names: [requester], kind: "GOVERNMENT_ID", expires: true, birthDate: null }
    : {
      label: "Proof of guardianship", names: [requester, { who: "The athlete", name: r.athlete.legalName, kind: "person" }],
      kind: (GUARDIAN_PROOF_KINDS as readonly string[]).includes(doc.proofKind ?? "") ? (doc.proofKind as ReadKind) : null, expires: false, birthDate: null,
    });
  const size = arrived.bytes;
  await prisma.$transaction(async (tx) => {
    await tx.guardianHandoffDocument.update({
      /* tenant-scope: the document loaded above, within this request. */
      where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: size, ...check },
    });
    await audit(tx, SYSTEM(r.tenantId), "guardianHandoff.documentUploaded", "GuardianHandoff", r.id, { after: { documentId: doc.id, check: check?.checkState ?? null } });
  });
  return view(prisma, await rowById(prisma, r.id), false);
}

/** The guardian agreement as it stands for this tenant, if one is published. */
async function agreementVersionOf(tx: Tx, tenantId: string): Promise<string> {
  const a = await currentAgreementOf(tx, tenantId, "GUARDIAN");
  return a ? `GUARDIAN v${a.version} ${a.bodyHash.slice(0, 12)}` : "GUARDIAN (draft, pending counsel)";
}

/**
 * POST /public/guardian-handoffs/:token/submit — the agreement accepted and
 * the request sent to the current guardian. Only when the email is
 * confirmed and both documents have arrived: the current guardian is asked
 * only once the new guardian has done everything a guardian must.
 */
export async function submitHandoff(token: string) {
  const id = idFrom(token);
  return prisma.$transaction(async (tx) => {
    const r = await rowById(tx, id);
    if (r.state !== "REQUESTED") return view(tx, r, false);
    const docs = uploaded(r);
    const missing = missingOf({ ...r, agreementAcceptedAt: new Date() });
    if (missing.length) throw new HandoffError(`Before sending, ${missing.join(", ")}.`);
    if (!docs.id || !docs.proof) throw new HandoffError("Both documents are needed.");
    const at = new Date();
    const moved = await tx.guardianHandoff.updateMany({
      /* tenant-scope: the request named inside the signed token, still being filled in. */
      where: { id: r.id, state: "REQUESTED" },
      data: { state: "WAITING", agreementAcceptedAt: at, agreementVersion: await agreementVersionOf(tx, r.tenantId), submittedAt: at },
    });
    if (moved.count !== 1) return view(tx, await rowById(tx, r.id), false);
    await audit(tx, SYSTEM(r.tenantId), "guardianHandoff.submit", "GuardianHandoff", r.id, { after: { agreementAcceptedAt: at.toISOString() } });
    const from = await tx.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true, email: true } });
    if (from) {
      await send(tx, r.tenantId, {
        template: "handoff.requested", to: from.email, idempotencyKey: `handoff.requested:${r.id}`,
        data: {
          name: firstWord(from.legalName), requesterName: r.requesterName, relationship: RELATIONSHIP_WORDS[r.relationship] ?? r.relationship,
          athleteFirstName: firstWord(r.athlete.displayName || r.athlete.legalName), portalUrl: `${appUrl()}/athlete/guardian-requests`, supportEmail: env.SUPPORT_EMAIL,
        },
      });
    }
    return view(tx, await rowById(tx, r.id), false);
  });
}

/* ═══════════════════════ the current guardian's side ═══════════════════ */

/**
 * GET /guardian-handoffs — requests about this guardian's wards (or, for an
 * athlete, about them). BTG (tenant-wide read) reads every request, including
 * one the new guardian is still filling in, with the desk's extra detail
 * (staffDetails) and every group's count; a guardian's or athlete's answer is
 * unchanged.
 */
/** `page` (the house pager, lib/paging.ts): one page of the group and its count instead of the newest 100.
 *  P1-ART-22 — `group` may also be the arena's `waiting` | `past`; a guardian's or an athlete's PAGED answer
 *  carries `counts: { waiting, past }` over their whole scope (their unpaged answer is unchanged). */
export async function listHandoffs(actor: Actor, q: { group?: HandoffGroup | ArenaHandoffGroup; page?: PageRequest } = {}) {
  assertAllowed(actor, "guardianHandoff", "read");
  const staff = staffReads(actor);
  /* A guardian or an athlete never sees a request before it is sent. (whereFor's own `AND` is the scope: never overwrite it.) */
  const grouped = q.group ? (isArenaGroup(q.group) ? ARENA_GROUP_STATES[q.group] : GROUP_STATES[q.group]) : null;
  const states = grouped ? grouped.filter((st) => staff || st !== "REQUESTED") : null;
  /* POL-BE-10 — a request escalated after 7 days is BTG's to decide: "Waiting for BTG", no longer "In progress". */
  const escalated = { state: "WAITING", escalatedAt: { not: null } };
  const groupWhere =
    q.group === "WAITING_FOR_BTG" ? { OR: [{ state: { in: states! } }, escalated] }
    : q.group === "IN_PROGRESS" ? { state: { in: states! }, NOT: escalated }
    : states ? { state: { in: states } } : staff ? {} : { state: { not: "REQUESTED" } };
  const where = { ...whereFor(actor, "guardianHandoff", "read"), ...groupWhere };
  const read = (skip: number, take: number) =>
    prisma.guardianHandoff.findMany({ where /* tenant-scope: whereFor(guardianHandoff) above */, select: SELECT, orderBy: { createdAt: "desc" }, skip, take });
  const paged = q.page
    ? await readPage(q.page, () => prisma.guardianHandoff.count({ where /* tenant-scope: whereFor(guardianHandoff) above */ }), read)
    : { rows: await read(0, staff ? 100 : 25), page: null as PageInfo | null };
  const rows = paged.rows;
  const out = [];
  for (const r of rows) out.push(await view(prisma, r, true));
  const n = (byState: Array<{ state: string; _count: { _all: number } }>, states: readonly string[]) =>
    byState.filter((s) => states.includes(s.state)).reduce((sum, s) => sum + s._count._all, 0);
  if (!staff) {
    if (!paged.page) return { handoffs: out };
    const mine = await prisma.guardianHandoff.groupBy({
      /* tenant-scope: whereFor(guardianHandoff) — the caller's own requests, never one before it is sent. */
      by: ["state"], where: { ...whereFor(actor, "guardianHandoff", "read"), state: { not: "REQUESTED" } }, _count: { _all: true },
    });
    return { handoffs: out, counts: { waiting: n(mine, ARENA_GROUP_STATES.waiting), past: n(mine, ARENA_GROUP_STATES.past) }, page: paged.page };
  }
  const [details, byState, escalatedCount] = await Promise.all([
    staffDetails(rows),
    prisma.guardianHandoff.groupBy({ by: ["state"], where: whereFor(actor, "guardianHandoff", "read"), _count: { _all: true } }),
    prisma.guardianHandoff.count({ where: { ...whereFor(actor, "guardianHandoff", "read"), state: "WAITING", escalatedAt: { not: null } } }),
  ]);
  const counts = Object.fromEntries(Object.entries(GROUP_STATES).map(([g, states]) => [g, n(byState, states)])) as Record<HandoffGroup, number>;
  counts.WAITING_FOR_BTG += escalatedCount;
  counts.IN_PROGRESS -= escalatedCount;
  return {
    handoffs: out.map((h) => ({ ...h, staff: details.get(h.id)! })),
    counts,
    ...(paged.page ? { page: paged.page } : {}),
  };
}

/** GET /guardian-handoffs/:id — BTG's answer carries the desk's detail (staffDetails). */
export async function getHandoff(actor: Actor, id: string) {
  const staff = staffReads(actor);
  const r = await prisma.guardianHandoff.findFirst({
    where: { ...whereFor(actor, "guardianHandoff", "read"), id, ...(staff ? {} : { state: { not: "REQUESTED" } }) }, select: SELECT,
  });
  if (!r) throw new ForbiddenError("guardianHandoff", "read");
  const v = await view(prisma, r, true);
  return staff ? { ...v, staff: (await staffDetails([r])).get(r.id)! } : v;
}

/* ═══════════════════════ BTG's Guardian handoffs desk ═══════════════════ */

type HandoffGroup = (typeof HANDOFF_GROUPS)[number];
type ArenaHandoffGroup = (typeof ARENA_HANDOFF_GROUPS)[number];
/** The desk's tabs. IN_PROGRESS holds REQUESTED only for BTG — a guardian never sees a request before it is sent.
 *  POL-BE-10 — WAITING_FOR_BTG also holds a WAITING request escalated after 7 days (listHandoffs). */
const GROUP_STATES: Record<HandoffGroup, string[]> = {
  WAITING_FOR_BTG: ["HANDED_OFF"], IN_PROGRESS: ["REQUESTED", "WAITING"], SWITCHED: ["SWITCHED"], DECLINED: ["DECLINED"], CANCELLED: ["CANCELLED"],
};
/** P1-ART-22 — the arena's two groups: still open (for the guardian's answer, or BTG's confirmation; REQUESTED for BTG only), or over. */
const ARENA_GROUP_STATES: Record<ArenaHandoffGroup, string[]> = {
  waiting: ["REQUESTED", "WAITING", "HANDED_OFF"], past: ["SWITCHED", "DECLINED", "CANCELLED"],
};
const isArenaGroup = (g: HandoffGroup | ArenaHandoffGroup): g is ArenaHandoffGroup => g === "waiting" || g === "past";
const DOCUMENT_WORDS: Record<string, string> = { GUARDIAN_ID: "Government ID", GUARDIANSHIP_PROOF: "Proof of guardianship" };
const PROOF_WORDS: Record<string, string> = { BIRTH_CERTIFICATE: "Birth certificate", COURT_ORDER: "Court order", SCHOOL_RECORD: "School record" };

/** BTG reads across the tenant; a guardian (`ward`) or an athlete (`own`) reads their own requests. */
function staffReads(actor: Actor): boolean {
  const s = scopeOf(actor, "guardianHandoff", "read");
  return s === "any" || s === "own-tenant";
}

function ageOf(birthDate: Date | null, now = new Date()): number | null {
  if (!birthDate) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

/**
 * What only BTG's desk shows: the athlete's age, both guardians' records, the
 * new guardian's contact details and agreement, the documents (opened only
 * through the 5-minute link, viewHandoffDocument), and who decided.
 *
 * Who decided is read from the audit log, where every step is recorded in
 * the same transaction as the change: the row's decidedAt / decidedBy hold
 * the guardian's answer — or, after a staff decline, BTG's — so a
 * hand-off that BTG then declined or confirmed is recovered from its entries.
 */
async function staffDetails(rows: Row[]) {
  const tenantId = { in: [...new Set(rows.map((r) => r.tenantId))] };
  const [athletes, guardians, trail] = await Promise.all([
    prisma.athlete.findMany({ where: { tenantId, id: { in: rows.map((r) => r.athleteId) } }, select: { id: true, birthDate: true } }),
    prisma.guardian.findMany({
      where: { tenantId, id: { in: rows.flatMap((r) => (r.newGuardianId ? [r.fromGuardianId, r.newGuardianId] : [r.fromGuardianId])) } },
      select: { id: true, legalName: true, relationship: true },
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          { entity: "GuardianHandoff", entityId: { in: rows.map((r) => r.id) }, action: { in: ["guardianHandoff.handOffForReview", "guardianHandoff.staffDecline"] } },
          { entity: "Athlete", entityId: { in: rows.map((r) => r.athleteId) }, action: "guardianHandoff.switch" },
        ],
      },
      select: { action: true, entityId: true, actorId: true, after: true, at: true }, orderBy: { at: "asc" },
    }),
  ]);
  const deciders = await prisma.user.findMany({
    where: { tenantId, id: { in: trail.flatMap((t) => (t.actorId ? [t.actorId] : [])) } }, select: { id: true, email: true },
  });
  const emailOf = (id: string | null) => deciders.find((u) => u.id === id)?.email ?? null;
  const out = new Map<string, ReturnType<typeof one>>();
  function one(r: Row) {
    const handedOff = trail.find((t) => t.entityId === r.id && t.action === "guardianHandoff.handOffForReview");
    const staffDecline = trail.find((t) => t.entityId === r.id && t.action === "guardianHandoff.staffDecline");
    const switched = trail.find((t) => t.action === "guardianHandoff.switch" && (t.after as { handoffId?: string } | null)?.handoffId === r.id);
    const confirmedByBtg = Boolean((switched?.after as { confirmedByBtg?: boolean } | null)?.confirmedByBtg);
    const from = guardians.find((g) => g.id === r.fromGuardianId);
    const to = r.newGuardianId ? guardians.find((g) => g.id === r.newGuardianId) : undefined;
    const decision =
      r.state === "SWITCHED"
        ? { by: confirmedByBtg ? "BTG" as const : "CURRENT_GUARDIAN" as const, at: (r.switchedAt ?? r.decidedAt)?.toISOString() ?? null, byEmail: confirmedByBtg ? emailOf(switched!.actorId) : null, note: null }
        : r.state === "DECLINED"
          ? staffDecline
            ? { by: "BTG" as const, at: staffDecline.at.toISOString(), byEmail: emailOf(staffDecline.actorId), note: r.declineNote }
            : { by: "CURRENT_GUARDIAN" as const, at: r.decidedAt?.toISOString() ?? null, byEmail: null, note: r.declineNote }
          : r.state === "CANCELLED"
            ? { by: null, at: r.decidedAt?.toISOString() ?? null, byEmail: null, note: null }
            : null;
    return {
      athlete: { id: r.athleteId, age: ageOf(athletes.find((a) => a.id === r.athleteId)?.birthDate ?? null), sport: r.athlete.sport },
      current: { id: r.fromGuardianId, relationship: from ? RELATIONSHIP_WORDS[from.relationship] ?? from.relationship : null },
      newGuardian: to ? { id: to.id, name: to.legalName } : null,
      requester: {
        email: r.requesterEmail, phone: r.requesterPhone, emailConfirmedAt: r.emailConfirmedAt?.toISOString() ?? null,
        agreementVersion: r.agreementVersion, agreementAcceptedAt: r.agreementAcceptedAt?.toISOString() ?? null,
      },
      documents: r.documents.map((d) => ({
        id: d.id, kind: d.kind as "GUARDIAN_ID" | "GUARDIANSHIP_PROOF", label: DOCUMENT_WORDS[d.kind] ?? d.kind,
        proof: d.proofKind ? PROOF_WORDS[d.proofKind] ?? d.proofKind : null, filename: d.filename, uploadedAt: d.uploadedAt?.toISOString() ?? null,
        /* P8-BE-11 — what reading it found; P8-BE-10 — sent back (its file is gone). */
        check: checkView(d),
        returned: d.returnedAt ? { at: d.returnedAt.toISOString(), reason: d.returnedReason ?? "" } : null,
      })),
      documentHolds: documentHoldsOf(r),
      /* The current guardian's Hand off: kept on the row unless BTG declined it afterwards. */
      handedOffAt: (handedOff?.at ?? (r.state === "SWITCHED" || r.state === "HANDED_OFF" ? r.decidedAt : null))?.toISOString() ?? null,
      decision,
    };
  }
  for (const r of rows) out.set(r.id, one(r));
  return out;
}

/** GET /guardian-handoffs/:id/documents/:documentId — BTG reads the new guardian's ID or proof through a five-minute, audited link. */
export async function viewHandoffDocument(actor: Actor, id: string, documentId: string) {
  /* Tenant-wide only: the current guardian reads the request (`ward`) but never the new guardian's documents. */
  assertTenantWide(actor, "guardianHandoff", "read");
  const r = await prisma.guardianHandoff.findFirst({ where: { ...whereFor(actor, "guardianHandoff", "read"), id }, select: { id: true, tenantId: true } });
  if (!r) throw new ForbiddenError("guardianHandoff", "read");
  const doc = await prisma.guardianHandoffDocument.findFirst({ where: { tenantId: r.tenantId, handoffId: r.id, id: documentId }, select: { id: true, r2Key: true, uploadedAt: true, returnedAt: true } });
  if (!doc) throw new ForbiddenError("guardianHandoff", "read");
  if (!doc.uploadedAt) throw new HandoffError("That document never finished uploading.");
  if (doc.returnedAt) throw new HandoffError("That document was sent back; its file was deleted.", 409);
  const url = await presignPrivateDownload(actor, doc.r2Key, { entity: "GuardianHandoffDocument", entityId: doc.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}

/**
 * P8-BE-10 — POST /guardian-handoffs/:id/documents/:documentId/send-back —
 * BTG sends the new guardian's ID or proof back with a reason, while the
 * request is still open. It stops counting and its file is deleted; a
 * request already sent to the current guardian (or waiting for BTG) goes
 * back to the new guardian to fill in, and nothing switches until it is
 * sent again. The new guardian is emailed the reason and their request link.
 */
export async function sendBackHandoffDocument(actor: Actor, id: string, documentId: string, reasonIn: unknown) {
  const reason = sendBackReason(reasonIn);
  assertAllowed(actor, "guardianHandoff", "approve");
  const r = await prisma.guardianHandoff.findFirst({ where: { ...whereFor(actor, "guardianHandoff", "approve"), id }, select: SELECT });
  if (!r) throw new ForbiddenError("guardianHandoff", "approve");
  if (!["REQUESTED", "WAITING", "HANDED_OFF"].includes(r.state)) throw new SendBackError(`This request is ${r.state.toLowerCase().replace("_", " ")}; its documents can't be sent back now.`, 409);
  const doc = await prisma.guardianHandoffDocument.findFirst({
    where: { tenantId: r.tenantId, handoffId: r.id, id: documentId }, select: { id: true, kind: true, proofKind: true, r2Key: true, uploadedAt: true, returnedAt: true },
  });
  if (!doc) throw new ForbiddenError("guardianHandoff", "approve");
  if (!doc.uploadedAt) throw new SendBackError("That document never finished uploading — there's nothing to send back.", 409);
  if (doc.returnedAt) throw new SendBackError("That document was already sent back.", 409);
  await prisma.$transaction(async (tx) => {
    const moved = await tx.guardianHandoffDocument.updateMany({
      /* tenant-scope: the request's own document, loaded above; only once. */
      where: { tenantId: r.tenantId, id: doc.id, returnedAt: null }, data: returnedColumns(actor, reason),
    });
    if (moved.count !== 1) throw new SendBackError("That document was already sent back.", 409);
    if (r.state !== "REQUESTED") {
      await tx.guardianHandoff.updateMany({
        /* tenant-scope: the request loaded through whereFor(guardianHandoff, approve); only from the state it was read in. */
        where: { id: r.id, tenantId: r.tenantId, state: r.state }, data: { state: "REQUESTED", submittedAt: null, decidedAt: null, decidedBy: null },
      });
    }
    await recordSendBack(tx, actor, {
      tenantId: r.tenantId, entity: "GuardianHandoffDocument", entityId: doc.id, reason,
      documentName: doc.kind === "GUARDIANSHIP_PROOF" ? (doc.proofKind ? PROOF_WORDS[doc.proofKind] ?? "proof of guardianship" : "proof of guardianship") : "government ID",
      to: r.requesterEmail, name: r.requesterName, uploadUrl: `${appUrl()}/guardian/handoff?r=${encodeURIComponent(requestToken(r.id))}`,
      about: { handoffId: r.id, stateBefore: r.state },
    });
  });
  await deleteSentBackFile(doc.r2Key);
  return getHandoff(actor, r.id);
}

/**
 * POST /guardian-handoffs/:id/decision — the current guardian's answer.
 * `guardianHandoff.write` is held at `ward` by GUARDIAN only: an athlete,
 * a sponsor or staff cannot answer. The row is found through that scope
 * (requests made of THIS guardian), and the athlete must still be theirs.
 */
export async function decideHandoff(actor: Actor, id: string, d: { decision: "HAND_OFF" } | { decision: "DECLINE"; note?: string }) {
  assertAllowed(actor, "guardianHandoff", "write");
  return prisma.$transaction(async (tx) => {
    await lockHandoff(tx, id);
    const r = await tx.guardianHandoff.findFirst({ where: { ...whereFor(actor, "guardianHandoff", "write"), id }, select: SELECT });
    if (!r || !actor.guardianId) throw new ForbiddenError("guardianHandoff", "write");
    if (r.state !== "WAITING") throw new HandoffError(r.state === "REQUESTED" ? "This request hasn't been sent to you yet." : `This request is already ${r.state.toLowerCase()}.`);
    const athlete = await tx.athlete.findFirst({ where: { tenantId: r.tenantId, id: r.athleteId }, select: { guardianId: true } });
    if (athlete?.guardianId !== actor.guardianId) {
      throw new HandoffError("You're no longer this athlete's guardian, so this request isn't yours to answer.");
    }
    if (d.decision === "DECLINE") return decline(tx, actor, r, d.note);
    /* 2S1-BE-10's setting applies to the handoff too: when BTG staff confirm minors, the switch waits for them. */
    const tenant = await tx.tenant.findFirst({
      /* tenant-scope: the request's own tenant row. */
      where: { id: r.tenantId }, select: { staffConfirmMinors: true },
    });
    /* P8-BE-11 — and so does a document whose reading raised a question: a person checks it before anything switches. */
    const holds = documentHoldsOf(r);
    return tenant?.staffConfirmMinors || holds.length ? toStaffReview(tx, actor, r, holds) : handOff(tx, actor, r);
  });
}

/**
 * The current guardian handed off, and "BTG staff confirm minors" is on:
 * nothing switches yet. The request waits for a BTG admin (HANDED_OFF);
 * the current guardian stays in control until then.
 */
async function toStaffReview(tx: Tx, actor: Actor, r: Row, reasons: readonly string[] = []) {
  assertComplete(r);
  const at = new Date();
  const moved = await tx.guardianHandoff.updateMany({
    /* tenant-scope: loaded through whereFor(guardianHandoff, write); only while still waiting. */
    where: { id: r.id, tenantId: r.tenantId, state: "WAITING" }, data: { state: "HANDED_OFF", decidedAt: at, decidedBy: actor.userId },
  });
  if (moved.count !== 1) throw new HandoffError("This request changed a moment ago — reload it.");
  await audit(tx, actor, "guardianHandoff.handOffForReview", "GuardianHandoff", r.id, { before: { state: "WAITING" }, after: { state: "HANDED_OFF", ...(reasons.length ? { reasons } : {}) } });
  const [from, admins] = await Promise.all([
    tx.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true } }),
    tx.user.findMany({ where: { tenantId: r.tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true } }),
  ]);
  for (const u of admins) {
    await send(tx, r.tenantId, {
      template: "handoff.staffConfirm", to: u.email, idempotencyKey: `handoff.staffConfirm:${r.id}:${u.id}`,
      data: {
        athleteName: r.athlete.displayName || r.athlete.legalName, previousName: from?.legalName ?? "", requesterName: r.requesterName,
        relationship: RELATIONSHIP_WORDS[r.relationship] ?? r.relationship, reviewUrl: `${appUrl()}/admin/guardian-handoffs/${r.id}`,
      },
    });
  }
  return view(tx, await rowById(tx, r.id), true);
}

/**
 * POST /guardian-handoffs/:id/staff-decision — a BTG admin answers a
 * handoff waiting for them (HANDED_OFF): CONFIRM runs the switch, exactly
 * as Hand off would have; DECLINE (a reason the requester reads) closes it.
 * `guardianHandoff.approve` is BTG's only (own-tenant).
 */
export async function decideStaffHandoff(actor: Actor, id: string, d: { decision: "CONFIRM" } | { decision: "DECLINE"; note: string }) {
  assertAllowed(actor, "guardianHandoff", "approve");
  return prisma.$transaction(async (tx) => {
    await lockHandoff(tx, id);
    const r = await tx.guardianHandoff.findFirst({ where: { ...whereFor(actor, "guardianHandoff", "approve"), id }, select: SELECT });
    if (!r) throw new ForbiddenError("guardianHandoff", "approve");
    /* POL-BE-10 — or escalated: 7 days with the current guardian and no answer. */
    if (!btgMayDecide(r)) {
      throw new HandoffError(r.state === "WAITING"
        ? `This request is still with the current guardian. BTG can decide it once it has waited ${HANDOFF_ESCALATE_AFTER_DAYS} days.`
        : `This request is ${r.state.toLowerCase().replace("_", " ")}, not waiting for BTG.`);
    }
    const athlete = await tx.athlete.findFirst({ where: { tenantId: r.tenantId, id: r.athleteId }, select: { guardianId: true } });
    if (athlete?.guardianId !== r.fromGuardianId) {
      throw new HandoffError("This athlete's guardian changed another way since the handoff, so there is nothing to confirm.");
    }
    if (d.decision === "DECLINE") {
      if (!d.note.trim()) throw new HandoffError("Declining needs a reason — the requester reads it.", 422);
      return decline(tx, actor, r, d.note, true);
    }
    return handOff(tx, actor, r, { byBtg: r.state === "WAITING" });
  });
}

function assertComplete(r: Row) {
  /* The automatic check: email confirmed, both documents arrived, agreement accepted. Submit required all of it; checked again here. */
  const docs = uploaded(r);
  if (!r.emailConfirmedAt || !docs.id || !docs.proof || !r.agreementAcceptedAt) {
    throw new HandoffError("The new guardian's documents aren't complete. Nothing has changed.");
  }
}

async function decline(tx: Tx, actor: Actor, r: Row, note?: string, byBtg = false) {
  const at = new Date();
  await tx.guardianHandoff.update({
    /* tenant-scope: loaded through whereFor(guardianHandoff, write / approve). */
    where: { id: r.id }, data: { state: "DECLINED", decidedAt: at, decidedBy: actor.userId, declineNote: note?.trim() || null },
  });
  await audit(tx, actor, byBtg ? "guardianHandoff.staffDecline" : "guardianHandoff.decline", "GuardianHandoff", r.id, {
    before: { state: r.state }, after: { state: "DECLINED", ...(byBtg ? { note: note?.trim() ?? null } : {}) },
  });
  const from = await tx.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true } });
  const data = {
    name: firstWord(r.requesterName), currentFirstName: firstWord(from?.legalName), athleteFirstName: firstWord(r.athlete.displayName || r.athlete.legalName),
    supportEmail: env.SUPPORT_EMAIL, supportUrl: `${appUrl()}/contact?topic=guardianship`,
  };
  /* Nothing more happens automatically: the decline email points to BTG support, and a person decides.
     BTG's decline (found in review) is its own email, carrying BTG's reason as written — never
     "the current guardian declined", which they did not: they handed off. */
  if (byBtg) {
    await send(tx, r.tenantId, {
      template: "handoff.declinedByBtg", to: r.requesterEmail, idempotencyKey: `handoff.declinedByBtg:${r.id}`,
      data: { ...data, note: note?.trim() ?? "" },
    });
  } else {
    await send(tx, r.tenantId, { template: "handoff.declined", to: r.requesterEmail, idempotencyKey: `handoff.declined:${r.id}`, data });
  }
  return view(tx, await rowById(tx, r.id), true);
}

/**
 * The switch. One transaction, so there is never a moment with no guardian:
 * either all of it lands or none of it does.
 */
async function handOff(tx: Tx, actor: Actor, r: Row, opts: { byBtg?: boolean } = {}) {
  assertComplete(r);
  const at = new Date();

  /* One guardian, several athletes: a requester who is already a guardian here keeps their one record. */
  const existing = await tx.guardian.findFirst({
    where: { tenantId: r.tenantId, email: { equals: r.requesterEmail, mode: "insensitive" }, id: { not: r.fromGuardianId } },
    select: { id: true, verifiedAt: true, rejectedAt: true },
  });
  if (existing?.rejectedAt) {
    throw new HandoffError("BTG has closed the new guardian's account, so they can't take over. Nothing has changed — contact BTG support.");
  }
  const guardianId = existing
    ? existing.id
    : (await tx.guardian.create({
      data: { tenantId: r.tenantId, legalName: r.requesterName, email: r.requesterEmail, phone: r.requesterPhone, relationship: r.relationship, verifiedAt: at },
      select: { id: true },
    })).id;
  if (existing && !existing.verifiedAt) {
    /* tenant-scope: the guardian found above by email within this request's own tenant (r.tenantId). */
    await tx.guardian.update({ where: { id: existing.id }, data: { verifiedAt: at }, select: { id: true } });
  }
  /* The evidence 2S1-BE-10 records for a guardian approved by the system. */
  await audit(tx, actor, "guardian.autoApprove", "Guardian", guardianId, {
    after: { via: "handoff", handoffId: r.id, evidence: `guardian confirmed by email, with ID and proof, at ${at.toISOString()}` },
  });

  /* The link moves only if it still points at the guardian who handed off. */
  const moved = await tx.athlete.updateMany({
    /* tenant-scope: the request's own athlete, in its tenant. */
    where: { tenantId: r.tenantId, id: r.athleteId, guardianId: r.fromGuardianId },
    /* The handoff's own documents are the proof for this athlete: no per-child wait remains. */
    data: { guardianId, guardianPendingSince: null },
  });
  if (moved.count !== 1) throw new HandoffError("This athlete's guardian changed a moment ago. Nothing has been switched.");

  /* No gap in control: the new guardian must be able to sign in the moment
     they take over. Thrown inside the transaction, so nothing switches. */
  const login = await provisionGuardianLoginIn(tx, { userId: actor.userId, tenantId: r.tenantId }, guardianId);
  if (login === "address-in-use" || login === "no-email") {
    throw new HandoffError(
      login === "address-in-use"
        ? `The new guardian's email (${r.requesterEmail}) is already another SponsorX account's sign-in, so they couldn't sign in as ${firstWord(r.requesterName)}'s guardian. Nothing has changed — the current guardian stays in control. Contact BTG support.`
        : "The new guardian has no email to sign in with. Nothing has changed — contact BTG support.",
    );
  }
  const usable = await tx.user.findFirst({
    /* tenant-scope: the new guardian's own login, in the request's tenant. */
    where: { tenantId: r.tenantId, guardianId, disabledAt: null }, select: { id: true },
  });
  if (!usable) {
    throw new HandoffError("The new guardian's SponsorX login is switched off, so they couldn't take over. Nothing has changed — the current guardian stays in control. Contact BTG support.");
  }
  await tx.guardianHandoff.update({
    /* tenant-scope: loaded through whereFor(guardianHandoff, write). */
    where: { id: r.id },
    /* After a staff review the guardian's Hand off is the decision on record; BTG's confirmation is audited. */
    data: { state: "SWITCHED", ...(r.state === "HANDED_OFF" ? {} : { decidedAt: at, decidedBy: actor.userId }), documentsCheckedAt: at, switchedAt: at, newGuardianId: guardianId },
  });
  /* Any other open request for this athlete was made of a guardian who no longer is one. */
  const others = await tx.guardianHandoff.updateMany({
    where: { tenantId: r.tenantId, athleteId: r.athleteId, id: { not: r.id }, state: { in: [...OPEN_STATES, "HANDED_OFF"] } },
    data: { state: "CANCELLED", decidedAt: at },
  });
  /* POL-BE-01 — the previous guardian's payout account stops receiving this athlete's money, in the same transaction as the switch. */
  const payoutAccountDetached = await detachAthletePayoutAccountIn(tx, actor, r.athleteId, "guardian handoff", at);
  await audit(tx, actor, "guardianHandoff.switch", "Athlete", r.athleteId, {
    before: { guardianId: r.fromGuardianId }, after: { guardianId, handoffId: r.id, login, othersCancelled: others.count, payoutAccountDetached, ...(r.state === "HANDED_OFF" ? { confirmedByBtg: true } : {}), ...(opts.byBtg ? { decidedByBtgAfterNoAnswer: true } : {}) },
  });

  const [from, otherWards, admins] = await Promise.all([
    tx.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true, email: true } }),
    tx.athlete.count({ where: { tenantId: r.tenantId, guardianId: r.fromGuardianId } }),
    tx.user.findMany({ where: { tenantId: r.tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true } }),
  ]);
  const athleteFirstName = firstWord(r.athlete.displayName || r.athlete.legalName);
  /* POL-BE-10 — BTG decided a request the current guardian never answered: the emails say so, never "handed off". */
  const common = { athleteFirstName, requesterName: r.requesterName, currentFirstName: firstWord(from?.legalName), supportEmail: env.SUPPORT_EMAIL, ...(opts.byBtg ? { byBtg: "yes" } : {}) };
  await send(tx, r.tenantId, {
    template: "handoff.switchedNew", to: r.requesterEmail, idempotencyKey: `handoff.switchedNew:${r.id}`,
    data: { ...common, name: firstWord(r.requesterName), portalUrl: `${appUrl()}/athlete` },
  });
  if (from) {
    await send(tx, r.tenantId, {
      template: "handoff.switchedPrevious", to: from.email, idempotencyKey: `handoff.switchedPrevious:${r.id}`,
      data: { ...common, name: firstWord(from.legalName), otherChildren: otherWards > 0 ? "yes" : "" },
    });
  }
  if (r.athlete.email) {
    await send(tx, r.tenantId, {
      template: "handoff.switchedAthlete", to: r.athlete.email, idempotencyKey: `handoff.switchedAthlete:${r.id}`,
      data: { ...common, name: athleteFirstName },
    });
  }
  for (const u of admins) {
    await send(tx, r.tenantId, {
      template: "handoff.btgNotice", to: u.email, idempotencyKey: `handoff.btgNotice:${r.id}:${u.id}`,
      data: {
        athleteName: r.athlete.displayName || r.athlete.legalName, previousName: from?.legalName ?? "", requesterName: r.requesterName,
        relationship: RELATIONSHIP_WORDS[r.relationship] ?? r.relationship, reviewUrl: `${appUrl()}/admin/new-signups/guardians/${guardianId}`,
        ...(opts.byBtg ? { byBtg: "yes" } : {}),
      },
    });
  }
  return view(tx, await rowById(tx, r.id), true);
}

/* ═══════════════════════ POL-BE-10 · never stuck ═══════════════════════ */

/**
 * The hourly sweep (worker): a request with the current guardian 3 days is
 * reminded to them, once; at 7 days with no answer it is escalated — BTG's
 * admins and the requester are told, and so is the current guardian, who can
 * still answer. Each step is conditional on the row (a second run, or a
 * worker restarted mid-pass, does nothing twice) and audited as the system.
 */
export async function sweepGuardianHandoffs(now = new Date(), opts: { tenantIds?: string[] } = {}) {
  const tenant = opts.tenantIds ? { tenantId: { in: opts.tenantIds } } : {};
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  let reminded = 0;
  let escalated = 0;

  const toEscalate = await prisma.guardianHandoff.findMany({
    /* tenant-scope: the system's own sweep, across tenants (or the tenants a test names). */
    where: { ...tenant, state: "WAITING", escalatedAt: null, submittedAt: { lte: before(HANDOFF_ESCALATE_AFTER_DAYS) } }, select: { id: true },
  });
  for (const { id } of toEscalate) {
    await prisma.$transaction(async (tx) => {
      const r = await rowById(tx, id);
      const moved = await tx.guardianHandoff.updateMany({
        /* tenant-scope: the row just read by id; only while still waiting and not yet escalated. */
        where: { id, state: "WAITING", escalatedAt: null }, data: { escalatedAt: now, remindedAt: r.remindedAt ?? now },
      });
      if (moved.count !== 1) return;
      escalated += 1;
      await audit(tx, SYSTEM(r.tenantId), "guardianHandoff.escalate", "GuardianHandoff", id, {
        after: { escalatedAt: now.toISOString(), waitedDays: HANDOFF_ESCALATE_AFTER_DAYS },
      });
      const [from, admins] = await Promise.all([
        tx.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true, email: true } }),
        tx.user.findMany({ where: { tenantId: r.tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true } }),
      ]);
      const athleteFirstName = firstWord(r.athlete.displayName || r.athlete.legalName);
      for (const u of admins) {
        await send(tx, r.tenantId, {
          template: "handoff.escalated", to: u.email, idempotencyKey: `handoff.escalated:${id}:${u.id}`,
          data: {
            athleteName: r.athlete.displayName || r.athlete.legalName, currentName: from?.legalName ?? "", requesterName: r.requesterName,
            relationship: RELATIONSHIP_WORDS[r.relationship] ?? r.relationship, days: String(HANDOFF_ESCALATE_AFTER_DAYS),
            reviewUrl: `${appUrl()}/admin/guardian-handoffs/${id}`,
          },
        });
      }
      await send(tx, r.tenantId, {
        template: "handoff.escalatedRequester", to: r.requesterEmail, idempotencyKey: `handoff.escalatedRequester:${id}`,
        data: { name: firstWord(r.requesterName), athleteFirstName, currentFirstName: firstWord(from?.legalName), supportEmail: env.SUPPORT_EMAIL },
      });
      if (from) {
        await send(tx, r.tenantId, {
          template: "handoff.escalatedGuardian", to: from.email, idempotencyKey: `handoff.escalatedGuardian:${id}`,
          data: { name: firstWord(from.legalName), athleteFirstName, requesterName: r.requesterName, portalUrl: `${appUrl()}/athlete/guardian-requests`, supportEmail: env.SUPPORT_EMAIL },
        });
      }
    });
  }

  const toRemind = await prisma.guardianHandoff.findMany({
    /* tenant-scope: the system's own sweep, across tenants (or the tenants a test names). */
    where: { ...tenant, state: "WAITING", remindedAt: null, escalatedAt: null, submittedAt: { lte: before(HANDOFF_REMIND_AFTER_DAYS) } }, select: { id: true },
  });
  for (const { id } of toRemind) {
    await prisma.$transaction(async (tx) => {
      const r = await rowById(tx, id);
      const moved = await tx.guardianHandoff.updateMany({
        /* tenant-scope: the row just read by id; only while still waiting and not yet reminded. */
        where: { id, state: "WAITING", remindedAt: null }, data: { remindedAt: now },
      });
      if (moved.count !== 1) return;
      reminded += 1;
      await audit(tx, SYSTEM(r.tenantId), "guardianHandoff.remind", "GuardianHandoff", id, { after: { remindedAt: now.toISOString() } });
      const from = await tx.guardian.findFirst({ where: { tenantId: r.tenantId, id: r.fromGuardianId }, select: { legalName: true, email: true } });
      if (!from) return;
      await send(tx, r.tenantId, {
        template: "handoff.reminder", to: from.email, idempotencyKey: `handoff.reminder:${id}`,
        data: {
          name: firstWord(from.legalName), requesterName: r.requesterName, relationship: RELATIONSHIP_WORDS[r.relationship] ?? r.relationship,
          athleteFirstName: firstWord(r.athlete.displayName || r.athlete.legalName), days: String(HANDOFF_ESCALATE_AFTER_DAYS - HANDOFF_REMIND_AFTER_DAYS),
          portalUrl: `${appUrl()}/athlete/guardian-requests`, supportEmail: env.SUPPORT_EMAIL,
        },
      });
    });
  }
  return { reminded, escalated };
}
