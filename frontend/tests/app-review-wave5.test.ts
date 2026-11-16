import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { emptyDashboardRows, needsYouItems } from "@/lib/sponsor-overview-live";
import { VIEWER_REQUEST_NOTE } from "@/components/marketplace-catalog";

/* App review wave 5 — the sponsor portal (POL-FE-71, POL-FE-72). */
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("POL-FE-71 · sponsor dashboard, /brief, roles and teammates", () => {
  it("a sponsor with no campaign still sees a Shop order to pay and a request with BTG", () => {
    const rows = emptyDashboardRows({ postsToReview: 0, ordersToPay: 1, requestsInReview: 2 });
    expect(rows.map((r) => r.key)).toEqual(["orders", "requests"]);
    expect(rows[1]).toMatchObject({ title: "2 requests with BTG", href: "/sponsor/requests" });
    expect(emptyDashboardRows({ postsToReview: 0, ordersToPay: 0 })).toEqual([]);
    expect(emptyDashboardRows({ postsToReview: 0, ordersToPay: 0, requestsInReview: 1 })[0]!.title).toBe("1 request with BTG");
  });

  it("the empty dashboard renders those rows above No campaigns yet", () => {
    const page = src("app/(app)/sponsor/page.tsx");
    expect(page.indexOf("emptyDashboardRows(o.needsYou)")).toBeLessThan(page.indexOf("No campaigns yet"));
    expect(needsYouItems({ postsToReview: 1, ordersToPay: 0, invoicesUnpaid: 0 }).map((i) => i.key)).toEqual(["posts", "orders", "invoices"]);
  });

  it("/brief no longer promises a priced shortlist from the form", () => {
    const w = src("components/brief-wizard.tsx");
    expect(w).not.toMatch(/priced shortlist/);
    expect(w).toMatch(/Your first request/);
  });

  it("a Viewer reads the catalogue; Request this is for an Admin", () => {
    const page = src("app/(app)/sponsor/marketplace/page.tsx");
    expect(page).toMatch(/canRequest: who\.actor\.roles\.includes\("SPONSOR_ADMIN"\)/);
    expect(VIEWER_REQUEST_NOTE).toMatch(/Sponsor Admin sends requests/);
  });

  it("one role name: Sponsor Viewer, never Sponsor Analyst, on screen", () => {
    for (const f of ["app/(app)/sponsor/layout.tsx", "app/(app)/sponsor/cart/page.tsx", "app/(app)/sponsor/shop/page.tsx", "app/(app)/sponsor/team/page.tsx", "server/viewer.ts"]) {
      expect(src(f)).not.toMatch(/"Sponsor Analyst"|as a Sponsor Analyst|a Sponsor Analyst \(read only\)/);
    }
  });

  it("a removed teammate has Add back on their row", () => {
    expect(src("components/sponsor-team.tsx")).toMatch(/restoreTeammateAction\(m\.id\)/);
  });
});
