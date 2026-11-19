/**
 * POL-BE-102 — a sponsor's Account page: the company's details and the
 * signed-in person's own.
 *
 * WHO. The sponsor's own people read it: SPONSOR_ADMIN and SPONSOR_ANALYST
 * (policy `sponsor` read `own`). Only a SPONSOR_ADMIN changes anything
 * (`sponsor` write `own`). The sponsor is always the caller's own link —
 * there is no id to aim at another sponsor — and every other role is refused.
 *
 * SAVED AT ONCE, AUDITED: the logo (uploaded straight to the public bucket,
 * PNG or JPEG, as tenant branding's is), website, address and billing
 * contact; the person's name and job title.
 *
 * NAME AND CATEGORIES — Phase 2 automation (owner, 2026-11-18). The
 * categories feed every restriction and exclusivity check, and the name is
 * the Zoho account's (field-mapping §7.1). A change takes effect at once when
 * every safety check passes, and waits for BTG with the reasons when one
 * fails: the name already another sponsor's, a restricted word in it, a
 * sensitive category added (always a person), or an exclusive deal still
 * running in a category being dropped. One change waits at a time; the page
 * shows it as waiting for BTG. BTG approves a held one or rejects it with a
 * reason the sponsor reads. A new name is sent to Zoho once.
 *
 * Email, password and two-step sign-in stay in Clerk; the page links there.
 * Notification settings are the existing /me/notification-preferences.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { checkPublicUpload, presignPublicUpload, publicObjectUrl, uploadRefusal } from "../lib/storage";
import { BRAND_CATEGORIES, SENSITIVE_CATEGORIES } from "./brand-categories";
import { normalizeBusinessName } from "./business-name-rules";
import { checkRestricted } from "./restricted-words";
import { LOGO_TYPES, MAX_LOGO_BYTES } from "./branding";
import { listPreferences } from "./notification-preferences";

export class SponsorAccountError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "SponsorAccountError";
    this.status = status;
  }
}

type Own = { tenantId: string; sponsorId: string; userId: string };

/** The caller's own sponsor: read for its admins and analysts, write for its admins only. */
function ownSponsor(actor: Actor, action: "read" | "write"): Own {
  const scope = assertAllowed(actor, "sponsor", action);
  if (scope !== "own" || !actor.sponsorId || !actor.userId) throw new ForbiddenError("sponsor", action);
  return { tenantId: actor.tenantId, sponsorId: actor.sponsorId, userId: actor.userId };
}

export const logoPrefix = (o: { tenantId: string; sponsorId: string }) => `sponsors/${o.tenantId}/${o.sponsorId}/`;

const COMPANY = {
  id: true, name: true, categories: true, logoKey: true, website: true, address: true,
  billingContactName: true, billingContactEmail: true, billingContactPhone: true,
} as const;
const CHANGE = {
  id: true, name: true, categories: true, categoriesChanged: true, status: true, reason: true,
  holdReasons: true, autoApproved: true, createdAt: true, decidedAt: true,
} as const;
type ChangeRow = {
  id: string; name: string | null; categories: string[]; categoriesChanged: boolean; status: string;
  reason: string | null; holdReasons: string[]; autoApproved: boolean; createdAt: Date; decidedAt: Date | null;
};

function changeView(c: ChangeRow) {
  return {
    id: c.id,
    status: c.status as "PENDING" | "APPROVED" | "REJECTED",
    name: c.name,
    categories: c.categoriesChanged ? c.categories : null,
    /** Why it waits for BTG; empty when it went through on its own. */
    holdReasons: c.holdReasons,
    autoApproved: c.autoApproved,
    reason: c.reason,
    requestedAt: c.createdAt.toISOString(),
    decidedAt: c.decidedAt?.toISOString() ?? null,
  };
}

