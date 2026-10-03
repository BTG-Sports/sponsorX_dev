/**
 * /api/v1 — SponsorX NEXT publications, editions and ad inventory
 * (P9-BE-02, -03, -06, -12).
 *
 * Staff routes carry `requireActor` and are scoped by matrix §15.3. The one
 * PUBLIC route — a reader engaging with a published edition — is grouped at
 * the bottom and rate-limited, as the fan routes are.
 *
 * No business rule lives here; see domain/edition.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { assertAllowed, can, whereFor } from "../../auth/scope";
import { prisma } from "../../db/client";
import { rightsGap } from "../../domain/content-rights";
import { artworkBlockers } from "../../domain/edition-artwork-rules";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import {
  AdSaleInput,
  AdSlotInput,
  EditionConditionsInput,
  EditionEventInput,
  EditionInput,
  EditionTransitionInput,
  PublicationInput,
} from "../../contracts/edition";
import {
  addSlot,
  createEdition,
  createPublication,
  editionSplits,
  getEdition,
  listSlots,
  positionsFor,
  recordEditionEvent,
  sellCampaignSlots,
  setEditionConditions,
  transitionEdition,
} from "../../domain/edition";
import { EditionNotFoundError } from "../../domain/edition";
import { PUBLISHED_STATES } from "../../domain/edition-state";

export const editionsRouter = Router();

/* ── staff ──────────────────────────────────────────────────────────────── */

const newPublication: RequestHandler = async (req, res) => {
  res.status(201).json(await createPublication(req.actor!, PublicationInput.parse(req.body)));
};

const newEdition: RequestHandler<{ id: string }> = async (req, res) => {
  const b = EditionInput.parse(req.body);
  res.status(201).json(await createEdition(req.actor!, req.params.id, {
    ...b,
    closeDate: new Date(b.closeDate),
    publishTarget: new Date(b.publishTarget),
    printDate: b.printDate ? new Date(b.printDate) : null,
  }));
};

const readEdition: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getEdition(req.actor!, req.params.id));
};

const conditions: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await setEditionConditions(req.actor!, req.params.id, EditionConditionsInput.parse(req.body)));
};

const transition: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await transitionEdition(req.actor!, req.params.id, EditionTransitionInput.parse(req.body).to));
};

const newSlot: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await addSlot(req.actor!, req.params.id, AdSlotInput.parse(req.body)));
};

const slots: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ slots: await listSlots(req.actor!, req.params.id) });
};

const sell: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(201).json(await sellCampaignSlots(req.actor!, req.params.id, AdSaleInput.parse(req.body).campaignId));
};

const splits: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ splits: await editionSplits(req.actor!, req.params.id) });
};

/* ── screen reads (P9-FE-03, -04, -05) ──────────────────────────────────────
   Thin and read-only: what the page map, the ledger and the splits screen
   render. No rule is decided here — the sale itself stays in the domain. */

const PAGE_OF = /^P(\d+)/;

/** GET /editions — every edition in the caller's scope, newest close first,
 *  with its inventory folded to counts and its rights gap counted. */
