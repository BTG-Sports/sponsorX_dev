/**
 * The Campaign Order lifecycle — P5-BE-02, §21.
 *
 * DRAFT → SENT → ACCEPTED / REJECTED, ACCEPTED → ACTIVE → COMPLETED, and
 * CANCELLED until the work is done.
 *
 * WHY REJECTED IS TERMINAL AND DRAFT IS REACHABLE AGAIN FROM NEITHER. An
 * order is a contract offer with frozen terms. If an athlete rejects it, the
 * answer is a *new* order with new terms, not an edit of the one they
 * refused — otherwise the record of what was declined disappears and nobody
 * can say what changed.
 *
 * WHY CANCELLED STOPS AT ACTIVE. Same rule as the campaign: once an order is
 * COMPLETED the deliverables were made and the athlete is owed. Cancelling
 * there is a payment decision wearing a state change's clothes.
 */

export type OrderState =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

export const ORDER_STATES: readonly OrderState[] = [
  "DRAFT", "SENT", "ACCEPTED", "REJECTED", "ACTIVE", "COMPLETED", "CANCELLED",
] as const;

const TRANSITIONS: Readonly<Record<OrderState, readonly OrderState[]>> = {
  /* An order can be withdrawn before it is sent, or corrected while it is
     still a draft. Once SENT, the terms are in front of the athlete. */
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED", "CANCELLED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export class IllegalOrderTransitionError extends Error {
  readonly status = 409;
  constructor(from: OrderState, to: OrderState) {
    super(
      `A campaign order cannot go from ${from} to ${to}. Legal moves from ` +
        `${from}: ${legalOrderTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalOrderTransitionError";
  }
}

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalOrderTransitions(from: OrderState): readonly OrderState[] {
  return TRANSITIONS[from];
}
