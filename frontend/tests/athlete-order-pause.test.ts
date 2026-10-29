import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-FE-06 — the paused deal on the athlete's order. The page is rendered
   against a stubbed API: the order read carries no pause, so the page joins
   GET /deal-disputes by orderId and draws the banner between the header
   and the grid — the pause, what BTG asked for, the documents sent, the
   upload while it is open, BTG's decision once made, and nothing at all
   when there is no dispute. A guardian acting for the minor is the athlete.

   Then the accept action's 409s: a paused deal has nothing to retry, an
   owed confirmation has a page to go to, anything else reloads as before.
   And a deliverable move refused with deal_paused links to the order.
   -------------------------------------------------------------------------- */

const vars = vi.hoisted(() => ({
  calls: [] as { path: string; init?: RequestInit }[],
  routes: {} as Record<string, { status: number; body: unknown }>,
  actor: { userId: "u1", tenantId: "t1", roles: ["ATHLETE"], wards: [], actingFor: null as string | null, guardianControl: null },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "203.0.113.7", "user-agent": "phone" }) }));
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string, init?: RequestInit) => {
    vars.calls.push({ path, init });
    const r = vars.routes[path] ?? { status: 500, body: {} };
    return Response.json(r.body, { status: r.status });
  },
  fetchActor: async () => ({ status: "linked", actor: vars.actor }),
}));
vi.mock("@/server/portal", () => ({ requirePortalAccess: async () => vars.actor }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {} }),
  usePathname: () => "/athlete/orders/ord_1",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
  notFound: () => { throw new Error("notFound"); },
}));

import type { ApiDealDispute } from "../src/lib/deal-disputes-live";
import type { ApiOrder } from "../src/lib/order-live";

