import { describe, expect, it } from "vitest";

import {
  closePanel, closePreviewView, dealStateWords, guardianClosesLine, heldView, invitationsLine, liveDealLine, moneyLine, possessive,
  reactivateDemo, reactivateView, sampleReactivation, wardsLine,
  type ApiClosurePreview, type ApiReactivationStatus,
} from "@/lib/account-closure-live";

/* 2S1-FE-08 (close / reactivate half) — the words the public reactivation page derives from GET /public/account/reactivation/:token.
   POL-FE-11 — the close row's preview (GET /me/close/preview), the held state and the minor rule. */

const now = new Date("2026-10-01T12:00:00.000Z");

/** Riley with one paid, undelivered sale — the backend test's first case, as GET /me/close/preview answers it. */
const rileyPreview: ApiClosurePreview = {
  account: "ATHLETE",
  liveDeals: [{ kind: "MARKETPLACE_SALE", id: "d1", title: "Signed jersey", state: "IN_DELIVERY", sponsorId: "sp1", sponsorName: "Bay Brewing", athleteName: "Riley" }],
  openInvitations: 2,
  wards: [],
  money: { owedCents: 12_500, accountReady: true },
  holdReasons: ["1 live deal with Bay Brewing: BTG settles it with the sponsor first"],
  wouldHold: true,
  heldRequest: null,
};

describe("closing — the preview before confirming (POL-FE-11)", () => {
  it("names each live deal's state, sponsor and — for a guardian — whose it is", () => {
    expect(dealStateWords("IN_DELIVERY")).toBe("in delivery");
    expect(dealStateWords("DELIVERED")).toBe("delivered, not yet confirmed");
    expect(dealStateWords("ACTIVE")).toBe("under way");
    expect(dealStateWords("SOMETHING_NEW")).toBe("something new");
    const deal = rileyPreview.liveDeals[0]!;
    expect(liveDealLine(deal, "ATHLETE")).toEqual({ id: "d1", title: "Signed jersey", sponsor: "Bay Brewing", state: "in delivery", who: null });
    expect(liveDealLine({ ...deal, athleteName: "Mia" }, "GUARDIAN").who).toBe("for Mia");
    expect(liveDealLine({ ...deal, title: "" }, "ATHLETE").title).toBe("Marketplace sale");
  });

  it("says what closing does to invitations, money and a guardian's minors", () => {
    expect(invitationsLine(0)).toBeNull();
    expect(invitationsLine(1)).toBe("1 open invitation is declined.");
    expect(invitationsLine(2)).toBe("2 open invitations are declined.");
    expect(moneyLine(null)).toBeNull();
    expect(moneyLine({ owedCents: 0, accountReady: false })).toBeNull();
    expect(moneyLine({ owedCents: 12_500, accountReady: true })).toBe("$125.00 you’ve earned is still paid to your payout account on file — no login needed.");
    expect(moneyLine({ owedCents: 12_500, accountReady: false })).toBe("$125.00 you’ve earned has no payout account to go to.");
    expect(wardsLine([])).toBeNull();
    expect(wardsLine([{ id: "a", name: "Mia" }])).toBe("You’re still the guardian for Mia.");
    expect(wardsLine([{ id: "a", name: "Mia" }, { id: "b", name: "Leo" }])).toBe("You’re still the guardian for Mia and Leo.");
  });

  it("with a live deal the dialog says BTG settles it first and the button asks BTG; without one it closes now", () => {
    const v = closePreviewView(rileyPreview);
    expect(v.title).toBe("Close your account?");
    expect(v.deals.map((d) => d.state)).toEqual(["in delivery"]);
    expect(v.lines).toEqual(["2 open invitations are declined.", "$125.00 you’ve earned is still paid to your payout account on file — no login needed."]);
    expect(v.hold).toMatchObject({ title: "BTG settles these first", reasons: rileyPreview.holdReasons });
    expect(v.hold?.stays).toMatch(/^Your account stays open until then/);
    expect(v.confirm).toBe("Ask BTG to close it");

    const clean = closePreviewView({ ...rileyPreview, liveDeals: [], openInvitations: 0, holdReasons: [], wouldHold: false });
    expect(clean.hold).toBeNull();
    expect(clean.confirm).toBe("Close account");
    expect(clean.deals).toEqual([]);
  });

  it("a guardian closing their minor's account reads the minor's name, not 'your'", () => {
    const v = closePreviewView({ ...rileyPreview, money: { owedCents: 5000, accountReady: false } }, "Mia");
    expect(v.title).toBe("Close Mia’s account?");
    expect(v.lines).toContain("$50.00 Mia earned has no payout account to go to.");
    expect(v.hold?.stays).toMatch(/^Mia’s account stays open/);
    expect(possessive("Hawks")).toBe("Hawks’");
  });

  it("held: the row says Waiting for BTG with the reasons and when they asked", () => {
    const v = heldView({ requestedAt: "2026-09-29T09:00:00.000Z", holdReasons: ["$50.00 earned and no payout account to send it to: BTG arranges how it is paid first"] });
    expect(v.title).toBe("Waiting for BTG");
    expect(v.since).toBe("You asked on Sep 29.");
    expect(v.reasons).toHaveLength(1);
    expect(v.body).toMatch(/^Your account stays open until BTG has settled these\. Withdraw/);
    expect(heldView({ requestedAt: "2026-09-29T09:00:00.000Z", holdReasons: [] }, "Mia").body).toMatch(/^Mia’s account stays open/);
  });

  it("the panel: ready, held on a later visit, the minor rule from 403 guardian_must_act, unknown otherwise", () => {
    expect(closePanel(200, rileyPreview)).toEqual({ kind: "ready", preview: rileyPreview });
    const held = { id: "r1", account: "ATHLETE" as const, subjectId: "a1", state: "HELD" as const, reason: null, holdReasons: ["x"], requestedAt: "2026-09-29T09:00:00.000Z", decidedAt: null, declineNote: null, closureId: null };
    expect(closePanel(200, { ...rileyPreview, heldRequest: held })).toEqual({ kind: "held", request: held });
    expect(closePanel(403, { error: { code: "guardian_must_act", message: "…" } }, "Carmen")).toEqual({ kind: "minor", guardianName: "Carmen" });
    expect(closePanel(403, { error: { message: "This login has no athlete, guardian or organization account to close." } }).kind).toBe("unknown");
    expect(closePanel(0, null).kind).toBe("unknown");
    expect(guardianClosesLine("Carmen")).toMatch(/^Carmen does this from their own login/);
    expect(guardianClosesLine(null)).toMatch(/^Your guardian does this/);
  });
});