const listEditions: RequestHandler = async (req, res) => {
  const actor = req.actor!;
  assertAllowed(actor, "edition", "read");
  const editions = await prisma.edition.findMany({
    where: { ...whereFor(actor, "edition", "read") },
    select: {
      id: true, label: true, state: true, closeDate: true, publishTarget: true, printDate: true,
      pageCount: true, thresholdCents: true, contentReady: true, rightsCleared: true, revenueMet: true,
      publication: { select: { id: true, name: true, propertyId: true } },
    },
    orderBy: [{ closeDate: "desc" }, { id: "asc" }],
    take: 100,
  });
  const ids = editions.map((e) => e.id);
  const slots = ids.length && can(actor, "adSlot", "read")
    ? await prisma.adSlot.findMany({
        where: { ...whereFor(actor, "adSlot", "read"), editionId: { in: ids } },
        select: { id: true, slotCode: true, editionId: true, campaignId: true, priceCents: true, soldCents: true },
      })
    : [];
  /* The digital gap the production gate asks about (P9-BE-10), counted, so
     the gates band shows what stands between the edition and the press. */
  const gaps = can(actor, "editionAsset", "read")
    ? await Promise.all(editions.map((e) => rightsGap(prisma, actor.tenantId, e.id, "DIGITAL", e.publishTarget)))
    : null;
  /* P9-BE-16 — the sold slots whose artwork is not yet approved on the board,
     counted: the fourth thing between the edition and production. */
  const art = ids.length && can(actor, "editionArtwork", "read")
    ? await prisma.editionAsset.findMany({
        where: { ...whereFor(actor, "editionArtwork", "read"), editionId: { in: ids } },
        select: { adSlotId: true, reviewState: true },
      })
    : null;
  const artBySlot = new Map((art ?? []).map((a) => [a.adSlotId, a]));

  res.json({
    editions: editions.map((e, i) => {
      const mine = slots.filter((s) => s.editionId === e.id);
      const sold = mine.filter((s) => s.campaignId);
      return {
        ...e,
        closeDate: e.closeDate.toISOString(),
        publishTarget: e.publishTarget.toISOString(),
        printDate: e.printDate?.toISOString() ?? null,
        inventory: {
          total: mine.length,
          sold: sold.length,
          committedCents: sold.reduce((n, s) => n + (s.soldCents ?? 0), 0),
          rackCents: mine.reduce((n, s) => n + s.priceCents, 0),
        },
        rightsPending: gaps ? gaps[i]!.length : null,
        artworkPending: art
          ? artworkBlockers(mine.map((s) => ({ slotCode: s.slotCode, campaignId: s.campaignId, artwork: artBySlot.get(s.id) ?? null }))).length
          : null,
      };
    }),
  });
};

/** GET /editions/:id/ledger — the slots with the page each sits on and, where
 *  the caller may read campaigns, who bought it. A student sees what is open
 *  and what is taken; a buyer's name is a campaign read (matrix §15.3). */
const ledger: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  const rows = await listSlots(actor, req.params.id);
  const campaignIds = [...new Set(rows.map((r) => r.campaignId).filter((x): x is string => Boolean(x)))];
  const buyers = campaignIds.length && can(actor, "campaign", "read")
    ? await prisma.campaign.findMany({
        where: { ...whereFor(actor, "campaign", "read"), id: { in: campaignIds } },
        select: { id: true, name: true, sponsor: { select: { name: true } } },
      })
    : [];
  const by = new Map(buyers.map((b) => [b.id, b]));
  /* P9-BE-16 — each sold slot's artwork on the approval board, for a caller
     who reads it (BTG's desk); nobody else's ledger carries it. */
  const soldIds = rows.filter((r) => r.campaignId).map((r) => r.id);
  const artwork = soldIds.length && can(actor, "editionArtwork", "read")
    ? await prisma.editionAsset.findMany({
        where: { ...whereFor(actor, "editionArtwork", "read"), adSlotId: { in: soldIds } },
        select: { id: true, adSlotId: true, reviewState: true, artworkVersion: true, submittedAt: true, revisionNote: true, artworkChecksPassed: true },
      })
    : null;
  const artBySlot = new Map((artwork ?? []).map((a) => [a.adSlotId, a]));
  res.json({
    slots: rows.map((r) => {
      const page = PAGE_OF.exec(r.slotCode);
      const buyer = r.campaignId ? by.get(r.campaignId) : undefined;
      return {
        id: r.id,
        slotCode: r.slotCode,
        kind: r.kind,
        page: r.kind === "BACK_COVER" || r.kind === "PRESENTING" || !page ? null : Number(page[1]),
        priceCents: r.priceCents,
        sold: Boolean(r.campaignId),
        soldCents: r.soldCents,
        soldAt: r.soldAt?.toISOString() ?? null,
        ...(buyer ? { buyer: { campaignId: buyer.id, campaign: buyer.name, sponsor: buyer.sponsor.name } } : {}),
        ...(artwork && r.campaignId
          ? {
              artwork: (() => {
                const a = artBySlot.get(r.id);
                return a
                  ? {
                      id: a.id, state: a.reviewState, version: a.artworkVersion ?? 0,
                      submittedAt: a.submittedAt?.toISOString() ?? null, revision: a.revisionNote ? { reason: a.revisionNote } : null,
                      /* P9-BE-22 — the automatic checks sent it back to the sponsor. */
                      sentBack: a.reviewState === "DRAFT_SUBMITTED" && a.artworkChecksPassed === false,
                    }
                  : null;
              })(),
            }
          : {}),
      };
    }),
  });
};

