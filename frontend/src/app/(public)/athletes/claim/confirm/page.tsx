import { ClaimConfirmCard } from "./claim-confirm-card";

/* --------------------------------------------------------------------------
   /athletes/claim/confirm?t=<claimEmailToken> — 2S8-FE-02, the link in the
   "confirm your email" message a profile claim sends (domain/featured.ts
   claimConfirmUrl). PUBLIC, no login: the claimant is nobody's user yet.

   Unlike the other confirm pages, opening this link confirms NOTHING: the
   card has one button, "Confirm my email", and the POST happens only when
   it is pressed (./actions.ts) — a mail scanner's GET must not move a claim
   on. The API's older GET /public/athlete-claims/confirm redirect stays for
   emails sent before this page (next.config.ts, CLAIM_CONFIRM_PATH).

   On success the action redirects to the profile with ?claim=confirmed
   (REJECTED → closed); an expired link gets the shared "send me a fresh
   link" notice (2S8-FE-01); a bad or deleted one the invalid notice.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email · SponsorX", robots: { index: false } };

function Plain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="space-y-2 text-sm text-muted">{children}</div>
    </div>
  );
}

export default async function ConfirmClaimEmailPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.trim() : "";

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
      {token ? (
        <ClaimConfirmCard token={token} />
      ) : (
        <Plain title="This confirmation link isn't complete">
          <p>Check you opened the whole link from the email — it&rsquo;s long.</p>
        </Plain>
      )}
    </main>
  );
}
