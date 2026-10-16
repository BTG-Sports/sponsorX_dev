import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S9-PMO-01 — Phase 3 acceptance criterion 12: "All intelligence features
   can be disabled per tenant through feature flags"
   (documentation/SponsorX-Phase3-UAT.md).

   model-registry.test.ts switches one feature off and back. This switches
   off EVERY feature in FEATURES, one at a time, for one tenant: each one's
   page answers 403 feature_off (or, for the Zoho push, its nightly run skips
   the tenant); switched back on, it answers again. Another tenant is never
   touched. A feature added to FEATURES without a case here fails the test.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S9-PMO-01 · criterion 12: every intelligence feature switches off per tenant", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { FEATURES, FeatureOffError } = await import("../src/domain/model-registry");
  const { setFlag } = await import("../src/domain/model-admin");
  const { pricingDesk } = await import("../src/domain/pricing-engine");
  const { matchPage } = await import("../src/domain/match-engine");
  const { forecastList } = await import("../src/domain/forecast-engine");
  const { makeGoodList } = await import("../src/domain/makegood-engine");
  const { anomalyDesk } = await import("../src/domain/anomaly-engine");
  const { scenarioDesk } = await import("../src/domain/scenario-engine");
  const { sponsorIntelligence } = await import("../src/domain/sponsor-intelligence");
  const { propertyIntelligence } = await import("../src/domain/property-intelligence");
  const { queueZohoIntelligence } = await import("../src/domain/zoho-intelligence");
  const { attributionDesk } = await import("../src/domain/attribution-desk");

  const T = "ff3_t";
  const OTHER = "ff3_o";
  const NOW = new Date("2026-11-10T20:00:00Z");
  const page = { page: 1, size: 25, skip: 0, take: 25 };
  const actor = (tenantId: string, role: string, extra: Record<string, unknown> = {}) =>
    ({ userId: `ff3_${role}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const admin = (tenantId: string) => actor(tenantId, "BTG_ADMIN");

  /* One read per feature — the page a person would open — or, for the Zoho push, whether tonight's run skips the tenant. */
  const probes: Record<string, (tenantId: string) => Promise<unknown>> = {
    pricing: (t) => pricingDesk(admin(t), { page }, NOW),
    matching: (t) => matchPage(admin(t), "ff3_no_brief", "athlete", page, NOW),
    forecast: (t) => forecastList(admin(t), { page }),
    makegood: (t) => makeGoodList(admin(t), { status: "open", page }, NOW),
    anomalies: (t) => anomalyDesk(admin(t), { tab: "open", page }),
    scenarios: (t) => scenarioDesk(admin(t), page),
    sponsorHub: (t) => sponsorIntelligence(actor(t, "SPONSOR_ADMIN", { sponsorId: `${t}_sp` }), "30d", NOW),
    propertyHub: (t) => propertyIntelligence(actor(t, "PROPERTY_MGR", { propertyId: `${t}_p` }), NOW),
    zohoIntelligence: async (t) => {
      const r = await queueZohoIntelligence(prisma, NOW, { tenantId: t });
      if (r.skipped.includes(t)) throw new FeatureOffError("zohoIntelligence");
      return r;
    },
    attribution: (t) => attributionDesk(admin(t), { tab: "events", page }, NOW),
  };
  /* Off means refused; on means anything but refused (a missing brief is still a 404, not feature_off). */
  const refused = (t: string, f: string) => probes[f]!(t).then(() => false, (e: unknown) => e instanceof FeatureOffError);

  async function clean() {
    for (const t of ["FeatureFlag", "AuditLog", "Property", "Sponsor"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Flags" }, { id: OTHER, name: "Another operator" }] });
    for (const t of [T, OTHER]) {
      await prisma.sponsor.create({ data: { id: `${t}_sp`, tenantId: t, name: "Fit Co" }, select: { id: true } });
      await prisma.property.create({ data: { id: `${t}_p`, tenantId: t, slug: `${t}-northside`, name: "Northside High", kind: "SCHOOL" }, select: { id: true } });
    }
  });
  afterAll(clean);

  it("there is a check here for every feature there is", () => {
    expect(Object.keys(probes).sort()).toEqual([...FEATURES].sort());
  });

  it.each([...FEATURES])("%s: on by default; switched off, refused for that tenant only; switched back on, answers again", async (feature) => {
    expect(await refused(T, feature)).toBe(false);
    await setFlag(admin(T), { feature, tenantId: T, enabled: false, reason: `UAT: switching ${feature} off` });
    expect(await refused(T, feature)).toBe(true);
    expect(await refused(OTHER, feature)).toBe(false);
    await setFlag(admin(T), { feature, tenantId: T, enabled: true, reason: `UAT: switching ${feature} back on` });
    expect(await refused(T, feature)).toBe(false);
  });
});
