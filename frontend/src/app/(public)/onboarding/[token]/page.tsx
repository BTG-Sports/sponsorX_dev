import Link from "next/link";

import { OnboardingRemember } from "@/components/onboarding-remember";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { Badge } from "@/components/ui";
import {
  EDITABLE_STATES,
  ORG_TYPE_COPY,
  STATE_COPY,
  dateLabel,
  type ApiOnboarding,
} from "@/lib/onboarding-live";
import { publicApi } from "../public-api";

/* --------------------------------------------------------------------------
   /onboarding/<token> — 2S1-FE-01, the application's own page. Public: the
   resume token in the path is the only key. This is also exactly the path
   BTG's "changes requested" email links to (${APP_URL}/onboarding/<token>).

   Reads GET /public/onboarding/:token (the saved answers, missing[], and the
   current PROPERTY_TERMS with their words). Editing — the wizard, which
   writes PATCH …, POST …/documents[/:id/confirm] and POST …/submit — only
   while DRAFT or CHANGES_REQUESTED; the API answers 409 otherwise, so every
   other state is a plain status page. A bad token is the API's 404 (one
   answer for "no such application" and "bad link"); 429 is its per-address
   limit, said kindly. Anything else is the error page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Your application · Sell on SponsorX", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">{children}</main>;
}

function Plain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="mx-auto max-w-xl space-y-3 rounded-xl border border-line bg-surface p-6">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="space-y-2 text-sm text-muted">{children}</div>
      </div>
    </Shell>
  );
}

export default async function OnboardingResumePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await publicApi(`/public/onboarding/${encodeURIComponent(token)}`);

  if (res.status === 404) {
    return (
      <Plain title="This link doesn't match an application">
        <p>Check you copied the whole address — it&rsquo;s long. If you started on this device, the start page may still have it.</p>
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
        <p>There have been a lot of requests from this connection. Your application is safe — reload this page in a few minutes.</p>
      </Plain>
    );
  }
  if (!res.ok) throw new Error(`Your application couldn't be loaded (${res.status}).`);
  const view = (await res.json()) as ApiOnboarding;
  const state = STATE_COPY[view.state];

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-faint">{ORG_TYPE_COPY[view.orgType]?.label ?? view.orgType} · property application</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{view.orgName}</h1>
      </div>
      <Badge tone={state.tone}>{state.label}</Badge>
    </div>
  );

  if (EDITABLE_STATES.has(view.state)) {
    return (
      <Shell>
        <div className="lg:hidden">{heading}</div>
        <OnboardingRemember token={token} orgName={view.orgName} />
        <OnboardingWizard token={token} initial={view} terms={view.terms ?? null} />
      </Shell>
    );
  }

  const note = view.reviewNotes?.trim();
  return (
    <Shell>
      <OnboardingRemember token={token} orgName={view.orgName} compact={view.state === "APPROVED"} />
      <div className="mx-auto max-w-2xl space-y-5 rounded-xl border border-line bg-surface p-6">
        {heading}
        {view.state === "PENDING_REVIEW" && (
          <div className="space-y-2 text-sm text-muted">
            <p className="text-base font-semibold text-text">BTG is reviewing your application.</p>
            <p>Submitted {dateLabel(view.submittedAt)}. You&rsquo;ll hear back by email at your primary contact&rsquo;s address — approval, a request for changes, or a decision.</p>
            <p>While it&rsquo;s under review your answers are locked. If BTG asks for changes, this page opens for editing again.</p>
          </div>
        )}
        {view.state === "APPROVED" && (
          <div className="space-y-2 text-sm text-muted">
            <p className="text-base font-semibold text-text">Approved — check your email to sign in.</p>
            <p>
              BTG approved {view.orgName} on {dateLabel(view.decidedAt)}. Your primary contact can now sign in with the email address on the application to manage the
              property{view.listingAccess ? " and create listings" : ""}.
            </p>
            <p>
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in →
              </Link>
            </p>
          </div>
        )}
        {view.state === "REJECTED" && (
          <div className="space-y-2 text-sm text-muted">
            <p className="text-base font-semibold text-text">BTG didn&rsquo;t approve this application.</p>
            <p>Decided {dateLabel(view.decidedAt)}. This decision is final for this application.</p>
          </div>
        )}
        {view.state === "SUSPENDED" && (
          <div className="space-y-2 text-sm text-muted">
            <p className="text-base font-semibold text-text">This property is suspended.</p>
            <p>Since {dateLabel(view.decidedAt)} it can&rsquo;t list on the marketplace. BTG will be in touch about what happens next.</p>
          </div>
        )}
        {note && view.state !== "PENDING_REVIEW" && view.state !== "APPROVED" && (
          <blockquote className="whitespace-pre-wrap rounded-lg border-l-2 border-primary/60 bg-surface-2 px-3 py-2 text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-faint">BTG&rsquo;s note</span>
            {note}
          </blockquote>
        )}
      </div>
    </Shell>
  );
}
