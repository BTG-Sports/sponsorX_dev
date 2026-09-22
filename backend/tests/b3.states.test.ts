import { describe, expect, it } from "vitest";

import {
  BRIEF_STATES, canTransitionBrief, legalBriefTransitions, IllegalBriefTransitionError,
  type BriefState,
} from "../src/domain/brief-state";
import {
  CAMPAIGN_STATES, canTransitionCampaign, type CampaignState,
} from "../src/domain/campaign-state";
import {
  INVITE_STATES, OPEN_INVITE_STATES, canTransitionInvite, isOpenInvite, type InviteState,
} from "../src/domain/invite-state";

/* --------------------------------------------------------------------------
   The three B3 state machines — P4-BE-02, P4-BE-04, P4-BE-06, §21.

   Each table is asserted **exhaustively** over all ordered pairs, with the
   legal edges transcribed independently of the implementation. A happy-path
   test passes just as well against a machine that permits everything, which
   is the failure mode that matters for a state machine — and these three
   govern money, so a wrong edge is a campaign that can be cancelled after
   delivery or an athlete who accepted work they never saw.
   -------------------------------------------------------------------------- */

function exhaustive<S extends string>(
  states: readonly S[],
  legal: ReadonlyArray<[S, S]>,
  can: (from: S, to: S) => boolean,
) {
  const allowed = new Set(legal.map(([f, t]) => `${f}->${t}`));
  for (const from of states) {
    for (const to of states) {
      const expected = allowed.has(`${from}->${to}`);
      expect(can(from, to), `${from} -> ${to} should be ${expected}`).toBe(expected);
    }
  }
}

describe("brief · §21", () => {
  const LEGAL: ReadonlyArray<[BriefState, BriefState]> = [
    ["DRAFT", "QUALIFIED"], ["DRAFT", "CLOSED"],
    ["QUALIFIED", "APPROVED"], ["QUALIFIED", "CLOSED"],
    ["APPROVED", "CAMPAIGN_CREATED"], ["APPROVED", "CLOSED"],
  ];

  it("permits exactly these edges and no others", () => {
    exhaustive(BRIEF_STATES, LEGAL, canTransitionBrief);
  });

  it("can be closed from every stage before a campaign exists", () => {
    /* "They went quiet" and "they said no" both end here, and neither is a
       qualification. Forcing a brief forward to close it would put an
       assessment on the record that nobody performed. */
    for (const from of ["DRAFT", "QUALIFIED", "APPROVED"] as BriefState[]) {
      expect(canTransitionBrief(from, "CLOSED")).toBe(true);
    }
  });

  it("treats CAMPAIGN_CREATED as terminal", () => {
    /* Once a Campaign exists the brief is the record of what was asked for.
       Reopening it would give two rows an opinion about the same work. */
    expect(legalBriefTransitions("CAMPAIGN_CREATED")).toEqual([]);
  });

  it("names the legal moves when it refuses", () => {
    const error = new IllegalBriefTransitionError("CLOSED", "APPROVED");
    expect(error.message).toContain("terminal");
    expect(error.status).toBe(409);
  });
});

describe("campaign · §21", () => {
  const LEGAL: ReadonlyArray<[CampaignState, CampaignState]> = [
    ["DRAFT", "STAFFING"], ["DRAFT", "CANCELLED"],
    ["STAFFING", "APPROVAL"], ["STAFFING", "DRAFT"], ["STAFFING", "CANCELLED"],
    ["APPROVAL", "ACTIVE"], ["APPROVAL", "STAFFING"], ["APPROVAL", "CANCELLED"],
    ["ACTIVE", "REPORTING"], ["ACTIVE", "CANCELLED"],
    ["REPORTING", "COMPLETED"],
  ];

  it("permits exactly these edges and no others", () => {
    exhaustive(CAMPAIGN_STATES, LEGAL, canTransitionCampaign);
  });

  it("cannot be cancelled once it is being reported on", () => {
    /* The athletes did the work and the sponsor owes for it. Cancelling here
       would be a billing decision dressed as a state change. */
    expect(canTransitionCampaign("REPORTING", "CANCELLED")).toBe(false);
    expect(canTransitionCampaign("COMPLETED", "CANCELLED")).toBe(false);
  });

  it("can go back to DRAFT from staffing", () => {
    /* Matching can reveal the brief itself is wrong — no athlete in the state
       covers the sport — and the answer is to rework, not to cancel. */
    expect(canTransitionCampaign("STAFFING", "DRAFT")).toBe(true);
  });

  it("never reopens a terminal state", () => {
    for (const to of CAMPAIGN_STATES) {
      expect(canTransitionCampaign("COMPLETED", to)).toBe(false);
      expect(canTransitionCampaign("CANCELLED", to)).toBe(false);
    }
  });
});

describe("invitation · §21", () => {
  const LEGAL: ReadonlyArray<[InviteState, InviteState]> = [
    ["INVITED", "VIEWED"], ["INVITED", "DECLINED"], ["INVITED", "EXPIRED"],
    ["VIEWED", "ACCEPTED"], ["VIEWED", "DECLINED"], ["VIEWED", "EXPIRED"],
  ];

  it("permits exactly these edges and no others", () => {
    exhaustive(INVITE_STATES, LEGAL, canTransitionInvite);
  });

  it("cannot be accepted without being seen", () => {
    /* The accept path runs through the screen that shows the terms. "They
       accepted without ever seeing it" must not be representable. */
    expect(canTransitionInvite("INVITED", "ACCEPTED")).toBe(false);
    expect(canTransitionInvite("VIEWED", "ACCEPTED")).toBe(true);
  });

  it("can be declined without being opened", () => {
    /* A decline can be a link in an email — the asymmetry is deliberate. */
    expect(canTransitionInvite("INVITED", "DECLINED")).toBe(true);
  });

  it("expires from either open state and nowhere else", () => {
    expect(canTransitionInvite("INVITED", "EXPIRED")).toBe(true);
    expect(canTransitionInvite("VIEWED", "EXPIRED")).toBe(true);
    expect(canTransitionInvite("ACCEPTED", "EXPIRED")).toBe(false);
    expect(canTransitionInvite("DECLINED", "EXPIRED")).toBe(false);
  });

  it("marks exactly the states the partial unique index covers as open", () => {
    /* prisma/sql/invite_one_open.sql indexes INVITED and VIEWED. If this list
       and that index ever disagree, either two live offers become possible or
       a re-invitation after an expiry is wrongly refused. */
    expect([...OPEN_INVITE_STATES]).toEqual(["INVITED", "VIEWED"]);
    expect(INVITE_STATES.filter(isOpenInvite)).toEqual(["INVITED", "VIEWED"]);
  });

  it("lets an expired or declined athlete be invited again", () => {
    /* An expiry is a normal terminal state, not a permanent bar — which is
       why the index is partial rather than full. */
    expect(isOpenInvite("EXPIRED")).toBe(false);
    expect(isOpenInvite("DECLINED")).toBe(false);
  });
});
