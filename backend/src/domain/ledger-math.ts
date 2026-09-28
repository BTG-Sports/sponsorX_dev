/**
 * The sequential breakdown of a marketplace order — pure, integer cents.
 *
 * documentation/SponsorX-Phase2-Ledger-Design.md §2, transcribed:
 *
 *   gross → discounts → platform fee → management fee → processing →
 *   property share → referral → reserve → available
 *
 * Every percentage rounds half up to the cent and is taken on the amount its
 * step names. Property share, available and the athlete's cut are
 * REMAINDERS, so a line's parts always sum exactly to its net sale — no cent
 * is created or lost. Processing is the order's (rate on the order total,
 * plus its fixed amount once), allocated to lines by net with the last line
 * taking the remainder.
 */
export const RULE_KINDS = ["PLATFORM_FEE", "MANAGEMENT_FEE", "PROCESSING", "REFERRAL", "RESERVE", "TEAM_SHARE"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/** A rule as applied: its rate, its fixed amount, and which version it was. */
export type AppliedRule = { ruleId: string | null; ruleKey: string | null; version: number | null; bps: number; fixedCents: number };
export const NO_RULE: AppliedRule = { ruleId: null, ruleKey: null, version: null, bps: 0, fixedCents: 0 };

/** amount × bps / 10000, rounded half up. Non-negative amounts only. */
export function pct(amountCents: number, bps: number): number {
  return Math.floor((amountCents * bps + 5_000) / 10_000);
}

/** part × numerator / denominator, rounded half up. */
function share(part: number, numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.floor((part * numerator * 2 + denominator) / (2 * denominator));
}

export type LineInput = {
  lineId: string;
  grossCents: number;
  discountCents?: number;
  /** Rules for this line's property and sponsor. PROCESSING is order-level. */
  rules: Record<Exclude<RuleKind, "PROCESSING">, AppliedRule>;
  /** A roster athlete's item: the team's cut in bps (roster value, else the TEAM_SHARE rule). */
  athleteId?: string | null;
  teamShareBps?: number | null;
};

export type LineBreakdown = {
  lineId: string;
  grossCents: number; discountCents: number; netCents: number;
  platformFeeCents: number; managementFeeCents: number; processingCents: number;
  propertyShareCents: number; referralCents: number; reserveCents: number; availableCents: number;
  athleteId: string | null; teamShareBps: number | null; teamAvailableCents: number | null; teamReserveCents: number | null;
  rules: Record<RuleKind, AppliedRule>;
};

export class NegativeShareError extends Error {
  readonly status = 422;
  constructor(lineId: string) {
    super(`Line ${lineId}: the fees exceed the sale — the property's share would be negative. Check the commission rules.`);
    this.name = "NegativeShareError";
  }
}

export function breakdownOrder(lines: LineInput[], processing: AppliedRule): LineBreakdown[] {
  const nets = lines.map((l) => l.grossCents - (l.discountCents ?? 0));
  const total = nets.reduce((s, n) => s + n, 0);
  const processingTotal = lines.length ? pct(total, processing.bps) + processing.fixedCents : 0;
  let allocated = 0;

  return lines.map((l, i) => {
    const net = nets[i]!;
    const processingCents = i === lines.length - 1 ? processingTotal - allocated : share(processingTotal, net, total);
    allocated += processingCents;
    const platformFeeCents = pct(net, l.rules.PLATFORM_FEE.bps) + l.rules.PLATFORM_FEE.fixedCents;
    const managementFeeCents = pct(net, l.rules.MANAGEMENT_FEE.bps) + l.rules.MANAGEMENT_FEE.fixedCents;
    const propertyShareCents = net - platformFeeCents - managementFeeCents - processingCents;
    if (propertyShareCents < 0) throw new NegativeShareError(l.lineId);
    const referralCents = pct(propertyShareCents, l.rules.REFERRAL.bps);
    const reserveCents = pct(propertyShareCents, l.rules.RESERVE.bps);
    const availableCents = propertyShareCents - referralCents - reserveCents;
    const split = l.athleteId ? (l.teamShareBps ?? l.rules.TEAM_SHARE.bps) : null;
    return {
      lineId: l.lineId,
      grossCents: l.grossCents, discountCents: l.discountCents ?? 0, netCents: net,
      platformFeeCents, managementFeeCents, processingCents, propertyShareCents, referralCents, reserveCents, availableCents,
      athleteId: l.athleteId ?? null,
      teamShareBps: split,
      teamAvailableCents: split === null ? null : pct(availableCents, split),
      teamReserveCents: split === null ? null : pct(reserveCents, split),
      rules: { ...l.rules, PROCESSING: processing },
    };
  });
}
