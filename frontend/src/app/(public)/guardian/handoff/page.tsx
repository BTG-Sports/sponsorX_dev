import Link from "next/link";
import { redirect } from "next/navigation";

import { HandoffRequestSteps } from "@/components/handoff-request-steps";
import { HandoffStartForm } from "@/components/handoff-start-form";
import { HandoffStatusViews, HandoffTrack } from "@/components/handoff-status";
import { Badge, BlockedNotice, Button } from "@/components/ui";
import { handoffDemo, handoffViews, sampleDeclined, sampleHandoff, sampleSwitched, type ApiHandoffRequest } from "@/lib/guardian-live";
import { refusalMessage } from "@/lib/onboarding-live";
import { supportContact, type SupportContact } from "@/server/support";
import { publicApi } from "../../onboarding/public-api";

/* --------------------------------------------------------------------------
   /guardian/handoff — 2S1-FE-10 (Claude Design GuardianHandoff.dc.html,
   "request", "status", "declined"). Public (no login): the NEW guardian
   asks to take over a minor's account. This is the only way a handoff
   starts — the current guardian can't start one and the minor can't
   either. The current guardian answers in the athlete portal
   (/athlete/guardian-requests). A refusal, a custody question or a court
   order goes to BTG by hand (/contact) — never automated.

   LIVE (2S1-BE-15):
     Reads  GET  /public/guardian-handoffs/lookup?athleteEmail=   the athlete (handoff-start-form)
            GET  /public/guardian-handoffs/:token                this request's status (?r=)
            GET  /public/support                                 the support address
     Writes POST /public/guardian-handoffs                       start      (handoff-start-form → actions.ts)
            POST /public/guardian-handoffs/confirm-email         on render, from the email link (?e=)
            POST …/:token/documents (+ /confirm)                 ID and proof, presigned, private bucket
            POST …/:token/submit                                 agreement accepted, sent to the current guardian

   ?demo=status|declined previews the two later states with sample people.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Become an athlete’s guardian · SponsorX", robots: { index: false } };
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const shell = "mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12";

function SupportLine({ athlete, current, support }: { athlete: string; current: string; support: SupportContact }) {
  return (
    <p className="text-xs leading-relaxed text-muted">
      If this is about custody, or you can&rsquo;t reach {current}, don&rsquo;t send a request —{" "}
      <Link href="/contact?topic=guardianship" className="text-primary-soft hover:underline">
        contact BTG
      </Link>{" "}
      ({support.email}{support.ready ? "" : ", being set up"}). A person at BTG decides about {athlete}&rsquo;s account.
    </p>
  );
}

function Declined({ r, support }: { r: ApiHandoffRequest; support: SupportContact }) {
  return (
    <>
      <h1 className="text-[22px] font-bold sm:text-[28px]">Your guardian request</h1>
      <section role="status" aria-label="Request declined" className="flex flex-col items-start gap-2.5 rounded-xl border border-danger/40 bg-surface p-4 sm:p-5">
        <Badge tone="danger">
          <span aria-hidden="true" className="mr-1">✕</span>Declined
        </Badge>
        <p className="text-[15px] font-semibold">{r.current.firstName} declined.</p>
        <p className="text-sm leading-relaxed text-muted">
          Nothing changed on {r.athlete.firstName}&rsquo;s account. If this is about custody or you can&rsquo;t reach {r.current.firstName}, contact BTG support
          at {support.email}.
        </p>
        <Link
          href="/contact?topic=guardianship"
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft"
        >
          Contact BTG
        </Link>
      </section>
      <p className="text-[11px] text-faint">Your documents are deleted 30 days after a declined request.</p>
    </>
  );
}

function BadLink({ said }: { said?: string }) {
  return (
    <main className={shell}>
      <h1 className="text-[22px] font-bold sm:text-[28px]">This link doesn&rsquo;t work</h1>
      <p className="text-sm text-muted">{said ?? "It may have expired, or the email cut it short."} Start the request again — it takes a few minutes.</p>
      <Link href="/guardian/handoff" className="text-sm text-primary-soft hover:underline">Start again →</Link>
    </main>
  );
}

export default async function GuardianHandoffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const demo = handoffDemo(sp.demo);
  const support = await supportContact();

  if (demo) {
    const notice = <BlockedNotice>Preview with sample people — this &ldquo;{demo}&rdquo; view shows a later state of a request. Nothing is sent.</BlockedNotice>;
    if (demo === "status") {
      const r = sampleHandoff;
      return (
        <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
          {notice}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Guardian handoff · what each person sees</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              The same three steps, on {r.requester.firstName}&rsquo;s request page, {r.current.firstName}&rsquo;s portal and {r.athlete.firstName}&rsquo;s athlete portal.
              Shown after {r.current.firstName} handed off and {r.requester.firstName}&rsquo;s documents were checked.
            </p>
          </div>
          <HandoffStatusViews request={sampleSwitched} cta={<Button disabled title="Preview — nothing is sent.">Set up payouts on Stripe</Button>} />
        </main>
      );
    }
    return <main className={shell}>{notice}<Declined r={sampleDeclined} support={support} /></main>;
  }

  /* The link in the confirmation email: opening it IS the confirmation. */
  const emailToken = first(sp.e);
  if (emailToken) {
    const res = await publicApi("/public/guardian-handoffs/confirm-email", { method: "POST", body: JSON.stringify({ token: emailToken }) }).catch(() => null);
    if (!res) throw new Error("The guardian handoff service is unavailable.");
    if (res.status === 400 || res.status === 404) return <BadLink said={refusalMessage(await res.json().catch(() => null)) ?? undefined} />;
    if (!res.ok) throw new Error(`Confirming the email failed (${res.status}).`);
    const { token } = (await res.json()) as { token: string };
    redirect(`/guardian/handoff?r=${encodeURIComponent(token)}`);
  }

  const token = first(sp.r);
  if (token) {
    const res = await publicApi(`/public/guardian-handoffs/${encodeURIComponent(token)}`).catch(() => null);
    if (!res) throw new Error("The guardian handoff service is unavailable.");
    if (res.status === 400 || res.status === 404) return <BadLink />;
    if (!res.ok) throw new Error(`Request status unavailable (${res.status}).`);
    const r = (await res.json()) as ApiHandoffRequest;
    const a = r.athlete.firstName;

    if (r.state === "DECLINED") return <main className={shell}><Declined r={r} support={support} /></main>;
    if (r.state === "REQUESTED") {
      return (
        <main className={shell}>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft">Become an athlete&rsquo;s guardian</p>
            <h1 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px]">Ask to become {a}&rsquo;s guardian</h1>
          </div>
          <p className="rounded-lg border border-primary/35 bg-primary/7 px-3.5 py-3 text-sm leading-relaxed">
            {r.current.firstName}, {a}&rsquo;s current guardian, will be asked to approve once you send this.
          </p>
          <HandoffRequestSteps token={token} request={r} />
          <SupportLine athlete={a} current={r.current.firstName} support={support} />
        </main>
      );
    }
    /* WAITING, SWITCHED or CANCELLED: where it stands, as the new guardian sees it. */
    const mine = handoffViews(r)[0]!;
    return (
      <main className={shell}>
        <h1 className="text-[22px] font-bold sm:text-[28px]">Your guardian request</h1>
        <section aria-label="Request status" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <p className="text-sm font-semibold">{mine.head}</p>
          <HandoffTrack request={r} />
          <p className="text-xs leading-relaxed text-muted">{mine.foot}</p>
          {r.state === "SWITCHED" && (
            <Link href="/athlete" className="inline-flex min-h-11 items-center justify-center self-start rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink hover:bg-primary-soft">
              Sign in to set up payouts on Stripe
            </Link>
          )}
        </section>
        <SupportLine athlete={a} current={r.current.firstName} support={support} />
      </main>
    );
  }

  return (
    <main className={shell}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-soft">Become an athlete&rsquo;s guardian</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight sm:text-[28px]">Ask to become an athlete&rsquo;s guardian</h1>
      </div>
      <HandoffStartForm />
      <SupportLine athlete="the athlete" current="the current guardian" support={support} />
    </main>
  );
}
