import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { IntelDeskHeader, KpiTile } from "@/components/intel-desk-bits";
import { FlagToggle, ThresholdEditor, VersionActions, VersionCompare } from "@/components/model-registry";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Primary, StageTable, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { Card, SectionHeading } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { dayLabel, momentLabel, qs } from "@/lib/intel-admin";
import { ENGINES, cpm } from "@/lib/intelligence";
import {
  BENCHMARK_STATUS,
  REGISTRY_VIEWS,
  STAGE,
  STATUS,
  backtestLabel,
  cellKey,
  checkFor,
  defaultPair,
  emptyRegistry,
  featureLabel,
  flagMatrix,
  heldBecauseOf,
  isSmallSample,
  noActionReason,
  pickModel,
  registryKpis,
  registryView,
  SAMPLE_REGISTRY,
  type BenchmarkStatus,
  type ModelRegistry,
  type RegistryModel,
  type RegistryView,
  type VersionStatus,
} from "@/lib/models-live";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S8-FE-02 · Model and rule administration (Spec §16 P3-10; acceptance
   #11 and #12). Model versions, settings, match factors, benchmarks and
   feature flags — managed here, never by a deploy.

   Three views (?view): Models & settings (one model at a time, ?model:
   its versions with Validate / Activate / Roll back and each one's latest
   backtest, a side-by-side compare of settings and metrics, the settings
   editor with its safe ranges, the match factors, and the rollout note),
   Benchmarks (each one's verdict with its reasons, and the reconciliation
   verdict — 3S9-QA-02) and Feature flags (tenant × feature switches).
   Every change asks for a reason (3S0-PMO-02) — components/model-registry.tsx.

   Reads  GET /intelligence/models (the whole registry — small, unpaged)
   Writes ./actions.ts (thresholds, validate, activate, rollback, flags)
   Engine "models"; until it answers, <EnginePending> and no number.
   BTG admins only. ?demo=loading|empty|error|sample.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/models";
const TITLE = "Models";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ModelsPage({ searchParams }: { searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const sp = await searchParams;
  const view = registryView(sp.view);

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-5">
        <SampleBanner />
        <Registry reg={SAMPLE_REGISTRY} view={view} model={sp.model} sample />
      </div>
    );
  }
  if (demo === "empty") return <Registry reg={emptyRegistry()} view={view} model={sp.model} />;

  const read = await readEngine<ModelRegistry>("models", "/intelligence/models");
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  return <Registry reg={read.data} view={view} model={sp.model} />;
}

const STATUS_CLS: Record<(typeof STATUS)[VersionStatus]["tone"], string> = {
  success: "border-success/50 bg-success/12 text-text",
  primary: "border-primary/50 bg-primary/12 text-text",
  neutral: "border-warn/50 bg-warn/12 text-text",
  faint: "border-dashed border-line text-faint",
};

function StatusBadge({ status }: { status: VersionStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[s.tone]}`}>{s.label}</span>;
}

const VERDICT_CLS: Record<(typeof BENCHMARK_STATUS)[BenchmarkStatus]["tone"], string> = {
  success: "border-success/50 bg-success/12 text-text",
  warn: "border-warn/50 bg-warn/12 text-text",
  danger: "border-danger/50 bg-danger/12 text-text",
};

function VerdictBadge({ status }: { status: BenchmarkStatus }) {
  const s = BENCHMARK_STATUS[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_CLS[s.tone]}`}>{s.label}</span>;
}

