/**
 * The forward order of a Zoho Books invoice — 2S8-SEC-04.
 *
 * Zoho Books signs its invoice webhook but puts no timestamp in it, so a
 * correctly signed delivery captured last month verifies today. Replayed, it
 * would have overwritten the mirror wholesale (invoice.ts: "Zoho is right")
 * and rolled a paid invoice back to sent. The defence is to refuse any
 * payload that would move the STORED state backwards. Only the stored row
 * and the payload are compared; no clock is involved, because there is none
 * to trust.
 *
 * The order, from Zoho's own vocabulary (the contract's draft | sent |
 * overdue | paid | void, plus the words Books also uses):
 *
 *   draft  <  sent / viewed / unpaid  <  partially_paid / overdue  <  paid
 *
 * and `void` is a dead end that any unpaid invoice can reach. `paid` and
 * `void` are terminal. Once paid, only another paid payload is applied, so a
 * corrected amount or date still lands. Once void, only void. A genuine move
 * backwards in Zoho (a payment deleted, a void turned back into a draft) is
 * held: refused, audited, and left for BTG to apply by hand. That is what a
 * replay would look like, and telling the two apart would need the
 * timestamp Zoho does not send.
 *
 * Moves within a rank (overdue ↔ partially paid) are not backwards. A word
 * we do not know is applied while the stored invoice is still open, because
 * Zoho is right and the word stays visible. It is never applied over a paid
 * or void one.
 */
import { zohoInvoicePaid } from "./marketplace-order-rules";

const RANK: Readonly<Record<string, number>> = {
  draft: 0,
  sent: 1, viewed: 1, unpaid: 1,
  partially_paid: 2, overdue: 2,
};
const PAID = 3;

type State = { status: string; balance?: number | null };

/** paid, void, or the rank of an open status; null for a word we don't know. */
export function invoiceStage(s: State): number | "paid" | "void" | null {
  const word = String(s.status ?? "").trim().toLowerCase();
  if (word === "void") return "void";
  if (zohoInvoicePaid(word, s.balance)) return "paid";
  return RANK[word] ?? null;
}

/**
 * Why applying `incoming` over `stored` would move the invoice backwards,
 * or null when it may be applied. No stored row means nothing to roll back.
 */
export function backwardsMove(stored: State | null, incoming: State): string | null {
  if (!stored) return null;
  const from = invoiceStage(stored);
  const to = invoiceStage(incoming);
  const said = `${incoming.status} after ${stored.status}`;
  if (from === "void") return to === "void" ? null : `${said}: a void invoice is never reopened by a webhook`;
  if (from === "paid") return to === "paid" ? null : `${said}: a paid invoice never goes back`;
  if (to === "void" || to === "paid" || to === null || from === null) return null;
  return to < from ? `${said}: an older state than the one stored` : null;
}

/** The ranks, for the tests: open states in order, then paid. */
export const INVOICE_ORDER = { ...RANK, paid: PAID } as const;
