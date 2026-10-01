import Link from "next/link";

import { Badge, BlockedNotice } from "@/components/ui";
import { REACTIVATE_NOT_LIVE, reactivateView, type ApiAccountStatus } from "@/lib/account-live";

/* --------------------------------------------------------------------------
   Reactivate your account — 2S1-FE-08 (design Account.dc.html, views
   reactivate + rejected). Shared by /athlete/settings/reactivate and
   /property/settings/reactivate. Server component, no client JS.

   SCAFFOLD: 2S1-BE-13 (closing an account, 30-day retention and coming
   back) is not built, so the account shown is a labelled sample and
   "Reactivate my account" is disabled with the reason under it. Two cases:
     self-closed   — a countdown of the 30 days, and Reactivate
     closed by BTG — can't reactivate itself; Contact BTG (/contact), and
                     BTG decides
   `switchHref` flips between the two samples.
   -------------------------------------------------------------------------- */

export function AccountReactivate({ account, switchHref, now = new Date() }: { account: ApiAccountStatus; switchHref: string; now?: Date }) {
  const v = reactivateView(account, now);
  const isBtg = account.state === "CLOSED_BY_BTG";
  return (
    <div className="mx-auto w-full max-w-xl space-y-3.5">
      <BlockedNotice>
        Sample account — the reactivation page goes live with 2S1-BE-13 (closing an account, 30-day retention and coming back).{" "}
        <Link href={switchHref} className="underline underline-offset-2 hover:text-text">
          {isBtg ? "See a self-closed account" : "See an account closed by BTG"}
        </Link>
        .
      </BlockedNotice>

      <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Reactivate your account</h1>

      {v?.kind === "self" && (
        <section aria-label="Account closed" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4.5 py-4">
          <span><Badge tone="primary"><span aria-hidden="true" className="mr-1">●</span>{v.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{v.headline}</p>
          <p className="text-3xl font-bold tabular-nums text-primary-soft sm:text-[34px]">{v.left}</p>
          <p className="text-sm leading-relaxed text-muted">{v.body}</p>
          {v.canReactivate && <div className="space-y-1.5">
            <button type="button" disabled title={REACTIVATE_NOT_LIVE} aria-describedby="re-why"
              className="min-h-12 cursor-not-allowed rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink opacity-40">
              Reactivate my account
            </button>
            <p id="re-why" className="text-[11px] text-warn">{REACTIVATE_NOT_LIVE}</p>
          </div>}
        </section>
      )}

      {v?.kind === "btg" && (
        <section role="status" aria-label="Closed by BTG" className="flex flex-col gap-2.5 rounded-xl border border-danger/40 bg-surface p-4.5">
          <span><Badge tone="danger"><span aria-hidden="true" className="mr-1">✕</span>{v.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{v.headline}</p>
          <p className="text-sm leading-relaxed text-muted">{v.body}</p>
          <p className="text-xs text-muted">{v.kept}</p>
          <Link href="/contact" className="inline-flex min-h-12 items-center justify-center self-start rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
            Contact BTG
          </Link>
        </section>
      )}
    </div>
  );
}
