import Link from "next/link";

import { HandoffDecision, HandoffDocuments } from "@/components/guardian-handoff-desk";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge } from "@/components/ui";
import {
  agreementWords, confirmPoints, deskTrack, detailBadge, outcomeOf, withRelationship, type ApiDeskHandoff, type DeskStep,
} from "@/lib/guardian-handoffs-desk-live";
import { dayOf } from "@/lib/new-signups-live";
import { apiFetch } from "@/server/api";
import { supportContact } from "@/server/support";

/* --------------------------------------------------------------------------
   One guardian handoff — 2S1-FE-10, BTG half (Claude Design
   GuardianHandoffs.dc.html, states HO-3 detail, HO-4 confirm, HO-5 decline,
   HO-6 switched, HO-7 declined, HO-8 viewer): the three steps, the athlete,
   the new guardian's details and documents, what changes when BTG confirms,
   and — for a request waiting for BTG — Confirm the switch or Decline with a
   reason. A custody dispute is never decided here: it goes to support.

   Reads  GET  /guardian-handoffs/:id                       with `staff` (2S1-BE-15)
          GET  /signup-rules/settings                       the decision panel's words
          GET  /guardian-handoffs/:id/documents/:docId      5-minute audited link (HandoffDocuments)
   Writes POST /guardian-handoffs/:id/staff-decision        (HandoffDecision → ../actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/guardian-handoffs";
const TITLE = "Guardian handoffs";

const STEP: Record<DeskStep["status"], { box: string; dot: string; note: string; mark?: string }> = {
  done: { box: "border-accent/35", dot: "bg-accent/12 text-accent", note: "text-faint", mark: "✓" },
  current: { box: "border-primary bg-primary/15", dot: "bg-primary/15 text-primary-soft", note: "text-primary-soft" },
  todo: { box: "border-line", dot: "bg-surface-2 text-faint", note: "text-faint" },
  stopped: { box: "border-danger bg-danger/12", dot: "bg-danger/12 text-danger", note: "text-danger", mark: "✕" },
};
const OUTCOME = { accent: "border-accent/40 text-accent", danger: "border-danger/45 text-danger", neutral: "border-line text-text" } as const;

export default async function GuardianHandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const [res, settingsRes] = await Promise.all([apiFetch(`/guardian-handoffs/${encodeURIComponent(id)}`), apiFetch("/signup-rules/settings")]);
  if (!res.ok && res.status !== 403 && res.status !== 404) throw new Error(`Guardian handoff unavailable (${res.status}).`);
  const h = res.ok ? ((await res.json()) as ApiDeskHandoff) : null;
  if (!h || !h.staff) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← Guardian handoffs</Link>
        <p className="text-sm">No guardian handoff matches this link — or your role can&rsquo;t open it.</p>
      </div>
    );
  }
  const staffConfirmMinors = settingsRes.ok ? ((await settingsRes.json()) as { staffConfirmMinors: boolean }).staffConfirmMinors : null;
  const s = h.staff;
  const badge = detailBadge(h);
  const steps = deskTrack(h);
  const outcome = outcomeOf(h);
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const switched = h.state === "SWITCHED";
  const asking = switched ? "now the guardian" : h.state === "DECLINED" || h.state === "CANCELLED" ? "asked to become the guardian" : "asking to become the guardian";
  const guardianLine = switched
    ? `${withRelationship(s.newGuardian?.name ?? h.requester.name, h.requester.relationship)} · was ${h.current.name}`
    : `${withRelationship(h.current.name, s.current.relationship)}${h.state === "DECLINED" ? " · unchanged" : ""}`;
  const confirmed = s.requester.emailConfirmedAt;
  /* The backend's configured SUPPORT_EMAIL — on the request itself, or read as /contact reads it. */
  const support = h.supportEmail ?? (await supportContact()).email;

  return (
    <div className="space-y-5">
      <div>
        <Link href={h.state === "HANDED_OFF" ? PATH : `${PATH}?tab=${tabOf(h.state)}`} className="text-xs text-muted hover:text-text">← Guardian handoffs</Link>
        <h1 className="sx-page-title mt-2">{TITLE}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-semibold">{h.athlete.name} · {h.current.name} → {h.requester.name}</h2>
        <Badge tone={badge.tone}><span aria-hidden="true" className="mr-1">{badge.mark}</span>{badge.label}</Badge>
      </div>

      <ol aria-label="Handoff progress" className="grid gap-2 sm:grid-cols-3">
        {steps.map((st, i) => {
          const look = STEP[st.status];
          return (
            <li key={i} aria-current={st.status === "current" ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${look.box}`}>
              <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${look.dot}`}>{look.mark ?? i + 1}</span>
              <span className="flex min-w-0 flex-col">
                <span className={st.status === "current" ? "font-bold" : st.status === "todo" ? "font-medium text-faint" : "font-medium"}>{st.label}</span>
                <span className={`text-[10px] ${look.note}`}>{st.note}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {outcome && (
        <div role="status" className={`rounded-lg border bg-surface px-3.5 py-3 ${OUTCOME[outcome.tone]}`}>
          <p className="text-sm font-semibold">{outcome.text}</p>
          {outcome.quote && <p className="mt-2 rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-text">&ldquo;{outcome.quote}&rdquo;</p>}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3.5 md:grid-cols-2">
            <section aria-label={h.athlete.name} className={section}>
              <h2 className="text-sm font-semibold">{h.athlete.name}</h2>
              <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Age</dt><dd className="min-w-0">{s.athlete.age ?? "Not given"}</dd>
                <dt className="text-muted">Sport</dt><dd className="min-w-0">{s.athlete.sport}</dd>
                <dt className="text-muted">{switched ? "Guardian" : "Current guardian"}</dt><dd className="min-w-0 break-words">{guardianLine}</dd>
              </dl>
            </section>
            <section aria-label={h.requester.name} className={section}>
              <h2 className="text-sm font-semibold">{h.requester.name} — {asking}</h2>
              <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Relationship</dt><dd className="min-w-0">{h.requester.relationship}</dd>
                <dt className="text-muted">Email</dt>
                <dd className="min-w-0 break-words">{s.requester.email} · {confirmed ? `confirmed ${dayOf(confirmed)}` : "not confirmed yet"}</dd>
                <dt className="text-muted">Phone</dt><dd className="min-w-0 break-words">{s.requester.phone ?? "Not given"}</dd>
                <dt className="text-muted">Agreement</dt><dd className="min-w-0">{agreementWords(s.requester.agreementVersion, s.requester.agreementAcceptedAt)}</dd>
              </dl>
            </section>
          </div>

          <HandoffDocuments id={h.id} documents={s.documents} />

          {h.state === "HANDED_OFF" && (
            <section aria-label="What changes when you confirm" className={section}>
              <h2 className="text-sm font-semibold">What changes when you confirm</h2>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted">
                {confirmPoints(h).map((p) => <li key={p}>{p}</li>)}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted">
            Is this a custody dispute? Don&rsquo;t decide it here — reply through{" "}
            <a href={`mailto:${support}`} className="select-all text-text hover:underline">{support}</a>.
          </p>
        </div>

        <HandoffDecision handoff={h} staffConfirmMinors={staffConfirmMinors} />
      </div>
    </div>
  );
}

function tabOf(state: ApiDeskHandoff["state"]): string {
  return state === "REQUESTED" || state === "WAITING" ? "progress" : state.toLowerCase();
}
