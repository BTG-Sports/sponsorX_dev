import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { deskFilters, deskHeadline, deskListQuery, tabStates } from "@/lib/approvals-live";

/* App review wave 2 — the walkthrough loop.
   POL-FE-60: BTG's "Sponsor report" bounced BTG to /admin. Done when: BTG's
   "Sponsor report" opens the report.
   POL-FE-61: a published post waited on no queue. Done when: a post marked
   published appears under To verify (and BTG is emailed — the API's,
   backend/tests/deliverable.chain.test.ts); verifying it moves it on. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-60 · BTG opens the sponsor report inside the admin portal", () => {
  it("the admin route serves the report page, and the campaign page links there with the way back", () => {
    expect(src("app/(app)/admin/campaigns/[id]/report/page.tsx")).toContain('export { default } from "@/app/(app)/sponsor/campaigns/[id]/report/page";');
    const campaign = src("app/(app)/admin/campaigns/[id]/page.tsx");
    expect(campaign).not.toContain("/sponsor/campaigns/");
    expect(campaign.match(/\/admin\/campaigns\/\$\{encodeURIComponent\((c\.id|id)\)\}\/report\?from=admin-campaign/g)?.length).toBe(2);
    expect(src("app/(app)/sponsor/campaigns/[id]/report/page.tsx")).toMatch(/fromParam === "admin-campaign"[\s\S]{0,80}\/admin\/campaigns\/\$\{id\}/);
  });
});

describe("POL-FE-61 · To verify", () => {
  it("a tab of its own: PUBLISHED only, counted from the summary", () => {
    expect(tabStates("verify")).toEqual(["PUBLISHED"]);
    expect(deskFilters({ tab: "verify" }).tab).toBe("verify");
    expect(deskListQuery(deskFilters({ tab: "verify" }), { page: 1, size: 20 })).toContain("state=PUBLISHED&");
    const h = deskHeadline({ total: 9, states: { PUBLISHED: 3, APPROVED: 2, BTG_REVIEW: 4 }, openRevisions: 0, aging: 0, campaigns: [] });
    expect(h.tabs.verify).toBe(3);
  });

  it("the desk draws the tab, and the dashboard has a Posts to verify card opening it", () => {
    expect(src("components/approvals-desk.tsx")).toContain('{ key: "verify", label: "To verify" }');
    expect(src("lib/ops-board-live.ts")).toContain('{ key: "toVerify", label: "Posts to verify", hint: "Marked published by the athlete; check the link", href: "/admin/approvals?tab=verify" }');
  });
});

describe("POL-FE-62 · reach and clicks", async () => {
  const { countOf, linkProblem, trackingUrl, viewsProblem } = await import("@/lib/deliverable-metrics-live");
  it("records a past day's views (12.4k reads as 12,400); a tracking link needs a full web address", () => {
    expect(countOf("12,400")).toBe(12_400);
    expect(countOf("12.4k")).toBe(12_400);
    expect(countOf("lots")).toBeNull();
    expect(viewsProblem({ day: "2026-11-14", views: "12.4k", engagements: "300" }, "2026-11-15")).toBeNull();
    expect(viewsProblem({ day: "2026-11-16", views: "1", engagements: "0" }, "2026-11-15")).toMatch(/has happened/);
    expect(linkProblem("rosas.example/menu")).toMatch(/https/);
    expect(linkProblem("https://rosas.example/menu")).toBeNull();
    expect(trackingUrl("https://web.example/", "AB12")).toBe("https://web.example/t/AB12");
  });

  it("the drawer offers both for a published or verified post, through the two existing routes", () => {
    expect(src("components/approvals-desk.tsx")).toMatch(/\(s === "PUBLISHED" \|\| s === "VERIFIED"\) && \(\s*<MetricsTools/);
    const actions = src("app/(app)/admin/approvals/actions.ts");
    expect(actions).toMatch(/\/deliverables\/\$\{encodeURIComponent\(id\)\}\/metrics`[\s\S]{0,120}source: "VERIFIED_MANUAL"/);
    expect(actions).toMatch(/\/deliverables\/\$\{encodeURIComponent\(id\)\}\/tracking-link/);
  });
});
