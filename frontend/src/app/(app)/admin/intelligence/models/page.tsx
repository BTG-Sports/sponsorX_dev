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
  REGISTRY_VIEWS,
  STAGE,
  STATUS,
  cellKey,
  defaultPair,
  emptyRegistry,
  featureLabel,
  flagMatrix,
  isSmallSample,
  noActionReason,
  pickModel,
  registryKpis,
  registryView,
  SAMPLE_REGISTRY,
  type ModelRegistry,
  type RegistryModel,
  type RegistryView,
  type VersionStatus,
} from "@/lib/models-live";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S8-FE-02 · Model and rule administration (Spec §16 P3-10; acceptance
   #11 and #12). Pricing factors, model versions, thresholds, benchmarks,
   rollouts and feature flags — managed here, never by a deploy.

   Three views (?view): Models & thresholds (one model at a time, ?model:
   its versions with Activate / Roll back, a side-by-side compare, the
   threshold editor, pricing factors and rollouts), Benchmarks (small
   samples visibly flagged) and Feature flags (tenant × feature switches).
   Every change asks for a reason (3S0-PMO-02) — components/model-registry.tsx.

   Reads  GET /intelligence/models (the whole registry — small, unpaged)
   Writes ./actions.ts (activate, rollback, thresholds, flags)
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
  neutral: "border-line bg-surface-2 text-muted",
  faint: "border-dashed border-line text-faint",
};

function StatusBadge({ status }: { status: VersionStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[s.tone]}`}>{s.label}</span>;
}

function Registry({ reg, view, model, sample = false }: { reg: ModelRegistry; view: RegistryView; model: string | string[] | undefined; sample?: boolean }) {
  const k = registryKpis(reg);
  const demo = sample ? "sample" : null;
  return (
    <div className="space-y-5">
      <IntelDeskHeader title={TITLE} engine={ENGINES.models.name} asOf={reg.asOf} sample={sample} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Models & rule sets" value={String(k.models)} sub="in the registry" />
        <KpiTile label="Ready to activate" value={String(k.awaiting)} sub="validated, not live" tone={k.awaiting ? "warn" : undefined} />
        <KpiTile label="Flags switched off" value={`${k.flagsOff} of ${k.flagsTotal}`} sub="tenant × feature" />
        <KpiTile label="Thin benchmarks" value={String(k.smallSamples)} sub={`sample under ${reg.benchmarkMinSample}`} tone={k.smallSamples ? "warn" : undefined} />
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
  if (!m) return <EmptyState mark="chart" title="No models registered" hint="Each engine registers its first version here when it ships; versions, thresholds and rollouts follow." />;
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
    { key: "rollout", label: "Rollout" },
    { key: "action", label: "Action", srOnly: true },
  ];
  const byNew = [...m.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-5">
      <section>
        <SectionHeading title="Versions" hint={m.activeVersion ? `Live: ${m.activeVersion}` : "No version is live."} />
        {byNew.length === 0 ? (
          <EmptyState mark="chart" title="No versions yet" hint="A version appears here when it's proposed; it's validated before it can go live." />
        ) : (
          <StageTable label={`${m.name} versions`} columns={columns}>
            {byNew.map((v, i) => {
              const ro = rollouts.find((r) => r.version === v.version);
              const why = noActionReason(v);
              return (
                <Tr key={v.version} i={i} tone={v.status === "active" ? "accent" : undefined}>
                  <Td>
                    <Primary sub={v.notes}>
                      <code className="text-[12px]">{v.version}</code>
                    </Primary>
                  </Td>
                  <Td label="Status">
                    <StatusBadge status={v.status} />
                  </Td>
                  <Td label="Created" muted>
                    {dayLabel(v.createdAt)} · {v.createdBy}
                  </Td>
                  <Td label="Rollout" muted>
                    {ro ? `${STAGE[ro.stage]} · ${ro.tenants.length} tenant${ro.tenants.length === 1 ? "" : "s"}` : "—"}
                  </Td>
                  <Td act>
                    {why ? (
                      <span className="text-[11px] text-faint">{why}</span>
                    ) : (
                      <VersionActions modelKey={m.key} modelName={m.name} version={v.version} status={v.status} activeVersion={m.activeVersion} preview={sample} />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </StageTable>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <SectionHeading title="Compare versions" hint="The metrics each version was validated with." />
          {pair ? <VersionCompare key={m.key} versions={byNew} initial={pair} /> : <p className="text-xs text-muted">Compare needs two versions.</p>}
        </Card>

        <Card>
          <SectionHeading title="Thresholds" hint="Applied on the next computation — no deploy." />
          {m.thresholds.length ? (
            <ThresholdEditor key={m.key} modelKey={m.key} modelName={m.name} thresholds={m.thresholds} preview={sample} />
          ) : (
            <p className="text-xs text-muted">This model has no adjustable thresholds.</p>
          )}
        </Card>
      </div>

      {(m.factors?.length || rollouts.length) ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {m.factors?.length ? (
            <Card>
              <SectionHeading title="Pricing factors" hint={`Weights in ${m.activeVersion ?? "the live version"} — a new weight is a new version.`} />
              <dl className="divide-y divide-line-soft">
                {m.factors.map((f) => (
                  <div key={f.key} className="flex items-baseline justify-between gap-3 py-2 text-xs">
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="font-medium tabular-nums text-text">{f.weight.toFixed(2)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
          {rollouts.length ? (
            <Card>
              <SectionHeading title="Rollouts" hint="Which tenants each version reaches (per-tenant flags still apply)." />
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
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BenchmarksView({ reg }: { reg: ModelRegistry }) {
  if (reg.benchmarks.length === 0) {
    return <EmptyState mark="chart" title="No benchmarks yet" hint="Benchmarks are computed from completed campaigns per segment once enough have run." />;
  }
  const columns: Column[] = [
    { key: "segment", label: "Segment" },
    { key: "p25", label: "25th pct CPM", num: true },
    { key: "median", label: "Median CPM", num: true },
    { key: "p75", label: "75th pct CPM", num: true },
    { key: "n", label: "Sample", num: true },
    { key: "when", label: "Refreshed" },
  ];
  return (
    <div className="space-y-2">
      <StageTable label="CPM benchmarks" columns={columns}>
        {reg.benchmarks.map((b, i) => {
          const thin = isSmallSample(b, reg.benchmarkMinSample);
          return (
            <Tr key={b.segment} i={i} tone={thin ? "warn" : undefined}>
              <Td>
                <Primary sub={thin ? `Small sample — under ${reg.benchmarkMinSample} campaigns; shown, not used for pricing` : undefined}>{b.segment}</Primary>
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
    </div>
  );
}

function FlagsView({ reg, sample }: { reg: ModelRegistry; sample: boolean }) {
  const mx = flagMatrix(reg.flags);
  if (mx.features.length === 0) {
    return <EmptyState mark="users" title="No feature flags yet" hint="Each intelligence feature gets a switch per tenant when it's registered — off until a tenant's rollout reaches it." />;
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
      <p className="text-[11px] text-faint">Switching a feature off hides it for that tenant everywhere at once. Each switch asks for a reason and is audited.</p>
    </div>
  );
}
