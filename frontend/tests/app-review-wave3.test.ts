import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { autoStaffingNoteFor, maySendInvites, NOT_A_SENDER } from "@/lib/matching-live";

/* App review wave 3 — the campaign pipeline. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-63 · the BTG campaign desk sends people to the right place", () => {
  it("the Campaigns list always opens the campaign page; the campaign page opens the Studio on its own brief", () => {
    const board = src("app/(app)/admin/campaigns/campaigns-board.tsx");
    expect(board).toContain("const href = `/admin/campaigns/${encodeURIComponent(c.id)}`;");
    expect(board).not.toMatch(/href = STAFFING\.has/);
    const page = src("app/(app)/admin/campaigns/[id]/page.tsx");
    expect(page).toContain("const studioHref = stage?.briefId ? `/admin/campaigns/match?brief=${encodeURIComponent(stage.briefId)}` : \"/admin/campaigns/match\";");
    expect(page).toContain("Open in Matching Studio →");
    expect(page).toContain('action={{ label: "Open the Matching Studio", href: studioHref }}');
    expect(src("components/roster-ops.tsx")).toContain('href={live?.studioHref ?? "/admin/campaigns/match"}');
  });

  it("the network manager builds the shortlist but isn't offered Send, and is told who sends", () => {
    expect(maySendInvites(["NETWORK_MGR"])).toBe(false);
    expect(maySendInvites(["CAMPAIGN_MGR"])).toBe(true);
    expect(NOT_A_SENDER).toMatch(/campaign manager or BTG admin sends/);
    expect(src("lib/matching-live.ts")).toContain("sendBlocked: opts.send === false ? NOT_A_SENDER : sendBlockedFor(b),");
    expect(src("app/(app)/admin/campaigns/match/page.tsx")).toContain("send: maySendInvites(who.actor.roles)");
  });

  it("before Send, a package that staffs itself warns that automatic offers follow, up to its maximum", () => {
    const brief = { package: { athleteCountMax: 5 }, jobs: [{ jobId: "SX-01" }] } as unknown as Parameters<typeof autoStaffingNoteFor>[0];
    expect(autoStaffingNoteFor(brief)).toMatch(/up to the package's 5/);
    expect(src("components/matching-review.tsx")).toContain("{live && !sendBlocked && autoStaffingNote && (");
  });
});

describe("POL-FE-65 · the sponsor's request form promises and allows only what's true", async () => {
  const { objectiveProblem, toBriefBody } = await import("@/lib/brief-request");
  const { requestPatch } = await import("@/lib/brief-actions");
  it("an objective needs 8 words, in the drawer and the edit form", () => {
    expect(objectiveProblem("Grand opening traffic")).toMatch(/at least 8 words \(you have 3\)/);
    expect(objectiveProblem("Bring grand opening traffic to our new downtown store")).toBeNull();
    expect(() => toBriefBody({ sponsorId: "s", objective: "Spring push", budget: "1500", start: "", durationWeeks: 2, sport: "", geo: "", tier: "", category: "", message: "" })).toThrow(/at least 8 words/);
  });

  it("the edit form refuses a start that isn't after today, and a run under 7 days — only when the dates moved", () => {
    const original = { objective: "Spring footwear launch across DMV high schools this season", budget: 300_000, startDate: "2026-12-01T00:00:00.000Z", endDate: "2026-12-29T00:00:00.000Z", sports: [], stateCodes: [], categories: [], excludedCategories: [], channels: [], audienceTiers: [], audienceMinFollowers: null } as unknown as Parameters<typeof requestPatch>[1];
    const form = { objective: original.objective, budget: "$3,000", startDate: "2026-12-01", endDate: "2026-12-29", sports: [], stateCodes: [], categories: [], excludedCategories: [], channels: [], audienceTiers: [], minFollowers: "" } as unknown as Parameters<typeof requestPatch>[0];
    expect(() => requestPatch({ ...form, startDate: "2026-11-15" }, original, "2026-11-15")).toThrow(/tomorrow at the earliest/);
    expect(() => requestPatch({ ...form, endDate: "2026-12-04" }, original, "2026-11-15")).toThrow(/at least 7 days/);
    expect(requestPatch({ ...form, budget: "$3,500" }, original, "2027-01-10")).toEqual({ budget: 350_000 });
  });

  it("the words say a passing request is approved at once; a held one is followed on Requests; results only once live", () => {
    expect(src("components/brief-request-drawer.tsx")).not.toContain("A request, not a purchase");
    expect(src("app/(app)/sponsor/marketplace/page.tsx")).not.toContain("A request, not a purchase");
    expect(src("lib/brief-status.ts")).toContain("You can follow it on your Requests page.");
    expect(src("components/brief-request-drawer.tsx")).toContain("`/sponsor/requests/${encodeURIComponent(sentId)}`");
    expect(src("components/sponsor-campaign-table.tsx")).toContain('["ACTIVE", "REPORTING", "COMPLETED"].includes(c.state)');
  });
});
