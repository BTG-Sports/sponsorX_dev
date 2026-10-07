import Link from "next/link";

import { LinkExpired } from "@/components/link-expired";
import { SponsorProofUpload } from "@/components/sponsor-proof-upload";
import { SponsorRequestStanding } from "@/components/sponsor-request-standing";
import { linkExpiredFrom } from "@/lib/link-expired";
import { standingOf, type ApiSponsorRequestStatus } from "@/lib/sponsor-request-live";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   /sponsor-request/<token> — 2S1-FE-11 (form half), where a sponsor's
   request stands. No Claude Design artboard: it follows /brief's received
   screen and /onboarding/<token>'s plain status card. Public — the
   requestToken POST /public/inquiries gave the browser is the only key, and
   the brief's submitted screen links here so the applicant can come back.

   Reads  GET  /public/sponsor-requests/:token   (state, missing[], underReview)
   Writes POST /public/sponsor-requests/:token/documents[/:id/confirm]
          — the proof upload, through sponsor-proof-upload.tsx, which PUTs
          the file straight to the private bucket; this page re-renders after.

   Shows what is still missing; "We're opening your account" or "BTG is
   taking a look" once everything is in; "Your account is open" with Sign in
   when approved. Never BTG's review reasons — the API doesn't send them
   here. A malformed or forged token is the API's 400, a deleted request its
   404, and its per-address limit 429; anything else is the error page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Your sponsor request · SponsorX", robots: { index: false } };

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

export default async function SponsorRequestStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await publicApi(`/public/sponsor-requests/${encodeURIComponent(token)}`);

  if (res.status === 410) {
    /* 2S8-FE-01: older than 14 days — a fresh one can be emailed. */
    const gone = linkExpiredFrom(410, await res.json().catch(() => null), "sponsor-request");
    if (gone) {
      return (
        <Shell>
          <LinkExpired kind={gone.kind} token={token} what="the link to your request" />
        </Shell>
      );
    }
  }
  if (res.status === 400 || res.status === 404) {
    return (
      <Plain title={res.status === 404 ? "This request no longer exists" : "This link isn't valid"}>
        <p>Check you copied the whole address — it&rsquo;s long. Or start over: it takes about three minutes.</p>
        <p>
          <Link href="/brief?new=1" className="text-accent hover:underline">
            Send the form again →
          </Link>
        </p>
      </Plain>
    );
  }
  if (res.status === 429) {
    return (
      <Plain title="Give it a few minutes">
        <p>There have been a lot of requests from this connection. Your request is safe — reload this page in a few minutes.</p>
      </Plain>
    );
  }
  if (!res.ok) throw new Error(`Your request couldn't be loaded (${res.status}).`);
  const status = (await res.json()) as ApiSponsorRequestStatus;
  const st = standingOf(status);
  const needsEmail = st.kind === "waiting" && !status.emailConfirmed;
  const needsProof = st.kind === "waiting" && !status.proofUploaded;

  return (
    <Shell>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">BTG SponsorX · Sponsor request</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{status.businessName}</h1>
      </div>

      <SponsorRequestStanding status={status} email={status.email} />

      {(needsEmail || needsProof) && (
        <div className="space-y-5 rounded-xl border border-line bg-surface p-5">
          {needsEmail && (
            <section aria-labelledby="sr-email">
              <h2 id="sr-email" className="text-sm font-semibold text-text">
                Check your email to confirm it
              </h2>
              <p className="mt-1 text-sm text-muted">
                We sent a link to the address you gave on the form. Open it to show the address is yours, then reload this page.
              </p>
            </section>
          )}
          {needsProof && (
            <section aria-labelledby="sr-proof" className={needsEmail ? "border-t border-line pt-5" : ""}>
              <h2 id="sr-proof" className="text-sm font-semibold text-text">
                Upload your proof of business
              </h2>
              <p className="mt-1 text-sm text-muted">
                Your business registration, permit or license in the business&rsquo;s name — required of every sponsor.
              </p>
              <div className="mt-3">
                <SponsorProofUpload token={token} after="refresh" />
              </div>
            </section>
          )}
        </div>
      )}

      <p className="text-[11px] text-faint">Bookmark this page to come back — it works without signing in.</p>
    </Shell>
  );
}
