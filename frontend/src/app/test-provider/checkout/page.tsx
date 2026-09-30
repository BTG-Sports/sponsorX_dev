import type { Metadata } from "next";
import Link from "next/link";

import { usd } from "@/lib/shop-live";
import { standinCheckoutAction } from "../actions";
import { one, readStandin, StandinError, StandinFrame, StandinProblem } from "../standin-bits";

/* --------------------------------------------------------------------------
   The stand-in provider's card payment page — 2S5-FE-05 (staging only).
   Public, no login: the signed `?t=` token from POST /marketplace-orders/:id/pay
   is the only key. Stands in for Stripe Checkout; outside the portal groups
   and the (public) site chrome on purpose. The card shown is a fixed test
   card — nothing is typed and no card details exist anywhere.

   Reads  GET  /public/test-provider/details?token=  → { kind:"checkout", orderRef, amountCents, sponsorName, state, returnPath }
   Writes POST /public/test-provider/checkout { token, outcome: SUCCEED | DECLINE }
          → redirect(returnPath)   (actions.ts; SponsorX's order page, ?payment=returned)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test payment provider — pay by card",
  robots: { index: false, follow: false },
};

export default async function StandinCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = one(sp.t);
  const r = await readStandin(token);
  if (!r.ok) return <StandinProblem reason={r.reason} />;
  if (r.details.kind !== "checkout") return <StandinProblem reason="invalid" />;
  const d = r.details;
  const amount = usd(d.amountCents);

  return (
    <StandinFrame title={`Pay ${amount}`}>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Paying</dt>
          <dd className="text-right font-medium">{d.sponsorName || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Order</dt>
          <dd className="text-right font-mono">{d.orderRef}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-2">
          <dt className="text-muted">Amount</dt>
          <dd className="text-right text-base font-semibold tabular-nums">{amount}</dd>
        </div>
      </dl>

      {d.state !== "PENDING" ? (
        <>
          <p className="text-sm text-muted">This payment has already been answered. Go back to SponsorX to see where it stands.</p>
          <Link href={d.returnPath} className="inline-flex text-sm font-medium text-primary-soft hover:underline">
            ← Back to SponsorX
          </Link>
        </>
      ) : (
        <>
          <div aria-label="Test card" className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-faint">Card</p>
            <p className="mt-1 font-mono text-sm">Test card •••• 4242</p>
          </div>
          <StandinError e={one(sp.e)} />
          <form action={standinCheckoutAction} className="flex flex-col gap-2">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              name="outcome"
              value="SUCCEED"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft"
            >
              Pay {amount} (test card)
            </button>
            <button
              type="submit"
              name="outcome"
              value="DECLINE"
              className="rounded-lg border border-danger/40 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Decline the card (test)
            </button>
          </form>
        </>
      )}
    </StandinFrame>
  );
}
