/**
 * The fee statement at each acceptance — POL-BE-119. The figures and words
 * are fee-statement-rules.ts; this file ties them to the records.
 *
 * MARKETPLACE ORDERS. The commission rates an order carries are resolved once,
 * when the sponsor places it (ledger.ts `orderFeeTerms`), and kept on the
 * order as `feeTerms`. Every statement about the order — the sponsor's at
 * placement, each seller's at their accept, the Deal Chat agreement's — is
 * worked out from those frozen terms, and the ledger books from them too. So
 * a rate changed on the Commission page after the order was placed never
 * reaches it: what was disclosed is what is charged. (Before this, the rates
 * were looked up when the order was approved — after the seller had accepted.)
 *
 * THE SWITCH. FEE_STATEMENT_REQUIRED (documentation/SponsorX-Switches.md):
 * on, an acceptance must echo the hash of the statement it showed; off, the
 * screens that predate the statement still work, and the acceptance records
 * the statement with `shown: false`. A hash that is sent must match either way.
 */
import { env } from "../config/env";
import { breakdownOrder, type AppliedRule, type LineBreakdown, type RuleKind } from "./ledger-math";
import { orderQuote } from "./marketplace-order-rules";
import {
  checkFeeStatement, feeStatementHash, sellerStatement, sponsorOrderStatement,
  type FeeStatement, type FeeStatementRecord,
} from "./fee-statement-rules";

/** The acceptance showed a statement that is no longer the order's, or none (409). */
export class FeeStatementChangedError extends Error {
  readonly status = 409;
  readonly code: "fee_statement_changed" | "fee_statement_required";
  readonly details: { feeStatement: FeeStatement; feeStatementHash: string };
  constructor(current: FeeStatement, reason: "missing" | "changed") {
    super(
      reason === "missing"
        ? "Read the fees, who pays them and the processing cost before accepting. Nothing was accepted."
        : "The fees changed since they were shown. Nothing was accepted. Read the new fee statement and accept again.",
    );
    this.name = "FeeStatementChangedError";
    this.code = reason === "missing" ? "fee_statement_required" : "fee_statement_changed";
    this.details = { feeStatement: current, feeStatementHash: feeStatementHash(current) };
  }
}

/** The statement the acceptance must have shown, checked; the record to keep with it. */
export function requireFeeStatement(current: FeeStatement, shown: string | null | undefined): FeeStatementRecord {
  const check = checkFeeStatement(current, shown, env.FEE_STATEMENT_REQUIRED);
  if (!check.ok) throw new FeeStatementChangedError(current, check.reason);
  return check.record;
}

/** A statement and its hash, as a read returns it. */
export function presentStatement(s: FeeStatement) {
  return { feeStatement: s, feeStatementHash: feeStatementHash(s) };
}

/* --- marketplace orders: the frozen terms -------------------------------- */

export type LineRules = Record<Exclude<RuleKind, "PROCESSING">, AppliedRule>;

/** Kept on MarketplaceOrder.feeTerms from placement. Write-once (marketplace_order_immutable.sql). */
export type OrderFeeTerms = {
  v: 1;
  resolvedAt: string;
  buyerFeeBps: number;
  processing: AppliedRule;
  lines: Record<string, { rules: LineRules; athleteId: string | null; teamShareBps: number | null }>;
  /** The sponsor's statement at placement, as accepted. */
  sponsor: FeeStatementRecord | null;
};

export type FeeLine = { id: string; lineTotalCents: number };

/**
 * The one order of lines every breakdown uses — the ledger's and every
 * statement's. Processing is shared by amount with the last line taking the
 * remainder, so a different order could move a cent between sellers.
 */
export const FEE_LINE_ORDER = [{ startsOn: "asc" as const }, { id: "asc" as const }];

export function asFeeTerms(v: unknown): OrderFeeTerms | null {
  return v && typeof v === "object" && (v as { v?: unknown }).v === 1 ? (v as OrderFeeTerms) : null;
}

