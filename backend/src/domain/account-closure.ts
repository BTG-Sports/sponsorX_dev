/**
 * Closing an account, 30-day retention and coming back — 2S1-BE-13.
 *
 * WHO CAN CLOSE. Athletes, guardians and organizations close their OWN
 * account (POST /me/close). It is authorised through the account's own
 * resource at write — `athlete`, `guardian` or `property` — and the row is
 * found by the id on the actor, so only the account you are can be closed.
 * Closing switches off the account's logins (User.disabledAt, marked with
 * this closure), pauses its published listings, withdraws a property's
 * listing access, and records an AccountClosure kept for 30 days. Money
 * already earned is untouched: it is still paid out.
 *
 * A REJECTED ACCOUNT is closed by BTG's Reject, in the code that owns that
 * Reject: sponsors (sponsor-requests.ts), organisations (onboarding.ts
 * `withdraw`), athletes and guardians (signups-desk.ts), and the coming-of-
 * age termination (coming-of-age.ts, cause TERMINATED). That code switches
 * the logins off (`REJECT_TAKES_LOGINS` — including any a self-closure had
 * already switched off) and calls `recordClosureIn`, so the same 30-day
 * retention applies; its Reinstate calls `reopenClosureIn`. A self-closed
 * account that is then rejected has its one closure turned into a rejection:
 * it can no longer reactivate itself, only ask BTG.
 *
 * COMING BACK — WHY A SIGNED, EMAILED LINK. A closed account's login is
 * refused at sign-in (auth/actor.ts, AccountDisabledError), so the person
 * coming back cannot prove who they are by signing in. They prove it the
 * way sign-up did: by reading the account's email. The closing email
 * carries a reactivation link (valid for the 30 days), and the public
 * reactivation page sends a fresh one (valid for a day) to whoever types
 * the address — answering the same either way, so it reveals nothing about
 * who has an account. The link is purpose-signed (lib/purpose-token.ts) and
 * reaches one closure. Self-closed: the link reactivates. Rejected: the link
 * can only ask BTG, and BTG decides.
 *
 * AFTER 30 DAYS the retention job (`purgeExpiredClosures`, run by the
 * worker) deletes the account's ID and verification files from the private
 * bucket and their rows, audits it, and releases the logins' email
 * addresses so a new sign-up can use them. The link then says "sign up
 * again".
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { issuePurposeToken, readPurposeToken } from "../lib/purpose-token";
import { deletePrivateObject } from "../lib/storage";
import { mayParticipate } from "./guardian-rules";
import {
  closureMarker, dayWords, reactivationStanding, retainUntilFrom, retentionDaysLeft,
  type ClosureCause, type ClosureSubject,
} from "./account-closure-rules";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class AccountClosureError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "AccountClosureError";
    this.status = status;
  }
}

const appUrl = () => env.APP_URL.replace(/\/+$/, "");
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? s;

const CLOSURE_SELECT = {
  id: true, tenantId: true, subjectKind: true, subjectId: true, cause: true, state: true, reason: true,
  closedAt: true, retainUntil: true, userIds: true, pausedListingIds: true, listingAccessWithdrawn: true,
  contactEmail: true, displayName: true, reactivatedAt: true, recheckNotes: true, purgedAt: true,
  reactivationRequestedAt: true, reactivationRequestNote: true, reactivationDecision: true,
  reactivationDecidedAt: true, reactivationDecisionNote: true, createdAt: true,
} as const;
type ClosureRow = Prisma.AccountClosureGetPayload<{ select: typeof CLOSURE_SELECT }>;

export const reactivateUrl = (closureId: string, expiresAt: Date) =>
  `${appUrl()}/reactivate?t=${encodeURIComponent(issuePurposeToken("account-reactivation", closureId, expiresAt))}`;

/** Where each kind of account signs in again. */
const PORTAL: Record<ClosureSubject, string> = { ATHLETE: "/athlete", GUARDIAN: "/athlete", PROPERTY: "/property", SPONSOR: "/sponsor" };

/* ═══════════════════════ closing your own account ════════════════════════ */

export type CloseInput = { account?: "athlete" | "guardian" | "property"; reason?: string };

type Subject = {
  kind: ClosureSubject;
  id: string;
  contactEmail: string;
  displayName: string;
  /** The logins that are this account. */
  users: Prisma.UserWhereInput;
  /** Its published listings, paused while it is closed. */
  listings: Prisma.ListingWhereInput | null;
};

