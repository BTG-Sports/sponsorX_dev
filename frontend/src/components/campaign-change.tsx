"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  changeFormFrom,
  confirmButton,
  outcomeMessage,
  proposalFrom,
  proposalLines,
  reasonProblem,
  type ApiCampaignActionResult,
  type ApiCampaignImpact,
  type CampaignActionKind,
  type CampaignCurrent,
  type ChangeForm,
  type ChangeProposal,
} from "@/lib/campaign-change-live";
import { CampaignDialog, ImpactView, dialogBtn, fieldCls } from "./campaign-impact";

/* --------------------------------------------------------------------------
   P8-FE-12 — the Change campaign and Cancel campaign buttons, on the
   sponsor's campaign page (Stadium Board) and BTG's (Mission Control).

   Cancel: reads GET /campaigns/{id}/cancel-impact, then the modal — the
   affected products, their outcomes, the money, why BTG has to approve it —
   asks for a reason, and POSTs /cancel. Change: a form with the name, the
   dates and the budget; Continue POSTs /change-impact with only what
   changed and opens the same modal; confirming POSTs /change. The outcome
   ("Campaign cancelled", "Changes saved", "Sent to BTG — …") is shown and
   the page's data refreshed. The server actions are passed in, so the one
   component serves both portals; the page decides who sees the buttons
   (lib/campaign-change-live campaignButtons).
   -------------------------------------------------------------------------- */

type Fail = { ok: false; message: string; unavailable?: boolean };
export type ImpactRead = { ok: true; impact: ApiCampaignImpact } | Fail;
export type ActResult = ({ ok: true } & ApiCampaignActionResult) | Fail;

export type CampaignChangeActions = {
  cancelImpact: (campaignId: string) => Promise<ImpactRead>;
  changeImpact: (campaignId: string, proposal: ChangeProposal) => Promise<ImpactRead>;
  cancel: (campaignId: string, reason: string) => Promise<ActResult>;
  change: (campaignId: string, proposal: ChangeProposal, reason: string) => Promise<ActResult>;
};

type Step =
  | { kind: "form" }
  | { kind: "impact"; action: CampaignActionKind; impact: ApiCampaignImpact; proposal: ChangeProposal | null }
  | { kind: "done"; message: string; reasons: string[] };

const triggerCls = {
  change: "inline-flex items-center rounded-lg border border-line bg-surface px-3.5 py-2 text-[11px] font-medium text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
  cancel: "inline-flex items-center rounded-lg border border-danger/40 bg-surface px-3.5 py-2 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
} as const;

