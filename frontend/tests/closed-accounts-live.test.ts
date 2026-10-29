import { describe, expect, it } from "vitest";

import {
  APPLY_AGAIN_TEXT, askedLine, byLine, CLOSING_TAB, closedTab, daysLeftWords, deskRefusal, deskTab, heldSinceLine, heldWhyCell, historyOf,
  keptCell, keptLine, kindWords, nowView, possessive, readOnlyLine, requestRefusal, requestStateBadge, statusBadge, whyBadge, whyTitle,
  type ApiClosure, type ApiClosureRequestDetail,
} from "../src/lib/closed-accounts-live";

/* --------------------------------------------------------------------------
   2S1-FE-08 (BTG half) — the Closed accounts desk's words, over
   GET /account-closures and GET /account-closures/:id.
   POL-FE-11 — the "Waiting to close" tab, over GET /account-closure-requests
   and GET /account-closure-requests/:id (now, canClose).
   -------------------------------------------------------------------------- */

/** Riley's closure held for a live sale — the backend test's first case, as GET /account-closure-requests/:id answers it. */
const rileyHeld: ApiClosureRequestDetail = {
  id: "r1", account: "ATHLETE", subjectId: "a1", state: "HELD", reason: "Moving abroad",
  holdReasons: ["1 live deal with Bay Brewing: BTG settles it with the sponsor first"],
  requestedAt: "2026-09-28T16:15:00Z", decidedAt: null, declineNote: null, closureId: null, accountName: "Riley Carter",
  now: {
    liveDeals: [{ kind: "MARKETPLACE_SALE", id: "d1", title: "Signed jersey", state: "DELIVERED", sponsorId: "sp1", sponsorName: "Bay Brewing", athleteName: "Riley" }],
    openInvitations: 1, wards: [], money: { owedCents: 12_500, accountReady: true },
    holdReasons: ["1 live deal with Bay Brewing: BTG settles it with the sponsor first"],
  },
  canClose: false,
};

