import { afterEach, describe, expect, it, vi } from "vitest";

import {
  START_AFTER_TODAY,
  briefToday,
  defaultStart,
  earliestStart,
  startDateProblem,
  targetingOptions,
  toBriefBody,
} from "@/lib/brief-request";
import { athletesWaitingText, targetWords, waitingOnAthletesLine } from "@/lib/brief-status";
import { toPkg } from "@/lib/marketplace-live";

/* --------------------------------------------------------------------------
   POL-FE-51 — a campaign request from a package can stall, and the sponsor
   wasn't told why.

   The sponsor-side half:
     - the drawer's Start date always shows a day after today (today + 14,
       the rule a blank start already followed), and refuses today or a past
       day in words before anything is sent;
     - Sport and Geography come from the live athlete pool, not fixtures;
     - a request waiting for athletes says so plainly, in the sponsor's own
       targeting words — never the hold's text;
     - packages carry "can BTG staff this?" as a yes / no, and NEXT ads are
       told apart from athlete packages.
   -------------------------------------------------------------------------- */

const vars = vi.hoisted(() => ({ actor: null as unknown, calls: [] as string[], body: {} as unknown, ok: true }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/api", () => ({
  fetchActor: async () => vars.actor,
  apiFetch: async (path: string) => {
    vars.calls.push(path);
    return Response.json(vars.body, { status: vars.ok ? 200 : 500 });
  },
}));

describe("the start date", () => {
  /* 9 pm in Maryland on Nov 15 is already Nov 16 in UTC. */
  const evening = new Date("2026-11-16T02:00:00Z");
  const noon = new Date("2026-11-15T17:00:00Z");

  it("today is the later of the viewer's day and UTC's, so tomorrow is never already past in UTC", () => {
    expect(briefToday(noon) >= "2026-11-15").toBe(true);
    expect(briefToday(evening)).toBe("2026-11-16");
    expect(earliestStart(evening)).toBe("2026-11-17");
  });

  it("opens on today + 14 — the same day a blank start is sent as", () => {
    expect(defaultStart(noon)).toBe("2026-11-29");
    const body = toBriefBody(
      { sponsorId: "s", objective: "Bring grand opening traffic to our new downtown store", budget: "1500", start: "", durationWeeks: 2, sport: "", geo: "", tier: "", category: "", message: "" },
      noon,
    );
    expect(body.startDate).toBe(defaultStart(noon));
    expect(defaultStart(noon) > earliestStart(noon)).toBe(true);
  });

  it("refuses today and any past day, in words; tomorrow and later are fine", () => {
    const today = briefToday(noon);
    expect(startDateProblem(today, noon)).toBe(START_AFTER_TODAY);
    expect(START_AFTER_TODAY).toBe("The start date must be after today");
    expect(startDateProblem("2026-11-01", noon)).toBe(START_AFTER_TODAY);
    expect(startDateProblem(earliestStart(noon), noon)).toBeNull();
    expect(startDateProblem(defaultStart(noon), noon)).toBeNull();
    /* Blank still means today + 14; a non-date is refused. */
    expect(startDateProblem("", noon)).toBeNull();
    expect(startDateProblem("2026-02-30", noon)).toMatch(/not a date/);
  });

  it("an evening sponsor's local tomorrow is refused when UTC is already there", () => {
    /* Local Nov 16 at 9 pm Nov 15 in Maryland would start at a UTC midnight already past. */
    expect(startDateProblem("2026-11-16", evening)).toBe(START_AFTER_TODAY);
  });
});

describe("live Sport and Geography options", () => {
  it("are the API's values — sports as spelled, US states by name, nothing else", () => {
    const o = targetingOptions({ sports: ["Basketball", "Lacrosse", "Basketball"], stateCodes: ["VA", "MD", "ZZ", "DC"] });
    expect(o.sports).toEqual([{ value: "Basketball", label: "Basketball" }, { value: "Lacrosse", label: "Lacrosse" }]);
    expect(o.geos).toEqual([
      { value: "DC", label: "District of Columbia" },
      { value: "MD", label: "Maryland" },
      { value: "VA", label: "Virginia" },
    ]);
  });

  it("an option's value becomes the brief's own targeting, unchanged", () => {
    const body = toBriefBody({ sponsorId: "s", objective: "A spring push for our lacrosse gear across Maryland", budget: "1500", start: "", durationWeeks: 2, sport: "Lacrosse", geo: "MD", tier: "", category: "", message: "" });
    expect(body.sports).toEqual(["Lacrosse"]);
    expect(body.stateCodes).toEqual(["MD"]);
  });

  it("an empty pool offers nothing but Any", () => {
    expect(targetingOptions({ sports: [], stateCodes: [] })).toEqual({ sports: [], geos: [] });
  });
});

