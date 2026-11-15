import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { scopeFor } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   P9-BE-24 — student assignments and the advisor's content review.

   Done when: an advisor assigns a piece to their own school's student; the
   student submits words or a file; the advisor approves it (it becomes an
   edition content item) or sends it back with a reason the student reads
   and answers with a new version; another school's advisor, another student
   and the student themself are refused; nothing moves on its own.

   Every clause on the path a real request takes: HTTP through the
   production auth, scope and route code over a real database. Only Clerk
   and the bucket are stubbed — the bucket stub still writes the upload
   grant's audit row, which is what the submit checks a key against.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@assignments-test.invalid` } : null;
  },
}));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return {
    ...real,
    presignPrivateUpload: async (actor: never, key: string, contentType: string, ctx: { entity: string; entityId: string }, pins?: { contentLength?: number }) => {
      const { prisma } = await import("../src/db/client");
      const { audit, AUDIT_ACTIONS } = await import("../src/db/audit");
      await prisma.$transaction((tx) => audit(tx, actor, AUDIT_ACTIONS.storage.privateUploadGrant, ctx.entity, ctx.entityId, {
        after: { key, contentType, ...(pins?.contentLength !== undefined ? { bytes: pins.contentLength } : {}) },
      }));
      return `https://bucket.test/put/${key}`;
    },
    checkPrivateUpload: async () => ({ ok: true, bytes: 2048 }),
    presignPrivateDownload: async (_actor: unknown, key: string) => `https://bucket.test/get/${key}`,
  };
});

const { stageOf } = await import("../src/domain/student-assignment");

