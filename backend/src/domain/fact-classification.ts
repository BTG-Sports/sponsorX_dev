/**
 * What each status, payment type and source means for the facts — 3S1-QA-02
 * (documentation/SponsorX-Fact-Ledger.md §6).
 *
 * Every value the app can put in a money or delivery field is classified
 * here: the facts it leads to, or none and why. The tables are typed against
 * the app's own lists (`Record<…>` over the Prisma enum or the code's `as
 * const` list), so a value added there without a decision here fails the
 * typecheck, and tests/fact-coverage.static.test.ts fails it again at run
 * time with the value's name. A new status is never quietly left out of the
 * figures.
 *
 * Two tables are not only documentation: the fact writers read
 * `METRIC_SOURCE_MEASURES` and `PLATFORM_CHANNELS` to decide where a figure
 * is filed.
 */
import type {
  DeliverableState, EarningState, EditionState, MarketplaceOrderState, MetricSource, OrderState,
} from "../generated/prisma/enums";
import type { FactChannel, FactKind, FactMeasure } from "./fact-rules";
import type { DeliverablePlatform } from "./deliverable-platform";
import type { PAYMENT_METHODS } from "./marketplace-order-rules";
import type { REFUND_CAUSES, REFUND_METHODS, REFUND_STATES } from "./refunds";
import type { DISPUTE_STATES } from "./payment-exceptions";

/** The facts a value leads to (none is `[]`), and why — always said, so a reviewer can check it. */
export type Classified = { readonly facts: readonly FactKind[]; readonly why: string };
const none = (why: string): Classified => ({ facts: [], why });
const leads = (facts: FactKind[], why: string): Classified => ({ facts, why });

export const ORDER_STATE_FACTS: Readonly<Record<OrderState, Classified>> = {
  DRAFT: none("Not yet offered to the athlete; nothing is booked."),
  SENT: none("Offered, not agreed; nothing is booked."),
  ACCEPTED: leads(["ORDER_BOOKED", "DELIVERABLE_DUE"], "The contract: its sell price and pay are booked, and its deliverables fall due (acceptOrder, respondToOffer)."),
  REJECTED: none("Declined before acceptance; nothing was booked."),
  ACTIVE: none("The campaign went live; the booking was recorded at acceptance and no money moves."),
  COMPLETED: none("Delivered; the deliverables and the earning record their own facts."),
  CANCELLED: leads(["ORDER_CANCELLED", "REVERSAL"], "An accepted order's amounts are recorded as cancelled and its deliverables stop being due (transitionOrder). A never-accepted order booked nothing."),
};

export const DELIVERABLE_STATE_FACTS: Readonly<Record<DeliverableState, Classified>> = {
  NOT_STARTED: none("Its due fact was recorded when the order was accepted."),
  DRAFT_SUBMITTED: leads(["REVISION_REQUESTED"], "Reaching it from a review, or failing the automatic checks, is a draft sent back. A first submission records nothing."),
  BTG_REVIEW: none("A review step; nothing delivered yet."),
  SPONSOR_REVIEW: none("A review step; nothing delivered yet."),
  APPROVED: none("Approved, not yet published."),
  PUBLISHED: leads(["DELIVERABLE_PUBLISHED", "DELIVERABLE_DUE", "REVERSAL"], "Published, and its due fact moves from UNPUBLISHED to its platform."),
  VERIFIED: leads(["DELIVERABLE_VERIFIED"], "BTG confirmed the published work."),
};

export const EARNING_STATE_FACTS: Readonly<Record<EarningState, Classified>> = {
  PENDING: none("Owed later; no money has moved."),
  ELIGIBLE: none("Owed; no money has moved."),
  APPROVED_FOR_PAYOUT: none("Approved; no money has moved."),
  PAID: leads(["EARNING_PAID"], "Paid: gross plus adjustment, on the paid day. PAID is final, so it is never reversed."),
  HELD: none("On hold; no money has moved."),
  DISPUTED: none("In dispute; no money has moved."),
  VOIDED: none("Its order was cancelled before any work: nothing is owed, and no money moves."),
};

/** Where a day's views and engagements are filed, by their label (§22). */
export const METRIC_SOURCE_MEASURES: Readonly<Record<MetricSource, { views: FactMeasure; engagements: FactMeasure }>> = {
  VERIFIED_API: { views: "views_verified_api", engagements: "engagements_verified_api" },
  VERIFIED_MANUAL: { views: "views_verified_manual", engagements: "engagements_verified_manual" },
  SELF_REPORTED: { views: "views_self_reported", engagements: "engagements_self_reported" },
  ESTIMATED: { views: "views_estimated", engagements: "engagements_estimated" },
  ATTRIBUTED: { views: "views_attributed", engagements: "engagements_attributed" },
};

/** The channel a published deliverable is filed under, by its platform. */
export const PLATFORM_CHANNELS: Readonly<Record<DeliverablePlatform, FactChannel>> = {
  INSTAGRAM: "SOCIAL_INSTAGRAM", TIKTOK: "SOCIAL_TIKTOK", YOUTUBE: "SOCIAL_YOUTUBE", X: "SOCIAL_X", FACEBOOK: "SOCIAL_FACEBOOK", OTHER: "SOCIAL_OTHER",
};