function Registry({ reg, view, model, sample = false }: { reg: ModelRegistry; view: RegistryView; model: string | string[] | undefined; sample?: boolean }) {
  const k = registryKpis(reg);
  const demo = sample ? "sample" : null;
  return (
    <div className="space-y-5">
      <IntelDeskHeader title={TITLE} engine={ENGINES.models.name} asOf={reg.asOf} sample={sample} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Models & rule sets" value={String(k.models)} sub="in the registry" />
        <KpiTile
          label="Waiting on a person"
          value={String(k.awaiting + k.held)}
          sub={`${k.held} held draft${k.held === 1 ? "" : "s"} · ${k.awaiting} validated, not live`}
          tone={k.awaiting + k.held ? "warn" : undefined}
        />
        <KpiTile label="Flags switched off" value={`${k.flagsOff} of ${k.flagsTotal}`} sub="tenant × feature" />
        <KpiTile
          label="Benchmarks flagged"
          value={`${k.flaggedBenchmarks} of ${reg.benchmarkValidation.summary.total}`}
          sub={reg.benchmarkValidation.reconciliation.ok ? "reconciliation within tolerance" : "reconciliation not within tolerance"}
          tone={k.flaggedBenchmarks || !reg.benchmarkValidation.reconciliation.ok ? "warn" : undefined}
        />
      </div>

      <TabStrip label="Registry">
        {REGISTRY_VIEWS.map((v) => (
          <TabLink key={v.key} href={`${PATH}${qs({ view: v.key === "models" ? null : v.key, demo })}`} on={v.key === view}>
            {v.label}
          </TabLink>
        ))}
      </TabStrip>

      {view === "models" ? <ModelsView reg={reg} model={model} demo={demo} sample={sample} /> : view === "benchmarks" ? <BenchmarksView reg={reg} /> : <FlagsView reg={reg} sample={sample} />}
    </div>
  );
}

function ModelsView({ reg, model, demo, sample }: { reg: ModelRegistry; model: string | string[] | undefined; demo: string | null; sample: boolean }) {
  const m = pickModel(reg.models, model);
  if (!m) return <EmptyState mark="chart" title="No models registered" hint="Each engine registers its built-in version here when it ships; versions and settings follow." />;
  return (
    <div className="space-y-5">
      <TabStrip label="Model">
        {reg.models.map((x) => (
          <TabLink key={x.key} href={`${PATH}${qs({ model: x.key, demo })}`} on={x.key === m.key}>
            {x.name}
          </TabLink>
        ))}
      </TabStrip>
      <ModelPanel m={m} reg={reg} sample={sample} />
    </div>
  );
}

