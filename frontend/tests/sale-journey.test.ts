import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock("@/app/(app)/seller-sales-actions", () => ({
  markDeliveredAction: async () => ({ ok: true }),
  requestProofUploadAction: async () => ({ ok: false, message: "no" }),
  answerProblemAction: async () => ({ ok: true }),
  answerCancellationAction: async () => ({ ok: true }),
  sellerCancelAction: async () => ({ ok: true }),
}));

import { AthleteSale } from "../src/components/sale-wizard/sale-page";
import {
  SAMPLE_STATES, cancelAsked, checkLeft, cheerFor, leftWords, saleJourney, sampleSale, sampleState, stopIndex, turnOf,
} from "../src/lib/sale-journey";

/* --------------------------------------------------------------------------
   POL-FE-96 — one sale as four steps: where each state lands, whose move
   it is, the 24-hour clock, the cheer when it moves on, and the page as it
   first renders.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-11-16T12:00:00Z");
const sale = (as: (typeof SAMPLE_STATES)[number]) => sampleSale(as, NOW);

describe("where the sale is", () => {
  it("lands each state on its step", () => {
    expect(stopIndex(sale("unpaid"))).toBe(0);
    expect(stopIndex(sale("deliver"))).toBe(1);
    expect(stopIndex(sale("checking"))).toBe(2);
    expect(stopIndex(sale("problem"))).toBe(2);
    expect(stopIndex(sale("confirmed"))).toBe(3);
  });

  it("stops an ended sale where it got to", () => {
    expect(stopIndex(sale("refunded"))).toBe(2); // marked delivered, then refunded
    expect(stopIndex(sale("cancelled"))).toBe(1); // paid, then cancelled
    expect(stopIndex({ state: "CANCELLED", paidAt: null, markedAt: null })).toBe(0);
  });

  it("marks the steps done / now / later", () => {
    expect(saleJourney(sale("deliver"), NOW).stops.map((s) => s.status)).toEqual(["done", "now", "later", "later"]);
    expect(saleJourney(sale("confirmed"), NOW).stops.map((s) => s.status)).toEqual(["done", "done", "done", "done"]);
    expect(saleJourney(sale("confirmed"), NOW).complete).toBe(true);
  });

  it("after a sale ends, the steps it never reached won't happen", () => {
    const j = saleJourney(sale("cancelled"), NOW);
    expect(j.ended).toBe(true);
    expect(j.stops.map((s) => s.status)).toEqual(["done", "stopped", "off", "off"]);
    expect(j.stops[2]!.note).toBe("");
  });

  it("says the dates on the rail", () => {
    const j = saleJourney(sale("deliver"), NOW);
    expect(j.stops[0]!.note).toBe("Paid Nov 14");
    expect(j.stops[1]!.note).toBe("On Nov 18 and Nov 25");
    expect(j.stops.map((s) => s.title)).toEqual(["Northside Fitness pays", "You deliver it", "Northside Fitness checks it", "You get paid"]);
  });
});

describe("whose move it is", () => {
  it("is the athlete's to deliver, the sponsor's to pay and to check", () => {
    expect(turnOf(sale("deliver"), NOW)).toMatchObject({ who: "you", label: "Your move", tone: "go" });
    expect(turnOf(sale("unpaid"), NOW)).toMatchObject({ who: "sponsor", label: "Waiting on Northside Fitness" });
    expect(turnOf(sale("checking"), NOW).text).toMatch(/No answer in 24 hours counts as confirmed/);
    expect(turnOf(sale("confirmed"), NOW)).toMatchObject({ who: "nobody", tone: "win" });
  });

  it("puts a request to cancel first", () => {
    expect(cancelAsked(sale("cancel-ask"))).toBe(true);
    expect(turnOf(sale("cancel-ask"), NOW).text).toMatch(/asked to cancel/);
    expect(cancelAsked(sale("deliver"))).toBe(false);
  });

  it("knows a problem is the athlete's to answer, then the sponsor's", () => {
    expect(turnOf(sale("problem"), NOW)).toMatchObject({ who: "you" });
    expect(turnOf(sale("answered"), NOW)).toMatchObject({ who: "sponsor" });
  });

  it("says when the date has passed", () => {
    const late = { ...sale("deliver"), overdue: true };
    expect(turnOf(late, NOW).text).toMatch(/date has passed/);
  });
});

describe("the sponsor's 24 hours", () => {
  it("drains from full to empty", () => {
    const o = { markedAt: "2026-11-16T00:00:00Z", confirmDueAt: "2026-11-17T00:00:00Z" };
    expect(checkLeft(o, Date.parse("2026-11-16T00:00:00Z"))).toBe(1);
    expect(checkLeft(o, Date.parse("2026-11-16T12:00:00Z"))).toBe(0.5);
    expect(checkLeft(o, Date.parse("2026-11-18T00:00:00Z"))).toBe(0);
  });

  it("falls back to marked + 24 hours when the API has no deadline", () => {
    expect(checkLeft({ markedAt: "2026-11-16T00:00:00Z", confirmDueAt: null }, Date.parse("2026-11-16T18:00:00Z"))).toBe(0.25);
  });

  it("prints hours and minutes", () => {
    expect(leftWords("2026-11-17T01:20:00Z", NOW.getTime())).toBe("13 h 20 m");
    expect(leftWords("2026-11-16T12:45:00Z", NOW.getTime())).toBe("45 m");
    expect(leftWords("2026-11-16T11:00:00Z", NOW.getTime())).toBe("0 m");
  });
});

describe("the cheer when it moves on", () => {
  it("cheers delivered and confirmed, never going back or ending", () => {
    const o = sale("checking");
    expect(cheerFor(1, 2, o)?.word).toBe("Delivered!");
    expect(cheerFor(2, 3, sale("confirmed"))?.word).toBe("Confirmed!");
    expect(cheerFor(2, 1, o)).toBeNull();
    expect(cheerFor(1, 2, sale("refunded"))).toBeNull();
  });
});

describe("the sample", () => {
  it("falls back to deliver on an unknown state", () => {
    expect(sampleState("nope")).toBe("deliver");
    expect(sampleState("refunded")).toBe("refunded");
  });

  it("builds every state without throwing", () => {
    for (const as of SAMPLE_STATES) expect(() => saleJourney(sale(as), NOW)).not.toThrow();
  });
});

describe("the page", () => {
  const html = (as: (typeof SAMPLE_STATES)[number], sample: boolean = false) =>
    renderToStaticMarkup(createElement(AthleteSale, { order: sale(as), now: NOW, sample: sample ? as : null }));

  it("opens on the step the sale is at, with the others hidden", () => {
    const h = html("deliver");
    expect(h).toContain('aria-label="Steps of this sale"');
    /* four panels, only step 2 shown */
    expect(h.match(/class="sx-cw-panel"/g)?.length).toBe(4);
    expect(h).toMatch(/<section aria-labelledby="sx-sl-h-deliver" class="sx-cw-panel"|<section class="sx-cw-panel" aria-labelledby="sx-sl-h-deliver"/);
    expect(h).toMatch(/<section hidden="" class="sx-cw-panel" aria-labelledby="sx-sl-h-pay"/);
  });

  it("marks delivered on the page: the note, then a Mark delivered button", () => {
    const h = html("deliver");
    expect(h).toContain('id="mk-note"');
    expect(h).toContain("What did you do?");
    expect(h).toContain("Add proof");
    expect(h).toContain(">Mark delivered");
    expect(h).not.toContain('role="dialog"');
  });

  it("shows the share and whose move it is on the ticket", () => {
    const h = html("deliver");
    expect(h).toContain("$765.00");
    expect(h).toContain("Your move");
    expect(h).toContain("Order SX-24817");
  });

  it("shows the clock while the sponsor checks it", () => {
    const h = html("checking");
    expect(h).toContain("sx-sl-ring");
    expect(h).toContain("15 h 0 m");
    expect(h).toContain("Your delivery note");
  });

  it("ends on Payouts once confirmed, on all sales otherwise", () => {
    expect(html("confirmed")).toContain('href="/athlete/money"');
    expect(html("deliver")).toContain("Back to all sales");
  });

  it("hides the sponsor's contact until they've paid", () => {
    expect(html("unpaid")).not.toContain("dana@northsidefitness.example");
    expect(html("deliver")).toContain("dana@northsidefitness.example");
  });

  it("labels the sample and offers its states", () => {
    const h = html("deliver", true);
    expect(h).toContain("Sample data");
    expect(h).toContain('href="?demo=sample&amp;as=refunded"');
  });
});
