import Link from "next/link";

import { GuardianSetupWizard } from "@/components/guardian-setup-wizard";
import { LinkExpired } from "@/components/link-expired";
import { BlockedNotice } from "@/components/ui";
import { linkExpiredFrom } from "@/lib/link-expired";
import { refusalMessage } from "@/lib/onboarding-live";
import { sampleGuardianSetup, setupDemo, type ApiGuardianSetupLive } from "@/lib/guardian-live";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   /guardian/setup?t=<token> — 2S1-FE-06, the guardian half (Claude Design
   GuardianSetup.dc.html, N5). Public (no login): the page a minor's guardian
   reaches from the email the minor's sign-up sends them. Five steps — their
   details, a government ID, proof they're the guardian, the guardian
   agreement, done — then "approved" once the automatic checks pass. A
   guardian already verified for another child gets three: proof naming
   THIS child, the agreement for them, done (proof is per child, 2S1-BE-10).

   LIVE since 2S1-BE-10. The email link carries the guardian's signed token
   (it names the guardian and the athlete who named them):
     Writes POST  /public/guardian-setup/open {token}        on render — opening the link IS the
                                                             email confirmation; a second open is harmless
            PATCH /public/guardian-setup/:token              details           (./actions.ts)
            POST  /public/guardian-setup/:token/documents    ID and proof → presigned PUT, private bucket
            POST  /public/guardian-setup/:token/accept       the agreement, against the text shown
   ?demo=done|approved previews the two after-finishing states on the sample
   guardian and never reaches the API.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Guardian set-up · SponsorX", robots: { index: false } };

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

export default async function GuardianSetupPage({ searchParams }: { searchParams: Promise<{ demo?: string | string[]; t?: string | string[] }> }) {
  const sp = await searchParams;
  const preview = setupDemo(sp.demo);
  const token = typeof sp.t === "string" ? sp.t.trim() : "";

  if (preview) {
    const s = sampleGuardianSetup;
    return (
      <Shell athleteName={s.athlete.name} first={s.athlete.firstName} emailConfirmed>
        <BlockedNotice>Preview — this “{preview}” view shows the sample guardian. Nothing here is sent.</BlockedNotice>
        <GuardianSetupWizard mode={{ kind: "preview", setup: s, preview }} />
      </Shell>
    );
  }

  if (!token) {
    return (
      <Plain title="Open the link from your email">
        <p>This page is reached from the email SponsorX sent you when an athlete named you as their guardian. Open the whole link from that email — it&rsquo;s long.</p>
        <p>
          Not expecting one? <Link href="/contact?topic=guardianship" className="text-primary-soft hover:underline">Tell BTG</Link>.
        </p>
      </Plain>
    );
  }

  const res = await publicApi("/public/guardian-setup/open", { method: "POST", body: JSON.stringify({ token }) });
  if (res.status === 410) {
    /* 2S8-FE-01: older than 14 days — a fresh one can be emailed. */
    const gone = linkExpiredFrom(410, await res.json().catch(() => null), "guardian-setup");
    if (gone) {
      return (
        <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
          <LinkExpired kind={gone.kind} token={token} what="the guardian set-up link" />
        </main>
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
    return (
      <Plain title={res.status === 404 ? "This link is no longer valid" : "This link isn't complete"}>
        <p>{said ?? "Check you opened the whole link from the email — it's long."}</p>
        <p>
          If it still doesn&rsquo;t work, <Link href="/contact?topic=guardianship" className="text-primary-soft hover:underline">contact BTG</Link>.
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
  if (!res.ok) throw new Error(`Your guardian set-up couldn't be opened (${res.status}).`);
  const live = (await res.json()) as ApiGuardianSetupLive;

  return (
    <Shell athleteName={live.athlete.name} first={live.athlete.firstName} emailConfirmed={live.guardian.emailConfirmed}>
      <GuardianSetupWizard mode={{ kind: "live", token, setup: live }} />
    </Shell>
  );
}

function Shell({ athleteName, first: a, emailConfirmed, children }: { athleteName: string; first: string; emailConfirmed: boolean; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      {emailConfirmed && (
        <p role="status" className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-xs font-semibold text-success">
          <span aria-hidden="true">✓</span>Opening this link confirmed your email
        </p>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft">Guardian set-up</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px]">{athleteName} named you as their guardian on SponsorX.</h1>
      </div>
      <section aria-label="What a guardian does" className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
        <p className="text-sm leading-relaxed">
          As {a}&rsquo;s guardian, you approve every agreement and payment for {a}. {a} can upload their own content, and you&rsquo;ll get an email each time.
        </p>
      </section>

      {children}

      <p className="text-[11px] text-faint">
        Not {a}&rsquo;s guardian?{" "}
        <Link href="/contact?topic=guardianship" className="text-primary-soft hover:underline">
          Tell BTG
        </Link>{" "}
        and we&rsquo;ll stop the request.
      </p>
    </main>
  );
}