/** Which account the actor is closing — always their own, found by the id on the actor. */
async function ownSubject(tx: Tx, actor: Actor, input: CloseInput): Promise<Subject> {
  const pick = input.account
    ?? (actor.athleteId ? "athlete" : actor.guardianId && actor.roles.includes("GUARDIAN") ? "guardian" : actor.propertyId && actor.roles.includes("PROPERTY_MGR") ? "property" : null);
  const me = await tx.user.findFirst({ where: { ...whereFor(actor, "user", "read"), id: actor.userId }, select: { email: true } });

  if (pick === "athlete") {
    assertAllowed(actor, "athlete", "write");
    const a = actor.athleteId
      ? await tx.athlete.findFirst({ where: { ...whereFor(actor, "athlete", "write"), id: actor.athleteId }, select: { id: true, email: true, displayName: true } })
      : null;
    if (!a) throw new ForbiddenError("athlete", "write");
    return {
      kind: "ATHLETE", id: a.id, contactEmail: (a.email ?? me?.email ?? "").toLowerCase(), displayName: firstWord(a.displayName),
      users: { tenantId: actor.tenantId, athleteId: a.id },
      /* Their own listings, and the team's listings of their items (a roster
         athlete's items are listed by the team, 2S2-BE-05) — none sells while
         the account is closed. */
      listings: { tenantId: actor.tenantId, state: "PUBLISHED", OR: [{ sellerAthleteId: a.id }, { propertyId: { not: null }, item: { is: { athleteId: a.id } } }] },
    };
  }
  if (pick === "guardian") {
    assertAllowed(actor, "guardian", "write");
    const g = actor.guardianId
      ? await tx.guardian.findFirst({ where: { ...whereFor(actor, "guardian", "write"), id: actor.guardianId }, select: { id: true, email: true, legalName: true } })
      : null;
    if (!g) throw new ForbiddenError("guardian", "write");
    return {
      kind: "GUARDIAN", id: g.id, contactEmail: g.email.toLowerCase(), displayName: firstWord(g.legalName),
      /* The guardian's own login — never their ward's, which is the athlete's own account. */
      users: { tenantId: actor.tenantId, guardianId: g.id, athleteId: null },
      listings: null,
    };
  }
  if (pick === "property") {
    assertAllowed(actor, "property", "write");
    const p = actor.propertyId
      ? await tx.property.findFirst({ where: { ...whereFor(actor, "property", "write"), id: actor.propertyId }, select: { id: true, name: true } })
      : null;
    if (!p) throw new ForbiddenError("property", "write");
    return {
      kind: "PROPERTY", id: p.id, contactEmail: (me?.email ?? "").toLowerCase(), displayName: p.name,
      users: { tenantId: actor.tenantId, propertyId: p.id, roles: { has: "PROPERTY_MGR" } },
      listings: { tenantId: actor.tenantId, propertyId: p.id, state: "PUBLISHED" },
    };
  }
  throw new AccountClosureError("This login has no athlete, guardian or organization account to close.", 403);
}

/**
 * POST /me/close — close the account this login is. Everything in one
 * transaction: the closure, the logins switched off (this one included, so
 * the next request is refused), the listings paused, the audit row, and the
 * email with the way back.
 */
export async function closeOwnAccount(actor: Actor, input: CloseInput) {
  const reason = input.reason?.trim() || null;
  return prisma.$transaction(async (tx) => {
    const s = await ownSubject(tx, actor, input);
    const open = await tx.accountClosure.findFirst({
      where: { tenantId: actor.tenantId, subjectKind: s.kind, subjectId: s.id, state: "CLOSED" }, select: { id: true },
    });
    if (open) throw new AccountClosureError("This account is already closed.");

    const closedAt = new Date();
    const retainUntil = retainUntilFrom(closedAt);
    const closure = await tx.accountClosure.create({
      data: {
        tenantId: actor.tenantId, subjectKind: s.kind, subjectId: s.id, cause: "SELF", reason, closedAt, closedBy: actor.userId,
        retainUntil, contactEmail: s.contactEmail, displayName: s.displayName,
      },
      select: { id: true },
    });

    const users = await tx.user.findMany({
      /* tenant-scope: Subject.users carries the actor's tenantId. */
      where: { ...s.users, disabledAt: null }, select: { id: true },
    });
    await tx.user.updateMany({
      /* tenant-scope: the logins found just above, in the actor's tenant. */
      where: { id: { in: users.map((u) => u.id) } },
      data: { disabledAt: closedAt, disabledReason: closureMarker(closure.id) },
    });
    const listings = s.listings
      ? await tx.listing.findMany({
        /* tenant-scope: Subject.listings carries the actor's tenantId. */
        where: s.listings, select: { id: true },
      })
      : [];
    if (listings.length) {
      await tx.listing.updateMany({
        /* tenant-scope: the account's own published listings, found just above. */
        where: { id: { in: listings.map((l) => l.id) }, state: "PUBLISHED" }, data: { state: "PAUSED" },
      });
    }
    await markAthleteClosedIn(tx, s.kind, s.id, closedAt);
    let listingAccessWithdrawn = false;
    if (s.kind === "PROPERTY") {
      const p = await tx.property.findFirst({ where: { tenantId: actor.tenantId, id: s.id }, select: { listingAccessAt: true } });
      if (p?.listingAccessAt) {
        await tx.property.update({ where: { id: s.id }, data: { listingAccessAt: null }, select: { id: true } });
        listingAccessWithdrawn = true;
      }
    }
    await tx.accountClosure.update({
      /* tenant-scope: the closure created above. */
      where: { id: closure.id },
      data: { userIds: users.map((u) => u.id), pausedListingIds: listings.map((l) => l.id), listingAccessWithdrawn },
    });
    await audit(tx, actor, "account.close", s.kind === "PROPERTY" ? "Property" : s.kind === "GUARDIAN" ? "Guardian" : "Athlete", s.id, {
      after: { closureId: closure.id, cause: "SELF", loginsSwitchedOff: users.length, listingsPaused: listings.length, listingAccessWithdrawn, retainUntil: retainUntil.toISOString() },
    });
    if (s.contactEmail) {
      await send(tx, actor.tenantId, {
        template: "account.closed", to: s.contactEmail, idempotencyKey: `account.closed:${closure.id}`,
        data: { name: s.displayName, retainUntil: dayWords(retainUntil), reactivateUrl: reactivateUrl(closure.id, retainUntil), supportEmail: env.SUPPORT_EMAIL },
      });
    }
    return { closureId: closure.id, account: s.kind, closedAt, retainUntil, loginsSwitchedOff: users.length, listingsPaused: listings.length };
  });
}

