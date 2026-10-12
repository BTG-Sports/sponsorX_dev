import { agingRows } from "@/lib/earnings-live";
import { formatCount } from "@/lib/format-count";
import { at } from "@/components/vault-stage";

/* --------------------------------------------------------------------------
   Two small Treasury pieces (P1-ART-25 split, 2026-10-12): the engraved
   figures under a dial (DialLedger) and unpaid invoices by days past due
   (Aging). Carved out of page.tsx (P1-ART-25 review, 745 lines).
   -------------------------------------------------------------------------- */

const usd0 = (cents: number) => formatCount(cents, "usd0");

/** Two engraved figures under a dial — what its share is made of. */
export function DialLedger({ rows }: { rows: { label: string; cents: number }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px border-t border-[color:var(--vault-line-soft)] pt-3">
      {rows.map((r) => (
        <div key={r.label} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--vault-muted)]">{r.label}</dt>
          <dd className="sx-vault-num mt-0.5 truncate text-[17px] leading-tight">{usd0(r.cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

const AGING_LABELS = ["Not yet due", "1–30 days late", "31–60 days late", "Over 60 days late"];

/** Unpaid sponsor invoices by days past due — /earnings/reconciliation's own
 *  cut. Amounts in the serif; over 60 days in red. */
export function Aging({ aging }: { aging: number[] }) {
  if (!aging.some((n) => n > 0)) return <p className="text-xs text-[color:var(--vault-muted)]">Nothing outstanding.</p>;
  const shares = agingRows(aging);
  return (
    <ul aria-label="Unpaid invoices by days past due" className="space-y-2.5">
      {AGING_LABELS.map((label, k) => {
        const late = k === AGING_LABELS.length - 1;
        return (
          <li key={label} className="text-[12px]">
            <span className="flex items-baseline justify-between gap-3">
              <span className={late ? "text-[color:var(--vault-late)]" : "text-[color:var(--vault-ink)]"}>{label}</span>
              <span className={`shrink-0 font-[family-name:var(--font-source-serif)] font-semibold tabular-nums ${late ? "text-[color:var(--vault-late)]" : "text-[color:var(--vault-gold-hi)]"}`}>
                {usd0(aging[k] ?? 0)}
              </span>
            </span>
            <span aria-hidden="true" className={`sx-vault-bar mt-1 !h-[5px] ${late ? "[&>span]:!bg-[color:var(--vault-late)]" : ""}`}>
              <span style={at(0.5 + k * 0.07, { width: `${shares[k]?.value ?? 0}%` })} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