export function CampaignChangeControls({ campaign, show, actions, demo = false }: {
  campaign: CampaignCurrent & { id: string };
  show: { change: boolean; cancel: boolean };
  actions: CampaignChangeActions;
  /** Sample data: the buttons explain themselves instead of calling the API. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  /* Lives here so "Back" from the impact modal keeps what was typed. */
  const [form, setForm] = useState<ChangeForm>(() => changeFormFrom(campaign));
  const [notice, setNotice] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!show.change && !show.cancel) return null;

  const openCancel = () => {
    setNotice(null);
    if (demo) return setNotice({ tone: "info", text: "Sample data — Cancel and Change work on a real campaign." });
    start(async () => {
      const r = await actions.cancelImpact(campaign.id);
      if (!r.ok) return setNotice({ tone: r.unavailable ? "info" : "bad", text: r.message });
      setStep({ kind: "impact", action: "cancel", impact: r.impact, proposal: null });
    });
  };
  const openChange = () => {
    setNotice(null);
    if (demo) return setNotice({ tone: "info", text: "Sample data — Cancel and Change work on a real campaign." });
    setStep({ kind: "form" });
  };
  const finished = (r: ActResult) => {
    if (!r.ok) return r.message;
    setStep({ kind: "done", message: outcomeMessage(r.outcome), reasons: r.reasons ?? [] });
    router.refresh();
    return null;
  };

  return (
    <>
      {show.change && (
        <button type="button" className={triggerCls.change} onClick={openChange} disabled={pending}>
          Change campaign
        </button>
      )}
      {show.cancel && (
        <button type="button" className={triggerCls.cancel} onClick={openCancel} disabled={pending}>
          {pending ? "Checking…" : "Cancel campaign"}
        </button>
      )}
      {notice && (
        <p role={notice.tone === "bad" ? "alert" : "status"} className={`order-last basis-full text-[11px] ${notice.tone === "bad" ? "text-danger" : "text-muted"}`}>
          {notice.text}
        </p>
      )}

      {step?.kind === "form" && (
        <ChangeFormDialog
          campaign={campaign}
          form={form}
          setForm={setForm}
          readImpact={(p) => actions.changeImpact(campaign.id, p)}
          onClose={() => setStep(null)}
          onImpact={(impact, proposal) => setStep({ kind: "impact", action: "change", impact, proposal })}
          onUnavailable={(text) => {
            setStep(null);
            setNotice({ tone: "info", text });
          }}
        />
      )}

      {step?.kind === "impact" && (
        <ImpactDialog
          campaignName={campaign.name}
          action={step.action}
          impact={step.impact}
          proposal={step.proposal}
          onClose={() => setStep(null)}
          onBack={step.action === "change" ? () => setStep({ kind: "form" }) : undefined}
          confirm={async (reason) => {
            const r = step.action === "cancel" ? await actions.cancel(campaign.id, reason) : await actions.change(campaign.id, step.proposal ?? {}, reason);
            return finished(r);
          }}
        />
      )}

      {step?.kind === "done" && (
        <CampaignDialog id={`cc-done-${campaign.id}`} title={step.message} onClose={() => setStep(null)} onSubmit={() => setStep(null)}>
          {step.reasons.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted">
              {step.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="submit" data-autofocus className={dialogBtn.primary}>
              OK
            </button>
          </div>
        </CampaignDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------- the change form */

function ChangeFormDialog({ campaign, form, setForm, readImpact, onClose, onImpact, onUnavailable }: {
  campaign: CampaignCurrent & { id: string };
  form: ChangeForm;
  setForm: (next: (f: ChangeForm) => ChangeForm) => void;
  readImpact: (proposal: ChangeProposal) => Promise<ImpactRead>;
  onClose: () => void;
  onImpact: (impact: ApiCampaignImpact, proposal: ChangeProposal) => void;
  onUnavailable: (text: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof ChangeForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const id = `cc-form-${campaign.id}`;
  const submit = () => {
    setError(null);
    const p = proposalFrom(campaign, form);
    if (!p.ok) return setError(p.message);
    start(async () => {
      const r = await readImpact(p.proposal);
      if (!r.ok) {
        if (r.unavailable) return onUnavailable(r.message);
        return setError(r.message);
      }
      onImpact(r.impact, p.proposal);
    });
  };
  return (
    <CampaignDialog id={id} title="Change campaign" onClose={onClose} onSubmit={submit}>
      <p className="text-[13px] leading-relaxed text-muted">
        Change the name, the dates or the budget. Next you&rsquo;ll see what it affects before anything is saved.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] font-semibold">Name</label>
        <input id={`${id}-name`} data-autofocus type="text" maxLength={200} value={form.name} onChange={(e) => set("name")(e.target.value)} className={fieldCls} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-start`} className="text-[13px] font-semibold">Starts</label>
          <input id={`${id}-start`} type="date" value={form.startDate} onChange={(e) => set("startDate")(e.target.value)} className={fieldCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-end`} className="text-[13px] font-semibold">Ends</label>
          <input id={`${id}-end`} type="date" value={form.endDate} onChange={(e) => set("endDate")(e.target.value)} className={fieldCls} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-budget`} className="text-[13px] font-semibold">
          Budget <span className="font-normal text-muted">(whole dollars)</span>
        </label>
        <input id={`${id}-budget`} type="text" inputMode="numeric" placeholder={campaign.budget === undefined ? "e.g. 12400" : undefined} value={form.budget} onChange={(e) => set("budget")(e.target.value)} className={fieldCls} />
        <p className="text-[11px] text-muted">A budget below what&rsquo;s already committed is refused, with the figure.</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={dialogBtn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={pending} className={dialogBtn.primary}>
          {pending ? "Checking…" : "Continue"}
        </button>
      </div>
    </CampaignDialog>
  );
}

/* ------------------------------------------------------- the impact modal */

function ImpactDialog({ campaignName, action, impact, proposal, onClose, onBack, confirm }: {
  campaignName: string;
  action: CampaignActionKind;
  impact: ApiCampaignImpact;
  proposal: ChangeProposal | null;
  onClose: () => void;
  onBack?: () => void;
  /** Resolves to an error message, or null when it went through. */
  confirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reasonRequired = action === "cancel";
  const button = confirmButton(action, impact);
  const problem = reasonProblem(reason, reasonRequired);
  const off = button.disabled || problem !== null;
  const id = `cc-impact-${action}`;
  const submit = () => {
    setError(null);
    if (button.disabled) return setError(button.why);
    if (problem) return setError(problem);
    start(async () => {
      const message = await confirm(reason.trim());
      if (message) setError(message);
    });
  };
  const lines = proposalLines(proposal);
  return (
    <CampaignDialog id={id} title={action === "cancel" ? `Cancel ${campaignName}?` : `Change ${campaignName}?`} onClose={onClose} onSubmit={submit}>
      {lines.length > 0 && (
        <ul className="space-y-0.5 text-[13px]" aria-label="What changes">
          {lines.map((l) => (
            <li key={l} className="[overflow-wrap:anywhere]">{l}</li>
          ))}
        </ul>
      )}
      <ImpactView impact={impact} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-[13px] font-semibold">
          Reason {reasonRequired ? <span className="font-medium text-warn">(required)</span> : <span className="font-normal text-muted">(optional)</span>}
        </label>
        <textarea
          id={`${id}-reason`}
          data-autofocus
          rows={3}
          maxLength={2000}
          required={reasonRequired}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`${fieldCls} resize-y`}
        />
        <p className="text-[11px] text-muted">
          {action === "cancel" ? "The athletes affected are emailed, and BTG keeps the reason on the campaign's record." : "Kept on the campaign's record; BTG reads it if the change needs their approval."}
        </p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2.5">
        {onBack && (
          <button type="button" className={dialogBtn.quiet} onClick={onBack}>Back</button>
        )}
        <button type="button" className={dialogBtn.quiet} onClick={onClose}>
          {action === "cancel" ? "Keep it" : "Cancel"}
        </button>
        <button type="submit" disabled={off || pending} className={button.danger ? dialogBtn.danger : dialogBtn.primary} title={button.why ?? undefined}>
          {pending ? "Sending…" : button.label}
        </button>
      </div>
      {button.disabled && <p className="text-[11px] text-danger">{button.why}</p>}
      {!button.disabled && problem && !error && <p className="text-[11px] text-muted">Write a reason to turn on &ldquo;{button.label}&rdquo;.</p>}
    </CampaignDialog>
  );
}
