/* --------------------------------------------------------------------------
   The checkout's contract gate — 2S4-FE-02, "Build checkout and contract
   gate". The pure pieces: what a live hold carries for the gate, the billing
   contact's checks, and whether Place order may be pressed.

   Wire shape is the backend's (backend/src/domain/reservation.ts
   getReservation → `checkout`, order-terms.ts): the tenant's current
   MARKETPLACE_ORDER terms (body + hash, null when none is servable), the
   sponsor's name, and the primary SponsorContact to prefill billing with.
   POST /marketplace-orders refuses (422) without the acceptance or the
   billing contact, so these checks only spare the sponsor a round trip —
   the API decides.
   -------------------------------------------------------------------------- */

export type ApiOrderTerms = { id: string; kind: string; version: number; bodyHash: string; body: string };

export type ApiCheckout = {
  terms: ApiOrderTerms | null;
  sponsorName: string | null;
  billingContact: { name: string; email: string } | null;
};

export type BillingDraft = { name: string; email: string; reference: string };

/** The billing step starts from the sponsor's primary contact, or empty. */
export function billingDraftFrom(prefill: ApiCheckout["billingContact"]): BillingDraft {
  return { name: prefill?.name ?? "", email: prefill?.email ?? "", reference: "" };
}

/**
 * A card number typed into the PO / reference box — a COPY of
 * backend/src/domain/marketplace-order-rules.ts looksLikeCardNumber
 * (Addendum B: the frontend cannot import the backend). 13–19 digits,
 * spaces and dashes ignored, passing the Luhn check.
 */
export function looksLikeCardNumber(s: string): boolean {
  const digits = s.replace(/[\s-]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the billing step still needs, field by field. Empty means complete. */
export function billingIssues(b: BillingDraft): { name?: string; email?: string; reference?: string } {
  const out: { name?: string; email?: string; reference?: string } = {};
  const name = b.name.trim();
  const email = b.email.trim();
  const ref = b.reference.trim();
  if (!name) out.name = "Enter the name invoices go to.";
  else if (name.length > 200) out.name = "Keep the name to 200 characters.";
  if (!email) out.email = "Enter the email invoices go to.";
  else if (email.length > 320 || !EMAIL.test(email)) out.email = "Enter an email address like name@company.com.";
  if (ref.length > 100) out.reference = "Keep the reference to 100 characters.";
  else if (ref && looksLikeCardNumber(ref)) out.reference = "That looks like a card number. SponsorX never takes card or bank numbers — enter a PO or your own reference.";
  return out;
}

export function billingComplete(b: BillingDraft): boolean {
  return Object.keys(billingIssues(b)).length === 0;
}

/** The acceptance checkbox's words. */
export function acceptLabel(sponsorName: string | null): string {
  return `I accept the order terms on behalf of ${sponsorName?.trim() || "my organisation"}`;
}

/**
 * Whether Place order may be pressed, and if not, what is still missing —
 * in the order the steps come. The button stays disabled until both the
 * billing contact and the acceptance are complete.
 */
export function gateStatus(g: { terms: ApiOrderTerms | null; billing: BillingDraft; accepted: boolean }): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!g.terms) missing.push("the order terms, which aren't available right now");
  if (!billingComplete(g.billing)) missing.push("the billing contact");
  if (g.terms && !g.accepted) missing.push("your acceptance of the order terms");
  return { ready: missing.length === 0, missing };
}

/** The sentence under a disabled Place order button. */
export function gateHint(missing: string[]): string | null {
  if (!missing.length) return null;
  const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `To place the order, complete ${list}.`;
}

/** The body the place-order action sends, trimmed. The terms' hash is added by the action, from the body shown. */
export function placeOrderPayload(g: { reservationId: string; agreementId: string; billing: BillingDraft }) {
  const reference = g.billing.reference.trim();
  return {
    reservationId: g.reservationId,
    agreementId: g.agreementId,
    billing: { name: g.billing.name.trim(), email: g.billing.email.trim(), ...(reference ? { reference } : {}) },
  };
}

/** The approval condition, in one line, wherever checkout and the order page state it. */
export const APPROVAL_CONDITION = "BTG approves the order, then you pay the full total by card.";

/* ------------------------------------------------- the record, once placed */

/** Who accepted the order terms, when, and which version — on GET /marketplace-orders/:id. */
export type ApiOrderAcceptance = {
  acceptedAt: string;
  userId: string | null;
  bodyHash: string;
  user: { email: string } | null;
  agreement: { kind: string; version: number };
};

/** The contract gate's fields on an order, as the sponsor's and BTG's order views read them. */
export type OrderGateRecord = {
  billingName: string | null;
  billingEmail: string | null;
  billingReference: string | null;
  acceptance: ApiOrderAcceptance | null;
};

/** "Marketplace order terms, version 1". */
export function termsLabel(a: { kind: string; version: number }): string {
  const name = a.kind === "MARKETPLACE_ORDER" ? "Marketplace order terms" : a.kind;
  return `${name}, version ${a.version}`;
}

/** The order's billing contact, or null for an order placed before the gate. */
export function billingLines(o: OrderGateRecord): string[] | null {
  if (!o.billingName || !o.billingEmail) return null;
  return [o.billingName, o.billingEmail, ...(o.billingReference ? [`Reference ${o.billingReference}`] : [])];
}
