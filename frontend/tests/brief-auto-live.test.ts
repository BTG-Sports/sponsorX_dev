import { describe, expect, it } from "vitest";

import {
  approvalBadge,
  filterBriefs,
  isHeld,
  tabCounts,
  toBriefRow,
  type ApiBrief,
} from "../src/lib/briefs-live";
import {
  APPROVED_TEXT,
  REVIEWING_TEXT,
  campaignApprovalLine,
  openRequests,
  requestStatus,
  submittedMessage,
  toRequestRow,
  type ApiSponsorRequest,
} from "../src/lib/brief-status";

/* --------------------------------------------------------------------------
   P4-FE-09 — the screens for P4-BE-11 (sponsor briefs approved
   automatically; BTG handles only the exceptions): BTG's "Held for BTG" tab
   and "Approved automatically" badge, and what the sponsor is told.
   -------------------------------------------------------------------------- */

const brief = (over: Partial<ApiBrief> = {}): ApiBrief => ({
  id: "b1", objective: "Drive foot traffic to the new store this fall season", state: "DRAFT", budget: 150_000,
  startDate: "2026-10-20T00:00:00.000Z", endDate: "2026-11-17T00:00:00.000Z", sports: ["Soccer"], stateCodes: [],
  categories: [], createdAt: "2026-10-01T00:00:00.000Z", sponsorName: "Harbor Coffee", package: null, campaign: null,
  ...over,
});
const HELD_AT = "2026-10-03T09:00:00.000Z";

describe("BTG's brief desk · held for BTG", () => {
  it("a brief is held while it is DRAFT with a hold on it — not once BTG takes it on", () => {
    expect(isHeld({ state: "DRAFT", heldAt: HELD_AT })).toBe(true);
    expect(isHeld({ state: "DRAFT", heldAt: null })).toBe(false);
    expect(isHeld({ state: "DRAFT" })).toBe(false);
    expect(isHeld({ state: "QUALIFIED", heldAt: HELD_AT })).toBe(false);
  });

  it("carries the reasons onto the row; a sponsor's read (no reasons sent) is never held", () => {
    const r = toBriefRow(brief({ heldAt: HELD_AT, heldReasons: ["No package — BTG prices custom requests"] }));
    expect(r).toMatchObject({ held: true, heldReasons: ["No package — BTG prices custom requests"], autoApproved: false });
    expect(toBriefRow(brief())).toMatchObject({ held: false, heldReasons: [] });
  });

  it("counts and filters the held tab", () => {
    const rows = [
      brief({ id: "a", heldAt: HELD_AT, heldReasons: ["Only 3 athletes fit; the package needs 5"] }),
      brief({ id: "b" }),
      brief({ id: "c", state: "QUALIFIED", heldAt: HELD_AT, heldReasons: ["Alcohol is a sensitive category — BTG reviews these"] }),
      brief({ id: "d", state: "CAMPAIGN_CREATED", autoApproved: true }),
    ].map(toBriefRow);
    expect(tabCounts(rows)).toMatchObject({ held: 1, all: 4, DRAFT: 2, QUALIFIED: 1, CAMPAIGN_CREATED: 1 });
    expect(filterBriefs(rows, { tab: "held", sport: "", q: "" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterBriefs(rows, { tab: "all", sport: "", q: "" }).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("'Approved automatically' on a brief the system approved — not on one BTG approved", () => {
    expect(approvalBadge(toBriefRow(brief({ state: "CAMPAIGN_CREATED", autoApproved: true })))).toEqual({ label: "Approved automatically", tone: "accent" });
    expect(approvalBadge(toBriefRow(brief({ state: "APPROVED" })))).toBeNull();
    expect(approvalBadge(toBriefRow(brief()))).toBeNull();
  });
});

describe("the sponsor · what they are told", () => {
  it("the API's sponsor-safe line, or the same rule from the state", () => {
    expect(requestStatus({ state: "DRAFT", status: { key: "REVIEWING", text: REVIEWING_TEXT } }).text).toBe(REVIEWING_TEXT);
    expect(requestStatus({ state: "DRAFT" })).toEqual({ key: "REVIEWING", text: "BTG is reviewing your request — usually within a working day" });
    expect(requestStatus({ state: "QUALIFIED" }).key).toBe("REVIEWING");
    expect(requestStatus({ state: "CAMPAIGN_CREATED" })).toEqual({ key: "APPROVED", text: "Approved — your campaign is being staffed" });
    expect(requestStatus({ state: "CLOSED" }).key).toBe("CLOSED");
  });

  it("the drawer says approved, or reviewing — never why", () => {
    expect(submittedMessage({ key: "APPROVED", text: APPROVED_TEXT })).toMatchObject({ title: APPROVED_TEXT, approved: true });
    const waiting = submittedMessage({ key: "REVIEWING", text: REVIEWING_TEXT });
    expect(waiting).toMatchObject({ title: "Request received", approved: false });
    expect(waiting.body).toContain(REVIEWING_TEXT);
    expect(submittedMessage(null).body).toContain(REVIEWING_TEXT);
  });

  const req = (over: Partial<ApiSponsorRequest> = {}): ApiSponsorRequest => ({
    id: "r1", state: "DRAFT", objective: "x", budget: 150_000, createdAt: "2026-10-01T00:00:00.000Z",
    package: { name: "Local Blitz" }, campaign: null, status: { key: "REVIEWING", text: REVIEWING_TEXT }, ...over,
  });

  it("the requests list: still waiting to be a campaign, each with its plain status", () => {
    const rows = openRequests([
      req({ id: "a" }),
      req({ id: "b", state: "APPROVED", status: { key: "APPROVED", text: APPROVED_TEXT } }),
      req({ id: "c", state: "CAMPAIGN_CREATED", campaign: { id: "c1", name: "C", state: "DRAFT" } }),
      req({ id: "d", state: "CLOSED" }),
    ]).map(toRequestRow);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ title: "Local Blitz", budget: "$1,500", submitted: "Oct 1, 2026", tone: "warn", status: { text: REVIEWING_TEXT } });
    expect(rows[1]).toMatchObject({ tone: "accent", status: { text: APPROVED_TEXT } });
    expect(toRequestRow(req({ package: null })).title).toBe("Custom request");
  });

  it("the campaign page says approved while it is being staffed", () => {
    expect(campaignApprovalLine("DRAFT")).toBe(APPROVED_TEXT);
    expect(campaignApprovalLine("STAFFING")).toBe(APPROVED_TEXT);
    expect(campaignApprovalLine("ACTIVE")).toBeNull();
  });
});
