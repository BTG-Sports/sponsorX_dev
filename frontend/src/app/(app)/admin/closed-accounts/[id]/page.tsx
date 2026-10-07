import Link from "next/link";

import { ClosedAccountDecision } from "@/components/closed-account-decision";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge } from "@/components/ui";
import {
  askedLine, byLine, historyOf, keptLine, kindWords, statusBadge, whyTitle, type ApiClosure,
} from "@/lib/closed-accounts-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One closed account — 2S1-FE-08, BTG half (Claude Design
   ClosedAccounts.dc.html: CA-2 a sponsor asking, CA-3 the decline dialog,
   CA-4 an organisation asking, CA-5 an application rejected before
   approval, CA-6 closed by the owner, CA-7 ended at coming of age, CA-8
   files deleted). Why it closed and who closed it, their request to come
   back, what coming back does, its history, and BTG's answer.

   Reads  GET  /account-closures/:id                         (2S1-BE-13)
   Writes POST /account-closures/:id/reactivation-decision   (ClosedAccountDecision → ../actions.ts)
   Reinstate is the account's own page (subjectHref): the sponsor request,
   the organisation's onboarding, the athlete's or guardian's profile.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/closed-accounts";
const TITLE = "Closed accounts";

export default async function ClosedAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const res = await apiFetch(`/account-closures/${encodeURIComponent(id)}`);
  if (!res.ok && res.status !== 403 && res.status !== 404) throw new Error(`Closed account unavailable (${res.status}).`);
  const c = res.ok ? ((await res.json()) as ApiClosure) : null;
  if (!c) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Closed accounts</Link>
        <p className="text-sm">No closed account matches this link.</p>
      </div>
    );
  }
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const st = statusBadge(c);
  const title = whyTitle(c);
  const tone = { text: "", warn: "text-warn", faint: "text-faint" } as const;

  return (
    <div className="space-y-5">
      <div>
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Closed accounts</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="sx-page-title">{c.name}</h1>
          <span className="text-xs text-muted">{kindWords(c.kind)}</span>
          <Badge tone={st.tone}><span aria-hidden="true" className="mr-1">{st.mark}</span>{st.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">{keptLine(c)}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <section aria-label={title} className={section}>
            <h2 className="text-sm font-semibold">{title}</h2>
            {c.reason && <p className="mt-1.5 text-[13px] leading-relaxed">&ldquo;{c.reason}&rdquo;</p>}
            <p className="mt-1.5 text-xs text-muted">{byLine(c)}</p>
          </section>

          {c.requestedAt && (
            <section aria-label="Their request" className={section}>
              <h2 className="text-sm font-semibold">Their request</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed">
                {c.requestNote ? <>&ldquo;{c.requestNote}&rdquo;</> : <span className="text-muted">They didn&rsquo;t add a note.</span>}
              </p>
              <p className="mt-1.5 break-words text-xs text-muted">{askedLine(c)}</p>
            </section>
          )}

          {c.reinstatable && (
            <section aria-label="What coming back does" className={section}>
              <h2 className="text-sm font-semibold">What coming back does</h2>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-relaxed">
                <li>Their logins are switched back on.</li>
                <li>Listings that were paused when it closed come back.</li>
                <li>The checks run again — anything missing goes to New sign-ups.</li>
              </ul>
            </section>
          )}

          <section aria-label="History" className={section}>
            <h2 className="text-sm font-semibold">History</h2>
            <ol className="mt-2 text-xs">
              {historyOf(c).map((h, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
                  <span className="shrink-0 text-muted sm:w-32">{h.at}</span>
                  <span className={`min-w-0 break-words ${tone[h.tone]}`}>{h.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <ClosedAccountDecision closure={c} />
      </div>
    </div>
  );
}
