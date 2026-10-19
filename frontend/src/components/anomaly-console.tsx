"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { recordDispositionAction } from "@/app/(app)/admin/intelligence/anomalies/actions";
import { CloseIcon } from "@/components/filter-kit";
import { DialogError, btn } from "@/components/order-dialog";
import { useListNav } from "@/components/server-pager";
import { useDrawerFocus } from "@/components/use-drawer-focus";
import { useMounted } from "@/components/use-mounted";
import {
  ANOMALY_KINDS,
  DECIDER,
  KIND,
  NOTE_MAX,
  NOTE_RULE,
  OUTCOMES,
  OUTCOME_LABEL,
  SEVERITY,
  SUBJECT_LABEL,
  dispositionError,
  reviewState,
  ruleLabel,
  type Anomaly,
  type AnomalyKind,
  type DispositionOutcome,
} from "@/lib/anomalies-live";
import { momentLabel } from "@/lib/intel-admin";

/* --------------------------------------------------------------------------
   3S8-FE-01 — the anomaly console's client islands.

   <KindChips>     instant kind filter (?kind), one chip per kind with its
                   open count from the API; no Apply button.
   <AnomalyReview> the row's button and its slide-over: the rule and stamp
                   that raised the flag, the evidence it saw, and the
                   disposition form — three outcomes, a note of 8 to 2,000
                   characters for every one (the API's own rule, checked
                   here first with its wording). Three states
                   (lib reviewState):
                   open       — the form;
                   automatic  — SponsorX's own decision shown as such, and
                                the form beneath it to replace it;
                   final      — a person's decision, read-only (a second
                                one would answer 409).
                   The API's refusal is shown verbatim — a 409 reads
                   "A person has already decided this anomaly; the record
                   stands." — never a generic failure.

   `preview` (the ?demo=sample page) never calls the API: the form says
   so and stops.
   -------------------------------------------------------------------------- */

