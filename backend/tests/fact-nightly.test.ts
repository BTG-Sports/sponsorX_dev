import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   3S1-QA-01 — the nightly fact check (documentation/SponsorX-Fact-Ledger.md §9).

   Every night the worker runs the two checks — the summaries equal the facts;
   the facts agree with the app's records — and keeps the result. A tenant's
   BTG admins are emailed once when its figures stop matching and once when
   they match again, never every night in between; the admin portal's
   integration health shows the latest result and since when it has failed.

   Done when: a nightly check finds the daily summaries equal to the sum of the
   facts, and the facts agreeing with the app's current records. A mismatch
   emails BTG admins once, and again once on recovery, and shows in the admin
   integration-health data.

   Runs here are for days in 2031, scoped to this file's tenant, so nothing
   else in the test database is checked or emailed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-QA-01 · the nightly fact check", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { runNightlyFactCheck, factCheckStatus, FACT_CHECK_HOUR_UTC } = await import("../src/domain/fact-nightly");
  const { fillOrderHistory } = await import("../src/domain/fact-history");
  const { EMAIL_TEMPLATES } = await import("../worker/jobs/send-email.mts");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "fn_t";
  const OTHER = "fn_o";
  const night = (d: string, hour = FACT_CHECK_HOUR_UTC, minute = 5) => new Date(`2031-03-${d}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const run = (d: string, emails = true) => runNightlyFactCheck(prisma, night(d), { emails, tenantId: T });
  const mails = async (template: string) => (await prisma.outboxJob.findMany({
    where: { tenantId: { in: [T, OTHER] }, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" },
  })).map((j) => j.payload as { template: string; to: string; data: Record<string, string> }).filter((p) => p.template === template);

  async function clean() {
    await prisma.factCheckRun.deleteMany({ where: { day: { gte: new Date("2031-01-01T00:00:00Z") } } });
    for (const t of ["CampaignDaySummary", "Fact", "Deliverable", "Earning", "CampaignOrder", "Campaign", "User", "Athlete", "Sponsor", "OutboxJob", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Nightly check" }, { id: OTHER, name: "Another operator" }] });
    await prisma.sponsor.create({ data: { id: "fn_sp", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.athlete.create({ data: {
      id: "fn_ath", tenantId: T, slug: "fn-ath", legalName: "Sam Lee", displayName: "Sam", email: "sam@fn.invalid", sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.user.createMany({ data: [
      { id: "fn_a1", tenantId: T, clerkId: "fn_a1", email: "ana@fn.invalid", roles: ["BTG_ADMIN"] },
      { id: "fn_a2", tenantId: T, clerkId: "fn_a2", email: "ben@fn.invalid", roles: ["BTG_ADMIN"] },
      { id: "fn_a3", tenantId: T, clerkId: "fn_a3", email: "gone@fn.invalid", roles: ["BTG_ADMIN"], disabledAt: new Date("2026-01-01") },
      { id: "fn_f1", tenantId: T, clerkId: "fn_f1", email: "fin@fn.invalid", roles: ["FINANCE"] },
      { id: "fn_o1", tenantId: OTHER, clerkId: "fn_o1", email: "other@fn.invalid", roles: ["BTG_ADMIN"] },
    ] });
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04" || j.id === "SX-05").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.campaign.create({ data: {
      id: "fn_c", tenantId: T, sponsorId: "fn_sp", name: "Fall tacos", budget: 500000, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"), state: "ACTIVE",
    } });
    /* An accepted order written straight to the database — the app's record, with no facts: the figures don't match. */
    await prisma.campaignOrder.create({ data: {
      id: "fn_o1", tenantId: T, campaignId: "fn_c", athleteId: "fn_ath", jobId: "SX-04", compensation: 10000, sellPrice: 20000,
      usageRights: "90 days", dueDate: new Date("2026-09-30"), state: "ACTIVE", acceptedAt: new Date("2026-09-05T12:00:00Z"),
    } });
  });

  afterAll(clean);

  it("waits for its hour, then runs once that day — a second tick or a second worker finds it done", async () => {
    expect(await runNightlyFactCheck(prisma, night("01", FACT_CHECK_HOUR_UTC - 1, 59), { emails: true, tenantId: T })).toEqual({ status: "not-yet" });
    expect(await prisma.factCheckRun.count({ where: { day: new Date("2031-03-01T00:00:00Z") } })).toBe(0);
    const first = await run("01");
    expect(first).toMatchObject({ status: "ran", day: "2031-03-01", ok: false, failingTenants: [T] });
    expect(await run("01")).toEqual({ status: "already-ran" });
    expect(await runNightlyFactCheck(prisma, night("01", 23), { emails: true, tenantId: T })).toEqual({ status: "already-ran" });
  });

  it("a mismatch emails each of the tenant's active BTG admins once, in plain words — nobody else", async () => {
    const failed = await mails("facts.checkFailed");
    expect(failed.map((m) => m.to).sort()).toEqual(["ana@fn.invalid", "ben@fn.invalid"]);
    expect(failed[0]!.data.lines).toContain("• Fall tacos — amount booked (sponsor price): the app says $200.00, the report figures say $0.00");
    expect(failed[0]!.data.count).toBe(String(failed[0]!.data.lines.split("\n").length));
    expect(failed[0]!.data.healthUrl).toMatch(/\/admin\/integrations$/);
    const rendered = EMAIL_TEMPLATES["facts.checkFailed"]!(failed[0]!.data);
    expect(rendered.subject).toBe("SponsorX report figures don't match the app");
    expect(rendered.text).toContain("Nothing in the app's records has changed");
    expect(rendered.text).not.toContain("undefined");
  });

  it("still failing the next night: recorded, and no second email", async () => {
    expect(await run("02")).toMatchObject({ status: "ran", ok: false, emailsSent: 0 });
    expect(await mails("facts.checkFailed")).toHaveLength(2);
  });

  it("the admin portal's integration health shows it — for this tenant only", async () => {
    const mine = await factCheckStatus(prisma, T, true);
    expect(mine).toMatchObject({ matches: false, failingSince: "2031-03-01", emails: true, lastError: null });
    expect(mine.differenceCount).toBeGreaterThan(0);
    expect(mine.differences.map((d) => d.what)).toContain("Fall tacos — amount booked (sponsor price): the app says $200.00, the report figures say $0.00");
    const theirs = await factCheckStatus(prisma, OTHER, true);
    expect(theirs).toMatchObject({ matches: true, failingSince: null, differences: [], differenceCount: 0 });
  });

  it("once the figures match again, one email says so — with since when they had not", async () => {
    await fillOrderHistory(prisma, { tenantId: T });
    expect(await run("03")).toMatchObject({ status: "ran", ok: true, failingTenants: [], emailsSent: 2 });
    const back = await mails("facts.checkRecovered");
    expect(back.map((m) => [m.to, m.data.since]).sort()).toEqual([["ana@fn.invalid", "2031-03-01"], ["ben@fn.invalid", "2031-03-01"]]);
    expect(EMAIL_TEMPLATES["facts.checkRecovered"]!(back[0]!.data).text).toContain("(they had not matched since 2031-03-01)");
    expect(await factCheckStatus(prisma, T, true)).toMatchObject({ matches: true, failingSince: null, differences: [] });
    expect(await mails("facts.checkFailed")).toHaveLength(2);
    expect((await prisma.outboxJob.count({ where: { tenantId: OTHER } }))).toBe(0);
  });

  it("with emails switched off it still runs and records, and sends nothing", async () => {
    await prisma.campaignOrder.create({ data: {
      id: "fn_o2", tenantId: T, campaignId: "fn_c", athleteId: "fn_ath", jobId: "SX-05", compensation: 5000, sellPrice: 9000,
      usageRights: "90 days", dueDate: new Date("2026-09-30"), state: "ACTIVE", acceptedAt: new Date("2026-09-06T12:00:00Z"),
    }, select: { id: true } });
    const before = await prisma.outboxJob.count({ where: { tenantId: T } });
    expect(await run("04", false)).toMatchObject({ status: "ran", ok: false, emailsSent: 0 });
    expect(await prisma.outboxJob.count({ where: { tenantId: T } })).toBe(before);
    expect(await factCheckStatus(prisma, T, false)).toMatchObject({ matches: false, failingSince: "2031-03-04", emails: false });
  });

  it("a check that could not run is tried again on the next tick; one cut short by a dead worker is taken over after an hour", async () => {
    await prisma.factCheckRun.create({ data: { day: new Date("2031-03-05T00:00:00Z"), finishedAt: night("05", 19, 1), error: "connection lost" }, select: { id: true } });
    expect(await run("05")).toMatchObject({ status: "ran" });
    expect(await prisma.factCheckRun.findUnique({ where: { day: new Date("2031-03-05T00:00:00Z") }, select: { error: true } })).toEqual({ error: null });

    await prisma.factCheckRun.create({ data: { day: new Date("2031-03-06T00:00:00Z"), startedAt: night("06", 19, 0) }, select: { id: true } });
    expect(await runNightlyFactCheck(prisma, night("06", 19, 30), { emails: true, tenantId: T })).toEqual({ status: "already-ran" });
    expect(await runNightlyFactCheck(prisma, night("06", 20, 30), { emails: true, tenantId: T })).toMatchObject({ status: "ran" });
  });
});
