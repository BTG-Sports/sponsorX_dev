import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-SEC-03 — every private upload URL is signed for one type and one size,
   and a mismatched object is refused and deleted on confirm. End to end.

   No storage mock. The API presigns against a real S3 endpoint
   (tests/support/object-store.ts) that checks presigned signatures the way
   R2 does, so each flow is driven exactly as a browser drives it:

     grant (the domain function the route calls)
       → PUT to the signed URL — another Content-Type, or another length, is
         refused by the bucket (403);
       → a file that is NOT what the grant pinned, placed in the bucket the
         way a bucket that did not enforce the signature would have stored
         it → confirm refuses it (422), deletes it, and audits the refusal;
       → the right file, PUT through the URL → confirm accepts it.

   Run for every private document upload — account (sign-up / guardian /
   coming-of-age ID), onboarding, organisation, sponsor-request, guardian
   hand-off, support attachment, profile-change ID — the seller's delivery
   proof, and the two uploads whose confirm step is their register step: a
   deliverable's creative and an ad slot's artwork.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
/* 2S8-QA-08 — every id, slug and email is unique to this run, so a row an
   earlier run failed to clean up can never collide with this one. */
const R = randomBytes(3).toString("hex");
const T = `pu_tenant_${R}`;
const previousIntake = process.env.PUBLIC_INTAKE_TENANT_ID;
const previousEndpoint = process.env.S3_ENDPOINT;
process.env.PUBLIC_INTAKE_TENANT_ID = T;

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));

