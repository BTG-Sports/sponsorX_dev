import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   P4-BE-08 — the shortlist's rank, pure: each signal, the empty-preference
   rule, the caps, the tie-break, and what a caller who may not read a
   signal gets (nothing — no points, no reason). Plus the offer draft's two
   pure pieces: the tier's sell price and the deliverable schedule.
   -------------------------------------------------------------------------- */

process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const { MATCH_WEIGHTS, RECENT_DAYS, WORK_POINTS_PER_VERIFIED, byMatch, packageLines, scoreAthlete } =
  await import("../src/domain/match-score");
const { draftDeliverables, tierSellPrice, DELIVERABLE_LEAD_DAYS } = await import("../src/domain/offer-draft");

const NOW = new Date("2026-10-03T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 864e5);
/** A Maryland basketball brief: one $100 job per athlete, $600 across four athletes ($150 each). */
const BRIEF = { sports: ["Basketball"], stateCodes: ["MD"], budget: 60_000, lines: [{ jobId: "SX-02", quantity: 1 }], slots: 4 };
const points = (r: ReturnType<typeof scoreAthlete>, key: string) => r.reasons.find((x) => x.key === key)?.points;
const text = (r: ReturnType<typeof scoreAthlete>, key: string) => r.reasons.find((x) => x.key === key)?.text;

describe("scoreAthlete — each signal", () => {
  it("weighs 100 in all, in one named constant", () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((n, w) => n + w, 0)).toBe(100);
    expect(MATCH_WEIGHTS).toEqual({ sport: 30, state: 20, work: 20, rate: 20, recent: 10 });
  });

  it("scores a perfect athlete 100, with every reason in words", () => {
    const r = scoreAthlete(
      { sport: "Basketball", stateCode: "MD", verifiedDeliverables: 5, rates: [{ jobId: "SX-02", amount: 10_000 }], lastAcceptedAt: daysAgo(10) },
      BRIEF, NOW,
    );
    expect(r.score).toBe(100);
    expect(r.reasons).toEqual([
      { key: "sport", text: "Plays basketball", points: 30 },
      { key: "state", text: "Based in Maryland", points: 20 },
      { key: "work", text: "5 deliverables verified on past campaigns", points: 20 },
      { key: "rate", text: "Rate for this job fits the budget", points: 20 },
      { key: "recent", text: "Accepted an offer in the last 60 days", points: 10 },
    ]);
  });

  it("sport and state score only on a match", () => {
    const r = scoreAthlete({ sport: "Soccer", stateCode: "VA" }, BRIEF, NOW);
    expect(points(r, "sport")).toBe(0);
    expect(points(r, "state")).toBe(0);
    expect(text(r, "state")).toBe("Based in Virginia, outside the brief's states");
    expect(text(scoreAthlete({ sport: "Soccer", stateCode: null }, BRIEF, NOW), "state")).toBe("No home state on file");
  });

  it("an empty sport or state list is no preference — full points, never none", () => {
    const r = scoreAthlete({ sport: "Soccer", stateCode: null }, { ...BRIEF, sports: [], stateCodes: [] }, NOW);
    expect(points(r, "sport")).toBe(MATCH_WEIGHTS.sport);
    expect(points(r, "state")).toBe(MATCH_WEIGHTS.state);
    expect(text(r, "sport")).toBe("The brief names no sport");
    /* Blank entries are not a preference either. */
    expect(points(scoreAthlete({ sport: "Soccer", stateCode: "VA" }, { ...BRIEF, sports: [""], stateCodes: [""] }, NOW), "sport")).toBe(30);
  });

  it("completed work: 4 points per verified deliverable, capped at 20", () => {
    expect(WORK_POINTS_PER_VERIFIED).toBe(4);
    const at = (n: number) => scoreAthlete({ sport: "Basketball", stateCode: "MD", verifiedDeliverables: n }, BRIEF, NOW);
    expect(points(at(0), "work")).toBe(0);
    expect(text(at(0), "work")).toBe("No verified deliverables on past campaigns yet");
    expect(points(at(1), "work")).toBe(4);
    expect(text(at(1), "work")).toBe("1 deliverable verified on past campaigns");
    expect(points(at(4), "work")).toBe(16);
    expect(points(at(5), "work")).toBe(20);
    expect(points(at(40), "work")).toBe(20);
  });

  it("rate fit: the rate at the 1.4× floor against the athlete's share of the budget, linear to nothing at 2×", () => {
    const at = (amount: number) => scoreAthlete({ sport: "Basketball", stateCode: "MD", rates: [{ jobId: "SX-02", amount }] }, BRIEF, NOW);
    /* $150 share: a $107 rate needs $149.80 — fits. */
    expect(points(at(10_700), "rate")).toBe(20);
    /* $140 needs $196: 1.3067× the share → 20 × 0.6933 = 13.9 → 14. */
    expect(points(at(14_000), "rate")).toBe(14);
    expect(text(at(14_000), "rate")).toBe("Rate is 31% over this athlete's share of the budget");
    /* $215 needs $301: over 2× — none. */
    expect(points(at(21_500), "rate")).toBe(0);
    expect(text(at(21_500), "rate")).toBe("Rate needs at least 2× this athlete's share of the budget");
  });

  it("rate fit: a package job with no rate on file scores nothing, and says which", () => {
    const r = scoreAthlete({ sport: "Basketball", stateCode: "MD", rates: [{ jobId: "SX-01", amount: 100 }] }, BRIEF, NOW);
    expect(points(r, "rate")).toBe(0);
    expect(text(r, "rate")).toBe("No rate on file for SX-02");
  });

  it("rate fit: a multi-line package sums rate × quantity", () => {
    const brief = { ...BRIEF, lines: [{ jobId: "SX-01", quantity: 2 }, { jobId: "SX-02", quantity: 1 }] };
    const rates = [{ jobId: "SX-01", amount: 3_000 }, { jobId: "SX-02", amount: 4_000 }];
    /* 2 × $30 + $40 = $100 → $140 ≤ $150. */
    const r = scoreAthlete({ sport: "Basketball", stateCode: "MD", rates }, brief, NOW);
    expect(points(r, "rate")).toBe(20);
    expect(text(r, "rate")).toBe("Rates for this package's jobs fit the budget");
  });

  it("rate fit without a package: the cheapest rate against the whole budget", () => {
    const brief = { ...BRIEF, lines: [], slots: 1, budget: 10_000 };
    const r = scoreAthlete({ sport: "Basketball", stateCode: "MD", rates: [{ jobId: "SX-07", amount: 90_000 }, { jobId: "SX-01", amount: 5_000 }] }, brief, NOW);
    expect(points(r, "rate")).toBe(20);
    expect(text(r, "rate")).toBe("Cheapest rate on file fits the budget");
    expect(text(scoreAthlete({ sport: "Basketball", stateCode: "MD", rates: [] }, brief, NOW), "rate")).toBe("No rate on file");
    expect(points(scoreAthlete({ sport: "Basketball", stateCode: "MD", rates: [{ jobId: "SX-01", amount: 1 }] }, { ...brief, budget: 0 }, NOW), "rate")).toBe(0);
  });

  it("recent activity: full inside 60 days, half inside 6 months, none after or never", () => {
    const at = (d: Date | null) => scoreAthlete({ sport: "Basketball", stateCode: "MD", lastAcceptedAt: d }, BRIEF, NOW);
    expect(points(at(daysAgo(RECENT_DAYS)), "recent")).toBe(10);
    expect(points(at(daysAgo(61)), "recent")).toBe(5);
    expect(text(at(daysAgo(61)), "recent")).toBe("Accepted an offer in the last 6 months");
    expect(points(at(daysAgo(181)), "recent")).toBe(0);
    expect(text(at(null), "recent")).toBe("Has not accepted an offer yet");
  });

  it("a signal the caller may not read is absent — no reason and no points, not a zero", () => {
    const r = scoreAthlete({ sport: "Basketball", stateCode: "MD" }, BRIEF, NOW);
    expect(r.reasons.map((x) => x.key)).toEqual(["sport", "state"]);
    expect(r.score).toBe(50);
  });

  it("lists the strongest reasons first, ties in signal order", () => {
    const r = scoreAthlete(
      { sport: "Basketball", stateCode: "VA", verifiedDeliverables: 0, rates: [{ jobId: "SX-02", amount: 1 }], lastAcceptedAt: daysAgo(5) },
      BRIEF, NOW,
    );
    expect(r.reasons.map((x) => `${x.key}:${x.points}`)).toEqual(["sport:30", "rate:20", "recent:10", "state:0", "work:0"]);
  });
});

