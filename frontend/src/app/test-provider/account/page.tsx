import type { Metadata } from "next";

import { accountStatusLabel } from "@/lib/order-payment-live";
import { standinAccountAction } from "../actions";
import { one, readStandin, StandinError, StandinFrame, StandinProblem } from "../standin-bits";

/* --------------------------------------------------------------------------
   The stand-in provider's payout set-up page — 2S5-FE-03 (staging only).
   Public, no login: the signed `?t=` token from the API is the only key.
   Stands in for Stripe's hosted onboarding; outside the portal groups and
   the (public) site chrome on purpose.

   Reads  GET  /public/test-provider/details?token=  → { kind:"account", payeeName, status, returnPath }
   Writes POST /public/test-provider/account { token, outcome: READY | NEEDS_INFO }
          → redirect(returnPath)   (actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test payment provider — payout set-up",
  robots: { index: false, follow: false },
};

export default async function StandinAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = one(sp.t);
  const r = await readStandin(token);
  if (!r.ok) return <StandinProblem reason={r.reason} />;
  if (r.details.kind !== "account") return <StandinProblem reason="invalid" />;
  const d = r.details;

  return (
    <StandinFrame title="Set up payouts">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Payee</dt>
          <dd className="text-right font-medium">{d.payeeName || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Current status</dt>
          <dd className="text-right">{accountStatusLabel(d.status)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        On Stripe, this is where the payee would give their details. Here, pick how the test set-up ends — you&rsquo;ll go
        straight back to SponsorX.
      </p>
      <StandinError e={one(sp.e)} />
      <form action={standinAccountAction} className="flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          name="outcome"
          value="READY"
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft"
        >
          Finish set-up (test)
        </button>
        <button
          type="submit"
          name="outcome"
          value="NEEDS_INFO"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text hover:bg-surface"
        >
          Ask for more information (test)
        </button>
      </form>
    </StandinFrame>
  );
}
