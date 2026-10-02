/**
 * 2S4-BE-10 — BTG's manual "Mark paid" needs how it was paid, a reference and
 * the date received. Suites about money, not payment, mark an order paid by
 * hand with this body (POST /marketplace-orders/:id/transition, as BTG admin
 * or Finance).
 */
export const manualPayment = (reference = "TEST-WIRE-0001") => ({
  method: "BANK_TRANSFER" as const,
  reference,
  receivedOn: new Date().toISOString().slice(0, 10),
});

/** The transition body for `to`: PAID carries the manual payment. */
export const transitionBody = (to: string) => (to === "PAID" ? { to, payment: manualPayment() } : { to });
