/**
 * POL-BE-104 — a team's own details page in the property portal.
 *
 * WHO. A PROPERTY_MGR, for the one property their login is linked to
 * (policy `property` read/write `own`). Every other role is refused; BTG
 * works through its desk of held changes.
 *
 * SAVED AT ONCE, AUDITED: the public description; the main contact's name and
 * phone (not their email, which was confirmed at sign-up); the manager's own
 * name, job title and phone.
 *
 * NAME, PLACE AND TYPE DETAILS — Phase 2 automation (owner, 2026-11-18: "as
 * always we target automation"). A change to the name, city, state or the
 * type's details (a team's league and sport, a school's district and
 * sports…) takes effect at once when every safety check passes, and waits
 * for BTG, with the reasons, when one fails:
 *
 *   - the new name is held by another organisation (the sign-up name rule);
 *   - the new name or details contain a restricted word;
 *   - the property has an open marketplace order or an offer out on its
 *     inventory — a sponsor bought from it as it was described;
 *   - the legal entity name or the state registration number changes — both
 *     were checked against documents, and the payout account is in that name;
 *   - a move into a state whose business registration isn't on file;
 *   - the organisation is not in good standing (not approved, flagged, or its
 *     payouts held).
 *
 * The type (team, school, event…) stays BTG's. One change at a time; BTG
 * approves a held one (it takes effect) or rejects it with a reason the
 * manager reads. A new name goes to the property's Zoho account once.
 */
import type { Prisma } from "../generated/prisma/client";
import { catalogueCity } from "./places";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { normalizeBusinessName } from "./business-name-rules";
import { nameHolder } from "./onboarding";
import { DETAILS_SCHEMA, US_STATES, isCurrent, meets, requiredDocuments, type OrgType } from "./onboarding-rules";
import { checkRestricted } from "./restricted-words";
import { listPreferences } from "./notification-preferences";

type Tx = Prisma.TransactionClient;

export class PropertyProfileError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "PropertyProfileError";
    this.status = status;
  }
}

type Own = { tenantId: string; propertyId: string; userId: string };

function ownProperty(actor: Actor, action: "read" | "write"): Own {
  const scope = assertAllowed(actor, "property", action);
  if (scope !== "own" || !actor.propertyId || !actor.userId) throw new ForbiddenError("property", action);
  return { tenantId: actor.tenantId, propertyId: actor.propertyId, userId: actor.userId };
}

/** Orders still in motion: placed, agreed, paid or being delivered. */
const OPEN_ORDER = ["IN_CHAT", "PENDING_SELLER", "PENDING_APPROVAL", "APPROVED", "AWAITING_PAYMENT", "PAID", "IN_DELIVERY"] as const;

type Contact = { name?: string; email?: string; phone?: string; role?: string; primary?: boolean };
type Details = Record<string, unknown>;

const PROPERTY = {
  id: true, tenantId: true, name: true, kind: true, city: true, stateCode: true, description: true, payoutsHeldAt: true, zohoId: true,
  onboarding: { select: { id: true, state: true, flags: true, details: true, contacts: true, stateCode: true } },
} as const;
const CHANGE = {
  id: true, changes: true, before: true, status: true, holdReasons: true, autoApproved: true, reason: true,
  createdAt: true, decidedAt: true,
} as const;
type ChangeRow = {
  id: string; changes: unknown; before: unknown; status: string; holdReasons: string[]; autoApproved: boolean;
  reason: string | null; createdAt: Date; decidedAt: Date | null;
};

function changeView(c: ChangeRow) {
  return {
    id: c.id,
    status: c.status as "PENDING" | "APPROVED" | "REJECTED",
    changes: c.changes as IdentityChange,
    before: c.before as IdentityChange,
    holdReasons: c.holdReasons,
    autoApproved: c.autoApproved,
    reason: c.reason,
    requestedAt: c.createdAt.toISOString(),
    decidedAt: c.decidedAt?.toISOString() ?? null,
  };
}

const primaryOf = (contacts: unknown): Contact | null => {
  const list = Array.isArray(contacts) ? (contacts as Contact[]) : [];
  return list.find((c) => c.primary) ?? list[0] ?? null;
};