/** GET /editions/:id/sale-candidates — the DRAFT campaigns whose package
 *  promises positions, each with whether this edition can still honour it.
 *  The page map books from this list, so a sold back cover shows as taken
 *  here instead of failing at the sale (P9-FE-03). The sale re-checks all of
 *  it inside its own transaction; this is the menu, not the rule. */
const saleCandidates: RequestHandler<{ id: string }> = async (req, res) => {
  const actor = req.actor!;
  assertAllowed(actor, "adSlot", "write");
  const slots = await listSlots(actor, req.params.id);
  const campaigns = await prisma.campaign.findMany({
    where: { ...whereFor(actor, "campaign", "read"), state: "DRAFT", brief: { is: { packageId: { not: null } } } },
    select: {
      id: true, name: true, sponsor: { select: { name: true } },
      brief: { select: { package: { select: { code: true, name: true, priceLow: true, includes: true } } } },
    },
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
    take: 100,
  });
  const holding = new Set(slots.map((s) => s.campaignId).filter(Boolean));
  const free = (kind: string) => slots.filter((s) => s.kind === kind && !s.campaignId).length;

  res.json({
    candidates: campaigns.flatMap((c) => {
      const pkg = c.brief?.package;
      const wanted = positionsFor((pkg?.includes as Array<{ kind: string; code: string; quantity?: number }> | null) ?? null);
      if (!pkg || wanted.length === 0) return [];
      const need = wanted.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
      const short = Object.entries(need).filter(([k, n]) => free(k) < n).map(([k]) => k);
      return [{
        campaignId: c.id,
        campaign: c.name,
        sponsor: c.sponsor.name,
        package: { code: pkg.code, name: pkg.name, priceCents: pkg.priceLow * 100 },
        positions: wanted,
        holdsPlacements: holding.has(c.id),
        unavailable: short,
      }];
    }),
  });
};

editionsRouter.post("/publications", requireActor, newPublication);
editionsRouter.post("/publications/:id/editions", requireActor, newEdition);
editionsRouter.get("/editions", requireActor, listEditions);
editionsRouter.get("/editions/:id", requireActor, readEdition);
editionsRouter.get("/editions/:id/ledger", requireActor, ledger);
editionsRouter.get("/editions/:id/sale-candidates", requireActor, saleCandidates);
editionsRouter.post("/editions/:id/conditions", requireActor, conditions);
editionsRouter.post("/editions/:id/transition", requireActor, transition);
editionsRouter.post("/editions/:id/slots", requireActor, newSlot);
editionsRouter.get("/editions/:id/slots", requireActor, slots);
editionsRouter.post("/editions/:id/sales", requireActor, sell);
editionsRouter.get("/editions/:id/splits", requireActor, splits);

/* ── public ─────────────────────────────────────────────────────────────── */

/** POST /public/editions/:id/events — a reader scanned or tapped (§6.4). */
const event: RequestHandler<{ id: string }> = async (req, res) => {
  await limit("edition:event", clientIp(req), 120, 60);
  res.status(201).json(await recordEditionEvent(req.params.id, EditionEventInput.parse(req.body)));
};

editionsRouter.post("/public/editions/:id/events", event);

/**
 * GET /public/editions/:school/:id — the free digital edition (P9-FE-07,
 * spec principle 10). PUBLIC and read-only.
 *
 * Only a PUBLISHED edition answers; any other state is the same 404 as an
 * edition that does not exist, so an unpublished issue is unreachable and
 * the answer is no oracle. `school` must be the publication's school slug
 * (or `regional` for a publication with no school).
 *
 * What is public is what a printed magazine shows anyway: the masthead, the
 * content that holds a digital right in force today (the gate already
 * required it to publish — a right that lapsed since drops out), bylines as
 * display names only (P9-SEC-01), and the sponsors who bought positions.
 * Never a price, a sale value, a legal name, an email, or an open slot's
 * rack price.
 */
