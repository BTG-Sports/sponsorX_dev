import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   QA pass 8, F-9 — a screen that counts campaigns or sums their money reads
   every page of GET /campaigns, follows the cursor, and treats 403 as "not
   your role" (null) while anything else fails loudly.
   -------------------------------------------------------------------------- */

const calls: string[] = [];
let responder: (path: string) => Response = () => new Response("{}", { status: 500 });
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string) => (calls.push(path), responder(path)),
}));

const { fetchCampaign, fetchCampaignPage } = await import("../src/server/campaigns");

const row = (id: string) => ({ id, name: id });

beforeEach(() => {
  calls.length = 0;
});

describe("fetchCampaign", () => {
  it("reads by id; 403/404 is null", async () => {
    responder = () => new Response(JSON.stringify({ campaign: row("c9") }), { status: 200 });
    expect((await fetchCampaign("c9"))?.id).toBe("c9");
    expect(calls.at(-1)).toBe("/campaigns/c9");
    responder = () => new Response("{}", { status: 403 });
    expect(await fetchCampaign("x")).toBeNull();
  });
});

describe("fetchCampaignPage", () => {
  it("sends page, size and only allowed filters; 403 is null", async () => {
    responder = () => new Response(JSON.stringify({ campaigns: [row("a")], page: { page: 2, size: 24, total: 30, pages: 2 } }), { status: 200 });
    const r = await fetchCampaignPage({ page: "2", size: "24", q: "show", state: "BOGUS", sort: "name" });
    expect(calls.at(-1)).toBe("/campaigns?page=2&size=24&q=show&sort=name");
    expect(r?.page.total).toBe(30);
    expect((await fetchCampaignPage({}, 5)) && calls.at(-1)).toBe("/campaigns?page=1&size=5");
    responder = () => new Response("{}", { status: 403 });
    expect(await fetchCampaignPage({})).toBeNull();
  });
});