/** Lines sorted as FEE_LINE_ORDER sorts them. */
export function inFeeOrder<T extends { id: string; startsOn: Date }>(lines: readonly T[]): T[] {
  return [...lines].sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * A Deal Chat's agreed amount across the seller's lines, in proportion to
 * their listed totals; the last line (in fee order) takes the cents left over.
 * The one rule both the agreement's fee section and the repricing after both
 * sign (marketplace-order.ts afterDealsSigned) use.
 */
export function spreadAmount(lines: ReadonlyArray<{ id: string; startsOn: Date; lineTotalCents: number }>, amountCents: number): Map<string, number> {
  const ordered = inFeeOrder(lines);
  const original = ordered.reduce((s, l) => s + l.lineTotalCents, 0);
  const out = new Map<string, number>();
  if (amountCents === original) { for (const l of ordered) out.set(l.id, l.lineTotalCents); return out; }
  let left = amountCents;
  ordered.forEach((l, i) => {
    const share = i === ordered.length - 1 ? left : original > 0 ? Math.round((amountCents * l.lineTotalCents) / original) : Math.floor(amountCents / ordered.length);
    left -= share;
    out.set(l.id, share);
  });
  return out;
}

/** The ledger's breakdown of these lines under the frozen terms — the same arithmetic it books. */
export function breakdownUnder(terms: OrderFeeTerms, lines: FeeLine[]): LineBreakdown[] {
  return breakdownOrder(
    lines.map((l) => {
      const t = terms.lines[l.id];
      if (!t) throw new Error(`Order line ${l.id} has no frozen fee terms.`);
      return { lineId: l.id, grossCents: l.lineTotalCents, rules: t.rules, athleteId: t.athleteId, teamShareBps: t.teamShareBps };
    }),
    terms.processing,
  );
}

/** The sponsor's statement for an order of these lines. */
export function sponsorStatementFor(context: "MARKETPLACE_ORDER" | "DEAL", terms: OrderFeeTerms, lines: FeeLine[]): FeeStatement {
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const quote = orderQuote(subtotal, terms.buyerFeeBps);
  const processingCents = lines.length && subtotal > 0 ? breakdownUnder(terms, lines).reduce((s, b) => s + b.processingCents, 0) : 0;
  return sponsorOrderStatement(context, {
    subtotalCents: subtotal,
    buyerFee: { rateBps: terms.buyerFeeBps, amountCents: quote.feesCents },
    processing: { rateBps: terms.processing.bps, fixedCents: terms.processing.fixedCents, amountCents: processingCents },
  });
}

/**
 * One seller's statement: the breakdown of the whole order (processing is
 * shared across every line by amount), summed over this seller's lines.
 */
export function sellerStatementFor(
  context: "MARKETPLACE_ORDER" | "DEAL" | "LISTING", terms: OrderFeeTerms, lines: FeeLine[], sellerLineIds: readonly string[],
): FeeStatement {
  const mine = new Set(sellerLineIds);
  const all = breakdownUnder(terms, lines);
  const parts = all.filter((b) => mine.has(b.lineId));
  const sum = (k: keyof LineBreakdown) => parts.reduce((s, b) => s + (b[k] as number), 0);
  const first = parts[0];
  const rule = (k: Exclude<RuleKind, "PROCESSING">) => first?.rules[k] ?? { bps: 0, fixedCents: 0 };
  const sale = sum("netCents");
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  return sellerStatement(context, {
    saleCents: sale,
    platformFee: { rateBps: rule("PLATFORM_FEE").bps, fixedCents: rule("PLATFORM_FEE").fixedCents, amountCents: sum("platformFeeCents") },
    managementFee: { rateBps: rule("MANAGEMENT_FEE").bps, fixedCents: rule("MANAGEMENT_FEE").fixedCents, amountCents: sum("managementFeeCents") },
    processing: { rateBps: terms.processing.bps, fixedCents: terms.processing.fixedCents, amountCents: sum("processingCents") },
    referral: { rateBps: rule("REFERRAL").bps, amountCents: sum("referralCents") },
    reserve: { rateBps: rule("RESERVE").bps, amountCents: sum("reserveCents") },
    availableCents: sum("availableCents"),
    buyerFee: terms.buyerFeeBps > 0 ? { rateBps: terms.buyerFeeBps, amountCents: orderQuote(sale, terms.buyerFeeBps).feesCents } : null,
    rosterSplit: parts.some((b) => b.teamShareBps !== null),
    sharedProcessing: lines.length > parts.length && subtotal > sale,
  });
}

/** The Deal agreement's fee section: both sides' statements, in words, for {{fees}}. */
export function dealFeesWords(sponsor: FeeStatement, seller: FeeStatement): string {
  return [
    "What the Sponsor pays:",
    ...sponsor.text.map((t) => `- ${t}`),
    "",
    "What the Seller pays:",
    ...seller.text.map((t) => `- ${t}`),
  ].join("\n");
}

/* --- listings: what the seller accepted ---------------------------------- */

/** The rates that decide one line's fees, as a comparable string: each rule's id, rate and fixed amount. */
export function feeRates(terms: OrderFeeTerms, key: string): string {
  const t = terms.lines[key];
  if (!t) throw new Error(`No fee terms for ${key}.`);
  const pick = (r: AppliedRule) => [r.ruleId, r.bps, r.fixedCents];
  const kinds = Object.keys(t.rules).sort() as (keyof LineRules)[];
  return JSON.stringify({ processing: pick(terms.processing), rules: kinds.map((k) => [k, ...pick(t.rules[k])]), teamShareBps: t.teamShareBps });
}

/** Kept on Listing.feeAcceptance. */
export type ListingFeeAcceptance = { record: FeeStatementRecord; rates: string; acceptedAt: string; acceptedBy: string | null };

export function asListingFeeAcceptance(v: unknown): ListingFeeAcceptance | null {
  return v && typeof v === "object" && typeof (v as { rates?: unknown }).rates === "string" ? (v as ListingFeeAcceptance) : null;
}

/** The seller's statement for a listing: an order of one unit at its price, at today's rates. */
export function listingStatement(terms: OrderFeeTerms, key: string, priceCents: number): FeeStatement {
  return sellerStatementFor("LISTING", terms, [{ id: key, lineTotalCents: priceCents }], [key]);
}
