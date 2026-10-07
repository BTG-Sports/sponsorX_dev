"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { SAMPLE, SamplePanel, btnPrimary, btnQuiet, type PreviewFn } from "@/components/commission-preview";
import { RuleDialog, type RuleDialogMode } from "@/components/commission-rule-dialog";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { Badge } from "@/components/ui";
import {
  groupRules, kindSummary, rateLabel, scopeLabel, sinceLabel, toRuleInput,
  type ApiRule, type RuleGroup, type RuleKind, type SampleLine,
} from "@/lib/commission-live";

/* --------------------------------------------------------------------------
   CommissionEditor — /admin/commission (2S5-FE-01), restructured as the
   commission desk (P1-ART-19, 2026-10-07; owner: "too much space, redesign
   or restructure the page itself to make it easier for the eyes").

   Before: six tall cards, one per kind, most saying "No rule"; a whole
   add-rule form always open under them; the sample order under that. A
   screen and a half of boxes to learn one thing — what comes off a sale.

   Now, three things, one screen:
   1. THE SPLIT STRIP — six tiles in the order money comes off a sale
      (ledger design §2), each with the rate for everyone as its headline
      and one line under it (overrides, since when, or "no rule"). The
      strip IS the answer to "how is a sale split?"; a tile picks a kind.
   2. THE KIND'S RULES — one stage table for the picked kind (who it
      applies to, rate, priority, since, version), highest priority first,
      the order the API applies them; a row's earlier versions unfold
      under it. "Add a rule" and "Revise" open a dialog (P1-ART-17's
      shape) instead of forms living on the page.
   3. THE SAMPLE ORDER — beside the table on a wide screen, sticky: a few
      lines and the split the API works out. The dialog previews the
      unsaved rule against the same lines.

   The API decides everything that matters (which rule applies, versions,
   the split); this only shows its answers.
   -------------------------------------------------------------------------- */

type Result<T> = { ok: true; value: T } | { ok: false; message: string };
type Actions = {
  create: (rule: Exclude<ReturnType<typeof toRuleInput>, { ok: false }>["rule"]) => Promise<Result<ApiRule>>;
  revise: (id: string, change: { bps: number; fixedCents?: number; priority: number; note: string | null }) => Promise<Result<ApiRule>>;
  preview: PreviewFn;
};

