"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CLOSE_DIALOG } from "@/lib/account-live";
import {
  closePreviewView, GUARDIAN_CLOSES, GUARDIAN_MUST_ACT, guardianClosesLine, heldView,
  type ApiClosureHeld, type ApiClosureRequest, type ClosePanel,
} from "@/lib/account-closure-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   Close account — 2S1-FE-08 (design Account.dc.html, settings + close).
   The settings row and its confirm dialog: one island because the row's
   button opens the dialog.

   LIVE (2S1-BE-13). "Close account" in the dialog calls the page's server
   action → POST /me/close {confirm: true}. On success the action sends the
   person to the public reactivation page (their login no longer works, so
   the way back is the emailed link); a refusal comes back as words under
   the buttons and nothing has changed.

   POL-FE-11 (2026-10-29): the row takes the preview (`panel`, from
   GET /me/close/preview on the server) and the dialog shows it before
   confirming — the live deals, the open invitations, the money, a
   guardian's minors — and says when BTG settles those first. A 202 HELD
   turns the row into "Waiting for BTG" with Withdraw (POST /me/close/
   withdraw); the preview's heldRequest shows the same on a later visit. A
   minor's own login reads "Your guardian closes your account" and has no
   button. `whose` names the account when a guardian closes their minor's.

   P1-ART-22 (2026-10-11): an optional `skin` lets the athlete's settings
   page draw the row as an arena plate (classes, a style, the pointer
   spotlight flag); without it the row is unchanged for the other portals.
   -------------------------------------------------------------------------- */

export type CloseResult =
  /** POL-BE-11 — 202: held for BTG; the account stays open. A 200 redirects instead. */
  | { ok: true; held: ApiClosureHeld }
  | { ok: false; message: string; code?: typeof GUARDIAN_MUST_ACT };
export type WithdrawResult = { ok: true } | { ok: false; message: string };
type CloseAction = () => Promise<CloseResult>;
type WithdrawAction = () => Promise<WithdrawResult>;

export type PlateSkin = { className: string; style?: CSSProperties; spot?: boolean };

const SURPRISE = "Couldn’t reach SponsorX just now. Nothing has changed — try again.";