/** GET /sponsor/account — the whole page in one read. */
export async function sponsorAccount(actor: Actor) {
  const own = ownSponsor(actor, "read");
  const [company, me, changes] = await Promise.all([
    prisma.sponsor.findFirst({ where: { id: own.sponsorId, tenantId: own.tenantId }, select: COMPANY }),
    prisma.user.findFirst({ where: { id: own.userId, tenantId: own.tenantId }, select: { email: true, fullName: true, jobTitle: true } }),
    prisma.sponsorAccountChange.findMany({
      where: { sponsorId: own.sponsorId, tenantId: own.tenantId },
      orderBy: { createdAt: "desc" }, take: 2, select: CHANGE,
    }),
  ]);
  if (!company || !me) throw new ForbiddenError("sponsor", "read");
  const pending = changes.find((c) => c.status === "PENDING") ?? null;
  const decided = changes.find((c) => c.status !== "PENDING") ?? null;
  return {
    company: {
      id: company.id,
      name: company.name,
      categories: company.categories,
      logoUrl: company.logoKey ? publicObjectUrl(company.logoKey) : null,
      website: company.website,
      address: company.address,
      billingContact: { name: company.billingContactName, email: company.billingContactEmail, phone: company.billingContactPhone },
    },
    me: { name: me.fullName, jobTitle: me.jobTitle, email: me.email, signIn: "CLERK" as const },
    canEdit: actor.roles.includes("SPONSOR_ADMIN"),
    /** A name or category change waiting for BTG — the page says "waiting for BTG". */
    pendingChange: pending ? changeView(pending) : null,
    /** BTG's last answer, with its reason when rejected. */
    lastDecision: decided ? changeView(decided) : null,
    notificationPreferences: await listPreferences(actor),
  };
}

export type CompanyInput = Partial<{
  logoKey: string | null; website: string | null; address: string | null;
  billingContactName: string | null; billingContactEmail: string | null; billingContactPhone: string | null;
}>;

/** PATCH /sponsor/account/company — the details that save at once. */
export async function updateCompany(actor: Actor, input: CompanyInput) {
  const own = ownSponsor(actor, "write");
  if (input.logoKey != null && (!input.logoKey.startsWith(logoPrefix(own)) || input.logoKey.includes(".."))) {
    throw new SponsorAccountError("logoKey: not your upload — request one with POST /sponsor/account/logo.");
  }
  const data = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as CompanyInput;
  if (Object.keys(data).length === 0) throw new SponsorAccountError("Nothing to change.");
  /* POL-BE-110 — a new logo is saved only once its file has arrived as a PNG
     or JPEG of at most 1 MB; otherwise nothing is saved and the old logo stays. */
  if (input.logoKey != null) {
    const current = await prisma.sponsor.findFirst({ where: { id: own.sponsorId, tenantId: own.tenantId }, select: { logoKey: true } });
    if (current?.logoKey !== input.logoKey) {
      const arrived = await checkPublicUpload(input.logoKey, { types: Object.keys(LOGO_TYPES), maxBytes: MAX_LOGO_BYTES });
      if (!arrived.ok) throw new SponsorAccountError(uploadRefusal(arrived.problem, "That logo"), arrived.problem === "missing" ? 409 : 422);
    }
  }
  await prisma.$transaction(async (tx) => {
    const before = await tx.sponsor.findFirst({ where: { id: own.sponsorId, tenantId: own.tenantId }, select: COMPANY });
    if (!before) throw new ForbiddenError("sponsor", "write");
    const was = Object.fromEntries(Object.keys(data).map((k) => [k, before[k as keyof typeof before]]));
    /* tenant-scope: the caller's own sponsor, loaded above by id and tenant. */
    await tx.sponsor.update({ where: { id: before.id }, data, select: { id: true } });
    await audit(tx, actor, "sponsorAccount.company", "Sponsor", before.id, { before: was, after: data });
  });
  return sponsorAccount(actor);
}

