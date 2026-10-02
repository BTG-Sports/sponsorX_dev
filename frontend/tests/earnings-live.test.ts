import { describe, expect, it } from "vitest";

import { agingBuckets, buckets, career, earningApprovalNote, lastChange, paidByMonth, toActivityItem, type ApiEarning } from "../src/lib/earnings-live";

/* --------------------------------------------------------------------------
   P7-FE-01 / -02 — the earnings arithmetic. "Career" is what signed orders
   are worth minus disputes, with the paid part separate; the trend counts
   payouts in the month they were PAID; aging only counts what is still
   owed; an earning the API withheld the amount of adds nothing.
   -------------------------------------------------------------------------- */

function e(state: ApiEarning["state"], amount: number | undefined, paidAt: string | null = null): ApiEarning {
  return {
    id: `${state}-${amount}`, state, taxYear: 2026, paidAt, reference: null,
    athlete: { id: "a1", displayName: "JORDAN" },
    order: {
      id: "o", jobId: "SX-01", jobName: "Story Drop", acceptedAt: "2026-10-01T00:00:00.000Z",
      campaignId: "c", campaignName: "Fall", sponsorName: "Bowie", deliverables: { verified: 1, total: 2 },
    },
    ...(amount === undefined ? {} : { amount }),
  };
}

const rows = [
  e("PENDING", 40_000), e("ELIGIBLE", 15_000), e("APPROVED_FOR_PAYOUT", 32_000),
  e("PAID", 10_000, "2026-03-15T00:00:00.000Z"), e("PAID", 5_000, "2026-03-20T00:00:00.000Z"),
  e("HELD", 12_000), e("DISPUTED", 9_000),
];

describe("career", () => {
  it("is signed value minus disputes, with paid and on-the-way stated apart", () => {
    expect(career(rows)).toEqual({ raised: 114_000, paid: 15_000, onTheWay: 32_000 });
  });
  it("a withheld amount adds nothing", () => {
    expect(career([e("PAID", undefined, "2026-01-01T00:00:00.000Z")]).raised).toBe(0);
  });
});

describe("buckets", () => {
  it("sums and counts by state", () => {
    const b = buckets(rows);
    expect(b.PAID).toEqual({ amount: 15_000, count: 2 });
    expect(b.HELD).toEqual({ amount: 12_000, count: 1 });
  });
});

describe("paidByMonth", () => {
  it("counts payouts in the month they were paid, that year only", () => {
    const m = paidByMonth([...rows, e("PAID", 99_000, "2025-03-01T00:00:00.000Z")], 2026);
    expect(m[2]).toBe(15_000);
    expect(m.reduce((a, b) => a + b, 0)).toBe(15_000);
  });
});

describe("activity items", () => {
  it("dates by payout, else acceptance", () => {
    expect(lastChange(rows[3])).toBe("Mar 15");
    expect(lastChange(rows[0])).toBe("Oct 1");
    expect(toActivityItem(rows[0])).toMatchObject({ athlete: "JORDAN", campaign: "Fall", amount: 40_000, state: "PENDING" });
  });
});

describe("agingBuckets", () => {
  it("buckets only what is still owed, by days past due", () => {
    const now = new Date("2026-10-31T00:00:00Z");
    const recon = [{
      campaignId: "c", name: "Fall", sponsorName: "Bowie", contracted: 0, invoiced: 0, invoicePaid: 0, earningsRaised: 0, earningsPaid: 0,
      invoices: [
        { number: "1", zohoInvoiceId: "z1", status: "paid", amount: 50_000, paidAt: null, issuedAt: null, dueAt: "2026-01-01T00:00:00Z" },
        { number: "2", zohoInvoiceId: "z2", status: "sent", amount: 10_000, paidAt: null, issuedAt: null, dueAt: "2026-11-10T00:00:00Z" },
        { number: "3", zohoInvoiceId: "z3", status: "overdue", amount: 30_000, paidAt: null, issuedAt: null, dueAt: "2026-10-11T00:00:00Z" },
        { number: "4", zohoInvoiceId: "z4", status: "void", amount: 99_000, paidAt: null, issuedAt: null, dueAt: "2025-01-01T00:00:00Z" },
      ],
    }];
    const a = agingBuckets(recon, now);
    expect(a.map((x) => x.value)).toEqual([25, 75, 0, 0]);
    expect(a[1].display).toBe("$300");
  });
});

describe("2S5-FE-06 · Finance's note on a Phase 1 earning", () => {
  it("'Approved automatically' while approved or paid; the reasons only on one left ELIGIBLE", () => {
    expect(earningApprovalNote({ state: "APPROVED_FOR_PAYOUT", approvedAutomatically: true, reviewReasons: [] })).toEqual({ badge: "Approved automatically", reasons: [] });
    expect(earningApprovalNote({ state: "PAID", approvedAutomatically: true })).toEqual({ badge: "Approved automatically", reasons: [] });
    expect(earningApprovalNote({ state: "HELD", approvedAutomatically: true })).toEqual({ badge: null, reasons: [] });
    expect(earningApprovalNote({ state: "ELIGIBLE", approvedAutomatically: false, reviewReasons: ["Over $2,000"] })).toEqual({ badge: null, reasons: ["Over $2,000"] });
    /* An athlete's read has no reasons at all. */
    expect(earningApprovalNote({ state: "ELIGIBLE" })).toEqual({ badge: null, reasons: [] });
  });
});
