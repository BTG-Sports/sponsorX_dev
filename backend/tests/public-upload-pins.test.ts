/* --------------------------------------------------------------------------
   POL-BE-110 / POL-BE-111 — every PUBLIC upload, driven with a real file.

   No storage mock: the API presigns against a real S3 endpoint that checks
   presigned signatures the way R2 does (tests/support/object-store.ts), and
   each flow runs as a browser runs it — grant → PUT to the signed URL → save:
     - the URL is signed for one type and one size; any other is refused;
     - a file that never arrived is refused, and nothing is saved;
     - a wrong TYPE or SIZE that got into the bucket anyway is refused on
       save AND deleted (the public bucket serves it to anyone);
     - the right file is accepted, and the record points at it.
   The team or school logo, the sponsor's logo and the athlete's profile photo.
   -------------------------------------------------------------------------- */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const R = randomBytes(3).toString("hex");
const T = `pp_tenant_${R}`;
const previousEndpoint = process.env.S3_ENDPOINT;
vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));

const { startObjectStore } = await import("./support/object-store");
const store = await startObjectStore();
process.env.S3_ENDPOINT = store.endpoint;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-110/111 · public uploads are pinned, and checked when saved", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const storage = await import("../src/lib/storage");
  const { requestLogoUpload, updateBranding } = await import("../src/domain/branding");
  const { requestSponsorLogoUpload, updateCompany } = await import("../src/domain/sponsor-account");
  const { requestPhotoUpload, setAthletePhoto } = await import("../src/domain/home-featured");
  store.verifyWith(storage.s3);
  const BUCKET = storage.BUCKETS.public;

  const base = { sponsorId: null, athleteId: null, guardianId: null, propertyId: null, studentId: null };
  const btg = { ...base, userId: `pp_btg_${R}`, tenantId: T, roles: ["BTG_ADMIN" as const] };
  const sponsorAdmin = { ...base, userId: `pp_sp_${R}`, tenantId: T, roles: ["SPONSOR_ADMIN" as const], sponsorId: `pp_sponsor_${R}` };
  const athlete = { ...base, userId: `pp_ath_${R}`, tenantId: T, roles: ["ATHLETE" as const], athleteId: `pp_athlete_${R}` };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: T } }).catch(() => {});
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "PP Tenant" } });
    await prisma.sponsor.create({ data: { id: `pp_sponsor_${R}`, tenantId: T, name: "PP Sponsor" } });
    await prisma.athlete.create({ data: {
      id: `pp_athlete_${R}`, tenantId: T, slug: `pp-athlete-${R}`, legalName: "PP Athlete", displayName: "PPA", email: `pp-a-${R}@pp.invalid`,
      sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.user.createMany({ data: [
      { id: btg.userId, tenantId: T, clerkId: btg.userId, email: `pp-btg-${R}@pp.invalid`, roles: ["BTG_ADMIN"] },
      { id: sponsorAdmin.userId, tenantId: T, clerkId: sponsorAdmin.userId, email: `pp-sp-${R}@pp.invalid`, roles: ["SPONSOR_ADMIN"], sponsorId: `pp_sponsor_${R}` },
      { id: athlete.userId, tenantId: T, clerkId: athlete.userId, email: `pp-a-${R}@pp.invalid`, roles: ["ATHLETE"], athleteId: `pp_athlete_${R}` },
    ] });
  });

  afterAll(async () => {
    await wipe();
    await store.close();
    if (previousEndpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = previousEndpoint;
  });

  const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname).replace(new RegExp(`^/${BUCKET}/`), "");
  const put = (url: string, type: string, body: Buffer) => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });

  type Flow = {
    name: string; type: string; bytes: number;
    grant: () => Promise<string>;
    save: (key: string) => Promise<unknown>;
    saved: () => Promise<string | null>;
  };
  const FLOWS: Flow[] = [
    {
      name: "team or school logo (branding)", type: "image/png", bytes: 4_321,
      grant: async () => (await requestLogoUpload(btg, { contentType: "image/png", bytes: 4_321 })).uploadUrl,
      save: (key) => updateBranding(btg, { logoKey: key }),
      saved: async () => (await prisma.tenantBranding.findUnique({ where: { tenantId: T }, select: { logoKey: true } }))?.logoKey ?? null,
    },
    {
      name: "sponsor logo (POL-BE-102's Account page)", type: "image/jpeg", bytes: 5_432,
      grant: async () => (await requestSponsorLogoUpload(sponsorAdmin, { contentType: "image/jpeg", bytes: 5_432 })).uploadUrl,
      save: (key) => updateCompany(sponsorAdmin, { logoKey: key }),
      saved: async () => (await prisma.sponsor.findUniqueOrThrow({ where: { id: `pp_sponsor_${R}` }, select: { logoKey: true } })).logoKey,
    },
    {
      name: "athlete profile photo", type: "image/webp", bytes: 6_543,
      grant: async () => (await requestPhotoUpload(athlete, `pp_athlete_${R}`, { contentType: "image/webp", bytes: 6_543 })).uploadUrl,
      save: (key) => setAthletePhoto(athlete, `pp_athlete_${R}`, key),
      saved: async () => (await prisma.athlete.findUniqueOrThrow({ where: { id: `pp_athlete_${R}` }, select: { photoKey: true } })).photoKey,
    },
  ];

  for (const flow of FLOWS) {
    it(`${flow.name}: pinned, a missing or wrong file refused (and deleted), the right one saved`, async () => {
      const url = await flow.grant();
      const key = keyOf(url);
      const id = `${BUCKET}/${key}`;
      const right = Buffer.alloc(flow.bytes, 7);

      /* 1. Signed for one type and one size; the bucket refuses anything else. */
      expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
      expect((await put(url, "text/html", right)).status).toBe(403);
      expect((await put(url, flow.type, Buffer.alloc(flow.bytes + 1, 7))).status).toBe(403);
      expect(store.objects.has(id)).toBe(false);

      /* 2. Nothing arrived: refused, nothing saved. */
      await expect(flow.save(key)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/hasn't arrived yet/) });
      expect(await flow.saved()).toBeNull();

      /* 3. A wrong TYPE got in anyway: refused on save, and deleted from the public bucket. */
      store.objects.set(id, { body: right, type: "text/html" });
      await expect(flow.save(key)).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/isn't the type of file that was asked for, so it was removed/) });
      expect(store.objects.has(id)).toBe(false);
      expect(await flow.saved()).toBeNull();

      /* 4. Too big: the same. */
      store.objects.set(id, { body: Buffer.alloc(6 * 1024 * 1024, 7), type: flow.type });
      await expect(flow.save(key)).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/isn't the size that was declared, so it was removed/) });
      expect(store.objects.has(id)).toBe(false);
      expect(await flow.saved()).toBeNull();

      /* 5. The right file, through the URL: stored, and saved. */
      expect((await put(url, flow.type, right)).status).toBe(200);
      await flow.save(key);
      expect(await flow.saved()).toBe(key);
      expect(store.objects.has(id)).toBe(true);
    });
  }
});
