import { describe, expect, it } from "vitest";

import { type ApiFactCheck, factCheckProblem, factCheckView, nightLabel } from "../src/lib/fact-check-live";

/* --------------------------------------------------------------------------
   3S1-FE-01 — the nightly figures check on the Integrations screen: never
   run, could not run, matching, and not matching with its differences.
   Shapes are the API's (backend/src/domain/fact-nightly.ts, FactCheckStatus).
   -------------------------------------------------------------------------- */

const base: ApiFactCheck = {
  lastRunAt: null, matches: null, failingSince: null, differences: [], differenceCount: 0, emails: false, lastError: null,
};
const RAN = "2026-10-13T19:04:11.000Z";

describe("factCheckView — the four states", () => {
  it("never run: no lastRunAt", () => {
    const v = factCheckView(base);
    expect(v).toEqual({ state: "never", emails: false });
    expect(factCheckProblem(v)).toBeNull();
  });

  it("could not run: it has a lastRunAt but matches is null — never shown as a mismatch", () => {
    const v = factCheckView({ ...base, lastRunAt: RAN, lastError: "connection terminated" });
    expect(v).toEqual({ state: "failed", lastRunAt: RAN, error: "connection terminated", emails: false });
    expect(factCheckProblem(v)).toBe("the nightly figures check could not run");
  });

  it("could not run without a recorded error still says so", () => {
    const v = factCheckView({ ...base, lastRunAt: RAN });
    expect(v.state === "failed" && v.error).toBe("no error recorded");
  });

  it("matching: nothing for the attention summary", () => {
    const v = factCheckView({ ...base, lastRunAt: RAN, matches: true, emails: true });
    expect(v).toEqual({ state: "matching", lastRunAt: RAN, emails: true });
    expect(factCheckProblem(v)).toBeNull();
  });

  it("not matching: since when, the differences in words, and how many more the API held back", () => {
    const v = factCheckView({
      ...base,
      lastRunAt: RAN,
      matches: false,
      failingSince: "2026-10-12",
      differences: [
        { campaign: "Fall tacos", measure: "booked_sell_cents", what: "Fall tacos — amount booked (sponsor price): the app says $200.00, the report figures say $0.00", app: 20000, facts: 0 },
      ],
      differenceCount: 23,
      emails: true,
    });
    expect(v).toEqual({
      state: "mismatch",
      lastRunAt: RAN,
      failingSince: "2026-10-12",
      differences: ["Fall tacos — amount booked (sponsor price): the app says $200.00, the report figures say $0.00"],
      more: 22,
      count: 23,
      emails: true,
    });
    expect(factCheckProblem(v)).toBe("report figures don't match the app (23 differences)");
  });

  it("one difference reads singular, and nothing is 'more'", () => {
    const v = factCheckView({
      ...base, lastRunAt: RAN, matches: false,
      differences: [{ campaign: null, measure: "views_verified_api", what: "Marketplace — views (verified, API): the app says 3, the report figures say 2", app: 3, facts: 2 }], differenceCount: 1,
    });
    expect(v.state === "mismatch" && v.more).toBe(0);
    expect(factCheckProblem(v)).toBe("report figures don't match the app (1 difference)");
  });
});

describe("nightLabel", () => {
  it("formats the failing night as a UTC date", () => {
    expect(nightLabel("2026-10-12")).toBe("Oct 12");
  });
  it("passes anything unparseable through", () => {
    expect(nightLabel("soon")).toBe("soon");
  });
});
