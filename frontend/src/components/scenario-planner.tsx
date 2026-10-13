"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { calculateScenarioAction, saveScenarioAction, type CalculateResult } from "@/app/(app)/admin/intelligence/scenarios/actions";
import { Dropdown } from "@/components/filter-kit";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { Button, Card } from "@/components/ui";
import { confidenceLabel, cpm, pct, usd } from "@/lib/intelligence";
import {
  BUDGET_RANGE,
  CPM_RANGE,
  addFormat,
  cleanInputs,
  compact,
  diffResults,
  inputsKey,
  parseStateCodes,
  rebalanceMix,
  removeFormat,
  sampleResult,
  signedCompact,
  signedPoints,
  signedRatio,
  signedUsd,
  utcMinute,
  validateInputs,
  type ApiSavedScenario,
  type ApiScenarioDesk,
  type ScenarioInputs,
  type ScenarioOptions,
  type ScenarioResult,
} from "@/lib/scenarios-live";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner's island: two scenarios side by side,
   adjusted live while a sponsor watches.

   Each column owns its inputs; every change recalculates through the
   scenario engine (calculateScenarioAction → POST
   /intelligence/scenarios/calculate) once the sliders settle — debounced
   300ms, the latest answer wins, an answer for inputs already on screen is
   skipped. Between a change and its answer the old figures dim; invalid
   inputs say why and keep the last good answer dimmed.

   Every figure in a result card is the engine's answer, stamped with its
   model version and confidence. The comparison strip is B − A of two engine
   answers — nothing else is computed here. In the dev sample preview the
   calculator is lib/scenarios-live.ts sampleResult, stamped as a sample.
   -------------------------------------------------------------------------- */

type Calc = (i: ScenarioInputs) => Promise<CalculateResult>;

const sampleCalc: Calc = async (i) => ({ ok: true, result: sampleResult(i) });

export function ScenarioPlanner({ desk, sample }: { desk: ApiScenarioDesk; sample: boolean }) {
  const calc: Calc = sample ? sampleCalc : calculateScenarioAction;
  const a = useScenario(desk.defaults, calc);
  const b = useScenario(desk.defaults, calc);
  const diff = a.result && b.result ? diffResults(a.result, b.result) : null;
  const stale = a.stale || b.stale;

  return (
    <div className="space-y-5">
      <section aria-label="B against A" aria-live="polite" className={`grid gap-3 sm:grid-cols-3 transition-opacity ${stale ? "opacity-60" : ""}`}>
        <DeltaTile
          label="Impressions (expected)"
          value={diff ? signedCompact(diff.impressionsMid.delta) : "—"}
          sub={diff ? `${signedRatio(diff.impressionsMid.ratio)} · B against A` : "Waiting for both answers"}
          sign={diff?.impressionsMid.delta}
        />
        <DeltaTile
          label="Expected revenue"
          value={diff ? signedUsd(diff.revenueCents.delta) : "—"}
          sub={diff ? `${signedRatio(diff.revenueCents.ratio)} · B against A` : "Waiting for both answers"}
          sign={diff?.revenueCents.delta}
        />
        <DeltaTile
          label="Chance of full delivery"
          value={diff ? signedPoints(diff.deliveryProbability) : "—"}
          sub={diff ? "percentage points · B against A" : "Waiting for both answers"}
          sign={diff?.deliveryProbability}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ScenarioColumn letter="A" s={a} options={desk.options} sample={sample} copy={{ label: "Copy to B", run: () => b.load(a.inputs) }} />
        <ScenarioColumn letter="B" s={b} options={desk.options} sample={sample} copy={{ label: "Copy to A", run: () => a.load(b.inputs) }} />
      </div>

      <SavedScenarios desk={desk} onLoad={(sc, into) => (into === "A" ? a : b).load(sc.inputs, sc.name)} />
    </div>
  );
}

/* ---------------------------------------------------------------- the hook */

type Scenario = ReturnType<typeof useScenario>;