const readPublic: RequestHandler<{ school: string; id: string }> = async (req, res) => {
  await limit("edition:read", clientIp(req), 120, 60);
  const now = new Date();
  const edition = await prisma.edition.findFirst({
    /* tenant-scope: public route — the edition id is globally unique; only published editions answer. */
    where: { id: req.params.id, state: { in: [...PUBLISHED_STATES] } },
    select: {
      id: true, tenantId: true, label: true, state: true, publishTarget: true, printDate: true,
      publication: { select: { name: true, property: { select: { slug: true, name: true, city: true, stateCode: true } } } },
    },
  });
  const slug = edition?.publication.property?.slug ?? "regional";
  if (!edition || slug !== req.params.school) throw new EditionNotFoundError();
  const [assets, slots] = await Promise.all([
    prisma.editionAsset.findMany({
      where: {
        tenantId: edition.tenantId, editionId: edition.id, kind: { not: "AD_CREATIVE" },
        rights: { some: { mayPublishDigital: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } },
      },
      select: { id: true, kind: true, title: true, studentId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.adSlot.findMany({
      where: { tenantId: edition.tenantId, editionId: edition.id, campaignId: { not: null } },
      select: { id: true, slotCode: true, kind: true, campaign: { select: { sponsor: { select: { name: true } } } } },
      orderBy: { slotCode: "asc" },
    }),
  ]);
  const studentIds = [...new Set(assets.map((a) => a.studentId).filter((x): x is string => Boolean(x)))];
  const bylines = studentIds.length
    ? await prisma.student.findMany({
        where: { tenantId: edition.tenantId, id: { in: studentIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const by = new Map(bylines.map((s) => [s.id, s.displayName]));
  const school = edition.publication.property;
  res.json({
    id: edition.id,
    label: edition.label,
    state: edition.state,
    publishTarget: edition.publishTarget.toISOString(),
    printDate: edition.printDate?.toISOString() ?? null,
    publication: edition.publication.name,
    school: school ? { slug: school.slug, name: school.name, city: school.city, stateCode: school.stateCode } : null,
    contents: assets.map((a) => ({ id: a.id, kind: a.kind, title: a.title, byline: a.studentId ? by.get(a.studentId) ?? null : null })),
    sponsors: slots.map((s) => ({ id: s.id, slotCode: s.slotCode, kind: s.kind, sponsor: s.campaign?.sponsor.name ?? "A local sponsor" })),
  });
};

editionsRouter.get("/public/editions/:school/:id", readPublic);

/**
 * GET /public/next/schools — the schools that have adopted NEXT (a school
 * property with a publication), for the student application's school picker
 * (P1-FE-25 / P9-FE-06). Names and places only: no advisor, no student, no
 * contact detail reaches a public caller.
 */
editionsRouter.get("/public/next/schools", async (req, res) => {
  await limit("next:schools", clientIp(req), 120, 60);
  const schools = await prisma.property.findMany({
    /* tenant-scope: public route — every tenant's NEXT schools are public by design; only name and place are selected. */
    where: { kind: "SCHOOL", publications: { some: {} } },
    select: { slug: true, name: true, city: true, stateCode: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  res.json({ schools });
});

/** GET /public/next/editions — the latest published editions, for the NEXT landing (P1-FE-24). */
editionsRouter.get("/public/next/editions", async (req, res) => {
  await limit("next:editions", clientIp(req), 120, 60);
  const rows = await prisma.edition.findMany({
    /* tenant-scope: public route — only published editions answer, exactly as the public edition reader. */
    where: { state: { in: [...PUBLISHED_STATES] } },
    select: {
      id: true, label: true, publishTarget: true,
      publication: { select: { name: true, property: { select: { slug: true, name: true, city: true, stateCode: true } } } },
    },
    orderBy: { publishTarget: "desc" },
    take: 6,
  });
  res.json({
    editions: rows.map((e) => ({
      id: e.id,
      label: e.label,
      publication: e.publication.name,
      publishedAt: e.publishTarget.toISOString(),
      school: e.publication.property
        ? { slug: e.publication.property.slug, name: e.publication.property.name, city: e.publication.property.city, stateCode: e.publication.property.stateCode }
        : null,
    })),
  });
});

export { readPublic };
export { listEditions, ledger, saleCandidates };
