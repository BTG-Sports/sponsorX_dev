import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-FE-05 — BTG's deal dispute desk. The pure half (lib/deal-dispute-desk)
   and the four pages rendered against a stubbed API: the admin list draws
   its tiles, tabs and counts from the one read (the API sends none), the
   admin detail shows Resolve and the document links to a BTG admin and the
   read-only words to a campaign manager, and the Finance twin renders with
   no action at all and every link inside /finance.
   -------------------------------------------------------------------------- */

const vars = vi.hoisted(() => ({
  calls: [] as string[],
  roles: ["BTG_ADMIN"] as string[],
  responses: {} as Record<string, { status: number; body: unknown }>,
}));
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string) => {
    vars.calls.push(path);
    const r = vars.responses[path] ?? { status: 404, body: { error: { code: "not_found", message: "No such thing" } } };
    return Response.json(r.body, { status: r.status });
  },
  fetchActor: async () => ({ status: "linked", actor: { userId: "u1", tenantId: "t1", roles: vars.roles } }),
}));
vi.mock("@/server/portal", () => ({
  requirePortalAccess: async () => ({ userId: "u1", tenantId: "t1", roles: vars.roles, wards: [], actingFor: null, guardianControl: null }),
}));
vi.mock("@/server/viewer", () => ({
  roleLabel: (roles: string[]) => roles.join(", "),
  viewerName: async () => "BTG staff",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  usePathname: () => "/admin/deal-disputes",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import type { ApiDealDispute } from "../src/lib/deal-disputes-live";
import { DEAL_DISPUTE_TABS } from "../src/lib/deal-disputes-live";
import {
  bytesWords,
  dealDisputeCounts,
  dealDisputesForTab,
  documentKind,
  documentSub,
  isDisputableOrder,
  linkLifeWords,
  openDisputeBody,
  openDisputeRefusal,
  openFormProblem,
  orderStateWords,
  pausedByOrder,
  resolveNoteProblem,
} from "../src/lib/deal-dispute-desk";

const dispute = (id: string, over: Partial<ApiDealDispute> = {}): ApiDealDispute => ({
  id,
  orderId: `ord_${id}`,
  athleteId: "ath_1",
  athleteName: "Maya Okafor",
  campaignName: "Winter Check",
  job: "SX-02 · Two Instagram posts",
  orderState: "ACTIVE",
  source: "SCHOOL",
  sourceName: "Northside High",
  reason: "The school says the posts breach its athlete policy.",
  documentsRequested: "The school's written policy and the athlete's signed acknowledgement.",
  state: "OPEN",
  paused: true,
  openedAt: "2026-10-20T10:00:00.000Z",
  documentsInAt: null,
  resolvedAt: null,
  resolutionNote: null,
  documents: [],
  ...over,
});

const DOC = { id: "doc_1", filename: "policy.pdf", contentType: "application/pdf", bytes: 1_300_000, uploadedAt: "2026-10-21T09:00:00.000Z" };

const LIST = [
  dispute("dd_open"),
  dispute("dd_docs", { state: "DOCUMENTS_IN", documentsInAt: "2026-10-21T09:00:00.000Z", documents: [DOC], athleteName: "Leo Park", source: "PARENT", sourceName: null }),
  dispute("dd_resumed", { state: "RESUMED", paused: false, resolvedAt: "2026-10-22T09:00:00.000Z", resolutionNote: "The policy allows it.", documents: [DOC] }),
  dispute("dd_cancelled", { state: "CANCELLED", paused: false, orderState: "CANCELLED", resolvedAt: "2026-10-22T09:00:00.000Z", resolutionNote: "The league forbids it." }),
  dispute("dd_open2", { athleteName: "Sam Reyes", source: "LEAGUE", sourceName: null }),
];

describe("P8-FE-05 · the desk's pure half", () => {
  it("counts each state from the one read, and picks a tab's rows", () => {
    expect(dealDisputeCounts(LIST)).toEqual({ OPEN: 2, DOCUMENTS_IN: 1, RESUMED: 1, CANCELLED: 1 });
    expect(dealDisputeCounts([])).toEqual({ OPEN: 0, DOCUMENTS_IN: 0, RESUMED: 0, CANCELLED: 0 });
    expect(dealDisputesForTab(LIST, DEAL_DISPUTE_TABS[1]).map((d) => d.id)).toEqual(["dd_docs"]);
    expect(dealDisputesForTab(LIST, DEAL_DISPUTE_TABS[0]).map((d) => d.id)).toEqual(["dd_open", "dd_open2"]);
  });

  it("joins the open dispute to its order, never a decided one", () => {
    const m = pausedByOrder(LIST);
    expect(m.get("ord_dd_open")?.id).toBe("dd_open");
    expect(m.get("ord_dd_docs")?.id).toBe("dd_docs");
    expect(m.has("ord_dd_resumed")).toBe(false);
    expect(m.has("ord_dd_cancelled")).toBe(false);
  });

  it("knows which orders can be paused, and says an order's state in words", () => {
    expect(isDisputableOrder("SENT")).toBe(true);
    expect(isDisputableOrder("ACCEPTED")).toBe(true);
    expect(isDisputableOrder("ACTIVE")).toBe(true);
    expect(isDisputableOrder("COMPLETED")).toBe(false);
    expect(isDisputableOrder("CANCELLED")).toBe(false);
    expect(isDisputableOrder(null)).toBe(false);
    expect(orderStateWords("ACTIVE")).toBe("Live");
    expect(orderStateWords("SENT")).toBe("Sent, awaiting the athlete");
    expect(orderStateWords("CANCELLED")).toBe("Cancelled");
    expect(orderStateWords("SOME_NEW_STATE")).toBe("Some new state");
    expect(orderStateWords(null)).toBe("No order");
  });

  it("checks the open form the way the API will, and trims it into the body", () => {
    expect(openFormProblem(null)).toBe("Fill in the form.");
    expect(openFormProblem({ source: "NOPE" as never, reason: "x".repeat(10), documentsRequested: "y".repeat(10) })).toBe("Say who raised the concern.");
    expect(openFormProblem({ source: "SCHOOL", reason: "abc", documentsRequested: "y".repeat(10) })).toMatch(/what the concern is/);
    expect(openFormProblem({ source: "SCHOOL", reason: "x".repeat(10), documentsRequested: "  ab " })).toMatch(/what the athlete should send/);
    expect(openFormProblem({ source: "SCHOOL", sourceName: "n".repeat(161), reason: "x".repeat(10), documentsRequested: "y".repeat(10) })).toMatch(/under 160/);
    expect(openFormProblem({ source: "SCHOOL", reason: "x".repeat(2001), documentsRequested: "y".repeat(10) })).toMatch(/under 2000/);
    expect(openFormProblem({ source: "PARENT", sourceName: "", reason: "x".repeat(10), documentsRequested: "y".repeat(10) })).toBeNull();
    expect(openDisputeBody({ source: "LEAGUE", sourceName: "  ", reason: "  Breach of rule 4. ", documentsRequested: " The ruling. " })).toEqual({
      ok: true,
      body: { source: "LEAGUE", sourceName: null, reason: "Breach of rule 4.", documentsRequested: "The ruling." },
    });
    expect(openDisputeBody({ source: "LEAGUE", sourceName: " The League ", reason: "Breach of rule 4.", documentsRequested: "The ruling." })).toMatchObject({ ok: true, body: { sourceName: "The League" } });
    expect(openDisputeBody({ source: "LEAGUE", reason: "no", documentsRequested: "The ruling." })).toMatchObject({ ok: false });
  });

  it("reads a refused open as 'no such order' on 403 as well as 404 — the API 403s an order it can't find", () => {
    expect(openDisputeRefusal(404, null, "x")).toMatch(/No order matches that id/);
    expect(openDisputeRefusal(403, { error: { code: "forbidden", message: "no" } }, "x")).toMatch(/No order matches that id/);
    expect(openDisputeRefusal(403, null, "x")).not.toMatch(/only a BTG admin/);
    expect(openDisputeRefusal(409, { error: { code: "deal_already_paused" } }, "x")).toMatch(/already has an open dispute/);
    expect(openDisputeRefusal(409, { error: { code: "deal_not_disputable" } }, "x")).toMatch(/sent, accepted or live/);
    expect(openDisputeRefusal(500, null, "The dispute wasn't opened")).toBe("The dispute wasn't opened");
  });

  it("checks the resolve note (3–2000)", () => {
    expect(resolveNoteProblem("")).toMatch(/Write the note/);
    expect(resolveNoteProblem("  ab ")).toMatch(/Write the note/);
    expect(resolveNoteProblem("abc")).toBeNull();
    expect(resolveNoteProblem("x".repeat(2001))).toMatch(/under 2000/);
  });

  it("describes a document for the viewer", () => {
    expect(documentKind("image/png")).toBe("image");
    expect(documentKind("application/pdf")).toBe("pdf");
    expect(documentKind("text/plain")).toBe("other");
    expect(bytesWords(0)).toBe("0 KB");
    expect(bytesWords(812 * 1024)).toBe("812 KB");
    expect(bytesWords(1_300_000)).toBe("1.2 MB");
    expect(bytesWords(12 * 1024 * 1024)).toBe("12 MB");
    expect(documentSub(DOC)).toMatch(/^PDF · 1\.2 MB · uploaded /);
    expect(documentSub({ ...DOC, contentType: "image/jpeg" })).toMatch(/^JPEG/);
    expect(linkLifeWords(300)).toBe("The link lasts 5 minutes.");
    expect(linkLifeWords(60)).toBe("The link lasts 1 minute.");
  });
});

describe("P8-FE-05 · the admin desk", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: ListPage } = await import("../src/app/(app)/admin/deal-disputes/page");
  const { default: DetailPage } = await import("../src/app/(app)/admin/deal-disputes/[id]/page");
  const list = async (sp: Record<string, string> = {}) => renderToStaticMarkup(createElement("div", null, await ListPage({ searchParams: Promise.resolve(sp) })));
  const detail = async (id: string) => renderToStaticMarkup(createElement("div", null, await DetailPage({ params: Promise.resolve({ id }) })));

  beforeEach(() => {
    vars.calls = [];
    vars.roles = ["BTG_ADMIN"];
    vars.responses = {
      "/deal-disputes": { status: 200, body: { disputes: LIST } },
      "/deal-disputes/dd_docs": { status: 200, body: LIST[1] },
      "/deal-disputes/dd_resumed": { status: 200, body: LIST[2] },
    };
  });

  it("shows a reader the empty state, not 'Not in your role', when the API 403s an id it won't read", async () => {
    vars.responses["/deal-disputes/..%2F"] = { status: 403, body: { error: { code: "forbidden", message: "no" } } };
    const html = await detail("../");
    expect(html).toContain("No deal dispute matches this link");
    expect(html).not.toContain("Not in your role");
    /* A 403 on the list still names the viewer's own roles, never the desk's. */
    vars.responses["/deal-disputes"] = { status: 403, body: { error: { code: "forbidden", message: "no" } } };
    const refused = await list();
    expect(refused).toContain("Not in your role");
    expect(refused).not.toContain("CAMPAIGN_MGR");
    expect(refused).toContain("BTG_ADMIN");
  });

  it("reads every dispute once, with no state, and computes the tiles and tab counts itself", async () => {
    const html = await list();
    expect(vars.calls).toEqual(["/deal-disputes"]);
    expect(html).toContain("Deal disputes");
    for (const t of DEAL_DISPUTE_TABS) expect(html).toContain(t.label);
    /* Waiting on documents: 2 rows in view and the count 2 on the tile and the tab. */
    expect(html).toContain("Maya Okafor");
    expect(html).toContain("Sam Reyes");
    expect(html).not.toContain("Leo Park");
    expect(html.match(/>2</g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain('href="/admin/deal-disputes/dd_open"');
    expect(html).toContain("School · Northside High");
    expect(html).toContain("Paused · waiting on documents");
    expect(html).toContain("Open a dispute…");
    expect(html).not.toContain("SCHOOL");
  });

  it("shows a tab's own rows and words, and the empty state", async () => {
    const html = await list({ tab: "documents" });
    expect(html).toContain("Leo Park");
    expect(html).toContain("Parent or guardian");
    expect(html).toContain("Paused · documents in");
    expect(html).not.toContain("Maya Okafor");
    vars.responses["/deal-disputes"] = { status: 200, body: { disputes: [] } };
    expect(await list({ tab: "resumed" })).toContain("No deal has been resumed yet");
  });

  it("keeps the open button from a campaign manager and the desk from Finance", async () => {
    vars.roles = ["CAMPAIGN_MGR"];
    const html = await list();
    expect(html).not.toContain("Open a dispute…");
    expect(html).toContain("BTG admin opens and decides these.");
    expect(html).toContain("Maya Okafor");
    vars.roles = ["FINANCE"];
    expect(await list()).toContain("Not in your role");
    vars.roles = ["BTG_ADMIN"];
    vars.responses["/deal-disputes"] = { status: 403, body: { error: { code: "forbidden", message: "no" } } };
    expect(await list()).toContain("Not in your role");
  });

  it("gives a BTG admin Resolve and the document link on a paused dispute", async () => {
    const html = await detail("dd_docs");
    expect(vars.calls).toContain("/deal-disputes/dd_docs");
    expect(html).toContain("Leo Park");
    expect(html).toContain("Resolve…");
    expect(html).toContain("policy.pdf");
    expect(html).toContain('aria-label="Open policy.pdf"');
    expect(html).toContain("Each open signs a link that lasts 5 minutes");
    expect(html).toContain("The school says the posts breach its athlete policy.");
    expect(html).toContain("The school&#x27;s written policy");
    expect(html).toContain("Live");
    expect(html).not.toContain("DOCUMENTS_IN");
    expect(html).not.toContain("BTG admin decides these.");
  });

  it("gives a campaign manager the read-only words instead", async () => {
    vars.roles = ["CAMPAIGN_MGR"];
    const html = await detail("dd_docs");
    expect(html).not.toContain("Resolve…");
    expect(html).toContain("BTG admin decides these.");
    expect(html).toContain("policy.pdf");
    expect(html).not.toContain('aria-label="Open policy.pdf"');
    expect(html).toContain("BTG admin opens these.");
  });

  it("shows the outcome and the note once decided, and an honest 404", async () => {
    const html = await detail("dd_resumed");
    expect(html).toContain("BTG resumed the deal");
    expect(html).toContain("The policy allows it.");
    expect(html).not.toContain("Resolve…");
    expect(await detail("dd_missing")).toContain("No deal dispute matches this link");
  });
});

describe("P8-FE-05 · the Finance twin", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: ListPage } = await import("../src/app/(app)/finance/deal-disputes/page");
  const { default: DetailPage } = await import("../src/app/(app)/finance/deal-disputes/[id]/page");

  beforeEach(() => {
    vars.calls = [];
    vars.roles = ["FINANCE"];
    vars.responses = {
      "/deal-disputes": { status: 200, body: { disputes: LIST } },
      "/deal-disputes/dd_docs": { status: 200, body: LIST[1] },
    };
  });

  it("renders the list read-only, every link inside /finance", async () => {
    const html = renderToStaticMarkup(createElement("div", null, await ListPage({ searchParams: Promise.resolve({ tab: "documents" }) })));
    expect(vars.calls).toEqual(["/deal-disputes"]);
    expect(html).toContain("Leo Park");
    expect(html).toContain('href="/finance/deal-disputes/dd_docs"');
    expect(html).not.toContain("/admin/");
    expect(html).not.toContain("Open a dispute…");
    expect(html).toContain("BTG admin opens and decides these.");
  });

  it("renders the detail with no action and no document link", async () => {
    const html = renderToStaticMarkup(createElement("div", null, await DetailPage({ params: Promise.resolve({ id: "dd_docs" }) })));
    expect(html).toContain("Leo Park");
    expect(html).toContain("BTG admin decides these.");
    expect(html).toContain("BTG admin opens these.");
    expect(html).toContain("policy.pdf");
    expect(html).not.toContain("Resolve…");
    expect(html).not.toContain('aria-label="Open policy.pdf"');
    expect(html).not.toContain("/admin/");
    vars.responses["/deal-disputes/dd_docs"] = { status: 403, body: { error: { code: "forbidden", message: "no" } } };
    const refused = renderToStaticMarkup(createElement("div", null, await DetailPage({ params: Promise.resolve({ id: "dd_docs" }) })));
    expect(refused).toContain("Not in your role");
  });
});
