"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { PreviewTable, btnPrimary, btnQuiet, field, fieldLabel, type PreviewFn } from "@/components/commission-preview";
import { ComboBox } from "@/components/place-dialog";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { useMounted } from "@/components/use-mounted";
import {
  KINDS, PROPERTY_KINDS, SCOPES, parseDollars, parsePercent, rateLabel, scopeLabel, toPreviewLines, toRuleInput,
  type ApiRule, type NewRuleForm, type PreviewResult, type RuleKind, type RuleScope, type SampleLine,
} from "@/lib/commission-live";

/* --------------------------------------------------------------------------
   The commission desk's rule dialog (P1-ART-19, 2S5-FE-01) — "Add a rule"
   and "Revise" as one popup, in the sign-up rules dialog's shape (P1-ART-17:
   chamfered night glass, named dropdowns, nothing typed that isn't a choice).

   - ADD: what it is and who it applies to are dropdowns (the kind is preset
     from the tile that opened it); a property type is a dropdown too; a
     single property or sponsor takes its id. Rate, a fixed amount where the
     kind allows one, priority, a note.
   - REVISE: the kind and the scope are fixed and named; the rate, fixed
     amount, priority and note move. Saving makes the next version from
     now; orders already approved keep the one they were approved with.
   - "Preview with this rule" works the desk's sample order out with and
     without the unsaved rule, side by side, before anything is saved.

   House dialog contract (useDialogFocus): focus trapped, Escape and the
   backdrop close, focus returns to the opener. Portaled to <body> with
   `.sx-ops`, so it is the night stage in both themes.
   -------------------------------------------------------------------------- */

const CHAMFER = "[clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,14px_100%,0_calc(100%-14px))]";
const KIND_OPTIONS = KINDS.map((k) => ({ code: k.kind, name: k.label }));
const SCOPE_OPTIONS = SCOPES.map((s) => ({ code: s.scope, name: s.label }));
const PROPERTY_OPTIONS = PROPERTY_KINDS.map((k) => ({ code: k, name: k.charAt(0) + k.slice(1).toLowerCase() }));