describe("byMatch — the shortlist's order", () => {
  it("score high to low, then name, then id — a total order, the same every time", () => {
    const rows = [
      { id: "c", displayName: "Casey", score: 50 },
      { id: "b2", displayName: "Blake", score: 77 },
      { id: "d", displayName: "Drew", score: 50 },
      { id: "a", displayName: "Avery", score: 100 },
      { id: "b1", displayName: "Blake", score: 77 },
    ];
    expect([...rows].sort(byMatch).map((r) => r.id)).toEqual(["a", "b1", "b2", "c", "d"]);
    expect([...rows].reverse().sort(byMatch).map((r) => r.id)).toEqual(["a", "b1", "b2", "c", "d"]);
  });
});

describe("packageLines", () => {
  it("reads job × quantity, defaulting a missing or bad quantity to 1 and dropping junk", () => {
    expect(packageLines([{ jobCode: "SX-02", quantityPerAthlete: 2 }, { jobCode: "SX-01" }, { jobCode: "SX-03", quantityPerAthlete: 0 }, { nope: 1 }, null])).toEqual([
      { jobId: "SX-02", quantity: 2 }, { jobId: "SX-01", quantity: 1 }, { jobId: "SX-03", quantity: 1 },
    ]);
    expect(packageLines(null)).toEqual([]);
  });
});

