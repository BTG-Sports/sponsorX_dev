import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { PayoutTracker } from "@/components/payout-history";
import { SponsorRequestReview } from "@/components/sponsor-request-review";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import {
  accountTracker, initials, roleWords, stampOf, stateBadge, tabFor, type ApiSponsorRequestDetail,
} from "@/lib/sponsor-requests-live";
import { apiFetch } from "@/server/api";
import { decideSponsorRequestAction } from "../actions";

/* --------------------------------------------------------------------------
   One sponsor request — 2S1-FE-03 (Claude Design SponsorRequests.dc.html,
   SR-2 … SR-8): the business and its contact, what they told us, the
   business type BTG picks, the checks, and the decision. Once decided, the
   account's progress (SR-4) or the note that was sent (SR-6) — each step as
   the API records it, never assumed.

   Reads  GET /sponsor-requests/:id
   Writes POST /sponsor-requests/:id/decision   (./actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/sponsor-requests";
const TITLE = "Sponsor requests";

export default async function SponsorRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const res = await apiFetch(`/sponsor-requests/${encodeURIComponent(id)}`);
  if (res.status === 403) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Sponsor requests</Link>
        <p className="text-sm">No sponsor request matches this link.</p>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Sponsor request unavailable (${res.status}).`);
  const r = (await res.json()) as ApiSponsorRequestDetail;
  const tab = tabFor(r.state);

  const details = (
    <>
      <Card>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-sm font-semibold text-primary">{initials(r.businessName)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{r.businessName}</p>
            <p className="text-[11px] text-muted">Asked {stampOf(r.createdAt)} through &ldquo;Become a sponsor&rdquo;</p>
            <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
              <dt className="text-muted">Contact</dt><dd>{r.contactName}</dd>
              <dt className="text-muted">Email</dt><dd className="break-all">{r.email}</dd>
              {r.phone && (<><dt className="text-muted">Phone</dt><dd>{r.phone}</dd></>)}
            </dl>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">What they told us</h2>
        {r.answers.length ? (
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[11rem_1fr]">
            {r.answers.map((a) => (
              <div key={a.label} className="contents">
                <dt className="text-muted">{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-xs text-muted">They didn&rsquo;t add anything beyond their contact details.</p>
        )}
      </Card>
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${PATH}?tab=${tab}`} className="text-xs text-muted hover:text-text">← {tab === "waiting" ? "Waiting" : tab === "approved" ? "Approved" : "Declined"}</Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{TITLE}</h1>
      </div>

      {r.state === "NEW" ? (
        <SponsorRequestReview request={r} details={details} decide={decideSponsorRequestAction.bind(null, r.id)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">{details}</div>
          <aside>
            <Decided r={r} />
          </aside>
        </div>
      )}
    </div>
  );
}

function Decided({ r }: { r: ApiSponsorRequestDetail }) {
  const badge = stateBadge(r.state);
  const who = r.progress?.decidedBy ? `${r.progress.decidedBy.email} · ${roleWords(r.progress.decidedBy.roles)}` : "BTG";
  const steps = accountTracker(r);
  return (
    <Card>
      <p className="text-[11px] text-muted">Sponsor request</p>
      <p className="mt-1 text-lg font-semibold">{r.businessName}</p>
      <p className="mt-2"><Badge tone={badge.tone}>{badge.label}</Badge></p>
      {r.state === "APPROVED" ? (
        <div className="mt-4 space-y-3">
          <div role="status" className="rounded-lg bg-accent/10 px-3 py-2">
            <p className="text-xs font-semibold text-accent">Account opened ✓</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Approved by {who} · {stampOf(r.decidedAt)}.
              {r.progress?.categories.length ? <> Business type: {r.progress.categories.map((c) => categoryLabel(c as BrandCategory)).join(", ")}.</> : null}
            </p>
          </div>
          {steps && <PayoutTracker steps={steps} vertical />}
          <p className="text-[11px] text-muted">{r.contactName.split(/\s+/)[0]} signs in with {r.email} and lands in the sponsor portal.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-line px-3 py-2">
            <p className="text-[11px] font-medium text-muted">Note sent to {r.contactName.split(/\s+/)[0]}</p>
            <p className="mt-1 whitespace-pre-line text-xs">{r.decisionNote}</p>
          </div>
          <p className="text-[11px] text-muted">
            Declined by {who} · {stampOf(r.decidedAt)}.{" "}
            {r.progress?.emailSentAt ? `The decline email was sent to ${r.email}.` : `The decline email to ${r.email} is queued — it goes once our email service is connected.`}
          </p>
        </div>
      )}
    </Card>
  );
}
