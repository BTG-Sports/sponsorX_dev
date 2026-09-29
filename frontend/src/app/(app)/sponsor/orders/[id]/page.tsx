import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { ShopPaymentNote, ShopSteps } from "@/components/shop-bits";
import { ShopCancelOrder } from "@/components/shop-checkout";
import { canCancel, fmtDay, fmtStamp, orderCopy, orderRef, usd, type ApiOrder } from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Order — 2S4-FE-02. One marketplace order: its state, lines, subtotal, fees
   and total, why BTG is reviewing it (if it is), BTG's decision notes, and
   Cancel. With ?placed=1 (checkout's redirect) it is the Confirmation step.

   Reads  GET /marketplace-orders/:id
   Writes (ShopCancelOrder → actions.ts)
          POST /marketplace-orders/:id/transition {to:"CANCELLED"} — the only
          move a sponsor may make, and only before payment.

   Honest gaps. No payment provider: an approved order says BTG will invoice,
   and no payment is taken here. No per-line fee breakdown for sponsors (the
   financials route is BTG/finance only) — the order's own feesCents is shown.
   Roles. SPONSOR_ADMIN may cancel; SPONSOR_ANALYST reads.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePortalAccess("sponsor");
  const canWrite = actor.roles.includes("SPONSOR_ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const placed = sp.placed === "1";

  const back = (
    <Link href="/sponsor/orders" className="text-xs text-muted hover:text-text">
      ← All orders
    </Link>
  );

  const res = await apiFetch(`/marketplace-orders/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState
          mark="inbox"
          title="This order isn't available"
          hint="It doesn't exist, or it belongs to another sponsor."
          action={{ label: "Go to orders", href: "/sponsor/orders" }}
        />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  const o = (await res.json()) as ApiOrder;
  const c = orderCopy(o.state);
  const showPayment = o.state === "APPROVED" || o.state === "AWAITING_PAYMENT";

  return (
    <div className="space-y-6">
      {back}
      {placed && <ShopSteps active="confirmed" />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            Order <span className="font-mono">{orderRef(o.id)}</span>
            <Badge tone={c.tone}>{c.label}</Badge>
          </h1>
          <p className="mt-1 text-xs text-muted">
            Placed {fmtStamp(o.createdAt)}
            {o.contractedAt ? ` · confirmed ${fmtStamp(o.contractedAt)}` : ""}
          </p>
        </div>
      </div>

      {placed && (
        <Card className="border-accent/30 bg-accent/8">
          <p className="text-xs text-accent">
            {o.state === "PENDING_APPROVAL"
              ? "Your order is placed and sent to BTG for review. The items stay yours while BTG reviews it."
              : "Your order is placed and confirmed."}{" "}
            Nothing was charged — BTG will invoice you.
          </p>
        </Card>
      )}

      {o.requiresApproval && o.approvalReasons.length > 0 && (
        <Card className="border-warn/30 bg-warn/8">
          <p className="text-xs font-semibold text-warn">BTG reviews this order because:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-warn">
            {o.approvalReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      {o.decisionNotes && (
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-muted">
            BTG&rsquo;s note{o.decidedAt ? ` · ${fmtStamp(o.decidedAt)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-line text-xs">{o.decisionNotes}</p>
        </Card>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Lines</h2>
          <ul className="space-y-2">
            {o.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{l.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {l.quantity} × {usd(l.unitPriceCents)} · {fmtDay(l.startsOn)} – {fmtDay(l.endsOn)}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums">{usd(l.lineTotalCents)}</p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">{c.hint}</p>
        </section>

        <aside className="mt-5 space-y-3 lg:mt-0">
          <Card className="space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">Totals</p>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Subtotal</span>
              <span className="tabular-nums">{usd(o.subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Fees</span>
              <span className="tabular-nums">{usd(o.feesCents)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-line-soft pt-2">
              <span className="text-xs text-muted">Total</span>
              <span className="text-lg font-semibold tabular-nums">{usd(o.totalCents)}</span>
            </div>
          </Card>
          {showPayment && <ShopPaymentNote />}
          {canWrite && canCancel(o.state) && (
            <Card className="space-y-2">
              <p className="text-xs text-muted">You can cancel until the order is paid.</p>
              <ShopCancelOrder orderId={o.id} state={o.state} />
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