export type RuleDialogMode = { kind: "add"; ruleKind: RuleKind } | { kind: "revise"; rule: ApiRule };

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export function RuleDialog({
  mode, lines, create, revise, preview, onClose, onDone,
}: {
  mode: RuleDialogMode;
  /** The desk's sample order, for "Preview with this rule". */
  lines: SampleLine[];
  create: (rule: Exclude<ReturnType<typeof toRuleInput>, { ok: false }>["rule"]) => Promise<Result<ApiRule>>;
  revise: (id: string, change: { bps: number; fixedCents?: number; priority: number; note: string | null }) => Promise<Result<ApiRule>>;
  preview: PreviewFn;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const mounted = useMounted();
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const editing = mode.kind === "revise" ? mode.rule : null;
  const [form, setForm] = useState<NewRuleForm>(
    editing
      ? { kind: editing.kind, scope: editing.scope, scopeRef: editing.scopeRef ?? "", percent: String(editing.bps / 100), fixed: editing.fixedCents ? (editing.fixedCents / 100).toFixed(2) : "", priority: String(editing.priority), note: editing.note ?? "" }
      : { kind: mode.kind === "add" ? mode.ruleKind : "PLATFORM_FEE", scope: "GLOBAL", scopeRef: "", percent: "", fixed: "", priority: "0", note: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<PreviewResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [previewing, startPreview] = useTransition();
  const kind = KINDS.find((k) => k.kind === form.kind)!;
  const set = (patch: Partial<NewRuleForm>) => {
    setForm({ ...form, ...patch });
    setCompare(null);
    setError(null);
  };

  const built = () => {
    if (!editing) return toRuleInput(form);
    const bps = parsePercent(form.percent);
    const fixedCents = parseDollars(form.fixed);
    if (bps === null) return { ok: false as const, message: "Enter the rate as a percentage from 0 to 100, e.g. 15 or 2.9." };
    if (fixedCents === null) return { ok: false as const, message: "Enter the fixed amount in dollars, e.g. 0.30 — or leave it empty." };
    if (!/^-?\d{1,4}$/.test(form.priority.trim())) return { ok: false as const, message: "Priority is a whole number; higher wins." };
    return { ok: true as const, rule: { kind: editing.kind, scope: editing.scope, scopeRef: editing.scopeRef, bps, fixedCents: kind.fixed ? fixedCents : 0, priority: Number(form.priority.trim()), note: form.note.trim() || null } };
  };

  const runPreview = () => {
    const rule = built();
    if (!rule.ok) return setError(rule.message);
    const sample = toPreviewLines(lines);
    if (!sample.ok) return setError(`The sample order: ${sample.message.charAt(0).toLowerCase()}${sample.message.slice(1)}`);
    setError(null);
    startPreview(async () => {
      const { kind: k, scope, scopeRef, bps, fixedCents, priority } = rule.rule;
      const r = await preview({ lines: sample.lines, draft: { kind: k, scope, scopeRef, bps, fixedCents, priority } });
      if (!r.ok) return setError(r.message);
      setCompare(r.value);
    });
  };

  const save = () => {
    const rule = built();
    if (!rule.ok) return setError(rule.message);
    setError(null);
    startSaving(async () => {
      const r = editing
        ? await revise(editing.id, { bps: rule.rule.bps, ...(kind.fixed ? { fixedCents: rule.rule.fixedCents } : {}), priority: rule.rule.priority, note: rule.rule.note })
        : await create(rule.rule);
      if (!r.ok) return setError(r.message);
      onDone(
        editing
          ? `${kind.label} for ${scopeLabel(r.value).toLowerCase()} is now ${rateLabel(r.value)} — version ${r.value.version}, from now on.`
          : `Saved: ${kind.label} ${rateLabel(r.value)} for ${scopeLabel(r.value).toLowerCase()}.`,
      );
    });
  };

  if (!mounted) return null;
  return createPortal(
    <div className="sx-ops fixed inset-0 z-50 grid place-items-center p-4" role="presentation">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-[#02050b]/75" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title" className="sx-pop relative w-full max-w-xl">
        <span aria-hidden="true" className="pointer-events-none absolute -inset-2 rounded-2xl bg-gradient-to-br from-[#2e9bf5]/45 via-[#9be0ff]/15 to-[#f97a1f]/25 blur-xl" />
        <div className={`relative max-h-[calc(100vh-2rem)] overflow-y-auto bg-[radial-gradient(90%_60%_at_0%_0%,rgba(46,155,245,.22),transparent_70%),linear-gradient(160deg,#0c1828,#060b14)] px-6 pb-6 pt-5 ${CHAMFER}`}>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 border border-[#63b4f8]/35 [clip-path:inherit]" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9be0ff]">{editing ? `Revise · version ${editing.version + 1}` : "Add a rule"}</p>
              <h2 id="rule-dialog-title" className="mt-1 text-lg font-bold tracking-tight text-white">
                {editing ? `${kind.label} · ${scopeLabel(editing)}` : kind.label}
              </h2>
              <p className="mt-1 text-[11px] text-[#8a96a3]">{kind.hint}.{editing ? ` Saving starts version ${editing.version + 1} from now; orders already approved keep version ${editing.version}.` : " Applies to orders approved from now on."}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full border border-[#63b4f8]/30 text-[#cfe9ff] hover:bg-white/5">×</button>
          </div>

          <form className="mt-5 space-y-3.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
            {!editing && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ComboBox label="What it is" placeholder="Pick a kind" options={KIND_OPTIONS} value={form.kind} onPick={(code) => set({ kind: code as RuleKind, fixed: "" })} showCode={false} autoFocus />
                <ComboBox label="Applies to" placeholder="Pick who" options={SCOPE_OPTIONS} value={form.scope} onPick={(code) => set({ scope: code as RuleScope, scopeRef: code === "PROPERTY_KIND" ? "TEAM" : "" })} showCode={false} />
                {form.scope === "PROPERTY_KIND" && (
                  <ComboBox label="Property type" placeholder="Pick a type" options={PROPERTY_OPTIONS} value={form.scopeRef} onPick={(code) => set({ scopeRef: code })} showCode={false} />
                )}
                {(form.scope === "PROPERTY" || form.scope === "SPONSOR") && (
                  <label className="block">
                    <span className={fieldLabel}>{form.scope === "PROPERTY" ? "Property id" : "Sponsor id"}</span>
                    <input className={field} value={form.scopeRef} onChange={(e) => set({ scopeRef: e.target.value })} placeholder="e.g. cmukq4xi6…" />
                  </label>
                )}
              </div>
            )}

            <div className={`grid gap-3 ${kind.fixed ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <label className="block">
                <span className={fieldLabel}>Rate (%)</span>
                <input className={`${field} text-base font-semibold tabular-nums`} inputMode="decimal" value={form.percent} onChange={(e) => set({ percent: e.target.value })} placeholder="15" data-autofocus={editing ? "" : undefined} />
              </label>
              {kind.fixed && (
                <label className="block">
                  <span className={fieldLabel}>Plus a fixed amount ($)</span>
                  <input className={`${field} tabular-nums`} inputMode="decimal" value={form.fixed} onChange={(e) => set({ fixed: e.target.value })} placeholder="0.30" />
                </label>
              )}
              <label className="block">
                <span className={fieldLabel}>Priority <span className="text-[#5b6b7d]">(higher wins)</span></span>
                <input className={`${field} tabular-nums`} inputMode="numeric" value={form.priority} onChange={(e) => set({ priority: e.target.value })} />
              </label>
            </div>

            <label className="block">
              <span className={fieldLabel}>Note <span className="text-[#5b6b7d]">(optional)</span></span>
              <input className={field} value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} placeholder="Why this rate — e.g. agreed with Bowie Bulldogs, Sept 2026" />
            </label>

            {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}

            {compare && (
              <div>
                <p className="mb-1.5 text-[11px] text-[#8a96a3]">The sample order on the desk, in effect and with this rule:</p>
                <PreviewTable result={compare} />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#63b4f8]/15 pt-4">
              <button type="button" className={`${btnQuiet} mr-auto`} onClick={runPreview} disabled={previewing || saving}>
                {previewing ? "Working it out…" : compare ? "Preview again" : "Preview with this rule"}
              </button>
              <button type="button" className={btnQuiet} onClick={onClose}>Cancel</button>
              <button type="submit" className={btnPrimary} disabled={saving || previewing}>
                {saving ? "Saving…" : editing ? `Save as version ${editing.version + 1}` : "Save rule"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