const ORDER: ApiOrder = {
  id: "ord_1", state: "ACTIVE", jobId: "SX-02", jobName: "Two Instagram posts",
  campaign: { id: "c1", name: "Winter Check", sponsorName: "Bowie Auto Care", startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-12-01T00:00:00.000Z" },
  athlete: { id: "a1", displayName: "Ada Lane" }, usageRights: "Six months", exclusivity: null,
  dueDate: "2026-11-15T00:00:00.000Z", acceptedAt: "2026-10-05T00:00:00.000Z", compensation: 50_000,
  guardian: { status: "not-required", name: null },
  agreement: { id: "ag1", kind: "CAMPAIGN_ORDER", version: 3, bodyHash: "sha256:abc", body: "DRAFT — the agreement." },
  acceptance: { acceptedAt: "2026-10-05T00:00:00.000Z", bodyHash: "sha256:abc", version: 3 },
};

const dispute = (over: Partial<ApiDealDispute> = {}): ApiDealDispute => ({
  id: "dd_1", orderId: "ord_1", athleteId: "a1", athleteName: "Ada Lane", campaignName: "Winter Check", job: "SX-02 · Two Instagram posts",
  orderState: "ACTIVE", source: "SCHOOL", sourceName: "Northside High", reason: "The school says the post clashes with its own sponsor.",
  documentsRequested: "A copy of your school's NIL policy and the permission slip.", state: "OPEN", paused: true,
  openedAt: "2026-10-20T10:00:00.000Z", documentsInAt: null, resolvedAt: null, resolutionNote: null, documents: [], ...over,
});

const DOCS = [
  { id: "ddoc_a", filename: "nil-policy.pdf", contentType: "application/pdf", bytes: 240 * 1024, uploadedAt: "2026-10-21T09:00:00.000Z" },
  { id: "ddoc_b", filename: "permission.png", contentType: "image/png", bytes: 2.4 * 1024 * 1024, uploadedAt: "2026-10-21T09:05:00.000Z" },
];

describe("the athlete's order page with a paused deal", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } = await import("../src/app/(app)/athlete/orders/[id]/page");
  const render = async () =>
    renderToStaticMarkup(createElement("div", null, await Page({ params: Promise.resolve({ id: "ord_1" }), searchParams: Promise.resolve({}) })));

  beforeEach(() => {
    vars.calls = [];
    vars.actor = { userId: "u1", tenantId: "t1", roles: ["ATHLETE"], wards: [], actingFor: null, guardianControl: null };
    vars.routes = {
      "/orders/ord_1": { status: 200, body: ORDER },
      "/deal-disputes": { status: 200, body: { disputes: [] } },
    };
  });

  it("an open dispute: the pause, the ask, the concern and the upload control", async () => {
    vars.routes["/deal-disputes"] = { status: 200, body: { disputes: [dispute({ id: "dd_other", orderId: "ord_9" }), dispute()] } };
    const html = await render();
    expect(vars.calls.map((c) => c.path)).toEqual(["/orders/ord_1", "/deal-disputes"]);
    expect(html).toContain("This deal is paused while BTG looks into a concern");
    expect(html).toContain("BTG has asked you for documents.");
    expect(html).toContain("What BTG asked for");
    expect(html).toContain("A copy of your school&#x27;s NIL policy and the permission slip.");
    expect(html).toContain("The concern");
    expect(html).toContain("The school says the post clashes with its own sponsor.");
    expect(html).toContain("Raised by School · Northside High");
    expect(html).toContain("No documents sent yet.");
    /* The upload control, taking WebP too, never a raw enum. */
    expect(html).toContain("Send a document");
    expect(html).toContain('accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"');
    expect(html).toContain("PDF, JPEG, PNG or WebP, up to 10 MB");
    expect(html).toContain('role="status"');
    expect(html).not.toContain(">OPEN<");
    /* The banner sits between the header and the grid. */
    expect(html.indexOf("Deal paused")).toBeGreaterThan(html.indexOf("Presented by Bowie Auto Care"));
    expect(html.indexOf("Deal paused")).toBeLessThan(html.indexOf("Order details"));
  });

  it("documents in: both listed with size and date, and more can still be sent", async () => {
    vars.routes["/deal-disputes"] = { status: 200, body: { disputes: [dispute({ state: "DOCUMENTS_IN", documentsInAt: "2026-10-21T09:00:00.000Z", documents: DOCS })] } };
    const html = await render();
    expect(html).toContain("Documents received — BTG is deciding");
    expect(html).toContain("BTG has 2 documents");
    expect(html).toContain("nil-policy.pdf");
    expect(html).toContain("240 KB");
    expect(html).toContain("permission.png");
    expect(html).toContain("2.4 MB");
    expect(html).toContain("2 of 10 sent");
    expect(html).toContain("Send another document");
  });

  it("resumed with a note: the outcome and BTG's note, no upload", async () => {
    vars.routes["/deal-disputes"] = {
      status: 200,
      body: { disputes: [dispute({ state: "RESUMED", paused: false, documentsInAt: "2026-10-21T09:00:00.000Z", resolvedAt: "2026-10-22T09:00:00.000Z", resolutionNote: "The school withdrew its concern.", documents: DOCS })] },
    };
    const html = await render();
    expect(html).toContain("BTG resumed this deal");
    expect(html).toContain("BTG&#x27;s note: The school withdrew its concern.");
    expect(html).toContain("decided Oct 22");
    expect(html).not.toContain("What BTG asked for");
    expect(html).not.toContain("Send a document");
    expect(html).not.toContain("Send another document");
    expect(html).not.toContain('type="file"');
    /* The documents sent stay on the page. */
    expect(html).toContain("nil-policy.pdf");
  });

  it("no dispute: no banner; and a failing dispute read hides the banner, not the order", async () => {
    let html = await render();
    expect(html).not.toContain("Deal paused");
    expect(html).not.toContain("The concern");
    expect(html).toContain("Order details");
    vars.routes["/deal-disputes"] = { status: 500, body: {} };
    html = await render();
    expect(html).not.toContain("Deal paused");
    expect(html).toContain("Order details");
  });

  it("the ten-document limit: the control goes, the limit is said", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...DOCS[0]!, id: `ddoc_${i}`, filename: `doc-${i}.pdf` }));
    vars.routes["/deal-disputes"] = { status: 200, body: { disputes: [dispute({ state: "DOCUMENTS_IN", documents: ten })] } };
    const html = await render();
    expect(html).toContain("10 of 10 sent");
    expect(html).toContain("the most one dispute takes");
    expect(html).not.toContain('type="file"');
  });

  it("a guardian acting for the minor is the athlete: guardian words, the upload, and no 'only the athlete' line", async () => {
    vars.actor = { userId: "g1", tenantId: "t1", roles: ["GUARDIAN"], wards: [], actingFor: "a1", guardianControl: null };
    vars.routes["/orders/ord_1"] = { status: 200, body: { ...ORDER, state: "SENT", acceptance: null, guardian: { status: "ready", name: "Pat Lane" } } };
    vars.routes["/deal-disputes"] = { status: 200, body: { disputes: [dispute()] } };
    const html = await render();
    expect(html).toContain("BTG has asked you (as their guardian) for documents.");
    expect(html).toContain('type="file"');
    expect(html).not.toContain("Only the athlete can accept this order.");
  });

  it("a guardian not acting for anyone reads the pause but is told how to send", async () => {
    vars.actor = { userId: "g1", tenantId: "t1", roles: ["GUARDIAN"], wards: [], actingFor: null, guardianControl: null };
    vars.routes["/deal-disputes"] = { status: 200, body: { disputes: [dispute()] } };
    const html = await render();
    expect(html).toContain("This deal is paused");
    expect(html).not.toContain('type="file"');
    expect(html).toContain("open the portal as the athlete you&#x27;re acting for");
  });
});

