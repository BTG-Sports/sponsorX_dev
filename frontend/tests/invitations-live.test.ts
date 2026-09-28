import { describe, expect, it } from "vitest";

import {
  fixtureInboxRow,
  inviteMoves,
  timeLeft,
  toInboxRow,
  type ApiInvitation,
} from "../src/lib/invitations-live";
import { invitations } from "../src/lib/fixtures";

/* --------------------------------------------------------------------------
   P4-FE-04 — the inbox's live translation, pinned. What matters: nothing
   the API does not answer is invented on a live card; the §21 machine's
   asymmetry (accept only after viewing, decline from either open state)
   is what the card offers; and a lapsed-but-unswept invite is not
   presented as open time.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-09-28T12:00:00Z");

function api(over: Partial<ApiInvitation> = {}): ApiInvitation {
  return {
    id: "inv_1",
    state: "INVITED",
    offered: 40_000,
    jobId: "SX-01",
    jobName: "Story Drop",
    campaignName: "Fall Launch",
    sponsorName: "Harborline Coffee Co.",
    sentAt: "2026-09-25T10:00:00.000Z",
    viewedAt: null,
    respondedAt: null,
    expiresAt: "2026-09-30T12:00:00.000Z",
    ...over,
  };
}

describe("toInboxRow", () => {
  it("maps names and money straight through, in cents", () => {
    const r = toInboxRow(api(), NOW);
    expect(r).toMatchObject({
      id: "inv_1",
      state: "INVITED",
      offered: 40_000,
      sponsor: "Harborline Coffee Co.",
      campaign: "Fall Launch",
      jobId: "SX-01",
      jobName: "Story Drop",
      sentAt: "2026-09-25T10:00:00.000Z",
    });
  });

  it("invents none of the order's terms", () => {
    const r = toInboxRow(api(), NOW);
    expect(r.deliverableCount).toBeNull();
    expect(r.usageRights).toBeNull();
    expect(r.exclusivity).toBeNull();
    expect(r.declineReason).toBeNull();
  });

  it("counts time left from the clock for an open invite", () => {
    const r = toInboxRow(api(), NOW);
    expect(r.hoursLeft).toBe(48);
    expect(r.expiresIn).toBe("2 days");
  });

  it("does not show open time on a lapsed invite the sweep has not reached", () => {
    const r = toInboxRow(api({ expiresAt: "2026-09-28T11:00:00.000Z" }), NOW);
    expect(r.state).toBe("INVITED");
    expect(r.expiresIn).toBe("expired");
    expect(r.hoursLeft).toBe(Number.POSITIVE_INFINITY);
  });

  it("labels resolved invites with what happened, not a countdown", () => {
    const accepted = toInboxRow(
      api({ state: "ACCEPTED", respondedAt: "2026-09-26T09:00:00.000Z" }),
      NOW,
    );
    expect(accepted.expiresIn).toBe("accepted Sep 26");
    expect(accepted.hoursLeft).toBe(Number.POSITIVE_INFINITY);
    expect(toInboxRow(api({ state: "EXPIRED" }), NOW).expiresIn).toBe("expired");
    expect(toInboxRow(api({ state: "DECLINED" }), NOW).expiresIn).toBe("declined");
  });

  it("names BTG when a campaign has no sponsor org", () => {
    expect(toInboxRow(api({ sponsorName: null }), NOW).sponsor).toBe("BTG");
  });
});

describe("timeLeft", () => {
  it("speaks the fixture vocabulary", () => {
    expect(timeLeft(0.5)).toBe("under an hour");
    expect(timeLeft(1)).toBe("1 hour");
    expect(timeLeft(9.7)).toBe("9 hours");
    expect(timeLeft(47)).toBe("47 hours");
    expect(timeLeft(72)).toBe("3 days");
  });
});

describe("inviteMoves — §21's asymmetry", () => {
  it("INVITED can be opened or declined, never accepted unseen", () => {
    expect(inviteMoves("INVITED")).toEqual({ open: true, accept: false, decline: true });
  });
  it("VIEWED can be accepted or declined", () => {
    expect(inviteMoves("VIEWED")).toEqual({ open: false, accept: true, decline: true });
  });
  it("resolved states offer nothing", () => {
    for (const s of ["ACCEPTED", "DECLINED", "EXPIRED"] as const) {
      expect(inviteMoves(s)).toEqual({ open: false, accept: false, decline: false });
    }
  });
});

describe("fixtureInboxRow", () => {
  it("keeps every fixture term and derives hours from the string", () => {
    const r = fixtureInboxRow(invitations[0]);
    expect(r.deliverableCount).toBe(invitations[0].deliverableCount);
    expect(r.usageRights).toBe(invitations[0].usageRights);
    expect(r.hoursLeft).toBe(48);
    expect(r.sentAt).toBeNull();
  });
});
