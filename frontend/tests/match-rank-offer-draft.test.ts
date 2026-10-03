import { describe, expect, it } from "vitest";

import { sortRoster, topReasons, type MatchAthlete } from "@/lib/matching";
import { asortOf, eligibleApiQuery, offerDraftHref, toMatchData, type ApiBrief, type ApiEligibleAthlete } from "@/lib/matching-live";
import { draftFields, draftSources, filledNote, offerBody, offerDraftQuery, type ApiOfferDraft } from "@/lib/admin-offers-live";

/* --------------------------------------------------------------------------
   P4-FE-08 — the matching desk's ranked shortlist and the pre-filled offer
   form, pure halves: the rank and reasons onto the Studio's rows, the chips,
   the "Draft offer" link, the sort the URL asks for, and the draft into the
   form's fields with a "Filled from …" note that holds only while true.
   -------------------------------------------------------------------------- */

const q = (s: string) => Object.fromEntries(new URLSearchParams(s.replace(/^\?/, "")));

const REASONS = [
  { key: "sport", text: "Plays basketball", points: 30 },
  { key: "state", text: "Based in Maryland", points: 20 },
  { key: "rate", text: "Rate for this job fits the budget", points: 20 },
  { key: "recent", text: "Accepted an offer in the last 60 days", points: 10 },
  { key: "work", text: "No verified deliverables on past campaigns yet", points: 0 },
];

const athlete = (id: string, name: string, extra: Partial<ApiEligibleAthlete> = {}): ApiEligibleAthlete => ({
  id, displayName: name, sport: "Basketball", stateCode: "MD", tier: "CREATOR",
  matched: { sport: true, geography: true }, rates: [{ jobId: "SX-02", amount: 8_000 }], ...extra,
});

const BRIEF: ApiBrief = {
  id: "brief_1", objective: "Weekday foot traffic", state: "CAMPAIGN_CREATED", budget: 60_000,
  startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-12-01T00:00:00.000Z", sports: ["Basketball"], stateCodes: ["MD"],
  categories: [], createdAt: "2026-09-30T00:00:00.000Z", sponsorName: "Harbor Coffee",
  package: { code: "BLITZ", name: "Blitz", lineItems: [], athleteCountMin: 2, athleteCountMax: 4 },
  campaign: { id: "camp_1", name: "Weekday traffic", state: "STAFFING" },
  jobs: [{ jobId: "SX-02", name: "Sponsored Post", quantity: 1, sellLow: 125, sellHigh: 250, sellFloors: { EMERGING: 140, CREATOR: 175, PREMIUM: 210 } }],
};

