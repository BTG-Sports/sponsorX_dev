/**
 * /api/v1/audit-log — P8-FE-02, §23, §30. The critical-mutation history,
 * browsable by record and by person.
 *
 * READ-ONLY, and the only read. Audit rows are written inside the
 * transactions they describe (db/audit.ts) and never edited; there is no
 * write route here and there must never be one.
 *
 * The matrix gives `auditLog` read to BTG_ADMIN (own tenant) and SUPER_ADMIN.
 * Payloads (`before` / `after`) are returned as written: the audit writers
 * already keep personal data out of them (acceptance IP and user agent live on
 * the acceptance row, not here — agreement.ts), and the reader is an admin.
 *
 * Paging is keyset (at, id) newest-first — an offset would skip or repeat
 * rows while new mutations land at the top.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { clampPage, pageInfo, pageRequest } from "../../lib/paging";
import { assertAllowed, whereFor } from "../../auth/scope";
import { prisma } from "../../db/client";

export const auditRouter = Router();

const str = (v: unknown, max = 200) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);

const listAudit: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  assertAllowed(actor, "auditLog", "read");
  const scope = whereFor(actor, "auditLog", "read");

  const entity = str(req.query.entity, 80);
  const entityId = str(req.query.entityId);
  const actorId = str(req.query.actorId);
  const action = str(req.query.action, 120);
  /* ?page= turns on the house pager (lib/paging.ts): a counted page instead of the keyset cursor. */
  const paged = pageRequest(req.query as Record<string, unknown>);
  const limit = paged ? paged.take : Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  /* cursor = "<iso>|<id>" of the last row the caller saw */
  const cursor = str(req.query.cursor, 300)?.split("|");
  const cursorAt = cursor?.[0] ? new Date(cursor[0]) : null;
  const cursorId = cursor?.[1];

  const where = {
    ...scope,
    ...(entity ? { entity } : {}),
    ...(entityId ? { entityId } : {}),
    ...(actorId ? { actorId: actorId === "system" ? null : actorId } : {}),
    ...(action ? { action: { startsWith: action } } : {}),
    ...(cursorAt && cursorId && !Number.isNaN(cursorAt.getTime())
      ? { OR: [{ at: { lt: cursorAt } }, { at: cursorAt, id: { lt: cursorId } }] }
      : {}),
  };

  /* Paged: count first, so the page is clamped to what exists before it is read. */
  const total = paged ? await prisma.auditLog.count({ where: { ...where } /* tenant-scope: whereFor(auditLog) in scope */ }) : 0;
  const pageReq = paged ? clampPage(paged, total) : null;
  const [rows, entities, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where: { ...where },
      select: { id: true, at: true, action: true, entity: true, entityId: true, actorId: true, before: true, after: true },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      ...(pageReq ? { skip: pageReq.skip } : {}),
      take: limit + 1,
    }),
    /* Facets for the filter menus, over the whole scope (not the page). */
    prisma.auditLog.groupBy({ by: ["entity"], where: scope /* tenant-scope: whereFor(auditLog) above */, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["actorId"], where: scope /* tenant-scope: whereFor(auditLog) above */, _count: { _all: true } }),
  ]);

  const page = rows.slice(0, limit);
  const userIds = [...new Set([...page.map((r) => r.actorId), ...actors.map((a) => a.actorId)].filter((x): x is string => Boolean(x)))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { ...whereFor(actor, "user", "read"), id: { in: userIds } },
        select: { id: true, email: true, roles: true },
      })
    : [];
  const who = new Map(users.map((u) => [u.id, u]));
  const last = page.at(-1);

  res.json({
    rows: page.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actor: r.actorId
        ? { id: r.actorId, email: who.get(r.actorId)?.email ?? null, roles: who.get(r.actorId)?.roles ?? [] }
        : null,
      before: r.before,
      after: r.after,
    })),
    nextCursor: !paged && rows.length > limit && last ? `${last.at.toISOString()}|${last.id}` : null,
    ...(pageReq ? { page: pageInfo(pageReq, total) } : {}),
    facets: {
      entities: entities.map((e) => ({ entity: e.entity, count: e._count._all })).sort((a, b) => b.count - a.count),
      actors: actors
        .map((a) => ({ id: a.actorId ?? "system", email: a.actorId ? who.get(a.actorId)?.email ?? null : null, count: a._count._all }))
        .sort((a, b) => b.count - a.count),
    },
  });
};

auditRouter.get("/audit-log", requireActor, listAudit);

export { listAudit };
