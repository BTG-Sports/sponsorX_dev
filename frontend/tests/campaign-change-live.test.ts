import { describe, expect, it } from "vitest";

import { proposalOf, validCampaignId } from "../src/lib/campaign-change-live";
import {
  NO_MONEY_MOVES,
  NOT_AVAILABLE_YET,
  campaignButtons,
  changeFormFrom,
  confirmButton,
  dateOnly,
  dayWords,
  decisionWords,
  declineNoteProblem,
  holdNote,
  impactGroups,
  impactHeadline,
  impactMoneyLines,
  mayManageCampaign,
  outcomeMessage,
  parseBudget,
  proposalFrom,
  proposalLines,
  reasonProblem,
  requestCounts,
  requestWaiting,
  requesterWords,
  sortRequests,
  type ApiCampaignImpact,
  type ApiCampaignRequest,
} from "@/lib/campaign-change-live";

/* P8-FE-12 — Cancel and Change a campaign, with what they affect: who sees
   the buttons and when, the impact read (P8-BE-12's contract) in words, the
   change form turned into the proposal, the outcome, and BTG's queue. */

const impact = (o: Partial<ApiCampaignImpact> = {}): ApiCampaignImpact => ({
  allowed: true,
  automatic: true,
  holdReasons: [],
  refusals: [],
  affected: {
    total: 7,
    groups: [
      { key: "offers", label: "Offers and invitations not yet accepted", count: 3, outcome: "Withdrawn — no cost", items: [{ id: "o1", name: "Riley Carter" }, { id: "o2", name: "Sam Ortiz" }, { id: "o3", name: "Jo Lee" }] },
      { key: "orders", label: "Accepted orders whose work hasn't started", count: 2, outcome: "Cancelled — the athlete is emailed", items: [{ id: "c1", name: "Ava Chen", detail: "2 posts" }, { id: "c2", name: "Max Ruiz" }] },
      { key: "delivered", label: "Work already delivered", count: 2, outcome: "Still paid — the work was delivered", items: [{ id: "d1", name: "Ava Chen" }, { id: "d2", name: "Lee Park" }] },
      { key: "rewards", label: "Live fan rewards", count: 0, outcome: "Paused", items: [] },
    ],
  },
  money: { refundCents: 120_000, owedCents: 45_000 },
  ...o,
});

const current = { name: "Spring Launch", startDate: "2026-11-01T00:00:00.000Z", endDate: "2026-12-15T00:00:00.000Z", budget: 1_240_000 };

describe("the buttons", () => {
  it("are the sponsor's admin's and BTG's, never an analyst's or Sales'", () => {
    for (const role of ["SPONSOR_ADMIN", "BTG_ADMIN", "SUPER_ADMIN", "CAMPAIGN_MGR"]) expect(mayManageCampaign([role]), role).toBe(true);
    for (const role of ["SPONSOR_ANALYST", "SALES", "FINANCE", "NETWORK_MGR", "ATHLETE"]) expect(mayManageCampaign([role]), role).toBe(false);
    expect(campaignButtons("ACTIVE", ["SPONSOR_ANALYST"])).toEqual({ change: false, cancel: false });
    expect(campaignButtons("ACTIVE", [])).toEqual({ change: false, cancel: false });
  });

  it("hide Cancel once the campaign is reporting or completed, and both once cancelled", () => {
    for (const state of ["DRAFT", "STAFFING", "APPROVAL", "ACTIVE"]) expect(campaignButtons(state, ["SPONSOR_ADMIN"]), state).toEqual({ change: true, cancel: true });
    expect(campaignButtons("REPORTING", ["BTG_ADMIN"])).toEqual({ change: true, cancel: false });
    expect(campaignButtons("COMPLETED", ["BTG_ADMIN"])).toEqual({ change: true, cancel: false });
    expect(campaignButtons("CANCELLED", ["BTG_ADMIN"])).toEqual({ change: false, cancel: false });
  });
});