describe("the ranked shortlist on the desk", () => {
  it("carries the API's rank and reasons onto each row, in the API's order", () => {
    const data = toMatchData(BRIEF, [
      athlete("a1", "Avery", { matchScore: 80, reasons: REASONS }),
      athlete("a2", "Blake", { matchScore: 50, reasons: REASONS.slice(0, 2) }),
    ]);
    expect(data.roster.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(data.roster[0]!.match).toEqual({ score: 80, reasons: REASONS });
    /* A row from an API without the rank has none — never a zero. */
    expect(toMatchData(BRIEF, [athlete("a3", "Casey")]).roster[0]!.match).toBeNull();
  });

  it("chips the top three reasons that scored; the disclosure lists them all", () => {
    expect(topReasons(REASONS).map((r) => r.key)).toEqual(["sport", "state", "rate"]);
    expect(topReasons(REASONS, 10).map((r) => r.key)).toEqual(["sport", "state", "rate", "recent"]);
    expect(topReasons([{ key: "work", text: "None", points: 0 }])).toEqual([]);
  });

  it("links each row to the pre-filled offer form — for an offer writer, once the brief has a campaign", () => {
    const withOffers = toMatchData(BRIEF, [athlete("a1", "Avery")], { offers: true });
    expect(withOffers.roster[0]!.offerHref).toBe("/admin/offers/new?campaign=camp_1&athlete=a1&job=SX-02");
    expect(withOffers.roster[0]!.offerHref).toBe(offerDraftHref("camp_1", "a1", "SX-02"));
    expect(toMatchData(BRIEF, [athlete("a1", "Avery")]).roster[0]!.offerHref).toBeNull();
    expect(toMatchData({ ...BRIEF, campaign: null }, [athlete("a1", "Avery")], { offers: true }).roster[0]!.offerHref).toBeNull();
    expect(toMatchData({ ...BRIEF, jobs: [] }, [athlete("a1", "Avery")], { offers: true }).roster[0]!.offerHref).toBeNull();
  });

  it("asks the API for best match by default; score and name by name", () => {
    expect(asortOf({})).toBe("match");
    expect(asortOf({ asort: "score" })).toBe("score");
    expect(asortOf({ asort: "name" })).toBe("name");
    expect(asortOf({ asort: "margin" })).toBe("match");
    expect(q(eligibleApiQuery({}, 40))).toEqual({ page: "1", size: "12" });
    expect(q(eligibleApiQuery({ asort: "score" }, 40))).toMatchObject({ sort: "score" });
    expect(q(eligibleApiQuery({ asort: "name" }, 40))).toMatchObject({ sort: "name" });
  });

  it("sorts a roster in hand by match, the unranked last", () => {
    const row = (id: string, score: number | null) => ({ id, match: score === null ? null : { score, reasons: [] } }) as unknown as MatchAthlete;
    expect(sortRoster([row("b", 40), row("x", null), row("a", 90)], "match").map((a) => a.id)).toEqual(["a", "b", "x"]);
  });
});

const DRAFT: ApiOfferDraft = {
  campaignId: "camp_1",
  athlete: { id: "a1", name: "Avery Long", minor: false, guardianAnswers: false, age: null, guardianName: null },
  job: { id: "SX-02", name: "Sponsored Post" },
  offer: {
    campaignId: "camp_1", athleteId: "a1", jobId: "SX-02", inventoryItemId: null, brief: "Weekday foot traffic",
    compensation: 8_000, sellPrice: 21_000,
    deliverables: [{ title: "Story", dueDate: "2026-11-24T23:59:59.000Z" }, { title: "Post", dueDate: "2026-12-01T23:59:59.000Z" }],
    usageRights: "Organic posts on the sponsor's own social channels.", exclusivityDays: 42, disclosures: ["#ad", "21+"],
    expiresAt: "2026-10-10T23:59:59.000Z",
  },
  sources: {
    brief: "From the sponsor's brief", compensation: "From Avery's rate card for Sponsored Post",
    sellPrice: "The Premium sell floor for Sponsored Post ($210)", deliverables: "From the Sponsored Post template, the last due on the campaign's end date",
    usageRights: "BTG's standard usage terms over the Blitz package's 6-week term", exclusivityDays: "The Blitz package is exclusive for its 6 weeks",
    disclosures: "\"#ad\" on every paid post, and 21+ for the alcohol category", expiresAt: "Offers expire 7 days after they are drafted, as invitations do",
  },
};

describe("the pre-filled offer form", () => {
  it("opens on the draft's every field, as the form holds them", () => {
    expect(draftFields(DRAFT)).toEqual({
      campaignId: "camp_1", athleteId: "a1", jobId: "SX-02", inventoryItemId: "", brief: "Weekday foot traffic",
      pay: "80.00", sell: "210.00",
      deliverables: [{ title: "Story", due: "2026-11-24" }, { title: "Post", due: "2026-12-01" }],
      usageRights: "Organic posts on the sponsor's own social channels.", exclusivityDays: "42", expires: "2026-10-10", disclosures: ["#ad", "21+"],
    });
  });

  it("saves unchanged as the draft the API filled in", () => {
    const b = offerBody(draftFields(DRAFT));
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.body).toEqual(DRAFT.offer);
  });

  it("says where each field came from, in plain words", () => {
    const f = draftFields(DRAFT);
    const s = draftSources(DRAFT);
    expect(filledNote(s, f, f, "pay")).toBe("Filled from Avery's rate card for Sponsored Post.");
    expect(filledNote(s, f, f, "sell")).toBe("Filled in: the Premium sell floor for Sponsored Post ($210).");
    expect(filledNote(s, f, f, "usageRights")).toBe("Filled in: BTG's standard usage terms over the Blitz package's 6-week term.");
    expect(filledNote(s, f, f, "expires")).toBe("Filled in: offers expire 7 days after they are drafted, as invitations do.");
    for (const k of ["brief", "deliverables", "exclusivityDays", "disclosures"] as const) expect(filledNote(s, f, f, k)).toBeTruthy();
  });

  it("drops a field's note once BTG changes it — or changes whose offer it is", () => {
    const f = draftFields(DRAFT);
    const s = draftSources(DRAFT);
    expect(filledNote(s, f, { ...f, pay: "90.00" }, "pay")).toBeNull();
    expect(filledNote(s, f, { ...f, pay: "90.00" }, "sell")).not.toBeNull();
    expect(filledNote(s, f, { ...f, disclosures: ["#ad"] }, "disclosures")).toBeNull();
    expect(filledNote(s, f, { ...f, athleteId: "a2" }, "sell")).toBeNull();
    expect(filledNote(s, f, { ...f, jobId: "SX-01" }, "deliverables")).toBeNull();
    /* No sources (a blank form): no notes. */
    expect(filledNote(undefined, f, f, "pay")).toBeNull();
  });

  it("asks GET /campaigns/:id/offer-draft for the athlete and the job", () => {
    expect(offerDraftQuery("a1", "SX-02")).toBe("athleteId=a1&jobId=SX-02");
  });
});