/** POST /sponsor/account/logo — a public-bucket upload grant under this sponsor's prefix. */
export async function requestSponsorLogoUpload(actor: Actor, input: { contentType: string; bytes: number }) {
  const own = ownSponsor(actor, "write");
  if (!(input.contentType in LOGO_TYPES)) throw new SponsorAccountError("A logo is PNG or JPEG.");
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_LOGO_BYTES) throw new SponsorAccountError("A logo is at most 1 MB.");
  const ext = LOGO_TYPES[input.contentType as keyof typeof LOGO_TYPES];
  const logoKey = `${logoPrefix(own)}logo-${randomBytes(8).toString("hex")}.${ext}`;
  const uploadUrl = await presignPublicUpload(logoKey, input.contentType, { signContentType: true, contentLength: input.bytes });
  return { logoKey, uploadUrl, logoUrl: publicObjectUrl(logoKey) };
}

/** PATCH /sponsor/account/me — the person's own name and job title. */
export async function updateMyDetails(actor: Actor, input: Partial<{ name: string | null; jobTitle: string | null }>) {
  const own = ownSponsor(actor, "write");
  const data = {
    ...(input.name !== undefined ? { fullName: input.name } : {}),
    ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
  };
  if (Object.keys(data).length === 0) throw new SponsorAccountError("Nothing to change.");
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findFirst({ where: { id: own.userId, tenantId: own.tenantId }, select: { id: true, fullName: true, jobTitle: true } });
    if (!before) throw new ForbiddenError("sponsor", "write");
    /* tenant-scope: the caller's own login, loaded above by id and tenant. */
    await tx.user.update({ where: { id: before.id }, data, select: { id: true } });
    await audit(tx, actor, "sponsorAccount.me", "User", before.id, {
      before: Object.fromEntries(Object.keys(data).map((k) => [k, before[k as "fullName" | "jobTitle"]])), after: data,
    });
  });
  return sponsorAccount(actor);
}

function sameSet(a: readonly string[], b: readonly string[]) {
  const x = new Set(a);
  return x.size === new Set(b).size && b.every((v) => x.has(v));
}

function knownCategories(categories: readonly string[]) {
  const unknown = categories.filter((c) => !(BRAND_CATEGORIES as readonly string[]).includes(c));
  if (unknown.length) throw new SponsorAccountError(`Unknown categories: ${unknown.join(", ")}.`);
  return [...new Set(categories)];
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } } | null;
  return err?.code === "P2002" || err?.meta?.driverAdapterError?.cause?.originalCode === "23505";
}

const ALREADY_WAITING = "A change is already waiting for BTG. You can ask for another once BTG has answered.";

/**
 * Every safety check on a name or category change; an empty list means it
 * goes through at once (Phase 2 automation, owner 2026-11-18). Sensitive
 * categories always reach a person.
 */
async function holdReasonsFor(
  tx: Prisma.TransactionClient,
  own: Own,
  company: { id: string; name: string; categories: string[] },
  newName: string | null,
  newCategories: string[] | null,
  now: Date,
): Promise<string[]> {
  const reasons: string[] = [];
  if (newName) {
    const key = normalizeBusinessName(newName);
    const others = await tx.sponsor.findMany({ where: { tenantId: own.tenantId, id: { not: company.id } }, select: { name: true } });
    const holder = others.find((o) => normalizeBusinessName(o.name) === key);
    if (holder) reasons.push(`Another sponsor already has the name "${holder.name}".`);
    const restricted = await checkRestricted(tx, own.tenantId, newName);
    if (restricted.length) reasons.push(`The name contains a restricted word: ${[...new Set(restricted.map((m) => m.word))].join(", ")}.`);
  }
  if (newCategories) {
    const added = newCategories.filter((c) => !company.categories.includes(c));
    const sensitive = added.filter((c) => (SENSITIVE_CATEGORIES as readonly string[]).includes(c));
    if (sensitive.length) reasons.push(`Adds a sensitive category, which a person at BTG always checks: ${sensitive.join(", ")}.`);
    const dropped = company.categories.filter((c) => !newCategories.includes(c));
    if (dropped.length) {
      const offers = await tx.offer.findMany({ where: { tenantId: own.tenantId, campaign: { is: { sponsorId: company.id } } }, select: { id: true } });
      const exclusive = offers.length === 0 ? [] : await tx.brandRestriction.findMany({
        where: { tenantId: own.tenantId, type: "EXCLUSIVITY", category: { in: dropped }, sourceOfferId: { in: offers.map((o) => o.id) }, OR: [{ endsOn: null }, { endsOn: { gt: now } }] },
        select: { category: true },
      });
      if (exclusive.length) reasons.push(`An exclusive deal is still running in a category being dropped: ${[...new Set(exclusive.map((e) => e.category))].join(", ")}.`);
    }
  }
  return reasons;
}

