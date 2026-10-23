import { describe, expect, it } from "vitest";

import {
  type ApiDealDispute, dealDisputeFacts, dealDisputeRefusal, dealDisputeTab, dealStateLabel, dealStateTone, dealTabFor, disputeFileProblem,
  isDealPaused, latestDisputeFor, mayManageDisputes, mayReadDisputes, openDisputeFor, outcomeWords, pauseWords, pausedNote, raisedByWords,
} from "@/lib/deal-disputes-live";

/* P8-FE-05 / P8-FE-06 — a concern raised about a deal pauses it: the
   words and the joins the desk and the athlete's order page derive. */

const MB = 1024 * 1024;

const dispute = (over: Partial<ApiDealDispute> = {}): ApiDealDispute => ({
  id: "dd1",
  orderId: "o1",
  athleteId: "a1",
  athleteName: "Maya Reyes",
  campaignName: "Spring launch",
  job: "SX-02 · Two Instagram posts",
  orderState: "ACTIVE",
  source: "SCHOOL",
  sourceName: "Northside High",
  reason: "The school asked whether the posts clash with its sponsorship policy.",
  documentsRequested: "A letter from the athletic director confirming the policy.",
  state: "OPEN",
  paused: true,
  openedAt: "2026-10-21T10:00:00.000Z",
  documentsInAt: null,
  resolvedAt: null,
  resolutionNote: null,
  documents: [],
  ...over,
});

describe("files", () => {
  it("takes a PDF, JPEG, PNG or WebP of up to 10 MB", () => {
    expect(disputeFileProblem({ type: "application/pdf", size: 2 * MB, name: "letter.pdf" })).toBeNull();
    expect(disputeFileProblem({ type: "image/webp", size: 10 * MB, name: "scan.webp" })).toBeNull();
    expect(disputeFileProblem({ type: "", size: 1, name: "photo.JPG" })).toBeNull();
  });
  it("refuses other types, files over 10 MB and empty files", () => {
    expect(disputeFileProblem({ type: "image/heic", size: MB, name: "x.heic" })).toMatch(/PDF, JPEG, PNG or WebP/);
    expect(disputeFileProblem({ type: "image/png", size: 10 * MB + 1, name: "x.png" })).toMatch(/over 10 MB/);
    expect(disputeFileProblem({ type: "image/png", size: 0, name: "x.png" })).toMatch(/empty/);
  });
});

describe("tabs and words", () => {
  it("defaults to the open tab and finds a state's tab", () => {
    expect(dealDisputeTab(undefined).key).toBe("open");
    expect(dealDisputeTab(["resumed"]).state).toBe("RESUMED");
    expect(dealDisputeTab("nope").key).toBe("open");
    expect(dealTabFor("DOCUMENTS_IN").key).toBe("documents");
  });
  it("labels every state with a tone", () => {
    expect(dealStateLabel("OPEN")).toMatch(/waiting on documents/i);
    expect(dealStateTone("OPEN")).toBe("warn");
    expect(dealStateTone("DOCUMENTS_IN")).toBe("primary");
    expect(dealStateTone("RESUMED")).toBe("accent");
    expect(dealStateTone("CANCELLED")).toBe("danger");
  });
  it("says who raised it", () => {
    expect(raisedByWords(dispute())).toBe("School · Northside High");
    expect(raisedByWords(dispute({ source: "PARENT", sourceName: null }))).toBe("Parent or guardian");
    expect(raisedByWords(dispute({ source: "OTHER", sourceName: "  " }))).toBe("Other");
  });
  it("explains each outcome", () => {
    expect(outcomeWords("RESUME")).toMatch(/held earning goes back/);
    expect(outcomeWords("CANCEL")).toMatch(/cancelled and the earning stays held/);
  });
  it("lays out the facts in reading order", () => {
    const labels = dealDisputeFacts(dispute({ resolvedAt: "2026-10-23T00:00:00.000Z", state: "RESUMED" })).map((f) => f.label);
    expect(labels).toEqual(["Opened", "Raised by", "Documents in", "Decided"]);
    expect(dealDisputeFacts(dispute())[3].value).toBe("Not yet");
  });
});

