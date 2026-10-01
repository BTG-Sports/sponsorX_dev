import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { NewSignupReview } from "@/components/new-signup-review";
import { Badge, BlockedNotice } from "@/components/ui";
import {
  KIND_WORDS, SIGNUP_BACKEND, momentOf, sampleSignup, signupBadge,
} from "@/lib/new-signups-live";

/* --------------------------------------------------------------------------
   One sign-up — 2S1-FE-07 (Claude Design NewSignups.dc.html, views athlete,
   guardian, reject and viewer): who signed up, the checks it passed when
   SponsorX approved it (or why it is held), its documents behind the
   5-minute audited viewer, its activity, and BTG's Reject / Reinstate.

   SCAFFOLD on sample data, for ORGANIZATIONS only — they are approved
   automatically once 2S1-BE-06 lands. Athletes and guardians are live at
   ./athletes/[id] and ./guardians/[id]; sponsors open their sponsor
   request (/admin/sponsor-requests/:id).

   Reads  (fixtures, lib/new-signups-live.ts)
   Writes none yet — Reject, Approve and Reinstate are off
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";
const TITLE = "New sign-ups";

export default async function NewSignupPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const s = sampleSignup(id);
  if (!s) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← New sign-ups</Link>
        <p className="text-sm">No sign-up matches this link.</p>
      </div>
    );
  }
  const badge = signupBadge(s, s.approvedAt);
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";

  const before = (
    <>
      <section aria-label="Details" className={section}>
        <h2 className="text-sm font-semibold">Details</h2>
        <dl className="mt-2 grid grid-cols-[7.5rem_1fr] text-[13px] sm:grid-cols-[10rem_1fr]">
          {s.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="border-t border-line-soft py-2 pr-3 text-muted">{d.label}</dt>
              <dd className="min-w-0 break-words border-t border-line-soft py-2">{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {s.guardianOf.length > 0 && (
        <section aria-label="Athletes" className={section}>
          <h2 className="text-sm font-semibold">Guardian of</h2>
          <ul className="mt-2">
            {s.guardianOf.map((k) => {
              const b = signupBadge(k);
              return (
                <li key={k.name} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <strong className="font-semibold">{k.name}</strong>
                    <span className="block text-[11px] text-muted">{k.sub}</span>
                  </span>
                  <Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{k.state === "AUTO_APPROVED" ? "Approved" : b.label}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {s.state === "NEEDS_REVIEW" ? (
        <section aria-label="Why it needs review" className={section}>
          <h2 className="text-sm font-semibold">Why it needs review</h2>
          <ul className="mt-2">
            {s.reasons.map((r) => (
              <li key={r} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-warn/15 text-[10px] font-bold text-warn">!</span>
                <span className="min-w-0 flex-1">{r}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Checklist when approved" className={section}>
          <h2 className="text-sm font-semibold">Checklist when approved{s.approvedAt ? ` · ${momentOf(s.approvedAt)}` : ""}</h2>
          <ul className="mt-2">
            {s.checks.map((c) => (
              <li key={c} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">✓</span>
                <span className="min-w-0 flex-1">{c}</span>
                <Badge tone="accent">Passed</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  const after = (
    <section aria-label="Activity" className={section}>
      <h2 className="text-sm font-semibold">Activity</h2>
      <ol className="mt-2 text-xs">
        {s.activity.map((a, i) => (
          <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
            <span className="shrink-0 text-muted sm:w-32">{momentOf(a.at)}</span>
            <span className="min-w-0">{a.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href={s.state === "NEEDS_REVIEW" ? `${PATH}?tab=review` : PATH} className="text-xs text-muted hover:text-text">← New sign-ups</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight">{s.name}</h1>
          <Badge><span aria-hidden="true" className="mr-1">○</span>{KIND_WORDS[s.kind]}</Badge>
          <Badge tone={badge.tone}><span aria-hidden="true" className="mr-1">{badge.mark}</span>{badge.label}</Badge>
        </div>
      </div>
      <BlockedNotice>
        Sample data — this sign-up goes live with {SIGNUP_BACKEND}. You can open the reject dialog and the document viewer to see them, but nothing is sent or recorded yet.
      </BlockedNotice>
      <NewSignupReview signup={s} before={before} after={after} />
    </div>
  );
}