/** GET /property/profile — the whole page in one read. */
export async function propertyProfile(actor: Actor) {
  const own = ownProperty(actor, "read");
  const [p, me, changes] = await Promise.all([
    prisma.property.findFirst({ where: { id: own.propertyId, tenantId: own.tenantId }, select: PROPERTY }),
    prisma.user.findFirst({ where: { id: own.userId, tenantId: own.tenantId }, select: { email: true, fullName: true, jobTitle: true, phone: true } }),
    prisma.propertyProfileChange.findMany({ where: { propertyId: own.propertyId, tenantId: own.tenantId }, orderBy: { createdAt: "desc" }, take: 5, select: CHANGE }),
  ]);
  if (!p || !me) throw new ForbiddenError("property", "read");
  const contact = primaryOf(p.onboarding?.contacts);
  const pending = changes.find((c) => c.status === "PENDING") ?? null;
  const decided = changes.find((c) => c.status !== "PENDING") ?? null;
  return {
    property: {
      id: p.id,
      name: p.name,
      kind: p.kind,
      /** The type is BTG's to change. */
      kindManagedBy: "BTG" as const,
      city: p.city,
      stateCode: p.stateCode,
      /** The type's details (a team's league and sport…); null for a property BTG set up without a sign-up. */
      details: (p.onboarding?.details as Details | undefined) ?? null,
      description: p.description,
      contact: contact ? { name: contact.name ?? null, email: contact.email ?? null, phone: contact.phone ?? null } : null,
    },
    me: { name: me.fullName, jobTitle: me.jobTitle, phone: me.phone, email: me.email, signIn: "CLERK" as const },
    /** A change waiting for BTG, with why. */
    pendingChange: pending ? changeView(pending) : null,
    /** The latest change that took effect or was rejected. */
    lastDecision: decided ? changeView(decided) : null,
    notificationPreferences: await listPreferences(actor),
  };
}

/** PATCH /property/profile — the description and the main contact's name and phone, at once. */
export async function updatePropertyContact(actor: Actor, input: Partial<{ description: string | null; contactName: string; contactPhone: string | null }>) {
  const own = ownProperty(actor, "write");
  if (input.description === undefined && input.contactName === undefined && input.contactPhone === undefined) {
    throw new PropertyProfileError("Nothing to change.");
  }
  await prisma.$transaction(async (tx) => {
    const p = await tx.property.findFirst({ where: { id: own.propertyId, tenantId: own.tenantId }, select: PROPERTY });
    if (!p) throw new ForbiddenError("property", "write");
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (input.description !== undefined && input.description !== p.description) {
      before.description = p.description; after.description = input.description;
      /* tenant-scope: the caller's own property, loaded above by id and tenant. */
      await tx.property.update({ where: { id: p.id }, data: { description: input.description }, select: { id: true } });
    }
    if (input.contactName !== undefined || input.contactPhone !== undefined) {
      if (!p.onboarding) throw new PropertyProfileError("BTG keeps this organisation's contact. Ask BTG to change it.");
      const contacts = (Array.isArray(p.onboarding.contacts) ? p.onboarding.contacts : []) as Contact[];
      const i = Math.max(0, contacts.findIndex((c) => c.primary));
      const c = contacts[i];
      if (!c) throw new PropertyProfileError("There is no main contact on file. Ask BTG to add one.");
      const next = { ...c, ...(input.contactName !== undefined ? { name: input.contactName } : {}) };
      if (input.contactPhone !== undefined) {
        if (input.contactPhone === null) delete next.phone; else next.phone = input.contactPhone;
      }
      if (next.name !== c.name || next.phone !== c.phone) {
        before.contact = { name: c.name ?? null, phone: c.phone ?? null };
        after.contact = { name: next.name ?? null, phone: next.phone ?? null };
        const updated = contacts.map((x, j) => (j === i ? next : x));
        await tx.propertyOnboarding.update({
          /* tenant-scope: the caller's own property's sign-up, loaded above through it. */
          where: { id: p.onboarding.id }, data: { contacts: updated as Prisma.InputJsonValue }, select: { id: true },
        });
      }
    }
    if (Object.keys(after).length) await audit(tx, actor, "property.profileUpdate", "Property", p.id, { before, after });
  });
  return propertyProfile(actor);
}

