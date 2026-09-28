"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import {
  groupRules,
  KINDS,
  PREVIEW_ROWS,
  PROPERTY_KINDS,
  rateLabel,
  SCOPES,
  scopeLabel,
  toPreviewLines,
  toRuleInput,
  usd,
  parsePercent,
  parseDollars,
  pctLabel,
  type ApiRule,
  type NewRuleForm,
  type PreviewResult,
  type RuleScope,
  type SampleLine,
} from "@/lib/commission-live";

/* --------------------------------------------------------------------------
   CommissionEditor — /admin/commission (2S5-FE-01). Three things, one screen:

   1. The rules in effect, per kind, highest priority first — the order the
      API applies them — each with its earlier versions.
   2. Add a rule, or revise one. A revision is a new version from now; the
      old one keeps covering the orders already approved under it.
   3. Preview a sample order: the split under the rules in effect, and — if
      the add-rule form is filled in — what it would be with that rule too,
      before anything is saved. The API computes both; this only shows them.
   -------------------------------------------------------------------------- */

type Result<T> = { ok: true; value: T } | { ok: false; message: string };
type Actions = {
  create: (rule: Exclude<ReturnType<typeof toRuleInput>, { ok: false }>["rule"]) => Promise<Result<ApiRule>>;
  revise: (id: string, change: { bps: number; fixedCents?: number; priority: number; note: string | null }) => Promise<Result<ApiRule>>;
  preview: (input: {
    lines: Exclude<ReturnType<typeof toPreviewLines>, { ok: false }>["lines"];
    draft: Omit<Exclude<ReturnType<typeof toRuleInput>, { ok: false }>["rule"], "note"> | null;
  }) => Promise<Result<PreviewResult>>;
};

const inputCls = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-admin/60";
const btn = "inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";
const primary = `${btn} bg-primary text-cta-ink hover:bg-primary-soft`;
const secondary = `${btn} border border-line text-text hover:bg-surface-2`;

const EMPTY_RULE: NewRuleForm = { kind: "PLATFORM_FEE", scope: "GLOBAL", scopeRef: "", percent: "", fixed: "", priority: "0", note: "" };
const SAMPLE: SampleLine[] = [{ label: "Courtside banner", amount: "1200", propertyKind: "TEAM", athleteItem: false, teamShare: "" }];

