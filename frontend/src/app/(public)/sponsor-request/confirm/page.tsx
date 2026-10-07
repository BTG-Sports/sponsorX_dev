import Link from "next/link";

import { LinkExpired } from "@/components/link-expired";
import { SponsorRequestStanding } from "@/components/sponsor-request-standing";
import { linkExpiredFrom } from "@/lib/link-expired";
import { refusalMessage } from "@/lib/onboarding-live";
import { confirmationStatus, type ApiEmailConfirmation } from "@/lib/sponsor-request-live";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   /sponsor-request/confirm?t=<emailToken> — 2S1-FE-11 (form half), the link
   in the "confirm your email" message POST /public/inquiries sends
   (${APP_URL}/sponsor-request/confirm?t=…). No Claude Design artboard: it
   follows /sponsor-request/<token>'s plain card.

   Writes POST /public/sponsor-requests/confirm-email {token}, server-side on
   render — opening the link IS the confirmation, and the API makes a second
   open harmless (it confirms once, then just re-runs the checks). The
   answer says what is still missing, or that the account opened, or that
   BTG is looking — never why.

   No token, a forged one (the API's 400) or a deleted request (404) is a
   clear error with a way to send the form again; 429 is its per-address
   limit; anything else is the error page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email · SponsorX", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">{children}</main>;
}

function Plain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-2 text-sm text-muted">{children}</div>
      </div>
    </Shell>
  );
}

function BadLink({ title, said }: { title: string; said?: string }) {
  return (
    <Plain title={title}>
      <p>{said ?? "Check you opened the whole link from the email — it's long."} If it still doesn&rsquo;t work, send the form again: it takes about three minutes.</p>
      <p>
        <Link href="/brief?new=1" className="text-accent hover:underline">
          Send the form again →
        </Link>
      </p>
    </Plain>
  );
}

export default async function ConfirmSponsorEmailPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.trim() : "";
  if (!token) return <BadLink title="This confirmation link isn't complete" />;

  const res = await publicApi("/public/sponsor-requests/confirm-email", { method: "POST", body: JSON.stringify({ token }) });

  if (res.status === 410) {
    /* 2S8-FE-01: older than 14 days — a fresh one can be emailed. */
    const gone = linkExpiredFrom(410, await res.json().catch(() => null), "sponsor-request-email");
    if (gone) {
      return (
        <Shell>
          <LinkExpired kind={gone.kind} token={token} what="the confirmation link" />
        </Shell>
      );
    }
  }
  if (res.status === 400 || res.status === 404) {
    let said: string | undefined;
    try {
      said = refusalMessage(await res.json());
    } catch {
      /* no body */
    }
    return <BadLink title={res.status === 404 ? "This request no longer exists" : "This confirmation link isn't valid"} said={res.status === 404 ? said : undefined} />;
  }
  if (res.status === 429) {
    return (
      <Plain title="Give it a few minutes">
        <p>There have been a lot of requests from this connection. Open the link from your email again in a few minutes.</p>
      </Plain>
    );
  }
  if (!res.ok) throw new Error(`Your email couldn't be confirmed (${res.status}).`);
  const c = (await res.json()) as ApiEmailConfirmation;
  const status = confirmationStatus(c);
  const needsProof = status.missing.some((m) => /proof of business/i.test(m));

  return (
    <Shell>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">BTG SponsorX · {c.businessName}</p>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 12.5l4 4 8-9" />
          </svg>
          Email confirmed
        </h1>
      </div>

      <SponsorRequestStanding status={status} email={c.email} />

      {needsProof && (
        <section aria-labelledby="sc-proof" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="sc-proof" className="text-sm font-semibold text-text">
            Upload your proof of business
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your business registration, permit or license in the business&rsquo;s name — required of every sponsor.
          </p>
          <div className="mt-3">
            {/* The emailed link proved the mailbox, so the upload works from this device too. */}
            <Link href={`/sponsor-request/${encodeURIComponent(c.requestToken)}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-bg hover:opacity-90">
              Upload it now →
            </Link>
          </div>
        </section>
      )}
    </Shell>
  );
}