/** PATCH /property/profile/me — the manager's own name, job title and phone, at once. */
export async function updatePropertyManager(actor: Actor, input: Partial<{ name: string | null; jobTitle: string | null; phone: string | null }>) {
  const own = ownProperty(actor, "write");
  const data = {
    ...(input.name !== undefined ? { fullName: input.name } : {}),
    ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
  };
  if (Object.keys(data).length === 0) throw new PropertyProfileError("Nothing to change.");
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findFirst({ where: { id: own.userId, tenantId: own.tenantId }, select: { id: true, fullName: true, jobTitle: true, phone: true } });
    if (!before) throw new ForbiddenError("property", "write");
    const was = Object.fromEntries(Object.keys(data).map((k) => [k, before[k as keyof typeof data]]));
    if (Object.entries(data).every(([k, v]) => was[k] === v)) return;
    /* tenant-scope: the caller's own login, loaded above by id and tenant. */
    await tx.user.update({ where: { id: before.id }, data, select: { id: true } });
    await audit(tx, actor, "property.managerUpdate", "User", before.id, { before: was, after: data });
  });
  return propertyProfile(actor);
}

/* ═══════════════════════ name, place and type details ═══════════════════ */

export type IdentityChange = Partial<{ name: string; city: string | null; stateCode: string; details: Details }>;

type PropertyRow = NonNullable<Awaited<ReturnType<typeof loadProperty>>>;
const loadProperty = (tx: Tx, own: { tenantId: string; propertyId: string }) =>
  tx.property.findFirst({ where: { id: own.propertyId, tenantId: own.tenantId }, select: PROPERTY });

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const LEGAL_KEYS = ["legalEntityName", "stateRegistrationId"] as const;

/** Only what differs from the record, validated. Throws on a bad value. */
function diff(p: PropertyRow, input: IdentityChange): { changes: IdentityChange; before: IdentityChange } {
  const changes: IdentityChange = {};
  const before: IdentityChange = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!normalizeBusinessName(name)) throw new PropertyProfileError("Give the organisation's name — letters or numbers.");
    if (name !== p.name) { changes.name = name; before.name = p.name; }
  }
  if (input.city !== undefined && (input.city ?? null) !== p.city) { changes.city = input.city; before.city = p.city; }
  if (input.stateCode !== undefined) {
    const st = input.stateCode.toUpperCase();
    if (!US_STATES.has(st)) throw new PropertyProfileError("stateCode: a US state code.");
    if (st !== p.stateCode) { changes.stateCode = st; before.stateCode = p.stateCode ?? undefined; }
  }
  /* POL-BE-117 — the city is picked from the state's places (domain/places.ts),
     checked when it changes or the state moves under it; a city typed before
     the list existed doesn't block an unrelated edit. */
  const cityMoves = changes.stateCode !== undefined || changes.city !== undefined;
  const cityNow = changes.city !== undefined ? changes.city : p.city;
  if (cityMoves && cityNow && cityNow.trim()) {
    const st = changes.stateCode ?? p.stateCode;
    const city = st ? catalogueCity("US", st, cityNow) : null;
    if (!city) throw new PropertyProfileError(st ? `Choose the city from the list for ${st}.` : "Choose the state before the city.");
    if (city !== p.city) { changes.city = city; before.city = p.city; } else { delete changes.city; delete before.city; }
  }
  if (input.details !== undefined) {
    if (!p.onboarding) throw new PropertyProfileError("BTG keeps this organisation's details. Ask BTG to change them.");
    const schema = DETAILS_SCHEMA[p.kind as OrgType];
    if (!schema) throw new PropertyProfileError("This kind of organisation has no details to change here.");
    const parsed = schema.safeParse(input.details);
    if (!parsed.success) throw new PropertyProfileError(`details: ${parsed.error.issues.map((i) => `${i.path.join(".") || "details"} ${i.message}`).join("; ")}`);
    if (!same(parsed.data, p.onboarding.details)) { changes.details = parsed.data as Details; before.details = p.onboarding.details as Details; }
  }
  return { changes, before };
}

