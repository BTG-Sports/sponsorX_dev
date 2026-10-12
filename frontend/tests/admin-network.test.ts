import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P1-ART-25 review — a network manager holds metricAggregate read
   (GET /operations/network-metrics) but not campaignOrder read, which
   GET /operations/job-economics also needs (lib/admin-access.ts). The desk's
   load() used to deny the whole page on EITHER read's 403; now only
   network-metrics gates it, and a job-economics 403 just drops the
   "Economics by job" table.

   Same mocking shape as not-in-role.test.ts and marketplace-live.test.ts:
   @/server/api and @clerk/nextjs/server are mocked so importing the page
   (and the not-in-role / viewer modules it pulls in) needs no request
   context, and apiFetch is a tiny router over the three reads the page
   makes.
   -------------------------------------------------------------------------- */

vi.mock("@clerk/nextjs/server", () => ({ currentUser: async () => null }));

const vars = vi.hoisted(() => ({
  actor: null as unknown,
  responses: {} as Record<string, Response>,
}));

vi.mock("@/server/api", () => ({
  fetchActor: async () => vars.actor,
  apiFetch: async (path: string) => vars.responses[path] ?? new Response(null, { status: 404 }),
}));

const NETWORK = {
  activeAthletes: 40,
  participatingAthletes: 30,
  participationRate: 0.75,
  utilisationRate: 0.5,
  totalEarnings: 100_000,
  totalPaid: 80_000,
  averageJobPay: 200,
  averageSellPrice: 400,
};
const HEALTH_PATH = "/operations/delivery-health?page=1&size=12&projected=true";
const HEALTH_EMPTY = { campaigns: [], page: { page: 1, size: 12, total: 0, pages: 0 } };

describe("P1-ART-25 review · the Network desk when job-economics alone is refused", async () => {
  const { default: NetworkPage } = await import("@/app/(app)/admin/network/page");
  const render = async () => renderToStaticMarkup(await NetworkPage({ searchParams: Promise.resolve({}) }));

  it("renders the stat tiles and hides the economics table for a network manager", async () => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["NETWORK_MGR"] } };
    vars.responses = {
      "/operations/network-metrics": Response.json(NETWORK),
      "/operations/job-economics": new Response(null, { status: 403 }),
      [HEALTH_PATH]: Response.json(HEALTH_EMPTY),
    };
    const html = await render();
    expect(html).toContain("Active athletes");
    expect(html).not.toContain("Economics by job");
  });

  it("still shows the economics table for a role whose job-economics read succeeds", async () => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["BTG_ADMIN"] } };
    vars.responses = {
      "/operations/network-metrics": Response.json(NETWORK),
      "/operations/job-economics": Response.json({ jobs: [] }),
      [HEALTH_PATH]: Response.json(HEALTH_EMPTY),
    };
    const html = await render();
    expect(html).toContain("Economics by job");
  });

  it("still denies the whole desk when network-metrics itself is refused", async () => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["NETWORK_MGR"] } };
    vars.responses = {
      "/operations/network-metrics": new Response(null, { status: 403 }),
      "/operations/job-economics": new Response(null, { status: 403 }),
      [HEALTH_PATH]: Response.json(HEALTH_EMPTY),
    };
    const html = await render();
    expect(html).toContain("Network figures are BTG");
    expect(html).not.toContain("Economics by job");
  });
});