/* ══════════════════ rejected accounts (called by each Reject) ═════════════ */

export type RecordClosure = {
  subjectKind: ClosureSubject;
  subjectId: string;
  cause: Exclude<ClosureCause, "SELF">;
  reason: string | null;
  /** The logins the Reject switched off. */
  userIds: string[];
  contactEmail: string;
  displayName: string;
};

/**
 * The logins a Reject (or a termination) switches off: every login still on,
 * AND any a self-closure had already switched off — the Reject takes those
 * over (its own marker replaces the closure's), so a self-closed account
 * that BTG then rejects can no longer reactivate itself, and Reinstate
 * brings every one of them back.
 */
export const REJECT_TAKES_LOGINS: Prisma.UserWhereInput = {
  OR: [{ disabledAt: null }, { disabledReason: { startsWith: closureMarker("") } }],
};

/** Mirror an athlete's open closure on the row (Athlete.accountClosedAt), for the "can this seller sell?" queries. */
async function markAthleteClosedIn(tx: Tx, kind: ClosureSubject | string, subjectId: string, at: Date | null) {
  if (kind !== "ATHLETE") return;
  await tx.athlete.updateMany({
    /* tenant-scope: the closure's own athlete, named by its globally unique id. */
    where: { id: subjectId }, data: { accountClosedAt: at },
  });
}

/**
 * Start the 30-day retention for an account BTG rejected (or the
 * coming-of-age rule ended). The caller has already switched the logins
 * off; this records the closure so the files are kept, then deleted, and so
 * the reactivation page can let the person ask BTG. The closure is filed in
 * the rejecting actor's tenant (BTG's, which reads and answers it).
 *
 * One open closure per account (the unique index): if the account is
 * already closed, that closure is kept — and if it was closed by its owner,
 * it BECOMES this rejection: the cause moves to REJECTED / TERMINATED (so it
 * can no longer reactivate itself), the 30 days restart from now, and the
 * logins are this Reject's. A rejection never turns back into a self-closure.
 */
export async function recordClosureIn(tx: Tx, by: AuditActor, r: RecordClosure): Promise<string> {
  const open = await tx.accountClosure.findFirst({
    /* tenant-scope: one open closure per account across every tenant (the unique index) — an organisation's own closure lives in its own tenant. */
    where: { subjectKind: r.subjectKind, subjectId: r.subjectId, state: "CLOSED" }, select: { id: true, cause: true, userIds: true, tenantId: true },
  });
  const closedAt = new Date();
  if (open) {
    if (open.cause === "SELF") {
      await tx.accountClosure.update({
        /* tenant-scope: the open closure found just above, by its subject. */
        where: { id: open.id },
        data: {
          tenantId: by.tenantId, cause: r.cause, reason: r.reason, closedBy: by.userId, retainUntil: retainUntilFrom(closedAt),
          userIds: [...new Set([...open.userIds, ...r.userIds])], contactEmail: r.contactEmail.toLowerCase(), displayName: r.displayName,
        },
      });
      await audit(tx, by, "account.closureCauseChanged", "AccountClosure", open.id, {
        before: { cause: "SELF", tenantId: open.tenantId }, after: { cause: r.cause, subjectKind: r.subjectKind, subjectId: r.subjectId },
      });
    }
    await markAthleteClosedIn(tx, r.subjectKind, r.subjectId, closedAt);
    return open.id;
  }
  const c = await tx.accountClosure.create({
    data: {
      tenantId: by.tenantId, subjectKind: r.subjectKind, subjectId: r.subjectId, cause: r.cause, reason: r.reason, closedAt,
      closedBy: by.userId, retainUntil: retainUntilFrom(closedAt), userIds: r.userIds, contactEmail: r.contactEmail.toLowerCase(), displayName: r.displayName,
    },
    select: { id: true },
  });
  await markAthleteClosedIn(tx, r.subjectKind, r.subjectId, closedAt);
  await audit(tx, by, "account.closureRecorded", "AccountClosure", c.id, { after: { subjectKind: r.subjectKind, subjectId: r.subjectId, cause: r.cause } });
  return c.id;
}