describe("acceptOrderAction's 409s", async () => {
  const { acceptOrderAction } = await import("../src/app/(app)/athlete/orders/[id]/actions");
  const { DEAL_PAUSED_WORDS } = await import("../src/lib/deal-disputes-live");

  beforeEach(() => {
    vars.calls = [];
    vars.routes = {};
  });

  it("deal_paused: the pause words, nothing to reload", async () => {
    vars.routes["/orders/ord_1/accept"] = { status: 409, body: { error: { code: "deal_paused", message: "This deal is paused while BTG looks into a concern raised about it. …" } } };
    expect(await acceptOrderAction("ord_1", "ag1", "DRAFT — the agreement.")).toEqual({ ok: false, message: DEAL_PAUSED_WORDS });
  });

  it("rules_attestation_required: a confirmHref back to this order, no reload", async () => {
    vars.routes["/orders/ord_1/accept"] = { status: 409, body: { error: { code: "rules_attestation_required", message: "Confirm the rules first." } } };
    const r = await acceptOrderAction("ord_1", "ag1", "DRAFT — the agreement.");
    expect(r).toMatchObject({ ok: false, confirmHref: "/athlete/confirmations?return=%2Fathlete%2Forders%2Ford_1" });
    expect(r).not.toHaveProperty("reload");
    expect((r as { message: string }).message).toMatch(/school, league and local rules/);
  });

  it("collab_agreement_required: the same, for the agreement", async () => {
    vars.routes["/orders/ord_1/accept"] = { status: 409, body: { error: { code: "collab_agreement_required", message: "Accept the agreement first." } } };
    const r = await acceptOrderAction("ord_1", "ag1", "DRAFT — the agreement.");
    expect(r).toMatchObject({ ok: false, confirmHref: "/athlete/confirmations?return=%2Fathlete%2Forders%2Ford_1", message: expect.stringMatching(/Content Collaboration Agreement/) });
  });

  it("any other 409 still reloads the current version, with the API's words", async () => {
    vars.routes["/orders/ord_1/accept"] = { status: 409, body: { error: { code: "agreement_text_changed", message: "The agreement text has changed." } } };
    expect(await acceptOrderAction("ord_1", "ag1", "DRAFT — the agreement.")).toEqual({ ok: false, message: "The agreement text has changed.", reload: true });
    vars.routes["/orders/ord_1/accept"] = { status: 422, body: { error: { code: "validation", message: "Check the form.", issues: [{ message: "bodyHashShown is required" }] } } };
    expect(await acceptOrderAction("ord_1", "ag1", "DRAFT — the agreement.")).toEqual({ ok: false, message: "bodyHashShown is required" });
  });

  it("success is unchanged", async () => {
    vars.routes["/orders/ord_1/accept"] = { status: 200, body: { state: "ACCEPTED" } };
    expect(await acceptOrderAction("ord_1", "ag1", "DRAFT — the agreement.")).toEqual({ ok: true, state: "ACCEPTED" });
  });
});