/** Every safety check; an empty list means it goes through on its own. */
async function holdReasonsFor(tx: Tx, p: PropertyRow, changes: IdentityChange): Promise<string[]> {
  const reasons: string[] = [];
  const o = p.onboarding;
  if (o && (o.state !== "APPROVED" || o.flags.length > 0)) reasons.push("The organisation isn't in good standing (not approved, or flagged after a document change).");
  if (p.payoutsHeldAt) reasons.push("The organisation's payouts are held.");

  if (changes.name) {
    const holder = await nameHolder(tx, normalizeBusinessName(changes.name), { onboardingId: o?.id, propertyId: p.id });
    if (holder) reasons.push(`Another organisation already holds the name "${holder}".`);
  }
  const words = [changes.name, ...Object.values(changes.details ?? {}).flat().filter((v): v is string => typeof v === "string")].join(" \n ");
  const restricted = await checkRestricted(tx, p.tenantId, words);
  if (restricted.length) reasons.push(`Contains a restricted word: ${[...new Set(restricted.map((m) => m.word))].join(", ")}.`);

  const before = (o?.details ?? {}) as Details;
  const legal = LEGAL_KEYS.filter((k) => changes.details && (changes.details[k] ?? null) !== (before[k] ?? null));
  if (legal.length) reasons.push("The legal entity name or state registration number changes — both were checked against documents, and payouts go to that legal name.");

  if (o && (changes.stateCode || changes.details)) {
    const need = requiredDocuments({ orgType: p.kind, stateCode: changes.stateCode ?? p.stateCode, details: changes.details ?? o.details } as never);
    const docs = await tx.onboardingDocument.findMany({
      /* tenant-scope: the property's own sign-up, loaded through the caller's own property. */
      where: { onboardingId: o.id },
      select: { kind: true, stateCode: true, uploadedAt: true, replacedAt: true, removedAt: true, returnedAt: true },
    });
    const missing = need.filter((r) => !docs.some((d) => isCurrent(d) && meets(r, d)));
    if (missing.length) reasons.push(`Missing for the new state: ${missing.map((m) => m.label).join(", ")}.`);
  }

  const [orders, offers] = await Promise.all([
    tx.marketplaceOrderLine.count({
      /* tenant-scope: cross-tenant by design — an order lives in the buyer's tenant and names this property as the seller; only a count leaves. */
      where: { propertyId: p.id, order: { state: { in: [...OPEN_ORDER] } } },
    }),
    tx.inventoryItem.findMany({ where: { propertyId: p.id, tenantId: p.tenantId }, select: { id: true } }).then((items) =>
      items.length === 0 ? 0 : tx.offer.count({
        /* tenant-scope: cross-tenant by design — an offer on this property's inventory may be made from another tenant; only a count leaves. */
        where: { state: "SENT", inventoryItemId: { in: items.map((i) => i.id) } },
      })),
  ]);
  if (orders || offers) reasons.push("There's an open order or an offer out on your inventory: a sponsor bought from you as you were described.");
  return reasons;
}

/** Make the change real: the property, its sign-up, and Zoho for a new name. */
async function apply(tx: Tx, actor: { tenantId: string }, p: PropertyRow, changes: IdentityChange) {
  /* tenant-scope: the property loaded through the caller's own link or BTG's tenant-wide desk. */
  await tx.property.update({
    where: { id: p.id },
    data: {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.city !== undefined ? { city: changes.city } : {}),
      ...(changes.stateCode !== undefined ? { stateCode: changes.stateCode } : {}),
    },
    select: { id: true },
  });
  if (p.onboarding && (changes.name !== undefined || changes.stateCode !== undefined || changes.details !== undefined)) {
    await tx.propertyOnboarding.update({
      /* tenant-scope: that property's own sign-up. */
      where: { id: p.onboarding.id },
      data: {
        ...(changes.name !== undefined ? { orgName: changes.name, nameKey: normalizeBusinessName(changes.name) } : {}),
        ...(changes.stateCode !== undefined ? { stateCode: changes.stateCode } : {}),
        ...(changes.details !== undefined ? { details: changes.details as Prisma.InputJsonValue } : {}),
      },
      select: { id: true },
    });
  }
  if (changes.name !== undefined && p.zohoId) await enqueue(tx, actor.tenantId, "zoho.renameProperty", { propertyId: p.id });
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } } | null;
  return err?.code === "P2002" || err?.meta?.driverAdapterError?.cause?.originalCode === "23505";
}

