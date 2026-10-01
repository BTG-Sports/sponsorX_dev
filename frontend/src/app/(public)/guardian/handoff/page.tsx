import Link from "next/link";

import { GuardianAgreementText } from "@/components/guardian-agreement";
import { HandoffStatusViews } from "@/components/handoff-status";
import { Badge, BlockedNotice, Button } from "@/components/ui";
import {
  ID_UPLOAD, RELATIONSHIPS, SUPPORT_EMAIL, guardianAgreement, handoffDemo, sampleDeclined, sampleHandoff, sampleSwitched,
} from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   /guardian/handoff — 2S1-FE-10 (Claude Design GuardianHandoff.dc.html,
   "request", "status", "declined"). Public (no login): the NEW guardian
   asks to take over a minor's account. This is the only way a handoff
   starts — the current guardian can't start one and the minor can't
   either. The current guardian answers in the athlete portal
   (/athlete/guardian-requests). A refusal, a custody question or a court
   order goes to BTG by hand (/contact) — never automated.

   SCAFFOLD — 2S1-BE-15 isn't built. When it is:
     Reads  GET  /public/guardian-handoffs/lookup?q=     the athlete, by their email or the family code
            GET  /public/guardian-handoffs/:token        this request's status (the "status" view)
     Writes POST /public/guardian-handoffs               details, documents (presigned, private bucket), agreement
   Until then every field is local and "Send request" is off.
   ?demo=status|declined previews the two later states.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Become an athlete’s guardian · SponsorX", robots: { index: false } };

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const card = "rounded-xl border border-line bg-surface p-4 sm:p-5";
const fileBtn = "min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text disabled:cursor-not-allowed disabled:opacity-40";
const NOT_YET = "Goes live with 2S1-BE-15 — nothing is sent yet.";

function SupportLine({ athlete, current }: { athlete: string; current: string }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      If this is about custody, or you can&rsquo;t reach {current}, don&rsquo;t send a request —{" "}
      <Link href="/contact?topic=guardianship" className="text-primary-soft hover:underline">
        contact BTG
      </Link>{" "}
      ({SUPPORT_EMAIL.address}, being set up). A person at BTG decides about {athlete}&rsquo;s account.
    </p>
  );
}

export default async function GuardianHandoffPage({ searchParams }: { searchParams: Promise<{ demo?: string | string[] }> }) {
  const demo = handoffDemo((await searchParams).demo);
  const r = sampleHandoff;
  const a = r.athlete.firstName;

  const notice = (
    <BlockedNotice>
      Sample data — this page goes live with 2S1-BE-15 (changing a minor&rsquo;s guardian). Nothing you type or upload is sent
      {demo ? `, and this “${demo}” view is a preview` : ""}.
    </BlockedNotice>
  );

  if (demo === "status") {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
        {notice}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Guardian handoff · what each person sees</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The same three steps, on {r.requester.firstName}&rsquo;s request page, {r.current.firstName}&rsquo;s portal and {a}&rsquo;s athlete portal. Shown after{" "}
            {r.current.firstName} handed off and {r.requester.firstName}&rsquo;s documents were checked.
          </p>
        </div>
        <HandoffStatusViews
          request={sampleSwitched}
          cta={
            <Button disabled title="Sample — the new guardian sets up payouts once 2S1-BE-15 and 2S1-BE-11 are live.">
              Set up payouts on Stripe
            </Button>
          }
        />
      </main>
    );
  }

  if (demo === "declined") {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
        {notice}
        <h1 className="text-[22px] font-bold sm:text-[28px]">Your guardian request</h1>
        <section role="status" aria-label="Request declined" className="flex flex-col items-start gap-2.5 rounded-xl border border-danger/40 bg-surface p-4 sm:p-5">
          <Badge tone="danger">
            <span aria-hidden="true" className="mr-1">✕</span>Declined
          </Badge>
          <p className="text-[15px] font-semibold">{sampleDeclined.current.firstName} declined.</p>
          <p className="text-sm leading-relaxed text-muted">
            Nothing changed on {a}&rsquo;s account. If this is about custody or you can&rsquo;t reach {sampleDeclined.current.firstName}, contact BTG support.
          </p>
          <Link
            href="/contact?topic=guardianship"
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Contact BTG
          </Link>
        </section>
        <p className="text-[11px] text-faint">Your documents are deleted 30 days after a declined request.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      {notice}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft">Become an athlete&rsquo;s guardian</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px]">Ask to become {a}&rsquo;s guardian</h1>
      </div>
      <p className="rounded-lg border border-primary/35 bg-primary/7 px-3.5 py-3 text-sm leading-relaxed">
        {r.current.name}, {a}&rsquo;s current guardian, will be asked to approve.
      </p>

      <section aria-label="Which athlete" className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold">1 · Which athlete?</h2>
        <label className="flex flex-col text-xs font-medium">
          The athlete&rsquo;s email or the family code
          <input type="text" className={field} placeholder="Email or family code" autoComplete="off" />
        </label>
        <p className="text-xs text-success">
          <span aria-hidden="true">✓ </span>Sample match: {r.athlete.name} · {r.athlete.sport} · guardian {r.current.name}
        </p>
      </section>

      <section aria-label="Your details" className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold">2 · Your details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col text-xs font-medium">
            Full name
            <input type="text" className={field} defaultValue={r.requester.name} autoComplete="name" />
          </label>
          <label className="flex flex-col text-xs font-medium">
            Relationship to {a}
            <select className={field} defaultValue={r.requester.relationship}>
              {RELATIONSHIPS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium">
            Phone
            <input type="tel" className={field} placeholder="Your phone number" autoComplete="tel" />
          </label>
          <label className="flex flex-col text-xs font-medium">
            Email
            <input type="email" className={field} placeholder="Your email" autoComplete="email" />
          </label>
        </div>
      </section>

      <section aria-label="Documents" className={`${card} grid gap-3 sm:grid-cols-2`}>
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
          <span className="text-sm font-medium text-text">3 · Government ID</span>
          <span>{ID_UPLOAD.label}</span>
          <span>Only BTG&rsquo;s reviewers can open it, and each view is recorded.</span>
          <button type="button" disabled title={NOT_YET} className={fileBtn}>
            Choose file
          </button>
        </div>
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
          <span className="text-sm font-medium text-text">4 · Proof you&rsquo;re the guardian</span>
          <span>Birth certificate naming you, court order or school record</span>
          <button type="button" disabled title={NOT_YET} className={fileBtn}>
            Choose file
          </button>
        </div>
      </section>

      <section aria-label="Agreement" className={`${card} space-y-2.5`}>
        <h2 className="text-sm font-semibold">5 · Guardian agreement</h2>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-primary-soft hover:underline">
            Read the guardian agreement <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">→</span>
          </summary>
          <div className="mt-2.5">
            <GuardianAgreementText agreement={guardianAgreement(a)} />
          </div>
        </details>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-normal">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--sx-primary)]" />
          I&rsquo;m {a}&rsquo;s guardian and I accept the guardian agreement.
        </label>
      </section>

      <button
        type="button"
        disabled
        title={NOT_YET}
        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send request to {r.current.firstName}
      </button>

      <SupportLine athlete={a} current={r.current.firstName} />
    </main>
  );
}