/** A Reinstate brings a rejected account back: its closure ends, and nothing is deleted. */
export async function reopenClosureIn(tx: Tx, by: AuditActor, subjectKind: ClosureSubject, subjectId: string): Promise<boolean> {
  const moved = await tx.accountClosure.updateMany({
    /* tenant-scope: the one open closure of this account (unique per subject, across tenants). */
    where: { subjectKind, subjectId, state: "CLOSED" },
    data: { state: "REACTIVATED", reactivatedAt: new Date(), reactivatedBy: by.userId },
  });
  if (moved.count) {
    await markAthleteClosedIn(tx, subjectKind, subjectId, null);
    await audit(tx, by, "account.reopen", "AccountClosure", subjectId, { after: { subjectKind, subjectId } });
  }
  return moved.count > 0;
}

/* ═══════════════════════ the reactivation page (public) ══════════════════ */

function closureIdFrom(token: string): string {
  const id = readPurposeToken("account-reactivation", token);
  if (!id) throw new AccountClosureError("This link has expired or isn't valid. Ask for a new one on the reactivation page.", 400);
  return id;
}

async function closureById(db: Db, id: string): Promise<ClosureRow> {
  const c = await db.accountClosure.findFirst({
    /* tenant-scope: found by the id inside a signed link mailed to the account's own address. */
    where: { id }, select: CLOSURE_SELECT,
  });
  if (!c) throw new AccountClosureError("This account no longer exists.", 404);
  return c;
}

function standingOf(c: ClosureRow) {
  const standing = reactivationStanding(c);
  return {
    standing,
    kind: c.subjectKind as ClosureSubject,
    greeting: c.displayName,
    closedAt: c.closedAt,
    retainUntil: c.retainUntil,
    daysLeft: retentionDaysLeft(c.retainUntil),
    /* The person reads BTG's reason in the rejection email; here they see only that they asked. */
    requestedAt: c.reactivationRequestedAt,
    requestDeclined: c.reactivationDecision === "DECLINED",
    reactivatedAt: c.reactivatedAt,
    recheckNotes: c.recheckNotes,
    portalPath: PORTAL[c.subjectKind as ClosureSubject],
    supportEmail: env.SUPPORT_EMAIL,
  };
}

/** GET /public/account/reactivation/:token — where this closed account stands. */
export async function reactivationStatus(token: string) {
  return standingOf(await closureById(prisma, closureIdFrom(token)));
}

/**
 * POST /public/account/reactivation-link — email a fresh link to whoever
 * owns this address. The answer never says whether an account exists.
 */
export async function sendReactivationLink(email: string): Promise<{ sent: true }> {
  const address = email.trim().toLowerCase();
  const closures = await prisma.accountClosure.findMany({
    /* tenant-scope: a public lookup by mailbox; the link goes only to that mailbox, and the reply is the same either way. */
    where: { contactEmail: address, state: "CLOSED", retainUntil: { gt: new Date() } },
    select: { id: true, tenantId: true, displayName: true },
    take: 5,
  });
  const hour = Math.floor(Date.now() / 3_600_000);
  for (const c of closures) {
    await prisma.$transaction((tx) =>
      send(tx, c.tenantId, {
        /* One per account per hour, however often the button is pressed. */
        template: "account.reactivationLink", to: address, idempotencyKey: `account.reactivationLink:${c.id}:${hour}`,
        data: { name: c.displayName, reactivateUrl: reactivateUrl(c.id, new Date(Date.now() + LINK_TTL_MS)) },
      }),
    );
  }
  return { sent: true };
}

/**
 * POST /public/account/reactivation/:token {action:"REACTIVATE"} — a
 * self-closed account comes back: its logins on, its listings back, the
 * checks re-run. Only inside the 30 days, and only for an account its owner
 * closed — a rejected one is refused here and can only ask.
 */
