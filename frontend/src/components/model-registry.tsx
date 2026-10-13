"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { activateVersionAction, rollbackAction, saveThresholdsAction, setFlagAction } from "@/app/(app)/admin/intelligence/models/actions";
import { Dropdown } from "@/components/filter-kit";
import { DialogError, NoteField, OrderDialog, btn } from "@/components/order-dialog";
import { reasonError } from "@/lib/intel-admin";
import { compareVersions, thresholdChanges, thresholdErrors, type ModelVersion, type Threshold } from "@/lib/models-live";

/* --------------------------------------------------------------------------
   3S8-FE-02 — the model registry's client islands.

   <VersionActions>  Activate (a validated version) / Roll back to (a
                     retired one) — each through a confirm dialog that
                     needs a reason.
   <VersionCompare>  two versions' recorded metrics side by side, picked
                     instantly; nothing is fetched (the registry sent them).
   <ThresholdEditor> the model's thresholds, checked against their min/max
                     as typed; saving the changed ones needs a reason.
   <FlagToggle>      one tenant × feature switch; flipping it needs a reason.

   `preview` (the ?demo=sample page) never calls the API: each dialog says
   so and stops.
   -------------------------------------------------------------------------- */

type Result = { ok: true } | { ok: false; error: string };

function ReasonDialog({
  id,
  title,
  lead,
  confirm,
  danger = false,
  preview,
  onClose,
  send,
}: {
  id: string;
  title: string;
  lead: React.ReactNode;
  confirm: string;
  danger?: boolean;
  preview: boolean;
  onClose: () => void;
  send: (reason: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    const bad = reasonError(reason);
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
      router.refresh();
      onClose();
    });
  };
  return (
    <OrderDialog id={id} title={title} onClose={onClose} onSubmit={submit}>
      <div className="text-[13px] leading-relaxed text-muted">{lead}</div>
      <NoteField id={`${id}-reason`} label="Reason" hint="Recorded with the change in the audit log (model governance)." value={reason} onChange={setReason} />
      <DialogError message={error} />
      {notice && <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-[11px] text-warn">{notice}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={btn.quiet}>
          Cancel
        </button>
        {/* formNoValidate: the note's `required` stays for assistive tech, but
            the app's own "at least 8 characters" line is the message shown —
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
  preview = false,
}: {
  modelKey: string;
  modelName: string;
  version: string;
  status: ModelVersion["status"];
  activeVersion: string | null;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = `ver-${modelKey}-${version}`.replace(/[^a-zA-Z0-9-]/g, "-");
  if (status !== "validated" && status !== "retired") return null;
  const activate = status === "validated";
  const cls = "inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={activate ? `${cls} bg-primary text-cta-ink hover:bg-primary-soft` : `${cls} border border-line text-text hover:bg-surface-2`}
        aria-label={activate ? `Activate ${version}` : `Roll back ${modelName} to ${version}`}
      >
        {activate ? "Activate" : "Roll back to this"}
      </button>
      {open && (
        <ReasonDialog
          id={id}
          title={activate ? `Activate ${version}?` : `Roll back to ${version}?`}
          lead={
            <>
              {activate ? (
                <>
                  <strong className="text-text">{version}</strong> becomes the live {modelName}
                </>
              ) : (
                <>
                  {modelName} goes back to <strong className="text-text">{version}</strong>
                </>
              )}
              {activeVersion ? <>, replacing <strong className="text-text">{activeVersion}</strong>, which is kept and can be restored.</> : "."} No deploy — it applies on the next computation.
            </>
          }
          confirm={activate ? "Activate" : "Roll back"}
          danger={!activate}
          preview={preview}
          onClose={() => setOpen(false)}
          send={(reason) => (activate ? activateVersionAction(modelKey, version, reason) : rollbackAction(modelKey, version, reason))}
        />
      )}
    </>
  );
}

export function VersionCompare({ versions, initial }: { versions: ModelVersion[]; initial: [string, string] }) {
  const [a, setA] = useState(initial[0]);
  const [b, setB] = useState(initial[1]);
  const options = versions.map((v) => ({ value: v.version, label: `${v.version} · ${v.status}` }));
  const va = versions.find((v) => v.version === a);
  const vb = versions.find((v) => v.version === b);
  const rows = va && vb ? compareVersions(va, vb) : [];
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
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-muted">Neither version has recorded metrics yet — a draft gets them when it&rsquo;s validated.</p>
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
    </div>
  );
}

/* ----------------------------------------------------------- thresholds */

export function ThresholdEditor({ modelKey, modelName, thresholds, preview = false }: { modelKey: string; modelName: string; thresholds: Threshold[]; preview?: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const errors = thresholdErrors(thresholds, values);
  const changes = thresholdChanges(thresholds, values);
  const changed = Object.keys(changes).length;
  const valid = Object.keys(errors).length === 0;
  /* The dialog sits OUTSIDE the form: it's portaled, but React still bubbles
     its submit through the component tree to an enclosing form. */
  return (
    <>
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
                  className={`w-28 rounded-lg border bg-bg px-3 py-2 text-[13px] tabular-nums text-text focus:outline-none ${err ? "border-danger/60" : changes[t.key] !== undefined ? "border-primary/60" : "border-line focus:border-primary/60"}`}
                />
                {t.unit && <span className="text-xs text-muted">{t.unit}</span>}
              </div>
              <p id={`${id}-hint`} className={`text-[11px] ${err ? "text-danger" : "text-faint"}`}>
                {err ?? `Range ${t.min}–${t.max}${changes[t.key] !== undefined ? ` · was ${t.value}` : ""}`}
              </p>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!changed || !valid} className={btn.quiet}>
          {changed ? `Save ${changed} change${changed > 1 ? "s" : ""}…` : "No changes"}
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
          title={`Change ${modelName} thresholds?`}
          lead={
            <ul className="space-y-0.5">
              {thresholds
                .filter((t) => changes[t.key] !== undefined)
                .map((t) => (
                  <li key={t.key}>
                    {t.label}: <strong className="text-text">{t.value}</strong> → <strong className="text-text">{changes[t.key]}</strong>
                    {t.unit ? ` ${t.unit}` : ""}
                  </li>
                ))}
            </ul>
          }
          confirm="Save thresholds"
          preview={preview}
          onClose={() => setOpen(false)}
          send={async (reason) => {
            const res = await saveThresholdsAction(modelKey, changes, reason);
            if (res.ok) setValues({});
            return res;
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
              ? `${tenantName} stops seeing ${featureName} everywhere in SponsorX, straight away. Nothing it already produced is deleted.`
              : `${tenantName} starts seeing ${featureName}. Make sure its rollout stage covers this tenant.`
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
