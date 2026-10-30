import Link from "next/link";

import { ClosureRequestDecision } from "@/components/closure-request-decision";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge } from "@/components/ui";
import { heldSinceLine, kindWords, momentOf, nowView, requestStateBadge, type ApiClosureRequestDetail } from "@/lib/closed-accounts-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One closure held for BTG — POL-FE-11 (POL-BE-11). The owner asked to
   close, but a live deal, money with no payout account, or a minor still in
   a guardian's care was left behind: the account stays open until BTG has
   settled those. This page shows why it was held, what is still live NOW
   (read fresh by the API), and offers Close now / Decline.

   Reads  GET  /account-closure-requests/:id                 now + canClose
   Writes POST /account-closure-requests/:id/close           (ClosureRequestDecision → ../../actions.ts)
          POST /account-closure-requests/:id/decline  { note }
   BTG admins only (accountClosure read / approve).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/closed-accounts";
const TITLE = "Closed accounts";

export default async function ClosureRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const { id } = await params;
  const res = await apiFetch(`/account-closure-requests/${encodeURIComponent(id)}`);
  if (!res.ok && res.status !== 403 && res.status !== 404) throw new Error(`Closure request unavailable (${res.status}).`);
  const r = res.ok ? ((await res.json()) as ApiClosureRequestDetail) : null;
  if (!r) {
    return (
      <div className="space-y-4">
        <Link href={`${PATH}?tab=closing`} className="text-xs text-muted hover:text-text">← Waiting to close</Link>
        <p className="text-sm">No closure request matches this link.</p>
      </div>
    );
  }
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const st = requestStateBadge(r.state);
  const now = nowView(r);
  const held = r.state === "HELD";

  return (
    <div className="space-y-5">
      <div>
        <Link href={`${PATH}?tab=closing`} className="text-xs text-muted hover:text-text">← Waiting to close</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="sx-page-title">{r.accountName || "An account"}</h1>
          <span className="text-xs text-muted">{kindWords(r.account)}</span>
          <Badge tone={st.tone}><span aria-hidden="true" className="mr-1">{st.mark}</span>{st.label}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">{held ? heldSinceLine(r.requestedAt) : `Asked ${momentOf(r.requestedAt)}${r.decidedAt ? ` · decided ${momentOf(r.decidedAt)}` : ""}`}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {held && (
            <section aria-label={now.title} className={`${section} ${now.canClose ? "border-accent/40" : "border-warn/40"}`}>
              <h2 className={`text-sm font-semibold ${now.canClose ? "text-accent" : "text-warn"}`}>{now.title}</h2>
              {now.deals.length > 0 && (
                <ul className="mt-2 divide-y divide-line-soft">
                  {now.deals.map((d) => (
                    <li key={d.id} className="flex flex-col gap-0.5 py-2 text-[13px] sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="min-w-0 font-medium">{d.title}</span>
                      <span className="text-xs text-muted">{d.sponsor} · {d.state}{d.who ? ` · ${d.who}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              {now.lines.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] leading-relaxed">
                  {now.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              )}
              {!now.canClose && (
                <p className="mt-2 text-xs leading-relaxed text-muted">Settle each deal with the usual tools (the order, the sale, the payout account, the guardian handoff). This list is read again every time the page opens.</p>
              )}
            </section>
          )}

          <section aria-label="Why it was held" className={section}>
            <h2 className="text-sm font-semibold">Why it was held</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px] leading-relaxed">
              {r.holdReasons.map((x) => <li key={x}>{x}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted">As it stood when they asked, {momentOf(r.requestedAt)}. The owner, BTG and each live deal&rsquo;s sponsor were emailed.</p>
          </section>

          <section aria-label="Their reason" className={section}>
            <h2 className="text-sm font-semibold">Their reason for closing</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed">
              {r.reason ? <>&ldquo;{r.reason}&rdquo;</> : <span className="text-muted">They didn&rsquo;t add one.</span>}
            </p>
          </section>

          {r.state === "DECLINED" && r.declineNote && (
            <section aria-label="BTG's answer" className={section}>
              <h2 className="text-sm font-semibold">BTG&rsquo;s answer</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed">&ldquo;{r.declineNote}&rdquo;</p>
            </section>
          )}
          {r.state === "CLOSED" && r.closureId && (
            <p className="text-xs text-muted">
              Closed. <Link href={`${PATH}/${encodeURIComponent(r.closureId)}`} className="text-primary-soft hover:underline">Open the closed account →</Link>
            </p>
          )}
        </div>

        <ClosureRequestDecision request={r} now={now} />
      </div>
    </div>
  );
}