export async function reactivateByToken(token: string) {
  const id = closureIdFrom(token);
  return prisma.$transaction(async (tx) => {
    const c = await closureById(tx, id);
    const standing = reactivationStanding(c);
    if (standing === "REACTIVATED") return standingOf(c);
    if (standing === "EXPIRED") throw new AccountClosureError("The 30 days have passed and the documents are deleted. To come back, sign up again.", 410);
    if (standing === "CLOSED_BY_BTG") throw new AccountClosureError("BTG closed this account, so it can't reactivate itself. Ask BTG to look again instead.", 403);

    /* Claim the closure first: two clicks of the link reactivate once. */
    const moved = await tx.accountClosure.updateMany({
      /* tenant-scope: the closure named inside the signed link. */
      where: { id: c.id, state: "CLOSED" }, data: { state: "REACTIVATED", reactivatedAt: new Date(), reactivatedBy: c.userIds[0] ?? null },
    });
    if (moved.count !== 1) return standingOf(await closureById(tx, c.id));
    const by: AuditActor = { userId: c.userIds[0] ?? null, tenantId: c.tenantId };

    const on = await tx.user.updateMany({
      /* tenant-scope: exactly the logins this closure switched off, in its tenant. */
      where: { tenantId: c.tenantId, id: { in: c.userIds }, disabledReason: closureMarker(c.id) },
      data: { disabledAt: null, disabledReason: null },
    });
    await markAthleteClosedIn(tx, c.subjectKind, c.subjectId, null);
    const notes = await recheck(tx, c);
    await tx.accountClosure.update({
      /* tenant-scope: the closure claimed above. */
      where: { id: c.id }, data: { recheckNotes: notes.notes },
    });
    await audit(tx, by, "account.reactivate", "AccountClosure", c.id, {
      after: { subjectKind: c.subjectKind, subjectId: c.subjectId, loginsSwitchedOn: on.count, listingsRestored: notes.listingsRestored, checks: notes.notes },
    });
    await send(tx, c.tenantId, {
      template: "account.reactivated", to: c.contactEmail, idempotencyKey: `account.reactivated:${c.id}`,
      data: { name: c.displayName, portalUrl: `${appUrl()}${PORTAL[c.subjectKind as ClosureSubject]}`, notes: notes.notes.join("\n") },
    });
    return standingOf(await closureById(tx, c.id));
  });
}

/**
 * The automatic checks, run again on the way back. Files were never touched
 * inside the 30 days, so they are simply active again; what can have
 * changed is whether the account may still list: a property needs its
 * approved onboarding with its documents, and a minor needs a verified
 * guardian (2S1-BE-10's rule, `mayParticipate`). What fails is said, and its
 * listings stay paused until BTG or the guardian sorts it.
 */
async function recheck(tx: Tx, c: ClosureRow): Promise<{ notes: string[]; listingsRestored: number }> {
  const notes: string[] = [];
  let mayList = true;
  if (c.subjectKind === "ATHLETE") {
    const a = await tx.athlete.findFirst({
      where: { tenantId: c.tenantId, id: c.subjectId },
      select: { state: true, birthDate: true, ageBand: true, guardianId: true, guardian: { select: { verifiedAt: true } } },
    });
    if (!a || !["APPROVED", "ACTIVE", "FEATURED"].includes(a.state)) {
      mayList = false;
      notes.push("Your profile isn't approved right now, so your listings stay paused. BTG has been told.");
    } else if (!mayParticipate({ birthDate: a.birthDate, ageBand: a.ageBand, guardianId: a.guardianId, guardianVerifiedAt: a.guardian?.verifiedAt ?? null })) {
      mayList = false;
      notes.push("Your guardian needs to be confirmed before your listings come back.");
    }
  }
  if (c.subjectKind === "PROPERTY") {
    const p = await tx.property.findFirst({
      where: { tenantId: c.tenantId, id: c.subjectId },
      select: { onboarding: { select: { state: true, documents: { where: { uploadedAt: { not: null } }, select: { id: true } } } } },
    });
    if (!p?.onboarding || p.onboarding.state !== "APPROVED") {
      mayList = false;
      notes.push("Your organization isn't approved right now, so listing access waits for BTG.");
    } else if (!p.onboarding.documents.length) {
      mayList = false;
      notes.push("Your organization's documents are missing, so listing access waits until they are uploaded.");
    } else if (c.listingAccessWithdrawn) {
      await tx.property.update({ where: { id: c.subjectId }, data: { listingAccessAt: new Date() }, select: { id: true } });
    }
  }
  let listingsRestored = 0;
  if (mayList && c.pausedListingIds.length) {
    const paused = await tx.listing.findMany({
      /* tenant-scope: the listings this closure paused, in its tenant, still paused. */
      where: { tenantId: c.tenantId, id: { in: c.pausedListingIds }, state: "PAUSED" },
      select: { id: true, propertyId: true, item: { select: { athlete: { select: { propertyId: true } } } } },
    });
    /* A team's listing of the athlete's item comes back only while the athlete is still on that team (2S2-BE-05). */
    const ids = paused.filter((l) => !l.propertyId || c.subjectKind !== "ATHLETE" || l.item.athlete?.propertyId === l.propertyId).map((l) => l.id);
    const back = await tx.listing.updateMany({
      /* tenant-scope: the listings found just above. */
      where: { tenantId: c.tenantId, id: { in: ids }, state: "PAUSED" }, data: { state: "PUBLISHED" },
    });
    listingsRestored = back.count;
  }
  if (!notes.length) notes.push("Everything checked out: your profile, items and documents are active again.");
  return { notes, listingsRestored };
}