const { startObjectStore } = await import("./support/object-store");
const store = await startObjectStore();
/* The API's S3 client reads S3_ENDPOINT when storage.ts is first imported, below. */
process.env.S3_ENDPOINT = store.endpoint;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S8-SEC-03 · private uploads are pinned to one type and size, and checked on confirm", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const storage = await import("../src/lib/storage");
  const { startAccountDocument, finishAccountDocument } = await import("../src/domain/account-documents");
  const { requestDocumentUpload, confirmDocumentUpload } = await import("../src/domain/onboarding-documents");
  const { requestOrganizationUpload, confirmOrganizationUpload } = await import("../src/domain/organization-documents");
  const { requestSponsorDocumentUpload, confirmSponsorDocumentUpload } = await import("../src/domain/sponsor-requests");
  const { requestHandoffDocumentUpload, confirmHandoffDocumentUpload } = await import("../src/domain/guardian-handoff");
  const { submitSupportMessage, sendSupportMessage } = await import("../src/domain/support");
  const { submitProfileChange, confirmLegalNameDocument } = await import("../src/domain/athlete-profile-change");
  const { requestProofUpload, markDelivered } = await import("../src/domain/delivery");
  const { presignCreativeUpload, registerCreativeAsset } = await import("../src/domain/deliverable");
  const { presignArtworkUpload, registerArtwork } = await import("../src/domain/edition-artwork");
  const { issueOnboardingToken } = await import("../src/lib/onboarding-token");
  const { issueSponsorRequestToken } = await import("../src/lib/sponsor-request-token");
  const { issuePurposeToken } = await import("../src/lib/purpose-token");
  store.verifyWith(storage.s3);

  const BUCKET = storage.BUCKETS.private;
  const athlete = { userId: `pu_athlete_user_${R}`, tenantId: T, roles: ["ATHLETE" as const], sponsorId: null, athleteId: `pu_athlete_${R}`, guardianId: null, propertyId: null };
  const manager = { userId: `pu_pm_user_${R}`, tenantId: T, roles: ["PROPERTY_MGR" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: `pu_prop_${R}` };
  const sponsorAdmin = { userId: `pu_sp_user_${R}`, tenantId: T, roles: ["SPONSOR_ADMIN" as const], sponsorId: `pu_sponsor_${R}`, athleteId: null, guardianId: null, propertyId: null };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    /* 2S8-QA-08 — say what couldn't be cleaned up instead of leaving it silently. */
    const left: string[] = [];
    for (const { table_name } of tables) {
      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table_name}" WHERE "tenantId" = $1`, T);
      if (row && row.n > 0n) left.push(`${table_name} (${row.n})`);
    }
    if (left.length) console.warn(`[private-upload-pins] rows left for ${T}: ${left.join(", ")}`);
    await prisma.tenant.deleteMany({ where: { id: T } }).catch((e: unknown) => console.warn(`[private-upload-pins] tenant ${T} not deleted:`, e instanceof Error ? e.message.slice(0, 200) : e));
  }

  beforeAll(async () => {
    await wipe();
    const far = new Date(Date.now() + 3650 * 864e5);
    await prisma.tenant.create({ data: { id: T, name: "PU Tenant" } });
    await prisma.guardian.create({ data: { id: `pu_guardian_${R}`, tenantId: T, legalName: "PU Guardian", email: `pu-guardian-${R}@pu.invalid`, relationship: "PARENT" } });
    await prisma.athlete.create({ data: {
      id: `pu_athlete_${R}`, tenantId: T, slug: `pu-athlete-${R}`, legalName: "PU Athlete", displayName: "PUA", email: `pu-athlete-${R}@pu.invalid`,
      sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.sponsor.create({ data: { id: `pu_sponsor_${R}`, tenantId: T, name: "PU Sponsor" } });
    await prisma.property.create({ data: { id: `pu_prop_${R}`, tenantId: T, slug: `pu-prop-${R}`, name: "PU School", kind: "SCHOOL" } });
    await prisma.user.createMany({ data: [
      { id: athlete.userId, tenantId: T, clerkId: athlete.userId, email: `pu-athlete-${R}@pu.invalid`, roles: ["ATHLETE"], athleteId: `pu_athlete_${R}` },
      { id: manager.userId, tenantId: T, clerkId: manager.userId, email: `pu-pm-${R}@pu.invalid`, roles: ["PROPERTY_MGR"], propertyId: `pu_prop_${R}` },
      { id: sponsorAdmin.userId, tenantId: T, clerkId: sponsorAdmin.userId, email: `pu-sp-${R}@pu.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: `pu_sponsor_${R}` },
    ] });
    await prisma.propertyOnboarding.createMany({ data: [
      { id: `pu_onb_draft_${R}`, tenantId: T, orgType: "TEAM", orgName: "PU Applicant", state: "DRAFT" },
      { id: `pu_onb_org_${R}`, tenantId: T, orgType: "SCHOOL", orgName: "PU School", state: "APPROVED", propertyId: `pu_prop_${R}` },
    ] });
    await prisma.inquiry.create({ data: { id: `pu_inquiry_${R}`, tenantId: T, companyName: "PU Café", lastName: "PU Requester", email: `pu-req-${R}@pu.invalid`, source: "web-form" } });
    await prisma.guardianHandoff.create({ data: {
      id: `pu_handoff_${R}`, tenantId: T, athleteId: `pu_athlete_${R}`, fromGuardianId: `pu_guardian_${R}`, requesterName: "PU New Guardian",
      requesterEmail: `pu-newg-${R}@pu.invalid`, relationship: "PARENT", state: "REQUESTED",
    } });
    /* A sold line the school is delivering, for the delivery proof. */
    await prisma.inventoryItem.create({ data: { id: `pu_item_${R}`, tenantId: T, propertyId: `pu_prop_${R}`, title: "PU Banner", kind: "SIGNAGE", priceCents: 9000 } });
    await prisma.listing.create({ data: { id: `pu_listing_${R}`, tenantId: T, propertyId: `pu_prop_${R}`, inventoryItemId: `pu_item_${R}`, title: "PU Banner", description: "A banner", state: "PUBLISHED", publishedAt: new Date() } });
    await prisma.cart.create({ data: { id: `pu_cart_${R}`, tenantId: T, sponsorId: `pu_sponsor_${R}`, expiresAt: far } });
    await prisma.reservation.create({ data: { id: `pu_res_${R}`, tenantId: T, sponsorId: `pu_sponsor_${R}`, cartId: `pu_cart_${R}`, state: "CONVERTED", convertedAt: new Date(), expiresAt: far } });
    await prisma.marketplaceOrder.create({ data: {
      id: `pu_order_${R}`, tenantId: T, sponsorId: `pu_sponsor_${R}`, reservationId: `pu_res_${R}`, state: "IN_DELIVERY",
      subtotalCents: 9000, feesCents: 0, totalCents: 9000, requiresApproval: false, approvalReasons: [],
      lines: { create: [{
        id: `pu_line_${R}`, tenantId: T, listingId: `pu_listing_${R}`, inventoryItemId: `pu_item_${R}`, itemTenantId: T, propertyId: `pu_prop_${R}`, title: "PU Banner",
        quantity: 1, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-01-02"), unitPriceCents: 9000, lineTotalCents: 9000,
      }] },
    } });
    await prisma.orderLineDelivery.create({ data: {
      id: `pu_delivery_${R}`, tenantId: T, orderId: `pu_order_${R}`, lineId: `pu_line_${R}`, sponsorId: `pu_sponsor_${R}`, propertyId: `pu_prop_${R}`, propertyTenantId: T, state: "IN_DELIVERY",
    } });
    /* A campaign: the athlete's deliverable for its creative, and an ad slot sold to it for its artwork. */
    await prisma.campaign.create({ data: {
      id: `pu_campaign_${R}`, tenantId: T, sponsorId: `pu_sponsor_${R}`, name: "PU Campaign", budget: 500000,
      startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), state: "ACTIVE",
    } });
    await prisma.nilJob.create({ data: { id: `pu_job_${R}`, tenantId: T, name: "PU Job", baseLow: 10000, baseHigh: 20000, sellLow: 20000, sellHigh: 40000, sellFloorEmerging: 15000, sellFloorCreator: 20000, sellFloorPremium: 30000 } });
    await prisma.campaignOrder.create({ data: {
      id: `pu_corder_${R}`, tenantId: T, campaignId: `pu_campaign_${R}`, athleteId: `pu_athlete_${R}`, jobId: `pu_job_${R}`, compensation: 20000, sellPrice: 40000,
      usageRights: "90 days", dueDate: new Date("2026-12-15"), state: "ACTIVE",
    } });
    await prisma.deliverable.create({ data: { id: `pu_deliverable_${R}`, tenantId: T, orderId: `pu_corder_${R}`, title: "PU post", dueDate: new Date("2026-12-15") } });
    await prisma.publication.create({ data: { id: `pu_pub_${R}`, tenantId: T, name: "PU Masthead" } });
    await prisma.edition.create({ data: {
      id: `pu_edition_${R}`, tenantId: T, publicationId: `pu_pub_${R}`, label: "PU Edition", closeDate: far, publishTarget: far, thresholdCents: 100000, state: "SELLING",
    } });
    await prisma.adSlot.create({ data: {
      id: `pu_slot_${R}`, tenantId: T, editionId: `pu_edition_${R}`, slotCode: "PU-FULL", kind: "FULL", priceCents: 80000, campaignId: `pu_campaign_${R}`, soldCents: 80000, soldAt: new Date(),
    } });
  });

  afterAll(async () => {
    await wipe();
    await store.close();
    if (previousEndpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = previousEndpoint;
    if (previousIntake === undefined) delete process.env.PUBLIC_INTAKE_TENANT_ID;
    else process.env.PUBLIC_INTAKE_TENANT_ID = previousIntake;
  });

  /** The object key a presigned URL writes to (path-style: /<bucket>/<key>). */
  const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname).replace(new RegExp(`^/${BUCKET}/`), "");
  const put = (url: string, type: string, body: Buffer) => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });

  type Flow = {
    name: string;
    type: string;
    bytes: number;
    grant: () => Promise<string>;
    confirm: () => Promise<unknown>;
    /** What the record says once a confirm has been accepted (or not). */
    confirmed: () => Promise<boolean>;
  };

  const ctx: Record<string, string> = {};
  const FLOWS: Flow[] = [
    {
      name: "account document (sign-up, guardian set-up and coming-of-age IDs)", type: "application/pdf", bytes: 2_345,
      grant: async () => {
        const g = await startAccountDocument({ tenantId: T, athleteId: `pu_athlete_${R}` }, { kind: "GOVERNMENT_ID", filename: "id.pdf", contentType: "application/pdf", bytes: 2_345 });
        ctx.account = g.document.id;
        return g.uploadUrl;
      },
      confirm: () => finishAccountDocument({ tenantId: T, athleteId: `pu_athlete_${R}` }, ctx.account!),
      confirmed: async () => Boolean((await prisma.accountDocument.findUniqueOrThrow({ where: { id: ctx.account! }, select: { uploadedAt: true } })).uploadedAt),
    },
    {
      name: "onboarding document (the public wizard)", type: "application/pdf", bytes: 3_210,
      grant: async () => {
        const g = await requestDocumentUpload(issueOnboardingToken(`pu_onb_draft_${R}`), { kind: "BUSINESS_REGISTRATION", filename: "reg.pdf", contentType: "application/pdf", bytes: 3_210 });
        ctx.onboarding = g.document.id;
        return g.uploadUrl;
      },
      confirm: () => confirmDocumentUpload(issueOnboardingToken(`pu_onb_draft_${R}`), ctx.onboarding!),
      confirmed: async () => Boolean((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: ctx.onboarding! }, select: { uploadedAt: true } })).uploadedAt),
    },
    {
      name: "organisation document (the property portal)", type: "image/png", bytes: 4_321,
      grant: async () => {
        const g = await requestOrganizationUpload(manager, { kind: "OTHER", filename: "extra.png", contentType: "image/png", bytes: 4_321 });
        ctx.org = g.document.id;
        return g.uploadUrl;
      },
      confirm: () => confirmOrganizationUpload(manager, ctx.org!),
      confirmed: async () => Boolean((await prisma.onboardingDocument.findUniqueOrThrow({ where: { id: ctx.org! }, select: { uploadedAt: true } })).uploadedAt),
    },
    {
      name: "sponsor-request proof of business", type: "application/pdf", bytes: 5_432,
      grant: async () => {
        const g = await requestSponsorDocumentUpload(issueSponsorRequestToken(`pu_inquiry_${R}`), { filename: "licence.pdf", contentType: "application/pdf", bytes: 5_432 });
        ctx.inquiry = g.document.id;
        return g.uploadUrl;
      },
      confirm: () => confirmSponsorDocumentUpload(issueSponsorRequestToken(`pu_inquiry_${R}`), ctx.inquiry!),
      confirmed: async () => Boolean((await prisma.inquiryDocument.findUniqueOrThrow({ where: { id: ctx.inquiry! }, select: { uploadedAt: true } })).uploadedAt),
    },
    {
      name: "guardian hand-off document", type: "image/jpeg", bytes: 6_543,
      grant: async () => {
        const g = await requestHandoffDocumentUpload(issuePurposeToken("handoff", `pu_handoff_${R}`), { kind: "GUARDIAN_ID", filename: "id.jpg", contentType: "image/jpeg", bytes: 6_543 });
        ctx.handoff = g.document.id;
        return g.uploadUrl;
      },
      confirm: () => confirmHandoffDocumentUpload(issuePurposeToken("handoff", `pu_handoff_${R}`), ctx.handoff!),
      confirmed: async () => Boolean((await prisma.guardianHandoffDocument.findUniqueOrThrow({ where: { id: ctx.handoff! }, select: { uploadedAt: true } })).uploadedAt),
    },
    {
      name: "support attachment", type: "image/png", bytes: 7_654,
      grant: async () => {
        const g = await submitSupportMessage({ name: "PU Person", email: `pu-person-${R}@pu.invalid`, topic: "ACCOUNT", message: "Help with my account", attachments: [{ filename: "screen.png", contentType: "image/png", bytes: 7_654 }] });
        ctx.supportToken = g.token!;
        ctx.support = g.uploads[0]!.attachmentId;
        return g.uploads[0]!.uploadUrl;
      },
      confirm: () => sendSupportMessage(ctx.supportToken!),
      confirmed: async () => Boolean((await prisma.supportAttachment.findUniqueOrThrow({ where: { id: ctx.support! }, select: { uploadedAt: true } })).uploadedAt),
    },
    {
      name: "profile-change ID (a new legal name)", type: "application/pdf", bytes: 8_765,
      grant: async () => {
        const g = await submitProfileChange(athlete, `pu_athlete_${R}`, {
          identity: { legalName: "PU Athlete Renamed" }, idDocument: { filename: "passport.pdf", contentType: "application/pdf", bytes: 8_765 },
        });
        ctx.change = g.idUpload!.changeId;
        return g.idUpload!.uploadUrl;
      },
      confirm: () => confirmLegalNameDocument(athlete, ctx.change!),
      confirmed: async () => (await prisma.athleteProfileChange.findUniqueOrThrow({ where: { id: ctx.change! }, select: { state: true } })).state === "APPROVED",
    },
    {
      name: "delivery proof (the seller marking a line delivered)", type: "image/jpeg", bytes: 9_876,
      grant: async () => {
        const g = await requestProofUpload(manager, `pu_line_${R}`, { contentType: "image/jpeg", bytes: 9_876 });
        ctx.proof = g.key;
        return g.uploadUrl;
      },
      confirm: () => markDelivered(manager, `pu_line_${R}`, { note: "Hung at the home game.", proofKey: ctx.proof! }),
      confirmed: async () => (await prisma.orderLineDelivery.findUniqueOrThrow({ where: { id: `pu_delivery_${R}` }, select: { state: true } })).state === "DELIVERED",
    },
    {
      name: "deliverable creative (registering the upload is its confirm)", type: "image/png", bytes: 12_345,
      grant: async () => {
        const g = await presignCreativeUpload(athlete, `pu_deliverable_${R}`, "image/png", 12_345);
        ctx.creative = g.key;
        return g.url;
      },
      confirm: () => registerCreativeAsset(athlete, `pu_deliverable_${R}`, ctx.creative!),
      confirmed: async () => (await prisma.creativeAsset.count({ where: { tenantId: T, deliverableId: `pu_deliverable_${R}`, r2Key: ctx.creative! } })) === 1,
    },
    {
      name: "ad artwork (registering the upload is its confirm)", type: "image/png", bytes: 23_456,
      grant: async () => {
        const g = await presignArtworkUpload(sponsorAdmin, `pu_slot_${R}`, "image/png", 23_456);
        ctx.artwork = g.key;
        return g.url;
      },
      confirm: () => registerArtwork(sponsorAdmin, `pu_slot_${R}`, { r2Key: ctx.artwork! }),
      confirmed: async () => (await prisma.editionAsset.count({ where: { tenantId: T, adSlotId: `pu_slot_${R}`, r2Key: ctx.artwork! } })) === 1,
    },
  ];

  for (const flow of FLOWS) {
    it(`${flow.name}: the URL is pinned, a wrong file is refused and deleted, the right one is accepted`, async () => {
      const url = await flow.grant();
      const key = keyOf(url);
      const id = `${BUCKET}/${key}`;
      const right = Buffer.alloc(flow.bytes, 7);

      /* 1. Signed for one type and one size. */
      expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");

      /* 2. The bucket refuses any other type, or any other length, sent with this URL. */
      expect((await put(url, "text/html", right)).status).toBe(403);
      expect((await put(url, flow.type, Buffer.alloc(flow.bytes + 1, 7))).status).toBe(403);
      expect((await put(url, flow.type, Buffer.alloc(flow.bytes - 1, 7))).status).toBe(403);
      expect(store.objects.has(id)).toBe(false);

      /* 3. A wrong TYPE that reached the bucket anyway: refused on confirm, deleted, audited. */
      store.objects.set(id, { body: right, type: "text/html" });
      await expect(flow.confirm()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/isn't the type of file that was asked for, so it was removed/) });
      expect(store.objects.has(id)).toBe(false);
      expect(await flow.confirmed()).toBe(false);

      /* 4. A wrong SIZE that reached the bucket anyway: the same. */
      store.objects.set(id, { body: Buffer.alloc(flow.bytes + 10, 7), type: flow.type });
      await expect(flow.confirm()).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/isn't the size that was declared, so it was removed/) });
      expect(store.objects.has(id)).toBe(false);
      expect(await flow.confirmed()).toBe(false);

      const refusals = await prisma.auditLog.findMany({
        where: { tenantId: T, action: "storage.privateUploadRefused", after: { path: ["key"], equals: key } },
        select: { after: true }, orderBy: { at: "asc" },
      });
      expect(refusals.map((r) => r.after)).toEqual([
        expect.objectContaining({ problem: "type", deleted: true, arrived: { contentType: "text/html", bytes: flow.bytes }, expected: expect.objectContaining({ contentType: flow.type, bytes: flow.bytes }) }),
        expect.objectContaining({ problem: "size", deleted: true, arrived: { contentType: flow.type, bytes: flow.bytes + 10 } }),
      ]);

      /* 5. The right file, through the URL: stored, and the confirm accepts it. */
      expect((await put(url, flow.type, right)).status).toBe(200);
      expect(store.objects.get(id)).toMatchObject({ type: flow.type });
      await flow.confirm();
      expect(await flow.confirmed()).toBe(true);
      expect(store.objects.has(id)).toBe(true);
    });
  }

  it("covers every private presign in src/ — no grant is left unpinned", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(import.meta.dirname, "../src/domain");
    const unpinned: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const s = readFileSync(join(dir, f), "utf8");
      for (const m of s.matchAll(/presignPrivateUpload\(/g)) {
        let i = m.index! + m[0].length;
        let depth = 1;
        while (depth && i < s.length) {
          if (s[i] === "(") depth++;
          else if (s[i] === ")") depth--;
          i++;
        }
        const call = s.slice(m.index!, i);
        if (!/signContentType: true/.test(call) || !/contentLength/.test(call)) unpinned.push(`${f}:${s.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(unpinned).toEqual([]);
  });
});