describe("the impact in words", () => {
  it("headlines the count of affected products", () => {
    expect(impactHeadline(impact())).toBe("This affects 7 products");
    expect(impactHeadline(impact({ affected: { total: 1, groups: [] } }))).toBe("This affects 1 product");
    expect(impactHeadline(impact({ affected: { total: 0, groups: [] } }))).toBe("This affects no products");
  });

  it("lists only the groups with something in them, each with its outcome", () => {
    const groups = impactGroups(impact());
    expect(groups.map((g) => [g.label, g.count, g.outcome])).toEqual([
      ["Offers and invitations not yet accepted", 3, "Withdrawn — no cost"],
      ["Accepted orders whose work hasn't started", 2, "Cancelled — the athlete is emailed"],
      ["Work already delivered", 2, "Still paid — the work was delivered"],
    ]);
    expect(groups[1]!.items[0]).toEqual({ id: "c1", name: "Ava Chen", detail: "2 posts" });
  });

  it("shows the refund and what is still owed for delivered work, or that no money moves", () => {
    expect(impactMoneyLines(impact())).toEqual([
      { label: "Refund", amount: "$1,200.00", tone: "refund" },
      { label: "Still owed for delivered work", amount: "$450.00", tone: "owed" },
    ]);
    expect(impactMoneyLines(impact({ money: { refundCents: 0, owedCents: 0 } }))).toEqual([]);
    expect(NO_MONEY_MOVES).toMatch(/No money moves/);
  });

  it("says why BTG has to approve it, only when it is held", () => {
    expect(holdNote(impact())).toBeNull();
    expect(holdNote(impact({ automatic: false, holdReasons: ["2 posts were delivered", "an order is a minor's"] }))).toBe(
      "This needs BTG's approval because: 2 posts were delivered; an order is a minor's",
    );
    expect(holdNote(impact({ automatic: false, holdReasons: [] }))).toBe("This needs BTG's approval.");
    /* Refused outright: the refusal speaks, not the hold. */
    expect(holdNote(impact({ automatic: false, allowed: false, holdReasons: ["x"] }))).toBeNull();
  });

  it("names the confirm button: the action, Send to BTG when held, off with the refusal", () => {
    expect(confirmButton("cancel", impact())).toEqual({ label: "Cancel campaign", disabled: false, why: null, danger: true });
    expect(confirmButton("change", impact())).toEqual({ label: "Save changes", disabled: false, why: null, danger: false });
    expect(confirmButton("change", impact({ automatic: false, holdReasons: ["a closed edition"] }))).toMatchObject({ label: "Send to BTG", disabled: false, danger: false });
    expect(confirmButton("cancel", impact({ automatic: false }))).toMatchObject({ label: "Send to BTG", disabled: false });
    const refused = confirmButton("change", impact({ allowed: false, refusals: ["The budget can't go below $12,400 already committed"] }));
    expect(refused).toEqual({ label: "Save changes", disabled: true, why: "The budget can't go below $12,400 already committed", danger: false });
    expect(confirmButton("cancel", impact({ allowed: false }))).toMatchObject({ disabled: true, why: "This can't be done right now." });
  });

  it("puts the outcome in words", () => {
    expect(outcomeMessage("CANCELLED")).toBe("Campaign cancelled");
    expect(outcomeMessage("CHANGED")).toBe("Changes saved");
    expect(outcomeMessage("HELD_FOR_BTG")).toBe("Sent to BTG — we'll email you their answer");
    expect(NOT_AVAILABLE_YET).toMatch(/^Not available yet/);
  });
});

