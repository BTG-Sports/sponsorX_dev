"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   POL-FE-51 — "Launch now" on BTG's campaign page, for a campaign waiting in
   APPROVAL. A campaign launches itself at 00:00 UTC on its start date; this
   is BTG taking it live sooner (POST /campaigns/{id}/launch, P5-BE-04).
   Nothing happens until BTG confirms "the campaign starts today", and the
   API's refusal comes back in words. Afterwards the page reloads and the
   campaign reads ACTIVE.
   -------------------------------------------------------------------------- */

type Result = { ok: true; lines: string[] } | { ok: false; message: string };

export function LaunchNowButton({
  campaignId,
  name,
  launch,
}: {
  campaignId: string;
  name: string;
  launch: (campaignId: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      {!done && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-10 rounded-lg bg-primary px-4 text-[12px] font-semibold text-cta-ink transition-colors hover:bg-primary-soft"
        >
          Launch now
        </button>
      )}
      {done && (
        <div role="status" className="min-w-0 space-y-0.5 text-xs text-accent">
          {done.map((l) => (
            <p key={l} className="[overflow-wrap:anywhere]">{l}</p>
          ))}
        </div>
      )}
      {open && (
        <ConfirmLaunch
          name={name}
          onClose={() => setOpen(false)}
          onDone={(lines) => {
            setOpen(false);
            setDone(lines);
          }}
          submit={() => launch(campaignId)}
        />
      )}
    </div>
  );
}

function ConfirmLaunch({
  name,
  onClose,
  onDone,
  submit,
}: {
  name: string;
  onClose: () => void;
  onDone: (lines: string[]) => void;
  submit: () => Promise<Result>;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => {
    setError(null);
    start(async () => {
      const r = await submit();
      if (!r.ok) return setError(r.message);
      onDone(r.lines);
      router.refresh();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="launch-title" aria-describedby="launch-body">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="launch-title" className="text-lg font-semibold [overflow-wrap:anywhere]">Launch {name} now?</h2>
          <div id="launch-body" className="space-y-2 text-[13px] leading-relaxed text-muted">
            <p>
              <strong className="font-semibold text-text">Are you sure? The campaign starts today.</strong>
            </p>
            <p>
              Every signed order becomes live work, the athletes and the sponsor are told it&apos;s live, and the sponsor
              can see results. Orders not signed yet stay as they are. A launch can&apos;t be undone.
            </p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">
              Not yet
            </button>
            <button
              type="button"
              onClick={go}
              disabled={pending}
              className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Launching…" : "Yes, launch today"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