/**
 * POST /public/account/reactivation/:token {action:"REQUEST", note} — a
 * rejected account asks BTG to look again. Recorded and emailed to BTG
 * admins; nothing about the account changes. BTG decides: Reinstate on the
 * account's own page (which reopens the closure), or decline here.
 */
export async function askBtgToReactivate(token: string, note: string | undefined) {
  const id = closureIdFrom(token);
  return prisma.$transaction(async (tx) => {
    const c = await closureById(tx, id);
    const standing = reactivationStanding(c);
    if (standing === "EXPIRED") throw new AccountClosureError("The 30 days have passed and the documents are deleted. To come back, sign up again.", 410);
    if (standing === "CLOSED_SELF") throw new AccountClosureError("You closed this account yourself — reactivate it instead.", 409);
    if (standing === "REACTIVATED") return standingOf(c);
    if (c.reactivationRequestedAt && c.reactivationDecision !== "DECLINED") return standingOf(c);

    const text = note?.trim() || null;
    const at = new Date();
    await tx.accountClosure.update({
      /* tenant-scope: the closure named inside the signed link. */
      where: { id: c.id },
      data: { reactivationRequestedAt: at, reactivationRequestNote: text, reactivationDecision: null, reactivationDecidedAt: null, reactivationDecidedBy: null, reactivationDecisionNote: null },
    });
    await audit(tx, { userId: c.userIds[0] ?? null, tenantId: c.tenantId }, "account.reactivationRequest", "AccountClosure", c.id, { after: { note: text } });
    const admins = await tx.user.findMany({
      where: { tenantId: c.tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true },
    });
    const reviewUrl = await reviewUrlFor(tx, c);
    for (const u of admins) {
      await send(tx, c.tenantId, {
        template: "account.reactivationRequested", to: u.email, idempotencyKey: `account.reactivationRequested:${c.id}:${at.getTime()}:${u.id}`,
        data: {
          name: c.displayName, kind: c.subjectKind.toLowerCase(), closedAt: dayWords(c.closedAt), retainUntil: dayWords(c.retainUntil),
          note: text ?? "", reviewUrl, requestsUrl: `${appUrl()}/admin/new-signups?tab=review`,
        },
      });
    }
    return standingOf(await closureById(tx, c.id));
  });
}

/** The BTG page where this account is reinstated. */
async function reviewUrlFor(tx: Tx, c: ClosureRow): Promise<string> {
  if (c.subjectKind === "SPONSOR") {
    const inq = await tx.inquiry.findFirst({ where: { tenantId: c.tenantId, sponsorId: c.subjectId }, select: { id: true }, orderBy: { createdAt: "desc" } });
    if (inq) return `${appUrl()}/admin/sponsor-requests/${inq.id}`;
  }
  /* Where Reinstate is: the athlete's and guardian's profiles on New sign-ups (2S1-BE-09 / -10), the organisation's profile (2S1-BE-06). */
  if (c.subjectKind === "ATHLETE") return `${appUrl()}/admin/new-signups/athletes/${c.subjectId}`;
  if (c.subjectKind === "GUARDIAN") return `${appUrl()}/admin/new-signups/guardians/${c.subjectId}`;
  if (c.subjectKind === "PROPERTY") {
    const onb = await tx.propertyOnboarding.findFirst({
      /* tenant-scope: the onboarding that provisioned this closure's own property (it lives in its operator's tenant). */
      where: { propertyId: c.subjectId }, select: { id: true },
    });
    if (onb) return `${appUrl()}/admin/onboarding/${onb.id}`;
  }
  return `${appUrl()}/admin/new-signups?tab=review`;
}

/* ═══════════════════════ BTG's side ═════════════════════════════════════ */

/** GET /account-closures?requested=true — closed accounts, newest first; `requested` narrows to those asking to come back. */
export async function listClosures(actor: Actor, opts: { requested?: boolean } = {}) {
  assertAllowed(actor, "accountClosure", "read");
  const rows = await prisma.accountClosure.findMany({
    where: {
      ...whereFor(actor, "accountClosure", "read"),
      ...(opts.requested ? { state: "CLOSED", reactivationRequestedAt: { not: null }, reactivationDecision: null } : {}),
    },
    select: CLOSURE_SELECT,
    orderBy: { closedAt: "desc" },
    take: 100,
  });
  return { closures: rows.map((c) => ({ id: c.id, ...standingOf(c), subjectId: c.subjectId, cause: c.cause, state: c.state, reason: c.reason, requestNote: c.reactivationRequestNote })) };
}

/**
 * POST /account-closures/:id/reactivation-decision {decision:"DECLINE", note}
 * — BTG's "no" to a rejected account asking to come back, emailed with the
 * support address. "Yes" is the account's own Reinstate.
 */
