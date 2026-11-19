/* --------------------------------------------------------------------------
   POL-BE-113 — the live storage check: can a browser on the website upload
   to each storage area? Real database, and a real S3 endpoint that answers
   preflights by its upload rule and checks signatures (tests/support/object-store.ts).
   -------------------------------------------------------------------------- */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const previousEndpoint = process.env.S3_ENDPOINT;

const { startObjectStore } = await import("./support/object-store");
const store = await startObjectStore();
process.env.S3_ENDPOINT = store.endpoint;

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();
const ORIGIN = "https://web.sponsorx.test";

describe("POL-BE-113 · the check's verdict, read by /health/full", async () => {
  const { evaluateStorageUploads, probeProblem } = await import("../src/domain/storage-check");
  const now = new Date("2026-11-20T12:00:00Z");
  it("on Railway: a fresh pass is ok; a failure, a stale check or none at all is not", () => {
    expect(evaluateStorageUploads({ ok: true, problem: null, finishedAt: new Date("2026-11-20T09:00:00Z") }, true, now)).toMatchObject({ ok: true });
    expect(evaluateStorageUploads({ ok: false, problem: "public storage: …", finishedAt: new Date("2026-11-20T09:00:00Z") }, true, now)).toMatchObject({ ok: false, problem: "public storage: …" });
    expect(evaluateStorageUploads({ ok: true, problem: null, finishedAt: new Date("2026-11-19T09:00:00Z") }, true, now)).toMatchObject({ ok: false, problem: expect.stringMatching(/over 26 hours/) });
    expect(evaluateStorageUploads(null, true, now)).toMatchObject({ ok: false, problem: expect.stringMatching(/hasn't run yet/) });
  });
  it("off Railway (a laptop, CI) nothing is required", () => {
    expect(evaluateStorageUploads(null, false, now).ok).toBe(true);
    expect(evaluateStorageUploads({ ok: false, problem: "x", finishedAt: now }, false, now).ok).toBe(true);
  });
  it("says what failed, in words", () => {
    expect(probeProblem({ bucket: "public", ok: false, step: "preflight", detail: "preflight 403" })).toBe("public storage (photos, logos): a browser on the website can't upload — preflight 403");
    expect(probeProblem({ bucket: "private", ok: false, step: "delete", detail: "x" })).toMatch(/^private storage \(documents, drafts\): the test file couldn't be deleted/);
  });
});

describe.skipIf(!hasDatabase)("POL-BE-113 · the live storage check, against a real store", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const storage = await import("../src/lib/storage");
  const { runStorageCheck, readStorageCheck } = await import("../src/domain/storage-check");
  store.verifyWith(storage.s3);
  const deps = { probe: storage.probeBucket, origin: ORIGIN };
  const leftovers = () => [...store.objects.keys()].filter((k) => k.includes("/_storage-check/"));

  beforeAll(async () => { await prisma.storageCheck.deleteMany({ where: { origin: { in: [ORIGIN] } } }); });
  afterAll(async () => {
    await prisma.storageCheck.deleteMany({ where: { origin: { in: [ORIGIN] } } });
    await store.close();
    if (previousEndpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = previousEndpoint;
  });

  it("with the website allowed, both storage areas take a browser's upload, read it back, and nothing is left behind", async () => {
    store.allowOrigins.add(ORIGIN);
    const r = await runStorageCheck(prisma, deps);
    expect(r).toMatchObject({ ok: true, problem: null, origin: ORIGIN, results: [{ bucket: "public", ok: true }, { bucket: "private", ok: true }] });
    expect(leftovers()).toEqual([]);
    expect(await readStorageCheck(prisma)).toMatchObject({ ok: true, problem: null });
  });

  it("without the website's upload rule (2026-11-16), the check fails at the preflight and says so", async () => {
    store.allowOrigins.clear();
    const r = await runStorageCheck(prisma, deps);
    expect(r.ok).toBe(false);
    expect(r.results[0]).toMatchObject({ bucket: "public", ok: false, step: "preflight" });
    expect(r.problem).toMatch(/^public storage \(photos, logos\): a browser on the website can't upload — a browser on https:\/\/web\.sponsorx\.test is refused/);
    expect(leftovers()).toEqual([]);
    const latest = await readStorageCheck(prisma);
    expect(latest).toMatchObject({ ok: false, problem: r.problem });
  });

  it("an upload the bucket refuses fails at the upload step", async () => {
    store.allowOrigins.add(ORIGIN);
    /* A store that stops checking our signatures' key: hand it a different client. */
    const { S3Client } = await import("@aws-sdk/client-s3");
    store.verifyWith(new S3Client({ endpoint: store.endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "other", secretAccessKey: "other-secret" } }));
    const r = await storage.probeBucket("private", ORIGIN);
    expect(r).toMatchObject({ ok: false, step: "upload", detail: "the signed upload answered 403" });
    store.verifyWith(storage.s3);
    expect(leftovers()).toEqual([]);
  });
});
