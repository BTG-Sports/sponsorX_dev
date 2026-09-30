import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { OrderPayButton, PaymentRefresher } from "@/components/order-payment";
import { ShopSteps } from "@/components/shop-bits";
import { ShopCancelOrder } from "@/components/shop-checkout";
import {
  TEST_PROVIDER_BADGE,
  orderTracker,
  paymentHint,
  paymentView,
  type ApiOrderPayment,
  type PaymentView,
  type TrackerStep,
} from "@/lib/order-payment-live";
import { canCancel, fmtDay, fmtStamp, orderCopy, orderRef, usd, type ApiOrder } from "@/lib/shop-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Order — 2S4-FE-02, payment 2S5-FE-05. One marketplace order: its state,
   the order-progress tracker, lines, subtotal, fees and total, why BTG is
   reviewing it (if it is), BTG's decision notes, the Payment card (designs
   E1 due / E2 confirming / E3 paid / E4 failed) and Cancel. With ?placed=1
   (checkout's redirect) it is the Confirmation step; ?payment=returned is the
   provider sending the browser back — the card reads the same API either way.

   Reads  GET /marketplace-orders/:id
          GET /marketplace-orders/:id/payment   (due, canPay, testProvider, latest attempt)
   Writes (ShopCancelOrder → actions.ts)
          POST /marketplace-orders/:id/transition {to:"CANCELLED"} — the only
          move a sponsor may make, and only before payment.
          (OrderPayButton → payment-actions.ts)
          POST /marketplace-orders/:id/pay → redirect to the provider's page.

   While the provider confirms (latest PROCESSING) the page refreshes itself
   every 3s until the order is PAID. Honest gaps: no receipt or invoice link
   (the API returns none), no per-line fee breakdown for sponsors (the
   financials route is BTG/finance only) — the order's own feesCents is shown.
   Roles. SPONSOR_ADMIN may pay and cancel; SPONSOR_ANALYST reads.
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

  const [res, payRes] = await Promise.all([
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}`),
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/payment`).catch(() => null),
  ]);
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
  /* A failed payment read degrades the card to "couldn't be loaded", never the page. */
  const payment = payRes?.ok ? ((await payRes.json()) as ApiOrderPayment) : null;
  const pay = paymentView(o.state, payment);
  const steps = orderTracker(o, pay, payment);

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
            {o.state === "PENDING_APPROVAL"
              ? "Nothing was charged — you pay by card once BTG approves it."
              : "Nothing was charged yet — pay the total by card below."}
          </p>
        </Card>
      )}

      {steps && <OrderTracker steps={steps} />}

      {pay.banner && <PaymentBanner banner={pay.banner} kind={pay.kind} />}

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
          <p className="text-[11px] text-muted">{paymentHint(pay.kind) ?? c.hint}</p>
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
          {pay.kind !== "none" && (
            <PaymentCard orderId={o.id} totalCents={payment?.amountCents ?? o.totalCents} pay={pay} payment={payment} canWrite={canWrite} />
          )}
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

/* ------------------------------------------------------------ the tracker */

const STEP_DOT: Record<TrackerStep["tone"], string> = {
  accent: "border-accent/40 bg-accent/12 text-accent",
  primary: "border-primary/60 bg-primary/12 text-primary-soft",
  warn: "border-warn/60 bg-warn/12 text-warn",
  danger: "border-danger/60 bg-danger/12 text-danger",
  neutral: "border-line text-faint",
};
const STEP_NOTE: Record<TrackerStep["tone"], string> = {
  accent: "text-muted",
  primary: "text-primary-soft",
  warn: "text-warn",
  danger: "text-danger",
  neutral: "text-faint",
};

function OrderTracker({ steps }: { steps: TrackerStep[] }) {
  return (
    <Card className="p-4">
      <p className="mb-3 text-[11px] uppercase tracking-wide text-muted">Order progress</p>
      <ol className="grid gap-3 sm:grid-cols-5">
        {steps.map((s, i) => {
          const tone = s.state === "todo" ? "neutral" : s.state === "done" ? "accent" : s.tone;
          return (
            <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="flex items-center gap-2.5 sm:flex-col sm:items-start">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${STEP_DOT[tone]}`} aria-hidden="true">
                {s.state === "done" ? "✓" : s.state === "current" && s.tone === "danger" ? "!" : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-xs ${s.state === "todo" ? "text-faint" : s.state === "current" ? "font-semibold" : "font-medium"}`}>
                  {s.label}
                  <span className="sr-only">{s.state === "done" ? " — done" : s.state === "current" ? " — current step" : " — not yet"}</span>
                </span>
                {s.note && <span className={`block text-[11px] ${STEP_NOTE[s.state === "done" ? "accent" : tone]}`}>{s.note}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------ the payment */

const BANNER_TONE: Record<string, string> = {
  due: "border-warn/40 bg-warn/8",
  processing: "border-primary/40 bg-primary/8",
  paid: "border-accent/40 bg-accent/8",
  failed: "border-danger/40 bg-danger/8",
};
const BANNER_TITLE: Record<string, string> = {
  due: "text-warn",
  processing: "text-primary-soft",
  paid: "text-accent",
  failed: "text-danger",
};

function PaymentBanner({ banner, kind }: { banner: NonNullable<PaymentView["banner"]>; kind: PaymentView["kind"] }) {
  return (
    <div
      role={banner.role}
      aria-live={banner.role === "alert" ? "assertive" : banner.role === "status" ? "polite" : undefined}
      aria-label={banner.role === "region" ? "Payment" : undefined}
      className={`rounded-xl border px-5 py-4 ${BANNER_TONE[kind] ?? "border-line bg-surface"}`}
    >
      <p className={`text-sm font-semibold ${BANNER_TITLE[kind] ?? ""}`}>{banner.title}</p>
      <p className="mt-1 text-xs text-muted">{banner.text}</p>
      {banner.detail && <p className="mt-1.5 font-mono text-[11px] text-muted">{banner.detail}</p>}
    </div>
  );
}

function PaymentCard({
  orderId,
  totalCents,
  pay,
  payment,
  canWrite,
}: {
  orderId: string;
  totalCents: number;
  pay: PaymentView;
  payment: ApiOrderPayment | null;
  canWrite: boolean;
}) {
  const open = pay.kind === "due" || pay.kind === "failed";
  return (
    <Card className={`space-y-3 ${open && pay.cta ? "border-primary/40" : ""}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted">Payment</p>
      <div className="flex justify-between text-xs">
        <span className="text-muted">Order total</span>
        <span className="font-semibold tabular-nums">{usd(totalCents)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Status</span>
        <Badge tone={pay.tone}>{pay.status}</Badge>
      </div>

      {pay.cta && canWrite && (
        <OrderPayButton orderId={orderId} label={pay.cta.label} ariaLabel={pay.cta.ariaLabel} disabled={!payment?.canPay} />
      )}
      {pay.cta && !canWrite && (
        <p className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          A Sponsor Admin in your organisation pays this order by card. You can follow its progress here.
        </p>
      )}
      {pay.note && (!pay.cta || canWrite) && <p className="text-[11px] text-muted">{pay.note}</p>}
      {pay.poll && <PaymentRefresher />}
      {payment?.testProvider && (pay.cta || pay.kind === "processing") && (
        <p>
          <Badge>{TEST_PROVIDER_BADGE}</Badge>
        </p>
      )}
    </Card>
  );
}
