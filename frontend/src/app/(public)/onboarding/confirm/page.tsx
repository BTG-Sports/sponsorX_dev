import Link from "next/link";

import { Badge } from "@/components/ui";
import { refusalMessage, type OnboardingState } from "@/lib/onboarding-live";
import { publicApi } from "../public-api";

/* --------------------------------------------------------------------------
   /onboarding/confirm?t=<emailToken> — 2S1-FE-04, the email-confirm step.
   The link in the "confirm your email" message the onboarding wizard's
   contacts step sends (${APP_URL}/onboarding/confirm?t=…, 2S1-BE-06). No
   Claude Design artboard: it follows /sponsor-request/confirm's plain card.

   Writes POST /public/onboarding/confirm-email {token}, server-side on
   render — opening the link IS the confirmation, and a second open is
   harmless (it confirms once, then re-runs the checks). The answer carries
   the application's own resume token, so the applicant carries on from
   whichever device opened the email: approved, still missing something, or
   not submitted yet.

   No token, or one the API refuses (400 — forged, or sent to a contact who
   has since been replaced), is a clear error; 429 is its per-address limit;
   anything else is the error page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your email · Sell on SponsorX", robots: { index: false } };

type Confirmation = { state: OnboardingState; orgName: string; email: string; approved: boolean; reviewReasons: string[]; resumeToken: string };

function Plain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
      <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-2 text-sm text-muted">{children}</div>
      </div>
    </main>
  );
}

export default async function ConfirmOnboardingEmailPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.trim() : "";
  if (!token) {
    return (
      <Plain title="This confirmation link isn't complete">
        <p>Check you opened the whole link from the email — it&rsquo;s long. Your application can send a fresh one from its Review step.</p>
      </Plain>
    );
  }

  const res = await publicApi("/public/onboarding/confirm-email", { method: "POST", body: JSON.stringify({ token }) });
  if (res.status === 400) {
    let said: string | undefined;
    try {
      said = refusalMessage(await res.json());
    } catch {
      /* no body */
    }
    return (
      <Plain title="This confirmation link isn't valid">
        <p>{said ?? "Check you opened the whole link from the email."}</p>
        <p>
          <Link href="/onboarding" className="text-primary hover:underline">
            Go to the start page →
          </Link>
        </p>
      </Plain>
    );
  }
  if (res.status === 429) {
    return (
      <Plain title="Give it a few minutes">
        <p>There have been a lot of requests from this connection. Open the link from your email again in a few minutes.</p>
      </Plain>
    );
  }
  if (!res.ok) throw new Error(`Your email couldn't be confirmed (${res.status}).`);
  const c = (await res.json()) as Confirmation;
  const resume = `/onboarding/${encodeURIComponent(c.resumeToken)}`;

  return (
    <Plain title={c.state === "APPROVED" ? `${c.orgName} is approved` : "Your email is confirmed"}>
      <p>
        <Badge tone="accent">
          <span aria-hidden="true" className="mr-1">✓</span>
          {c.email}
        </Badge>
      </p>
      {c.state === "APPROVED" ? (
        <>
          <p>Everything was in, so {c.orgName} is approved. Sign in with this email address to reach your property portal.</p>
          <p>
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in →
            </Link>
          </p>
        </>
      ) : c.state === "PENDING_REVIEW" ? (
        <>
          <p>
            {c.reviewReasons.length
              ? "A few things are still open before we can approve your organisation:"
              : "Everything is in. BTG is looking at your application."}
          </p>
          {c.reviewReasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {c.reviewReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <p>
            <Link href={resume} className="font-medium text-primary hover:underline">
              Open your application →
            </Link>
          </p>
        </>
      ) : (
        <>
          <p>Thanks — that&rsquo;s one item off {c.orgName}&rsquo;s checklist. Carry on with the application and submit it when you&rsquo;re ready.</p>
          <p>
            <Link href={resume} className="font-medium text-primary hover:underline">
              Back to your application →
            </Link>
          </p>
        </>
      )}
    </Plain>
  );
}