describe("closures waiting for BTG (POL-FE-11)", () => {
  it("is the desk's first tab, by its own key", () => {
    expect(deskTab("closing")).toBe("closing");
    expect(deskTab(["closing"])).toBe("closing");
    expect(deskTab(undefined)).toBe("asking");
    expect(deskTab("btg")).toBe("btg");
    expect(CLOSING_TAB.empty[0]).toBe("Nobody is waiting to close.");
  });

  it("names the state and why it's held", () => {
    expect(requestStateBadge("HELD")).toMatchObject({ label: "Waiting for BTG", tone: "warn" });
    expect(requestStateBadge("DECLINED").label).toBe("Kept open");
    expect(heldWhyCell(rileyHeld.holdReasons)).toEqual({ first: rileyHeld.holdReasons[0], more: null });
    expect(heldWhyCell(["a", "b", "c"]).more).toBe("+ 2 more");
    expect(heldWhyCell([]).first).toMatch(/can close now/);
    expect(heldSinceLine("2026-09-28T16:15:00Z", new Date("2026-10-01T12:00:00Z"))).toBe("Asked Sep 28, 4:15 PM · 2 days waiting");
    expect(heldSinceLine("2026-10-01T09:00:00Z", new Date("2026-10-01T12:00:00Z"))).toMatch(/· today$/);
  });

  it("shows what is still live now, and when nothing is left", () => {
    const v = nowView(rileyHeld);
    expect(v.title).toBe("Still live now");
    expect(v.deals).toEqual([{ id: "d1", title: "Signed jersey", sponsor: "Bay Brewing", state: "delivered, not yet confirmed", who: null }]);
    expect(v.lines).toEqual([
      "$125.00 earned, with a payout account ready: it is requested when the account closes.",
      "1 open invitation — declined when it closes.",
    ]);
    expect(v.canClose).toBe(false);
    const settled = nowView({ ...rileyHeld, canClose: true, now: { ...rileyHeld.now!, liveDeals: [], holdReasons: [] } });
    expect(settled.title).toBe("Nothing is left — it can close now");
    expect(settled.deals).toEqual([]);
    const guardian = nowView({ ...rileyHeld, account: "GUARDIAN", now: { liveDeals: [{ ...rileyHeld.now!.liveDeals[0]!, athleteName: "Mia" }], openInvitations: 0, wards: [{ id: "m", name: "Mia" }], money: null, holdReasons: ["x"] } });
    expect(guardian.deals[0]!.who).toBe("for Mia");
    expect(guardian.lines).toEqual(["Still the guardian for Mia."]);
    const decided: ApiClosureRequestDetail = { ...rileyHeld, state: "CLOSED", now: null };
    expect(nowView(decided).title).toBe("Decided");
  });

  it("a refused Close now carries what is still open", () => {
    expect(requestRefusal(409, { error: { message: "It can't close yet: 1 live deal with Bay Brewing: BTG settles it with the sponsor first." } }, "x")).toMatch(/can't close yet: 1 live deal/);
    expect(requestRefusal(403, null, "x")).toMatch(/BTG admin/);
    expect(requestRefusal(500, null, "It wasn't closed")).toBe("It wasn't closed (HTTP 500).");
  });
});

/** Bay Brewing asking to come back — the design's CA-2, as the API returns it. */
const bay: ApiClosure = {
  id: "c1", standing: "CLOSED_BY_BTG", kind: "SPONSOR", greeting: "Sam", name: "Bay Brewing", subjectId: "sp1",
  cause: "REJECTED", state: "CLOSED", reason: "Restricted business type: alcohol.",
  closedAt: "2026-09-20T14:10:00Z", retainUntil: "2026-10-20T14:10:00Z", daysLeft: 19,
  requestedAt: "2026-09-28T16:15:00Z", requestNote: "We’re a café and bakery now.", requestDeclined: false,
  reactivatedAt: null, purgedAt: null, application: false,
  contactEmail: "sam@bay.example", closedByEmail: "staff@btg.example", decision: null, decidedAt: null, decidedByEmail: null, decisionNote: null,
  subjectHref: "/admin/sponsor-requests/inq1", reinstatable: true, canDecline: true,
};

describe("closed accounts desk words", () => {
  it("tabs default to Asking to come back, with the design's empty words", () => {
    expect(closedTab(undefined).key).toBe("asking");
    expect(closedTab("deleted").key).toBe("deleted");
    expect(closedTab("nope").key).toBe("asking");
    expect(closedTab("asking").empty[0]).toBe("Nobody is asking to come back.");
  });

  it("names the kind and why it closed", () => {
    expect(kindWords("PROPERTY")).toBe("Organization");
    expect(kindWords("INQUIRY")).toBe("Application (rejected before approval)");
    expect(whyBadge(bay).label).toBe("Rejected by BTG");
    expect(whyBadge({ ...bay, cause: "SELF" }).label).toBe("Closed by the owner");
    expect(whyBadge({ ...bay, kind: "ATHLETE", cause: "TERMINATED" }).label).toBe("Ended — no ID within 90 days of turning 18");
    expect(whyBadge({ ...bay, state: "PURGED" }).label).toBe("Files deleted");
    expect(statusBadge(bay)).toMatchObject({ label: "Asking to come back", tone: "warn" });
    expect(statusBadge({ ...bay, requestDeclined: true }).label).toBe("Rejected by BTG");
  });

  it("says how long the files are kept", () => {
    expect(daysLeftWords(19)).toBe("19 days left");
    expect(daysLeftWords(1)).toBe("1 day left");
    expect(keptCell(bay)).toEqual({ date: "Oct 20", left: "19 days left" });
    expect(keptLine(bay)).toBe("Files kept until Oct 20 · 19 days left");
    const gone = { ...bay, state: "PURGED" as const, purgedAt: "2026-09-25T03:00:00Z" };
    expect(keptCell(gone).date).toBe("Files deleted on Sep 25 — they would need to sign up again");
    expect(keptLine(gone)).toBe("Files deleted on Sep 25.");
  });

  it("writes the detail's lines", () => {
    expect(whyTitle(bay)).toBe("Why BTG closed it");
    expect(whyTitle({ ...bay, application: true })).toBe("Why BTG rejected the application");
    expect(whyTitle({ ...bay, cause: "SELF" })).toBe("Why it closed");
    expect(byLine(bay)).toBe("Closed by staff@btg.example · Sep 20, 2:10 PM");
    expect(byLine({ ...bay, cause: "SELF", name: "Riley Carter" })).toBe("Closed by Riley Carter from Settings · Sep 20, 2:10 PM");
    expect(byLine({ ...bay, cause: "TERMINATED" })).toBe("Ended automatically · Sep 20");
    expect(askedLine(bay)).toBe("Asked Sep 28, 4:15 PM · from sam@bay.example");
    expect(possessive("Bay Brewing")).toBe("Bay Brewing’s");
    expect(possessive("Laurel Lions")).toBe("Laurel Lions’");
    expect(APPLY_AGAIN_TEXT).toMatch(/apply again/);
  });

  it("has nothing for BTG to do on the owner's, coming-of-age and deleted closures", () => {
    expect(readOnlyLine(bay)).toBeNull();
    expect(readOnlyLine({ ...bay, kind: "ATHLETE", cause: "SELF", standing: "CLOSED_SELF", greeting: "Riley", retainUntil: "2026-10-24T00:00:00Z" }))
      .toBe("Riley can reactivate by themselves until Oct 24 using the link we emailed. Nothing for you to do.");
    expect(readOnlyLine({ ...bay, kind: "ATHLETE", cause: "TERMINATED", greeting: "Jordan", retainUntil: "2026-10-13T00:00:00Z" }))
      .toBe("Jordan can bring the account back by uploading a government ID until Oct 13, using the link we emailed. Nothing for you to do.");
    expect(readOnlyLine({ ...bay, state: "PURGED", purgedAt: "2026-09-25T00:00:00Z" })).toBe("Files deleted on Sep 25. To come back they need to sign up again.");
  });

  it("tells the history from the closure's own dates", () => {
    expect(historyOf(bay).map((h) => h.text)).toEqual([
      "Closed by BTG", "Asked to come back", "Declined or reinstated: not yet", "Files deleted if not reinstated",
    ]);
    const declined = { ...bay, canDecline: false, requestDeclined: true, decision: "DECLINED" as const, decidedAt: "2026-09-29T10:00:00Z", decidedByEmail: "staff@btg.example", decisionNote: "Still alcohol." };
    expect(historyOf(declined).map((h) => h.text)).toContain("Declined by staff@btg.example: “Still alcohol.”");
    expect(historyOf({ ...bay, cause: "SELF", requestedAt: null, canDecline: false, reinstatable: false }).map((h) => h.text))
      .toEqual(["Closed by the owner", "Files deleted if not reactivated"]);
  });

  it("refusals", () => {
    expect(deskRefusal(403, null, "x")).toMatch(/BTG admin/);
    expect(deskRefusal(409, { error: { message: "There is no open request to come back on this account." } }, "x")).toMatch(/no open request/);
    expect(deskRefusal(500, null, "The answer wasn't sent")).toBe("The answer wasn't sent (HTTP 500).");
  });
});
