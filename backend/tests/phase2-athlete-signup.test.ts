import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { signupVerdict, type AthleteFacts } from "../src/domain/signup-rules";
import { DEFAULT_AGE_TABLE, countryCodeFrom, dueReminders, majorityFor } from "../src/domain/age-of-majority-rules";
import { guardianControls, requiresGuardian } from "../src/domain/guardian-rules";

/* --------------------------------------------------------------------------
   2S1-BE-09 · 2S1-BE-10 · 2S1-BE-12 — athletes and guardians approved
   automatically, against the real API and database. Done when:

   BE-09  An adult with a complete application, a government ID and a
          confirmed email who is not a likely duplicate is approved and can
          sign in without BTG; a likely duplicate goes to BTG's queue; BTG
          admins are emailed for each; Reject withdraws access, ends listings,
          holds payouts and emails the reason; ID files are viewable only by
          BTG admins through short-lived, audited links.
   BE-10  A minor and their guardian are approved without BTG once both
          emails are confirmed, the guardian's ID and proof of guardianship
          and the minor's ID are uploaded and the guardian agreement is
          accepted; a guardian can have several athletes; rejecting a guardian
          rejects all their athletes, and rejecting an athlete does not reject
          the guardian; the staff-confirmation setting holds minors for BTG
          when switched on.
   BE-12  (the age table half) Adulthood follows the athlete's state or
          country, from the date of birth, using the editable table; an
          unknown place counts as 18 and is flagged.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.PUBLIC_INTAKE_TENANT_ID = "as_btg";

/* The private bucket isn't running: a key counts as "in the bucket" once the
   test says the browser uploaded it. Signing the URLs is real. */
const { uploaded } = vi.hoisted(() => ({ uploaded: new Set<string>() }));
vi.mock("../src/lib/storage", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/storage")>();
  return { ...real, privateObjectSize: async (key: string) => (uploaded.has(key) ? 40_960 : null) };
});
vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: req.get("x-test-email") ?? `${id}@as-test.invalid` } : null;
  },
}));

