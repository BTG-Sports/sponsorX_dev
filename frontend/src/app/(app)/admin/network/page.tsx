import { Card, SectionHeading, StatTile } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { money } from "@/lib/fixtures";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Network analytics — P7-FE-05, §22 §23. BTG's own view of the marketplace.

   Three reads, all recomputed from rows (P7-DATA-02 / -05):
   - GET /operations/network-metrics — active athletes, participation and
     utilisation, earnings raised and paid, average job pay and sell price.
   - GET /operations/job-economics — per NIL job: orders, average sell,
     average athlete pay, margin. Per JOB on purpose (network-metrics.ts):
     margin is earned per line, and a package's margin is the sum of its
     lines — the finer grain, from which the coarser can be summed.
   - GET /operations/delivery-health — the marketplace-learning read: each
     live campaign's frozen reach PROJECTION (made when the order was sold,
     P7-DATA-03) against the reach actually VERIFIED. That gap is what
     pricing learns from; it is shown as-is, never smoothed.

   Tenant-wide by definition. There is no fixture version of this screen —
   it was never built on fixtures — so a role the API refuses sees why.
   -------------------------------------------------------------------------- */

type Network = {
  activeAthletes: number;
  participatingAthletes: number;
  participationRate: number;
  utilisationRate: number;
  totalEarnings: number;
  totalPaid: number;
  averageJobPay: number;
  averageSellPrice: number;
};
type JobEcon = {
  jobId: string;
  orders: number;
  averageSellPrice: number;
  averageCompensation: number;
  totalMargin: number;
  marginRate: number;
};
type Health = {
  campaignId: string;
  campaignName: string;
  projectedImpressions: number | null;
  verifiedImpressions: number;
  underDeliveringReach: boolean;
};

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

async function load() {
  const who = await fetchActor();
  if (who.status !== "linked") return { kind: "anon" as const };
  const [n, j, h] = await Promise.all([
    apiFetch("/operations/network-metrics"),
    apiFetch("/operations/job-economics"),
    apiFetch("/operations/delivery-health"),
  ]);
  if (n.status === 403 || j.status === 403) return { kind: "denied" as const };
  if (!n.ok || !j.ok || !h.ok) throw new Error(`Network metrics unavailable (${n.status}/${j.status}/${h.status}).`);
  return {
    kind: "ok" as const,
    network: (await n.json()) as Network,
    jobs: ((await j.json()) as { jobs: JobEcon[] }).jobs,
    health: ((await h.json()) as { campaigns: Health[] }).campaigns,
  };
}

export default async function NetworkPage() {
  const data = await load();
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Network</h1>
      <p className="mt-1 text-xs text-muted">
        How the marketplace itself is doing — who is working, what each job earns, and how well we price reach.
      </p>
    </div>
  );

  if (data.kind !== "ok") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="Network figures are BTG's"
          hint="These are tenant-wide numbers; your role reads its own slice elsewhere (§15)."
        />
      </div>
    );
  }

  const { network: n, jobs, health } = data;
  const grossMargin = n.averageSellPrice ? 1 - n.averageJobPay / n.averageSellPrice : null;
  const projected = health.filter((h) => h.projectedImpressions !== null && h.projectedImpressions > 0);

  return (
    <div className="space-y-6">
      {heading}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active athletes" value={String(n.activeAthletes)} sub={`${n.participatingAthletes} have taken work`} />
        <StatTile label="Participation" value={pct(n.participationRate)} sub="active athletes ever on an order" />
        <StatTile label="Utilisation" value={pct(n.utilisationRate)} sub="on live work right now" />
        <StatTile label="Gross margin" value={grossMargin === null ? "—" : pct(grossMargin)} sub="1 − average pay ÷ average sell" />
        <StatTile label="Earnings raised" value={money(n.totalEarnings)} sub="all states, net of adjustments" />
        <StatTile label="Earnings paid" value={money(n.totalPaid)} sub="recorded as paid" />
        <StatTile label="Average job pay" value={money(n.averageJobPay)} sub="per live order, to the athlete" />
        <StatTile label="Average sell price" value={money(n.averageSellPrice)} sub="per live order, to the sponsor" />
      </div>
      <p className="-mt-3 flex items-center gap-1.5 text-[10px] text-faint">
        every figure recomputed from rows <MiniChip kind="ver">POSTGRES</MiniChip>
      </p>

      <section>
        <SectionHeading
          title="Economics by job"
          hint="Margin is earned per line — a package's margin is the sum of its jobs' lines."
        />
        <Card className="p-0">
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Athlete network — scrollable table">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                    <th className="px-4 py-2.5 font-medium">Job</th>
                    <th className="px-4 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avg sell</th>
                    <th className="px-4 py-2.5 text-right font-medium">Avg athlete pay</th>
                    <th className="px-4 py-2.5 text-right font-medium">Margin</th>
                    <th className="px-4 py-2.5 text-right font-medium">Margin rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {jobs.map((j) => (
                    <tr key={j.jobId}>
                      <td className="px-4 py-3 font-medium">{j.jobId}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{j.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(j.averageSellPrice)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{money(j.averageCompensation)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(j.totalMargin)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${j.marginRate < 1 - 1 / 1.4 ? "font-medium text-danger" : ""}`}>
                        {pct(j.marginRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="mt-2 text-[10px] text-faint">
          A margin rate under {pct(1 - 1 / 1.4)} means lines sold below the 1.4× floor on average (P0-PMO-13).
        </p>
      </section>

      <section>
        <SectionHeading
          title="How well we price reach"
          hint="Each live campaign's projection — frozen when its orders were sold — against the reach actually verified."
        />
        <Card className="p-0">
          {projected.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">
              No live campaign carries a reach projection yet — they are frozen onto orders as they are sold.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {projected.map((h) => {
                const ratio = h.verifiedImpressions / (h.projectedImpressions as number);
                return (
                  <li key={h.campaignId} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium">{h.campaignName}</span>
                      <span className="tabular-nums text-muted">
                        {h.verifiedImpressions.toLocaleString("en-US")} verified of{" "}
                        {(h.projectedImpressions as number).toLocaleString("en-US")} projected ·{" "}
                        <strong className={h.underDeliveringReach ? "text-warn" : "text-text"}>{pct(ratio)}</strong>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={`h-full rounded-full ${h.underDeliveringReach ? "bg-warn" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-faint">
          projection <MiniChip kind="est">EST</MiniChip> · reach <MiniChip kind="ver">VERIFIED</MiniChip> — below 70% is flagged
        </p>
      </section>
    </div>
  );
}
