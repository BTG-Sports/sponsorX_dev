import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S8-BE-01 — a model version can be activated, rolled back and compared
   without deploying code.
   3S8-OPS-01 — every intelligence feature can be disabled per tenant.
   Under the governance policy 3S0-PMO-02 (documentation/SponsorX-Model-Governance.md).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S8-BE-01 / 3S8-OPS-01 · the model registry and feature flags", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const A = await import("../src/domain/model-admin");
  const { activeModel, FeatureOffError } = await import("../src/domain/model-registry");
  const { runForecasts, forecastList } = await import("../src/domain/forecast-engine");
  const { riskOf, riskWith } = await import("../src/domain/forecast-rules");
  const { ForbiddenError } = await import("../src/auth/errors");

  const T = "mreg_t";
  const OTHER = "mreg_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const actor = (tenantId: string, role: string, userId = `mreg_${role}`) =>
    ({ userId, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const ana = actor(T, "BTG_ADMIN", "mreg_ana");
  const bo = actor(T, "BTG_ADMIN", "mreg_bo");
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const versions = async (key: string) => (await A.modelRegistry(ana, NOW)).models.find((m) => m.key === key)!;

  async function clean() {
    for (const t of ["ModelVersion", "FeatureFlag", "AuditLog", "CampaignForecastAlert", "CampaignForecast", "CampaignPacing", "Campaign", "Sponsor", "User"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Registry" }, { id: OTHER, name: "Another operator" }] });
    await prisma.user.createMany({ data: [
      { id: "mreg_ana", tenantId: T, clerkId: "mreg_ana", email: "ana@mreg.invalid", roles: ["BTG_ADMIN"] },
      { id: "mreg_bo", tenantId: T, clerkId: "mreg_bo", email: "bo@mreg.invalid", roles: ["BTG_ADMIN"] },
    ] });
    await prisma.sponsor.create({ data: { id: "mreg_sp", tenantId: T, name: "Fit Co" }, select: { id: true } });
    /* An active campaign with nothing booked: forecast every night, so the stamp can be read. */
    await prisma.campaign.create({ data: { id: "mreg_c", tenantId: T, sponsorId: "mreg_sp", name: "Fall push", budget: 1, startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30"), state: "ACTIVE" }, select: { id: true } });
  });

  afterAll(clean);

  it("before any change, every engine runs its built-in version, with its settings and safe ranges", async () => {
    const r = await A.modelRegistry(ana, NOW);
    expect(r.models.map((m) => [m.key, m.activeVersion, m.versions.map((v) => `${v.version}:${v.status}`)])).toEqual([
      ["pricing", "1.0.0", ["1.0.0:active"]], ["matching", "2.0.0", ["2.0.0:active"]], ["forecast", "2.0.0", ["2.0.0:active"]],
      ["makegood", "1.0.0", ["1.0.0:active"]], ["anomalies", "1.0.0", ["1.0.0:active"]],
    ]);
    expect(r.models.find((m) => m.key === "forecast")!.thresholds.find((t) => t.key === "atRiskBelow")).toMatchObject({ value: 0.5, min: 0.3, max: 0.7 });
    expect(r.models.find((m) => m.key === "matching")!.factors).toHaveLength(8);
    expect(r.flags.filter((f) => f.tenantId === T).every((f) => f.enabled)).toBe(true);
    expect(new Set(r.flags.map((f) => f.tenantId))).toEqual(new Set([T]));
  });

  it("a change inside the safe range goes live at once, automatically — and the engine uses it from its next run", async () => {
    const out = await A.changeSettings(ana, "forecast", { values: { atRiskBelow: 0.45 }, reason: "Fewer at-risk alerts in a slow month" }, NOW);
    expect(out).toMatchObject({ version: "2.1.0", status: "active", heldBecause: [] });
    expect(out.model.versions.map((v) => `${v.version}:${v.status}`)).toEqual(["2.1.0:active", "2.0.0:retired"]);
    expect((await activeModel(prisma, T, "forecast")).t).toMatchObject({ atRiskBelow: 0.45, watchBelow: 0.8 });
    /* 48% was at risk under 2.0.0; it is on watch under 2.1.0. */
    expect(riskOf(0.48)).toBe("at_risk");
    expect(riskWith(0.48, (await activeModel(prisma, T, "forecast")).t as never)).toBe("watch");
    await runForecasts(prisma, NOW, { tenantId: T });
    expect((await prisma.campaignForecast.findFirstOrThrow({ where: { tenantId: T }, select: { modelVersion: true } })).modelVersion).toBe("forecast-rules@2.1.0");
    expect((await versions("forecast")).versions[0]!.metrics).toEqual([{ label: "Outputs made", value: 1 }]);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "model.autoActivate", actorId: null } })).toBe(1);
  });

  it("a change outside the safe range is held for a second person — never the proposer — then activated", async () => {
    const out = await A.changeSettings(ana, "forecast", { values: { atRiskBelow: 0.75 }, reason: "Try a much stricter at-risk line" }, NOW);
    expect(out).toMatchObject({ version: "2.2.0", status: "draft" });
    expect(out.heldBecause[0]).toContain("outside the safe range 0.3–0.7");
    await expect(A.activateVersion(ana, "forecast", "2.2.0", { reason: "Skipping the check here" })).rejects.toBeInstanceOf(A.ModelStateError);
    await expect(A.validateVersion(ana, "forecast", "2.2.0", { reason: "Checking my own change" })).rejects.toThrow(/second person/);
    await A.validateVersion(bo, "forecast", "2.2.0", { reason: "Checked against last quarter" });
    const m = await A.activateVersion(bo, "forecast", "2.2.0", { reason: "Going with the stricter line" });
    expect(m.versions.map((v) => `${v.version}:${v.status}`)).toEqual(["2.2.0:active", "2.1.0:retired", "2.0.0:retired"]);
  });

  it("roll back to any retired version, with no deployment; compare versions by their settings", async () => {
    const m = await A.rollbackModel(ana, "forecast", { toVersion: "2.0.0", reason: "Back to the built-in settings" });
    expect(m.activeVersion).toBe("2.0.0");
    expect(m.versions.map((v) => [v.version, v.status, v.settings.atRiskBelow])).toEqual([["2.2.0", "retired", 0.75], ["2.1.0", "retired", 0.45], ["2.0.0", "active", 0.5]]);
    await expect(A.rollbackModel(ana, "forecast", { toVersion: "2.0.0", reason: "It is already active" })).rejects.toBeInstanceOf(A.ModelStateError);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: { in: ["model.versionCreate", "model.validate", "model.activate", "model.rollback"] } } })).toBe(5);
  });

  it("refused: an unknown setting, a share above 1, a short reason, an unknown model", async () => {
    await expect(A.changeSettings(ana, "forecast", { values: { nope: 1 }, reason: "A setting that does not exist" })).rejects.toBeInstanceOf(A.ModelInputError);
    await expect(A.changeSettings(ana, "forecast", { values: { watchBelow: 1.5 }, reason: "More than everything" })).rejects.toBeInstanceOf(A.ModelInputError);
    await expect(A.changeSettings(ana, "makegood", { values: { windowDays: 10.5 }, reason: "Half a day longer" })).rejects.toBeInstanceOf(A.ModelInputError);
    await expect(A.changeSettings(ana, "forecast", { values: { atRiskBelow: 0.4 }, reason: "short" })).rejects.toBeInstanceOf(A.ModelInputError);
    await expect(A.changeSettings(ana, "weather", { values: { x: 1 }, reason: "No such model at all" })).rejects.toBeInstanceOf(A.ModelNotFoundError);
  });

  it("a feature switched off for a tenant: its nightly run skips it and its pages say so; switched on, it resumes", async () => {
    const f = await A.setFlag(ana, { feature: "forecast", tenantId: T, enabled: false, reason: "This client does not buy forecasting" });
    expect(f).toEqual({ feature: "forecast", tenantId: T, tenantName: "Registry", enabled: false });
    expect(await runForecasts(prisma, new Date("2026-11-11T20:00:00Z"), { tenantId: T })).toMatchObject({ tenants: 0, skipped: [T] });
    await expect(forecastList(actor(T, "BTG_ADMIN"), { page })).rejects.toBeInstanceOf(FeatureOffError);
    expect((await A.modelRegistry(ana, NOW)).flags.find((x) => x.feature === "forecast" && x.tenantId === T)!.enabled).toBe(false);
    await A.setFlag(ana, { feature: "forecast", tenantId: T, enabled: true, reason: "They signed up for forecasting" });
    expect((await forecastList(actor(T, "BTG_ADMIN"), { page })).counts.active).toBe(1);
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "flag.set" } })).toBe(2);
    await expect(A.setFlag(ana, { feature: "weather", tenantId: T, enabled: false, reason: "No such feature here" })).rejects.toBeInstanceOf(A.ModelInputError);
  });

  it("who: a BTG admin manages only its own tenant; a super admin any; nobody else", async () => {
    await expect(A.setFlag(ana, { feature: "pricing", tenantId: OTHER, enabled: false, reason: "Reaching across tenants" })).rejects.toBeInstanceOf(A.ModelNotFoundError);
    await A.setFlag(actor(T, "SUPER_ADMIN"), { feature: "pricing", tenantId: OTHER, enabled: false, reason: "Paused for the other operator" });
    expect(await prisma.auditLog.count({ where: { tenantId: OTHER, action: "flag.set" } })).toBe(1);
    /* The other tenant's admin sees its own built-in versions, none of this tenant's changes. */
    expect((await A.modelRegistry(actor(OTHER, "BTG_ADMIN"), NOW)).models.find((m) => m.key === "forecast")!.versions).toHaveLength(1);
    for (const a of [actor(T, "CAMPAIGN_MGR"), actor(T, "SALES"), actor(T, "SPONSOR_ADMIN"), actor(T, "FINANCE")]) {
      await expect(A.modelRegistry(a, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