const yearsAgo = (years: number, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

describe("the rules (pure)", () => {
  const adult: AthleteFacts = {
    missingFields: [], hasBirthDate: true, emailConfirmed: true, minor: false, idUploaded: true, guardian: null,
    duplicates: [], emailInUse: false, staffConfirmMinors: false,
  };
  const g = { name: "Carmen Reyes", emailConfirmed: true, idUploaded: true, proofUploaded: true, agreementAccepted: true, rejected: false };

  it("waits on the applicant, approves a clean adult, and gives BTG its reasons", () => {
    expect(signupVerdict({ ...adult, emailConfirmed: false, idUploaded: false, hasBirthDate: false }))
      .toEqual({ outcome: "waiting", missing: ["add your date of birth", "confirm your email", "upload your government ID"] });
    expect(signupVerdict(adult)).toEqual({ outcome: "approve" });
    expect(signupVerdict({ ...adult, duplicates: ["same email as Riley Carter"], emailInUse: true })).toEqual({
      outcome: "review", reasons: ["Likely duplicate athlete: same email as Riley Carter", "Their email already has a SponsorX login"],
    });
  });

  it("a minor needs a school ID and every guardian step; the setting holds them", () => {
    const minor = { ...adult, minor: true, guardian: null };
    expect(signupVerdict({ ...minor, idUploaded: false })).toEqual({ outcome: "waiting", missing: ["upload your school ID", "name your guardian"] });
    expect(signupVerdict({ ...minor, guardian: { ...g, emailConfirmed: false, agreementAccepted: false } })).toEqual({
      outcome: "waiting", missing: ["your guardian opens the link we emailed them", "your guardian accepts the guardian agreement"],
    });
    expect(signupVerdict({ ...minor, guardian: g })).toEqual({ outcome: "approve" });
    expect(signupVerdict({ ...minor, guardian: g, staffConfirmMinors: true })).toMatchObject({ outcome: "review", reasons: [expect.stringMatching(/staff confirm minors/)] });
    expect(signupVerdict({ ...minor, guardian: { ...g, rejected: true } })).toMatchObject({ outcome: "review", reasons: [expect.stringMatching(/rejected by BTG/)] });
  });

  it("the age of majority follows the place; an unknown place is 18 and flagged", () => {
    expect(majorityFor(DEFAULT_AGE_TABLE, "US", "MD")).toEqual({ age: 18, known: true });
    expect(majorityFor(DEFAULT_AGE_TABLE, "US", "AL")).toEqual({ age: 19, known: true });
    expect(majorityFor(DEFAULT_AGE_TABLE, "US", "NE")).toEqual({ age: 19, known: true });
    expect(majorityFor(DEFAULT_AGE_TABLE, "US", "MS")).toEqual({ age: 21, known: true });
    expect(majorityFor(DEFAULT_AGE_TABLE, "CA", "BC")).toEqual({ age: 19, known: true });
    expect(majorityFor(DEFAULT_AGE_TABLE, "KR", null)).toEqual({ age: 19, known: true });
    expect(majorityFor(DEFAULT_AGE_TABLE, "ZZ", "QQ")).toEqual({ age: 18, known: false });
    expect(countryCodeFrom("USA")).toBe("US");
    expect(countryCodeFrom("United Kingdom")).toBe("GB");
    const eighteen = new Date(yearsAgo(18, 1));
    expect(requiresGuardian({ birthDate: eighteen, majorityAge: 18 })).toBe(false);
    expect(requiresGuardian({ birthDate: eighteen, majorityAge: 19 })).toBe(true);
  });

  it("coming of age keeps the guardian in control until the ID, and reminds at 30, 14, 7 and 1 days", () => {
    const adultNow = { birthDate: new Date(yearsAgo(18, 2)), majorityAge: 18 };
    expect(guardianControls({ ...adultNow, guardianId: "g" })).toBe(true);
    expect(guardianControls({ ...adultNow, guardianId: "g", comingOfAgeStartedAt: new Date(), comingOfAgeCompletedAt: new Date() })).toBe(false);
    expect(guardianControls({ ...adultNow, guardianId: null })).toBe(false);
    const now = new Date("2026-10-01T12:00:00Z");
    const due = (days: number) => new Date(now.getTime() + days * 86_400_000);
    expect(dueReminders(due(60), [90], now)).toEqual([]);
    expect(dueReminders(due(30), [90], now)).toEqual([30]);
    expect(dueReminders(due(13), [90, 30], now)).toEqual([14]);
    /* A sweep that was down sends the latest one, not a burst. */
    expect(dueReminders(due(1), [90], now)).toEqual([1]);
    expect(dueReminders(due(1), [90, 30, 14, 7, 1], now)).toEqual([]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S1-BE-09 / -10 / -12 · athletes and guardians approved automatically", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "as_btg";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are asserted field by field
  type Res = { status: number; text: string; json: any };
  const call = async (method: string, path: string, clerk?: string, body?: unknown, email?: string): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}), ...(email ? { "x-test-email": email } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const emails = async () => (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });
  const mailTo = async (template: string, to: string) => (await emails()).filter((m) => m.template === template && m.to === to);

  type Applied = { id: string; token: string; email: string };
  const apply = async (b: { name: string; email: string; birthDate?: string; ageBand?: string; stateCode?: string; countryCode?: string; guardian?: Record<string, string> }): Promise<Applied> => {
    const r = await call("POST", "/applications/intake", undefined, {
      legalName: b.name, displayName: b.name, email: b.email, ...(b.birthDate ? { birthDate: b.birthDate } : {}), ...(b.ageBand ? { ageBand: b.ageBand } : {}),
      stateCode: b.stateCode ?? "MD", ...(b.countryCode ? { countryCode: b.countryCode } : {}), sport: "Basketball", socials: [{ platform: "INSTAGRAM", handle: "h" }],
      ...(b.guardian ? { guardian: b.guardian } : {}),
    });
    expect(r.status, r.text).toBe(201);
    return { id: r.json.id, token: r.json.continuationToken, email: b.email.toLowerCase() };
  };
  const q = (token: string) => `?token=${encodeURIComponent(token)}`;
  const confirmEmail = async (a: Applied) => {
    const [mail] = await mailTo("athlete.applicationReceived", a.email);
    const t = new URL(mail!.data.confirmUrl!).searchParams.get("t")!;
    const r = await call("POST", "/applications/intake/confirm-email", undefined, { token: t });
    expect(r.status, r.text).toBe(200);
    return r.json;
  };
  const markUploaded = async (id: string) => {
    const d = await prisma.accountDocument.findUniqueOrThrow({ where: { id }, select: { r2Key: true } });
    uploaded.add(d.r2Key);
  };
  const uploadId = async (a: Applied, kind: "GOVERNMENT_ID" | "SCHOOL_ID" = "GOVERNMENT_ID") => {
    const up = await call("POST", `/applications/intake/documents${q(a.token)}`, undefined, { kind, filename: "my id.jpg", contentType: "image/jpeg", bytes: 40_960 });
    expect(up.status, up.text).toBe(201);
    expect(up.json.uploadUrl).toMatch(/^https?:\/\//);
    await markUploaded(up.json.document.id);
    const done = await call("POST", `/applications/intake/documents/${up.json.document.id}/confirm${q(a.token)}`);
    expect(done.status, done.text).toBe(200);
    return { documentId: up.json.document.id as string, status: done.json };
  };
  const setupToken = async (guardianEmail: string, athleteName?: string) => {
    const mails = await mailTo("guardian.setup", guardianEmail.toLowerCase());
    const mail = athleteName ? mails.find((m) => m.data.athleteName === athleteName) : mails.at(-1);
    return new URL(mail!.data.setupUrl!).searchParams.get("t")!;
  };
  const guardianUpload = async (token: string, kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF") => {
    const up = await call("POST", `/public/guardian-setup/${encodeURIComponent(token)}/documents`, undefined, {
      kind, ...(kind === "GUARDIANSHIP_PROOF" ? { proofKind: "BIRTH_CERTIFICATE" } : {}), filename: "doc.pdf", contentType: "application/pdf", bytes: 40_960,
    });
    expect(up.status, up.text).toBe(201);
    await markUploaded(up.json.document.id);
    const done = await call("POST", `/public/guardian-setup/${encodeURIComponent(token)}/documents/${up.json.document.id}/confirm`);
    expect(done.status, done.text).toBe(200);
    return done.json;
  };
  const acceptAgreement = async (token: string) => {
    const st = await call("GET", `/public/guardian-setup/${encodeURIComponent(token)}`);
    expect(st.json.agreement, st.text).toMatchObject({ version: 1 });
    const r = await call("POST", `/public/guardian-setup/${encodeURIComponent(token)}/accept`, undefined, { agreementId: st.json.agreement.agreementId, bodyHashShown: st.json.agreement.bodyHash });
    expect(r.status, r.text).toBe(200);
    return r.json;
  };
  const athlete = (id: string) => prisma.athlete.findUniqueOrThrow({
    where: { id }, select: { state: true, autoApproved: true, reviewReasons: true, majorityAge: true, majorityKnown: true, guardianId: true, signupRejectedAt: true },
  });

  async function clean() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "AS BTG" } });
    await prisma.user.createMany({ data: [
      { id: "as_admin", tenantId: T, clerkId: "as_admin", email: "as_admin@as-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "as_netmgr", tenantId: T, clerkId: "as_netmgr", email: "as_netmgr@as-test.invalid", roles: ["NETWORK_MGR"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ─────────────────────────── 2S1-BE-09 · adults ─────────────────────── */

  /* Not "Riley Carter": the intake derives the slug from the name, so that
     applicant took the global slug `riley-carter` — the one the walkthrough
     seed (seed-personas.mts) inserts for its own Riley, failing pilot-school
     with Athlete_slug_key whenever the two files overlapped (2S8-QA-04). */
  let riley: Applied;
  it("BE-09 · an adult with a confirmed email and a government ID is approved and can sign in, with no BTG step", async () => {
    riley = await apply({ name: "Riley Ashford", email: "Riley@AS-test.invalid", birthDate: yearsAgo(20) });
    const st = await call("GET", `/applications/intake/status${q(riley.token)}`);
    expect(st.json).toMatchObject({ state: "SUBMITTED", minor: false, idKind: "GOVERNMENT_ID", missing: ["confirm your email", "upload your government ID"] });
    const confirmed = await confirmEmail(riley);
    expect(confirmed.status.missing).toEqual(["upload your government ID"]);
    expect(confirmed.continuationToken).toBeTruthy();
    const { status } = await uploadId(riley);
    expect(status).toMatchObject({ approved: true, missing: [] });
    expect(await athlete(riley.id)).toMatchObject({ state: "ACTIVE", autoApproved: true, reviewReasons: [] });
    /* The login exists — and the first sign-in with the address claims it. */
    const me = await call("GET", "/me", "clerk_riley", undefined, riley.email);
    expect(me.status, me.text).toBe(200);
    expect(me.json).toMatchObject({ tenantId: T, roles: ["ATHLETE"] });
    expect(await mailTo("athlete.approved", riley.email)).toHaveLength(1);
    /* BTG's admins are emailed a New sign-ups link. */
    const btg = await mailTo("signup.newSignup", "as_admin@as-test.invalid");
    expect(btg.find((m) => m.data.name === "Riley Ashford")?.data).toMatchObject({ outcome: "was approved automatically", reviewUrl: expect.stringContaining(`/admin/new-signups/athletes/${riley.id}`) });
  });

  it("BE-09 · the application needs a date of birth before it can be approved", async () => {
    const band = await apply({ name: "Band Only", email: "band@as-test.invalid", ageBand: "18_PLUS" });
    await confirmEmail(band);
    const { status } = await uploadId(band);
    expect(status.missing).toEqual(["add your date of birth"]);
    expect((await athlete(band.id)).state).toBe("SUBMITTED");
  });

  let dupe: Applied;
  it("BE-09 · a likely duplicate (same name and date of birth) goes to BTG's queue, BTG is emailed, and BTG approves it", async () => {
    dupe = await apply({ name: "Riley Ashford", email: "riley.two@as-test.invalid", birthDate: yearsAgo(20) });
    /* Same name, same date of birth as the approved Riley. */
    await prisma.athlete.update({ where: { id: dupe.id }, data: { birthDate: (await prisma.athlete.findUniqueOrThrow({ where: { id: riley.id }, select: { birthDate: true } })).birthDate } });
    await confirmEmail(dupe);
    const { status } = await uploadId(dupe);
    expect(status).toMatchObject({ approved: false, underReview: true, missing: [] });
    expect(await athlete(dupe.id)).toMatchObject({ state: "SUBMITTED", reviewReasons: ["Likely duplicate athlete: same name and date of birth as Riley Ashford"] });
    const held = (await mailTo("signup.newSignup", "as_admin@as-test.invalid")).find((m) => m.data.outcome === "needs your review");
    expect(held?.data.reasons).toMatch(/same name and date of birth/);
    /* On the desk, under Needs review. */
    const list = await call("GET", "/signups", "as_admin");
    expect(list.status, list.text).toBe(200);
    expect(list.json.signups.find((s: { id: string }) => s.id === dupe.id)).toMatchObject({ state: "NEEDS_REVIEW", kind: "ATHLETE" });
    /* BTG's manual review still works: the existing desk sees it waiting. */
    const desk = await call("GET", `/applications/${dupe.id}`, "as_admin");
    expect(desk.json.state).toBe("SUBMITTED");
    const approved = await call("POST", `/signups/athletes/${dupe.id}/approve`, "as_admin");
    expect(approved.status, approved.text).toBe(200);
    expect(approved.json).toMatchObject({ state: "APPROVED" });
    expect(await athlete(dupe.id)).toMatchObject({ state: "ACTIVE", autoApproved: false });
  });

  it("BE-09 · ID files are read only by BTG, through a five-minute audited link", async () => {
    const detail = await call("GET", `/signups/athletes/${riley.id}`, "as_admin");
    expect(detail.status, detail.text).toBe(200);
    expect(detail.json.checks).toContain("Government ID uploaded");
    const doc = detail.json.documents.find((d: { viewable: boolean }) => d.viewable);
    const link = await call("GET", `/signups/athletes/${riley.id}/documents/${doc.id}`, "as_admin");
    expect(link.status, link.text).toBe(200);
    expect(link.json).toMatchObject({ expiresInSeconds: 300 });
    const grant = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "storage.privateDownloadGrant", entity: "AccountDocument", entityId: doc.id, actorId: "as_admin" }, select: { after: true } });
    expect(grant?.after).toMatchObject({ ttlSeconds: 300 });
    /* Not the athlete themselves, though their own application is theirs to read. */
    expect((await call("GET", `/signups/athletes/${riley.id}/documents/${doc.id}`, "clerk_riley")).status).toBe(403);
    expect((await call("GET", `/signups/athletes/${riley.id}`, "clerk_riley")).status).toBe(403);
  });

  it("BE-09 · Reject withdraws access, ends listings, holds payouts and emails the reason; Reinstate undoes it", async () => {
    const item = await prisma.inventoryItem.create({ data: { tenantId: T, athleteId: riley.id, title: "Clinic", kind: "OTHER", priceCents: 50_000 }, select: { id: true } });
    const listing = await prisma.listing.create({ data: { tenantId: T, sellerAthleteId: riley.id, inventoryItemId: item.id, title: "Clinic with Riley", state: "PUBLISHED" }, select: { id: true } });
    const payout = await prisma.payout.create({ data: { tenantId: T, payeeType: "ATHLETE", payeeId: riley.id, payeeTenantId: T, amountCents: 1000 }, select: { id: true } });

    expect((await call("POST", `/signups/athletes/${riley.id}/reject`, "as_admin", { note: "" })).status).toBe(400);
    const r = await call("POST", `/signups/athletes/${riley.id}/reject`, "as_admin", { note: "This ID doesn't match the name given." });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "REJECTED", can: { reinstate: true } });
    expect((await athlete(riley.id)).state).toBe("SUSPENDED");
    expect((await call("GET", "/me", "clerk_riley")).json?.error?.code).toBe("account_disabled");
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listing.id }, select: { state: true } })).state).toBe("ARCHIVED");
    const decide = await call("POST", `/payouts/${payout.id}/decision`, "as_admin", { decision: "APPROVE" });
    expect(decide.status, decide.text).toBe(409);
    expect(decide.text).toMatch(/on hold/);
    expect((await mailTo("athlete.accountRejected", riley.email)).at(-1)?.data.note).toBe("This ID doesn't match the name given.");

    const back = await call("POST", `/signups/athletes/${riley.id}/reinstate`, "as_admin");
    expect(back.status, back.text).toBe(200);
    expect((await athlete(riley.id)).state).toBe("ACTIVE");
    expect((await call("GET", "/me", "clerk_riley")).status).toBe(200);
    expect((await call("POST", `/payouts/${payout.id}/decision`, "as_admin", { decision: "REJECT", note: "test over" })).status).toBe(200);
    expect(await mailTo("athlete.accountReinstated", riley.email)).toHaveLength(1);
  });

  /* ─────────────────────────── 2S1-BE-10 · minors ─────────────────────── */

  let jordan: Applied;
  let carmenToken = "";
  it("BE-10 · a minor names a guardian, who gets their own page; opening it confirms their email", async () => {
    jordan = await apply({
      name: "Jordan Reyes", email: "jordan@as-test.invalid", birthDate: yearsAgo(16),
      guardian: { legalName: "Carmen Reyes", email: "Carmen@AS-test.invalid", relationship: "PARENT" },
    });
    const a = await athlete(jordan.id);
    expect(a.guardianId).toBeTruthy();
    carmenToken = await setupToken("carmen@as-test.invalid");
    const st = await call("GET", `/applications/intake/status${q(jordan.token)}`);
    expect(st.json).toMatchObject({ minor: true, idKind: "SCHOOL_ID", guardian: { name: "Carmen Reyes", emailConfirmed: false } });
    expect(st.json.missing).toEqual(expect.arrayContaining(["confirm your email", "upload your school ID", "your guardian opens the link we emailed them"]));
    /* An adult can't upload a school ID in place of a government ID; a minor can. */
    expect((await call("POST", `/applications/intake/documents${q(riley.token)}`, undefined, { kind: "SCHOOL_ID", filename: "s.jpg", contentType: "image/jpeg", bytes: 10 })).status).toBe(409);
    await confirmEmail(jordan);
    await uploadId(jordan, "SCHOOL_ID");
    expect((await athlete(jordan.id)).state).toBe("SUBMITTED");

    const opened = await call("POST", "/public/guardian-setup/open", undefined, { token: carmenToken });
    expect(opened.status, opened.text).toBe(200);
    expect(opened.json).toMatchObject({ athlete: { firstName: "Jordan" }, guardian: { emailConfirmed: true }, state: "IN_PROGRESS" });
    expect(opened.json.missing).toEqual(["your government ID", "proof you're the guardian", "the guardian agreement"]);
    /* A forged link reaches nothing. */
    expect((await call("GET", `/public/guardian-setup/${encodeURIComponent(carmenToken.slice(0, -2) + "xx")}`)).status).toBe(400);
  });

  it("BE-10 · with the guardian's ID, proof and agreement in, both are approved with no BTG step", async () => {
    const saved = await call("PATCH", `/public/guardian-setup/${encodeURIComponent(carmenToken)}`, undefined, { legalName: "Carmen Reyes", relationship: "PARENT", phone: "555-0100" });
    expect(saved.status, saved.text).toBe(200);
    await guardianUpload(carmenToken, "GUARDIAN_ID");
    const afterProof = await guardianUpload(carmenToken, "GUARDIANSHIP_PROOF");
    expect(afterProof.proof).toMatchObject({ kind: "BIRTH_CERTIFICATE" });
    expect((await athlete(jordan.id)).state).toBe("SUBMITTED");
    const done = await acceptAgreement(carmenToken);
    expect(done.state).toBe("APPROVED");
    expect(await athlete(jordan.id)).toMatchObject({ state: "ACTIVE", autoApproved: true });
    const carmen = await prisma.guardian.findFirstOrThrow({ where: { tenantId: T, email: "carmen@as-test.invalid" }, select: { id: true, verifiedAt: true, autoVerified: true } });
    expect(carmen).toMatchObject({ autoVerified: true, verifiedAt: expect.any(Date) });
    /* The evidence the open legal question will ask about. */
    const ev = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "guardian.autoVerify", entityId: carmen.id }, select: { after: true } });
    expect((ev?.after as { evidence: string }).evidence).toMatch(/^guardian confirmed by email, with ID and proof, at /);
    const acceptance = await prisma.agreementAcceptance.findFirstOrThrow({ where: { tenantId: T, athleteId: jordan.id, guardianId: carmen.id }, select: { ip: true, bodyHash: true } });
    expect(acceptance.bodyHash).toMatch(/[0-9a-f]{64}/);
    /* Logins for both; the guardian's email says so. */
    expect(await prisma.user.count({ where: { tenantId: T, guardianId: carmen.id, roles: { has: "GUARDIAN" } } })).toBe(1);
    expect(await prisma.user.count({ where: { tenantId: T, athleteId: jordan.id } })).toBe(1);
    expect(await mailTo("guardian.approved", "carmen@as-test.invalid")).toHaveLength(1);
    const btg = (await mailTo("signup.newSignup", "as_admin@as-test.invalid")).map((m) => m.data.name);
    expect(btg).toEqual(expect.arrayContaining(["Jordan Reyes", "Carmen Reyes"]));
  });

  let sam: Applied;
  it("BE-10 · one guardian looks after several athletes — the second needs proof naming THEM and the agreement for them, never the first child's proof", async () => {
    sam = await apply({ name: "Sam Reyes", email: "sam@as-test.invalid", birthDate: yearsAgo(14), guardian: { legalName: "Carmen Reyes", email: "carmen@as-test.invalid", relationship: "PARENT" } });
    const carmen = await prisma.guardian.findMany({ where: { tenantId: T, email: "carmen@as-test.invalid" }, select: { id: true } });
    expect(carmen).toHaveLength(1);
    expect((await athlete(sam.id)).guardianId).toBe(carmen[0]!.id);
    await confirmEmail(sam);
    await uploadId(sam, "SCHOOL_ID");
    const token = await setupToken("carmen@as-test.invalid", "Sam Reyes");
    const st = await call("POST", "/public/guardian-setup/open", undefined, { token });
    /* The short page: her ID is on file; proof for Sam and the agreement for Sam are not. */
    expect(st.json).toMatchObject({ returning: true, idUploaded: true, proof: null });
    expect(st.json.missing).toEqual(["proof you're the guardian", "the guardian agreement"]);
    /* Agreement alone — Jordan's birth certificate doesn't count for Sam: still held. */
    await acceptAgreement(token);
    expect((await athlete(sam.id)).state).toBe("SUBMITTED");
    const held = await call("GET", `/applications/intake/status${q(sam.token)}`);
    expect(held.json.missing).toEqual(["your guardian uploads proof they are your guardian"]);
    /* Proof naming Sam: approved. */
    const after = await guardianUpload(token, "GUARDIANSHIP_PROOF");
    expect(after).toMatchObject({ state: "APPROVED", proof: { kind: "BIRTH_CERTIFICATE" } });
    expect((await athlete(sam.id)).state).toBe("ACTIVE");
    const proofs = await prisma.accountDocument.findMany({ where: { tenantId: T, guardianId: carmen[0]!.id, kind: "GUARDIANSHIP_PROOF" }, select: { wardId: true }, orderBy: { createdAt: "asc" } });
    expect(proofs.map((p) => p.wardId)).toEqual([jordan.id, sam.id]);
    const desk = await call("GET", `/signups/guardians/${carmen[0]!.id}`, "as_admin");
    expect(desk.status, desk.text).toBe(200);
    expect(desk.json.guardianOf.map((w: { name: string }) => w.name)).toEqual(["Jordan Reyes", "Sam Reyes"]);
  });

  it("BE-10 · rejecting an athlete leaves the guardian alone; rejecting the guardian rejects all their athletes", async () => {
    const carmen = await prisma.guardian.findFirstOrThrow({ where: { tenantId: T, email: "carmen@as-test.invalid" }, select: { id: true } });
    expect((await call("POST", `/signups/athletes/${sam.id}/reject`, "as_admin", { note: "Not on this team." })).status).toBe(200);
    expect((await prisma.guardian.findUniqueOrThrow({ where: { id: carmen.id }, select: { rejectedAt: true } })).rejectedAt).toBeNull();
    expect((await athlete(jordan.id)).state).toBe("ACTIVE");
    expect((await call("POST", `/signups/athletes/${sam.id}/reinstate`, "as_admin")).status).toBe(200);

    const r = await call("POST", `/signups/guardians/${carmen.id}/reject`, "as_admin", { note: "The proof is not for these athletes." });
    expect(r.status, r.text).toBe(200);
    expect(r.json.guardianOf.every((w: { state: string }) => w.state === "REJECTED")).toBe(true);
    for (const a of [jordan, sam]) expect(await athlete(a.id)).toMatchObject({ state: "SUSPENDED", signupRejectedAt: expect.any(Date) });
    expect(await prisma.user.count({ where: { tenantId: T, guardianId: carmen.id, disabledAt: { not: null } } })).toBe(1);
    expect((await mailTo("guardian.accountRejected", "carmen@as-test.invalid")).at(-1)?.data.athletes).toBe("Jordan Reyes, Sam Reyes");
    /* A ward rejected with their guardian comes back with the guardian, not alone. */
    expect((await call("POST", `/signups/athletes/${jordan.id}/reinstate`, "as_admin")).status).toBe(409);
    expect((await call("POST", `/signups/guardians/${carmen.id}/reinstate`, "as_admin")).status).toBe(200);
    for (const a of [jordan, sam]) expect(await athlete(a.id)).toMatchObject({ state: "ACTIVE", signupRejectedAt: null });
  });

  it("BE-10 · the staff-confirmation setting holds a complete minor for BTG, and switching it off lets them through", async () => {
    expect((await call("PUT", "/signup-rules/settings", "as_netmgr", { staffConfirmMinors: true })).status).toBe(403);
    expect((await call("PUT", "/signup-rules/settings", "as_admin", { staffConfirmMinors: true })).status).toBe(200);
    const kai = await apply({ name: "Kai Ortiz", email: "kai@as-test.invalid", birthDate: yearsAgo(15), guardian: { legalName: "Lena Ortiz", email: "lena@as-test.invalid", relationship: "LEGAL_GUARDIAN" } });
    await confirmEmail(kai);
    await uploadId(kai, "SCHOOL_ID");
    const token = await setupToken("lena@as-test.invalid");
    await call("POST", "/public/guardian-setup/open", undefined, { token });
    await guardianUpload(token, "GUARDIAN_ID");
    await guardianUpload(token, "GUARDIANSHIP_PROOF");
    const held = await acceptAgreement(token);
    expect(held.state).toBe("HELD");
    expect(await athlete(kai.id)).toMatchObject({ state: "SUBMITTED", reviewReasons: [expect.stringMatching(/staff confirm minors/)] });
    expect((await call("GET", "/signup-rules/settings", "as_netmgr")).json).toEqual({ staffConfirmMinors: true });
    expect((await call("PUT", "/signup-rules/settings", "as_admin", { staffConfirmMinors: false })).status).toBe(200);
    expect((await athlete(kai.id)).state).toBe("ACTIVE");
  });

  /* ───────────────── 2S1-BE-12 · the age of majority by place ─────────── */

  it("BE-12 · adulthood follows the place: an Alabama 18-year-old is a minor and is asked for a guardian", async () => {
    const al = await apply({ name: "Avery Long", email: "avery@as-test.invalid", birthDate: yearsAgo(18, 30), stateCode: "AL" });
    expect(await athlete(al.id)).toMatchObject({ majorityAge: 19, majorityKnown: true });
    const st = await call("GET", `/applications/intake/status${q(al.token)}`);
    expect(st.json).toMatchObject({ minor: true, majorityAge: 19 });
    expect(st.json.missing).toContain("name your guardian");
    const named = await call("POST", `/applications/intake/guardian${q(al.token)}`, undefined, { legalName: "Pat Long", email: "pat@as-test.invalid", relationship: "PARENT" });
    expect(named.status, named.text).toBe(200);
    expect(named.json.guardian).toMatchObject({ name: "Pat Long" });
    expect(await mailTo("guardian.setup", "pat@as-test.invalid")).toHaveLength(1);
    /* An adult is told no guardian is needed. */
    expect((await call("POST", `/applications/intake/guardian${q(riley.token)}`, undefined, { legalName: "X", email: "x@as-test.invalid", relationship: "PARENT" })).status).toBe(409);
  });

  it("BE-12 · an unknown place counts as 18 and is flagged for BTG", async () => {
    const zz = await apply({ name: "Zed Unknown", email: "zed@as-test.invalid", birthDate: yearsAgo(18, 10), countryCode: "ZZ", stateCode: "QQ" });
    expect(await athlete(zz.id)).toMatchObject({ majorityAge: 18, majorityKnown: false });
    await confirmEmail(zz);
    await uploadId(zz);
    expect((await athlete(zz.id)).state).toBe("ACTIVE");
    const list = await call("GET", "/signups", "as_admin");
    const row = list.json.signups.find((s: { id: string }) => s.id === zz.id);
    expect(row.flags[0]).toMatch(/Place not in the age table/);
    expect(list.json.counts.review).toBeGreaterThanOrEqual(1);
  });

  it("BE-12 · BTG admins edit the table; the athletes who live there are worked out again", async () => {
    const t = await call("GET", "/signup-rules/age-table", "as_netmgr");
    expect(t.status, t.text).toBe(200);
    const row = (c: string, r: string) => t.json.rows.find((x: { countryCode: string; regionCode: string }) => x.countryCode === c && x.regionCode === r);
    expect(row("US", "MS").age).toBe(21);
    expect(row("US", "AL").age).toBe(19);
    expect((await call("PUT", "/signup-rules/age-table", "as_netmgr", { countryCode: "US", regionCode: "MD", age: 21 })).status).toBe(403);
    const set = await call("PUT", "/signup-rules/age-table", "as_admin", { countryCode: "US", regionCode: "MD", age: 21 });
    expect(set.status, set.text).toBe(200);
    expect(set.json.athletesUpdated).toBeGreaterThan(0);
    expect((await athlete(riley.id)).majorityAge).toBe(21);
    const add = await call("PUT", "/signup-rules/age-table", "as_admin", { countryCode: "ZZ", age: 20 });
    expect(add.status, add.text).toBe(200);
    const zed = await prisma.athlete.findFirstOrThrow({ where: { tenantId: T, email: "zed@as-test.invalid" }, select: { majorityAge: true, majorityKnown: true } });
    expect(zed).toEqual({ majorityAge: 20, majorityKnown: true });
    const removed = await call("DELETE", `/signup-rules/age-table/${add.json.row.id}`, "as_admin");
    expect(removed.status, removed.text).toBe(200);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: { in: ["ageOfMajority.update", "ageOfMajority.add", "ageOfMajority.remove"] } } })).toBe(3);
    await call("PUT", "/signup-rules/age-table", "as_admin", { countryCode: "US", regionCode: "MD", age: 18 });
  });
});