describe("the dispute document actions", async () => {
  const { requestDisputeUploadAction, confirmDisputeUploadAction } = await import("../src/app/(app)/athlete/orders/[id]/actions");

  beforeEach(() => {
    vars.calls = [];
    vars.routes = {};
  });

  it("asks for the PUT with the file's name, type and size, and hands back the grant", async () => {
    vars.routes["/deal-disputes/dd_1/documents"] = {
      status: 201,
      body: { document: { id: "ddoc_a", filename: "nil-policy.pdf", contentType: "application/pdf", bytes: 1234 }, uploadUrl: "https://r2.example/put", contentType: "application/pdf" },
    };
    const r = await requestDisputeUploadAction("dd_1", { filename: "nil-policy.pdf", contentType: "application/pdf", bytes: 1234 });
    expect(r).toEqual({ ok: true, id: "ddoc_a", uploadUrl: "https://r2.example/put", contentType: "application/pdf" });
    expect(JSON.parse(String(vars.calls[0]!.init?.body))).toEqual({ filename: "nil-policy.pdf", contentType: "application/pdf", bytes: 1234 });
  });

  it("the API's document refusals arrive in its words; a closed dispute in ours", async () => {
    vars.routes["/deal-disputes/dd_1/documents"] = { status: 422, body: { error: { code: "deal_dispute_document", message: "A document is at most 10 MB." } } };
    expect(await requestDisputeUploadAction("dd_1", { filename: "big.pdf", contentType: "application/pdf", bytes: 1 })).toEqual({ ok: false, message: "A document is at most 10 MB." });
    vars.routes["/deal-disputes/dd_1/documents"] = { status: 409, body: { error: { code: "deal_dispute_closed", message: "closed" } } };
    expect(await requestDisputeUploadAction("dd_1", { filename: "late.pdf", contentType: "application/pdf", bytes: 1 })).toEqual({ ok: false, message: "BTG has decided this dispute, so nothing more can be sent for it." });
    /* A 403 here is a guardian not acting for the ward, never "only a BTG admin can change it" (QA round). */
    vars.routes["/deal-disputes/dd_1/documents"] = { status: 403, body: { error: { code: "forbidden", message: "Forbidden" } } };
    expect(await requestDisputeUploadAction("dd_1", { filename: "x.pdf", contentType: "application/pdf", bytes: 1 })).toEqual({ ok: false, message: "To send documents, open the portal as the athlete you're acting for." });
    /* Bad arguments never reach the API. */
    expect(await requestDisputeUploadAction("", { filename: "x.pdf", contentType: "application/pdf", bytes: 1 })).toMatchObject({ ok: false });
    expect(await requestDisputeUploadAction("dd_1", { filename: "x.pdf", contentType: "application/pdf", bytes: 0 })).toMatchObject({ ok: false });
    expect(vars.calls).toHaveLength(3);
  });

  it("confirms by id and says when it isn't there yet", async () => {
    vars.routes["/deal-disputes/dd_1/documents/ddoc_a/confirm"] = { status: 200, body: { id: "dd_1", state: "DOCUMENTS_IN" } };
    expect(await confirmDisputeUploadAction("dd_1", "ddoc_a")).toEqual({ ok: true });
    expect(vars.calls[0]!.init?.method).toBe("POST");
    vars.routes["/deal-disputes/dd_1/documents/ddoc_a/confirm"] = { status: 409, body: { error: { code: "deal_dispute_document", message: "That file hasn't arrived yet." } } };
    /* P8-FE-11 — the status rides along, so the upload offers Try again (the API answered) rather than Check again. */
    expect(await confirmDisputeUploadAction("dd_1", "ddoc_a")).toEqual({ ok: false, status: 409, message: "That file hasn't arrived yet." });
    expect(await confirmDisputeUploadAction("dd_1", "../x")).toMatchObject({ ok: false });
  });
});

describe("a deliverable move while the deal is paused", async () => {
  const { submitDraft, markPublished } = await import("../src/app/(app)/athlete/deliverables/[id]/actions");

  beforeEach(() => {
    vars.calls = [];
    vars.routes = {
      "/deliverables/dl_1": { status: 200, body: { id: "dl_1", orderId: "ord_1" } },
    };
  });

  it("says the deal is paused and links to the order", async () => {
    vars.routes["/deliverables/dl_1/submit"] = { status: 409, body: { error: { code: "deal_paused", message: "This deal is paused while BTG looks into a concern raised about it." } } };
    const r = await submitDraft("dl_1", "My caption #ad");
    expect(r).toMatchObject({ ok: false, orderHref: "/athlete/orders/ord_1", message: expect.stringMatching(/paused while BTG looks into a concern/) });
    expect(vars.calls.map((c) => c.path)).toEqual(["/deliverables/dl_1/submit", "/deliverables/dl_1"]);
  });

  it("still says so when the order can't be read, without the link; other refusals are unchanged", async () => {
    vars.routes["/deliverables/dl_1"] = { status: 403, body: {} };
    vars.routes["/deliverables/dl_1/published"] = { status: 409, body: { error: { code: "deal_paused", message: "paused" } } };
    const r = await markPublished("dl_1", "https://www.instagram.com/p/x");
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/paused/) });
    expect(r).not.toHaveProperty("orderHref");
    vars.routes["/deliverables/dl_1/submit"] = { status: 409, body: { error: { code: "bad_request", message: "Already submitted." } } };
    expect(await submitDraft("dl_1", "x")).toEqual({ ok: false, message: "Already submitted." });
  });
});
