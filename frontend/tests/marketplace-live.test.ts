import { afterEach, describe, expect, it, vi } from "vitest";

import { budgetCents, stateCodesFor, toBriefBody, BriefRequestInvalid } from "@/lib/brief-request";
import { toJob, toPkg } from "@/lib/marketplace-live";

/* --------------------------------------------------------------------------
   P4-FE-01 — "A sponsor browses real packages and inventory and submits a
   real brief — request/reserve, not self-checkout."

   The frontend half: the API's catalogue becomes the cards (sponsor prices,
   whole dollars), and the drawer's fields become exactly the body POST
   /api/v1/briefs accepts. The backend's brief-contract suite parses this
   same function's output with the real CampaignBriefInput and files it as a
   signed-in sponsor, so the two cannot drift.
   -------------------------------------------------------------------------- */

const vars = vi.hoisted(() => ({ actor: null as unknown, calls: [] as { path: string; init?: RequestInit }[], status: 201 }));
/* P4-FE-09 — a sent request may already be a campaign; the action refreshes the Campaigns page. */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/api", () => ({
  fetchActor: async () => vars.actor,
  apiFetch: async (path: string, init?: RequestInit) => {
    vars.calls.push({ path, init });
    return Response.json({ id: "brief_new", state: "DRAFT" }, { status: vars.status });
  },
}));

const base = {
  objective: "Drive foot traffic to our Annapolis opening",
  budget: "$1,500–$2,400", start: "2026-10-05", durationWeeks: 4,
  sport: "Basketball", geo: "DMV", tier: "Creator", category: "RESTAURANT", message: "Weekend focus",
  packageId: "pkg_local_blitz", jobName: null,
};

describe("the live catalogue renders at sponsor prices", () => {
  it("formats a package band, athlete range and contents", () => {
    expect(toPkg({
      id: "p1", name: "Local Blitz", priceLow: 1500, priceHigh: 2400, athleteCountMin: 5, athleteCountMax: 9,
      lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }], includes: [{ kind: "REPORT", code: "BASIC_REPORT" }],
      exclusivity: false, durationWeeks: 4,
    })).toMatchObject({ id: "p1", price: "$1,500–$2,400", athletes: "5–9", includes: "SX-02 × 1 per athlete · basic report", state: "ACTIVE" });
  });
  it("shows a job's sell band", () => {
    expect(toJob({ id: "SX-02", name: "Sponsored Post", sellLow: 125, sellHigh: 250 })).toEqual({ id: "SX-02", name: "Sponsored Post", price: "$125–$250" });
  });
});

describe("the drawer's fields become the API's brief", () => {
  it("budget is cents, from the band's lower bound", () => {
    expect(budgetCents("$1,500–$2,400")).toBe(150_000);
    expect(budgetCents("750")).toBe(75_000);
    expect(() => budgetCents("soon")).toThrow(BriefRequestInvalid);
  });
  it("geography becomes state codes", () => {
    expect(stateCodesFor("DMV")).toEqual(["DC", "MD", "VA"]);
    expect(stateCodesFor("Baltimore, MD")).toEqual(["MD"]);
    expect(stateCodesFor("Kigali, RW")).toEqual([]); // not a US state — no targeting guessed
    expect(stateCodesFor("")).toEqual([]);
  });
  it("builds the full body", () => {
    expect(toBriefBody({ ...base, sponsorId: "sp_1" })).toEqual({
      sponsorId: "sp_1",
      objective: "Drive foot traffic to our Annapolis opening\n\nPreferred tier: Creator\n\nNote: Weekend focus",
      budget: 150_000, packageId: "pkg_local_blitz",
      startDate: "2026-10-05", endDate: "2026-11-02",
      sports: ["Basketball"], stateCodes: ["DC", "MD", "VA"], categories: ["RESTAURANT"],
    });
  });
  it("drops a category outside the closed vocabulary rather than sending free text", () => {
    expect(toBriefBody({ ...base, category: "Quick-service restaurant", sponsorId: "s" }).categories).toEqual([]);
  });
});

describe("submitBrief files a real brief for the signed-in sponsor only", async () => {
  const { submitBrief } = await import("@/app/(app)/sponsor/marketplace/actions");
  afterEach(() => { vars.calls.length = 0; vars.status = 201; });

  it("POSTs to /briefs with the caller's own sponsor id", async () => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["SPONSOR_ADMIN"], sponsorId: "sp_own" } };
    /* P4-FE-09 — with the sponsor-safe status (from the state when the API sent none). */
    expect(await submitBrief(base)).toEqual({
      ok: true, id: "brief_new", status: { key: "REVIEWING", text: "BTG is reviewing your request — usually within a working day" },
    });
    expect(vars.calls[0]!.path).toBe("/briefs");
    expect(vars.calls[0]!.init!.method).toBe("POST");
    expect(JSON.parse(String(vars.calls[0]!.init!.body)).sponsorId).toBe("sp_own");
  });

  it("refuses without a sponsor account, and sends nothing", async () => {
    vars.actor = { status: "anonymous" };
    expect((await submitBrief(base)).ok).toBe(false);
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["BTG_ADMIN"], sponsorId: null } };
    expect((await submitBrief(base)).ok).toBe(false);
    expect(vars.calls).toHaveLength(0);
  });

  it("says so when the API refuses", async () => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["SPONSOR_ADMIN"], sponsorId: "sp_own" } };
    vars.status = 403;
    expect(await submitBrief(base)).toEqual({ ok: false, error: expect.stringMatching(/can't file briefs/) });
  });
});