describe("the offer draft's pure pieces", () => {
  /* SX-02 in whole dollars, as the catalogue stores it. */
  const POST = { id: "SX-02", name: "Sponsored Post", baseLow: 50, baseHigh: 100, sellLow: 125, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210 };

  it("prices the tier at its sell floor, in cents; Anchor at the top floor, untiered at the bottom", () => {
    expect(tierSellPrice(POST, "CREATOR")).toEqual({ cents: 17_500, why: "The Creator sell floor for Sponsored Post ($175)" });
    expect(tierSellPrice(POST, "ANCHOR").cents).toBe(21_000);
    expect(tierSellPrice(POST, null)).toEqual({ cents: 14_000, why: "Untiered, so the Emerging sell floor for Sponsored Post ($140)" });
  });

  it("never prices below the bottom of the sell range", () => {
    expect(tierSellPrice({ ...POST, sellLow: 150 }, "EMERGING")).toEqual({
      cents: 15_000, why: "The bottom of Sponsored Post's sell range ($150) — above the Emerging sell floor for it",
    });
  });

  it("schedules the job's template to the campaign's end", () => {
    const end = new Date("2026-12-31T00:00:00Z");
    const d = draftDeliverables({ id: "SX-04", name: "Product Experience" }, end, new Date("2026-10-10T23:59:59.000Z"));
    expect(d.items).toEqual([
      { title: "Product unboxing story", dueDate: new Date("2026-12-24T23:59:59.000Z") },
      { title: "Product experience post", dueDate: new Date("2026-12-31T23:59:59.000Z") },
    ]);
    expect(d.why).toBe("From the Product Experience template, the last due on the campaign's end date");
  });

  it("moves the schedule out when the campaign ends too soon, so the first is due a week after the offer expires", () => {
    const expires = new Date("2026-10-10T23:59:59.000Z");
    const d = draftDeliverables({ id: "SX-04", name: "Product Experience" }, new Date("2026-10-12T00:00:00Z"), expires);
    expect(d.items[0]!.dueDate.getTime()).toBe(expires.getTime() + DELIVERABLE_LEAD_DAYS * 864e5);
    expect(d.why).toMatch(/after the campaign's end/);
  });

  it("a job with no template owes one deliverable named after it", () => {
    const d = draftDeliverables({ id: "custom", name: "Clinic" }, new Date("2026-12-31T00:00:00Z"), new Date("2026-10-10T00:00:00Z"));
    expect(d.items).toEqual([{ title: "Clinic", dueDate: new Date("2026-12-31T23:59:59.000Z") }]);
  });
});
