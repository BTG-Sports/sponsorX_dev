import { handoffTrack, handoffViews, type ApiHandoffRequest, type TrackStep } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   A guardian handoff's status, as each person sees it — 2S1-FE-10 (design
   GuardianHandoff.dc.html, "status"). The same three steps on the new
   guardian's request page, the current guardian's portal and the athlete's
   portal; only the heading and the line under it differ. Every step's tick
   comes from a timestamp on the request (handoffTrack), never from the page.
   -------------------------------------------------------------------------- */

const DOT: Record<TrackStep["status"], string> = {
  done: "bg-success/14 text-success",
  current: "bg-primary/15 text-primary-soft",
  todo: "bg-surface-2 text-faint",
  stopped: "bg-danger/12 text-danger",
};
const MARK: Record<TrackStep["status"], string> = { done: "✓", current: "●", todo: "○", stopped: "✕" };

export function HandoffTrack({ request }: { request: ApiHandoffRequest }) {
  const steps = handoffTrack(request);
  return (
    <ol className="divide-y divide-line-soft border-t border-line-soft">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2.5 py-2 text-xs">
          <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${DOT[s.status]}`}>
            {MARK[s.status]}
          </span>
          <span className={`min-w-0 flex-1 ${i === steps.length - 1 && s.status === "done" ? "font-bold" : "font-medium"}`}>{s.label}</span>
          <span className="shrink-0 text-[11px] text-muted">{s.note}</span>
        </li>
      ))}
    </ol>
  );
}

/** All three people side by side — the design's explainer of one handoff. */
export function HandoffStatusViews({ request, cta }: { request: ApiHandoffRequest; cta?: React.ReactNode }) {
  const views = handoffViews(request);
  return (
    <div className="grid gap-3.5 md:grid-cols-3">
      {views.map((v, i) => (
        <section key={v.who} aria-label={v.who} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{v.who}</p>
          <p className="text-sm font-semibold">{v.head}</p>
          <HandoffTrack request={request} />
          <p className="text-xs leading-relaxed text-muted">{v.foot}</p>
          {i === 0 && cta}
        </section>
      ))}
    </div>
  );
}
