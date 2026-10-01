import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";

import { BlockedNotice } from "@/components/ui";
import { StripeLinkButton } from "@/components/payout-account-panel";
import { CloseAccount } from "@/components/account-close";
import { closeLine, payoutLine, signInLine, type Seat } from "@/lib/account-live";
import { accountPanel, type ApiPayoutAccount, type PayoutWriteFailure } from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { viewerName } from "@/server/viewer";

/* --------------------------------------------------------------------------
   Account settings — 2S1-FE-08 (design Account.dc.html, settings + close),
   shared by /athlete/settings and /property/settings. Server component; the
   close row is the one client island.

   Reads  Clerk currentUser()     the sign-in email and whether it's confirmed
                                  (identity is Clerk's; GET /me has no email)
          GET /payouts/account    the payout account's status (payouts-live)
   Writes POST /payouts/account/link   via the page's own server action →
                                       Stripe ↗ (set up / finish / manage)

   A login with no payee behind it (403/404 — a guardian, or a BTG preview)
   gets a plain line instead of the panel; any other failure throws to the
   portal's error page. No bank or card detail is ever shown — Stripe holds
   them. Closing is the scaffold half: 2S1-BE-13.
   -------------------------------------------------------------------------- */

type LinkAction = () => Promise<PayoutWriteFailure>;

export async function AccountSettings({
  seat, accountWords, linkAction, previews, noPayeeLine,
}: {
  seat: Seat;
  /** "athlete account", "guardian account", "property manager account". */
  accountWords: string;
  linkAction: LinkAction;
  /** Links to the scaffolded screens that have no other way in yet. */
  previews: { href: string; label: string }[];
  /** Shown when this login has no payout account of its own. */
  noPayeeLine: string;
}) {
  const [user, acctRes, name] = await Promise.all([currentUser(), apiFetch("/payouts/account"), viewerName("You")]);
  if (!acctRes.ok && acctRes.status !== 403 && acctRes.status !== 404) {
    throw new Error(`/payouts/account unavailable (${acctRes.status}).`);
  }
  const panel = acctRes.ok ? accountPanel((await acctRes.json()) as ApiPayoutAccount, "you") : null;
  const email = user?.primaryEmailAddress;

  return (
    <div className="space-y-3.5">
      <BlockedNotice>
        Closing an account isn&rsquo;t switched on yet — it goes live with 2S1-BE-13 (closing an account, 30-day retention and
        coming back). Your sign-in and payout account below are live.
        {previews.length > 0 && (
          <>
            {" "}Sample screens:{" "}
            {previews.map((p, i) => (
              <span key={p.href}>
                {i > 0 && " · "}
                <Link href={p.href} className="underline underline-offset-2 hover:text-text">{p.label}</Link>
              </span>
            ))}
            .
          </>
        )}
      </BlockedNotice>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">{name} · {accountWords}</p>
      </div>

      <section aria-label="Sign-in" className="rounded-xl border border-line bg-surface px-4.5 py-4">
        <h2 className="text-sm font-semibold">Sign-in</h2>
        <p className="mt-1.5 break-words text-sm">{signInLine(email?.emailAddress, email?.verification?.status === "verified")}</p>
      </section>

      <section aria-label="Payouts" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4.5 py-4">
        <span className="min-w-0 grow basis-56">
          <strong className="block text-sm font-semibold">Payout account</strong>
          <span className="text-xs leading-relaxed text-muted">{panel ? payoutLine(panel) : noPayeeLine}</span>
        </span>
        {panel && <StripeLinkButton cta={panel.cta} action={linkAction} testBadge={panel.testBadge} />}
      </section>

      <CloseAccount line={closeLine(seat)} />
    </div>
  );
}