export function KindChips({ kind, openByKind }: { kind: AnomalyKind | ""; openByKind: Record<AnomalyKind, number> }) {
  const { set } = useListNav();
  const chip = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
      on ? "border-admin/40 bg-admin/15 text-text" : "border-line text-muted hover:text-text"
    }`;
  return (
    <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={!kind} onClick={() => set({ kind: null })} className={chip(!kind)}>
        All kinds
      </button>
      {ANOMALY_KINDS.map((k) => (
        <button key={k} type="button" aria-pressed={kind === k} onClick={() => set({ kind: kind === k ? null : k })} className={chip(kind === k)}>
          {KIND[k].label}
          <span className="rounded-full bg-surface-2 px-1.5 text-[10px] tabular-nums">{openByKind[k] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export function SeverityPill({ severity }: { severity: Anomaly["severity"] }) {
  const s = SEVERITY[severity];
  const dot = s.tone === "danger" ? "bg-danger" : s.tone === "warn" ? "bg-warn" : "bg-faint";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {s.label}
    </span>
  );
}

export function AnomalyReview({ anomaly, preview = false }: { anomaly: Anomaly; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const state = reviewState(anomaly);
  const verb = state === "open" ? "Review" : state === "automatic" ? "Check" : "View";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${verb} ${KIND[anomaly.kind].label.toLowerCase()} on ${anomaly.subject.name}${state === "automatic" ? " (decided automatically — you may replace it)" : ""}`}
        className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3.5 text-xs font-semibold ${
          state === "open" ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"
        }`}
      >
        {state === "open" ? "Review →" : state === "automatic" ? "Check →" : "View"}
      </button>
      {open && <ReviewDrawer anomaly={anomaly} preview={preview} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReviewDrawer({ anomaly, preview, onClose }: { anomaly: Anomaly; preview: boolean; onClose: () => void }) {
  const mounted = useMounted();
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const { panelRef, onKeyDown } = useDrawerFocus<HTMLDivElement>(true);
  const [outcome, setOutcome] = useState<DispositionOutcome | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  /* Unmount rides the slide-out; the timer covers a lost animationend. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 300);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  if (!mounted) return null;
  const d = anomaly.disposition;
  const state = reviewState(anomaly);
  /* A person may still decide: nothing yet, or only SponsorX's automatic call. */
  const canDecide = state !== "final";
  const kind = KIND[anomaly.kind];

  const submit = () => {
    const bad = dispositionError(outcome, note);
    if (bad) {
      setError(bad);
      return;
    }
    setError(null);
    if (preview) {
      setNotice("Sample preview — nothing was sent.");
      return;
    }
    start(async () => {
      const res = await recordDispositionAction(anomaly.id, outcome as DispositionOutcome, note);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      setClosing(true);
    });
  };

  return createPortal(
    <div className={`fixed inset-0 z-50 ${closing ? "pointer-events-none" : ""}`} role="dialog" aria-modal="true" aria-labelledby={`anom-${anomaly.id}-title`} onKeyDown={onKeyDown}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={() => setClosing(true)} className={`${closing ? "sx-backdrop-out" : "sx-backdrop"} absolute inset-0 cursor-default bg-black/60`} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`${closing ? "sx-drawer-out" : "sx-drawer"} absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl outline-none`}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClose();
        }}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line-soft p-5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <SeverityPill severity={anomaly.severity} />
              <span className="text-[11px] text-muted">{kind.label}</span>
            </p>
            <h2 id={`anom-${anomaly.id}-title`} className="mt-1.5 text-sm font-semibold tracking-tight">{anomaly.subject.name}</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {SUBJECT_LABEL[anomaly.subject.type]} · flagged {momentLabel(anomaly.detectedAt)}
            </p>
          </div>
          <button type="button" onClick={() => setClosing(true)} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted hover:bg-surface-2 hover:text-text">
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">What the rule saw</p>
            <p className="mt-1 text-[11px] text-muted">{kind.hint}</p>
            <dl className="mt-2 divide-y divide-line-soft rounded-lg border border-line">
              {anomaly.evidence.map((e) => (
                <div key={e.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                  <dt className="text-muted">{e.label}</dt>
                  <dd className="text-right font-medium tabular-nums text-text">{e.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-faint">
              Raised by rule <code className="rounded bg-surface-2 px-1.5 py-0.5">{ruleLabel(anomaly.rule)}</code>
            </p>
          </section>

          {d && (
            <section className={`rounded-lg border p-3 ${d.automatic ? "border-admin/40 bg-admin/10" : "border-line bg-surface-2"}`} aria-label="Disposition">
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
                Disposition
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal ${d.automatic ? "bg-admin/20 text-text" : "bg-surface text-muted"}`}>
                  {d.automatic ? "SponsorX · automatic" : "Final"}
                </span>
              </p>
              <p className="mt-1.5 text-sm font-semibold">{OUTCOME_LABEL[d.outcome]}</p>
              <p className="mt-1 whitespace-pre-line text-xs text-text">{d.note}</p>
              <p className="mt-2 text-[11px] text-muted">
                {d.by} · {momentLabel(d.at)}
              </p>
              <p className="mt-2 text-[11px] text-muted">{d.automatic ? DECIDER.automatic.hint : DECIDER.person.hint}</p>
            </section>
          )}

          {canDecide && (
            <form
              id={`anom-${anomaly.id}-form`}
              noValidate
              aria-label={d ? "Replace SponsorX's decision" : "Record a disposition"}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {d && <p className="text-[13px] font-semibold">Replace SponsorX&rsquo;s decision</p>}
              <fieldset className="space-y-2">
                <legend className="text-[13px] font-semibold">Outcome</legend>
                {OUTCOMES.map((o) => (
                  <label
                    key={o.key}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-xs transition-colors ${outcome === o.key ? "border-primary/60 bg-primary/10" : "border-line hover:bg-surface-2"}`}
                  >
                    <input type="radio" name={`anom-${anomaly.id}-outcome`} value={o.key} checked={outcome === o.key} onChange={() => setOutcome(o.key)} className="mt-0.5 accent-[var(--sx-primary)]" />
                    <span>
                      <span className="block font-semibold text-text">{o.label}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">{o.effect}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`anom-${anomaly.id}-note`} className="text-[13px] font-semibold">
                  Note <span className="font-medium text-warn">(required)</span>
                </label>
                <textarea
                  id={`anom-${anomaly.id}-note`}
                  rows={4}
                  required
                  maxLength={NOTE_MAX}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-describedby={`anom-${anomaly.id}-note-rule`}
                  placeholder="What you checked and why this outcome"
                  className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
                />
                <p id={`anom-${anomaly.id}-note-rule`} className="text-[11px] text-faint">
                  {NOTE_RULE} {d ? "Yours is then final." : "A person's decision is final."}
                </p>
              </div>
            </form>
          )}
        </div>

        {canDecide && (
          <div className="shrink-0 space-y-2 border-t border-line-soft p-4">
            <DialogError message={error} />
            {notice && <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">{notice}</p>}
            {/* noValidate + formNoValidate: the app's own note message shows,
                never the browser's "Please fill out this field" bubble. */}
            <button type="submit" form={`anom-${anomaly.id}-form`} formNoValidate disabled={pending} className={`${btn.primary} w-full`}>
              {pending ? "Recording…" : d ? "Replace decision" : "Record disposition"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
