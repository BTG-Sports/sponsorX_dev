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
 * WAITS FOR BTG: the company name and the brand categories. The categories
 * feed every restriction and exclusivity check, and the name is the Zoho
 * account's (field-mapping §7.1). One change waits at a time; the page shows
 * it as waiting for BTG. BTG approves it — it takes effect, and a new name is
 * sent to Zoho once — or rejects it with a reason the sponsor reads.
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
import { presignPublicUpload, publicObjectUrl } from "../lib/storage";
import { BRAND_CATEGORIES } from "./brand-categories";
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
  createdAt: true, decidedAt: true,
} as const;
type ChangeRow = {
  id: string; name: string | null; categories: string[]; categoriesChanged: boolean; status: string;
  reason: string | null; createdAt: Date; decidedAt: Date | null;
};

function changeView(c: ChangeRow) {
  return {
    id: c.id,
    status: c.status as "PENDING" | "APPROVED" | "REJECTED",
    name: c.name,
    categories: c.categoriesChanged ? c.categories : null,
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

/** POST /sponsor/account/change — a new company name and/or categories, for BTG to decide. */
export async function requestAccountChange(actor: Actor, input: { name?: string; categories?: string[] }) {
  const own = ownSponsor(actor, "write");
  const company = await prisma.sponsor.findFirst({ where: { id: own.sponsorId, tenantId: own.tenantId }, select: { id: true, name: true, categories: true } });
  if (!company) throw new ForbiddenError("sponsor", "write");
  const name = input.name?.trim();
  const newName = name && name !== company.name ? name : null;
  const categories = input.categories ? knownCategories(input.categories) : null;
  const newCategories = categories && !sameSet(categories, company.categories) ? categories : null;
  if (categories && categories.length === 0) throw new SponsorAccountError("Keep at least one category.");
  if (!newName && !newCategories) throw new SponsorAccountError("That's what's on file already — nothing to send to BTG.");
  try {
    await prisma.$transaction(async (tx) => {
      const c = await tx.sponsorAccountChange.create({
        data: {
          tenantId: own.tenantId, sponsorId: company.id, requestedById: own.userId,
          name: newName, categories: newCategories ?? [], categoriesChanged: newCategories !== null,
        },
        select: { id: true },
      });
      await audit(tx, actor, "sponsorAccount.changeRequested", "SponsorAccountChange", c.id, {
        before: { name: company.name, categories: company.categories },
        after: { ...(newName ? { name: newName } : {}), ...(newCategories ? { categories: newCategories } : {}) },
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
    const data = {
      ...(c.name ? { name: c.name } : {}),
      ...(c.categoriesChanged ? { categories: knownCategories(c.categories) } : {}),
    };
    /* tenant-scope: the sponsor of a change loaded above by id and tenant. */
    await tx.sponsor.update({ where: { id: c.sponsor.id }, data, select: { id: true } });
    await audit(tx, actor, "sponsorAccount.changeApproved", "Sponsor", c.sponsor.id, {
      before: { name: c.sponsor.name, categories: c.sponsor.categories, changeId: c.id }, after: data,
    });
    /* Zoho holds the account name (field-mapping §7.1): this one rename, which
       BTG just approved, is sent to it once, through the worker. */
    if (c.name) await enqueue(tx, actor.tenantId, "zoho.pushSponsor", { sponsorId: c.sponsor.id, rename: true });
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