export async function declineReactivation(actor: Actor, id: string, note: string) {
  assertAllowed(actor, "accountClosure", "approve");
  const text = note.trim();
  if (!text) throw new AccountClosureError("Declining needs a reason — the person reads it.", 422);
  return prisma.$transaction(async (tx) => {
    const c = await tx.accountClosure.findFirst({ where: { ...whereFor(actor, "accountClosure", "approve"), id }, select: CLOSURE_SELECT });
    if (!c) throw new ForbiddenError("accountClosure", "approve");
    if (c.state !== "CLOSED" || !c.reactivationRequestedAt || c.reactivationDecision) throw new AccountClosureError("There is no open request to come back on this account.");
    const at = new Date();
    await tx.accountClosure.update({
      /* tenant-scope: loaded through whereFor(accountClosure, approve). */
      where: { id: c.id },
      data: { reactivationDecision: "DECLINED", reactivationDecidedAt: at, reactivationDecidedBy: actor.userId, reactivationDecisionNote: text },
    });
    await audit(tx, actor, "account.reactivationDecline", "AccountClosure", c.id, { after: { note: text } });
    await send(tx, c.tenantId, {
      template: "account.reactivationDeclined", to: c.contactEmail, idempotencyKey: `account.reactivationDeclined:${c.id}:${at.getTime()}`,
      data: { name: c.displayName, note: text, supportEmail: env.SUPPORT_EMAIL, supportUrl: `${appUrl()}/contact?topic=account` },
    });
    return { id: c.id, ...standingOf(await closureById(tx, c.id)) };
  });
}

/* ═══════════════════════ the retention job (worker) ═════════════════════ */

/** One kind of ID or verification file an account holds. EVERY table that
 *  holds an ID or verification document registers here, so the purge after
 *  30 days reaches it: AccountDocument (sign-up IDs, 2S1-BE-09/-10),
 *  AthleteProfileChange's matching ID (2S1-BE-14), GuardianHandoffDocument
 *  (2S1-BE-15), OnboardingDocument (organisations, 2S1-BE-02/-07) and
 *  InquiryDocument (sponsors, 2S1-BE-17). */
export type RetainedDocumentSource = {
  name: string;
  subjects: readonly ClosureSubject[];
  /** The files this account holds: an id to delete and its private key. */
  collect: (tx: Tx, c: { tenantId: string; subjectKind: ClosureSubject; subjectId: string }) => Promise<{ id: string; key: string }[]>;
  /** Remove the index rows (or blank the key) once the objects are gone. */
  remove: (tx: Tx, tenantId: string, ids: string[]) => Promise<void>;
};

export const RETAINED_DOCUMENT_SOURCES: RetainedDocumentSource[] = [
  {
    /* 2S1-BE-09 / -10 — the identity documents sign-up collected: an athlete's
       GOVERNMENT_ID or SCHOOL_ID (and the government ID a coming-of-age
       athlete uploads), a guardian's GUARDIAN_ID and GUARDIANSHIP_PROOF. */
    name: "AccountDocument",
    subjects: ["ATHLETE", "GUARDIAN"],
    collect: async (tx, c) =>
      (await tx.accountDocument.findMany({
        where: { tenantId: c.tenantId, ...(c.subjectKind === "ATHLETE" ? { athleteId: c.subjectId } : { guardianId: c.subjectId }) },
        select: { id: true, r2Key: true },
      })).map((r) => ({ id: r.id, key: r.r2Key })),
    remove: async (tx, tenantId, ids) => { await tx.accountDocument.deleteMany({ where: { tenantId, id: { in: ids } } }); },
  },
  {
    /* 2S1-BE-14 — the ID a legal-name change was matched against. */
    name: "AthleteProfileChange.idDocument",
    subjects: ["ATHLETE"],
    collect: async (tx, c) =>
      (await tx.athleteProfileChange.findMany({ where: { tenantId: c.tenantId, athleteId: c.subjectId, idDocumentKey: { not: null } }, select: { id: true, idDocumentKey: true } }))
        .map((r) => ({ id: r.id, key: r.idDocumentKey! })),
    remove: async (tx, tenantId, ids) => {
      await tx.athleteProfileChange.updateMany({ where: { tenantId, id: { in: ids } }, data: { idDocumentKey: null, idDocumentFilename: null, idDocumentUploadedAt: null } });
    },
  },
  {
    /* 2S1-BE-15 — the ID and proof that made this person a guardian through a handoff. */
    name: "GuardianHandoffDocument",
    subjects: ["GUARDIAN"],
    collect: async (tx, c) =>
      (await tx.guardianHandoffDocument.findMany({ where: { tenantId: c.tenantId, handoff: { is: { newGuardianId: c.subjectId } } }, select: { id: true, r2Key: true } }))
        .map((r) => ({ id: r.id, key: r.r2Key })),
    remove: async (tx, tenantId, ids) => { await tx.guardianHandoffDocument.deleteMany({ where: { tenantId, id: { in: ids } } }); },
  },
  {
    /* 2S1-BE-02 — an organization's verification documents. */
    name: "OnboardingDocument",
    subjects: ["PROPERTY"],
    collect: async (tx, c) =>
      (await tx.onboardingDocument.findMany({
        /* tenant-scope: the documents of this property's own onboarding, which lives in its operator's tenant. */
        where: { onboarding: { is: { propertyId: c.subjectId } } }, select: { id: true, r2Key: true },
      }))
        .map((r) => ({ id: r.id, key: r.r2Key })),
    remove: async (tx, _tenantId, ids) => {
      /* tenant-scope: rows collected through their onboarding's own property, whose tenant is the operator's. */
      await tx.onboardingDocument.deleteMany({ where: { id: { in: ids } } });
    },
  },
  {
    /* 2S1-BE-17 — a sponsor's proof of business. */
    name: "InquiryDocument",
    subjects: ["SPONSOR"],
    collect: async (tx, c) =>
      (await tx.inquiryDocument.findMany({ where: { tenantId: c.tenantId, inquiry: { is: { sponsorId: c.subjectId } } }, select: { id: true, r2Key: true } }))
        .map((r) => ({ id: r.id, key: r.r2Key })),
    remove: async (tx, tenantId, ids) => { await tx.inquiryDocument.deleteMany({ where: { tenantId, id: { in: ids } } }); },
  },
];

