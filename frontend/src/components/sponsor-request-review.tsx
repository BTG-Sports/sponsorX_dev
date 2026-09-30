"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Badge, Card } from "@/components/ui";
import type { BrandCategory } from "@/lib/brand-categories";
import {
  approveBlock, categoryOptions, decisionChecks, stateBadge, whatHappens,
  type ApiSponsorRequestDetail, type LinkChoice, type RequestWriteFailure,
} from "@/lib/sponsor-requests-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   The request's decision — 2S1-FE-03 (design SponsorRequests.dc.html, SR-2,
   SR-3, SR-5, SR-7, SR-8). One island because the business type (left
   column) and Approve (the decision card) share state: Approve stays off,
   with the reason written under it, until a type is picked, a same-named
   sponsor is answered, and the email isn't already a login.
   -------------------------------------------------------------------------- */

type Decide = (input:
  | { decision: "APPROVE"; categories: BrandCategory[]; linkSponsorId?: string | null; newSponsor?: boolean }
  | { decision: "DECLINE"; note: string }) => Promise<{ ok: true; state: string } | RequestWriteFailure>;

export function SponsorRequestReview({ request, details, decide }: { request: ApiSponsorRequestDetail; details: ReactNode; decide: Decide }) {
  const router = useRouter();
  const [picked, setPicked] = useState<BrandCategory[]>(request.suggestedCategories.slice(0, 1));
  const [link, setLink] = useState<LinkChoice>(null);
  const [mode, setMode] = useState<"choose" | "confirm" | "decline">("choose");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const block = approveBlock(request, picked, link);
  const checks = decisionChecks(request);
  const badge = stateBadge(request.state);
  const suggestion = request.suggestedCategories[0];

  const run = async (input: Parameters<Decide>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const r = await decide(input);
      if (!r.ok) setError(r.message);
      else setMode("choose");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const approve = () =>
    run({
      decision: "APPROVE", categories: picked,
      ...(link?.kind === "link" ? { linkSponsorId: link.sponsorId } : {}),
      ...(link?.kind === "new" ? { newSponsor: true } : {}),
    });
  const toggle = (c: BrandCategory) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        {details}
        <Card>
          <fieldset>
            <legend className="text-sm font-semibold">Business type <span className="text-xs font-normal text-muted">(pick at least one)</span></legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryOptions(request.suggestedCategories).map((c) => {
                const on = picked.includes(c.value);
                return (
                  <label key={c.value} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-line text-muted hover:text-text"}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(c.value)} />
                    <span aria-hidden="true">{on ? "✓" : "+"}</span>
                    {c.label}
                  </label>
                );
              })}
            </div>
            {suggestion && request.categoryText && (
              <p className="mt-3 text-[11px] text-muted">
                {categoryOptions([suggestion])[0]!.label}: suggested from &ldquo;{request.categoryText}&rdquo;
              </p>
            )}
            {!picked.length && <p role="alert" className="mt-2 text-[11px] text-warn">Pick at least one business type before approving.</p>}
            <p className="mt-2 text-[11px] text-muted">This is what the clash check uses. An athlete who won&rsquo;t work with this category never sees their briefs.</p>
          </fieldset>
        </Card>
      </div>

      <aside>
        <Card>
          <p className="text-[11px] text-muted">Sponsor request</p>
          <p className="mt-1 text-lg font-semibold">{request.businessName}</p>
          <p className="mt-2"><Badge tone={badge.tone}>{badge.label}</Badge></p>

          <ul aria-label="Checks" className="mt-4 space-y-3 border-t border-line-soft pt-4">
            {checks.map((c) => (
              <li key={c.key} className="text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-start gap-1.5">
                    <span aria-hidden="true" className={c.ok ? "text-accent" : "text-warn"}>{c.ok ? "✓" : "●"}</span>
                    <span>{c.label}</span>
                  </span>
                  <span className={`shrink-0 text-[10px] ${c.ok ? "text-accent" : "text-warn"}`}>{c.status}</span>
                </div>
                {c.key === "name" && !c.ok && (
                  <fieldset className="mt-2 space-y-2 pl-5">
                    <legend className="text-[11px] text-muted">What should approving do?</legend>
                    {request.checks.matches.map((m) => (
                      <label key={m.id} className={`flex items-start gap-2 rounded-lg border border-line px-3 py-2 ${m.hasLogin ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                        <input type="radio" name="link" className="mt-0.5" disabled={m.hasLogin} checked={link?.kind === "link" && link.sponsorId === m.id} onChange={() => setLink({ kind: "link", sponsorId: m.id })} />
                        <span>
                          <strong className="block text-xs">Link to it</strong>
                          <span className="block text-[11px] text-muted">
                            Use the existing &ldquo;{m.name}&rdquo;{m.fromZoho ? ", already in Zoho" : ""}. No second sponsor is created.
                            {m.hasLogin ? " It already has people signing in, so it can’t be linked here." : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2">
                      <input type="radio" name="link" className="mt-0.5" checked={link?.kind === "new"} onChange={() => setLink({ kind: "new" })} />
                      <span>
                        <strong className="block text-xs">Create a new one</strong>
                        <span className="block text-[11px] text-muted">It&rsquo;s a different business with the same name.</span>
                      </span>
                    </label>
                  </fieldset>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-line-soft pt-4">
            {mode === "decline" ? (
              <div className="space-y-2">
                <label htmlFor="decline-note" className="block text-xs font-medium">
                  Tell {request.businessName} why. <span className="text-warn">(required)</span>
                </label>
                <p id="decline-hint" className="text-[11px] text-muted">They&rsquo;ll read this in an email.</p>
                <textarea
                  id="decline-note" aria-describedby="decline-hint" rows={5} maxLength={2000} value={note}
                  onChange={(e) => setNote(e.target.value)} placeholder="Write the reason in plain words"
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-primary"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !note.trim()} onClick={() => run({ decision: "DECLINE", note: note.trim() })} className="rounded-lg border border-warn/60 px-3.5 py-2 text-xs font-medium text-warn disabled:opacity-40">
                    {busy ? "Declining…" : "Send and decline"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setMode("choose")} className="rounded-lg border border-line px-3.5 py-2 text-xs text-muted">Cancel</button>
                </div>
                {!note.trim() && <p className="text-[11px] text-muted">Write a note to turn on &ldquo;Send and decline&rdquo;.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <button type="button" disabled={busy || Boolean(block)} onClick={() => setMode("confirm")} aria-describedby={block ? "approve-why" : undefined}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40">
                  Approve and open account
                </button>
                {block && <p id="approve-why" role="alert" className="text-[11px] text-warn"><strong>Can&rsquo;t approve yet: </strong>{block}</p>}
                <button type="button" disabled={busy} onClick={() => setMode("decline")} className="w-full rounded-lg border border-line px-4 py-2 text-xs font-medium text-text hover:bg-surface-2">
                  Decline
                </button>
                <p className="text-[11px] text-muted">Approving creates {request.businessName}&rsquo;s account and a login for {request.email}, and emails a sign-in link.</p>
              </div>
            )}
            {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          </div>
        </Card>
      </aside>

      {mode === "confirm" && (
        <ConfirmApprove
          title={`Open ${request.businessName}’s account?`}
          steps={whatHappens(request, picked, link)}
          busy={busy}
          onCancel={() => setMode("choose")}
          onApprove={approve}
        />
      )}
    </div>
  );
}

function ConfirmApprove({ title, steps, busy, onCancel, onApprove }: { title: string; steps: string[]; busy: boolean; onCancel: () => void; onApprove: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onCancel);
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="approve-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onCancel} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md rounded-2xl border border-line bg-bg p-5 shadow-2xl">
          <h2 id="approve-title" className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 text-xs text-muted">This is what happens when you approve:</p>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-primary/60 bg-primary/15 text-[10px] text-primary">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" data-autofocus disabled={busy} onClick={onApprove} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-cta-ink disabled:opacity-40">
              {busy ? "Opening…" : "Approve and open account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
