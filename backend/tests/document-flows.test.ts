import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { stopReader } from "../src/lib/ocr";
import { idCard, ID_LINES, spoil, textPdf } from "./support/document-fixtures";

/* --------------------------------------------------------------------------
   P8-BE-09 · P8-BE-10 · P8-BE-11 — the document checks, through every flow
   that takes a document, against the real API and database. The unit half
   (what a picture measures, what the rules say) is document-checks.test.ts;
   this file proves the flows use it. Done when:

   BE-09  Every document upload is opened at its confirm step: a dark or
          blurred photo is refused 422 with the words the person acts on —
          the athlete's sign-up ID, the guardian's ID, the ID for a new legal
          name, the new guardian's handoff ID, an organisation's paper, a
          sponsor's proof of business, a dispute document and a delivery
          photo. The refused file is deleted and the refusal audited
          (`storage.privateUploadRefused`, problem "unusable").
   BE-11  What a document says is read and compared with the record: an ID
          naming someone else holds the athlete's sign-up, the guardian's
          ward, a new legal name, a sponsor request, an organisation's
          approval and a guardian handoff for BTG, with "Document check — …"
          reasons; a clear one goes through automatically. BTG applies or
          declines a held legal name; nobody else can.
   BE-10  BTG sends one document back with a reason, in each of the five
          flows: it stops counting, its file is deleted, the person is
          emailed the reason and their upload link, BTG's view shows it
          returned, and the flow waits for the person again. Only BTG of the
          same tenant can, and only with a reason.

   The private bucket is a map the test fills when it "PUTs" a file; the
   confirm step's check runs the REAL inspection on those bytes, and the
   reading is real OCR (tesseract, on this machine). One test runs the real
   checkPrivateUpload against an in-process S3 (tests/support/object-store)
   for the delete and the audit row.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";
process.env.PUBLIC_INTAKE_TENANT_ID = "df_btg";

type Stored = { bytes: Buffer; type: string };
type Expected = { contentType: string; bytes?: number | null; maxBytes: number; document?: boolean };
const h = vi.hoisted(() => ({
  files: new Map<string, { bytes: Buffer; type: string }>(),
  /** Every confirm-step check: the key, and whether it was opened as a document. */
  calls: [] as { key: string; document: boolean }[],
  deleted: [] as string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the real module, kept for the one test of the real check
  real: null as any,
}));

/* The private bucket: a key is "in the bucket" once the test PUTs bytes to
   it. A document is opened with the real inspection, exactly as the real
   check does after its HEAD and GET. Deleting is recorded. */
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  h.real = real;
  return {
    ...real,
    checkPrivateUpload: async (_actor: unknown, key: string, expected: Expected) => {
      h.calls.push({ key, document: expected.document === true });
      const f: Stored | undefined = h.files.get(key);
      if (!f) return { ok: false as const, problem: "missing" as const };
      if (!expected.document) return { ok: true as const, bytes: f.bytes.length };
      const { inspectDocument } = await import("../src/lib/document-inspect");
      const r = await inspectDocument(f.bytes, expected.contentType);
      if (r.ok) return { ok: true as const, bytes: f.bytes.length, document: r.document };
      h.files.delete(key);
      return { ok: false as const, problem: "unusable" as const, fileProblem: r.problem, reason: r.reason };
    },
    deletePrivateObject: async (key: string) => {
      h.deleted.push(key);
      h.files.delete(key);
    },
  };
});
vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: req.get("x-test-email") ?? `${id}@df-test.invalid` } : null;
  },
}));

/* The one test of the real check needs an S3 to HEAD, GET and DELETE: the
   API's client reads S3_ENDPOINT when storage.ts is first imported, below. */
const { startObjectStore } = await import("./support/object-store");
const store = await startObjectStore();
const previousEndpoint = process.env.S3_ENDPOINT;
process.env.S3_ENDPOINT = store.endpoint;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

/* The pictures and papers. Nothing here is a real person's document. */
const otherPersonId = (dob = "03/14/2005") => idCard(["STATE OF OHIO DRIVER LICENSE", "OKAFOR, BEATRIX Q", `DOB ${dob}`, "EXP 03/14/2029", "4d DL 0098-765-432"]);
const darkPhoto = async () => spoil.dark(await idCard(ID_LINES));
const blurredPhoto = async () => spoil.blurred(await idCard(ID_LINES));
const DARK_WORDS = /^That photo is too dark to read\. Retake it in good light/;
const BLUR_WORDS = /^That photo is blurred\. Hold the camera still/;

afterAll(async () => {
  await stopReader();
  await store.close();
  if (previousEndpoint === undefined) delete process.env.S3_ENDPOINT;
  else process.env.S3_ENDPOINT = previousEndpoint;
});

