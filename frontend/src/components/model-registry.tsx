"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { activateVersionAction, rollbackAction, saveThresholdsAction, setFlagAction, validateVersionAction } from "@/app/(app)/admin/intelligence/models/actions";
import { Dropdown } from "@/components/filter-kit";
import { DialogError, NoteField, OrderDialog, btn } from "@/components/order-dialog";
import { dayLabel } from "@/lib/intel-admin";
import {
  SECOND_PERSON_RULE,
  backtestLabel,
  compareSettings,
  compareVersions,
  isShare,
  modelReasonError,
  outcomeMessage,
  thresholdChanges,
  thresholdErrors,
  thresholdWarnings,
  type ModelVersion,
  type SettingsOutcome,
  type Threshold,
} from "@/lib/models-live";

/* --------------------------------------------------------------------------
   3S8-FE-02 — the model registry's client islands.

   <VersionActions>  Validate (a held draft — by a second person, the rule
                     stated), Activate (a validated version) or Roll back
                     to (a retired one) — each through a confirm dialog
                     that needs a reason.
   <VersionCompare>  two versions side by side, picked instantly: their
                     SETTINGS first, then the metrics each recorded —
                     outputs made and its latest backtest ("(simulated)"
                     when it is). Nothing is fetched (the registry sent them).
   <ThresholdEditor> the active version's settings, checked as typed: what
                     the API refuses outright is an error; a value outside
                     its safe range is a warning (saved, but held). Saving
                     needs a reason and answers whether the new version
                     went live or was held, and why.
   <FlagToggle>      one tenant × feature switch; flipping it needs a reason.

   `preview` (the ?demo=sample page) never calls the API: each dialog says
   so and stops.
   -------------------------------------------------------------------------- */

type Result = { ok: true; outcome?: SettingsOutcome | null } | { ok: false; error: string };

