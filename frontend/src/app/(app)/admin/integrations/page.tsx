import { Badge, Card, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Integration health — P8-FE-01, §23 §20. Is Zoho syncing, is the worker
   keeping up, is anything failing — GET /operations/integration-health.

   Read the way CLAUDE.md's Zoho boundary says to: Zoho never sits on a
   request path, so a queued sync is HEALTHY, not an outage — the page only
   calls something a problem when it is one: a dependency down, a delivery
   rejected, a job failed, or outbox work waiting longer than the worker
   should ever take. Webhook payloads are never shown (third-party data);
   status and error are what diagnosis needs.

   Live-only: this screen was never built on fixtures. A role the API
   refuses (it is BTG_ADMIN's surface in the matrix) sees why.
   -------------------------------------------------------------------------- */

type Health = {
  checkedAt: string;
  dependencies: { db: boolean; redis: boolean; storage: boolean };
  sync: { entity: string; linked: number; total: number; lastSyncAt: string | null }[];
  webhooks: {
    bySource: { source: string; received: number; applied: number; rejected: number; lastAt: string | null }[];
    recentFailures: { source: string; status: string; error: string | null; signatureOk: boolean; receivedAt: string }[];
  };
  queue: {
    outboxPending: { name: string; count: number; oldest: string }[];
    jobs: { name: string; state: string; count: number }[];
    recentFailed: { name: string; failedAt: string | null; error: string | null }[];
  };
};

/** Outbox work older than this means the worker isn't draining. */
const STALE_MINUTES = 15;

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC"
    : "never";

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

export default async function IntegrationsPage() {
  const who = await fetchActor();
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
      <p className="mt-1 text-xs text-muted">
        Zoho sync, inbound webhooks and the worker queue. Zoho never sits on a request path — a queued sync is healthy.
      </p>
    </div>
  );
  const res = who.status === "linked" ? await apiFetch("/operations/integration-health") : null;
  if (!res || res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="Integration health is BTG admin's" hint="It's tenant-wide operational data (RBAC matrix, webhookDelivery)." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Integration health unavailable (${res.status}).`);
  const h = (await res.json()) as Health;
  const now = Date.parse(h.checkedAt);

  const depsDown = Object.entries(h.dependencies).filter(([, ok]) => !ok).map(([k]) => k);
  const rejected = h.webhooks.bySource.reduce((n, s) => n + s.rejected, 0);
  const failedJobs = h.queue.jobs.filter((j) => j.state === "failed").reduce((n, j) => n + j.count, 0);
  const stale = h.queue.outboxPending.filter((p) => now - Date.parse(p.oldest) > STALE_MINUTES * 60_000);
  const problems = [
    ...depsDown.map((d) => `${d} unreachable`),
    ...(rejected ? [`${rejected} webhook deliver${rejected === 1 ? "y" : "ies"} rejected this week`] : []),
    ...(failedJobs ? [`${failedJobs} worker job${failedJobs === 1 ? "" : "s"} failed this week`] : []),
    ...(stale.length ? [`outbox work waiting over ${STALE_MINUTES} min (${stale.map((s) => s.name).join(", ")})`] : []),
  ];

  const jobNames = [...new Set(h.queue.jobs.map((j) => j.name))];
  const jobStates = ["created", "retry", "active", "completed", "failed"];

  return (
    <div className="space-y-6">
      {heading}

      <Card className={problems.length ? "border-warn/40 bg-warn/5" : "border-success/30 bg-success/5"}>
        <p className="text-sm font-semibold tracking-tight">
          {problems.length ? `${problems.length} thing${problems.length === 1 ? "" : "s"} need${problems.length === 1 ? "s" : ""} attention` : "Everything is healthy"}
        </p>
        {problems.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {problems.map((p) => (
              <li key={p}>· {p}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          {Object.entries(h.dependencies).map(([k, ok]) => (
            <Badge key={k} tone={ok ? "accent" : "danger"}>
              {k} {ok ? "up" : "down"}
            </Badge>
          ))}
          <span className="text-faint">checked {fmt(h.checkedAt)}</span>
        </div>
      </Card>

      <section>
        <SectionHeading title="Zoho sync" hint="§18 — records linked to Zoho, and when the last sync landed." />
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {h.sync.map((s) => (
              <li key={s.entity} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                <span className="font-medium">{s.entity}</span>
                <span className="tabular-nums text-muted">
                  {s.linked} of {s.total} linked · last sync {s.lastSyncAt ? fmt(s.lastSyncAt) : s.entity.startsWith("Athletes") ? "not tracked for contacts" : "never"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <SectionHeading title="Inbound webhooks · last 7 days" hint="P8-INT-04 records every attempt, valid or not. Payloads are never shown here." />
        <Card className="p-0">
          {h.webhooks.bySource.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">No deliveries received this week.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {h.webhooks.bySource.map((w) => (
                <li key={w.source} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                  <span className="font-mono">{w.source}</span>
                  <span className="flex flex-wrap items-center gap-2 tabular-nums text-muted">
                    {w.received} received · {w.applied} applied
                    {w.rejected > 0 && <Badge tone="danger">{w.rejected} rejected</Badge>}
                    <span className="text-faint">last {fmt(w.lastAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {h.webhooks.recentFailures.length > 0 && (
          <Card className="mt-3 p-0">
            <p className="border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint">Recent failures</p>
            <ul className="divide-y divide-line-soft">
              {h.webhooks.recentFailures.map((f, i) => (
                <li key={`${f.receivedAt}-${i}`} className="px-4 py-2.5 text-xs">
                  <span className="font-mono">{f.source}</span> · {f.status.toLowerCase()}
                  {!f.signatureOk && <Badge tone="danger">bad signature</Badge>}
                  <span className="block text-[11px] text-muted">{f.error ?? "no error recorded"} · {fmt(f.receivedAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <SectionHeading title="Queue" hint="The outbox (written with the change, waiting for the worker) and what the worker did with it this week." />
        {/* min-w-0 on each card: the jobs table has a min width, and a grid
            track otherwise grows to it past a phone's edge. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0 p-0">
            <p className="border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint">Waiting for the worker</p>
            {h.queue.outboxPending.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nothing waiting — the worker is keeping up.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {h.queue.outboxPending.map((p) => {
                  const late = now - Date.parse(p.oldest) > STALE_MINUTES * 60_000;
                  return (
                    <li key={p.name} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
                      <span className="font-mono">{p.name}</span>
                      <span className={`tabular-nums ${late ? "font-medium text-warn" : "text-muted"}`}>
                        {p.count} · oldest {ago(p.oldest, now)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="min-w-0 p-0">
            <p className="border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint">Worker jobs · last 7 days</p>
            {jobNames.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No jobs this week.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-line-soft text-[10px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2 font-medium">Job</th>
                      {jobStates.map((st) => (
                        <th key={st} className="px-2 py-2 text-right font-medium">{st}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {jobNames.map((n) => (
                      <tr key={n}>
                        <td className="px-4 py-2 font-mono">{n}</td>
                        {jobStates.map((st) => {
                          const c = h.queue.jobs.find((j) => j.name === n && j.state === st)?.count ?? 0;
                          return (
                            <td key={st} className={`px-2 py-2 text-right tabular-nums ${st === "failed" && c ? "font-semibold text-danger" : "text-muted"}`}>
                              {c || "·"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        {h.queue.recentFailed.length > 0 && (
          <Card className="mt-3 p-0">
            <p className="border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint">Recent failed jobs</p>
            <ul className="divide-y divide-line-soft">
              {h.queue.recentFailed.map((f, i) => (
                <li key={`${f.name}-${i}`} className="px-4 py-2.5 text-xs">
                  <span className="font-mono">{f.name}</span>
                  <span className="block text-[11px] text-muted">{f.error ?? "no message"} · {fmt(f.failedAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-faint">
          outbox and pg-boss, this tenant only <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
      </section>
    </div>
  );
}
