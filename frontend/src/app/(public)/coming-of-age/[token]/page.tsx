import Link from "next/link";

import { ComingOfAgeUpload } from "@/components/coming-of-age-upload";
import { LinkExpired } from "@/components/link-expired";
import { linkExpiredFrom } from "@/lib/link-expired";
import { refusalMessage } from "@/lib/onboarding-live";
import { dayOf, daysLeft } from "@/lib/account-live";
import type { ApiComingOfAgePage } from "../actions";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   /coming-of-age/<token> — 2S1-FE-08 (design Account.dc.html, the
   coming-of-age banner's CTA). Public: the signed link in the reminder
   emails, the one the guardian sends, and the athlete's own "Upload
   government ID". Uploading a government ID here moves control of the
   account from the guardian to the athlete — or, within 30 days of the
   allowance running out, brings a closed account back (2S1-BE-12).

   Reads  GET  /public/coming-of-age/:token
   Writes POST /public/coming-of-age/:token/documents(/:id/confirm)   (../actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Take over your account · SponsorX", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">{children}</main>;
}

export default async function ComingOfAgeTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await publicApi(`/public/coming-of-age/${encodeURIComponent(token)}`);
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    /* 2S8-FE-01: older than 14 days — a fresh one can be emailed. */
    const gone = linkExpiredFrom(res.status, body, "coming-of-age");
    if (gone) {
      return (
        <Shell>
          <LinkExpired kind={gone.kind} token={token} what="the link to this page" />
        </Shell>
      );
    }
    const said = refusalMessage(body);
    if (res.status >= 500) throw new Error(`This page couldn't be opened (${res.status}).`);
    return (
      <Shell>
        <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold tracking-tight">This link isn&rsquo;t valid</h1>
          <p className="text-sm text-muted">{said ?? "Check you opened the whole link from the email — it's long."}</p>
          <Link href="/contact?topic=account" className="text-sm text-primary-soft hover:underline">Contact BTG</Link>
        </div>
      </Shell>
    );
  }
  const c = (await res.json()) as ApiComingOfAgePage;
  const left = c.until ? daysLeft(new Date(c.until)) : 0;

  return (
    <Shell>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft">Coming of age</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px]">
          {c.window === "reactivate" ? `${c.athleteFirstName}, bring your account back` : `${c.athleteFirstName}, take over your account`}
        </h1>
      </div>
      {c.window === "allowance" && (
        <p className="text-sm leading-relaxed text-muted">
          You&rsquo;ve reached {c.ageOfMajority}, the age of majority where you live. Upload a government ID by {c.until ? dayOf(c.until) : "the deadline"} — {left} day{left === 1 ? "" : "s"} left — and your account is yours: you accept your own agreements and manage your own money. Until then, new items and new deals are paused; orders already agreed carry on.
        </p>
      )}
      {c.window === "reactivate" && (
        <p className="text-sm leading-relaxed text-muted">
          The 90 days ran out, so your account was closed. Your documents are kept until {c.until ? dayOf(c.until) : "30 days after it closed"} — upload a government ID before then and everything comes back.
        </p>
      )}
      {(c.window === "expired" || c.window === "not-started") && (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          <p>{c.window === "expired" ? "The 30 days after your account closed have passed, so this link no longer works. To come back, sign up again or contact BTG." : "There's nothing to do here yet."}</p>
          <Link href="/contact?topic=account" className="text-primary-soft hover:underline">Contact BTG</Link>
        </div>
      )}
      {(c.window === "allowance" || c.window === "reactivate" || c.window === "done") && <ComingOfAgeUpload token={token} initial={c} />}
    </Shell>
  );
}
