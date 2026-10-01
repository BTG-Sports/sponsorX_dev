import { describe, expect, it } from "vitest";

import { EXAMPLE_ORDER, keepPct, parseInviteShare, sentState, sharePct, splitExample, teamRefusal, usd } from "@/lib/team-invite-live";

/* 2S2-FE-05 — the Team page's words, and the team's invite form (2S2-BE-05). */

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