describe("the change form", () => {
  it("is prefilled from today's campaign: dates as days, the budget in whole dollars", () => {
    expect(changeFormFrom(current)).toEqual({ name: "Spring Launch", startDate: "2026-11-01", endDate: "2026-12-15", budget: "12400" });
    expect(changeFormFrom({ ...current, budget: undefined }).budget).toBe("");
    expect(dateOnly("2026-11-01T00:00:00.000Z")).toBe("2026-11-01");
    expect(dateOnly(undefined)).toBe("");
  });

  it("reads whole dollars, with or without the furniture", () => {
    expect(parseBudget("12400")).toBe(1_240_000);
    expect(parseBudget("$12,400")).toBe(1_240_000);
    expect(parseBudget("12400.50")).toBeNull();
    expect(parseBudget("-5")).toBeNull();
    expect(parseBudget("")).toBeNull();
  });

  it("proposes only what changed", () => {
    const form = changeFormFrom(current);
    expect(proposalFrom(current, form)).toEqual({ ok: false, message: "Nothing has changed yet." });
    expect(proposalFrom(current, { ...form, name: "  Spring Launch 2 " })).toEqual({ ok: true, proposal: { name: "Spring Launch 2" } });
    expect(proposalFrom(current, { ...form, endDate: "2026-12-31", budget: "15000" })).toEqual({ ok: true, proposal: { endDate: "2026-12-31", budget: 1_500_000 } });
    /* The name cleared then retyped the same is no change. */
    expect(proposalFrom(current, { ...form, name: "Spring Launch " })).toEqual({ ok: false, message: "Nothing has changed yet." });
    /* A budget that isn't whole dollars ($12,400.50) prefills as 12401 — an untouched form proposes no budget (review 2026-10-29). */
    const odd = { ...current, budget: 1_240_050 };
    expect(proposalFrom(odd, changeFormFrom(odd))).toEqual({ ok: false, message: "Nothing has changed yet." });
    expect(proposalFrom(odd, { ...changeFormFrom(odd), endDate: "2026-12-31" })).toEqual({ ok: true, proposal: { endDate: "2026-12-31" } });
  });

  it("proposalOf, for the server actions, forwards well-formed fields and refuses a wrong one with its reason — never drops it", () => {
    expect(proposalOf({ name: " New ", startDate: "2026-11-02", budget: 1_500_000.4, extra: 1 })).toEqual({ ok: true, proposal: { name: "New", startDate: "2026-11-02", budget: 1_500_000 } });
    expect(proposalOf({ name: "x".repeat(201), endDate: "2026-12-31" })).toEqual({ ok: false, message: "The name is too long — 200 characters at most." });
    expect(proposalOf({ endDate: "next week" })).toEqual({ ok: false, message: "The end date isn't a date." });
    expect(proposalOf({ name: "   " })).toEqual({ ok: false, message: "The campaign needs a name." });
    expect(proposalOf({ budget: -5 })).toEqual({ ok: false, message: "The budget must be whole dollars, like 12400." });
    expect(proposalOf(null)).toEqual({ ok: false, message: "Nothing has changed yet." });
    expect(proposalOf({ extra: 1 })).toEqual({ ok: false, message: "Nothing has changed yet." });
    expect(validCampaignId("qa_cmp_live")).toBe(true);
    expect(validCampaignId("")).toBe(false);
    expect(validCampaignId("..")).toBe(false);
  });

  it("refuses an empty name, a bad date, an end before the start and a budget that isn't whole dollars", () => {
    const form = changeFormFrom(current);
    expect(proposalFrom(current, { ...form, name: "  " })).toEqual({ ok: false, message: "The campaign needs a name." });
    expect(proposalFrom(current, { ...form, startDate: "next week" })).toMatchObject({ ok: false, message: "The start date isn't a date." });
    expect(proposalFrom(current, { ...form, endDate: "2026-10-01" })).toEqual({ ok: false, message: "The end date is before the start date." });
    expect(proposalFrom(current, { ...form, startDate: "2027-01-01" })).toEqual({ ok: false, message: "The end date is before the start date." });
    expect(proposalFrom(current, { ...form, budget: "12,400.99" })).toEqual({ ok: false, message: "The budget must be whole dollars, like 12400." });
    /* A budget left blank proposes no budget. */
    expect(proposalFrom({ ...current, budget: undefined }, { ...form, budget: "", name: "New" })).toEqual({ ok: true, proposal: { name: "New" } });
  });

  it("puts the proposal line by line", () => {
    expect(proposalLines({ name: "Winter Push", startDate: "2026-11-05", endDate: "2026-12-20", budget: 1_500_000 })).toEqual([
      "Name → Winter Push", "Starts → Nov 5, 2026", "Ends → Dec 20, 2026", "Budget → $15,000.00",
    ]);
    expect(proposalLines(null)).toEqual([]);
    expect(dayWords("not a date")).toBe("not a date");
  });

  it("asks for a reason on cancel, not on change", () => {
    expect(reasonProblem("", true)).toBe("Write a reason first.");
    expect(reasonProblem("   ", true)).toBe("Write a reason first.");
    expect(reasonProblem("", false)).toBeNull();
    expect(reasonProblem("Budget moved to Q2.", true)).toBeNull();
    expect(reasonProblem("x".repeat(2001), false)).toMatch(/too long/);
    expect(declineNoteProblem("")).toMatch(/Write a note first/);
    expect(declineNoteProblem("Keep it — the edition is closing.")).toBeNull();
  });
});