describe.skipIf(!hasDatabase)("P8-BE-09 / -10 / -11 · documents checked, read and sent back, through every flow", { timeout: 300_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");

  const T = "df_btg";
  const T2 = "df_other";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  type Mail = { template: string; to: string; data: Record<string, string>; idempotencyKey: string };
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as Mail);
  const mailTo = async (template: string, to: string) => (await emails()).filter((m) => m.template === template && m.to === to);

  /** The browser's PUT: the bytes land under the key the grant named. */
  const put = (key: string, bytes: Buffer, type: string) => h.files.set(key, { bytes, type });
  /** The confirm step opened this key as a document (P8-BE-09), every time it was checked. */
  const openedAsDocument = (key: string) => {
    const seen = h.calls.filter((c) => c.key === key);
    expect(seen.length, key).toBeGreaterThan(0);
    expect(seen.every((c) => c.document), key).toBe(true);
  };
  /** The send-back email: the reason, the person's upload link, and the template renders both. */
  const sentBackMail = async (to: string, reason: string, link: RegExp) => {
    const mails = await mailTo("document.sentBack", to);
    expect(mails.length, `document.sentBack to ${to}`).toBeGreaterThan(0);
    const m = mails.at(-1)!;
    expect(m.data).toMatchObject({ reason, uploadUrl: expect.stringMatching(link) });
    const rendered = EMAIL_TEMPLATES["document.sentBack"]!(m.data);
    expect(rendered.text).toContain(reason);
    expect(rendered.text).toContain(m.data.uploadUrl);
    return m;
  };
  const SHORT = { reason: "no" };

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    const provisioned = (await prisma.$queryRawUnsafe<{ tenantId: string }[]>(
      `SELECT p."tenantId" FROM "PropertyOnboarding" o JOIN "Property" p ON p.id = o."propertyId" WHERE o."tenantId" = $1 AND p."tenantId" <> $1`, T,
    )).map((r) => r.tenantId);
    const ids = [T, T2, ...provisioned];
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "DF BTG" }, { id: T2, name: "DF Other BTG" }] });
    const { versionInForce } = await import("./support/agreements");
    await prisma.agreement.create({ data: { id: "df_terms", tenantId: T, kind: "PROPERTY_TERMS", version: versionInForce("PROPERTY_TERMS"), bodyHash: "f".repeat(64), effectiveAt: new Date("2026-09-01") } });
    /* The legal-name athlete, the handoff family, a dispute, and a sold line to deliver. */
    await prisma.guardian.create({ data: { id: "df_g_carla", tenantId: T, legalName: "Carla Diaz", email: "df_carla@df-test.invalid", relationship: "PARENT", verifiedAt: new Date() } });
    await prisma.athlete.createMany({ data: [
      { id: "df_lena", tenantId: T, slug: "df-lena", legalName: "Ardinia Smith", displayName: "Ardinia", email: "df_lena@df-test.invalid", sport: "Soccer", birthDate: new Date("2005-03-14"), state: "ACTIVE" },
      { id: "df_mateo", tenantId: T, slug: "df-mateo", legalName: "Mateo Diaz", displayName: "Mateo Diaz", email: "df_mateo@df-test.invalid", sport: "Basketball", birthDate: new Date("2012-04-01"), state: "ACTIVE", guardianId: "df_g_carla" },
      { id: "df_ada", tenantId: T, slug: "df-ada", legalName: "Ada Okoye", displayName: "Ada", email: "df_ada@df-test.invalid", sport: "Track", birthDate: new Date("2000-05-05"), stateCode: "VA", state: "ACTIVE", emailConfirmedAt: new Date() },
    ] });
    await prisma.sponsor.create({ data: { id: "df_sponsor", tenantId: T, name: "Pier Coffee" } });
    await prisma.property.create({ data: { id: "df_prop", tenantId: T, slug: "df-prop", name: "DF School", kind: "SCHOOL" } });
    await prisma.user.createMany({ data: [
      { id: "df_admin", tenantId: T, clerkId: "df_admin", email: "df_admin@df-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "df_admin2", tenantId: T2, clerkId: "df_admin2", email: "df_admin2@df-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "df_u_sponsor", tenantId: T, clerkId: "df_sponsor", email: "df_sp@df-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "df_sponsor" },
      { id: "df_u_lena", tenantId: T, clerkId: "df_lena", email: "df_lena@df-test.invalid", roles: ["ATHLETE"], athleteId: "df_lena" },
      { id: "df_u_carla", tenantId: T, clerkId: "df_carla", email: "df_carla@df-test.invalid", roles: ["GUARDIAN"], guardianId: "df_g_carla" },
      { id: "df_u_ada", tenantId: T, clerkId: "df_ada", email: "df_ada@df-test.invalid", roles: ["ATHLETE"], athleteId: "df_ada" },
      { id: "df_u_pm", tenantId: T, clerkId: "df_pm", email: "df_pm@df-test.invalid", roles: ["PROPERTY_MGR"], propertyId: "df_prop" },
    ] });
    await prisma.nilJob.create({ data: { id: "df_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaign.create({ data: { id: "df_campaign", tenantId: T, sponsorId: "df_sponsor", name: "Spring", budget: 500_000, startDate: new Date(), endDate: new Date(Date.now() + 90 * 864e5), state: "ACTIVE" } });
    await prisma.campaignOrder.create({ data: {
      id: "df_order_ada", tenantId: T, campaignId: "df_campaign", athleteId: "df_ada", jobId: "df_job", compensation: 20_000, sellPrice: 40_000,
      usageRights: "90 days", dueDate: new Date(Date.now() + 30 * 864e5), state: "ACTIVE",
    } });
    const far = new Date(Date.now() + 3650 * 864e5);
    await prisma.inventoryItem.create({ data: { id: "df_item", tenantId: T, propertyId: "df_prop", title: "DF Banner", kind: "SIGNAGE", priceCents: 9000 } });
    await prisma.listing.create({ data: { id: "df_listing", tenantId: T, propertyId: "df_prop", inventoryItemId: "df_item", title: "DF Banner", description: "A banner", state: "PUBLISHED", publishedAt: new Date() } });
    await prisma.cart.create({ data: { id: "df_cart", tenantId: T, sponsorId: "df_sponsor", expiresAt: far } });
    await prisma.reservation.create({ data: { id: "df_res", tenantId: T, sponsorId: "df_sponsor", cartId: "df_cart", state: "CONVERTED", convertedAt: new Date(), expiresAt: far } });
    await prisma.marketplaceOrder.create({ data: {
      id: "df_morder", tenantId: T, sponsorId: "df_sponsor", reservationId: "df_res", state: "IN_DELIVERY",
      subtotalCents: 9000, feesCents: 0, totalCents: 9000, requiresApproval: false, approvalReasons: [],
      lines: { create: [{
        id: "df_line", tenantId: T, listingId: "df_listing", inventoryItemId: "df_item", itemTenantId: T, propertyId: "df_prop", title: "DF Banner",
        quantity: 1, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-01-02"), unitPriceCents: 9000, lineTotalCents: 9000,
      }] },
    } });
    await prisma.orderLineDelivery.create({ data: {
      id: "df_delivery", tenantId: T, orderId: "df_morder", lineId: "df_line", sponsorId: "df_sponsor", propertyId: "df_prop", propertyTenantId: T, state: "IN_DELIVERY",
    } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ═════════════════════ P8-BE-09 · the real check ═════════════════════ */

  it("BE-09 · the real confirm-step check opens the file: an unusable one is deleted and audited with the reason; a usable one is handed on", async () => {
    const storage = h.real as typeof import("../src/lib/storage");
    const actor = { userId: null, tenantId: T };
    const dark = await darkPhoto();
    const key = "df/probe/dark-id.png";
    store.objects.set(`${storage.BUCKETS.private}/${key}`, { body: dark, type: "image/png" });
    const r = await storage.checkPrivateUpload(actor, key, { contentType: "image/png", bytes: dark.length, maxBytes: 10 * 1024 * 1024, document: true }, { entity: "AccountDocument", entityId: "df_probe" });
    expect(r).toMatchObject({ ok: false, problem: "unusable", fileProblem: "too_dark", reason: expect.stringMatching(DARK_WORDS) });
    expect(store.objects.has(`${storage.BUCKETS.private}/${key}`)).toBe(false);
    const refused = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "storage.privateUploadRefused", entityId: "df_probe" }, select: { after: true } });
    expect(refused.after).toMatchObject({ key, problem: "unusable", fileProblem: "too_dark", deleted: true, reason: expect.stringMatching(DARK_WORDS) });
    expect(storage.uploadRefusal(r as Extract<typeof r, { ok: false }>, "Your ID")).toMatch(DARK_WORDS);

    const good = await idCard(ID_LINES);
    const okKey = "df/probe/good-id.png";
    store.objects.set(`${storage.BUCKETS.private}/${okKey}`, { body: good, type: "image/png" });
    const ok = await storage.checkPrivateUpload(actor, okKey, { contentType: "image/png", bytes: good.length, maxBytes: 10 * 1024 * 1024, document: true }, { entity: "AccountDocument", entityId: "df_probe_ok" });
    expect(ok).toMatchObject({ ok: true, bytes: good.length, document: { pictures: [expect.any(Buffer)] } });
    expect(store.objects.has(`${storage.BUCKETS.private}/${okKey}`)).toBe(true);
  });

  /* ═══════════════════ the athlete's sign-up (BE-09/10/11) ══════════════ */

  type Applied = { id: string; token: string; email: string };
  const q = (token: string) => `?token=${encodeURIComponent(token)}`;
  const apply = async (b: { name: string; email: string; birthDate: string; guardian?: Record<string, string> }): Promise<Applied> => {
    const r = await call("POST", "/applications/intake", undefined, {
      legalName: b.name, displayName: b.name, email: b.email, birthDate: b.birthDate, stateCode: "MD", sport: "Basketball",
      socials: [{ platform: "INSTAGRAM", handle: "h" }], ...(b.guardian ? { guardian: b.guardian } : {}),
    });
    expect(r.status, r.text).toBe(201);
    const a = { id: r.json.id as string, token: r.json.continuationToken as string, email: b.email.toLowerCase() };
    const [mail] = await mailTo("athlete.applicationReceived", a.email);
    const t = new URL(mail!.data.confirmUrl!).searchParams.get("t")!;
    expect((await call("POST", "/applications/intake/confirm-email", undefined, { token: t })).status).toBe(200);
    return a;
  };
  /** Grant, PUT, confirm: the confirm's response, and the document's id and key. */
  const uploadId = async (a: Applied, bytes: Buffer, type: string, kind: "GOVERNMENT_ID" | "SCHOOL_ID" = "GOVERNMENT_ID") => {
    const up = await call("POST", `/applications/intake/documents${q(a.token)}`, undefined, { kind, filename: `id.${type.split("/")[1]}`, contentType: type, bytes: bytes.length });
    expect(up.status, up.text).toBe(201);
    const id = up.json.document.id as string;
    const { r2Key } = await prisma.accountDocument.findUniqueOrThrow({ where: { id }, select: { r2Key: true } });
    put(r2Key, bytes, type);
    const done = await call("POST", `/applications/intake/documents/${id}/confirm${q(a.token)}`);
    openedAsDocument(r2Key);
    return { done, id, r2Key };
  };
  const athleteRow = (id: string) => prisma.athlete.findUniqueOrThrow({ where: { id }, select: { state: true, autoApproved: true, reviewReasons: true, legalName: true } });

  let ardinia: Applied;
  let flaggedDoc = { id: "", r2Key: "" };
  it("BE-09 · a sign-up ID too dark to read is refused 422 in words, deleted, and never counts", async () => {
    ardinia = await apply({ name: "Ardinia Townes", email: "df_ardinia@df-test.invalid", birthDate: "2005-03-14" });
    const { done, id, r2Key } = await uploadId(ardinia, await darkPhoto(), "image/png");
    expect(done.status, done.text).toBe(422);
    expect(done.json.error.message).toMatch(DARK_WORDS);
    expect(h.files.has(r2Key)).toBe(false);
    expect((await prisma.accountDocument.findUniqueOrThrow({ where: { id }, select: { uploadedAt: true, checkState: true } }))).toEqual({ uploadedAt: null, checkState: null });
    const st = await call("GET", `/applications/intake/status${q(ardinia.token)}`);
    expect(st.json.missing).toEqual(["upload your government ID"]);
  });

  it("BE-11 · an ID naming someone else holds the sign-up for BTG, with a Document-check reason; BTG's desk shows what reading it found", async () => {
    const { done, id, r2Key } = await uploadId(ardinia, await otherPersonId(), "image/png");
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ approved: false });
    flaggedDoc = { id, r2Key };
    const row = await athleteRow(ardinia.id);
    expect(row.state).toBe("SUBMITTED");
    expect(row.reviewReasons).toContain("Document check — Athlete's government ID: The athlete (Ardinia Townes) isn't named on it");
    expect(row.reviewReasons.every((r) => r.startsWith("Document check — Athlete's government ID:"))).toBe(true);
    expect(await prisma.accountDocument.findUniqueOrThrow({ where: { id }, select: { checkState: true, checkedAt: true } })).toMatchObject({ checkState: "FLAGGED", checkedAt: expect.any(Date) });
    /* BTG is told why. */
    const told = (await mailTo("signup.newSignup", "df_admin@df-test.invalid")).find((m) => m.data.name === "Ardinia Townes");
    expect(told?.data.outcome).toBe("needs your review");

    const desk = await call("GET", `/signups/athletes/${ardinia.id}`, "df_admin");
    expect(desk.status, desk.text).toBe(200);
    expect(desk.json.reasons).toEqual(row.reviewReasons);
    const doc = desk.json.documents.find((d: { id: string }) => d.id === id);
    expect(doc).toMatchObject({ viewable: true, returned: null, check: { state: "FLAGGED", findings: expect.arrayContaining(["The athlete (Ardinia Townes) isn't named on it"]), checkedAt: expect.any(String) } });
  });

  it("BE-10 · only BTG of this tenant sends a sign-up document back, and only with a reason", async () => {
    const path = `/signups/athletes/${ardinia.id}/documents/${flaggedDoc.id}/send-back`;
    const why = { reason: "This ID names someone else — upload your own government ID." };
    expect((await call("POST", path, "df_sponsor", why)).status).toBe(403);
    expect((await call("POST", path, "df_lena", why)).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", why)).status);
    expect((await call("POST", path, "df_admin", SHORT)).status).toBe(400);
    expect((await call("POST", path, "df_admin", {})).status).toBe(400);
    expect(await prisma.accountDocument.findUniqueOrThrow({ where: { id: flaggedDoc.id }, select: { returnedAt: true } })).toEqual({ returnedAt: null });
    expect(h.deleted).not.toContain(flaggedDoc.r2Key);
  });

  it("BE-10 · BTG sends the ID back: it stops counting, its file is deleted, the athlete is emailed their sign-up link, and the sign-up waits for them again", async () => {
    const reason = "This ID names someone else — upload your own government ID.";
    const r = await call("POST", `/signups/athletes/${ardinia.id}/documents/${flaggedDoc.id}/send-back`, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(r.json.documents.find((d: { id: string }) => d.id === flaggedDoc.id)).toMatchObject({ viewable: false, returned: { at: expect.any(String), reason } });
    expect(await prisma.accountDocument.findUniqueOrThrow({ where: { id: flaggedDoc.id }, select: { returnedAt: true, returnedReason: true, returnedBy: true } }))
      .toEqual({ returnedAt: expect.any(Date), returnedReason: reason, returnedBy: "df_admin" });
    expect(h.deleted).toContain(flaggedDoc.r2Key);
    const row = await athleteRow(ardinia.id);
    expect(row).toMatchObject({ state: "SUBMITTED", reviewReasons: [] });
    const st = await call("GET", `/applications/intake/status${q(ardinia.token)}`);
    expect(st.json.missing).toEqual(["upload your government ID"]);
    await sentBackMail("df_ardinia@df-test.invalid", reason, /\/join\/confirm\?t=/);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "document.sentBack", entityId: flaggedDoc.id, actorId: "df_admin" } })).toBe(1);
    /* Once only; the file is gone, so BTG's link and the athlete's confirm both refuse it. */
    expect((await call("POST", `/signups/athletes/${ardinia.id}/documents/${flaggedDoc.id}/send-back`, "df_admin", { reason })).status).toBe(409);
    expect((await call("GET", `/signups/athletes/${ardinia.id}/documents/${flaggedDoc.id}`, "df_admin")).status).toBeGreaterThanOrEqual(400);
    expect((await call("POST", `/applications/intake/documents/${flaggedDoc.id}/confirm${q(ardinia.token)}`)).status).toBe(409);
  });

  it("BE-11 · then a clear ID — a phone photo, read by OCR — and the sign-up is approved automatically", async () => {
    const { done, id } = await uploadId(ardinia, await spoil.phone(await idCard(ID_LINES)), "image/jpeg");
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ approved: true, missing: [] });
    expect(await athleteRow(ardinia.id)).toMatchObject({ state: "ACTIVE", autoApproved: true, reviewReasons: [] });
    expect((await prisma.accountDocument.findUniqueOrThrow({ where: { id }, select: { checkState: true } })).checkState).toBe("CLEAR");
  });

  it("BE-11 · a clear ID the first time is approved with no BTG step (no regression)", async () => {
    const quentin = await apply({ name: "Quentin Marlowe", email: "df_quentin@df-test.invalid", birthDate: "2001-06-02" });
    const card = await idCard(["STATE OF MARYLAND DRIVER LICENSE", "MARLOWE, QUENTIN R", "DOB 06/02/2001", "EXP 06/02/2030", "DL M-123-456-789"]);
    const { done, id } = await uploadId(quentin, card, "image/png");
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ approved: true });
    expect(await athleteRow(quentin.id)).toMatchObject({ state: "ACTIVE", autoApproved: true, reviewReasons: [] });
    const desk = await call("GET", `/signups/athletes/${quentin.id}`, "df_admin");
    expect(desk.json.documents.find((d: { id: string }) => d.id === id)).toMatchObject({ check: { state: "CLEAR", findings: [] }, returned: null });
  });

  /* ═══════════════════ the guardian's documents (BE-09/10/11) ══════════ */

  let jordan: Applied;
  let carmenToken = "";
  let carmenId = "";
  let guardianIdDoc = { id: "", r2Key: "" };
  const guardianUpload = async (token: string, kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF", bytes: Buffer, type: string) => {
    const up = await call("POST", `/public/guardian-setup/${encodeURIComponent(token)}/documents`, undefined, {
      kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind: "BIRTH_CERTIFICATE" } : {}), filename: `doc.${type.split("/")[1]}`, contentType: type, bytes: bytes.length,
    });
    expect(up.status, up.text).toBe(201);
    const id = up.json.document.id as string;
    const { r2Key } = await prisma.accountDocument.findUniqueOrThrow({ where: { id }, select: { r2Key: true } });
    put(r2Key, bytes, type);
    const done = await call("POST", `/public/guardian-setup/${encodeURIComponent(token)}/documents/${id}/confirm`);
    openedAsDocument(r2Key);
    return { done, id, r2Key };
  };
  const carmenCard = (name = "REYES, CARMEN") => idCard(["STATE OF OHIO DRIVER LICENSE", name, "DOB 01/02/1980", "EXP 01/02/2030", "4d DL 0055-444-333"]);

  it("BE-09 / BE-11 · the guardian's ID: a dark one is refused; one naming someone else holds the minor for BTG; BTG's guardian desk shows the reading", async () => {
    jordan = await apply({
      name: "Jordan Reyes", email: "df_jordan@df-test.invalid", birthDate: `${new Date().getUTCFullYear() - 14}-02-01`,
      guardian: { legalName: "Carmen Reyes", email: "df_carmen@df-test.invalid", relationship: "PARENT" },
    });
    const school = textPdf(["LINCOLN HIGH SCHOOL", "STUDENT IDENTIFICATION CARD 2026-2027", "REYES, JORDAN", "GRADE 9 ATHLETICS"]);
    const sid = await uploadId(jordan, school, "application/pdf", "SCHOOL_ID");
    expect(sid.done.status, sid.done.text).toBe(200);
    expect((await prisma.accountDocument.findUniqueOrThrow({ where: { id: sid.id }, select: { checkState: true } })).checkState).toBe("CLEAR");

    const mail = (await mailTo("guardian.setup", "df_carmen@df-test.invalid")).at(-1)!;
    carmenToken = new URL(mail.data.setupUrl!).searchParams.get("t")!;
    expect((await call("POST", "/public/guardian-setup/open", undefined, { token: carmenToken })).status).toBe(200);
    expect((await call("PATCH", `/public/guardian-setup/${encodeURIComponent(carmenToken)}`, undefined, { legalName: "Carmen Reyes", relationship: "PARENT", phone: "555-0100" })).status).toBe(200);

    const dark = await guardianUpload(carmenToken, "GUARDIAN_ID", await darkPhoto(), "image/png");
    expect(dark.done.status, dark.done.text).toBe(422);
    expect(dark.done.json.error.message).toMatch(DARK_WORDS);

    const wrong = await guardianUpload(carmenToken, "GUARDIAN_ID", await carmenCard("OKAFOR, BEATRIX Q"), "image/png");
    expect(wrong.done.status, wrong.done.text).toBe(200);
    guardianIdDoc = { id: wrong.id, r2Key: wrong.r2Key };
    const proof = await guardianUpload(carmenToken, "GUARDIANSHIP_PROOF", textPdf(["STATE OF OHIO CERTIFICATE OF LIVE BIRTH", "CHILD: JORDAN REYES", "MOTHER: CARMEN REYES", "COUNTY OF FRANKLIN"]), "application/pdf");
    expect(proof.done.status, proof.done.text).toBe(200);
    expect((await prisma.accountDocument.findUniqueOrThrow({ where: { id: proof.id }, select: { checkState: true } })).checkState).toBe("CLEAR");

    const st = await call("GET", `/public/guardian-setup/${encodeURIComponent(carmenToken)}`);
    const accepted = await call("POST", `/public/guardian-setup/${encodeURIComponent(carmenToken)}/accept`, undefined, { agreementId: st.json.agreement.agreementId, bodyHashShown: st.json.agreement.bodyHash });
    expect(accepted.status, accepted.text).toBe(200);

    const row = await athleteRow(jordan.id);
    expect(row.state).toBe("SUBMITTED");
    expect(row.reviewReasons).toContain("Document check — Guardian's government ID: The guardian (Carmen Reyes) isn't named on it");
    carmenId = (await prisma.guardian.findFirstOrThrow({ where: { tenantId: T, email: "df_carmen@df-test.invalid" }, select: { id: true } })).id;
    expect((await prisma.guardian.findUniqueOrThrow({ where: { id: carmenId }, select: { verifiedAt: true } })).verifiedAt).toBeNull();

    const desk = await call("GET", `/signups/guardians/${carmenId}`, "df_admin");
    expect(desk.status, desk.text).toBe(200);
    expect(desk.json.documents.find((d: { id: string }) => d.id === guardianIdDoc.id))
      .toMatchObject({ viewable: true, returned: null, check: { state: "FLAGGED", findings: expect.arrayContaining(["The guardian (Carmen Reyes) isn't named on it"]) } });
  });

  it("BE-10 · BTG sends the guardian's ID back: their set-up link is emailed, the minor waits for the guardian again, and a clear ID approves both", async () => {
    const path = `/signups/guardians/${carmenId}/documents/${guardianIdDoc.id}/send-back`;
    const reason = "This ID isn't yours — upload your own photo ID.";
    expect((await call("POST", path, "df_sponsor", { reason })).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", { reason })).status);
    expect((await call("POST", path, "df_admin", SHORT)).status).toBe(400);
    const r = await call("POST", path, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(r.json.documents.find((d: { id: string }) => d.id === guardianIdDoc.id)).toMatchObject({ viewable: false, returned: { reason } });
    expect(h.deleted).toContain(guardianIdDoc.r2Key);
    expect((await prisma.accountDocument.findUniqueOrThrow({ where: { id: guardianIdDoc.id }, select: { returnedAt: true } })).returnedAt).toEqual(expect.any(Date));
    await sentBackMail("df_carmen@df-test.invalid", reason, /\/guardian\/setup\?t=/);
    const waiting = await athleteRow(jordan.id);
    expect(waiting.state).toBe("SUBMITTED");
    expect(waiting.reviewReasons).toEqual([]);
    const st = await call("GET", `/applications/intake/status${q(jordan.token)}`);
    expect(st.json.missing.join(" ")).toMatch(/guardian/);

    const fresh = await guardianUpload(carmenToken, "GUARDIAN_ID", await carmenCard(), "image/png");
    expect(fresh.done.status, fresh.done.text).toBe(200);
    expect((await prisma.accountDocument.findUniqueOrThrow({ where: { id: fresh.id }, select: { checkState: true } })).checkState).toBe("CLEAR");
    expect(await athleteRow(jordan.id)).toMatchObject({ state: "ACTIVE", reviewReasons: [] });
    expect((await prisma.guardian.findUniqueOrThrow({ where: { id: carmenId }, select: { verifiedAt: true } })).verifiedAt).toEqual(expect.any(Date));
  });

  /* ═════════════════════ a new legal name (BE-09/10/11) ════════════════ */

  /** The athlete asks for a new legal name and uploads the ID for it. */
  const legalName = async (name: string, bytes: Buffer, type = "image/png") => {
    const r = await call("POST", "/athletes/df_lena/profile-changes", "df_lena", {
      identity: { legalName: name }, idDocument: { filename: `id.${type.split("/")[1]}`, contentType: type, bytes: bytes.length },
    });
    expect(r.status, r.text).toBe(201);
    const changeId = r.json.idUpload.changeId as string;
    const key = (await prisma.athleteProfileChange.findUniqueOrThrow({ where: { id: changeId }, select: { idDocumentKey: true } })).idDocumentKey!;
    put(key, bytes, type);
    const done = await call("POST", `/profile-changes/${changeId}/id-document/confirm`, "df_lena");
    openedAsDocument(key);
    return { changeId, key, done };
  };
  const lena = async () => (await prisma.athlete.findUniqueOrThrow({ where: { id: "df_lena" }, select: { legalName: true } })).legalName;
  const change = (id: string) => prisma.athleteProfileChange.findUniqueOrThrow({
    where: { id }, select: { state: true, reviewerNotes: true, idDocumentCheckState: true, idDocumentUploadedAt: true, idDocumentReturnedAt: true, idDocumentReturnedReason: true },
  });

  it("BE-09 · a blurred ID for a new legal name is refused 422 in words; the change keeps waiting for a readable one", async () => {
    const { changeId, key, done } = await legalName("Ardinia Townes", await blurredPhoto());
    expect(done.status, done.text).toBe(422);
    expect(done.json.error).toMatchObject({ code: "id_unreadable", message: expect.stringMatching(BLUR_WORDS) });
    expect(h.files.has(key)).toBe(false);
    expect(await change(changeId)).toMatchObject({ state: "PENDING", idDocumentUploadedAt: null });
    expect(await lena()).toBe("Ardinia Smith");
    expect((await call("POST", `/profile-changes/${changeId}/withdraw`, "df_lena")).status).toBe(200);
  });

  it("BE-11 · a clear ID showing the new name and the date of birth makes it live at once (no regression)", async () => {
    const { changeId, done } = await legalName("Ardinia Townes", await idCard(ID_LINES));
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ state: "APPROVED", idDocumentCheckState: "CLEAR" });
    expect((await change(changeId)).state).toBe("APPROVED");
    expect(await lena()).toBe("Ardinia Townes");
  });

  let heldLane = "";
  it("BE-11 · an ID that doesn't show the new name keeps the change PENDING, the name unchanged, and BTG emailed why", async () => {
    const before = (await mailTo("athlete.sensitiveEdit", "df_admin@df-test.invalid")).length;
    const { changeId, done } = await legalName("Ardinia Lane", await idCard(ID_LINES));
    expect(done.status, done.text).toBe(200);
    expect(done.json).toMatchObject({ state: "PENDING", idDocumentCheckState: "FLAGGED", idDocumentCheckFindings: expect.any(Array) });
    expect(await change(changeId)).toMatchObject({ state: "PENDING", idDocumentUploadedAt: expect.any(Date), idDocumentCheckState: "FLAGGED" });
    expect(await lena()).toBe("Ardinia Townes");
    const told = (await mailTo("athlete.sensitiveEdit", "df_admin@df-test.invalid")).slice(before);
    expect(told).toHaveLength(1);
    expect(told[0]!.data.what).toMatch(/held for you to apply or decline/);
    expect(told[0]!.data.checks).toContain("Document check — New legal name's ID: The new legal name (Ardinia Lane) isn't named on it");
    /* Confirming again changes nothing. */
    expect((await call("POST", `/profile-changes/${changeId}/id-document/confirm`, "df_lena")).json).toMatchObject({ state: "PENDING" });
    heldLane = changeId;
  });

  it("BE-11 · only BTG answers a held legal name: the athlete, a sponsor and another tenant's BTG are refused; APPLY makes it live", async () => {
    const path = `/profile-changes/${heldLane}/decision`;
    expect((await call("POST", path, "df_lena", { decision: "APPLY" })).status).toBe(403);
    expect((await call("POST", path, "df_sponsor", { decision: "APPLY" })).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", { decision: "APPLY" })).status);
    expect((await call("POST", path, "df_admin", { decision: "DECLINE" })).status).toBe(400);
    expect(await lena()).toBe("Ardinia Townes");
    const r = await call("POST", path, "df_admin", { decision: "APPLY" });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "APPROVED", appliedAt: expect.any(String) });
    expect(await lena()).toBe("Ardinia Lane");
    expect((await call("POST", path, "df_admin", { decision: "APPLY" })).status).toBe(409);
  });

  it("BE-11 · BTG declines another held legal name with a note the athlete reads; the name stays", async () => {
    const { changeId, done } = await legalName("Ardinia Price", await idCard(ID_LINES));
    expect(done.json).toMatchObject({ state: "PENDING", idDocumentCheckState: "FLAGGED" });
    const note = "The ID still shows your previous name — send a document that shows Ardinia Price.";
    const r = await call("POST", `/profile-changes/${changeId}/decision`, "df_admin", { decision: "DECLINE", note });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "DECLINED", reviewerNotes: note });
    expect(await lena()).toBe("Ardinia Lane");
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "athlete.legalNameDeclined", entityId: changeId } })).toBe(1);
  });

  it("BE-10 · BTG sends the ID for a new legal name back: the change is declined with the reason, the file deleted, the athlete emailed to submit again", async () => {
    const { changeId, key, done } = await legalName("Ardinia Price", await idCard(ID_LINES));
    expect(done.json).toMatchObject({ state: "PENDING" });
    const path = `/profile-changes/${changeId}/id-document/send-back`;
    const reason = "This ID doesn't show the new name — submit it again with one that does.";
    expect((await call("POST", path, "df_lena", { reason })).status).toBe(403);
    expect((await call("POST", path, "df_sponsor", { reason })).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", { reason })).status);
    expect((await call("POST", path, "df_admin", SHORT)).status).toBe(400);
    const r = await call("POST", path, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "DECLINED", reviewerNotes: reason, idDocumentReturnedReason: reason, idDocumentReturnedAt: expect.any(String) });
    expect(await change(changeId)).toMatchObject({ state: "DECLINED", idDocumentReturnedAt: expect.any(Date), idDocumentReturnedReason: reason });
    expect(h.deleted).toContain(key);
    expect(await lena()).toBe("Ardinia Lane");
    await sentBackMail("df_lena@df-test.invalid", reason, /\/athlete\/profile\/edit$/);
    expect((await call("GET", `/profile-changes/${changeId}/id-document`, "df_admin")).status).toBeGreaterThanOrEqual(400);
    expect((await call("POST", path, "df_admin", { reason })).status).toBe(409);
  });

  /* ═════════════════════ a sponsor's proof of business ═════════════════ */

  type Asked = { id: string; requestToken: string; emailToken: string };
  const ask = async (company: string, email: string): Promise<Asked> => {
    const r = await call("POST", "/public/inquiries", undefined, { companyName: company, firstName: "Dana", lastName: "Brooks", email, businessType: "RESTAURANT" });
    expect(r.status, r.text).toBe(201);
    const mail = (await emails()).find((m) => m.template === "sponsor.confirmEmail" && m.to === email)!;
    return { id: r.json.id, requestToken: r.json.requestToken, emailToken: new URL(mail.data.confirmUrl!).searchParams.get("t")! };
  };
  const uploadProof = async (a: Asked, bytes: Buffer, type = "application/pdf") => {
    const tok = encodeURIComponent(a.requestToken);
    const up = await call("POST", `/public/sponsor-requests/${tok}/documents`, undefined, { filename: `proof.${type.split("/")[1]}`, contentType: type, bytes: bytes.length });
    expect(up.status, up.text).toBe(201);
    const id = up.json.document.id as string;
    const { r2Key } = await prisma.inquiryDocument.findUniqueOrThrow({ where: { id }, select: { r2Key: true } });
    put(r2Key, bytes, type);
    const done = await call("POST", `/public/sponsor-requests/${tok}/documents/${id}/confirm`);
    openedAsDocument(r2Key);
    return { id, r2Key, done };
  };
  const inquiry = (id: string) => prisma.inquiry.findUniqueOrThrow({ where: { id }, select: { state: true, autoApproved: true, reviewReasons: true } });
  const harborProof = () => textPdf(["CITY OF COLUMBUS", "BUSINESS LICENSE", "LICENSEE: HARBOR COFFEE LLC", "LICENSE NO 2026-04411"]);

  let harbor: Asked;
  let harborProofDoc = { id: "", r2Key: "" };
  it("BE-09 / BE-11 · a dark proof is refused; a proof naming another business holds the request for BTG; BTG's detail shows the reading", async () => {
    harbor = await ask("Harbor Coffee", "df_dana@df-test.invalid");
    const dark = await uploadProof(harbor, await darkPhoto(), "image/png");
    expect(dark.done.status, dark.done.text).toBe(422);
    expect(dark.done.json.error.message).toMatch(DARK_WORDS);

    const other = await uploadProof(harbor, textPdf(["CITY OF COLUMBUS", "BUSINESS LICENSE", "LICENSEE: RIVERBEND BAKERY LLC", "LICENSE NO 2026-09917"]));
    expect(other.done.status, other.done.text).toBe(200);
    harborProofDoc = { id: other.id, r2Key: other.r2Key };
    const c = await call("POST", "/public/sponsor-requests/confirm-email", undefined, { token: harbor.emailToken });
    expect(c.status, c.text).toBe(200);
    expect(c.json).toMatchObject({ state: "NEW", underReview: true });
    expect(await inquiry(harbor.id)).toMatchObject({ state: "NEW", reviewReasons: ["Document check — Proof of business: The business (Harbor Coffee) isn't named on it"] });

    const detail = await call("GET", `/sponsor-requests/${harbor.id}`, "df_admin");
    expect(detail.status, detail.text).toBe(200);
    expect(detail.json.documents.find((d: { id: string }) => d.id === other.id))
      .toMatchObject({ returned: null, check: { state: "FLAGGED", findings: ["The business (Harbor Coffee) isn't named on it"] } });
  });

  it("BE-10 · BTG sends the proof back: the request waits for a new one, the business is emailed its link, and a clear proof approves it", async () => {
    const path = `/sponsor-requests/${harbor.id}/documents/${harborProofDoc.id}/send-back`;
    const reason = "This licence is for a different business — upload Harbor Coffee's.";
    expect((await call("POST", path, "df_sponsor", { reason })).status).toBe(403);
    expect((await call("POST", path, "df_lena", { reason })).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", { reason })).status);
    expect((await call("POST", path, "df_admin", SHORT)).status).toBe(400);
    const r = await call("POST", path, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(r.json.documents.find((d: { id: string }) => d.id === harborProofDoc.id)).toMatchObject({ returned: { reason } });
    expect(h.deleted).toContain(harborProofDoc.r2Key);
    expect(await inquiry(harbor.id)).toMatchObject({ state: "NEW", reviewReasons: [] });
    const st = await call("GET", `/public/sponsor-requests/${encodeURIComponent(harbor.requestToken)}`);
    expect(st.json).toMatchObject({ state: "NEW", proofUploaded: false, missing: ["upload your proof of business"], underReview: false });
    await sentBackMail("df_dana@df-test.invalid", reason, /\/sponsor-request\//);
    expect((await call("GET", `/sponsor-requests/${harbor.id}/documents/${harborProofDoc.id}`, "df_admin")).status).toBeGreaterThanOrEqual(400);

    const good = await uploadProof(harbor, harborProof());
    expect(good.done.status, good.done.text).toBe(200);
    expect(await inquiry(harbor.id)).toMatchObject({ state: "APPROVED", autoApproved: true, reviewReasons: [] });
    expect((await call("POST", path, "df_admin", { reason })).status).toBe(409);
  });

  /* ═════════════════════ an organisation's papers ══════════════════════ */

  const onboardingDoc = async (tok: string, kind: string, bytes: Buffer, type = "application/pdf") => {
    const g = await call("POST", `/public/onboarding/${tok}/documents`, undefined, { kind, filename: `${kind.toLowerCase()}.${type.split("/")[1]}`, contentType: type, bytes: bytes.length });
    expect(g.status, g.text).toBe(201);
    const id = g.json.document.id as string;
    const { r2Key } = await prisma.onboardingDocument.findUniqueOrThrow({ where: { id }, select: { r2Key: true } });
    put(r2Key, bytes, type);
    const done = await call("POST", `/public/onboarding/${tok}/documents/${id}/confirm`);
    openedAsDocument(r2Key);
    return { id, r2Key, done };
  };

  let hawks = { tok: "", id: "" };
  let rightsDoc = { id: "", r2Key: "" };
  it("BE-09 / BE-11 · an organisation's dark ID is refused; a rights paper naming another organisation holds the approval; BTG's review shows the reading", async () => {
    const started = await call("POST", "/public/onboarding", undefined, { orgType: "TEAM", orgName: "Riverside Hawks" });
    expect(started.status, started.text).toBe(201);
    hawks = { tok: started.json.resumeToken, id: started.json.id };
    const tok = hawks.tok;
    await call("PATCH", `/public/onboarding/${tok}`, undefined, { step: "organisation", stateCode: "MD" });
    await call("PATCH", `/public/onboarding/${tok}`, undefined, { step: "contacts", contacts: [{ name: "Dana Cole", email: "df_hawks@df-test.invalid", role: "Director", primary: true }] });
    expect((await call("PATCH", `/public/onboarding/${tok}`, undefined, { step: "business", details: { legalEntityName: "Riverside Hawks LLC", league: "MD Youth", sport: "Soccer" } })).status).toBe(200);
    await call("PATCH", `/public/onboarding/${tok}`, undefined, { step: "payout", acknowledged: true });
    const terms = (await call("GET", `/public/onboarding/${tok}`)).json.terms;
    await call("PATCH", `/public/onboarding/${tok}`, undefined, { step: "agreements", agreementId: terms.agreementId, bodyHashShown: terms.bodyHash });

    const dark = await onboardingDoc(tok, "IDENTITY", await darkPhoto(), "image/png");
    expect(dark.done.status, dark.done.text).toBe(422);
    expect(dark.done.json.error.message).toMatch(DARK_WORDS);
    const id = await onboardingDoc(tok, "IDENTITY", textPdf(["STATE OF MARYLAND DRIVER LICENSE", "COLE, DANA", "DOB 01/02/1985", "EXP 01/02/2031"]));
    expect(id.done.status, id.done.text).toBe(200);
    const rights = await onboardingDoc(tok, "RIGHTS_PROOF", textPdf(["FIELD USE AND SPONSORSHIP RIGHTS LETTER", "GRANTED TO: LAKEVIEW PANTHERS", "MONTGOMERY COUNTY PARKS"]));
    expect(rights.done.status, rights.done.text).toBe(200);
    rightsDoc = { id: rights.id, r2Key: rights.r2Key };
    expect((await call("POST", `/public/onboarding/${tok}/submit`)).status).toBe(200);
    const link = (await emails()).filter((e) => e.template === "onboarding.confirmEmail" && e.idempotencyKey.includes(`:${hawks.id}:`)).at(-1)!;
    const confirmed = await call("POST", "/public/onboarding/confirm-email", undefined, { token: new URL(link.data.confirmUrl!).searchParams.get("t")! });
    expect(confirmed.status, confirmed.text).toBe(200);
    expect(confirmed.json).toMatchObject({ state: "PENDING_REVIEW", approved: false });
    const row = await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: hawks.id }, select: { state: true, reviewReasons: true } });
    expect(row).toEqual({ state: "PENDING_REVIEW", reviewReasons: ["Document check — Proof of the rights to sell your inventory: The organisation (Riverside Hawks) isn't named on it"] });

    const review = await call("GET", `/onboarding/${hawks.id}/documents`, "df_admin");
    expect(review.status, review.text).toBe(200);
    expect(review.json.documents.find((d: { id: string }) => d.id === rights.id))
      .toMatchObject({ returnedAt: null, downloadUrl: expect.any(String), check: { state: "FLAGGED", findings: ["The organisation (Riverside Hawks) isn't named on it"] } });
    expect(review.json.documents.find((d: { id: string }) => d.id === id.id)).toMatchObject({ check: { state: "CLEAR", findings: [] } });
  });

  it("BE-10 · BTG sends the rights paper back: the application returns to the applicant (CHANGES_REQUESTED) with the reason, and the contact is emailed where to upload", async () => {
    const path = `/onboarding/${hawks.id}/documents/${rightsDoc.id}/send-back`;
    const reason = "This letter grants the rights to another team — upload the one for Riverside Hawks.";
    expect((await call("POST", path, "df_sponsor", { reason })).status).toBe(403);
    expect((await call("POST", path, "df_lena", { reason })).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", { reason })).status);
    expect((await call("POST", path, "df_admin", SHORT)).status).toBe(400);
    const r = await call("POST", path, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(r.json.documents.find((d: { id: string }) => d.id === rightsDoc.id)).toMatchObject({ returnedAt: expect.any(String), returnedReason: reason, downloadUrl: null });
    expect(h.deleted).toContain(rightsDoc.r2Key);
    expect(await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: hawks.id }, select: { state: true, reviewNotes: true, reviewReasons: true } }))
      .toEqual({ state: "CHANGES_REQUESTED", reviewNotes: reason, reviewReasons: [] });
    await sentBackMail("df_hawks@df-test.invalid", reason, /\/onboarding\/[^/]+$/);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "onboarding.documentSentBack", entityId: hawks.id } })).toBe(1);
    expect((await call("GET", `/onboarding/${hawks.id}/documents/${rightsDoc.id}`, "df_admin")).status).toBe(409);
    expect((await call("POST", path, "df_admin", { reason })).status).toBe(409);
  });

  it("BE-11 / BE-10 · a clear rights paper and the organisation is approved automatically; BTG then sends a required paper back: it is flagged, not suspended, and pointed at its documents page", async () => {
    const fixed = await onboardingDoc(hawks.tok, "RIGHTS_PROOF", textPdf(["FIELD USE AND SPONSORSHIP RIGHTS LETTER", "GRANTED TO: RIVERSIDE HAWKS", "MONTGOMERY COUNTY PARKS"]));
    expect(fixed.done.status, fixed.done.text).toBe(200);
    const submitted = await call("POST", `/public/onboarding/${hawks.tok}/submit`);
    expect(submitted.status, submitted.text).toBe(200);
    expect(await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: hawks.id }, select: { state: true, autoApproved: true, reviewReasons: true } }))
      .toEqual({ state: "APPROVED", autoApproved: true, reviewReasons: [] });

    const docs = (await call("GET", `/onboarding/${hawks.id}/documents`, "df_admin")).json.documents as { id: string; kind: string; returnedAt: string | null; uploadedAt: string | null; check: { state: string } | null }[];
    const identity = docs.find((d) => d.kind === "IDENTITY" && d.uploadedAt && !d.returnedAt && d.check?.state === "CLEAR")!;
    expect(identity).toBeDefined();
    const reason = "The licence is cut off at the edge — upload a photo of the whole card.";
    const r = await call("POST", `/onboarding/${hawks.id}/documents/${identity.id}/send-back`, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(await prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: hawks.id }, select: { state: true, flags: true, flaggedAt: true } }))
      .toMatchObject({ state: "APPROVED", flags: ["Document missing after an update: Government ID of the person signing"], flaggedAt: expect.any(Date) });
    await sentBackMail("df_hawks@df-test.invalid", reason, /\/property\/documents$/);
  });

  /* ═════════════════════ a guardian handoff ════════════════════════════ */

  const pub = (token: string, rest = "") => `/public/guardian-handoffs/${encodeURIComponent(token)}${rest}`;
  const handoffDoc = async (token: string, kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF", bytes: Buffer, type: string) => {
    const up = await call("POST", pub(token, "/documents"), undefined, {
      kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind: "COURT_ORDER" } : {}), filename: `scan.${type.split("/")[1]}`, contentType: type, bytes: bytes.length,
    });
    expect(up.status, up.text).toBe(201);
    const id = up.json.document.id as string;
    const { r2Key } = await prisma.guardianHandoffDocument.findUniqueOrThrow({ where: { id }, select: { r2Key: true } });
    put(r2Key, bytes, type);
    const done = await call("POST", pub(token, `/documents/${id}/confirm`));
    openedAsDocument(r2Key);
    return { id, r2Key, done };
  };

  let luis = { token: "", id: "" };
  let luisId = { id: "", r2Key: "" };
  it("BE-09 / BE-11 · the new guardian's dark ID is refused; an ID naming someone else sends Hand off to BTG (HANDED_OFF), though staff-confirm is off", async () => {
    const start = await call("POST", "/public/guardian-handoffs", undefined, { athleteEmail: "df_mateo@df-test.invalid", name: "Luis Diaz", email: "df_luis@df-test.invalid", relationship: "PARENT" });
    expect(start.status, start.text).toBe(201);
    luis = { token: start.json.token, id: start.json.request.id };
    const dark = await handoffDoc(luis.token, "GUARDIAN_ID", await darkPhoto(), "image/png");
    expect(dark.done.status, dark.done.text).toBe(422);
    expect(dark.done.json.error.message).toMatch(DARK_WORDS);
    const wrong = await handoffDoc(luis.token, "GUARDIAN_ID", await carmenCard("OKAFOR, BEATRIX Q"), "image/png");
    expect(wrong.done.status, wrong.done.text).toBe(200);
    luisId = { id: wrong.id, r2Key: wrong.r2Key };
    const proof = await handoffDoc(luis.token, "GUARDIANSHIP_PROOF", textPdf(["IN THE PROBATE COURT OF FRANKLIN COUNTY", "LETTERS OF GUARDIANSHIP", "GUARDIAN: LUIS DIAZ", "WARD: MATEO DIAZ"]), "application/pdf");
    expect(proof.done.status, proof.done.text).toBe(200);
    const mail = (await emails()).filter((m) => m.template === "handoff.confirmEmail" && m.to === "df_luis@df-test.invalid").at(-1)!;
    expect((await call("POST", "/public/guardian-handoffs/confirm-email", undefined, { token: new URL(mail.data.confirmUrl!).searchParams.get("e")! })).status).toBe(200);
    expect((await call("POST", pub(luis.token, "/submit"), undefined, { acceptAgreement: true })).json.state).toBe("WAITING");
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: T }, select: { staffConfirmMinors: true } })).staffConfirmMinors).toBe(false);

    const handed = await call("POST", `/guardian-handoffs/${luis.id}/decision`, "df_carla", { decision: "HAND_OFF" });
    expect(handed.status, handed.text).toBe(200);
    expect(handed.json.state).toBe("HANDED_OFF");
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "df_mateo" }, select: { guardianId: true } })).guardianId).toBe("df_g_carla");
    const why = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "guardianHandoff.handOffForReview", entityId: luis.id }, select: { after: true } });
    expect((why.after as { reasons: string[] }).reasons).toContain("Document check — New guardian's government ID: The new guardian (Luis Diaz) isn't named on it");

    const detail = await call("GET", `/guardian-handoffs/${luis.id}`, "df_admin");
    expect(detail.status, detail.text).toBe(200);
    expect(detail.json.staff.documentHolds).toContain("Document check — New guardian's government ID: The new guardian (Luis Diaz) isn't named on it");
    expect(detail.json.staff.documents.find((d: { id: string }) => d.id === wrong.id))
      .toMatchObject({ returned: null, check: { state: "FLAGGED", findings: expect.arrayContaining(["The new guardian (Luis Diaz) isn't named on it"]) } });
    expect(detail.json.staff.documents.find((d: { id: string }) => d.id === proof.id)).toMatchObject({ check: { state: "CLEAR" } });
  });

  it("BE-10 · BTG sends the new guardian's ID back: the request returns to REQUESTED, nothing switches, and the new guardian is emailed their request link", async () => {
    const path = `/guardian-handoffs/${luis.id}/documents/${luisId.id}/send-back`;
    const reason = "This ID is someone else's — upload your own photo ID and send the request again.";
    expect((await call("POST", path, "df_carla", { reason })).status).toBe(403);
    expect((await call("POST", path, "df_sponsor", { reason })).status).toBe(403);
    expect([403, 404]).toContain((await call("POST", path, "df_admin2", { reason })).status);
    expect((await call("POST", path, "df_admin", SHORT)).status).toBe(400);
    const r = await call("POST", path, "df_admin", { reason });
    expect(r.status, r.text).toBe(200);
    expect(r.json.state).toBe("REQUESTED");
    expect(r.json.staff.documents.find((d: { id: string }) => d.id === luisId.id)).toMatchObject({ returned: { reason } });
    expect(r.json.staff.documentHolds).toEqual([]);
    expect(h.deleted).toContain(luisId.r2Key);
    expect(await prisma.guardianHandoff.findUniqueOrThrow({ where: { id: luis.id }, select: { state: true, submittedAt: true } })).toEqual({ state: "REQUESTED", submittedAt: null });
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: "df_mateo" }, select: { guardianId: true } })).guardianId).toBe("df_g_carla");
    const st = await call("GET", pub(luis.token));
    expect(st.json).toMatchObject({ state: "REQUESTED", idUploaded: false });
    await sentBackMail("df_luis@df-test.invalid", reason, /\/guardian\/handoff\?r=/);
    expect((await call("GET", `/guardian-handoffs/${luis.id}/documents/${luisId.id}`, "df_admin")).status).toBe(409);
    expect((await call("POST", pub(luis.token, `/documents/${luisId.id}/confirm`))).status).toBe(409);
  });

  /* ═════════════════════ Level A only: disputes, deliveries ════════════ */

  it("BE-09 · a dispute document too dark to read is refused 422 in words", async () => {
    const opened = await call("POST", "/orders/df_order_ada/disputes", "df_admin", {
      source: "SCHOOL", sourceName: "Riverside High athletic director", reason: "The school says its logo appears in the post.", documentsRequested: "A letter from the school approving the deal.",
    });
    expect(opened.status, opened.text).toBe(201);
    const dark = await darkPhoto();
    const start = await call("POST", `/deal-disputes/${opened.json.id}/documents`, "df_ada", { filename: "letter.png", contentType: "image/png", bytes: dark.length });
    expect(start.status, start.text).toBe(201);
    const docId = start.json.document.id as string;
    const { r2Key } = await prisma.dealDisputeDocument.findUniqueOrThrow({ where: { id: docId }, select: { r2Key: true } });
    put(r2Key, dark, "image/png");
    const done = await call("POST", `/deal-disputes/${opened.json.id}/documents/${docId}/confirm`, "df_ada");
    openedAsDocument(r2Key);
    expect(done.status, done.text).toBe(422);
    expect(done.json.error.message).toMatch(DARK_WORDS);
    expect((await prisma.dealDisputeDocument.findUniqueOrThrow({ where: { id: docId }, select: { uploadedAt: true } })).uploadedAt).toBeNull();

    /* A readable letter goes through. */
    const letter = textPdf(["RIVERSIDE HIGH SCHOOL", "ATHLETIC DEPARTMENT", "We approve the post with our logo for Pier Coffee."]);
    const again = await call("POST", `/deal-disputes/${opened.json.id}/documents`, "df_ada", { filename: "letter.pdf", contentType: "application/pdf", bytes: letter.length });
    const key2 = (await prisma.dealDisputeDocument.findUniqueOrThrow({ where: { id: again.json.document.id }, select: { r2Key: true } })).r2Key;
    put(key2, letter, "application/pdf");
    expect((await call("POST", `/deal-disputes/${opened.json.id}/documents/${again.json.document.id}/confirm`, "df_ada")).status).toBe(200);
  });

  it("BE-09 · a blurred delivery photo is refused 422 in words, and the line is not marked delivered", async () => {
    const blurred = await blurredPhoto();
    const grant = await call("POST", "/sales/df_line/proof", "df_pm", { contentType: "image/png", bytes: blurred.length });
    expect(grant.status, grant.text).toBe(201);
    put(grant.json.key, blurred, "image/png");
    const r = await call("POST", "/sales/df_line/delivered", "df_pm", { note: "Hung at the home game.", proofKey: grant.json.key });
    openedAsDocument(grant.json.key);
    expect(r.status, r.text).toBe(422);
    expect(r.json.error.message).toMatch(BLUR_WORDS);
    expect((await prisma.orderLineDelivery.findUniqueOrThrow({ where: { id: "df_delivery" }, select: { state: true } })).state).toBe("IN_DELIVERY");
  });
});