export function CloseAccount({ line, panel, action, withdraw, skin, whose }: {
  line: string;
  /** What the preview said (server/account.ts closurePreview). */
  panel: ClosePanel;
  action: CloseAction;
  withdraw: WithdrawAction;
  skin?: PlateSkin;
  /** A guardian closing their minor's account: the minor's first name. */
  whose?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /* A 202 just now: held, before the server has re-read the preview. */
  const [heldNow, setHeldNow] = useState<ApiClosureRequest | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const [minorNow, setMinorNow] = useState(false);
  const frame = skin?.className ?? "rounded-xl border border-danger/35 bg-surface px-4.5 py-4";
  const tone = skin ? "rounded-full" : "rounded-lg";
  const label = whose ? `Close ${whose}’s account` : "Close account";

  const held = heldNow ?? (panel.kind === "held" && !withdrawn ? panel.request : null);
  const minor = minorNow || panel.kind === "minor";

  const onHeld = (h: ApiClosureHeld) => {
    setHeldNow({
      id: h.requestId, account: h.account, subjectId: "", state: "HELD", reason: null, holdReasons: h.holdReasons,
      requestedAt: h.createdAt, decidedAt: null, declineNote: null, closureId: null,
    });
    setWithdrawn(false);
    router.refresh();
  };

  return (
    <section aria-label={label} data-spot={skin?.spot ? "" : undefined} style={skin?.style} className={`flex flex-wrap items-center gap-3 ${frame}`}>
      {minor ? (
        <span className="min-w-0 grow basis-56">
          <strong className="block text-sm font-semibold">{GUARDIAN_CLOSES}</strong>
          <span className="text-xs leading-relaxed text-muted">{guardianClosesLine(panel.kind === "minor" ? panel.guardianName : null)}</span>
        </span>
      ) : held ? (
        <HeldRow request={held} whose={whose} withdraw={withdraw} tone={tone}
          onWithdrawn={() => {
            setHeldNow(null);
            setWithdrawn(true);
            router.refresh();
          }} />
      ) : (
        <>
          <span className="min-w-0 grow basis-56">
            <strong className="block text-sm font-semibold">{label}</strong>
            <span className="text-xs leading-relaxed text-muted">{line}</span>
            {withdrawn && <span role="status" className="mt-1 block text-xs text-accent">Request withdrawn — the account stays open.</span>}
            {panel.kind === "unknown" && <span className="mt-1 block text-[11px] leading-relaxed text-warn">{panel.note}</span>}
          </span>
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
            className={`min-h-11 border border-danger/50 px-4 text-xs font-semibold text-danger outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-danger ${tone}`}>
            {label}
          </button>
        </>
      )}
      {open && !held && !minor && (
        <CloseDialog panel={panel} whose={whose} action={action} onClose={() => setOpen(false)}
          onHeld={(h) => {
            setOpen(false);
            onHeld(h);
          }}
          onMinor={() => {
            setOpen(false);
            setMinorNow(true);
          }} />
      )}
    </section>
  );
}

function HeldRow({ request, whose, withdraw, tone, onWithdrawn }: {
  request: ApiClosureRequest; whose?: string; withdraw: WithdrawAction; tone: string; onWithdrawn: () => void;
}) {
  const v = heldView(request, whose);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = () =>
    start(async () => {
      setError(null);
      const r = await withdraw().catch(() => ({ ok: false as const, message: SURPRISE }));
      if (!r.ok) return setError(r.message);
      onWithdrawn();
    });
  return (
    <>
      <span className="min-w-0 grow basis-56">
        <strong className="block text-sm font-semibold">
          <span aria-hidden="true" className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-warn align-middle" />
          {v.title}{whose ? ` — ${whose}’s account` : ""}
        </strong>
        <span className="text-xs leading-relaxed text-muted">{v.since} {v.body}</span>
        {v.reasons.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs leading-relaxed">
            {v.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        {error && <span role="alert" className="mt-1 block text-[11px] text-danger">{error}</span>}
      </span>
      <button type="button" onClick={go} disabled={pending} aria-busy={pending}
        className={`min-h-11 border border-line px-4 text-xs font-semibold text-text outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${tone}`}>
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
    </>
  );
}

function CloseDialog({ panel, whose, action, onClose, onHeld, onMinor }: {
  panel: ClosePanel; whose?: string; action: CloseAction; onClose: () => void; onHeld: (h: ApiClosureHeld) => void; onMinor: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const view = panel.kind === "ready" ? closePreviewView(panel.preview, whose) : null;
  const confirm = view?.confirm ?? (whose ? `Close ${whose}’s account` : "Close account");
  const busy = view?.busy ?? "Closing…";
  const close = () =>
    start(async () => {
      setError(null);
      /* A 200 redirects; a 202 (held) and a refusal return. */
      const r = await action().catch((): CloseResult => ({ ok: false, message: SURPRISE }));
      if (!r) return;
      if (r.ok) return onHeld(r.held);
      if (r.code === GUARDIAN_MUST_ACT) return onMinor();
      setError(r.message);
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cl-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-3.5 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl sm:p-6">
          <h2 id="cl-title" className="text-base font-semibold tracking-tight">{view?.title ?? (whose ? `Close ${whose}’s account?` : CLOSE_DIALOG.title)}</h2>

          {view ? (
            <>
              {view.deals.length > 0 && (
                <section aria-label="Live deals" className="rounded-lg border border-warn/40 bg-warn/5 p-3">
                  <h3 className="text-xs font-semibold text-warn">{view.deals.length === 1 ? "1 live deal" : `${view.deals.length} live deals`}</h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {view.deals.map((d) => (
                      <li key={d.id} className="text-xs leading-relaxed">
                        <span className="font-medium">{d.title}</span>
                        <span className="text-muted"> · {d.sponsor} · {d.state}{d.who ? ` · ${d.who}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {view.lines.length > 0 && (
                <ul className="space-y-1 text-xs leading-relaxed">
                  {view.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              )}
              {view.hold ? (
                <section aria-label={view.hold.title} className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <h3 className="text-xs font-semibold">{view.hold.title}</h3>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                    {view.hold.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{view.hold.stays}</p>
                </section>
              ) : (
                <>
                  <p className="text-sm leading-relaxed">{whose ? CLOSE_DIALOG.body.replace(/^Your account/, `${whose}’s account`).replace("Come back", "They can come back") : CLOSE_DIALOG.body}</p>
                  {view.lines.length === 0 && <p className="text-xs leading-relaxed text-muted">{CLOSE_DIALOG.money}</p>}
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed">{CLOSE_DIALOG.body}</p>
              <p className="text-xs leading-relaxed text-muted">{CLOSE_DIALOG.money}</p>
              {panel.kind === "unknown" && <p className="text-[11px] leading-relaxed text-warn">{panel.note}</p>}
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} disabled={pending} className="min-h-11 rounded-lg border border-line px-4 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-50">
              {whose ? "Keep it open" : "Keep my account"}
            </button>
            <button type="button" onClick={close} disabled={pending} aria-busy={pending}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-xs font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? busy : confirm}
            </button>
          </div>
          {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
