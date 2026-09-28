import { Card, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { money, type SplitPayeeKind } from "@/lib/fixtures";
import { PAYEE_LABEL, SPLIT_STATES, orderSplits, payeeBlurb, shortDate, type ApiSplit } from "@/lib/editions-live";
import { noEditionHint, readJson, type LiveEditions } from "../live";
import { EditionSwitcher, NextHeading } from "../editions/live-editions";

/* --------------------------------------------------------------------------
   P9-FE-05 — revenue splits from RevenueSplit (GET /editions/:id/splits).
   The four rows are computed by the ledger when the edition closes, from its
   frozen revenue (P9-BE-06); nothing here reads Earning, and nothing here is
   a payout. Before close there is no split to show — the page says so
   rather than projecting one. An amount the matrix denies (§15.4) is absent,
   and the share still shows.
   -------------------------------------------------------------------------- */

const PAYEE_FILL: Record<SplitPayeeKind, string> = {
  SPONSORX: "bg-admin",
  SCHOOL: "bg-primary",
  STUDENT_POOL: "bg-next",
  EDITORIAL_FUND: "bg-accent",
};

export async function LiveSplits({ live }: { live: LiveEditions }) {
  const e = live.current;
  const sub = "Allocation of edition revenue — not payouts, and never athlete earnings";
  if (!e) {
    return (
      <div className="space-y-6">
        <NextHeading title="Revenue splits" sub={sub} />
        <EmptyState mark="chart" {...noEditionHint(live, "Splits compute from an edition's revenue when it closes.")} />
      </div>
    );
  }
  const heading = (
    <NextHeading title="Revenue splits" sub={sub} right={<EditionSwitcher editions={live.editions} current={e} base="/admin/next/splits" />} />
  );

  if (!SPLIT_STATES.includes(e.state)) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title={e.state === "CANCELLED" ? "A cancelled edition has no split" : "No split until the edition closes"}
          hint={
            e.state === "CANCELLED"
              ? "Nothing sold is allocated."
              : `${e.label} is ${e.state.toLowerCase()} — ${money(e.inventory.committedCents)} committed so far. The split is computed once, from frozen revenue, when ads close on ${shortDate(e.closeDate)}.`
          }
        />
      </div>
    );
  }

  const { status, body } = await readJson<{ splits: ApiSplit[] }>(`/editions/${encodeURIComponent(e.id)}/splits`);
  if (status === 403 || !body) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="Publishing economics are finance's" hint="The matrix (§15.3) gives revenue splits to BTG admin and finance — never to an advisor or a student." />
      </div>
    );
  }
  const rows = orderSplits(body.splits);
  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="No split recorded" hint="This edition closed with nothing sold, so there was no revenue to allocate." />
      </div>
    );
  }
  const amounts = rows.every((r) => r.amountCents != null);
  const total = amounts ? rows.reduce((n, r) => n + r.amountCents!, 0) : null;
  const regional = e.publication.propertyId == null;

  return (
    <div className="space-y-6">
      {heading}

      <Card className="sx-animate p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            {e.label} · revenue frozen at close
          </p>
          {total != null && <p className="text-sm font-semibold tabular-nums">{money(total)}</p>}
        </div>
        <div className="mt-3 flex h-8 w-full gap-[2px] overflow-hidden rounded-lg">
          {rows.map((r) => (
            <div
              key={r.payeeKind}
              className={`${PAYEE_FILL[r.payeeKind]} relative min-w-0`}
              style={{ flexBasis: `${r.bps / 100}%` }}
              title={`${PAYEE_LABEL[r.payeeKind]} — ${r.bps / 100}%${r.amountCents != null ? ` · ${money(r.amountCents)}` : ""}`}
            >
              <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-cta-ink">{r.bps / 100}%</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-faint">
          Computed {shortDate(rows[0]!.computedAt)} by the ledger. Amounts are whole cents that sum to the revenue exactly.
          {/* P7-QA-02: SPLIT_BPS (backend revenue-split.ts) is a curated,
              SIMULATED constant from the P9-PMO-01 rate-card decision — the
              shares, and every amount derived from them, say so. */}
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            Shares are working numbers pending BTG sign-off
            <MiniChip kind="est">EST · curated · simulated split (P9-PMO-01, 2026-09-25)</MiniChip>
          </span>
        </p>
      </Card>

      <section className="sx-animate sx-delay-1">
        <SectionHeading title="The four payees" hint="Fixed kinds from spec §5.7 — a fifth payee is a schema change, not a row" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((r) => (
            <Card key={r.payeeKind} className="min-w-0 p-4">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <span aria-hidden="true" className={`size-2.5 rounded-[2px] ${PAYEE_FILL[r.payeeKind]}`} />
                {r.payeeKind.replace("_", " ").toLowerCase()}
              </p>
              <p className="mt-1.5 text-sm font-medium">
                {r.payeeKind === "SCHOOL" && regional ? "School pools" : PAYEE_LABEL[r.payeeKind]}
              </p>
              <p className="mt-2 flex items-baseline gap-2">
                {r.amountCents != null && (
                  <span className="text-xl font-semibold tabular-nums tracking-tight">{money(r.amountCents)}</span>
                )}
                <span className="text-[11px] tabular-nums text-faint">{r.bps.toLocaleString("en-US")} bps</span>
                <MiniChip kind="est">EST · curated</MiniChip>
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{payeeBlurb(r.payeeKind, regional)}</p>
            </Card>
          ))}
        </div>
      </section>

      <Card className="sx-animate sx-delay-2 border-next/25">
        <p className="text-sm font-medium">Why this page looks nothing like Earnings</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          An Earning means one athlete, one campaign order, NIL compensation with a tax-year rollup — finance reconciles
          payouts from it. A revenue split is an allocation on an edition: schools and internal funds, in basis points.
          This page reads RevenueSplit only — nothing here reaches an athlete, a student, or a payout run. Shares are
          edition policy, set in the ledger, not edited here.
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
          RevenueSplit <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
      </Card>
    </div>
  );
}
