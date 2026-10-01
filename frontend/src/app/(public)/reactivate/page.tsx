import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

import { AccountReactivate } from "@/components/account-reactivate";
import { BlockedNotice } from "@/components/ui";
import { reactivateDemo, reactivateView, sampleReactivation, type ApiReactivationStatus } from "@/lib/account-closure-live";
import { supportContact } from "@/server/support";
import { publicApi } from "../onboarding/public-api";
import { reactivateAction, requestReviewAction, sendLinkAction } from "./actions";

/* --------------------------------------------------------------------------
   /reactivate — 2S1-FE-08, coming back to a closed account (Claude Design
   Account.dc.html, views reactivate + rejected). PUBLIC: a closed login is
   refused at sign-in, so this page is reached by the signed link in the
   person's email (?t=), and anyone can ask for a fresh link by email.

   Reads  GET  /public/account/reactivation/:t     where the closed account stands
          GET  /public/support                     the support address
   Writes POST /public/account/reactivation/:t     REACTIVATE | REQUEST   (actions.ts)
          POST /public/account/reactivation-link   a fresh link           (actions.ts)

   ?closed=1 is where Close account lands: the account is closed, the link
   is in their email, and they can sign out of this browser. ?demo=self|btg
   previews the two cases with a sample account; nothing is sent.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Reactivate your account · SponsorX", robots: { index: false } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  email: "Enter the email address the account used.",
  unreachable: "We couldn’t reach SponsorX just now. Nothing has changed — try again in a minute.",
  busy: "That’s a lot of tries from this connection. Wait a few minutes, then try again.",
  failed: "That didn’t go through. Nothing has changed — try again.",
  link: "This link has expired or isn’t valid. Ask for a new one below.",
};

const field = "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function LinkForm({ heading }: { heading: string }) {
  return (
    <form action={sendLinkAction} className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <p className="text-xs leading-relaxed text-muted">We&rsquo;ll email a link to the address your account used. It works for 24 hours.</p>
      <label className="flex flex-col text-xs font-medium">
        Email
        <input type="email" name="email" required autoComplete="email" className={field} />
      </label>
      <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
        Email me a link
      </button>
    </form>
  );
}

export default async function ReactivatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const support = await supportContact();
  const error = ERRORS[first(sp.e) ?? ""];
  const demo = reactivateDemo(sp.demo);
  const token = first(sp.t);

  if (demo) {
    const sample = sampleReactivation(demo === "btg" ? "CLOSED_BY_BTG" : "CLOSED_SELF", "Riley");
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
        <BlockedNotice>Preview with a sample account — the real page opens from the link in the closing email. Nothing here is sent.</BlockedNotice>
        <AccountReactivate view={reactivateView(sample)} supportEmail={support.email} portalPath={sample.portalPath} />
      </main>
    );
  }

  if (token) {
    let res: Response | null = null;
    try {
      res = await publicApi(`/public/account/reactivation/${encodeURIComponent(token)}`);
    } catch {
      res = null;
    }
    if (!res) throw new Error("The reactivation service is unavailable.");
    if (res.status === 400 || res.status === 404) {
      return (
        <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Reactivate your account</h1>
          <p role="alert" className="text-sm text-danger">{ERRORS.link}</p>
          <LinkForm heading="Get a new link" />
        </main>
      );
    }
    if (!res.ok) throw new Error(`Reactivation status unavailable (${res.status}).`);
    const status = (await res.json()) as ApiReactivationStatus;
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <AccountReactivate
          view={reactivateView(status)}
          supportEmail={status.supportEmail}
          portalPath={status.portalPath}
          reactivate={status.standing === "CLOSED_SELF" ? reactivateAction.bind(null, token) : undefined}
          request={status.standing === "CLOSED_BY_BTG" ? requestReviewAction.bind(null, token) : undefined}
        />
      </main>
    );
  }

  const closed = first(sp.closed) === "1";
  const sent = first(sp.sent) === "1";
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">{closed ? "Your account is closed" : "Reactivate your account"}</h1>
      {closed && (
        <section role="status" aria-label="Account closed" className="space-y-2.5 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <p className="text-sm leading-relaxed">
            You can&rsquo;t sign in any more, and your listings have stopped. Your documents are kept for 30 days, then deleted.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Changed your mind? We&rsquo;ve emailed you a link to reactivate within 30 days. Money you already earned is still paid out.
          </p>
          <SignOutButton redirectUrl="/">
            <button type="button" className="min-h-11 rounded-lg border border-line px-4 text-xs font-medium text-text hover:bg-surface-2">
              Sign out of this browser
            </button>
          </SignOutButton>
        </section>
      )}
      {sent && (
        <p role="status" className="rounded-lg border border-success/40 bg-success/6 px-3.5 py-3 text-sm">
          If a closed account uses that address, we&rsquo;ve emailed it a link. Check your inbox.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!closed && (
        <p className="text-sm leading-relaxed text-muted">
          An account you closed yourself can come back within 30 days. An account BTG closed can ask BTG to look again.
        </p>
      )}
      <LinkForm heading={closed ? "Lost the email?" : "Get your link"} />
      <p className="text-xs text-muted">
        Questions? <Link href="/contact?topic=account" className="text-primary-soft hover:underline">Contact BTG</Link> · <span className="select-all">{support.email}</span>
        {!support.ready && " (being set up)"}
      </p>
    </main>
  );
}