describe("BTG's queue", () => {
  const req = (o: Partial<ApiCampaignRequest> = {}): ApiCampaignRequest => ({
    id: "cr1", kind: "CANCEL", state: "PENDING", campaign: { id: "c1", name: "Spring Launch", sponsorName: "Westfield" },
    requestedBy: { name: "Dana Lee", role: "Sponsor Admin" }, requestedAt: "2026-10-27T10:00:00.000Z", reason: "Budget moved.", impact: impact({ automatic: false }), ...o,
  });

  it("knows which rows still wait, whatever the API calls the state", () => {
    expect(requestWaiting(req())).toBe(true);
    expect(requestWaiting(req({ state: "HELD" }))).toBe(true);
    expect(requestWaiting(req({ state: undefined }))).toBe(true);
    expect(requestWaiting(req({ state: "APPROVED" }))).toBe(false);
    expect(requestWaiting(req({ state: "DECLINED" }))).toBe(false);
    expect(requestWaiting(req({ decision: { decision: "APPROVE" } }))).toBe(false);
  });

  it("counts the tiles and sorts waiting first, newest first", () => {
    const rows = [
      req({ id: "a", requestedAt: "2026-10-20T00:00:00.000Z" }),
      req({ id: "b", kind: "CHANGE", requestedAt: "2026-10-28T00:00:00.000Z" }),
      req({ id: "c", state: "DECLINED", requestedAt: "2026-10-29T00:00:00.000Z" }),
      req({ id: "d", kind: "CHANGE", decision: { decision: "APPROVE" }, requestedAt: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(requestCounts(rows)).toEqual({ waiting: 2, cancels: 1, changes: 1, decided: 2 });
    expect(sortRequests(rows).map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("names the requester and the decision", () => {
    expect(requesterWords(req())).toBe("Asked by Dana Lee (Sponsor Admin)");
    expect(requesterWords(req({ requestedBy: { email: "dana@westfield.com" } }))).toBe("Asked by dana@westfield.com");
    expect(requesterWords(req({ requestedBy: null }))).toBeNull();
    expect(decisionWords(req())).toBeNull();
    expect(decisionWords(req({ decision: { decision: "APPROVE" } }))).toBe("Approved — the campaign was cancelled.");
    expect(decisionWords(req({ kind: "CHANGE", decision: { decision: "APPROVE" } }))).toBe("Approved — the changes were applied.");
    expect(decisionWords(req({ decision: { decision: "DECLINE", note: "Edition closes Friday." } }))).toBe("Declined — “Edition closes Friday.”");
    expect(decisionWords(req({ state: "DECLINED" }))).toBe("Declined.");
  });
});