export function CommissionEditor({ rules, actions }: { rules: ApiRule[]; actions: Actions }) {
  const router = useRouter();
  const groups = groupRules(rules);
  const [form, setForm] = useState<NewRuleForm>(EMPTY_RULE);
  const [formMsg, setFormMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  const save = () => {
    const built = toRuleInput(form);
    if (!built.ok) return setFormMsg({ tone: "bad", text: built.message });
    startSaving(async () => {
      const r = await actions.create(built.rule);
      if (!r.ok) return setFormMsg({ tone: "bad", text: r.message });
      setFormMsg({ tone: "ok", text: `Saved: ${KINDS.find((k) => k.kind === r.value.kind)?.label} ${rateLabel(r.value)} for ${scopeLabel(r.value).toLowerCase()}.` });
      setForm(EMPTY_RULE);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="rules-in-effect" className="space-y-3">
        <h2 id="rules-in-effect" className="text-sm font-semibold">Rules in effect</h2>
        {groups.map((g) => (
          <Card key={g.kind} className="space-y-3 p-4">
            <div>
              <h3 className="text-xs font-semibold">{g.label}</h3>
              <p className="text-[11px] text-muted">{g.hint}</p>
            </div>
            {g.current.length === 0 ? (
              <p className="text-xs text-muted">No rule — this adds nothing to a sale.</p>
            ) : (
              <ul className="space-y-2">
                {g.current.map((r, i) => (
                  <RuleRow key={r.id} rule={r} winsFor={i === 0} history={g.history[r.ruleKey] ?? []} revise={actions.revise} onDone={() => router.refresh()} />
                ))}
              </ul>
            )}
          </Card>
        ))}
      </section>

      <section aria-labelledby="add-rule">
        <Card className="space-y-3 p-4">
          <h2 id="add-rule" className="text-sm font-semibold">Add a rule</h2>
          <RuleFields form={form} setForm={setForm} />
          {formMsg && <p role="status" className={`text-xs ${formMsg.tone === "ok" ? "text-accent" : "text-danger"}`}>{formMsg.text}</p>}
          <div className="flex gap-2">
            <button type="button" className={primary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save rule"}</button>
            <span className="self-center text-[11px] text-muted">Preview it below before saving — the preview uses what&rsquo;s filled in here.</span>
          </div>
        </Card>
      </section>

      <Preview form={form} preview={actions.preview} />
    </div>
  );
}

function RuleFields({ form, setForm }: { form: NewRuleForm; setForm: (f: NewRuleForm) => void }) {
  const kind = KINDS.find((k) => k.kind === form.kind)!;
  const set = (patch: Partial<NewRuleForm>) => setForm({ ...form, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs">What it is
        <select className={inputCls} value={form.kind} onChange={(e) => set({ kind: e.target.value as NewRuleForm["kind"], fixed: "" })}>
          {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
      </label>
      <label className="text-xs">Applies to
        <select className={inputCls} value={form.scope} onChange={(e) => set({ scope: e.target.value as RuleScope, scopeRef: e.target.value === "PROPERTY_KIND" ? "TEAM" : "" })}>
          {SCOPES.map((s) => <option key={s.scope} value={s.scope}>{s.label}</option>)}
        </select>
      </label>
      {form.scope === "PROPERTY_KIND" ? (
        <label className="text-xs">Property type
          <select className={inputCls} value={form.scopeRef} onChange={(e) => set({ scopeRef: e.target.value })}>
            {PROPERTY_KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
      ) : form.scope === "GLOBAL" ? <div /> : (
        <label className="text-xs">{form.scope === "PROPERTY" ? "Property id" : "Sponsor id"}
          <input className={inputCls} value={form.scopeRef} onChange={(e) => set({ scopeRef: e.target.value })} placeholder="e.g. cmukq4xi6…" />
        </label>
      )}
      <label className="text-xs">Rate (%)
        <input className={inputCls} inputMode="decimal" value={form.percent} onChange={(e) => set({ percent: e.target.value })} placeholder="15" />
      </label>
      {kind.fixed ? (
        <label className="text-xs">Fixed amount ($, optional)
          <input className={inputCls} inputMode="decimal" value={form.fixed} onChange={(e) => set({ fixed: e.target.value })} placeholder="0.30" />
        </label>
      ) : <div />}
      <label className="text-xs">Priority (higher wins)
        <input className={inputCls} inputMode="numeric" value={form.priority} onChange={(e) => set({ priority: e.target.value })} />
      </label>
      <label className="text-xs sm:col-span-3">Note (optional)
        <input className={inputCls} value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={500} placeholder="Why this rate — e.g. agreed with Bowie Bulldogs, Sept 2026" />
      </label>
    </div>
  );
}

function RuleRow({
  rule, winsFor, history, revise, onDone,
}: { rule: ApiRule; winsFor: boolean; history: ApiRule[]; revise: Actions["revise"]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [percent, setPercent] = useState(String(rule.bps / 100));
  const [fixed, setFixed] = useState(rule.fixedCents ? (rule.fixedCents / 100).toFixed(2) : "");
  const [priority, setPriority] = useState(String(rule.priority));
  const [note, setNote] = useState(rule.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fixedAllowed = KINDS.find((k) => k.kind === rule.kind)?.fixed;

  const submit = () => {
    const bps = parsePercent(percent);
    const fixedCents = parseDollars(fixed);
    if (bps === null) return setMsg("Enter the rate as a percentage from 0 to 100.");
    if (fixedCents === null) return setMsg("Enter the fixed amount in dollars.");
    if (!/^-?\d{1,4}$/.test(priority.trim())) return setMsg("Priority is a whole number.");
    start(async () => {
      const r = await revise(rule.id, { bps, ...(fixedAllowed ? { fixedCents } : {}), priority: Number(priority.trim()), note: note.trim() || null });
      if (!r.ok) return setMsg(r.message);
      setOpen(false);
      setMsg(null);
      onDone();
    });
  };

  return (
    <li className="rounded-lg border border-line p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{rateLabel(rule)}</span>
        <span className="text-muted">· {scopeLabel(rule)}</span>
        <Badge tone="neutral">priority {rule.priority}</Badge>
        <Badge tone="neutral">v{rule.version}</Badge>
        {winsFor && <Badge tone="accent">applies first</Badge>}
        <span className="text-[11px] text-muted">since {new Date(rule.effectiveFrom).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        <span className="ml-auto flex gap-2">
          {history.length > 0 && (
            <button type="button" className="text-[11px] text-muted underline" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
              {showHistory ? "Hide" : "Show"} {history.length} earlier version{history.length === 1 ? "" : "s"}
            </button>
          )}
          <button type="button" className={secondary} onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Cancel" : "Revise"}</button>
        </span>
      </div>
      {rule.note && <p className="mt-1 text-[11px] text-muted">{rule.note}</p>}
      {showHistory && (
        <ul className="mt-2 space-y-1 border-l border-line pl-3 text-[11px] text-muted">
          {history.map((h) => (
            <li key={h.id}>
              v{h.version}: {rateLabel(h)}, priority {h.priority} — {new Date(h.effectiveFrom).toLocaleDateString("en-US")} to {h.effectiveTo ? new Date(h.effectiveTo).toLocaleDateString("en-US") : "now"}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label>Rate (%)<input className={inputCls} inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} /></label>
          {fixedAllowed ? <label>Fixed ($)<input className={inputCls} inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} /></label> : <div />}
          <label>Priority<input className={inputCls} inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} /></label>
          <label className="sm:col-span-4">Note<input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
          <div className="sm:col-span-4 flex items-center gap-2">
            <button type="button" className={primary} onClick={submit} disabled={pending}>{pending ? "Saving…" : `Save as version ${rule.version + 1}`}</button>
            <span className="text-[11px] text-muted">From now on. Orders already approved keep version {rule.version}.</span>
          </div>
          {msg && <p role="status" className="sm:col-span-4 text-danger">{msg}</p>}
        </div>
      )}
    </li>
  );
}

function Preview({ form, preview }: { form: NewRuleForm; preview: Actions["preview"] }) {
  const [lines, setLines] = useState<SampleLine[]>(SAMPLE);
  const [withDraft, setWithDraft] = useState(true);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draft = toRuleInput(form);
  const hasDraft = form.percent.trim() !== "" && draft.ok;

  const setLine = (i: number, patch: Partial<SampleLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const run = () => {
    const built = toPreviewLines(lines);
    if (!built.ok) return setMsg(built.message);
    start(async () => {
      const d = withDraft && hasDraft && draft.ok ? draft.rule : null;
      const r = await preview({
        lines: built.lines,
        draft: d ? { kind: d.kind, scope: d.scope, scopeRef: d.scopeRef, bps: d.bps, fixedCents: d.fixedCents, priority: d.priority } : null,
      });
      if (!r.ok) { setResult(null); return setMsg(r.message); }
      setMsg(null);
      setResult(r.value);
    });
  };

  return (
    <section aria-labelledby="preview">
      <Card className="space-y-3 p-4">
        <div>
          <h2 id="preview" className="text-sm font-semibold">Preview a sample order</h2>
          <p className="text-[11px] text-muted">Nothing is saved. The split is worked out exactly as it would be when an order is approved.</p>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_1fr_auto] text-xs">
              <label>Item<input className={inputCls} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} /></label>
              <label>Sale ($)<input className={inputCls} inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} /></label>
              <label>Property type
                <select className={inputCls} value={l.propertyKind} onChange={(e) => setLine(i, { propertyKind: e.target.value })}>
                  {PROPERTY_KINDS.map((k) => <option key={k} value={k}>{k.charAt(0) + k.slice(1).toLowerCase()}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 pb-2">
                <input type="checkbox" checked={l.athleteItem} onChange={(e) => setLine(i, { athleteItem: e.target.checked })} /> Athlete&rsquo;s item
              </label>
              <label className={l.athleteItem ? "" : "invisible"}>Property&rsquo;s cut (%)
                <input className={inputCls} inputMode="decimal" value={l.teamShare} onChange={(e) => setLine(i, { teamShare: e.target.value })} placeholder="20" />
              </label>
              <button type="button" className={`${secondary} mb-0.5`} onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}>Remove</button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button type="button" className={secondary} onClick={() => setLines([...lines, { label: "", amount: "", propertyKind: "TEAM", athleteItem: false, teamShare: "" }])} disabled={lines.length >= 20}>Add a line</button>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={withDraft} onChange={(e) => setWithDraft(e.target.checked)} disabled={!hasDraft} />
            {hasDraft && draft.ok
              ? <>Also show it with the unsaved rule ({KINDS.find((k) => k.kind === draft.rule.kind)?.label} {pctLabel(draft.rule.bps)})</>
              : <span className="text-muted">Fill in &ldquo;Add a rule&rdquo; to compare with an unsaved rule</span>}
          </label>
          <button type="button" className={primary} onClick={run} disabled={pending}>{pending ? "Working it out…" : "Preview the split"}</button>
        </div>
        {msg && <p role="status" className="text-xs text-danger">{msg}</p>}
        {result && <PreviewTable result={result} />}
      </Card>
    </section>
  );
}

function PreviewTable({ result }: { result: PreviewResult }) {
  const runs = [{ name: "Rules in effect", run: result.current }, ...(result.withDraft ? [{ name: "With the unsaved rule", run: result.withDraft }] : [])];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">The split of the sample order</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Whole order</th>
            {runs.map((r) => <th key={r.name} scope="col" className="py-2 pr-3 text-right font-medium">{r.name}</th>)}
            {runs.length === 2 && <th scope="col" className="py-2 text-right font-medium">Change</th>}
          </tr>
        </thead>
        <tbody>
          {PREVIEW_ROWS.map((row) => {
            const a = runs[0]!.run.totals[row.key];
            const b = runs[1]?.run.totals[row.key];
            return (
              <tr key={row.key} className="border-b border-line/60">
                <th scope="row" className={`py-1.5 pr-3 text-left ${row.strong ? "font-semibold" : "font-normal"}`}>{row.label}</th>
                <td className={`py-1.5 pr-3 text-right tabular-nums ${row.strong ? "font-semibold" : ""}`}>{usd(a)}</td>
                {b !== undefined && <td className={`py-1.5 pr-3 text-right tabular-nums ${row.strong ? "font-semibold" : ""}`}>{usd(b)}</td>}
                {b !== undefined && <td className={`py-1.5 text-right tabular-nums ${b === a ? "text-muted" : ""}`}>{b === a ? "—" : `${b > a ? "+" : "−"}${usd(Math.abs(b - a))}`}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {runs[0]!.run.lines.some((l) => l.teamAvailableCents !== null) && (
        <p className="mt-2 text-[11px] text-muted">
          Athlete items: {runs[0]!.run.lines.filter((l) => l.teamAvailableCents !== null).map((l) =>
            `${l.lineId} — property ${usd(l.teamAvailableCents!)}, athlete ${usd(l.availableCents - l.teamAvailableCents!)}`).join("; ")} (rules in effect).
        </p>
      )}
    </div>
  );
}
