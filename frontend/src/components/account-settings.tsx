import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import type { CSSProperties } from "react";

import { ArenaHead, at } from "@/components/arena-stage";
import { BlockedNotice } from "@/components/ui";
import { StripeLinkButton } from "@/components/payout-account-panel";
import { CloseAccount, type CloseResult } from "@/components/account-close";
import { closeLine, payoutLine, signInLine, type Seat } from "@/lib/account-live";
import { accountPanel, type ApiPayoutAccount, type PayoutWriteFailure } from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { viewerName } from "@/server/viewer";
import { supportContact } from "@/server/support";

/* --------------------------------------------------------------------------
   Account settings — 2S1-FE-08 (design Account.dc.html, settings + close),
   shared by /athlete/settings and /property/settings. Server component; the
   close row is the one client island.

   Reads  Clerk currentUser()     the sign-in email and whether it's confirmed
                                  (identity is Clerk's; GET /me has no email)
          GET /payouts/account    the payout account's status (payouts-live)
          GET /public/support     the support address (server/support.ts)
   Writes POST /payouts/account/link   via the page's own server action →
                                       Stripe ↗ (set up / finish / manage)
          POST /me/close              via the page's own server action
                                       (2S1-BE-13) → the public /reactivate

   A login with no payee behind it (403/404 — a guardian, or a BTG preview)
   gets a plain line instead of the panel; any other failure throws to the
   portal's error page. No bank or card detail is ever shown — Stripe holds
   them. Closing is live (2S1-BE-13); the preview links are the sample
   screens that have no other way in yet.

   P1-ART-22 (2026-10-11): an optional `stage="arena"` draws the athlete's
   copy on the Arena — ArenaHead (title, "Clerk · Postgres · read" pill,
   the name · account lede) and the three rows as plates that slide in and
   light under the pointer. Without it the property portal's settings are
   exactly as before. Every read, action and line is the same either way.
   -------------------------------------------------------------------------- */

type LinkAction = () => Promise<PayoutWriteFailure>;
type CloseAction = () => Promise<CloseResult>;

export async function AccountSettings({
  seat, accountWords, linkAction, closeAction, previews, noPayeeLine, stage,
}: {
  seat: Seat;
  /** "athlete account", "guardian account", "property manager account". */
  accountWords: string;
  linkAction: LinkAction;
  /** 2S1-BE-13 — POST /me/close, through the page's own action. */
  closeAction: CloseAction;
  /** Links to the scaffolded screens that have no other way in yet. */
  previews: { href: string; label: string }[];
  /** Shown when this login has no payout account of its own. */
  noPayeeLine: string;
  /** P1-ART-22 — "arena" draws the athlete portal's skin; omitted, the plain one. */
  stage?: "arena";
}) {
  const [user, acctRes, name, support] = await Promise.all([currentUser(), apiFetch("/payouts/account"), viewerName("You"), supportContact()]);
  const arena = stage === "arena";
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  /* A row's frame: an arena plate (speed bar, slide-in, spotlight) or the plain card. */
  const plate = (delay: number, tone?: string) =>
    arena
      ? { className: "sx-arena-plate sx-arena-in px-5 py-4 pl-7", style: at(delay, tone ? ({ "--tone": tone } as CSSProperties) : undefined), spot: true }
      : { className: "rounded-xl border border-line bg-surface px-4.5 py-4", style: undefined, spot: false };
  const signIn = plate(0.16);
  const payouts = plate(0.22);
  if (!acctRes.ok && acctRes.status !== 403 && acctRes.status !== 404) {
    throw new Error(`/payouts/account unavailable (${acctRes.status}).`);
  }
  const panel = acctRes.ok ? accountPanel((await acctRes.json()) as ApiPayoutAccount, "you") : null;
  const email = user?.primaryEmailAddress;

  return (
    <div className="space-y-3.5">
      {arena && (
        <ArenaHead title="Settings" pill={`Clerk · Postgres · read ${readAt}`} lede={`${name} · ${accountWords}`} />
      )}

      {previews.length > 0 && (
        <BlockedNotice>
          Sample screens:{" "}
          {previews.map((p, i) => (
            <span key={p.href}>
              {i > 0 && " · "}
              <Link href={p.href} className="underline underline-offset-2 hover:text-text">{p.label}</Link>
            </span>
          ))}
          .
        </BlockedNotice>
      )}

      {!arena && (
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">{name} · {accountWords}</p>
        </div>
      )}

      <section aria-label="Sign-in" data-spot={signIn.spot ? "" : undefined} style={signIn.style} className={signIn.className}>
        <h2 className="text-sm font-semibold">Sign-in</h2>
        <p className="mt-1.5 break-words text-sm">{signInLine(email?.emailAddress, email?.verification?.status === "verified")}</p>
      </section>

      <section aria-label="Payouts" data-spot={payouts.spot ? "" : undefined} style={payouts.style} className={`flex flex-wrap items-center gap-3 ${payouts.className}`}>
        <span className="min-w-0 grow basis-56">
          <strong className="block text-sm font-semibold">Payout account</strong>
          <span className="text-xs leading-relaxed text-muted">{panel ? payoutLine(panel) : noPayeeLine}</span>
        </span>
        {panel && <StripeLinkButton cta={panel.cta} action={linkAction} testBadge={panel.testBadge} />}
      </section>

      <CloseAccount line={closeLine(seat)} action={closeAction} skin={arena ? plate(0.28, "var(--sx-danger)") : undefined} />

      {/* 2S1-BE-16 — the support address on account pages. */}
      <p className="text-xs leading-relaxed text-muted">
        Questions about your account?{" "}
        <Link href="/contact?topic=account" className={arena ? "text-athlete hover:underline" : "text-primary-soft hover:underline"}>Contact BTG</Link>
        {" "}· <span className="select-all">{support.email}</span>
        {!support.ready && " (being set up)"}
      </p>
    </div>
  );
}
