"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent, type ReactNode } from "react";

import { reserveAction } from "@/app/(app)/sponsor/cart/actions";
import { placeOrderAction, releaseHoldAction } from "@/app/(app)/sponsor/checkout/actions";
import { cancelOrderAction } from "@/app/(app)/sponsor/orders/[id]/actions";
import { ShopRefusal, ShopSteps } from "@/components/shop-bits";
import {
  acceptLabel,
  APPROVAL_CONDITION,
  billingDraftFrom,
  billingIssues,
  gateHint,
  gateStatus,
  termsLabel,
  type ApiCheckout,
  type BillingDraft,
} from "@/lib/checkout-gate";
import { usd, type ShopResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — the buying buttons: Reserve & check out (cart, and "hold
   again" after a hold ends), the checkout's contract gate — billing
   contact, order terms, Place order / Release hold — and Cancel order
   (order detail). Each calls its server action; a success redirects
   (reserve, place, release) or refreshes (cancel), a refusal is listed with
   every reason the API gave.
   -------------------------------------------------------------------------- */

type Refusal = { message: string; reasons: string[] } | null;

function useShopAction() {
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [pending, begin] = useTransition();
  const run = (fn: () => Promise<ShopResult>, onOk?: () => void) => {
    setRefusal(null);
    begin(async () => {
      const r = await fn();
      /* A redirecting action (reserve, place, release) navigates away and
         may resolve with nothing — there is then nothing to show here. */
      if (!r) return;
      if (r.ok) onOk?.();
      else setRefusal({ message: r.message, reasons: r.reasons });
    });
  };
  return { refusal, pending, run };
}

const primary = "rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40";
const secondary = "rounded-lg border border-line px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40";

export function ShopReserveButton({ label = "Reserve & check out", disabled }: { label?: string; disabled?: boolean }) {
  const { refusal, pending, run } = useShopAction();
  return (
    <div className="space-y-2">
      <button type="button" disabled={disabled || pending} onClick={() => run(() => reserveAction())} className={primary}>
        {pending ? "Holding the items…" : label}
      </button>
      {refusal && <ShopRefusal {...refusal} />}
    </div>
  );
}

const fieldCls =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";

/**
 * The checkout's contract gate (2S4-FE-02): billing contact → order terms →
 * Place order. Place order stays disabled until the billing contact is
 * complete and the terms are accepted. The terms' body goes back to the
 * server action exactly as rendered here, so the fingerprint the API checks
 * is of the words on this screen. `children` is step 1 (the hold's countdown,
 * lines and summary, rendered by the page), so the step strip above it can
 * follow where the sponsor has got to.
 */
export function ShopCheckoutGate({
  reservationId,
  checkout,
  subtotalCents,
  children,
}: {
  reservationId: string;
  checkout: ApiCheckout;
  subtotalCents: number;
  children: ReactNode;
}) {
  const [billing, setBilling] = useState<BillingDraft>(() => billingDraftFrom(checkout.billingContact));
  const [touched, setTouched] = useState<Partial<Record<keyof BillingDraft, boolean>>>({});
  const [accepted, setAccepted] = useState(false);
  const { refusal, pending, run } = useShopAction();
  const { terms } = checkout;
  const issues = billingIssues(billing);
  const billingDone = Object.keys(issues).length === 0;
  const gate = gateStatus({ terms, billing, accepted });
  const hint = gateHint(gate.missing);
  const step = !billingDone ? "billing" : terms && !accepted ? "terms" : "place";

  const set = (k: keyof BillingDraft) => (e: ChangeEvent<HTMLInputElement>) => setBilling((b) => ({ ...b, [k]: e.target.value }));
  const blur = (k: keyof BillingDraft) => () => setTouched((t) => ({ ...t, [k]: true }));
  const shown = (k: keyof BillingDraft) => (touched[k] ? issues[k] : undefined);

  return (
    <div className="space-y-6">
      <ShopSteps active={step} />
      {children}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <div className="space-y-4">
          <section aria-labelledby="checkout-billing" className="space-y-3 rounded-xl border border-line bg-surface px-4 py-4">
            <h2 id="checkout-billing" className="text-sm font-semibold tracking-tight">
              2 · Billing contact{billingDone && <span className="ml-1.5 text-accent">✓</span>}
            </h2>
            <p className="text-xs text-muted">
              Invoices and receipts for this order go to this contact.{" "}
              {checkout.billingContact ? "Filled in from your primary contact — change it if someone else handles billing." : "You have no contact on file, so add one here."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium text-muted">
                Name
                <input value={billing.name} onChange={set("name")} onBlur={blur("name")} required maxLength={200} autoComplete="name"
                  aria-invalid={shown("name") ? true : undefined} aria-describedby={shown("name") ? "billing-name-err" : undefined} className={fieldCls} />
                {shown("name") && <span id="billing-name-err" className="mt-1 block text-[11px] text-danger">{shown("name")}</span>}
              </label>
              <label className="block text-[11px] font-medium text-muted">
                Email
                <input type="email" value={billing.email} onChange={set("email")} onBlur={blur("email")} required maxLength={320} autoComplete="email"
                  aria-invalid={shown("email") ? true : undefined} aria-describedby={shown("email") ? "billing-email-err" : undefined} className={fieldCls} />
                {shown("email") && <span id="billing-email-err" className="mt-1 block text-[11px] text-danger">{shown("email")}</span>}
              </label>
              <label className="block text-[11px] font-medium text-muted sm:col-span-2">
                PO number or your reference <span className="font-normal text-faint">(optional)</span>
                <input value={billing.reference} onChange={set("reference")} onBlur={blur("reference")} maxLength={100} autoComplete="off"
                  aria-invalid={issues.reference ? true : undefined} aria-describedby={issues.reference ? "billing-ref-err" : undefined} className={fieldCls} />
                {issues.reference && <span id="billing-ref-err" className="mt-1 block text-[11px] text-danger">{issues.reference}</span>}
              </label>
            </div>
            <p className="text-[11px] text-faint">No card or bank details are asked for here. You pay by card on the payment provider&rsquo;s own page.</p>
          </section>

          <section aria-labelledby="checkout-terms" className="space-y-3 rounded-xl border border-line bg-surface px-4 py-4">
            <h2 id="checkout-terms" className="text-sm font-semibold tracking-tight">
              3 · Order terms{terms && accepted && <span className="ml-1.5 text-accent">✓</span>}
            </h2>
            {terms ? (
              <>
                <div
                  role="document"
                  tabIndex={0}
                  aria-label={termsLabel(terms)}
                  className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line-soft bg-surface-2 px-3 py-3 text-[11px] leading-relaxed text-text focus:border-primary/60 focus:outline-none"
                >
                  {terms.body}
                </div>
                <p className="text-[11px] text-faint">
                  {termsLabel(terms)}. Accepting records the version, the time and a fingerprint of exactly this text, so what you agreed to can always be shown.
                </p>
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 size-3.5 shrink-0 accent-[var(--sx-primary)]"
                  />
                  <span className="text-xs font-medium leading-relaxed text-text">{acceptLabel(checkout.sponsorName)}</span>
                </label>
              </>
            ) : (
              <p role="status" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
                The order terms aren&rsquo;t available right now, so this order can&rsquo;t be placed yet. Your hold still stands until it runs
                out — try again shortly, or ask BTG.
              </p>
            )}
          </section>

          <section aria-labelledby="checkout-place" className="space-y-3 rounded-xl border border-line bg-surface px-4 py-4">
            <h2 id="checkout-place" className="text-sm font-semibold tracking-tight">4 · Place order</h2>
            <p className="text-xs text-muted">
              Subtotal <span className="font-semibold tabular-nums text-text">{usd(subtotalCents)}</span> · fees are added when the order is placed.{" "}
              {APPROVAL_CONDITION} Nothing is charged when you place it.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!gate.ready || pending}
                aria-describedby={hint ? "checkout-gate-hint" : undefined}
                onClick={() => terms && run(() => placeOrderAction(reservationId, { id: terms.id, body: terms.body }, billing, accepted))}
                className={`${primary} disabled:cursor-not-allowed`}
              >
                {pending ? "Working…" : "Place order"}
              </button>
              <button type="button" disabled={pending} onClick={() => run(() => releaseHoldAction(reservationId))} className={secondary}>
                Release hold
              </button>
            </div>
            {hint && (
              <p id="checkout-gate-hint" className="text-[11px] text-muted">
                {hint}
              </p>
            )}
            {refusal && <ShopRefusal {...refusal} />}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ShopCancelOrder({ orderId, state }: { orderId: string; state: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { refusal, pending, run } = useShopAction();
  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted">Cancel this order? Its items go back on sale.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelOrderAction(orderId, state),
                () => {
                  setConfirming(false);
                  router.refresh();
                },
              )
            }
            className="rounded-lg border border-danger/40 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
          >
            {pending ? "Cancelling…" : "Yes, cancel the order"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={secondary}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={secondary}>
          Cancel order
        </button>
      )}
      {refusal && <ShopRefusal {...refusal} />}
    </div>
  );
}
