import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P1-ART-22 — the athlete's Offers page, SERVER-PAGED on the Arena. The page
   is rendered against a stubbed API: it asks GET /offers for exactly the
   URL's tab and page, draws the API's two counts on the plates and the tab
   strip (never the rows in view), tones a row that expires within 48 hours,
   keeps the guardian 403 explanation and the empty state, and still works
   against an API answering the legacy unpaged shape.
   -------------------------------------------------------------------------- */

const vars = vi.hoisted(() => ({
  calls: [] as string[],
  response: { status: 200, body: {} as unknown },
}));
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string) => {
    vars.calls.push(path);
    return Response.json(vars.response.body, { status: vars.response.status });
  },
}));
vi.mock("@/server/portal", () => ({
  requirePortalAccess: async () => ({ userId: "u1", tenantId: "t1", roles: ["ATHLETE"], wards: [], actingFor: null, guardianControl: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/athlete/offers",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}));

import type { ApiOffer } from "../src/lib/offer-live";

const SOON = new Date(Date.now() + 20 * 3_600_000).toISOString();
const LATER = new Date(Date.now() + 10 * 24 * 3_600_000).toISOString();

const offer = (id: string, over: Partial<ApiOffer> = {}): ApiOffer => ({
  id, campaignId: "c1", athleteId: "a1", jobId: "J-01", inventoryItemId: null, brief: "x", compensation: 30_000,
  deliverables: [{ title: "Post", dueDate: LATER }, { title: "Story", dueDate: LATER }],
  usageRights: "y", exclusivityDays: null, disclosures: [], expiresAt: LATER, state: "SENT", sentAt: null, respondedAt: null,
  termsHash: null, termsSnapshot: null, orderId: null, createdAt: "2026-09-28T00:00:00.000Z",
  campaignName: "Winter Check", sponsorName: "Bowie Auto Care", ...over,
});

describe("the athlete's offers page", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } = await import("../src/app/(app)/athlete/offers/page");
  const render = async (sp: Record<string, string> = {}) =>
    renderToStaticMarkup(createElement("div", null, await Page({ searchParams: Promise.resolve(sp) })));

  beforeEach(() => {
    vars.calls = [];
    vars.response = {
      status: 200,
      body: {
        offers: [offer("o_soon", { expiresAt: SOON, sponsorName: "Soon Co" }), offer("o_late")],
        page: { page: 1, size: 12, total: 2, pages: 1 },
        counts: { open: 2, closed: 7 },
      },
    };
  });

  it("asks for the URL's tab and page, and draws the API's counts", async () => {
    const html = await render({ tab: "closed", page: "2", size: "24" });
    expect(vars.calls).toEqual(["/offers?page=2&size=24&tab=closed"]);
    expect(html).toContain("Offers");
    /* The plates and the tab strip carry the counts — not the two rows in view. */
    expect(html.match(/>7</g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Closed offers");
  });

  it("defaults to the open tab, tones a row expiring within 48 hours and links each row to its offer", async () => {
    const html = await render();
    expect(vars.calls).toEqual(["/offers?page=1&size=12&tab=open"]);
    expect(html).toContain('data-tone="warn"');
    expect(html).toContain("hours left");
    expect(html).toContain("Soon Co");
    expect(html).toContain('href="/athlete/offers/o_soon"');
    expect(html).toContain("Open →");
  });

  it("explains a guardian's 403 and keeps the empty state", async () => {
    vars.response = { status: 403, body: { error: "forbidden" } };
    expect(await render()).toContain("Offers are answered by the athlete");
    vars.response = { status: 200, body: { offers: [], page: { page: 1, size: 12, total: 0, pages: 1 }, counts: { open: 0, closed: 0 } } };
    expect(await render()).toContain("No offers yet");
    /* One tab empty while the other has rows: that tab's own empty words. */
    vars.response = { status: 200, body: { offers: [], page: { page: 1, size: 12, total: 0, pages: 1 }, counts: { open: 0, closed: 3 } } };
    expect(await render()).toContain("Nothing waiting for you");
  });

  it("still draws an API answering the legacy unpaged shape", async () => {
    vars.response = { status: 200, body: { offers: [offer("o1"), offer("o2", { state: "DECLINED" })] } };
    const html = await render();
    expect(html).toContain("Bowie Auto Care");
    /* One page and no filter: the pager is there (‹ 1 ›, above and below), the
       "Showing X–Y of Z" range is not — the house rule (memory: pagination-pattern). */
    expect(html.match(/aria-label="Pagination"/g)?.length).toBe(2);
    expect(html).not.toContain("Showing");
  });

  it("any other failure is an error page, not an empty inbox", async () => {
    vars.response = { status: 500, body: {} };
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("Offers unavailable (500).");
  });
});
