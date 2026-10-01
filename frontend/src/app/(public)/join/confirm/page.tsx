import Link from "next/link";

import { JoinChecklist } from "@/components/join-checklist";
import { refusalMessage } from "@/lib/onboarding-live";
import type { ApiSignupStatus } from "@/lib/join-signup";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   /join/confirm?t=<emailToken> — 2S1-FE-06 (athlete half), the link in the
   receipt /join sends (${APP_URL}/join/confirm?t=…). No Claude Design
   artboard: it follows /sponsor-request/confirm's plain card, then the live
   checklist (join-checklist.tsx) so the athlete can upload their ID from
   whichever device opened the email.

   Writes POST /applications/intake/confirm-email {token}, server-side on
   render — opening the link IS the confirmation, and a second open is
   harmless (it confirms once, then runs the checks again). The answer
   carries the status and a fresh continuation token for this device.
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

export default async function ConfirmAthleteEmailPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.trim() : "";
  if (!token) {
    return (
      <Plain title="This confirmation link isn't complete">
        <p>Check you opened the whole link from the email — it&rsquo;s long.</p>
      </Plain>
    );
  }

  const res = await publicApi("/applications/intake/confirm-email", { method: "POST", body: JSON.stringify({ token }) });
  if (res.status === 400 || res.status === 404) {
    let said: string | undefined;
    try {
      said = refusalMessage(await res.json());
    } catch {
      /* no body */
    }
    return (
      <Plain title={res.status === 404 ? "This application no longer exists" : "This confirmation link isn't valid"}>
        <p>{said ?? "Check you opened the whole link from the email — it's long."}</p>
        <p>
          <Link href="/join" className="text-accent hover:underline">Apply again →</Link>
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
  const c = (await res.json()) as { status: ApiSignupStatus; continuationToken: string };

  return (
    <Shell>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">BTG SponsorX · Athlete Network</p>
        <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 12.5l4 4 8-9" />
          </svg>
          Email confirmed
        </h1>
        <p className="mt-1 text-sm text-muted">Thanks, {c.status.firstName || "there"}.</p>
      </div>
      <JoinChecklist token={c.continuationToken} initial={c.status} />
    </Shell>
  );
}