export function CommissionEditor({ rules, actions }: { rules: ApiRule[]; actions: Actions }) {
  const router = useRouter();
  const groups = groupRules(rules);
  const [kind, setKind] = useState<RuleKind>(() => groups.find((g) => g.current.length)?.kind ?? "PLATFORM_FEE");
  const [dialog, setDialog] = useState<RuleDialogMode | null>(null);
  const [lines, setLines] = useState<SampleLine[]>(SAMPLE);
  const [flash, setFlash] = useState<string | null>(null);
  const group = groups.find((g) => g.kind === kind)!;

  return (
    <div className="space-y-5">
      <SplitStrip groups={groups} active={kind} onPick={(k) => { setKind(k); setFlash(null); }} />

      {flash && (
        <p role="status" className="sx-ops-in rounded-lg border border-[#22c55e]/40 bg-[#22c55e]/10 px-3.5 py-2.5 text-xs text-[#86efac]">
          {flash}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)] lg:items-start">
        <KindPanel
          group={group}
          onAdd={() => setDialog({ kind: "add", ruleKind: kind })}
          onRevise={(rule) => setDialog({ kind: "revise", rule })}
        />
        <SamplePanel lines={lines} setLines={setLines} preview={actions.preview} />
      </div>

      {dialog && (
        <RuleDialog
          mode={dialog}
          lines={lines}
          create={actions.create}
          revise={actions.revise}
          preview={actions.preview}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            setFlash(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ the strip */

function SplitStrip({ groups, active, onPick }: { groups: RuleGroup[]; active: RuleKind; onPick: (k: RuleKind) => void }) {
  return (
    <section aria-label="How a sale is split">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {groups.map((g, i) => {
          const s = kindSummary(g);
          const on = g.kind === active;
          return (
            <li key={g.kind} className="sx-ops-in min-w-0" style={{ "--sx-reveal-delay": `${i * 0.06}s` } as CSSProperties}>
              <button
                type="button"
                onClick={() => onPick(g.kind)}
                aria-pressed={on}
                aria-label={`${g.label}: ${s.headline === "—" ? "no rate for everyone" : s.headline}, ${s.caption}`}
                className={`relative block w-full min-w-0 rounded-md border px-3.5 pb-3 pt-3 text-left transition-all duration-300 ${
                  on
                    ? "border-[#9be0ff] bg-[#0d1b2e]/90 shadow-[0_0_22px_rgba(46,155,245,.35)]"
                    : "border-[#63b4f8]/22 bg-[#0a1424]/70 hover:border-[#63b4f8]/60 hover:bg-[#0c1829]/90"
                }`}
              >
                <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${on ? "bg-[#9be0ff] shadow-[0_0_10px_#9be0ff]" : s.empty ? "bg-white/10" : "bg-[#2e9bf5]"}`} />
                <span className="flex items-baseline gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a96a3]">
                  <span className="font-mono text-[#9be0ff]/70">{String(i + 1).padStart(2, "0")}</span>
                  <span className="truncate">{g.label}</span>
                </span>
                <span className={`mt-1.5 block truncate text-[22px] font-bold leading-none tracking-tight tabular-nums ${s.empty ? "text-[#5b6b7d]" : on ? "text-white" : "text-[#cfe9ff]"}`}>
                  {s.headline}
                </span>
                <span className="mt-1.5 block truncate text-[11px] text-[#7e88a0]">{s.caption}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-muted">
        In the order money comes off a sale: BTG&rsquo;s fees and processing first, then the property&rsquo;s share, then what comes off that. Pick one to see its rules.
      </p>
    </section>
  );
}

/* ----------------------------------------------------- the kind's rules */

const COLUMNS: Column[] = [
  { key: "scope", label: "Applies to" },
  { key: "rate", label: "Rate", num: true },
  { key: "priority", label: "Priority", num: true },
  { key: "since", label: "Since" },
  { key: "version", label: "Version" },
  { key: "actions", label: "Actions", srOnly: true },
];

function KindPanel({ group, onAdd, onRevise }: { group: RuleGroup; onAdd: () => void; onRevise: (r: ApiRule) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby="kind-rules" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="kind-rules" className="sx-section-title text-sm font-semibold">{group.label}</h2>
          <p className="mt-1 text-[11px] text-muted">{group.hint}. Highest priority first — the order the API tries them; the first that fits a sale applies.</p>
        </div>
        <button type="button" className={btnPrimary} onClick={onAdd}>+ Add a rule</button>
      </div>

      {group.current.length === 0 ? (
        <div className="sx-card flex flex-col items-start gap-3 rounded-lg border border-dashed border-line px-5 py-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">No {group.label.toLowerCase()} rule</p>
            <p className="mt-0.5 text-[11px] text-muted">A sale carries none of this until a rule says otherwise.</p>
          </div>
          <button type="button" className={btnQuiet} onClick={onAdd}>Add one</button>
        </div>
      ) : (
        <StageTable label={`${group.label} rules, highest priority first`} columns={COLUMNS}>
          {group.current.flatMap((r, i) => {
            const history = group.history[r.ruleKey] ?? [];
            const unfolded = open === r.id;
            const main = (
              <Tr key={r.id} i={i} tone={i === 0 ? "accent" : undefined}>
                <Td>
                  <span className="block min-w-0">
                    <strong className="block text-[13px] font-semibold text-text">{scopeLabel(r)}</strong>
                    {r.note && <span className="block text-[11px] text-muted">{r.note}</span>}
                    {i === 0 && group.current.length > 1 && <Badge tone="accent">applies first</Badge>}
                  </span>
                </Td>
                <Td label="Rate" num className="text-[13px] font-semibold">{rateLabel(r)}</Td>
                <Td label="Priority" num muted>{r.priority}</Td>
                <Td label="Since" muted>{sinceLabel(r.effectiveFrom)}</Td>
                <Td label="Version">
                  <span className="tabular-nums">v{r.version}</span>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpen(unfolded ? null : r.id)}
                      aria-expanded={unfolded}
                      aria-controls={`rule-history-${r.id}`}
                      className="ml-2 text-[11px] text-primary-soft underline-offset-2 hover:underline"
                    >
                      {unfolded ? "hide" : `${history.length} earlier`}
                    </button>
                  )}
                </Td>
                <Td act>
                  <button type="button" className={btnQuiet} onClick={() => onRevise(r)}>Revise</button>
                </Td>
              </Tr>
            );
            if (!unfolded) return [main];
            return [
              main,
              <tr key={`${r.id}-h`} id={`rule-history-${r.id}`} className="sx-table-detail">
                <Td colSpan={COLUMNS.length}>
                  <ol className="space-y-1 border-l border-[#63b4f8]/30 pl-3 text-[11px] text-muted">
                    {history.map((h) => (
                      <li key={h.id}>
                        <span className="tabular-nums text-text">v{h.version}</span> · {rateLabel(h)}, priority {h.priority} · {sinceLabel(h.effectiveFrom)} → {h.effectiveTo ? sinceLabel(h.effectiveTo) : "now"}
                        {h.note && <span className="text-faint"> · {h.note}</span>}
                      </li>
                    ))}
                  </ol>
                </Td>
              </tr>,
            ];
          })}
        </StageTable>
      )}
    </section>
  );
}