function useScenario(initial: ScenarioInputs, calc: Calc) {
  const [inputs, setInputs] = useState(initial);
  const [name, setName] = useState("");
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const shown = useRef<string | null>(null);

  const schedule = useCallback(
    (next: ScenarioInputs, wait = 300) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const issues = validateInputs(cleanInputs(next));
        if (issues.length) {
          seq.current += 1; /* drop any answer still in flight */
          setBusy(false);
          setError(issues[0]);
          return;
        }
        const key = inputsKey(next);
        if (key === shown.current) {
          setError(null);
          return;
        }
        const n = (seq.current += 1);
        setBusy(true);
        const out = await calc(next).catch((): CalculateResult => ({ ok: false, error: "The API is unreachable — try again in a minute." }));
        if (n !== seq.current) return;
        setBusy(false);
        if (out.ok) {
          shown.current = key;
          setResult(out.result);
          setError(null);
        } else setError(out.error);
      }, wait);
    },
    [calc],
  );

  /* The first answer, on mount. */
  useEffect(() => {
    schedule(initial, 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<ScenarioInputs>) => {
    const next = { ...inputs, ...patch };
    setInputs(next);
    schedule(next);
  };
  const load = (next: ScenarioInputs, title?: string) => {
    setInputs(next);
    if (title) setName(title);
    schedule(next, 0);
  };
  return { inputs, name, setName, result, busy, error, stale: busy || Boolean(error), update, load };
}

/* ------------------------------------------------------------- the columns */

function ScenarioColumn({
  letter,
  s,
  options,
  sample,
  copy,
}: {
  letter: "A" | "B";
  s: Scenario;
  options: ScenarioOptions;
  sample: boolean;
  copy: { label: string; run: () => void };
}) {
  const { inputs, update } = s;
  const formatLabel = (k: string) => options.formats.find((f) => f.key === k)?.label ?? k;
  const unused = options.formats.filter((f) => !inputs.mix.some((l) => l.format === f.key));
  const id = `sc-${letter}`;

  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
            {letter}
          </span>
          {s.name || `Scenario ${letter}`}
        </h2>
        <button type="button" onClick={copy.run} className="text-[11px] font-medium text-muted underline-offset-2 hover:text-text hover:underline">
          {copy.label}
        </button>
      </div>

      <ResultCard s={s} />

      <Card className="space-y-4 p-4">
        <MoneyField
          id={`${id}-budget`}
          label="Budget"
          cents={inputs.budgetCents}
          range={BUDGET_RANGE}
          shown={usd(inputs.budgetCents)}
          onCents={(c) => update({ budgetCents: c })}
        />
        <MoneyField
          id={`${id}-cpm`}
          label="CPM"
          cents={inputs.cpmCents}
          range={CPM_RANGE}
          shown={cpm(inputs.cpmCents)}
          cents2
          onCents={(c) => update({ cpmCents: c })}
        />

        <fieldset className="space-y-2">
          <legend className="text-[11px] font-medium text-muted">Audience</legend>
          <div className="flex flex-wrap gap-2">
            <Dropdown
              label={`Scenario ${letter} sport`}
              allLabel="Any sport"
              value={inputs.audience.sport ?? ""}
              options={options.sports.map((v) => ({ value: v, label: v }))}
              onChange={(v) => update({ audience: { ...inputs.audience, sport: v || undefined } })}
              tone="admin"
            />
            <Dropdown
              label={`Scenario ${letter} age band`}
              allLabel="Any age"
              value={inputs.audience.ageBand ?? ""}
              options={options.ageBands.map((v) => ({ value: v, label: v }))}
              onChange={(v) => update({ audience: { ...inputs.audience, ageBand: v || undefined } })}
              tone="admin"
            />
          </div>
          <StatesField
            id={`${id}-states`}
            codes={inputs.audience.stateCodes ?? []}
            allowed={options.stateCodes}
            onCodes={(codes) => update({ audience: { ...inputs.audience, stateCodes: codes.length ? codes : undefined } })}
          />
        </fieldset>

        <fieldset className="space-y-2.5">
          <legend className="text-[11px] font-medium text-muted">Inventory mix</legend>
          {inputs.mix.length === 0 && <p className="text-[11px] text-warn">Add a format to calculate.</p>}
          {inputs.mix.map((l) => (
            <div key={l.format}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <label htmlFor={`${id}-mix-${l.format}`}>{formatLabel(l.format)}</label>
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold tabular-nums">{pct(l.share)}</span>
                  <button
                    type="button"
                    onClick={() => update({ mix: removeFormat(inputs.mix, l.format) })}
                    aria-label={`Remove ${formatLabel(l.format)} from scenario ${letter}`}
                    className="grid size-6 place-items-center rounded-full text-faint hover:bg-surface-2 hover:text-text"
                  >
                    ✕
                  </button>
                </span>
              </div>
              <input
                id={`${id}-mix-${l.format}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(l.share * 100)}
                disabled={inputs.mix.length === 1}
                onChange={(e) => update({ mix: rebalanceMix(inputs.mix, l.format, Number(e.target.value) / 100) })}
                className="w-full accent-[var(--sx-primary)] disabled:opacity-50"
              />
            </div>
          ))}
          {unused.length > 0 && (
            <Dropdown
              label={`Add a format to scenario ${letter}`}
              allLabel="+ Add a format"
              value=""
              options={unused.map((f) => ({ value: f.key, label: f.label }))}
              onChange={(v) => v && update({ mix: addFormat(inputs.mix, v) })}
              tone="admin"
              includeAll={false}
            />
          )}
        </fieldset>
      </Card>

      <SaveRow s={s} letter={letter} sample={sample} />
    </section>
  );
}

function ResultCard({ s }: { s: Scenario }) {
  const r = s.result;
  return (
    <Card className={`space-y-4 p-5 transition-opacity ${s.stale && r ? "opacity-60" : ""}`}>
      <div aria-live="polite" className="min-h-4 text-[11px]">
        {s.error ? <span className="text-danger">{s.error}</span> : s.busy ? <span className="text-muted">Calculating…</span> : null}
      </div>
      {!r ? (
        <p className="text-xs text-muted">{s.error ? "No answer yet for these inputs." : "Asking the scenario engine…"}</p>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Expected impressions</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">{compact(r.expectedImpressions.mid)}</p>
            <p className="mt-1 text-xs tabular-nums text-muted">
              likely between {compact(r.expectedImpressions.low)} and {compact(r.expectedImpressions.high)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Expected revenue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{usd(r.expectedRevenueCents)}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Chance of full delivery</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">{pct(r.deliveryProbability)}</p>
            </div>
          </div>
          <p className="text-[11px] text-faint">
            {r.stamp.modelVersion} · {confidenceLabel(r.stamp.confidence)} · {utcMinute(r.stamp.computedAt)}
          </p>
          {r.notes.length > 0 && (
            <ul className="space-y-1 text-[11px] text-muted">
              {r.notes.map((n) => (
                <li key={n} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-warn" />
                  {n}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function DeltaTile({ label, value, sub, sign }: { label: string; value: string; sub: string; sign?: number }) {
  const tone = sign === undefined || sign === 0 ? "text-text" : sign > 0 ? "text-accent" : "text-danger";
  return (
    <Card className="sx-stat p-4">
      <p className="sx-stat-label text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] text-faint">{sub}</p>
    </Card>
  );
}

/* ---------------------------------------------------------------- fields */

/** A slider and a typed field for one money input. The field keeps what's
 *  being typed; the slider pins at its ends if the typed value is past them. */
function MoneyField({
  id,
  label,
  cents,
  range,
  shown,
  cents2 = false,
  onCents,
}: {
  id: string;
  label: string;
  cents: number;
  range: { min: number; max: number; step: number };
  shown: string;
  /** Typed with cents (a CPM), not whole dollars (a budget). */
  cents2?: boolean;
  onCents: (c: number) => void;
}) {
  const asText = (c: number) => (cents2 ? (c / 100).toFixed(2) : String(Math.round(c / 100)));
  const [text, setText] = useState(asText(cents));
  const [seen, setSeen] = useState(cents);
  /* The value moved from elsewhere (the slider, a load): follow it. */
  if (cents !== seen) {
    setSeen(cents);
    if (Math.round(Number(text) * 100) !== cents) setText(asText(cents));
  }
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={`${id}-range`} className="text-[11px] font-medium text-muted">
          {label}
        </label>
        <span className="text-sm font-semibold tabular-nums">{shown}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={`${id}-range`}
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={Math.min(range.max, Math.max(range.min, cents))}
          onChange={(e) => onCents(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--sx-primary)]"
        />
        <span className="relative w-28 shrink-0">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-faint">
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label} in dollars`}
            min={0}
            step={cents2 ? 0.25 : 500}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const v = Number(e.target.value);
              onCents(e.target.value.trim() && Number.isFinite(v) ? Math.round(v * 100) : 0);
            }}
            className="w-full rounded-lg border border-line bg-surface py-1.5 pl-6 pr-2 text-right text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </span>
      </div>
    </div>
  );
}

/** States as typed codes ("TX, OK") — only the ones the engine offers count. */
function StatesField({ id, codes, allowed, onCodes }: { id: string; codes: string[]; allowed: string[]; onCodes: (c: string[]) => void }) {
  const [text, setText] = useState(codes.join(", "));
  const [seen, setSeen] = useState(codes.join(","));
  if (codes.join(",") !== seen) {
    setSeen(codes.join(","));
    if (parseStateCodes(text, allowed).join(",") !== codes.join(",")) setText(codes.join(", "));
  }
  const typed = parseStateCodes(text);
  const ignored = typed.filter((c) => !allowed.includes(c));
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        States
      </label>
      <input
        id={id}
        type="text"
        value={text}
        placeholder="Any state — or type codes, e.g. TX, OK"
        onChange={(e) => {
          setText(e.target.value);
          onCodes(parseStateCodes(e.target.value, allowed));
        }}
        className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs uppercase outline-none placeholder:normal-case placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary"
      />
      {ignored.length > 0 && <p className="mt-1 text-[11px] text-warn">Not offered by the engine, ignored: {ignored.join(", ")}</p>}
    </div>
  );
}

