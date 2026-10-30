import { describe, expect, it } from "vitest";

import {
  EXAMPLE_ORDER, keepPct, parseInviteShare, sentState, shareChangeView, sharePct, shareWords, splitExample, teamRefusal, usd, type ApiShareChange,
} from "@/lib/team-invite-live";

/* 2S2-FE-05 — the Team page's words, and the team's invite form (2S2-BE-05). */

/* POL-FE-03 — the team's request to change its share, in the athlete's words (POL-BE-03). */
const RAISE: ApiShareChange = { id: "sc_1", fromBps: 1000, toBps: 2500, askedAt: "2026-10-29T10:00:00.000Z" };
const TO_STANDARD: ApiShareChange = { id: "sc_2", fromBps: 1000, toBps: null, askedAt: "2026-10-29T10:00:00.000Z" };
const FIRST: ApiShareChange = { id: "sc_3", fromBps: null, toBps: 1500, askedAt: "2026-10-29T10:00:00.000Z" };

describe("a share change request (POL-FE-03)", () => {
  it("names a null share as BTG's standard share", () => {
    expect(shareWords(null)).toBe("BTG's standard share");
    expect(shareWords(2500)).toBe("25%");
  });
  it("shows an adult the change from → to with Accept and Decline", () => {
    const v = shareChangeView(RAISE, "Hawks", { minor: false });
    expect(v).toMatchObject({ id: "sc_1", from: "10%", to: "25%", keep: "75%", canAnswer: true, cannotLine: null, acceptLabel: "Accept", askedOn: "Oct 29" });
    expect(v.keepShare).toBeCloseTo(0.75);
    expect(v.headline).toBe("The Hawks ask to change their share of your earnings from 10% to 25%.");
    expect(v.effect).toContain("Nothing changes until you accept");
    expect(v.acceptTitle).toBe("Accept 25% for the Hawks?");
    expect(v.acceptLine).toContain("Orders already placed keep their split");
  });
  it("says what 'back to BTG's standard share' and a first share mean", () => {
    const std = shareChangeView(TO_STANDARD, "Hawks", { minor: false });
    expect(std).toMatchObject({ from: "10%", to: "BTG's standard share", keep: null, keepShare: null });
    expect(std.effect).toContain("BTG's standard share");
    const first = shareChangeView(FIRST, "Hawks", { minor: false });
    expect(first).toMatchObject({ from: "BTG's standard share", to: "15%", keep: "85%" });
  });
  it("lets a minor see it but not accept: their guardian does", () => {
    const v = shareChangeView(RAISE, "Hawks", { minor: true });
    expect(v.canAnswer).toBe(false);
    expect(v.cannotLine).toContain("Your guardian accepts this");
    expect(v.headline).toContain("your earnings");
  });
  it("lets a guardian acting for the ward answer for them, by name", () => {
    const v = shareChangeView(RAISE, "Hawks", { minor: false, ward: "Jordan" });
    expect(v.canAnswer).toBe(true);
    expect(v.acceptLabel).toBe("Accept for Jordan");
    expect(v.headline).toBe("The Hawks ask to change their share of Jordan's earnings from 10% to 25%.");
    expect(v.effect).toContain("until you accept for them");
    expect(v.acceptLine).toContain("Jordan's sales");
  });
  it("holds Accept during the coming-of-age pause", () => {
    const v = shareChangeView(RAISE, "Hawks", { minor: false, paused: true });
    expect(v.canAnswer).toBe(false);
    expect(v.cannotLine).toContain("coming-of-age pause");
  });
  it("lets a coded 403 (guardian_must_act) through with the API's own sentence; a bare 403 is 'not yours'", () => {
    expect(teamRefusal(403, { error: { code: "guardian_must_act", message: "Your guardian does this for your account." } }, "x")).toBe("Your guardian does this for your account.");
    expect(teamRefusal(403, { error: { code: "forbidden", message: "Forbidden" } }, "x")).toBe("That isn't yours to change.");
    expect(teamRefusal(403, null, "x")).toBe("That isn't yours to change.");
  });
});

describe("the team's share", () => {
  it("reads in percent", () => {
    expect(sharePct(2000)).toBe("20%");
    expect(keepPct(2000)).toBe("80%");
    expect(sharePct(1250)).toBe("12.5%");
  });
  it("reproduces the design's worked example: $604.24 / $151.05 / $244.71, adding up to the order", () => {
    const s = splitExample(EXAMPLE_ORDER.orderCents, EXAMPLE_ORDER.feesCents, 2000);
    expect([usd(s.athleteCents), usd(s.teamCents), usd(s.feesCents)]).toEqual(["$604.24", "$151.05", "$244.71"]);
    expect(s.athleteCents + s.teamCents + s.feesCents).toBe(s.orderCents);
  });
});

describe("the team's invite form", () => {
  it("takes a percentage and sends basis points", () => {
    expect(parseInviteShare("20")).toEqual({ ok: true, bps: 2000 });
    expect(parseInviteShare("12.5%")).toEqual({ ok: true, bps: 1250 });
    expect(parseInviteShare("")).toMatchObject({ ok: false });
    expect(parseInviteShare("120")).toMatchObject({ ok: false });
  });
  it("names each invitation's state in words", () => {
    expect(sentState("PENDING").label).toBe("Waiting for an answer");
    expect(sentState("ACCEPTED").label).toBe("Joined");
  });
  it("turns a refusal into the API's sentence", () => {
    expect(teamRefusal(409, { error: { message: "JORDAN.REED is on another team." } }, "x")).toBe("JORDAN.REED is on another team.");
    expect(teamRefusal(500, null, "Not sent")).toBe("Not sent (HTTP 500).");
  });
});