/** POST /property/profile/change — goes through at once when every check passes; held for BTG otherwise. */
export async function requestPropertyChange(actor: Actor, input: IdentityChange) {
  const own = ownProperty(actor, "write");
  try {
    await prisma.$transaction(async (tx) => {
      const p = await loadProperty(tx, own);
      if (!p) throw new ForbiddenError("property", "write");
      const { changes, before } = diff(p, input);
      if (Object.keys(changes).length === 0) throw new PropertyProfileError("That's what's on file already — nothing to change.");
      const waiting = await tx.propertyProfileChange.findFirst({ where: { propertyId: p.id, tenantId: own.tenantId, status: "PENDING" }, select: { id: true } });
      if (waiting) throw new PropertyProfileError("A change is already waiting for BTG. You can make another once BTG has answered.", 409);
      const reasons = await holdReasonsFor(tx, p, changes);
      const auto = reasons.length === 0;
      const c = await tx.propertyProfileChange.create({
        data: {
          tenantId: own.tenantId, propertyId: p.id, requestedById: own.userId,
          changes: changes as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue,
          status: auto ? "APPROVED" : "PENDING", holdReasons: reasons, autoApproved: auto, decidedAt: auto ? new Date() : null,
        },
        select: { id: true },
      });
      if (auto) await apply(tx, own, p, changes);
      await audit(tx, actor, auto ? "property.identityChanged" : "property.identityHeld", "PropertyProfileChange", c.id, {
        before, after: { ...changes, ...(auto ? {} : { holdReasons: reasons }) },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new PropertyProfileError("A change is already waiting for BTG, or the name was just taken. Reload and try again.", 409);
    throw e;
  }
  return propertyProfile(actor);
}

/* ═════════════════════════════ BTG ═════════════════════════════════════ */

/** GET /property-profile-changes — BTG's desk: held changes, oldest first (or every change, newest first). */
export async function listPropertyChanges(actor: Actor, status: "PENDING" | "ALL" = "PENDING") {
  assertTenantWide(actor, "property", "read");
  const rows = await prisma.propertyProfileChange.findMany({
    where: { tenantId: actor.tenantId, ...(status === "PENDING" ? { status: "PENDING" } : {}) },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, take: 200,
    select: { ...CHANGE, property: { select: { id: true, name: true, kind: true } } },
  });
  return { changes: rows.map((r) => ({ ...changeView(r), property: r.property })) };
}

async function claim(tx: Tx, actor: Actor, id: string, status: "APPROVED" | "REJECTED", reason: string | null) {
  const won = await tx.propertyProfileChange.updateMany({
    where: { id, tenantId: actor.tenantId, status: "PENDING" },
    data: { status, reason, decidedById: actor.userId, decidedAt: new Date() },
  });
  const row = await tx.propertyProfileChange.findFirst({ where: { id, tenantId: actor.tenantId }, select: { ...CHANGE, propertyId: true } });
  if (!row) throw new PropertyProfileError("No such change.", 404);
  if (won.count === 0) throw new PropertyProfileError("BTG has already answered this change.", 409);
  return row;
}

/** POST /property-profile-changes/{id}/approve — the held change takes effect. */
export async function approvePropertyChange(actor: Actor, id: string) {
  assertTenantWide(actor, "property", "write");
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await claim(tx, actor, id, "APPROVED", null);
      const p = await loadProperty(tx, { tenantId: actor.tenantId, propertyId: c.propertyId });
      if (!p) throw new PropertyProfileError("No such organisation.", 404);
      await apply(tx, actor, p, c.changes as IdentityChange);
      await audit(tx, actor, "property.identityApproved", "PropertyProfileChange", c.id, { before: c.before as Record<string, unknown>, after: c.changes as Record<string, unknown> });
      return changeView({ ...c, status: "APPROVED" });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new PropertyProfileError("Another organisation holds that name now. Reject the change with a reason.", 409);
    throw e;
  }
}

/** POST /property-profile-changes/{id}/reject — nothing changes; the manager reads why. */
export async function rejectPropertyChange(actor: Actor, id: string, reason: string) {
  assertTenantWide(actor, "property", "write");
  const why = reason.trim();
  if (!why) throw new PropertyProfileError("Say why, so the team knows what to do next.");
  return prisma.$transaction(async (tx) => {
    const c = await claim(tx, actor, id, "REJECTED", why);
    await audit(tx, actor, "property.identityRejected", "PropertyProfileChange", c.id, { after: { reason: why } });
    return changeView({ ...c, status: "REJECTED", reason: why });
  });
}