function ModelPanel({ m, reg, sample }: { m: RegistryModel; reg: ModelRegistry; sample: boolean }) {
  const pair = defaultPair(m);
  const rollouts = reg.rollouts.filter((r) => r.model === m.key);
  const columns: Column[] = [
    { key: "version", label: "Version" },
    { key: "status", label: "Status" },
    { key: "created", label: "Created" },
    { key: "backtest", label: "Backtest" },
    { key: "action", label: "Action", srOnly: true },
  ];
  const byNew = [...m.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const outputs = (v: RegistryModel["versions"][number]) => v.metrics.find((x) => x.label === "Outputs made")?.value;

  return (
    <div className="space-y-5">
      <section>
        <SectionHeading title="Versions" hint={m.activeVersion ? `Live: ${m.activeVersion} — a settings change is the next version.` : "No version is live."} />
        {byNew.length === 0 ? (
          <EmptyState mark="chart" title="No versions yet" hint="A version appears here when settings are saved; inside the safe ranges it goes live at once, outside them it is held for a second person." />
        ) : (
          <StageTable label={`${m.name} versions`} columns={columns}>
            {byNew.map((v, i) => {
              const why = noActionReason(v);
              const made = outputs(v);
              return (
                <Tr key={v.version} i={i} tone={v.status === "active" ? "accent" : v.status === "draft" ? "warn" : undefined}>
                  <Td>
                    <Primary sub={v.notes}>
                      <code className="text-[12px]">{v.version}</code>
                    </Primary>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={v.status} />
                  </Td>
                  <Td label="Created" muted>
                    {v.createdBy === "SponsorX (built in)" ? "Built in" : dayLabel(v.createdAt)} · {v.createdBy}
                  </Td>
                  <Td label="Backtest" muted>
                    {v.backtest ? (
                      <span className="block">
                        <span className={v.backtest.simulated ? "text-warn" : "text-text"}>{backtestLabel(v.backtest)}</span>
                        <span className="block text-[11px] text-faint">ran {dayLabel(v.backtest.ranAt)}{made !== undefined ? ` · ${made} output${made === 1 ? "" : "s"} made` : ""}</span>
                      </span>
                    ) : (
                      <span className="block">
                        <span className="text-faint">No backtest yet</span>
                        {made !== undefined && <span className="block text-[11px] text-faint">{made} output{made === 1 ? "" : "s"} made</span>}
                      </span>
                    )}
                  </Td>
                  <Td act>
                    {why ? (
                      <span className="text-[11px] text-faint">{why}</span>
                    ) : (
                      <VersionActions modelKey={m.key} modelName={m.name} version={v.version} status={v.status} activeVersion={m.activeVersion} heldBecause={heldBecauseOf(v)} preview={sample} />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </StageTable>
        )}
        <p className="mt-2 text-[11px] text-faint">
          A held draft is validated by a second person — never the one who proposed it — then anyone activates it. Rolling back makes a retired version live again. No deploy either way.
        </p>
      </section>

      {/* items-start: each card is its own height, not its neighbour's.
          The compare card stacks above the next one — every .sx-card is its
          own stacking context (backdrop blur), so its version list otherwise
          opened UNDER the Settings card on a phone. */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="relative z-10">
          <SectionHeading title="Compare versions" hint="Settings side by side, then the metrics each recorded: outputs made and its latest backtest (real before simulated)." />
          {pair ? <VersionCompare key={m.key} versions={byNew} thresholds={m.thresholds} initial={pair} /> : <p className="text-xs text-muted">Compare needs two versions — the first settings change makes one.</p>}
        </Card>

        <Card>
          <SectionHeading title="Settings" hint="Saved as the next version. Inside every safe range: live at once. Outside one: held for a second person." />
          {m.thresholds.length ? (
            <ThresholdEditor key={m.key} modelKey={m.key} modelName={m.name} thresholds={m.thresholds} preview={sample} />
          ) : (
            <p className="text-xs text-muted">This model has no adjustable settings.</p>
          )}
        </Card>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {m.factors?.length ? (
          <Card>
            <SectionHeading title="Scoring factors" hint="Points each factor can add to a match score, out of 100 across the factors that apply. Read-only: a new weight is code." />
            <dl className="divide-y divide-line-soft">
              {m.factors.map((f) => (
                <div key={f.key} className="flex items-baseline justify-between gap-3 py-2 text-xs">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="font-medium tabular-nums text-text">{f.weight.toLocaleString("en-US")} pts</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}
        <Card>
          <SectionHeading title="Rollouts" hint="Which tenants a version reaches." />
          {rollouts.length ? (
            <ul className="space-y-3 text-xs">
              {rollouts.map((r) => (
                <li key={r.version}>
                  <p className="font-medium text-text">
                    <code>{r.version}</code> · {STAGE[r.stage]}
                  </p>
                  <p className="mt-0.5 text-muted">{r.tenants.map((t) => t.name).join(", ") || "No tenants yet"}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">
              There is no staged rollout. Settings are per tenant: the version you make live here is live for this tenant only, and every other tenant keeps its own. To take a feature away from a tenant, switch it off under Feature flags.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReconciliationCard({ reg }: { reg: ModelRegistry }) {
  const v = reg.benchmarkValidation;
  const r = v.reconciliation;
  return (
    <Card>
      <SectionHeading
        title="Reconciliation"
        hint={`The nightly fact check: the daily summaries equal the facts, and the facts equal the app's records. Tolerance: ${r.tolerance}.`}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${r.ok ? VERDICT_CLS.success : VERDICT_CLS.warn}`}>
          {r.ok ? "Within tolerance" : "Not within tolerance"}
        </span>
        <span className="text-muted">{r.reason}</span>
      </div>
      <p className="mt-2 text-[11px] text-faint">
        {r.lastRunAt ? `Last ran ${momentLabel(r.lastRunAt)}${r.fresh ? "" : " — stale: it must run within 2 days"}` : "Not run yet"}
        {r.differences > 0 ? ` · ${r.differences} difference${r.differences === 1 ? "" : "s"}` : ""}
        {` · benchmarks checked ${momentLabel(v.checkedAt)}: ${v.summary.valid} of ${v.summary.total} sound to price from`}
      </p>
    </Card>
  );
}

function BenchmarksView({ reg }: { reg: ModelRegistry }) {
  if (reg.benchmarks.length === 0) {
    return (
      <div className="space-y-5">
        <EmptyState mark="chart" title="No benchmarks yet" hint="Benchmarks are built nightly from the last 12 months of booked orders, per segment, once enough have run." />
        <ReconciliationCard reg={reg} />
      </div>
    );
  }
  const columns: Column[] = [
    { key: "segment", label: "Segment" },
    { key: "verdict", label: "Verdict" },
    { key: "p25", label: "25th pct CPM", num: true },
    { key: "median", label: "Median CPM", num: true },
    { key: "p75", label: "75th pct CPM", num: true },
    { key: "n", label: "Sample", num: true },
    { key: "when", label: "Refreshed" },
  ];
  return (
    <div className="space-y-5">
      <StageTable label="CPM benchmarks" columns={columns}>
        {reg.benchmarks.map((b, i) => {
          const check = checkFor(reg.benchmarkValidation, b);
          /* With a verdict, the verdict decides; without one, only the sample size can say anything. */
          const thin = !check && isSmallSample(b, reg.benchmarkMinSample);
          const flagged = check ? check.status !== "valid" : thin;
          return (
            <Tr key={b.segment} i={i} tone={check?.status === "inconsistent" ? "danger" : flagged ? "warn" : undefined}>
              <Td>
                <Primary sub={flagged ? "Shown, not used for pricing" : undefined}>{b.segment}</Primary>
              </Td>
              <Td label="Verdict">
                {check ? (
                  <span className="block">
                    <VerdictBadge status={check.status} />
                    {check.reasons.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
                        {check.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </span>
                ) : (
                  <span className="text-[11px] text-faint">{thin ? `Small sample — under ${reg.benchmarkMinSample} orders` : "Not checked yet"}</span>
                )}
              </Td>
              <Td label="25th pct" num>{cpm(b.p25)}</Td>
              <Td label="Median" num>{cpm(b.median)}</Td>
              <Td label="75th pct" num>{cpm(b.p75)}</Td>
              <Td label="Sample" num>
                {b.sampleSize.toLocaleString("en-US")}
                {thin && <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 text-[10px] font-semibold uppercase text-warn">small</span>}
              </Td>
              <Td label="Refreshed" muted>{momentLabel(b.refreshedAt)}</Td>
            </Tr>
          );
        })}
      </StageTable>
      <p className="text-[11px] text-faint">
        A benchmark is sound to price from when its quartiles are in order, it was refreshed within 2 days, at least {reg.benchmarkMinSample} orders are behind it and its middle half spans at most 4×. Every failing check is listed.
      </p>
      <ReconciliationCard reg={reg} />
    </div>
  );
}

function FlagsView({ reg, sample }: { reg: ModelRegistry; sample: boolean }) {
  const mx = flagMatrix(reg.flags);
  if (mx.features.length === 0) {
    return <EmptyState mark="users" title="No feature flags yet" hint="Each intelligence feature gets a switch per tenant once the registry is live. No switch means on." />;
  }
  const columns: Column[] = [{ key: "tenant", label: "Tenant" }, ...mx.features.map((f) => ({ key: f, label: featureLabel(f) }))];
  return (
    <div className="space-y-2">
      <StageTable label="Intelligence features per tenant" columns={columns}>
        {mx.tenants.map((t, i) => (
          <Tr key={t.id} i={i}>
            <Td>
              <Primary>{t.name}</Primary>
            </Td>
            {mx.features.map((f) => {
              const on = mx.cells[cellKey(f, t.id)];
              return (
                <Td key={f} label={featureLabel(f)}>
                  {on === undefined ? (
                    <span className="text-[11px] text-faint">no flag</span>
                  ) : (
                    <FlagToggle feature={f} featureName={featureLabel(f)} tenantId={t.id} tenantName={t.name} enabled={on} preview={sample} />
                  )}
                </Td>
              );
            })}
          </Tr>
        ))}
      </StageTable>
      <p className="text-[11px] text-faint">
        Switching a feature off hides it for that tenant everywhere at once: its pages answer &ldquo;switched off&rdquo; and its nightly run skips the tenant. Each switch asks for a reason and is audited.
      </p>
    </div>
  );
}
