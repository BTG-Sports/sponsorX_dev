import { describe, expect, it } from "vitest";

import { launchedLines, launchRefusal, mayLaunchNow } from "../src/lib/campaign-stage";

/* --------------------------------------------------------------------------
   POL-FE-51 — "Launch now" on BTG's campaign page (POST /campaigns/{id}/launch,
   P5-BE-04). The API is the gate; these pin what the page OFFERS so it never
   shows a button the API would refuse: only APPROVAL may go live (STAFFING
   cannot skip approval, campaign-state.ts), and only BTG launches — BTG
   admins, campaign managers, SUPER_ADMIN (tenant-wide campaign.approve).
   -------------------------------------------------------------------------- */

describe("who sees Launch now, and when", () => {
  it("BTG admins, campaign managers and SUPER_ADMIN, on a campaign in APPROVAL", () => {
    for (const r of ["BTG_ADMIN", "CAMPAIGN_MGR", "SUPER_ADMIN"]) expect(mayLaunchNow("APPROVAL", [r]), r).toBe(true);
  });

  it("no one else — a sponsor admin's own approve is refused by the domain, so it isn't offered", () => {
    for (const r of ["SPONSOR_ADMIN", "NETWORK_MGR", "SALES", "FINANCE"]) expect(mayLaunchNow("APPROVAL", [r]), r).toBe(false);
  });

  it("no other stage: STAFFING can't skip approval, and a live or closed campaign has nothing to launch", () => {
    for (const s of ["DRAFT", "STAFFING", "ACTIVE", "REPORTING", "COMPLETED", "CANCELLED"]) expect(mayLaunchNow(s, ["BTG_ADMIN"]), s).toBe(false);
  });
});

describe("after launching", () => {
  it("says it's live today and how many signed orders went live", () => {
    expect(launchedLines({ id: "c", state: "ACTIVE", ordersActivated: 3 })).toEqual([
      "Launched. The campaign is live from today and 3 signed orders are now live work. The sponsor can see results.",
    ]);
    expect(launchedLines({ id: "c", state: "ACTIVE", ordersActivated: 1 })[0]).toContain("1 signed order is now live work");
    expect(launchedLines({ id: "c", state: "ACTIVE", ordersActivated: 0 })[0]).toBe("Launched. The campaign is live from today. The sponsor can see results.");
  });

  it("names the rewards that went live and any left a draft, with the reason", () => {
    const lines = launchedLines({
      id: "c", state: "ACTIVE", ordersActivated: 0,
      rewards: { activated: 2, leftInDraft: [{ id: "r1", offerText: "Free fries", reason: "it has no end date" }] },
    });
    expect(lines).toContain("2 fan rewards are live too.");
    expect(lines).toContain("A reward stayed a draft: “Free fries” — it has no end date");
  });
});

describe("a refused launch, in words", () => {
  const said = (message: string) => ({ error: { message } });

  it("a campaign that moved on: names the stage it is in, not the state machine", () => {
    expect(launchRefusal(409, said("A campaign cannot go from STAFFING to ACTIVE. Legal moves from STAFFING: APPROVAL, DRAFT, CANCELLED.")))
      .toBe("It wasn't launched: the campaign is staffing now, and only a campaign waiting for approval can be launched. Reload the page to see where it is.");
    expect(launchRefusal(409, said("A campaign cannot go from ACTIVE to ACTIVE. Legal moves from ACTIVE: REPORTING, CANCELLED."))).toMatch(/^It's already live/);
  });

  it("a race, a role, a lost session and an outage", () => {
    expect(launchRefusal(409, said("This campaign is no longer APPROVAL, so it can't move to ACTIVE. Reload it and look again."))).toMatch(/^Someone else moved this campaign/);
    expect(launchRefusal(403, null)).toMatch(/Only BTG admins and campaign managers/);
    expect(launchRefusal(401, null)).toMatch(/session has ended/);
    expect(launchRefusal(503, null)).toMatch(/wasn't launched/);
  });

  it("otherwise passes on what the API said", () => {
    expect(launchRefusal(422, said("Something specific."))).toBe("It wasn't launched: Something specific.");
    expect(launchRefusal(418, null)).toBe("It wasn't launched (HTTP 418).");
  });
});
