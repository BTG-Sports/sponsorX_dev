"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { autoStaffingReasonProblem } from "@/lib/campaign-stage";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   P4-FE-09 — the "Automatic staffing" switch on BTG's campaign detail, with
   the reason dialog P4-BE-12 asks for. The switch shows the campaign's
   current setting; flipping it opens the dialog, and nothing changes until
   BTG writes why and confirms. The reason goes on the campaign's record.
   -------------------------------------------------------------------------- */

type Result = { ok: true; sent: number } | { ok: false; message: string };

export function AutoStaffingToggle({
  campaignId,
  on,
  action,
}: {
  campaignId: string;
  on: boolean;
  action: (campaignId: string, on: boolean, why: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Automatic staffing"
        onClick={() => {
          setDone(null);
          setOpen(true);
        }}
        className={[
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
          on ? "border-accent/60 bg-accent/30" : "border-line bg-surface-2",
        ].join(" ")}
      >
        <span className={["inline-block size-4 rounded-full bg-text transition-transform", on ? "translate-x-6" : "translate-x-1"].join(" ")} />
      </button>
      <span className="text-sm font-medium">Automatic staffing</span>
      <span className="text-xs text-muted">{on ? "On — the system sends the offers" : "Off — BTG staffs by hand"}</span>
      {done && <span role="status" className="text-xs text-accent">{done}</span>}
      {open && (
        <ReasonDialog
          on={!on}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            setDone(message);
          }}
          submit={(why) => action(campaignId, !on, why)}
        />
      )}
    </div>
  );
}

function ReasonDialog({
  on,
  onClose,
  onDone,
  submit,
}: {
  on: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  submit: (why: string) => Promise<Result>;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problem = autoStaffingReasonProblem(why);
  const go = on ? "Turn on" : "Turn off";
  const send = () => {
    setError(null);
    if (problem) return setError(problem);
    start(async () => {
      const r = await submit(why);
      if (!r.ok) return setError(r.message);
      onDone(on ? (r.sent ? `On — ${r.sent} offer${r.sent === 1 ? "" : "s"} sent` : "On") : "Off — over to BTG");
      router.refresh();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="as-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <form
          className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <h2 id="as-title" className="text-lg font-semibold">{on ? "Turn automatic staffing on?" : "Turn automatic staffing off?"}</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            {on
              ? "The system offers the best-matched athletes until the package is full, replaces anyone who says no, and stays inside the budget. Offers start going out as soon as you confirm."
              : "Nothing more goes out on its own. Offers already sent stay open, and BTG staffs the rest by hand."}
          </p>
          <label htmlFor="as-why" className="text-[13px] font-semibold">Reason <span className="font-medium text-warn">(required)</span></label>
          <textarea id="as-why" rows={3} required maxLength={500} value={why} onChange={(e) => setWhy(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="submit" disabled={pending || problem !== null}
              className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Saving…" : go}
            </button>
          </div>
          {problem && !error && <p className="text-[11px] text-faint">Write a reason to turn on &ldquo;{go}&rdquo;.</p>}
        </form>
      </div>
    </div>
  );
}
