/**
 * The fee statement — POL-BE-119. Pure: figures in, statement out.
 *
 * The partnership agreement (Rodney, 2026-11-21), "Platform access and service
 * orders": "Before campaign acceptance, disclose the applicable transaction
 * fee, fee payer and processing costs in writing. If a fee applies, identify
 * it in the signed campaign order. Any change requires written acceptance
 * before it applies to that order."
 *
 * So every acceptance in SponsorX — the athlete's Campaign Order and Offer,
 * the seller's marketplace accept, Deal Chat signing, the sponsor placing a
 * marketplace order, and the sponsor confirming a managed campaign's price —
 * is shown one of these first, and accepts it by its hash. The statement says
 * three things in figures and in words: which transaction fees apply (each
 * one's rate, fixed amount, amount and payer), who pays them, and the
 * processing cost and who pays that.
 *
 * AUDIENCES. The same order reads differently to each side:
 *   ATHLETE  — a managed campaign. BTG's fee is in the sponsor's price and is
 *              never deducted from the athlete's compensation (COLLAB.v2,
 *              CAMPAIGN_ORDER.v3 §10), and the sponsor's price is not shown
 *              to the athlete (COLLAB.v2). Owner, 2026-11-21: "transaction fee
 *              none deducted from you; fee payer the sponsor, included in the
 *              sponsor's price; processing none to you".
 *   SELLER   — a team, venue or athlete selling on the marketplace. The fees
 *              come out of the sale in the ledger's order (ledger-math.ts):
 *              platform fee, management fee, processing, then referral and
 *              the reserve from the seller's share.
 *   SPONSOR  — buying on the marketplace: the buyer fee is theirs; every other
 *              fee and processing is the seller's, paid out of the sale.
 *              On a managed campaign: nothing is added to the price.
 *
 * Fees that come to nothing are left out of `fees` — "if a fee applies,
 * identify it" — and the words say no other fee applies.
 */
import { createHash } from "node:crypto";

export type FeePayer = "SPONSOR" | "SELLER" | "ATHLETE";
export type FeeAudience = "ATHLETE" | "SELLER" | "SPONSOR";
export type FeeContext = "CAMPAIGN_ORDER" | "MARKETPLACE_ORDER" | "DEAL" | "LISTING" | "CAMPAIGN_PRICE";

export type FeeItem = {
  kind: "BUYER_FEE" | "PLATFORM_FEE" | "MANAGEMENT_FEE" | "REFERRAL";
  name: string;
  rateBps: number;
  fixedCents: number;
  amountCents: number;
  payer: FeePayer;
};

export type ProcessingItem = {
  rateBps: number;
  fixedCents: number;
  amountCents: number;
  /** NONE: there is no processing cost for this reader at all. */
  payer: FeePayer | "NONE";
};

export type FeeStatement = {
  v: 1;
  audience: FeeAudience;
  context: FeeContext;
  currency: "USD";
  /** What the statement is about: the athlete's compensation, the seller's sale, the sponsor's price. */
  amountCents: number;
  /** The transaction fees that apply, each with its payer. Empty: none applies. */
  fees: FeeItem[];
  /** Who pays the transaction fee, in words. */
  feePayer: string;
  processing: ProcessingItem;
  /** SELLER: held from the seller's share until the order closes, then paid to them. Not a fee. */
  reserveCents: number | null;
  /** SPONSOR: the total they pay. */
  youPayCents: number | null;
  /** ATHLETE / SELLER: what reaches them (a seller's includes nothing held). */
  youReceiveCents: number | null;
  /** The disclosure in writing, one sentence per line, in the order shown. */
  text: string[];
};

/** The record kept with an acceptance: what was shown, its hash, and whether the client echoed it. */
export type FeeStatementRecord = { statement: FeeStatement; hash: string; shown: boolean };

