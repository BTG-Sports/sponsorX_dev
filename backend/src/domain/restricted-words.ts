/**
 * BTG's restricted-words list — 2S1-BE-18.
 *
 * "Free text containing a listed word, including disguised spellings, is
 * marked restricted with what matched; innocent words that merely contain a
 * listed word are not; BTG admins can edit the list and every change is
 * audited; a match routes the item to BTG's review and never rejects it."
 *
 * The list is per tenant and starts from the starter list
 * (restricted-words-rules.ts), seeded the first time the tenant's list is
 * read. Removing a word deactivates it, so its history stays and adding it
 * back reactivates the same row. Matching is pure (findRestricted); this
 * file loads the list and records the changes.
 *
 * `checkRestricted` is the entry point other features use (the sponsor
 * request's "Other" description first): it takes a transaction and a
 * tenant, not an actor, because the text it checks usually comes from the
 * public, before anyone is signed in.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  findRestricted, KIND_LABELS, normalizeEntry, RESTRICTED_KINDS, STARTER_WORDS,
  type RestrictedKind, type RestrictedMatch,
} from "./restricted-words-rules";

type Tx = Prisma.TransactionClient | typeof prisma;

export class RestrictedWordError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "RestrictedWordError";
    this.status = status;
  }
}

/** First use of a tenant's list: seed the starter words, once (any row, active or not, means seeded). */
async function ensureSeeded(tx: Tx, tenantId: string) {
  const any = await tx.restrictedWord.count({ where: { tenantId } });
  if (any > 0) return;
  await tx.restrictedWord.createMany({
    data: STARTER_WORDS.map((w) => ({ tenantId, word: w.word, normalized: normalizeEntry(w.word), kind: w.kind, addedBy: "starter" })),
    skipDuplicates: true,
  });
}

async function activeEntries(tx: Tx, tenantId: string) {
  await ensureSeeded(tx, tenantId);
  return tx.restrictedWord.findMany({
    where: { tenantId, active: true },
    select: { word: true, normalized: true, kind: true },
    orderBy: { createdAt: "asc" },
  });
}

/** The check other features call: what in this text is restricted, for this tenant's list. */
export async function checkRestricted(tx: Tx, tenantId: string, text: string | null | undefined): Promise<RestrictedMatch[]> {
  if (!text?.trim()) return [];
  return findRestricted(text, await activeEntries(tx, tenantId));
}

const VIEW = { id: true, word: true, kind: true, active: true, addedBy: true, createdAt: true, updatedAt: true } as const;

/** The admin page: every word (active and removed), grouped client-side by kind. */
export async function listRestrictedWords(actor: Actor) {
  const where = whereFor(actor, "restrictedWord", "read");
  await ensureSeeded(prisma, actor.tenantId);
  const words = await prisma.restrictedWord.findMany({ where: { ...where }, select: VIEW, orderBy: [{ kind: "asc" }, { word: "asc" }] });
  return { words, kinds: RESTRICTED_KINDS.map((k) => ({ kind: k, label: KIND_LABELS[k] })) };
}

export async function addRestrictedWord(actor: Actor, input: { word: string; kind: RestrictedKind }) {
  assertAllowed(actor, "restrictedWord", "write");
  const word = input.word.trim();
  const normalized = normalizeEntry(word);
  if (!normalized) throw new RestrictedWordError("Enter a word or phrase with at least one letter.");
  return prisma.$transaction(async (tx) => {
    await ensureSeeded(tx, actor.tenantId);
    const existing = await tx.restrictedWord.findFirst({
      where: { ...whereFor(actor, "restrictedWord", "write"), normalized }, select: { id: true, active: true, kind: true, word: true },
    });
    let row;
    if (existing) {
      if (existing.active && existing.kind === input.kind) throw new RestrictedWordError(`"${existing.word}" is already on the list.`, 409);
      row = await tx.restrictedWord.update({
        /* tenant-scope: the row loaded above through whereFor(restrictedWord, write). */
        where: { id: existing.id }, data: { active: true, kind: input.kind, word, addedBy: actor.userId }, select: VIEW,
      });
    } else {
      row = await tx.restrictedWord.create({
        data: { tenantId: actor.tenantId, word, normalized, kind: input.kind, addedBy: actor.userId }, select: VIEW,
      });
    }
    await audit(tx, actor, "restrictedWord.add", "RestrictedWord", row.id, {
      before: existing ? { active: existing.active, kind: existing.kind } : undefined, after: { word, kind: input.kind, active: true },
    });
    return row;
  });
}

export async function removeRestrictedWord(actor: Actor, id: string) {
  assertAllowed(actor, "restrictedWord", "write");
  return prisma.$transaction(async (tx) => {
    const row = await tx.restrictedWord.findFirst({ where: { ...whereFor(actor, "restrictedWord", "write"), id }, select: { id: true, word: true, kind: true, active: true } });
    if (!row) throw new ForbiddenError("restrictedWord", "write");
    if (!row.active) throw new RestrictedWordError(`"${row.word}" is already off the list.`, 409);
    const updated = await tx.restrictedWord.update({
      /* tenant-scope: the row loaded above through whereFor(restrictedWord, write). */
      where: { id: row.id }, data: { active: false }, select: VIEW,
    });
    await audit(tx, actor, "restrictedWord.remove", "RestrictedWord", row.id, { before: { word: row.word, kind: row.kind, active: true }, after: { active: false } });
    return updated;
  });
}

/** The admin page's "Test text" box: what this text would match, and why. */
export async function testRestrictedText(actor: Actor, text: string) {
  assertAllowed(actor, "restrictedWord", "read");
  const matches = await checkRestricted(prisma, actor.tenantId, text);
  return { restricted: matches.length > 0, matches: matches.map((m) => ({ ...m, label: KIND_LABELS[m.kind as RestrictedKind] ?? m.kind })) };
}

/** Who changed the list, and when — read from the audit log. */
export async function restrictedWordHistory(actor: Actor) {
  assertAllowed(actor, "restrictedWord", "read");
  const rows = await prisma.auditLog.findMany({
    where: { tenantId: actor.tenantId, entity: "RestrictedWord", action: { in: ["restrictedWord.add", "restrictedWord.remove"] } },
    select: { action: true, actorId: true, after: true, before: true, at: true },
    orderBy: { at: "desc" },
    take: 100,
  });
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
  const users = new Map((await prisma.user.findMany({ where: { tenantId: actor.tenantId, id: { in: ids } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  return rows.map((r) => ({
    change: r.action === "restrictedWord.add" ? "added" : "removed",
    word: ((r.after as { word?: string } | null)?.word ?? (r.before as { word?: string } | null)?.word) ?? null,
    by: r.actorId ? users.get(r.actorId) ?? null : null,
    at: r.at,
  }));
}
