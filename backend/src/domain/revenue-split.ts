/**
 * The edition revenue split — P9-BE-06, spec §5.7.
 *
 * Shares from documentation/SponsorX-NEXT-Rate-Card-Decision.md (P9-PMO-01,
 * SIMULATED until BTG prices edition one — change both together).
 *
 * NOT EARNING. Earning is one athlete's NIL pay for one order, and finance
 * reconciles payouts from it; a school's share and a student pool must never
 * land in that table. This module writes RevenueSplit and nothing else.
 */

export type SplitPayeeKind = "SPONSORX" | "SCHOOL" | "STUDENT_POOL" | "EDITORIAL_FUND";

export const SPLIT_BPS: Readonly<Record<SplitPayeeKind, number>> = {
  SPONSORX: 4_000,
  SCHOOL: 3_000,
  STUDENT_POOL: 2_000,
  EDITORIAL_FUND: 1_000,
};

export const PAYEE_KINDS = Object.keys(SPLIT_BPS) as SplitPayeeKind[];

/**
 * Four amounts, in cents, that sum to `revenueCents` exactly.
 *
 * Largest remainder: floor every share, then hand the leftover cents to the
 * largest fractional parts (ties in payee order). Rounding each share on its
 * own can make the four disagree with the total by a cent — and a split that
 * does not add up is the one thing finance will notice first.
 */
export function allocateSplit(revenueCents: number): Array<{ payeeKind: SplitPayeeKind; bps: number; amountCents: number }> {
  if (!Number.isInteger(revenueCents) || revenueCents < 0) throw new RangeError("revenue must be whole, non-negative cents");
  const exact = PAYEE_KINDS.map((payeeKind) => ({ payeeKind, bps: SPLIT_BPS[payeeKind], raw: (revenueCents * SPLIT_BPS[payeeKind]) / 10_000 }));
  const lines = exact.map((e) => ({ ...e, amountCents: Math.floor(e.raw) }));
  let left = revenueCents - lines.reduce((s, l) => s + l.amountCents, 0);
  const order = [...lines].sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)));
  for (const l of order) {
    if (left === 0) break;
    l.amountCents += 1;
    left -= 1;
  }
  return lines.map(({ payeeKind, bps, amountCents }) => ({ payeeKind, bps, amountCents }));
}