const NAMES: Record<FeeItem["kind"], string> = {
  BUYER_FEE: "Buyer fee",
  PLATFORM_FEE: "Platform fee",
  MANAGEMENT_FEE: "Management fee",
  REFERRAL: "Referral fee",
};

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** 1500 → "15%", 290 → "2.9%", 125 → "1.25%". */
export function percent(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** "15%", "2.9% + 30¢", "$5.00", or "" when the rule is empty. */
export function rateWords(rateBps: number, fixedCents: number): string {
  const fixed = fixedCents ? (fixedCents < 100 ? `${fixedCents}¢` : money(fixedCents)) : "";
  if (rateBps && fixed) return `${percent(rateBps)} + ${fixed}`;
  return rateBps ? percent(rateBps) : fixed;
}

function feeLine(f: FeeItem, whose: string): string {
  return `${f.name}: ${rateWords(f.rateBps, f.fixedCents)} — ${money(f.amountCents)}, paid by ${whose}.`;
}

function item(kind: FeeItem["kind"], rateBps: number, fixedCents: number, amountCents: number, payer: FeePayer): FeeItem | null {
  return amountCents > 0 || rateBps > 0 || fixedCents > 0 ? { kind, name: NAMES[kind], rateBps, fixedCents, amountCents, payer } : null;
}

/* --- ATHLETE ------------------------------------------------------------ */

/** A managed Campaign Order or Offer, read by the athlete (or their guardian). */
export function athleteStatement(compensationCents: number): FeeStatement {
  return {
    v: 1, audience: "ATHLETE", context: "CAMPAIGN_ORDER", currency: "USD",
    amountCents: compensationCents,
    fees: [],
    feePayer: "The sponsor. BTG's fee is included in the sponsor's price and is not deducted from your compensation.",
    processing: { rateBps: 0, fixedCents: 0, amountCents: 0, payer: "NONE" },
    reserveCents: null, youPayCents: null, youReceiveCents: compensationCents,
    text: [
      "Transaction fee: none is deducted from you.",
      "Fee payer: the sponsor. BTG's fee is included in the sponsor's price.",
      "Processing cost: none to you.",
      `You receive: ${money(compensationCents)}, your full compensation.`,
    ],
  };
}

/* --- SELLER ------------------------------------------------------------- */

export type SellerFigures = {
  /** The seller's sale on this order, after discounts. */
  saleCents: number;
  platformFee: { rateBps: number; fixedCents: number; amountCents: number };
  managementFee: { rateBps: number; fixedCents: number; amountCents: number };
  /** The order's processing rule and the seller's part of the order's processing cost. */
  processing: { rateBps: number; fixedCents: number; amountCents: number };
  referral: { rateBps: number; amountCents: number };
  reserve: { rateBps: number; amountCents: number };
  /** What is paid to the seller once the order is paid (the reserve follows when it closes). */
  availableCents: number;
  /** The buyer fee the sponsor pays on top — the seller's sale is not reduced by it. */
  buyerFee?: { rateBps: number; amountCents: number } | null;
  /** True when some of these items are a roster athlete's, split with the team. */
  rosterSplit?: boolean;
  /** True when the order has more than one seller: processing is shared across them by amount. */
  sharedProcessing?: boolean;
};

export function sellerStatement(context: "MARKETPLACE_ORDER" | "DEAL" | "LISTING", f: SellerFigures): FeeStatement {
  const fees = [
    item("PLATFORM_FEE", f.platformFee.rateBps, f.platformFee.fixedCents, f.platformFee.amountCents, "SELLER"),
    item("MANAGEMENT_FEE", f.managementFee.rateBps, f.managementFee.fixedCents, f.managementFee.amountCents, "SELLER"),
    item("REFERRAL", f.referral.rateBps, 0, f.referral.amountCents, "SELLER"),
  ].filter((x): x is FeeItem => x !== null);
  const hasProcessing = f.processing.rateBps > 0 || f.processing.fixedCents > 0;
  const text = [
    ...(context === "LISTING" ? ["On an order of one at this listing's price, at today's rates. Each order's own fees are fixed when it is placed; if they differ from these, you are asked to accept that order first."] : []),
    `Your sale: ${money(f.saleCents)}.`,
    ...(fees.length ? fees.map((x) => feeLine(x, "you, out of the sale")) : ["Transaction fee: none applies to this sale."]),
    ...(fees.length ? ["No other transaction fee applies."] : []),
    hasProcessing
      ? `Processing cost: ${rateWords(f.processing.rateBps, f.processing.fixedCents)} per order — ${money(f.processing.amountCents)}${f.sharedProcessing ? " as your share, split with the order's other sellers by amount" : ""}, paid by you, out of the sale.`
      : "Processing cost: none.",
    f.buyerFee && f.buyerFee.amountCents > 0
      ? `The sponsor pays a buyer fee of ${percent(f.buyerFee.rateBps)} (${money(f.buyerFee.amountCents)}) on top; it does not reduce your sale.`
      : "The sponsor pays no fee on top of your sale.",
    ...(f.reserve.amountCents > 0 ? [`Held: ${money(f.reserve.amountCents)} (${percent(f.reserve.rateBps)} reserve, not a fee) until the order closes, then paid to you.`] : []),
    `You receive: ${money(f.availableCents)} once the sponsor pays${f.reserve.amountCents > 0 ? `, and ${money(f.reserve.amountCents)} more when the order closes` : ""}.`,
    ...(f.rosterSplit ? ["For a roster athlete's items, what you receive is split with the team as agreed on the roster."] : []),
  ];
  return {
    v: 1, audience: "SELLER", context, currency: "USD",
    amountCents: f.saleCents,
    fees,
    feePayer: fees.length ? "You, the seller — taken out of the sale." : "No transaction fee applies.",
    processing: hasProcessing ? { ...f.processing, payer: "SELLER" } : { rateBps: 0, fixedCents: 0, amountCents: 0, payer: "NONE" },
    reserveCents: f.reserve.amountCents,
    youPayCents: null,
    youReceiveCents: f.availableCents,
    text,
  };
}

/* --- SPONSOR ------------------------------------------------------------ */

export type SponsorOrderFigures = {
  subtotalCents: number;
  buyerFee: { rateBps: number; amountCents: number };
  /** The order's processing rule and cost — the sellers pay it out of the sale. */
  processing: { rateBps: number; fixedCents: number; amountCents: number };
};

export function sponsorOrderStatement(context: "MARKETPLACE_ORDER" | "DEAL", f: SponsorOrderFigures): FeeStatement {
  const buyer = item("BUYER_FEE", f.buyerFee.rateBps, 0, f.buyerFee.amountCents, "SPONSOR");
  const total = f.subtotalCents + f.buyerFee.amountCents;
  const hasProcessing = f.processing.rateBps > 0 || f.processing.fixedCents > 0;
  return {
    v: 1, audience: "SPONSOR", context, currency: "USD",
    amountCents: f.subtotalCents,
    fees: buyer ? [buyer] : [],
    feePayer: buyer
      ? "You pay the buyer fee. BTG's other fees are paid by the seller, out of the sale."
      : "BTG's fees are paid by the seller, out of the sale. Nothing is added to your price.",
    processing: hasProcessing ? { ...f.processing, payer: "SELLER" } : { rateBps: 0, fixedCents: 0, amountCents: 0, payer: "NONE" },
    reserveCents: null,
    youPayCents: total,
    youReceiveCents: null,
    text: [
      `Price: ${money(f.subtotalCents)}.`,
      buyer ? feeLine(buyer, "you, on top of the price") : "Transaction fee: none is added to your price.",
      "BTG's platform and other fees are paid by the seller, out of the sale.",
      hasProcessing
        ? `Processing cost: ${rateWords(f.processing.rateBps, f.processing.fixedCents)} per order — ${money(f.processing.amountCents)}, paid by the seller, out of the sale. Nothing is added for you.`
        : "Processing cost: none.",
      `You pay: ${money(total)}.`,
    ],
  };
}

/** A managed campaign's price, confirmed by the sponsor before it launches. */
export function sponsorCampaignStatement(priceCents: number, athletes: number): FeeStatement {
  return {
    v: 1, audience: "SPONSOR", context: "CAMPAIGN_PRICE", currency: "USD",
    amountCents: priceCents,
    fees: [],
    feePayer: "Nobody pays a fee on top: BTG's fee is included in this price, and nothing is deducted from the athletes' pay.",
    processing: { rateBps: 0, fixedCents: 0, amountCents: 0, payer: "NONE" },
    reserveCents: null,
    youPayCents: priceCents,
    youReceiveCents: null,
    text: [
      `Campaign price: ${money(priceCents)} for ${athletes} athlete${athletes === 1 ? "" : "s"}.`,
      "Transaction fee: none is added. BTG's fee is included in this price.",
      "Fee payer: included in the price you pay; nothing is deducted from the athletes' pay.",
      "Processing cost: none to you. BTG invoices you for this price.",
      `You pay: ${money(priceCents)}.`,
    ],
  };
}

/* --- the hash ----------------------------------------------------------- */

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** "sha256:<hex>" over the statement with its keys sorted — the agreement hashes' format. */
export function feeStatementHash(s: FeeStatement): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(stable(s)), "utf8").digest("hex")}`;
}

export type FeeCheck = { ok: true; record: FeeStatementRecord } | { ok: false; reason: "missing" | "changed" };

/**
 * Was this statement the one shown? `required` is the FEE_STATEMENT_REQUIRED
 * switch: off, an acceptance that sends no hash still goes through and is
 * recorded as not shown (the screens predate the statement); a hash that is
 * sent must always match.
 */
export function checkFeeStatement(current: FeeStatement, shown: string | null | undefined, required: boolean): FeeCheck {
  const hash = feeStatementHash(current);
  if (!shown) return required ? { ok: false, reason: "missing" } : { ok: true, record: { statement: current, hash, shown: false } };
  return shown === hash ? { ok: true, record: { statement: current, hash, shown: true } } : { ok: false, reason: "changed" };
}