describe("reactivating", () => {
  it("a self-closed account counts its 30 days and can come back", () => {
    const v = reactivateView(sampleReactivation("CLOSED_SELF", "Riley", now));
    expect(v.kind).toBe("self");
    if (v.kind !== "self") return;
    expect(v.left).toBe("23 days left");
    expect(v.headline).toBe("Riley, your account closed on Sep 24.");
    expect(v.body).toMatch(/^Reactivate by Oct 24/);
  });

  it("an account closed by BTG can't reactivate itself — it asks BTG, and says when it did", () => {
    const s = sampleReactivation("CLOSED_BY_BTG", "Riley", now);
    const v = reactivateView(s);
    expect(v.kind).toBe("btg");
    if (v.kind !== "btg") return;
    expect(v.body).toMatch(/can’t reactivate it yourself/);
    expect(v.kept).toBe("Your documents are kept until Oct 24, then deleted.");
    expect(v.asked).toBeNull();
    const asked = reactivateView({ ...s, requestedAt: "2026-09-28T09:00:00.000Z" });
    expect(asked.kind === "btg" && asked.asked).toBe("You asked BTG on Sep 28. A person at BTG will reply by email.");
    const no = reactivateView({ ...s, requestedAt: "2026-09-28T09:00:00.000Z", requestDeclined: true });
    expect(no.kind === "btg" && no.asked).toMatch(/replied by email/);
  });

  it("an account ended at coming of age comes back by the government ID, not by asking BTG", () => {
    const base = { ...sampleReactivation("CLOSED_BY_BTG", "Jordan", now), standing: "CLOSED_AT_AGE" as const };
    const athlete = reactivateView({ ...base, comingOfAgePath: "/coming-of-age/tok" });
    expect(athlete.kind).toBe("age");
    if (athlete.kind !== "age") return;
    expect(athlete.uploadPath).toBe("/coming-of-age/tok");
    expect(athlete.body).toBe("Upload your government ID by Oct 24 and your account comes back — no need to ask BTG.");
    expect(athlete.kept).toBe("Your documents are kept until Oct 24, then deleted.");
    /* No link of their own (closed with the guardian's address): the email's link. */
    const noLink = reactivateView(base);
    expect(noLink.kind === "age" && noLink.uploadPath).toBeNull();
    expect(noLink.kind === "age" && noLink.body).toMatch(/from the coming-of-age link we emailed you/);
    /* The guardian: nothing to reactivate; the athlete uploads. */
    const guardian = reactivateView({ ...base, kind: "GUARDIAN", greeting: "Pat", comingOfAgePath: "/coming-of-age/tok" });
    expect(guardian.kind === "age" && guardian.uploadPath).toBeNull();
    expect(guardian.kind === "age" && guardian.body).toMatch(/^There’s nothing to reactivate here\. Your athlete can bring their own account back/);
    expect(JSON.stringify([athlete, noLink, guardian])).not.toMatch(/Ask BTG to review/);
  });

  it("after 30 days the files are gone: sign up again; once back, the re-run checks are shown", () => {
    const base: ApiReactivationStatus = sampleReactivation("CLOSED_SELF", "Riley", now);
    expect(reactivateView({ ...base, standing: "EXPIRED" })).toMatchObject({ kind: "expired", body: /sign up again/ });
    expect(reactivateView({ ...base, standing: "REACTIVATED", recheckNotes: ["Everything checked out."] }))
      .toEqual({ kind: "back", badge: "Active again", headline: "Riley, your account is back.", notes: ["Everything checked out."] });
  });

  it("only two previews exist", () => {
    expect(reactivateDemo("self")).toBe("self");
    expect(reactivateDemo(["btg"])).toBe("btg");
    expect(reactivateDemo("other")).toBeNull();
  });
});