describe("a request waiting for athletes", () => {
  it("names the sponsor's own targeting", () => {
    expect(targetWords(["Lacrosse"], ["MD"])).toBe("Lacrosse in Maryland");
    expect(targetWords([], ["DC", "MD", "VA"])).toBe("District of Columbia, Maryland and Virginia");
    expect(targetWords(["Soccer"], [])).toBe("Soccer");
    expect(targetWords([], [])).toBe("");
  });

  it("is said plainly, with what the sponsor can change", () => {
    expect(athletesWaitingText({ package: { name: "Local Blitz" }, sports: ["Lacrosse"], stateCodes: ["MD"] })).toBe(
      "We don't have enough athletes for this package in Lacrosse in Maryland yet. Try another package, sport or area, or BTG will be in touch.",
    );
    expect(athletesWaitingText({ package: null })).toBe(
      "We don't have enough athletes for this request yet. Try another package, sport or area, or BTG will be in touch.",
    );
  });

  it("only when the API says ATHLETES — BTG, null or an older API say nothing more", () => {
    const r = { package: { name: "Local Blitz" }, sports: ["Lacrosse"], stateCodes: ["MD"] };
    expect(waitingOnAthletesLine({ ...r, waitingOn: "ATHLETES" })).toMatch(/^We don't have enough athletes/);
    expect(waitingOnAthletesLine({ ...r, waitingOn: "BTG" })).toBeNull();
    expect(waitingOnAthletesLine({ ...r, waitingOn: null })).toBeNull();
    expect(waitingOnAthletesLine(r)).toBeNull();
  });
});

describe("packages carry kind and staffable", () => {
  const api = {
    id: "p1", name: "Local Blitz", priceLow: 1500, priceHigh: 2400, athleteCountMin: 5, athleteCountMax: 9,
    lineItems: [{ jobCode: "SX-02", quantityPerAthlete: 1 }], includes: [], exclusivity: false, durationWeeks: 2,
  };
  it("passes the API's yes / no and kind through", () => {
    expect(toPkg({ ...api, kind: "ATHLETE", staffable: false })).toMatchObject({ kind: "ATHLETE", staffable: false });
    expect(toPkg({ ...api, id: "n1", lineItems: [], kind: "NEXT_AD", staffable: null })).toMatchObject({ kind: "NEXT_AD", staffable: null });
  });
  it("an older API's package is an athlete package with no answer shown", () => {
    expect(toPkg(api)).toMatchObject({ kind: "ATHLETE", staffable: null });
  });
});

describe("checkStaffing — the drawer's live yes / no", async () => {
  const { checkStaffing } = await import("@/app/(app)/sponsor/marketplace/actions");
  afterEach(() => { vars.calls.length = 0; vars.ok = true; });

  it("asks for the sponsor's sport and states, and answers this package's yes / no", async () => {
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["SPONSOR_ADMIN"], sponsorId: "sp" } };
    vars.body = { packages: [{ id: "p1", staffable: false }, { id: "p2", staffable: true }] };
    expect(await checkStaffing({ packageId: "p2", sport: "Lacrosse", geo: "DMV" })).toBe(true);
    expect(vars.calls[0]).toBe("/catalogue/staffing?sport=Lacrosse&state=DC%2CMD%2CVA");
    expect(await checkStaffing({ packageId: "p1", sport: "", geo: "" })).toBe(false);
    expect(vars.calls[1]).toBe("/catalogue/staffing");
  });

  it("has no answer for a signed-out caller, an unknown package or a failed read", async () => {
    vars.actor = { status: "anonymous" };
    expect(await checkStaffing({ packageId: "p1", sport: "", geo: "" })).toBeNull();
    expect(vars.calls).toHaveLength(0);
    vars.actor = { status: "linked", actor: { userId: "u", tenantId: "t", roles: ["SPONSOR_ADMIN"], sponsorId: "sp" } };
    vars.body = { packages: [] };
    expect(await checkStaffing({ packageId: "p9", sport: "", geo: "" })).toBeNull();
    vars.ok = false;
    expect(await checkStaffing({ packageId: "p1", sport: "", geo: "" })).toBeNull();
  });
});
