import { describe, expect, it } from "vitest";

import {
  APPLY_AGAIN_TEXT, askedLine, byLine, closedTab, daysLeftWords, deskRefusal, historyOf, keptCell, keptLine, kindWords,
  possessive, readOnlyLine, statusBadge, whyBadge, whyTitle, type ApiClosure,
} from "../src/lib/closed-accounts-live";

/* --------------------------------------------------------------------------
   2S1-FE-08 (BTG half) — the Closed accounts desk's words, over
   GET /account-closures and GET /account-closures/:id.
   -------------------------------------------------------------------------- */

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