/**
 * The daily retention job. For each closure whose 30 days are up: delete its
 * files from the private bucket, then their rows, release its logins'
 * addresses (so a new sign-up can use them), mark it PURGED and audit what
 * went. Then the documents of handoffs declined or cancelled 30+ days ago.
 * Running it twice changes nothing: a purged closure is not picked up again,
 * and deleting a missing object succeeds.
 */
export async function purgeExpiredClosures(
  db: typeof prisma = prisma,
  now = new Date(),
  del: (key: string) => Promise<void> = deletePrivateObject,
  /** Tests narrow the sweep to their own tenant; the worker sweeps them all. */
  onlyTenantId?: string,
) {
  const due = await db.accountClosure.findMany({
    /* tenant-scope: the worker's sweep across every tenant; each closure is then handled inside its own tenant. */
    where: { state: "CLOSED", retainUntil: { lte: now }, ...(onlyTenantId ? { tenantId: onlyTenantId } : {}) }, select: CLOSURE_SELECT, take: 200,
  });
  let files = 0;
  for (const c of due) {
    const kind = c.subjectKind as ClosureSubject;
    const found: { source: RetainedDocumentSource; docs: { id: string; key: string }[] }[] = [];
    for (const source of RETAINED_DOCUMENT_SOURCES.filter((s) => s.subjects.includes(kind))) {
      found.push({ source, docs: await source.collect(db as unknown as Tx, { tenantId: c.tenantId, subjectKind: kind, subjectId: c.subjectId }) });
    }
    /* Objects first, outside the transaction: a failed delete leaves the row
       (and the closure CLOSED), so the next run tries again. */
    for (const f of found) for (const d of f.docs) await del(d.key);
    await db.$transaction(async (tx) => {
      for (const f of found) if (f.docs.length) await f.source.remove(tx, c.tenantId, f.docs.map((d) => d.id));
      for (const userId of c.userIds) {
        await tx.user.updateMany({
          /* tenant-scope: this closure's own logins by their unique id, still switched off — an organisation's logins live in its own tenant while BTG's Reject files the closure in BTG's. */
          where: { id: userId, disabledAt: { not: null } },
          data: { email: `closed+${userId}@account-closed.invalid`, clerkId: `closed:${userId}`, roles: [] },
        });
      }
      await tx.accountClosure.update({
        /* tenant-scope: the closure loaded by the sweep. */
        where: { id: c.id }, data: { state: "PURGED", purgedAt: now, contactEmail: "" },
      });
      await audit(tx, SYSTEM(c.tenantId), "account.filesPurged", "AccountClosure", c.id, {
        after: {
          subjectKind: c.subjectKind, subjectId: c.subjectId, cause: c.cause,
          deleted: Object.fromEntries(found.map((f) => [f.source.name, f.docs.length])), loginsReleased: c.userIds.length,
        },
      });
    });
    files += found.reduce((n, f) => n + f.docs.length, 0);
  }

  /* A declined or cancelled handoff's documents go 30 days after the answer. */
  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  const stale = await db.guardianHandoffDocument.findMany({
    /* tenant-scope: the worker's sweep across every tenant; each row is deleted by its own id. */
    where: { handoff: { is: { state: { in: ["DECLINED", "CANCELLED"] }, updatedAt: { lte: cutoff } } }, ...(onlyTenantId ? { tenantId: onlyTenantId } : {}) },
    select: { id: true, tenantId: true, r2Key: true, handoffId: true }, take: 500,
  });
  for (const d of stale) {
    await del(d.r2Key);
    await db.$transaction(async (tx) => {
      await tx.guardianHandoffDocument.deleteMany({ where: { tenantId: d.tenantId, id: d.id } });
      await audit(tx, SYSTEM(d.tenantId), "guardianHandoff.documentPurged", "GuardianHandoff", d.handoffId, { after: { documentId: d.id } });
    });
  }
  return { closures: due.length, files, handoffDocuments: stale.length };
}
