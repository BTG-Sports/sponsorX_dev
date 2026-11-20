import type { ReactNode } from "react";

import { orderSheet, type OrderSheetInput } from "@/lib/order-details";

/* --------------------------------------------------------------------------
   An athlete's order, laid out like the Athlete Campaign Order template —
   POL-FE-116 (polish.md §116).

   The template's table first (Order #, Athlete, Sponsor, Campaign, Job,
   Prompt, Deliverable, Due / publish window, Compensation, Exclusivity,
   Disclosure, Approval, Payment timing), then each job's deliverable in
   full, then the template's numbered sections: content and usage rights,
   paid media, exclusivity, compensation and payment.

   One component for the three places an order is read, so it reads the same
   in each: the sponsor's builder before saving, the athlete's offer and
   order pages, and BTG's campaign page. No hooks and no "use client": a
   server page and a client island can both render it. Colours are the theme
   tokens, so it sits on the Stadium Board, the Arena and Mission Control
   alike. `edit` adds an Edit control beside a block (the builder's summary).
   -------------------------------------------------------------------------- */

export type OrderSheetBlock = "head" | "deliverables" | "usage" | "paid" | "exclusivity" | "payment";

const TITLE = "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted";

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-line-soft">
      {rows.map((r) => (
        <div key={r.label} className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
          <dt className="text-xs text-muted">{r.label}</dt>
          <dd className="min-w-0 whitespace-pre-wrap text-sm font-medium text-text [overflow-wrap:anywhere]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OrderSheet({
  input,
  heading = "Athlete Campaign Order",
  edit,
  className = "",
}: {
  input: OrderSheetInput;
  /** The sheet's own title; "" for none (the page already has one). */
  heading?: string;
  /** The control beside a block's title, e.g. an Edit button (the builder). */
  edit?: (block: OrderSheetBlock) => ReactNode;
  className?: string;
}) {
  const sheet = orderSheet(input);
  return (
    <section aria-label={heading || "Order details"} data-order-sheet="" className={`min-w-0 space-y-6 ${className}`}>
      <div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          {heading ? <h2 className="text-sm font-semibold tracking-tight text-text">{heading}</h2> : <span />}
          {edit?.("head")}
        </div>
        <div className="mt-1">
          <Rows rows={sheet.head} />
        </div>
      </div>

      <div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h3 className={TITLE}>1. Deliverable requirements</h3>
          {edit?.("deliverables")}
        </div>
        <ul className="mt-2 space-y-3">
          {sheet.deliverables.map((d) => (
            <li key={d.jobId} className="min-w-0 rounded-lg border border-line-soft px-3 py-2.5">
              <p className="text-sm font-semibold text-text">{d.title}</p>
              {d.summary && <p className="mt-0.5 text-xs text-muted [overflow-wrap:anywhere]">{d.summary}</p>}
              <div className="mt-1.5">
                <Rows rows={d.rows} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Nothing is published before the required approval. Every post carries the campaign&rsquo;s tracking link or code and the disclosure above.
        </p>
      </div>

      {sheet.sections.map((s, i) => (
        <div key={s.id}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className={TITLE}>
              {i + 2}. {s.title}
            </h3>
            {edit?.(s.id as OrderSheetBlock)}
          </div>
          {s.note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.note}</p>}
          <div className="mt-1">
            <Rows rows={s.rows} />
          </div>
        </div>
      ))}
    </section>
  );
}