function SaveRow({ s, letter, sample }: { s: Scenario; letter: string; sample: boolean }) {
  const [saving, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const save = () =>
    start(async () => {
      const out = await saveScenarioAction(s.name, s.inputs);
      setNote(out.ok ? { ok: true, text: `Saved “${out.scenario.name}”.` } : { ok: false, text: out.error });
    });
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <label htmlFor={`sc-${letter}-name`} className="sr-only">
          Name scenario {letter}
        </label>
        <input
          id={`sc-${letter}-name`}
          type="text"
          maxLength={80}
          value={s.name}
          onChange={(e) => {
            setNote(null);
            s.setName(e.target.value);
          }}
          placeholder={`Name scenario ${letter} to save it`}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button variant="secondary" onClick={save} disabled={sample || saving || !s.name.trim() || Boolean(s.error)}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {sample && <p className="text-[11px] text-faint">Saving is off in the sample preview.</p>}
      {note && (
        <p role="status" className={`text-[11px] ${note.ok ? "text-accent" : "text-danger"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- saved scenarios */

function SavedScenarios({ desk, onLoad }: { desk: ApiScenarioDesk; onLoad: (sc: ApiSavedScenario, into: "A" | "B") => void }) {
  const btn = "inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-[11px] font-semibold text-text hover:bg-surface-2";
  const columns: Column[] = [
    { key: "name", label: "Scenario" },
    { key: "budget", label: "Budget", num: true },
    { key: "cpm", label: "CPM", num: true },
    { key: "impr", label: "Impressions", num: true },
    { key: "prob", label: "Full delivery", num: true },
    { key: "act", label: "Load", srOnly: true },
  ];
  return (
    <section aria-labelledby="saved-scenarios" className="space-y-3">
      <h2 id="saved-scenarios" className="text-sm font-semibold">
        Saved scenarios
      </h2>
      {desk.page.total === 0 ? (
        <EmptyState mark="inbox" title="No saved scenarios yet" hint="Name a scenario above and save it; it lands here to load into A or B in the next conversation." />
      ) : (
        <PagedTable page={desk.page} noun="Scenarios" label="Saved scenarios" columns={columns}>
          {desk.scenarios.map((sc, i) => (
            <Tr key={sc.id} i={i}>
              <Td>
                <Primary sub={`${utcMinute(sc.savedAt)}${sc.savedBy ? ` · ${sc.savedBy}` : ""} · ${sc.result.stamp.modelVersion}`}>{sc.name}</Primary>
              </Td>
              <Td label="Budget" num>
                {usd(sc.inputs.budgetCents)}
              </Td>
              <Td label="CPM" num>
                {cpm(sc.inputs.cpmCents)}
              </Td>
              <Td label="Impressions" num>
                {compact(sc.result.expectedImpressions.mid)}
              </Td>
              <Td label="Full delivery" num>
                {pct(sc.result.deliveryProbability)}
              </Td>
              <Td act>
                <span className="inline-flex gap-1.5">
                  <button type="button" className={btn} onClick={() => onLoad(sc, "A")} aria-label={`Load ${sc.name} into A`}>
                    Into A
                  </button>
                  <button type="button" className={btn} onClick={() => onLoad(sc, "B")} aria-label={`Load ${sc.name} into B`}>
                    Into B
                  </button>
                </span>
              </Td>
            </Tr>
          ))}
        </PagedTable>
      )}
    </section>
  );
}
