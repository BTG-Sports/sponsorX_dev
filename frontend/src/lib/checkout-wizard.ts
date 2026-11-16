import { billingIssues, gateHint, gateStatus, type ApiOrderTerms, type BillingDraft } from "@/lib/checkout-gate";

/* --------------------------------------------------------------------------
   POL-FE-93 — checkout as a four-step wizard. The owner found the old page,
   with every section open at once, confusing. Now one question is asked
   at a time, as on a plain shop checkout:

     1. Items        what you're buying, the hold, and the total
     2. Invoice      who the invoice and receipts go to
     3. Terms        read the order terms and tick one box
     4. Confirm      everything once more, what happens next, then Place order

   These are the wizard's words and rules, kept out of the client island
   (components/sponsor-checkout/checkout-wizard.tsx) so they can be tested.
   The contract gate is the same as before (lib/checkout-gate.ts gateStatus):
   the wizard only decides which step is on screen, and the API decides
   whether the order can be placed.
   -------------------------------------------------------------------------- */

export type WizardStep = "review" | "billing" | "terms" | "place";

export type WizardState = { terms: ApiOrderTerms | null; billing: BillingDraft; accepted: boolean };

export const WIZARD_STEPS: ReadonlyArray<{ key: WizardStep; short: string; title: string; lead: string; next: string }> = [
  {
    key: "review",
    short: "Items",
    title: "Check what you're buying",
    lead: "These items are held for you, and nobody else can buy them while the clock runs. Check them, then continue.",
    next: "Continue to invoice",
  },
  {
    key: "billing",
    short: "Invoice",
    title: "Who gets the invoice?",
    lead: "Invoices and receipts for this order go to this person. You won't be asked for card or bank details here.",
    next: "Continue to terms",
  },
  {
    key: "terms",
    short: "Terms",
    title: "Agree to the order terms",
    lead: "These are the terms this order is placed under. Read them, then tick the box below.",
    next: "Continue to confirm",
  },
  {
    key: "place",
    /* not "Place order": that name belongs to the one button that places it (e2e finds it by name) */
    short: "Confirm",
    title: "Check everything and place your order",
    lead: "Nothing is charged when you place it. You pay by card later, from the order page.",
    next: "Place order",
  },
];

export const stepIndex = (s: WizardStep): number => WIZARD_STEPS.findIndex((x) => x.key === s);

/** What keeps the sponsor on this step, in one sentence, or null when they may go on. */
export function stepProblem(step: WizardStep, s: WizardState): string | null {
  if (step === "review") return null;
  if (step === "billing") {
    const issues = billingIssues(s.billing);
    if (issues.reference) return issues.reference;
    if (issues.name && issues.email) return "Add the name and email invoices go to.";
    if (issues.name) return "Add the name invoices go to.";
    if (issues.email) return s.billing.email.trim() ? "Check the email address. It should look like name@company.com." : "Add the email invoices go to.";
    return null;
  }
  if (step === "terms") {
    if (!s.terms) return "The order terms aren't available right now, so the order can't be placed yet. Your hold stands until it runs out. Try again shortly, or ask BTG.";
    return s.accepted ? null : "Tick the box to accept the order terms.";
  }
  return gateHint(gateStatus(s).missing);
}

/** The furthest step the sponsor may open: any step before it, and the first one still unfinished. */
export function reachable(s: WizardState): number {
  for (let i = 0; i < WIZARD_STEPS.length - 1; i++) if (stepProblem(WIZARD_STEPS[i].key, s)) return i;
  return WIZARD_STEPS.length - 1;
}

/**
 * What placing the order leads to, in three plain steps, for the timeline on
 * the last step. `overLimit` comes from the spending limit (lib/checkout-gate
 * limitLine); null when the API sent no limit, and then both cases are said.
 * The same rules as APPROVAL_CONDITION and checkoutPaymentWords (POL-FE-04).
 */
export function afterPlacing(o: { paymentsOpen?: boolean; overLimit: boolean | null }): { title: string; text: string }[] {
  const approve =
    o.overLimit === true
      ? { title: "BTG checks it", text: "It's above your spending limit, so BTG looks at it before it's approved. The items stay yours while they do." }
      : o.overLimit === false
        ? { title: "It's approved", text: "It's within your spending limit, so it's approved straight away, unless a seller asks to accept it first (they have 48 hours)." }
        : { title: "It's approved", text: "Within your spending limit it's approved straight away; above it, BTG checks it first. A seller may ask to accept it first (they have 48 hours)." };
  const pay =
    o.paymentsOpen === false
      ? { title: "You pay by card once it opens", text: "Card payment isn't open yet. Your order is held for you with no pay-by date, and we'll email you as soon as you can pay." }
      : { title: "You pay by card", text: "Pay the full total from the order page, on the payment provider's own page, within 3 days." };
  return [{ title: "You place the order", text: "Nothing is charged now, and the items stay yours." }, approve, pay];
}
