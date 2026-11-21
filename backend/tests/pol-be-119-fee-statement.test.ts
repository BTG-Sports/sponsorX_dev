/**
 * POL-BE-119 — the fee statement, pure: the words and figures each side is
 * shown before accepting, its hash, and the check an acceptance runs.
 */
import { describe, expect, it } from "vitest";
import type { OrderFeeTerms } from "../src/domain/fee-statement";
import type { AppliedRule } from "../src/domain/ledger-math";

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const {
  athleteStatement, checkFeeStatement, feeStatementHash, rateWords, sellerStatement, sponsorCampaignStatement, sponsorOrderStatement,
} = await import("../src/domain/fee-statement-rules");
const { breakdownUnder, feeRates, sellerStatementFor, spreadAmount, sponsorStatementFor } = await import("../src/domain/fee-statement");
const { NO_RULE } = await import("../src/domain/ledger-math");

const r = (bps: number, fixedCents = 0, ruleId: string | null = `rule-${bps}`, version = 1): AppliedRule => ({ ruleId, ruleKey: ruleId, version, bps, fixedCents });

/* The ledger design's worked example rates (SIMULATED): 15% / 5% / 2.9% + 30¢ / 2% / 10%. */
const rules = { PLATFORM_FEE: r(1500), MANAGEMENT_FEE: r(500), REFERRAL: r(200), RESERVE: r(1000), TEAM_SHARE: NO_RULE };
const terms = (over: Partial<OrderFeeTerms> = {}): OrderFeeTerms => ({
  v: 1, resolvedAt: "2026-11-21T00:00:00.000Z", buyerFeeBps: 0, processing: r(290, 30),
  lines: {
    a: { rules, athleteId: null, teamShareBps: null },
    b: { rules, athleteId: "ath", teamShareBps: 2000 },
    c: { rules: { ...rules, MANAGEMENT_FEE: NO_RULE, REFERRAL: NO_RULE }, athleteId: null, teamShareBps: null },
  },
  sponsor: null,
  ...over,
});