describe("P9-BE-24 · who may do what (the policy)", () => {
  it("the advisor assigns and reviews for one school; the student reads and submits their own and never reviews; a guardian reads", () => {
    expect([scopeFor(["ADVISOR"], "studentAssignment", "read"), scopeFor(["ADVISOR"], "studentAssignment", "write"), scopeFor(["ADVISOR"], "studentAssignment", "approve")])
      .toEqual(["own-property", "own-property", "own-property"]);
    expect([scopeFor(["STUDENT"], "studentAssignment", "read"), scopeFor(["STUDENT"], "studentAssignment", "write"), scopeFor(["STUDENT"], "studentAssignment", "approve")])
      .toEqual(["own", "own", "deny"]);
    expect(scopeFor(["GUARDIAN"], "studentAssignment", "read")).toBe("ward");
    expect(scopeFor(["GUARDIAN"], "studentAssignment", "write")).toBe("deny");
    expect(scopeFor(["SPONSOR_ADMIN"], "studentAssignment", "read")).toBe("deny");
  });

  it("names where a piece is in a person's words", () => {
    expect(stageOf({ reviewState: "NOT_STARTED", revisionNote: null })).toBe("ASSIGNED");
    expect(stageOf({ reviewState: "DRAFT_SUBMITTED", revisionNote: null })).toBe("WAITING_FOR_ADVISOR");
    expect(stageOf({ reviewState: "DRAFT_SUBMITTED", revisionNote: "Shorter, please" })).toBe("CHANGES_REQUESTED");
    expect(stageOf({ reviewState: "BTG_REVIEW", revisionNote: null })).toBe("IN_REVIEW");
    expect(stageOf({ reviewState: "APPROVED", revisionNote: null })).toBe("APPROVED");
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-BE-24 · on the path a request takes", async () => {
  const { prisma } = await import("../src/db/client");
  const ed = await import("../src/domain/edition");
  const { createApp } = await import("../src/app");

  const T = "sa_tenant";
  const DAY = 864e5;
  const staff = { userId: "sa_staff", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let editionId = "";
  let otherEditionId = "";

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  async function clean() {
    for (const t of ["StudentAssignment", "EditionAsset", "OutboxJob", "AuditLog", "Edition", "Publication", "User", "Student", "Guardian", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  const piece = { kind: "ARTICLE", title: "Northside's comeback season", section: "Sports", brief: "600 words on the soccer team's run to the regional final. Quote the coach and two players.", dueAt: "2026-12-01" };

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Assignments test tenant" } });
    await prisma.property.createMany({ data: [
      { id: "sa_school", tenantId: T, slug: "sa-northside", name: "Northside High", kind: "SCHOOL" },
      { id: "sa_other", tenantId: T, slug: "sa-southside", name: "Southside High", kind: "SCHOOL" },
    ] });
    await prisma.guardian.create({ data: { id: "sa_guardian", tenantId: T, legalName: "Jordan's Parent", email: "parent@sa.invalid", relationship: "PARENT" } });
    await prisma.student.createMany({ data: [
      { id: "sa_jordan", tenantId: T, propertyId: "sa_school", legalName: "Jordan Legal", displayName: "Jordan", masthead: ["WRITER"], ageBand: "18_PLUS", state: "ACTIVE", guardianId: "sa_guardian" },
      { id: "sa_casey", tenantId: T, propertyId: "sa_school", legalName: "Casey Legal", displayName: "Casey", masthead: ["PHOTOGRAPHER"], ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "sa_pending", tenantId: T, propertyId: "sa_school", legalName: "Pat Legal", displayName: "Pat", masthead: ["WRITER"], ageBand: "18_PLUS", state: "UNDER_REVIEW" },
      { id: "sa_south", tenantId: T, propertyId: "sa_other", legalName: "Sam Legal", displayName: "Sam", masthead: ["WRITER"], ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "sa_staff", tenantId: T, clerkId: "sa_staff", email: "ops@sa.invalid", roles: ["BTG_ADMIN"] },
      { id: "sa_advisor", tenantId: T, clerkId: "sa_advisor", email: "adv@sa.invalid", roles: ["ADVISOR"], propertyId: "sa_school" },
      { id: "sa_advisor_other", tenantId: T, clerkId: "sa_advisor_other", email: "adv2@sa.invalid", roles: ["ADVISOR"], propertyId: "sa_other" },
      { id: "sa_jordan_u", tenantId: T, clerkId: "sa_jordan_u", email: "jordan@sa.invalid", roles: ["STUDENT"], studentId: "sa_jordan", propertyId: "sa_school" },
      { id: "sa_casey_u", tenantId: T, clerkId: "sa_casey_u", email: "casey@sa.invalid", roles: ["STUDENT"], studentId: "sa_casey", propertyId: "sa_school" },
      { id: "sa_guardian_u", tenantId: T, clerkId: "sa_guardian_u", email: "parent@sa.invalid", roles: ["GUARDIAN"], guardianId: "sa_guardian" },
    ] });
    const pub = await ed.createPublication(staff, { name: "The Northside Record", propertyId: "sa_school" });
    editionId = (await ed.createEdition(staff, pub.id, { label: "Winter edition", closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 60 * DAY), thresholdCents: 1 })).id;
    const southPub = await ed.createPublication(staff, { name: "The Southside Star", propertyId: "sa_other" });
    otherEditionId = (await ed.createEdition(staff, southPub.id, { label: "South winter", closeDate: new Date(Date.now() + 30 * DAY), publishTarget: new Date(Date.now() + 60 * DAY), thresholdCents: 1 })).id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  let id = "";

  it("the advisor assigns a piece to their own school's ACTIVE student", async () => {
    const r = await call("POST", `/editions/${editionId}/assignments`, "sa_advisor", { studentId: "sa_jordan", ...piece });
    expect(r.status, r.text).toBe(201);
    expect(r.json).toMatchObject({ state: "NOT_STARTED", stage: "ASSIGNED", kind: "ARTICLE", title: piece.title, points: 50, version: 0, student: { id: "sa_jordan", displayName: "Jordan" } });
    /* Display name only — never the legal name (P9-SEC-01). */
    expect(r.text).not.toContain("Jordan Legal");
    id = r.json.id;
  });

  it("is refused to another school's advisor, to a student, for an inactive student and for another school's edition", async () => {
    expect((await call("POST", `/editions/${editionId}/assignments`, "sa_advisor_other", { studentId: "sa_jordan", ...piece })).status).toBe(403);
    expect((await call("POST", `/editions/${editionId}/assignments`, "sa_jordan_u", { studentId: "sa_jordan", ...piece })).status).toBe(403);
    const pending = await call("POST", `/editions/${editionId}/assignments`, "sa_advisor", { studentId: "sa_pending", ...piece });
    expect(pending.status).toBe(422);
    expect(pending.json.error.message).toMatch(/isn't active/);
    expect((await call("POST", `/editions/${otherEditionId}/assignments`, "sa_advisor", { studentId: "sa_jordan", ...piece })).status).toBe(403);
    /* BTG can assign, but not a student to another school's edition. */
    const wrongSchool = await call("POST", `/editions/${otherEditionId}/assignments`, "sa_staff", { studentId: "sa_jordan", ...piece });
    expect(wrongSchool.status).toBe(422);
  });

  it("the student sees their own; another student doesn't; their guardian does", async () => {
    const mine = await call("GET", "/student-assignments", "sa_jordan_u");
    expect(mine.json.assignments.map((a: { id: string }) => a.id)).toEqual([id]);
    expect((await call("GET", "/student-assignments", "sa_casey_u")).json.assignments).toEqual([]);
    expect((await call("GET", `/student-assignments/${id}`, "sa_casey_u")).status).toBe(403);
    expect((await call("GET", `/student-assignments/${id}`, "sa_guardian_u")).status).toBe(200);
    expect((await call("GET", `/student-assignments/${id}`, "sa_advisor_other")).status).toBe(403);
  });

  it("only the student submits, and only with words or a file", async () => {
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "   " })).status).toBe(422);
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_casey_u", { text: "Not mine" })).status).toBe(403);
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_advisor", { text: "Written for them" })).status).toBe(403);
    const r = await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "Northside's soccer team has not lost since September." });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", stage: "WAITING_FOR_ADVISOR", version: 1, hasFile: false });
  });

  it("nothing moves on its own: it waits on the advisor's desk", async () => {
    const row = await prisma.studentAssignment.findUniqueOrThrow({ where: { id }, select: { reviewState: true } });
    expect(row.reviewState).toBe("DRAFT_SUBMITTED");
    const desk = await call("GET", "/student-assignments?view=waiting&page=1", "sa_advisor");
    expect(desk.json.assignments.map((a: { id: string }) => a.id)).toEqual([id]);
    expect(desk.json.counts).toMatchObject({ waiting: 1, "with-student": 0, approved: 0 });
    expect(desk.json.page).toMatchObject({ total: 1 });
    expect((await call("GET", "/student-assignments?view=waiting&page=1", "sa_advisor_other")).json.counts.waiting).toBe(0);
  });

  it("the student, another school's advisor and a guardian cannot approve or send back", async () => {
    for (const who of ["sa_jordan_u", "sa_advisor_other", "sa_guardian_u"]) {
      expect((await call("POST", `/student-assignments/${id}/approve`, who)).status, who).toBe(403);
      expect((await call("POST", `/student-assignments/${id}/revision`, who, { note: "x" })).status, who).toBe(403);
    }
  });

  it("the advisor sends it back with a reason; the student reads it word for word", async () => {
    expect((await call("POST", `/student-assignments/${id}/revision`, "sa_advisor", { note: "  " })).status).toBe(422);
    const note = "Good start. Add the coach's quote and cut the second paragraph.";
    const r = await call("POST", `/student-assignments/${id}/revision`, "sa_advisor", { note });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", stage: "CHANGES_REQUESTED", revisionNote: note });
    expect((await call("GET", `/student-assignments/${id}`, "sa_jordan_u")).json.revisionNote).toBe(note);
    /* Back with the student: not the advisor's move. */
    expect((await call("POST", `/student-assignments/${id}/approve`, "sa_advisor")).status).toBe(409);
    expect((await call("GET", "/student-assignments?page=1", "sa_advisor")).json.counts).toMatchObject({ waiting: 0, "with-student": 1 });
  });

  it("the student answers with a new version, a file attached; the key must be one granted for this piece", async () => {
    expect((await call("POST", `/student-assignments/${id}/uploads`, "sa_jordan_u", { contentType: "application/zip", bytes: 2048 })).status).toBe(422);
    expect((await call("POST", `/student-assignments/${id}/uploads`, "sa_jordan_u", { contentType: "image/jpeg", bytes: 30 * 1024 * 1024 })).status).toBe(422);
    expect((await call("POST", `/student-assignments/${id}/uploads`, "sa_casey_u", { contentType: "image/jpeg", bytes: 2048 })).status).toBe(403);
    const up = await call("POST", `/student-assignments/${id}/uploads`, "sa_jordan_u", { contentType: "image/jpeg", bytes: 2048 });
    expect(up.status, up.text).toBe(201);
    expect(up.json.key).toMatch(new RegExp(`^student-drafts/${T}/${id}/`));
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "v2", r2Key: `student-drafts/${T}/${id}/never-granted` })).status).toBe(422);
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "v2", r2Key: "student-drafts/elsewhere/x" })).status).toBe(422);
    const r = await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "Coach Ruiz: \"They never stopped believing.\"", r2Key: up.json.key });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "DRAFT_SUBMITTED", stage: "WAITING_FOR_ADVISOR", version: 2, hasFile: true, fileType: "image/jpeg", revisionNote: null });
    const file = await call("GET", `/student-assignments/${id}/file`, "sa_advisor");
    expect(file.json.url).toContain(up.json.key);
    expect((await call("GET", `/student-assignments/${id}/file`, "sa_advisor_other")).status).toBe(403);
  });

  it("the advisor opens it, approves it, and it becomes one of the edition's content items", async () => {
    const opened = await call("POST", `/student-assignments/${id}/review`, "sa_advisor");
    expect(opened.json).toMatchObject({ state: "BTG_REVIEW", stage: "IN_REVIEW" });
    /* Mid-review the draft can't change. */
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "sneaky v3" })).status).toBe(409);
    const r = await call("POST", `/student-assignments/${id}/approve`, "sa_advisor");
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "APPROVED", stage: "APPROVED" });
    expect(r.json.assetId).toBeTruthy();
    const asset = await prisma.editionAsset.findUniqueOrThrow({ where: { id: r.json.assetId }, select: { editionId: true, kind: true, title: true, sourceKind: true, studentId: true, r2Key: true } });
    expect(asset).toMatchObject({ editionId, kind: "ARTICLE", title: piece.title, sourceKind: "STUDENT", studentId: "sa_jordan" });
    expect(asset.r2Key).toMatch(new RegExp(`^student-drafts/${T}/${id}/`));
    /* Final. */
    expect((await call("POST", `/student-assignments/${id}/approve`, "sa_advisor")).status).toBe(409);
    expect((await call("POST", `/student-assignments/${id}/submit`, "sa_jordan_u", { text: "after" })).status).toBe(409);
  });

  it("every step is audited, as the person who took it", async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: T, entity: "StudentAssignment", entityId: id, action: { startsWith: "studentAssignment." } }, select: { action: true, actorId: true }, orderBy: { at: "asc" } });
    expect(rows.map((r) => [r.action, r.actorId])).toEqual([
      ["studentAssignment.create", "sa_advisor"],
      ["studentAssignment.submit", "sa_jordan_u"],
      ["studentAssignment.startReview", "sa_advisor"],
      ["studentAssignment.requestRevision", "sa_advisor"],
      ["studentAssignment.submit", "sa_jordan_u"],
      ["studentAssignment.startReview", "sa_advisor"],
      ["studentAssignment.approve", "sa_advisor"],
    ]);
  });

  it("the advisor can approve a fresh submission in one step; nothing changes once the edition is in production", async () => {
    const a = (await call("POST", `/editions/${editionId}/assignments`, "sa_advisor", { studentId: "sa_casey", kind: "PHOTO", title: "Senior night", brief: "Three photos from senior night." })).json;
    await call("POST", `/student-assignments/${a.id}/submit`, "sa_casey_u", { text: "Captions: 1. The captains. 2. The bench. 3. The crowd." });
    const b = (await call("POST", `/editions/${editionId}/assignments`, "sa_staff", { studentId: "sa_casey", kind: "INTERVIEW", title: "Coach Q&A", brief: "Ten questions." })).json;
    await call("POST", `/student-assignments/${b.id}/submit`, "sa_casey_u", { text: "Q1…" });
    expect((await call("POST", `/student-assignments/${a.id}/approve`, "sa_advisor")).json.state).toBe("APPROVED");

    await prisma.edition.update({ where: { id: editionId }, data: { state: "IN_PRODUCTION" } });
    expect((await call("POST", `/student-assignments/${b.id}/approve`, "sa_advisor")).status).toBe(409);
    expect((await call("POST", `/student-assignments/${b.id}/submit`, "sa_casey_u", { text: "late" })).status).toBe(409);
    expect((await call("POST", `/editions/${editionId}/assignments`, "sa_advisor", { studentId: "sa_casey", ...piece })).status).toBe(409);
    await prisma.edition.update({ where: { id: editionId }, data: { state: "PLANNING" } });
  });

  it("each step emails whoever it hands the piece to — the student, or only their own school's advisor", async () => {
    const mail = (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; idempotencyKey: string; data: Record<string, string> })
      .filter((p) => p.idempotencyKey.includes(`:${id}:`));
    const sent = (template: string) => mail.filter((m) => m.template === template).map((m) => m.to).sort();
    expect(sent("studentAssignment.assigned")).toEqual(["jordan@sa.invalid"]);
    /* Two versions in, each to Northside's advisor — never Southside's. */
    expect(sent("studentAssignment.submitted")).toEqual(["adv@sa.invalid", "adv@sa.invalid"]);
    expect(sent("studentAssignment.revisionRequested")).toEqual(["jordan@sa.invalid"]);
    expect(mail.find((m) => m.template === "studentAssignment.revisionRequested")!.data.reason).toBe("Good start. Add the coach's quote and cut the second paragraph.");
    expect(sent("studentAssignment.approved")).toEqual(["jordan@sa.invalid"]);
    expect(mail.find((m) => m.template === "studentAssignment.submitted")!.data.reviewUrl).toMatch(new RegExp(`/advisor/review\\?open=${id}$`));
    /* Display name only, never the legal name. */
    expect(JSON.stringify(mail)).not.toContain("Jordan Legal");
  });

  it("a resubmission keeps the last file unless a new one is attached or the student drops it", async () => {
    const a = (await call("POST", `/editions/${editionId}/assignments`, "sa_advisor", { studentId: "sa_jordan", kind: "PHOTO", title: "Bench shots", brief: "Two photos." })).json;
    const up = (await call("POST", `/student-assignments/${a.id}/uploads`, "sa_jordan_u", { contentType: "image/png", bytes: 4096 })).json;
    expect((await call("POST", `/student-assignments/${a.id}/submit`, "sa_jordan_u", { r2Key: up.key })).json).toMatchObject({ version: 1, hasFile: true });
    await call("POST", `/student-assignments/${a.id}/revision`, "sa_advisor", { note: "Add captions." });
    const kept = await call("POST", `/student-assignments/${a.id}/submit`, "sa_jordan_u", { text: "1. Captains. 2. The bench." });
    expect(kept.json).toMatchObject({ version: 2, hasFile: true, fileType: "image/png", draftText: "1. Captains. 2. The bench." });
    const dropped = await call("POST", `/student-assignments/${a.id}/submit`, "sa_jordan_u", { text: "Words only now.", keepFile: false });
    expect(dropped.json).toMatchObject({ version: 3, hasFile: false });
    /* Nothing at all to send is still refused. */
    expect((await call("POST", `/student-assignments/${a.id}/submit`, "sa_jordan_u", { keepFile: true })).status).toBe(422);
  });

  it("the database holds the rules too: four states, a note only while back with the student, approved only with its content item", async () => {
    const write = (sql: string) => prisma.$executeRawUnsafe(sql, id);
    await expect(write(`UPDATE "StudentAssignment" SET "reviewState" = 'SPONSOR_REVIEW' WHERE id = $1`)).rejects.toThrow();
    await expect(write(`UPDATE "StudentAssignment" SET "revisionNote" = 'x' WHERE id = $1`)).rejects.toThrow();
    await expect(write(`UPDATE "StudentAssignment" SET "assetId" = NULL WHERE id = $1`)).rejects.toThrow();
    await expect(write(`UPDATE "StudentAssignment" SET "kind" = 'VIDEO' WHERE id = $1`)).rejects.toThrow();
  });
});
