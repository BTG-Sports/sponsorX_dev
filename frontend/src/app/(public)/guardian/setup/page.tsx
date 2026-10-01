import Link from "next/link";

import { GuardianSetupWizard } from "@/components/guardian-setup-wizard";
import { BlockedNotice } from "@/components/ui";
import { sampleGuardianSetup, setupDemo } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   /guardian/setup — 2S1-FE-06, the guardian half (Claude Design
   GuardianSetup.dc.html, N5). Public (no login): the page a minor's guardian
   reaches from the email the minor's sign-up sends them. Five steps — their
   details, a government ID, proof they're the guardian, the guardian
   agreement, done — then "approved" once the automatic checks pass.

   SCAFFOLD — 2S1-BE-10 isn't built. When it is, the email link carries the
   guardian's token as /onboarding/<token> does (opening it is what confirms
   the guardian's email), and this page will read and write:
     Reads  GET  /public/guardian/:token                   who named them, what's still needed
     Writes PATCH /public/guardian/:token                  details
            POST  /public/guardian/:token/documents        ID and proof → presigned upload (private bucket)
            POST  /public/guardian/:token/accept           the agreement
   Until then it renders the sample for anyone, the steps move locally and
   nothing is sent. ?demo=done|approved previews the two after-finishing
   states and never reaches the API.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Guardian set-up · SponsorX", robots: { index: false } };

export default async function GuardianSetupPage({ searchParams }: { searchParams: Promise<{ demo?: string | string[] }> }) {
  const preview = setupDemo((await searchParams).demo);
  const s = sampleGuardianSetup;
  const a = s.athlete.firstName;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      <BlockedNotice>
        Sample data — this page goes live with 2S1-BE-10 (minors and their guardians). You can move between the steps, but nothing you type or upload is
        sent{preview ? `, and this “${preview}” view is a preview` : ""}.
      </BlockedNotice>

      {s.guardian.emailConfirmed && (
        <p role="status" className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-3 py-1 text-xs font-semibold text-success">
          <span aria-hidden="true">✓</span>Opening this link confirmed your email
        </p>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft">Guardian set-up</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px]">{s.athlete.name} named you as their guardian on SponsorX.</h1>
      </div>
      <section aria-label="What a guardian does" className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
        <p className="text-sm leading-relaxed">
          As {a}&rsquo;s guardian, you approve every agreement and payment for {a}. {a} can upload their own content, and you&rsquo;ll get an email each time.
        </p>
      </section>

      <GuardianSetupWizard setup={s} preview={preview} />

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