/** Make the change real; a new name goes to Zoho once, through the worker. */
async function applyChange(tx: Prisma.TransactionClient, tenantId: string, sponsorId: string, change: { name: string | null; categories: string[] | null }) {
  const data = {
    ...(change.name ? { name: change.name } : {}),
    ...(change.categories ? { categories: knownCategories(change.categories) } : {}),
  };
  /* tenant-scope: a sponsor loaded by id and tenant by the caller. */
  await tx.sponsor.update({ where: { id: sponsorId }, data, select: { id: true } });
  if (change.name) await enqueue(tx, tenantId, "zoho.pushSponsor", { sponsorId, rename: true });
  return data;
}

/**
 * POST /sponsor/account/change — a new company name and/or categories. Takes
 * effect at once when every safety check passes; waits for BTG, with the
 * reasons, when one fails.
 */
export async function requestAccountChange(actor: Actor, input: { name?: string; categories?: string[] }, now = new Date()) {
  const own = ownSponsor(actor, "write");
  const company = await prisma.sponsor.findFirst({ where: { id: own.sponsorId, tenantId: own.tenantId }, select: { id: true, name: true, categories: true } });
  if (!company) throw new ForbiddenError("sponsor", "write");
  const name = input.name?.trim();
  const newName = name && name !== company.name ? name : null;
  const categories = input.categories ? knownCategories(input.categories) : null;
  const newCategories = categories && !sameSet(categories, company.categories) ? categories : null;
  if (categories && categories.length === 0) throw new SponsorAccountError("Keep at least one category.");
  if (!newName && !newCategories) throw new SponsorAccountError("That's what's on file already — nothing to change.");
  try {
    await prisma.$transaction(async (tx) => {
      /* Even a change that would pass every check waits its turn behind a held one. */
      const waiting = await tx.sponsorAccountChange.findFirst({ where: { sponsorId: company.id, tenantId: own.tenantId, status: "PENDING" }, select: { id: true } });
      if (waiting) throw new SponsorAccountError(ALREADY_WAITING, 409);
      const reasons = await holdReasonsFor(tx, own, company, newName, newCategories, now);
      const auto = reasons.length === 0;
      const c = await tx.sponsorAccountChange.create({
        data: {
          tenantId: own.tenantId, sponsorId: company.id, requestedById: own.userId,
          name: newName, categories: newCategories ?? [], categoriesChanged: newCategories !== null,
          status: auto ? "APPROVED" : "PENDING", holdReasons: reasons, autoApproved: auto, decidedAt: auto ? now : null,
        },
        select: { id: true },
      });
      const after = { ...(newName ? { name: newName } : {}), ...(newCategories ? { categories: newCategories } : {}) };
      if (auto) await applyChange(tx, own.tenantId, company.id, { name: newName, categories: newCategories });
      await audit(tx, actor, auto ? "sponsorAccount.changeApplied" : "sponsorAccount.changeHeld", "SponsorAccountChange", c.id, {
        before: { name: company.name, categories: company.categories },
        after: auto ? after : { ...after, holdReasons: reasons },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new SponsorAccountError(ALREADY_WAITING, 409);
    throw e;
  }
  return sponsorAccount(actor);
}

/* ═════════════════════════════ BTG ═════════════════════════════════════ */

const DESK = {
  ...CHANGE,
  sponsor: { select: { id: true, name: true, categories: true } },
  requestedById: true,
} as const;

/** GET /sponsor-account-changes — BTG's desk: what waits (or every change, newest first). */
export async function listAccountChanges(actor: Actor, status: "PENDING" | "ALL" = "PENDING") {
  assertTenantWide(actor, "sponsor", "read");
  const rows = await prisma.sponsorAccountChange.findMany({
    where: { tenantId: actor.tenantId, ...(status === "PENDING" ? { status: "PENDING" } : {}) },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" }, take: 200, select: DESK,
  });
  const people = await prisma.user.findMany({
    where: { tenantId: actor.tenantId, id: { in: [...new Set(rows.map((r) => r.requestedById))] } },
    select: { id: true, email: true, fullName: true },
  });
  const who = new Map(people.map((p) => [p.id, p]));
  return {
    changes: rows.map((r) => ({
      ...changeView(r),
      sponsor: { id: r.sponsor.id, name: r.sponsor.name, categories: r.sponsor.categories },
      requestedBy: { name: who.get(r.requestedById)?.fullName ?? null, email: who.get(r.requestedById)?.email ?? null },
    })),
  };
}

/** A person at BTG decides — never the API service account, which can also write sponsors. */
function assertBtgDecides(actor: Actor) {
  assertTenantWide(actor, "sponsor", "write");
  if (!actor.roles.some((r) => r === "SUPER_ADMIN" || r === "BTG_ADMIN" || r === "SALES")) throw new ForbiddenError("sponsor", "write");
}

/** Claim a waiting change for a decision; a second decision finds it gone. */
async function claim(tx: Prisma.TransactionClient, actor: Actor, id: string, status: "APPROVED" | "REJECTED", reason: string | null, at: Date) {
  const won = await tx.sponsorAccountChange.updateMany({
    where: { id, tenantId: actor.tenantId, status: "PENDING" },
    data: { status, reason, decidedById: actor.userId, decidedAt: at },
  });
  const row = await tx.sponsorAccountChange.findFirst({ where: { id, tenantId: actor.tenantId }, select: DESK });
  if (!row) throw new SponsorAccountError("No such change.", 404);
  if (won.count === 0) throw new SponsorAccountError("BTG has already answered this change.", 409);
  return row;
}

/** POST /sponsor-account-changes/{id}/approve — it takes effect; a new name goes to Zoho. */
export async function approveAccountChange(actor: Actor, id: string, now = new Date()) {
  assertBtgDecides(actor);
  return prisma.$transaction(async (tx) => {
    const c = await claim(tx, actor, id, "APPROVED", null, now);
    const data = await applyChange(tx, actor.tenantId, c.sponsor.id, { name: c.name, categories: c.categoriesChanged ? c.categories : null });
    await audit(tx, actor, "sponsorAccount.changeApproved", "Sponsor", c.sponsor.id, {
      before: { name: c.sponsor.name, categories: c.sponsor.categories, changeId: c.id }, after: data,
    });
    return { ...changeView({ ...c, status: "APPROVED", decidedAt: now }) };
  });
}

/** POST /sponsor-account-changes/{id}/reject — nothing changes; the sponsor reads the reason. */
export async function rejectAccountChange(actor: Actor, id: string, reason: string, now = new Date()) {
  assertBtgDecides(actor);
  const why = reason.trim();
  if (!why) throw new SponsorAccountError("Say why, so the sponsor knows what to do next.");
  return prisma.$transaction(async (tx) => {
    const c = await claim(tx, actor, id, "REJECTED", why, now);
    await audit(tx, actor, "sponsorAccount.changeRejected", "SponsorAccountChange", c.id, { after: { reason: why } });
    return changeView({ ...c, status: "REJECTED", reason: why, decidedAt: now });
  });
}
