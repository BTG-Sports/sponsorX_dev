import { describe, expect, it } from "vitest";

import { REQUEST_STEPS, requestStepNow, requestStepsClosedWord } from "@/lib/brief-status";

/* POL-FE-21 — the Requests page's progress steps follow the request's real
   state (the brief's, then its campaign's), and never say a step happened
   before the API's state does. `now` is the current step; the ones before
   it are done; REQUEST_STEPS.length means every step is done. */

describe("request steps", () => {
  it("names only things that actually happen — no price, no live before its time", () => {
    expect(REQUEST_STEPS).toEqual(["Sent", "BTG review", "Athletes signed", "Campaign live"]);
    expect(REQUEST_STEPS.join(" ")).not.toMatch(/price/i);
  });

  it("a request BTG is reviewing: Sent done, BTG review current", () => {
    expect(requestStepNow("DRAFT")).toBe(1);
    expect(requestStepNow("QUALIFIED")).toBe(1);
  });

  it("approved and being staffed: review done, athletes being signed", () => {
    expect(requestStepNow("APPROVED")).toBe(2);
    expect(requestStepNow("CAMPAIGN_CREATED", "DRAFT")).toBe(2);
    expect(requestStepNow("CAMPAIGN_CREATED", "STAFFING")).toBe(2);
    /* An older API that sends no campaign state can't claim more than that. */
    expect(requestStepNow("CAMPAIGN_CREATED")).toBe(2);
    expect(requestStepNow("CAMPAIGN_CREATED", null)).toBe(2);
  });

  it("fully staffed waits for its start date: athletes signed, Campaign live current — not done", () => {
    expect(requestStepNow("CAMPAIGN_CREATED", "APPROVAL")).toBe(3);
  });

  it("live, wrapping up or finished: every step done", () => {
    expect(requestStepNow("CAMPAIGN_CREATED", "ACTIVE")).toBe(4);
    expect(requestStepNow("CAMPAIGN_CREATED", "REPORTING")).toBe(4);
    expect(requestStepNow("CAMPAIGN_CREATED", "COMPLETED")).toBe(4);
    expect(REQUEST_STEPS).toHaveLength(4);
  });

  it("closed or cancelled lights nothing, and says which", () => {
    expect(requestStepNow("CLOSED")).toBe(-1);
    expect(requestStepNow("CAMPAIGN_CREATED", "CANCELLED")).toBe(-1);
    expect(requestStepNow("SOMETHING_NEW")).toBe(-1);
    expect(requestStepsClosedWord("CLOSED")).toBe("Closed");
    expect(requestStepsClosedWord("CAMPAIGN_CREATED", "CANCELLED")).toBe("Campaign cancelled");
  });
});