describe("the pause on an order", () => {
  const list = [
    dispute({ id: "old", state: "RESUMED", paused: false, openedAt: "2026-10-01T00:00:00.000Z" }),
    dispute({ id: "now" }),
    dispute({ id: "other", orderId: "o2" }),
  ];
  it("finds the open dispute for an order and the latest one", () => {
    expect(openDisputeFor(list, "o1")?.id).toBe("now");
    expect(openDisputeFor(list, "o3")).toBeNull();
    expect(latestDisputeFor(list, "o1")?.id).toBe("now");
    expect(openDisputeFor([list[0]], "o1")).toBeNull();
    expect(latestDisputeFor([list[0]], "o1")?.id).toBe("old");
  });
  it("tells the athlete what BTG asked for, by state", () => {
    const open = pauseWords(dispute(), false);
    expect(open.tone).toBe("warn");
    expect(open.text).toMatch(/asked you for documents/);
    expect(open.ask).toMatch(/athletic director/);

    const guardian = pauseWords(dispute(), true);
    expect(guardian.text).toMatch(/as their guardian/);

    const docsIn = pauseWords(dispute({ state: "DOCUMENTS_IN", documents: [{ id: "d1", filename: "a.pdf", contentType: "application/pdf", bytes: 1, uploadedAt: "" }] }), false);
    expect(docsIn.title).toMatch(/BTG is deciding/);
    expect(docsIn.text).toMatch(/your document/);

    const resumed = pauseWords(dispute({ state: "RESUMED", paused: false, resolutionNote: "All clear." }), false);
    expect(resumed.tone).toBe("accent");
    expect(resumed.text).toBe("BTG's note: All clear.");
    expect(resumed.ask).toBeNull();

    const cancelled = pauseWords(dispute({ state: "CANCELLED", paused: false }), false);
    expect(cancelled.tone).toBe("danger");
    expect(cancelled.text).toMatch(/earning stays held/);
  });
  it("writes the one-line note for lists", () => {
    expect(pausedNote(dispute())).toMatch(/^Paused since .* — a concern raised by school · northside high; waiting on documents$/);
    expect(pausedNote(dispute({ state: "DOCUMENTS_IN" }))).toMatch(/documents in, BTG deciding$/);
  });
});

describe("roles and refusals", () => {
  it("lets BTG admin manage and campaign managers and Finance read", () => {
    expect(mayManageDisputes(["BTG_ADMIN"])).toBe(true);
    expect(mayManageDisputes(["CAMPAIGN_MGR"])).toBe(false);
    expect(mayReadDisputes(["CAMPAIGN_MGR"])).toBe(true);
    expect(mayReadDisputes(["FINANCE"])).toBe(true);
    expect(mayReadDisputes(["SPONSOR_ADMIN"])).toBe(false);
  });
  it("recognises a paused refusal", () => {
    expect(isDealPaused(409, { error: { code: "deal_paused" } })).toBe(true);
    expect(isDealPaused(409, { error: { code: "deal_dispute_closed" } })).toBe(false);
    expect(isDealPaused(422, { error: { code: "deal_paused" } })).toBe(false);
  });
  it("turns desk refusals into plain words", () => {
    expect(dealDisputeRefusal(403, null, "x")).toMatch(/only a BTG admin/);
    expect(dealDisputeRefusal(409, { error: { code: "deal_not_disputable" } }, "x")).toMatch(/sent, accepted or live/);
    expect(dealDisputeRefusal(409, { error: { code: "deal_already_paused" } }, "x")).toMatch(/already has an open dispute/);
    expect(dealDisputeRefusal(409, { error: { code: "deal_dispute_closed" } }, "x")).toMatch(/already been decided/);
    expect(dealDisputeRefusal(422, { error: { code: "deal_dispute_document", message: "Too big." } }, "x")).toBe("Too big.");
    expect(dealDisputeRefusal(500, null, "Something went wrong.")).toBe("Something went wrong.");
  });
});