export const EDITION_STATE_FACTS: Readonly<Record<EditionState, Classified>> = {
  PLANNING: none("Slots are sold one by one, each its own fact; the edition's state moves no money."),
  SELLING: none("Slots are sold one by one, each its own fact (AD_SLOT_SOLD)."),
  CLOSED: none("Sales closed; the sales already recorded stand."),
  IN_PRODUCTION: none("Production; no money moves."),
  PUBLISHED_DIGITAL: none("Published; edition views are counted from EditionEvent, not copied."),
  PRINTED: none("Printed; no money moves."),
  DISTRIBUTED: none("Distributed; no money moves."),
  CANCELLED: leads(["REVERSAL"], "Each sold slot's sale is reversed on the cancellation day (cancelEditionIn)."),
};

export const MARKETPLACE_ORDER_STATE_FACTS: Readonly<Record<MarketplaceOrderState, Classified>> = {
  PENDING_SELLER: none("Not contracted; nothing is booked."),
  PENDING_APPROVAL: none("Not contracted; nothing is booked."),
  APPROVED: leads(["MARKETPLACE_LINE_CONTRACTED"], "Contracted: each line's gross and net, from its frozen financials (bookOrder)."),
  AWAITING_PAYMENT: none("Contracted already; the facts were recorded at approval."),
  PAID: none("The sponsor's payment changes no figure: the sale was recorded when contracted."),
  IN_DELIVERY: none("Delivery; no money moves."),
  FULFILLED: none("Delivered; no money moves."),
  CLOSED: none("The reserve released; no figure changes."),
  CANCELLED: leads(["REVERSAL"], "A contracted order's lines are reversed (reverseOrder)."),
  REFUNDED: leads(["REVERSAL", "MARKETPLACE_REFUND"], "Its lines are reversed; the money is a fact when the refund is sent."),
};

export const PAYMENT_METHOD_FACTS: Readonly<Record<(typeof PAYMENT_METHODS)[number], Classified>> = {
  CARD: none("The facts are the same whatever the method: a sale is recorded when contracted, a refund when sent."),
  ZOHO_INVOICE: none("The facts are the same whatever the method."),
  BANK_TRANSFER: none("The facts are the same whatever the method."),
  CHEQUE: none("The facts are the same whatever the method."),
  OTHER: none("The facts are the same whatever the method."),
};

const MARKETPLACE_REFUND = leads(["MARKETPLACE_REFUND"], "Marketplace money sent back: a fact when the refund is marked SENT.");
const EDITION_REFUND = none("A cancelled NEXT edition's money: not marketplace money, and the slot sale's reversal already takes it out.");
export const REFUND_CAUSE_FACTS: Readonly<Record<(typeof REFUND_CAUSES)[number], Classified>> = {
  SPONSOR_CANCELLED: MARKETPLACE_REFUND,
  SELLER_CANCELLED: MARKETPLACE_REFUND,
  CANCELLATION_AGREED: MARKETPLACE_REFUND,
  PROBLEM_AGREED: MARKETPLACE_REFUND,
  BTG_DECIDED: MARKETPLACE_REFUND,
  BTG_REFUNDED_ORDER: MARKETPLACE_REFUND,
  PAID_AFTER_CANCELLATION: MARKETPLACE_REFUND,
  PAID_AFTER_REFUND: MARKETPLACE_REFUND,
  PAID_TWICE: MARKETPLACE_REFUND,
  PROVIDER_REFUNDED: MARKETPLACE_REFUND,
  EDITION_CANCELLED: EDITION_REFUND,
  PAID_AFTER_EDITION_CANCELLED: EDITION_REFUND,
  CAMPAIGN_CANCELLED: none("A cancelled campaign's invoiced money back to the sponsor, by credit note in Zoho Books: not marketplace money."),
};

export const REFUND_STATE_FACTS: Readonly<Record<(typeof REFUND_STATES)[number], Classified>> = {
  OPEN: none("Owed, not sent; a fact only when it is sent."),
  SENT: leads(["MARKETPLACE_REFUND"], "Sent, on the day it was sent (for a marketplace refund)."),
};

export const REFUND_METHOD_FACTS: Readonly<Record<(typeof REFUND_METHODS)[number], Classified>> = {
  BANK_TRANSFER: none("The refund fact is the same whatever the method."),
  CHEQUE: none("The refund fact is the same whatever the method."),
  CARD: none("The refund fact is the same whatever the method."),
  OTHER: none("The refund fact is the same whatever the method."),
};

export const DISPUTE_STATE_FACTS: Readonly<Record<(typeof DISPUTE_STATES)[number], Classified>> = {
  OPEN: none("Disputed, not decided; nothing changes."),
  UNDER_REVIEW: none("Disputed, not decided; nothing changes."),
  WON: none("The money stays; nothing changes."),
  LOST: leads(["REVERSAL"], "The bank took the money back: the order's (or the named lines') contract is reversed (reverseOrder)."),
};