function ReasonDialog({
  id,
  title,
  lead,
  confirm,
  danger = false,
  preview,
  onClose,
  send,
  onDone,
}: {
  id: string;
  title: string;
  lead: React.ReactNode;
  confirm: string;
  danger?: boolean;
  preview: boolean;
  onClose: () => void;
  send: (reason: string) => Promise<Result>;
  /** After a successful send, before the dialog closes and the page refreshes. */
  onDone?: (res: Extract<Result, { ok: true }>) => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    const bad = modelReasonError(reason);
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
      const res = await send(reason).catch(() => ({ ok: false as const, error: "The API is unreachable — try again in a minute." }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone?.(res);
      router.refresh();
      onClose();
    });
  };
  return (
    <OrderDialog id={id} title={title} onClose={onClose} onSubmit={submit}>
      <div className="text-[13px] leading-relaxed text-muted">{lead}</div>
      <NoteField id={`${id}-reason`} label="Reason" hint="10 to 500 characters — recorded with the change in the audit log (model governance)." value={reason} onChange={setReason} />
      <DialogError message={error} />
      {notice && <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">{notice}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={btn.quiet}>
          Cancel
        </button>
        {/* formNoValidate: the note's `required` stays for assistive tech, but
            the app's own "at least 10 characters" line is the message shown —
            not the browser's "Please fill out this field" bubble. */}
        <button type="submit" formNoValidate disabled={pending} className={danger ? btn.danger : btn.primary}>
          {pending ? "Saving…" : confirm}
        </button>
      </div>
    </OrderDialog>
  );
}

/* ------------------------------------------------------------- versions */

export function VersionActions({
  modelKey,
  modelName,
  version,
  status,
  activeVersion,
  heldBecause = null,
  preview = false,
}: {
  modelKey: string;
  modelName: string;
  version: string;
  status: ModelVersion["status"];
  activeVersion: string | null;
  /** Why a draft was held, when the registry said. */
  heldBecause?: string | null;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = `ver-${modelKey}-${version}`.replace(/[^a-zA-Z0-9-]/g, "-");
  if (status === "active") return null;
  const move = status === "draft" ? "validate" : status === "validated" ? "activate" : "rollback";
  const cls = "inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold";
  const look = {
    validate: `${cls} border border-primary/50 text-text hover:bg-primary/10`,
    activate: `${cls} bg-primary text-cta-ink hover:bg-primary-soft`,
    rollback: `${cls} border border-line text-text hover:bg-surface-2`,
  }[move];
  const label = { validate: "Validate", activate: "Activate", rollback: "Roll back to this" }[move];
  const aria = {
    validate: `Validate ${modelName} ${version} as a second person`,
    activate: `Activate ${version}`,
    rollback: `Roll back ${modelName} to ${version}`,
  }[move];
  const replacing = activeVersion ? (
    <>
      , replacing <strong className="text-text">{activeVersion}</strong>, which is kept and can be restored.
    </>
  ) : (
    "."
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={look} aria-label={aria} title={move === "validate" ? SECOND_PERSON_RULE : undefined}>
        {label}
      </button>
      {open && (
        <ReasonDialog
          id={id}
          title={move === "validate" ? `Validate ${version}?` : move === "activate" ? `Activate ${version}?` : `Roll back to ${version}?`}
          lead={
            move === "validate" ? (
              <div className="space-y-2">
                <p>
                  <strong className="text-text">{version}</strong> of the {modelName} was held{heldBecause ? <>: {heldBecause}.</> : " because a value is outside its safe range."}
                </p>
                <p>
                  <strong className="text-text">The rule:</strong> {SECOND_PERSON_RULE} Validating says you checked these settings; it does not make them live — anyone activates a validated version afterwards.
                </p>
              </div>
            ) : (
              <>
                {move === "activate" ? (
                  <>
                    <strong className="text-text">{version}</strong> becomes the live {modelName}
                  </>
                ) : (
                  <>
                    {modelName} goes back to <strong className="text-text">{version}</strong>
                  </>
                )}
                {replacing} No deploy — it applies on the engine&rsquo;s next run.
              </>
            )
          }
          confirm={label === "Roll back to this" ? "Roll back" : label}
          danger={move === "rollback"}
          preview={preview}
          onClose={() => setOpen(false)}
          send={(reason) =>
            move === "validate" ? validateVersionAction(modelKey, version, reason) : move === "activate" ? activateVersionAction(modelKey, version, reason) : rollbackAction(modelKey, version, reason)
          }
        />
      )}
    </>
  );
}

function BacktestLine({ v }: { v: ModelVersion | undefined }) {
  if (!v) return null;
  return (
    <p className="text-[11px] text-muted">
      <code className="text-text">{v.version}</code>
      {" · "}
      {v.backtest ? `${backtestLabel(v.backtest)} · ran ${dayLabel(v.backtest.ranAt)}` : "no backtest yet"}
    </p>
  );
}

export function VersionCompare({ versions, thresholds, initial }: { versions: ModelVersion[]; thresholds: Threshold[]; initial: [string, string] }) {
  const [a, setA] = useState(initial[0]);
  const [b, setB] = useState(initial[1]);
  const options = versions.map((v) => ({ value: v.version, label: `${v.version} · ${v.status}` }));
  const va = versions.find((v) => v.version === a);
  const vb = versions.find((v) => v.version === b);
  const settings = va && vb ? compareSettings(va, vb, thresholds) : [];
  const rows = va && vb ? compareVersions(va, vb) : [];
  const simulated = [va, vb].some((v) => v?.backtest?.simulated);
  const verdict = { better: "text-success", worse: "text-danger", same: "text-muted" } as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Dropdown label="First version to compare" allLabel="Choose" value={a} options={options} onChange={setA} tone="admin" includeAll={false} />
        <span>against</span>
        <Dropdown label="Second version to compare" allLabel="Choose" value={b} options={options} onChange={setB} tone="admin" includeAll={false} />
      </div>
      {a === b ? (
        <p className="text-[11px] text-muted">Pick two different versions.</p>
      ) : (
        <>
          {settings.length > 0 && (
            <div className="sx-card sx-table-wrap">
              <div className="sx-table-scroll">
                <table className="sx-table" aria-label={`Settings of ${a} compared with ${b}`}>
                  <thead>
                    <tr>
                      <th scope="col">Setting</th>
                      <th scope="col" className="num">{a}</th>
                      <th scope="col" className="num">{b}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td data-label={a} className="num">{r.a}</td>
                        <td data-label={b} className={`num ${r.changed ? "font-semibold text-text" : ""}`}>
                          {r.b}
                          {r.changed && <span className="ml-1.5 text-[11px] text-primary">differs</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="space-y-0.5">
            <BacktestLine v={va} />
            <BacktestLine v={vb} />
          </div>
          {rows.length === 0 ? (
            <p className="text-[11px] text-muted">Neither version has recorded metrics yet — outputs count as the engine runs; a backtest follows once there is history to judge it on.</p>
          ) : (
            <div className="sx-card sx-table-wrap">
              <div className="sx-table-scroll">
                <table className="sx-table" aria-label={`${a} compared with ${b}`}>
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col" className="num">{a}</th>
                      <th scope="col" className="num">{b}</th>
                      <th scope="col" className="num">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td>{r.label}</td>
                        <td data-label={a} className="num">{r.a}</td>
                        <td data-label={b} className="num">{r.b}</td>
                        <td data-label="Change" className="num">
                          {r.delta ?? "—"}
                          {r.verdict && <span className={`ml-1.5 text-[11px] ${verdict[r.verdict]}`}>{r.verdict}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {simulated && <p className="text-[11px] text-faint">&ldquo;(simulated)&rdquo; metrics come from the seeded simulated history (SponsorX-Backtest.md §4), not from real campaigns.</p>}
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- thresholds */

export function ThresholdEditor({ modelKey, modelName, thresholds, preview = false }: { modelKey: string; modelName: string; thresholds: Threshold[]; preview?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<SettingsOutcome | null>(null);
  const errors = thresholdErrors(thresholds, values);
  const warnings = thresholdWarnings(thresholds, values);
  const changes = thresholdChanges(thresholds, values);
  const changed = Object.keys(changes).length;
  const valid = Object.keys(errors).length === 0;
  const held = thresholds.filter((t) => changes[t.key] !== undefined && warnings[t.key]);
  const done = outcome ? outcomeMessage(outcome) : null;
  /* The dialog sits OUTSIDE the form: it's portaled, but React still bubbles
     its submit through the component tree to an enclosing form. */
  return (
    <>
      {done && outcome && (
        <div role="status" className={`mb-3 rounded-lg border px-3 py-2 text-[12px] ${outcome.status === "active" ? "border-success/50 bg-success/10 text-text" : "border-warn/50 bg-warn/10 text-text"}`}>
          <p className="font-semibold">{done.title}</p>
          {outcome.heldBecause.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
              {outcome.heldBecause.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-muted">{done.next}</p>
        </div>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (changed && valid) setOpen(true);
        }}
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {thresholds.map((t) => {
            const id = `thr-${modelKey}-${t.key}`;
            const err = errors[t.key];
            const warn = warnings[t.key];
            const unit = isShare(t) ? "share (0–1)" : t.unit;
            return (
              <li key={t.key} className="flex flex-col gap-1">
                <label htmlFor={id} className="text-[12px] font-semibold text-text">{t.label}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={id}
                    inputMode="decimal"
                    value={values[t.key] ?? String(t.value)}
                    onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.value }))}
                    aria-invalid={Boolean(err)}
                    aria-describedby={`${id}-hint`}
                    className={`w-28 rounded-lg border bg-bg px-3 py-2 text-[13px] tabular-nums text-text focus:outline-none ${err ? "border-danger/60" : warn ? "border-warn/60" : changes[t.key] !== undefined ? "border-primary/60" : "border-line focus:border-primary/60"}`}
                  />
                  {unit && <span className="text-xs text-muted">{unit}</span>}
                </div>
                <p id={`${id}-hint`} className={`text-[11px] ${err ? "text-danger" : warn ? "text-warn" : "text-faint"}`}>
                  {err ?? warn ?? `Safe range ${t.min}–${t.max}${changes[t.key] !== undefined ? ` · was ${t.value}` : ""}`}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!changed || !valid} className={btn.quiet}>
            {changed ? `Save ${changed} change${changed > 1 ? "s" : ""} as a new version…` : "No changes"}
          </button>
          {changed > 0 && (
            <button type="button" onClick={() => setValues({})} className="text-[11px] text-muted hover:text-text">
              Reset
            </button>
          )}
        </div>
      </form>
      {open && (
        <ReasonDialog
          id={`thr-${modelKey}-save`}
          title={`Save new ${modelName} settings?`}
          lead={
            <div className="space-y-2">
              <ul className="space-y-0.5">
                {thresholds
                  .filter((t) => changes[t.key] !== undefined)
                  .map((t) => (
                    <li key={t.key}>
                      {t.label}: <strong className="text-text">{t.value}</strong> → <strong className="text-text">{changes[t.key]}</strong>
                      {isShare(t) ? "" : t.unit ? ` ${t.unit}` : ""}
                      {warnings[t.key] && <span className="ml-1.5 text-warn">outside {t.min}–{t.max}</span>}
                    </li>
                  ))}
              </ul>
              <p>
                {held.length === 0 ? (
                  <>Every value is inside its safe range, so the new version is validated and goes <strong className="text-text">live at once</strong>, automatically.</>
                ) : (
                  <>
                    {held.length === 1 ? "One value is" : `${held.length} values are`} outside the safe range, so the new version is <strong className="text-text">held as a draft</strong>. {SECOND_PERSON_RULE}
                  </>
                )}
              </p>
            </div>
          }
          confirm={held.length === 0 ? "Save and go live" : "Save as held draft"}
          preview={preview}
          onClose={() => setOpen(false)}
          send={(reason) => saveThresholdsAction(modelKey, changes, reason)}
          onDone={(res) => {
            setValues({});
            setOutcome(res.outcome ?? null);
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- flags */

export function FlagToggle({
  feature,
  featureName,
  tenantId,
  tenantName,
  enabled,
  preview = false,
}: {
  feature: string;
  featureName: string;
  tenantId: string;
  tenantName: string;
  enabled: boolean;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = `flag-${feature}-${tenantId}`.replace(/[^a-zA-Z0-9-]/g, "-");
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${featureName} for ${tenantName}`}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full text-[11px] font-medium text-text"
      >
        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${enabled ? "border-success/60 bg-success/30" : "border-line bg-surface-2"}`}>
          <span className={`absolute size-3.5 rounded-full transition-transform ${enabled ? "translate-x-[1.1rem] bg-success" : "translate-x-0.5 bg-faint"}`} />
        </span>
        {enabled ? "On" : "Off"}
      </button>
      {open && (
        <ReasonDialog
          id={id}
          title={`${enabled ? "Switch off" : "Switch on"} ${featureName} for ${tenantName}?`}
          lead={
            enabled
              ? `${tenantName} stops seeing ${featureName} everywhere in SponsorX, straight away: its pages answer "switched off" and its nightly run skips this tenant. Nothing it already produced is deleted.`
              : `${tenantName} starts seeing ${featureName} again, and its nightly run resumes.`
          }
          confirm={enabled ? "Switch off" : "Switch on"}
          danger={enabled}
          preview={preview}
          onClose={() => setOpen(false)}
          send={(reason) => setFlagAction(feature, tenantId, !enabled, reason)}
        />
      )}
    </>
  );
}