describe("POL-BE-119 · the athlete's statement", () => {
  it("names no fee deducted, the sponsor as payer and no processing — in words and figures", () => {
    const s = athleteStatement(50_000);
    expect(s.fees).toEqual([]);
    expect(s.processing).toEqual({ rateBps: 0, fixedCents: 0, amountCents: 0, payer: "NONE" });
    expect(s.youReceiveCents).toBe(50_000);
    expect(s.text).toEqual([
      "Transaction fee: none is deducted from you.",
      "Fee payer: the sponsor. BTG's fee is included in the sponsor's price.",
      "Processing cost: none to you.",
      "You receive: $500.00, your full compensation.",
    ]);
  });
  it("never shows the sponsor's price", () => {
    expect(JSON.stringify(athleteStatement(50_000))).not.toMatch(/sellPrice|sponsor's price of \$/);
  });
});

describe("POL-BE-119 · the seller's statement", () => {
  const lines = [{ id: "a", lineTotalCents: 120_000 }, { id: "b", lineTotalCents: 100_000 }, { id: "c", lineTotalCents: 59_997 }];
  it("sums exactly what the ledger books for the seller's lines", () => {
    const t = terms();
    const books = breakdownUnder(t, lines).filter((b) => b.lineId === "a" || b.lineId === "c");
    const s = sellerStatementFor("MARKETPLACE_ORDER", t, lines, ["a", "c"]);
    const sum = (k: "platformFeeCents" | "processingCents" | "availableCents" | "reserveCents") => books.reduce((n, b) => n + b[k], 0);
    expect(s.fees.find((f) => f.kind === "PLATFORM_FEE")!.amountCents).toBe(sum("platformFeeCents"));
    expect(s.processing.amountCents).toBe(sum("processingCents"));
    expect(s.youReceiveCents).toBe(sum("availableCents"));
    expect(s.reserveCents).toBe(sum("reserveCents"));
    expect(s.processing.payer).toBe("SELLER");
    expect(s.fees.every((f) => f.payer === "SELLER")).toBe(true);
    expect(s.text.join(" ")).toMatch(/split with the order's other sellers by amount/);
  });
  it("leaves out a fee that does not apply, and says no other applies", () => {
    const t = terms();
    const s = sellerStatementFor("MARKETPLACE_ORDER", t, [{ id: "c", lineTotalCents: 10_000 }], ["c"]);
    expect(s.fees.map((f) => f.kind)).toEqual(["PLATFORM_FEE"]);
    expect(s.text).toContain("No other transaction fee applies.");
    expect(s.text.join(" ")).toContain("Platform fee: 15% — $15.00, paid by you, out of the sale.");
    expect(s.text.join(" ")).toContain("Processing cost: 2.9% + 30¢ per order — $3.20, paid by you, out of the sale.");
  });
  it("says so when no fee at all applies", () => {
    const s = sellerStatement("MARKETPLACE_ORDER", {
      saleCents: 1000, platformFee: { rateBps: 0, fixedCents: 0, amountCents: 0 }, managementFee: { rateBps: 0, fixedCents: 0, amountCents: 0 },
      processing: { rateBps: 0, fixedCents: 0, amountCents: 0 }, referral: { rateBps: 0, amountCents: 0 }, reserve: { rateBps: 0, amountCents: 0 }, availableCents: 1000,
    });
    expect(s.fees).toEqual([]);
    expect(s.text).toContain("Transaction fee: none applies to this sale.");
    expect(s.text).toContain("Processing cost: none.");
    expect(s.processing.payer).toBe("NONE");
  });
});

describe("POL-BE-119 · the sponsor's statements", () => {
  it("a marketplace order: the buyer fee is the sponsor's, everything else the seller's", () => {
    const s = sponsorOrderStatement("MARKETPLACE_ORDER", { subtotalCents: 10_000, buyerFee: { rateBps: 300, amountCents: 300 }, processing: { rateBps: 290, fixedCents: 30, amountCents: 320 } });
    expect(s.fees).toEqual([{ kind: "BUYER_FEE", name: "Buyer fee", rateBps: 300, fixedCents: 0, amountCents: 300, payer: "SPONSOR" }]);
    expect(s.processing.payer).toBe("SELLER");
    expect(s.youPayCents).toBe(10_300);
    expect(s.text).toContain("Buyer fee: 3% — $3.00, paid by you, on top of the price.");
  });
  it("no buyer fee: nothing is added", () => {
    const s = sponsorStatementFor("MARKETPLACE_ORDER", terms(), [{ id: "a", lineTotalCents: 10_000 }]);
    expect(s.fees).toEqual([]);
    expect(s.text).toContain("Transaction fee: none is added to your price.");
    expect(s.youPayCents).toBe(10_000);
  });
  it("a managed campaign's price: no fee added, BTG's fee in the price, no processing", () => {
    const s = sponsorCampaignStatement(450_000, 3);
    expect(s.context).toBe("CAMPAIGN_PRICE");
    expect(s.youPayCents).toBe(450_000);
    expect(s.text[0]).toBe("Campaign price: $4,500.00 for 3 athletes.");
    expect(s.text).toContain("Transaction fee: none is added. BTG's fee is included in this price.");
  });
});

describe("POL-BE-119 · the hash and the check", () => {
  it("is the same whatever order the keys were built in, and changes with any figure", () => {
    const a = athleteStatement(50_000);
    const shuffled = Object.fromEntries(Object.entries(a).reverse()) as typeof a;
    expect(feeStatementHash(shuffled)).toBe(feeStatementHash(a));
    expect(feeStatementHash(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(feeStatementHash(athleteStatement(50_001))).not.toBe(feeStatementHash(a));
  });
  it("required: refuses a missing or different hash; off: records a missing one as not shown", () => {
    const s = athleteStatement(100);
    const h = feeStatementHash(s);
    expect(checkFeeStatement(s, h, true)).toEqual({ ok: true, record: { statement: s, hash: h, shown: true } });
    expect(checkFeeStatement(s, undefined, true)).toEqual({ ok: false, reason: "missing" });
    expect(checkFeeStatement(s, undefined, false)).toEqual({ ok: true, record: { statement: s, hash: h, shown: false } });
    expect(checkFeeStatement(s, feeStatementHash(athleteStatement(101)), false)).toEqual({ ok: false, reason: "changed" });
  });
});

describe("POL-BE-119 · rates and amounts", () => {
  it("rateWords", () => {
    expect(rateWords(1500, 0)).toBe("15%");
    expect(rateWords(290, 30)).toBe("2.9% + 30¢");
    expect(rateWords(0, 500)).toBe("$5.00");
  });
  it("a new rule version changes the rates a seller accepted", () => {
    const t = terms();
    const revised = terms({ lines: { ...t.lines, a: { ...t.lines.a!, rules: { ...rules, PLATFORM_FEE: r(1500, 0, "rule-1500-v2", 2) } } } });
    expect(feeRates(revised, "a")).not.toBe(feeRates(t, "a"));
    expect(feeRates(terms(), "a")).toBe(feeRates(t, "a"));
    expect(feeRates(terms({ processing: r(300, 30) }), "a")).not.toBe(feeRates(t, "a"));
  });
  it("spreads an agreed amount across lines exactly, the last line taking the rest", () => {
    const d = new Date("2026-12-01");
    const lines = [{ id: "x", startsOn: d, lineTotalCents: 3333 }, { id: "y", startsOn: d, lineTotalCents: 6667 }];
    const out = spreadAmount(lines, 9001);
    expect([...out.values()].reduce((s, n) => s + n, 0)).toBe(9001);
    expect(out.get("x")).toBe(3000);
    expect(spreadAmount(lines, 10_000).get("y")).toBe(6667);
  });
});
