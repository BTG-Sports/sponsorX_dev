import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  CONSENT_PURPOSES,
  CURRENT_SPONSOR_CONTACT_VERSION,
  SPONSOR_CONTACT_TEXT,
  sponsorContactFor,
} from "../src/domain/fan-consent";

/* --------------------------------------------------------------------------
   2S6-BE-03 — "Sponsor may contact me about offers" consent option.
   2S6-INT-03 — Consent-gated lead push to Zoho.

   "New consent purpose with its own dated text version; checkbox separate and
   unticked by default; only claims carrying it expose the address to the
   sponsor (RBAC §7.2/§10 amended), enforced in the query; unsubscribe
   withdraws it."  (The checkbox is asserted in the web app's
   tests/redeem-page.test.ts.)

   "Claims with sponsor-contact consent enqueue zoho.pushLead; claims without
   it, or withdrawn, never do — excluded at query level."

   The claims are made through the real public claim route; the sponsor reads
   leads through the real authenticated route (only Clerk is stubbed); the
   Zoho job runs through the worker's own handler into a fake org.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
process.env.INTAKE_TOKEN_SECRET ??= "test-intake-secret-test-intake-secret";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@leads-test.invalid` } : null;
  },
}));

describe("2S6-BE-03 · a new purpose with its own dated wording (pure)", () => {
  it("adds sponsor-contact, versioned by date, with its own text", () => {
    expect(CONSENT_PURPOSES).toEqual(["reward-delivery", "sponsor-contact"]);
    expect(CURRENT_SPONSOR_CONTACT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SPONSOR_CONTACT_TEXT[CURRENT_SPONSOR_CONTACT_VERSION]).toMatch(/sponsor .* contact me/i);
  });

  it("is optional, and never stands without an address given with the delivery consent", () => {
    const delivery = { version: "2026-09-01", purpose: "reward-delivery" as const, at: new Date() };
    expect(sponsorContactFor(delivery, null)).toBeNull();
    expect(sponsorContactFor(delivery, { version: CURRENT_SPONSOR_CONTACT_VERSION })?.version).toBe(CURRENT_SPONSOR_CONTACT_VERSION);
    expect(() => sponsorContactFor(null, { version: CURRENT_SPONSOR_CONTACT_VERSION })).toThrow(/extends an email address/);
    expect(() => sponsorContactFor(delivery, { version: "1999-01-01" })).toThrow(/not a consent version this system has ever shown/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("sponsor-contact consent and fan leads, on the path a request takes", async () => {
  const { prisma } = await import("../src/db/client");
  const { withdrawFanConsent } = await import("../src/domain/reward");
  const { issueUnsubscribeToken } = await import("../src/lib/unsubscribe-token");
  const jobs = await import("../worker/jobs/zoho-sync.mts");
  const { FakeZoho } = await import("./support/fake-zoho");
  const { createApp } = await import("../src/app");

  const T = "fl_tenant";
  const DELIVERY = { version: "2026-09-01", purpose: "reward-delivery" };
  const SPONSOR = { version: CURRENT_SPONSOR_CONTACT_VERSION };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const claim = (token: string, body: object) => call("POST", `/public/rewards/${token}/claim`, null, body);

  async function clean() {
    for (const t of ["OutboxJob", "AuditLog", "RewardEvent", "RewardToken", "Reward", "Campaign", "Athlete", "User", "Sponsor"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fan leads test tenant" } });
    await prisma.sponsor.createMany({ data: [{ id: "fl_sponsor", tenantId: T, name: "Rosa's Tacos" }, { id: "fl_other", tenantId: T, name: "Other Co" }] });
    await prisma.campaign.createMany({ data: [
      { id: "fl_campaign", tenantId: T, sponsorId: "fl_sponsor", name: "Fall tacos", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"), state: "ACTIVE" },
      { id: "fl_campaign_other", tenantId: T, sponsorId: "fl_other", name: "Other", budget: 100_000, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"), state: "ACTIVE" },
    ] });
    await prisma.athlete.create({ data: { id: "fl_ath", tenantId: T, slug: "fl-ath", legalName: "A", displayName: "A", email: "a@fl.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.reward.create({ data: { id: "fl_reward", tenantId: T, campaignId: "fl_campaign", offerText: "Free taco", terms: "One per fan", expiresAt: new Date(Date.now() + 30 * 864e5), state: "ACTIVE" } });
    await prisma.rewardToken.createMany({ data: ["ticked", "email_only", "no_email", "withdrawn", "zoho_tick", "zoho_none", "zoho_late"].map((k) => (
      { id: `fl_tok_${k}`, tenantId: T, rewardId: "fl_reward", token: `fl-token-${k}`, athleteId: "fl_ath" }
    )) });
    await prisma.user.createMany({ data: [
      { id: "fl_sponsor_admin", tenantId: T, clerkId: "fl_sponsor_admin", email: "s@fl.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "fl_sponsor" },
      { id: "fl_other_admin", tenantId: T, clerkId: "fl_other_admin", email: "o@fl.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "fl_other" },
      { id: "fl_campaign_mgr", tenantId: T, clerkId: "fl_campaign_mgr", email: "c@fl.invalid", roles: ["CAMPAIGN_MGR"] },
    ] });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("2S6-BE-03", () => {
    it("the fan page is told the second box's own wording and version", async () => {
      const r = await call("GET", "/public/rewards/fl-token-ticked", null);
      expect(r.json.sponsorContact).toEqual({ version: CURRENT_SPONSOR_CONTACT_VERSION, purpose: "sponsor-contact", text: SPONSOR_CONTACT_TEXT[CURRENT_SPONSOR_CONTACT_VERSION] });
      expect(r.json.consent.purpose).toBe("reward-delivery");
    });

    it("only claims carrying the sponsor-contact consent expose the address — and only to that sponsor", async () => {
      expect((await claim("fl-token-ticked", { fanEmail: "yes@fan.invalid", consent: DELIVERY, sponsorContact: SPONSOR })).status).toBe(201);
      expect((await claim("fl-token-email_only", { fanEmail: "voucher-only@fan.invalid", consent: DELIVERY })).status).toBe(201);
      expect((await claim("fl-token-no_email", {})).status).toBe(201);
      /* Ticked without an address — refused, nothing recorded. */
      expect((await claim("fl-token-no_email", { sponsorContact: SPONSOR })).status).toBe(422);

      const leads = await call("GET", "/campaigns/fl_campaign/leads", "fl_sponsor_admin");
      expect(leads.status).toBe(200);
      expect(leads.json.leads.map((l: { email: string }) => l.email)).toEqual(["yes@fan.invalid"]);
      expect(leads.text).not.toContain("voucher-only@fan.invalid");

      /* Another sponsor cannot read this campaign's leads; a BTG role denied the field cannot either. */
      expect((await call("GET", "/campaigns/fl_campaign/leads", "fl_other_admin")).status).toBe(403);
      expect((await call("GET", "/campaigns/fl_campaign/leads", "fl_campaign_mgr")).status).toBe(403);
    });

    it("the one-tap unsubscribe withdraws it — the lead disappears from the sponsor's query", async () => {
      await claim("fl-token-withdrawn", { fanEmail: "changed-mind@fan.invalid", consent: DELIVERY, sponsorContact: SPONSOR });
      const before = await call("GET", "/campaigns/fl_campaign/leads", "fl_sponsor_admin");
      expect(before.json.leads.map((l: { email: string }) => l.email)).toContain("changed-mind@fan.invalid");

      const ev = await prisma.rewardEvent.findFirstOrThrow({ where: { tokenId: "fl_tok_withdrawn", type: "CLAIM" }, select: { id: true } });
      expect(await withdrawFanConsent(issueUnsubscribeToken(ev.id))).toEqual({ withdrawn: true });
      const row = await prisma.rewardEvent.findUniqueOrThrow({ where: { id: ev.id }, select: { consentWithdrawnAt: true, sponsorContactWithdrawnAt: true } });
      expect(row.sponsorContactWithdrawnAt).toEqual(row.consentWithdrawnAt);
      expect(row.sponsorContactWithdrawnAt).not.toBeNull();

      const after = await call("GET", "/campaigns/fl_campaign/leads", "fl_sponsor_admin");
      expect(after.json.leads.map((l: { email: string }) => l.email)).toEqual(["yes@fan.invalid"]);
    });

    it("Postgres refuses a sponsor-contact consent with no address behind it", async () => {
      await expect(prisma.rewardEvent.create({ data: { tenantId: T, tokenId: "fl_tok_no_email", type: "CLAIM", sponsorContactVersion: CURRENT_SPONSOR_CONTACT_VERSION } })).rejects.toThrow();
    });
  });

  describe("2S6-INT-03", () => {
    const leadJobs = (fanEventId: string) =>
      prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.pushLead", payload: { path: ["fanEventId"], equals: fanEventId } }, select: { payload: true } });
    const claimId = async (tokenId: string) =>
      (await prisma.rewardEvent.findFirstOrThrow({ where: { tokenId, type: "CLAIM" }, select: { id: true } })).id;
    const run = (zoho: InstanceType<typeof FakeZoho>, fanEventId: string) =>
      jobs.handlePushLead({ db: prisma, zoho: () => zoho as never }, { tenantId: T, fanEventId } as never);

    it("a claim with the tick enqueues zoho.pushLead, and the worker makes it a Zoho Lead", async () => {
      await claim("fl-token-zoho_tick", { fanEmail: "lead@fan.invalid", consent: DELIVERY, sponsorContact: SPONSOR });
      const id = await claimId("fl_tok_zoho_tick");
      expect(await leadJobs(id)).toHaveLength(1);

      const zoho = new FakeZoho();
      await run(zoho, id);
      const [lead] = zoho.all("Leads");
      expect(lead).toMatchObject({ SponsorX_ID: `fanlead:${id}`, Email: "lead@fan.invalid", Company: "Rosa's Tacos", Lead_Source: "SponsorX QR reward" });
      expect((await prisma.rewardEvent.findUniqueOrThrow({ where: { id }, select: { zohoLeadId: true } })).zohoLeadId).toBe(lead!.id);
      /* A retried job does not make a second Lead. */
      await run(zoho, id);
      expect(zoho.all("Leads")).toHaveLength(1);
    });

    it("a claim without the tick never enqueues one", async () => {
      await claim("fl-token-zoho_none", { fanEmail: "no-lead@fan.invalid", consent: DELIVERY });
      expect(await leadJobs(await claimId("fl_tok_zoho_none"))).toHaveLength(0);
    });

    it("a fan who withdraws before the push is excluded at query level — nothing reaches Zoho", async () => {
      await claim("fl-token-zoho_late", { fanEmail: "late@fan.invalid", consent: DELIVERY, sponsorContact: SPONSOR });
      const id = await claimId("fl_tok_zoho_late");
      expect(await leadJobs(id)).toHaveLength(1);
      await withdrawFanConsent(issueUnsubscribeToken(id));
      const zoho = new FakeZoho();
      await run(zoho, id);
      expect(zoho.all("Leads")).toHaveLength(0);
      expect(zoho.writes).toHaveLength(0);
    });
  });
});
