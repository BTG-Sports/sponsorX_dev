import { BlockedNotice, Button, Card, SectionHeading } from "@/components/ui";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { liveEditions } from "../live";
import { LiveSplits } from "./live-splits";
import {
  editionSplits,
  money,
  studentEdition,
  type SplitPayeeKind,
} from "@/lib/fixtures";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";

/* --------------------------------------------------------------------------
   Revenue splits — P1-FE-23, spec §5.7, §8. Per edition: four payees, their
   basis-points share, their computed amount.

   The acceptance is a negative-space requirement: this must be VISIBLY
   UNLIKE the athlete earnings surface, because Earning means NIL compensation
   and finance reconciles payouts from it. So, deliberately: no money
   gradient, no EarningState badges, no payout language. The hero is a single
   100% allocation bar; shares are stated in basis points (finance never says
   bps); amounts derive from bps at render time; and the page says out loud
   that nothing here reaches an athlete or a payout run. P9-FE-05 wires it.
   -------------------------------------------------------------------------- */

/* Four payees = four fixed categorical hues from the house set, in a fixed
   order (never cycled). Fill + a distinct text label per segment; the legend
   is the payee cards themselves. */
const PAYEE_FILL: Record<SplitPayeeKind, string> = {
  SPONSORX: "bg-admin",
  SCHOOL: "bg-primary",
  STUDENT_POOL: "bg-next",
  EDITORIAL_FUND: "bg-accent",
};
const PAYEE_DOT: Record<SplitPayeeKind, string> = PAYEE_FILL;

export default async function RevenueSplitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");
  /* C-1: a staff role this desk isn't for gets "not in your role", not the
     sample desk. The demo stays for ?demo= and signed-out visitors. */
  if (demo === null) {
    const lacking = await staffWithoutAccess("/admin/next/splits");
    if (lacking) return <NotInRole path="/admin/next/splits" title="NEXT splits" roles={lacking} />;
  }

  /* P9-FE-05 — a signed-in NEXT desk reads RevenueSplit; ?demo= keeps fixtures. */
  if (!demo) {
    const sp = await searchParams;
    const live = await liveEditions(typeof sp.edition === "string" ? sp.edition : undefined);
    if (live) return <LiveSplits live={live} />;
  }

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="sx-page-title">
          Revenue splits{" "}
          <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">
            · SponsorX NEXT
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          Allocation of edition revenue — not payouts, and never athlete
          earnings
        </p>
      </div>
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
        <span className="rounded-md bg-next/15 px-3 py-1.5 text-xs font-medium text-next">
          {studentEdition.label}
        </span>
        <span
          className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium text-faint"
          title="Winter 2026 is PLANNING — splits attach when the edition sells"
        >
          Winter 2026
        </span>
      </div>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No revenue to split yet"
          hint="Splits compute from committed edition revenue; sell the first slot and this page fills in."
        />
      </div>
    );
  }

  /* Amounts derive from bps at render time — never transcribed. floor() per
     spec-shape (cents, integer); the fixture test proves no remainder. */
  const total = studentEdition.committedCents;
  const rows = editionSplits.map((s) => ({
    ...s,
    amountCents: Math.floor((total * s.bps) / 10_000),
  }));

  return (
    <div className="space-y-6">
      {heading}

      {/* P7-QA-02: without ?demo= this fixture render reaches only signed-in
          staff outside NEXT_DESK_ROLES (CAMPAIGN_MGR, NETWORK_MGR) — the
          edition, rack and split figures below are sample data. */}
      {!demo && (
        <BlockedNotice>
          Demo data — your role doesn&rsquo;t read the live NEXT edition ledger,
          so every figure below is a sample edition&rsquo;s.
        </BlockedNotice>
      )}

      {/* ------------------------------------------- the allocation bar */}
      <Card className="sx-animate p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            {studentEdition.label} · committed revenue
          </p>
          <p className="text-sm font-semibold tabular-nums">{money(total)}</p>
        </div>

        {/* one bar, four segments, 2px gaps — allocation, not a trend */}
        <div className="mt-3 flex h-8 w-full gap-[2px] overflow-hidden rounded-lg">
          {rows.map((r) => (
            <div
              key={r.payeeKind}
              className={`${PAYEE_FILL[r.payeeKind]} relative min-w-0`}
              style={{ flexBasis: `${r.bps / 100}%` }}
              title={`${r.payee} — ${r.bps / 100}% · ${money(r.amountCents)}`}
            >
              <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-cta-ink">
                {r.bps / 100}%
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-faint">
          Shares are policy, set in basis points on the edition; amounts are
          computed from committed revenue and recompute as slots sell.
        </p>
      </Card>

      {/* ------------------------------------------------- payee cards */}
      <section className="sx-animate sx-delay-1">
        <SectionHeading
          title="The four payees"
          hint="Fixed kinds from spec §5.7 — a fifth payee is a schema change, not a row"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rows.map((r) => (
            <Card key={r.payeeKind} className="p-4">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-[2px] ${PAYEE_DOT[r.payeeKind]}`}
                />
                {r.payeeKind.replace("_", " ").toLowerCase()}
              </p>
              <p className="mt-1.5 text-sm font-medium">{r.payee}</p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {money(r.amountCents)}
                </span>
                <span className="text-[11px] tabular-nums text-faint">
                  {r.bps.toLocaleString("en-US")} bps
                </span>
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {r.blurb}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- the boundary */}
      <Card className="sx-animate sx-delay-2 border-next/25">
        <p className="text-sm font-medium">Why this page looks nothing like Earnings</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          An Earning means one athlete, one campaign order, NIL compensation
          with a tax-year rollup — finance reconciles payouts from it. A
          revenue split is an allocation on an edition: schools and internal
          funds, in basis points. Keeping the two visibly and structurally
          apart is what stops a finance reconciliation returning a minor&rsquo;s
          scholarship pool (spec §5.7) — nothing on this page reaches an
          athlete, a student, or a payout run.
        </p>
        <div className="mt-3">
          <Button
            disabled
            title="Shares are edition policy — editing is wired by P9-FE-05 against RevenueSplit (Stage 9)"
          >
            Adjust shares
          </Button>
        </div>
      </Card>
    </div>
  );
}
