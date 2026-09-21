"use client";

import { Badge, Card } from "@/components/ui";
import {
  cx,
  FactorBar,
  MarginValue,
  ProvenanceMark,
  StatusPill,
  TierMark,
} from "@/components/matching-bits";
import {
  breachedLines,
  COMPARE_FACTORS,
  fmtRatio,
  fmtReach,
  jobFor,
  marginBand,
  marginRatio,
  MARGIN_FLOOR,
  MATCH_BRIEF,
  statusFor,
  type MatchAthlete,
} from "@/lib/matching";
import { money } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Roster comparison — the shortlist factor by factor (P4-ART-01 screen 2).

   Compares whoever is actually shortlisted, not a hardcoded trio. Bars are a
   redundant read on always-visible values; the strongest cell of each factor
   row is lit and the rest recede. Scores are stored snapshots — the header
   says so, and nothing here is presented as recalculated live.

   Desktop: one grid, athlete per column. Below md the same grid rides in an
   overflow-x snap strip — columns keep a readable minimum width and the
   label column stays sticky so a phone can still compare.
   -------------------------------------------------------------------------- */

export function MatchingCompare({
  athletes,
  onRemove,
  onBack,
  onContinue,
}: {
  athletes: MatchAthlete[];
  onRemove: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const n = athletes.length;
  const breached = breachedLines(athletes);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ head */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Roster comparison
          </h2>
          <p className="mt-0.5 max-w-prose text-[11px] leading-relaxed text-muted">
            {n === 1 ? "One shortlisted athlete" : `${n} shortlisted athletes`},
            factor by factor. Scores are stored snapshots from{" "}
            {MATCH_BRIEF.scoreMethod}, taken {MATCH_BRIEF.scoreSnapshot} — nothing
            is recalculated live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2"
          >
            ← Back to matching
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Continue to review →
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------- table */}
      <Card className="p-0">
        <div className="sx-snap-x overflow-x-auto">
          <div
            className="min-w-fit"
            style={{
              display: "grid",
              gridTemplateColumns: `minmax(8.5rem, 11rem) repeat(${n}, minmax(10.5rem, 1fr))`,
            }}
            role="table"
            aria-label="Shortlist comparison, factor by factor"
          >
            {/* header row */}
            <HeadCell sticky />
            {athletes.map((a, i) => {
              const st = statusFor(a);
              return (
                <div
                  key={a.id}
                  role="columnheader"
                  className="sx-join-rise snap-start border-b border-l border-line-soft p-4"
                  style={{ ["--sx-d" as string]: `${i * 70}ms` }}
                >
                  <div className="flex items-start gap-2.5">
                    <TierMark tier={a.tier} className="mt-0.5 h-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold tracking-tight">
                        {a.name}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {a.sport} · {a.market}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{a.tier}</Badge>
                        {st.kind !== "eligible" && <StatusPill status={st} />}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(a.id)}
                      aria-label={`Remove ${a.name} from the shortlist`}
                      title="Remove from shortlist"
                      className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        className="size-3"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* composite + six factors, as bars */}
            <BarRow
              label="Composite score"
              sub={`snapshot ${MATCH_BRIEF.scoreSnapshot}`}
              values={athletes.map((a) => a.score)}
              n={n}
              rowIndex={0}
            />
            {COMPARE_FACTORS.map((f, fi) => (
              <BarRow
                key={f.label}
                label={f.label}
                sub={f.sub}
                values={athletes.map((a) => a.factors[fi])}
                n={n}
                rowIndex={fi + 1}
              />
            ))}

            {/* reach with provenance */}
            <LabelCell label="Reach" sub="followers across connected platforms" />
            {athletes.map((a) => (
              <ValueCell key={a.id}>
                <span className="text-xs font-semibold tabular-nums">
                  {fmtReach(a.reach)}
                </span>
                <span className="mt-0.5 block">
                  <ProvenanceMark source={a.reachSource} />
                </span>
              </ValueCell>
            ))}

            {/* economics — cost is BTG-internal */}
            <LabelCell label="Athlete cost" sub="from rate card · BTG internal" />
            {athletes.map((a) => (
              <ValueCell key={a.id}>
                <span className="text-xs font-medium tabular-nums text-muted">
                  {money(a.cost)}
                </span>
              </ValueCell>
            ))}

            <LabelCell label="Sell price" sub="job price band" />
            {athletes.map((a) => (
              <ValueCell key={a.id}>
                <span className="text-xs font-semibold tabular-nums">
                  {money(a.sell)}
                </span>
                <span className="mt-0.5 block text-[10px] text-faint">
                  {jobFor(a.jobId).label} · {a.jobId}
                </span>
              </ValueCell>
            ))}

            <LabelCell label="Margin" sub={`floor is ${MARGIN_FLOOR}× cost`} />
            {athletes.map((a) => {
              const band = marginBand(marginRatio(a.cost, a.sell));
              return (
                <ValueCell key={a.id}>
                  <MarginValue cost={a.cost} sell={a.sell} align="left" />
                  <span
                    className={cx(
                      "mt-0.5 block text-[10px]",
                      band === "below" ? "font-medium text-accent" : "text-faint",
                    )}
                  >
                    {band === "below"
                      ? "Below floor — resolve before sending"
                      : band === "thin"
                        ? "Above floor, thin"
                        : "Healthy"}
                  </span>
                </ValueCell>
              );
            })}

            {/* safeguards */}
            <LabelCell label="Conflicts" sub="declared competing deals" />
            {athletes.map((a) => (
              <ValueCell key={a.id}>
                <span className="text-[11px] text-muted">
                  {a.conflict ?? "None declared"}
                </span>
              </ValueCell>
            ))}

            <LabelCell label="Guardian consent" sub="required for minors" last />
            {athletes.map((a) => (
              <ValueCell key={a.id} last>
                <span
                  className={cx(
                    "text-[11px]",
                    a.guardian === "pending" ? "font-medium text-warn" : "text-muted",
                  )}
                >
                  {a.guardian === "pending"
                    ? "Consent outstanding — cannot accept yet"
                    : "Not applicable"}
                </span>
              </ValueCell>
            ))}
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------- notes */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Reading these scores</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            Each factor is scored 0–100 by the rules-based method and stored with
            a date. Nothing on this screen is recalculated live — what you see is
            the snapshot the invitation would be sent against.
          </p>
        </Card>
        <Card
          className={cx(
            "p-4",
            breached.length > 0 && "border-accent/30 bg-accent/5",
          )}
        >
          <p
            className={cx(
              "text-[11px] font-medium",
              breached.length > 0 ? "text-accent" : "text-muted",
            )}
          >
            Margin check
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            {breached.length === 0
              ? `Every compared line clears the ${MARGIN_FLOOR}× floor.`
              : breached
                  .map(
                    (a) =>
                      `${a.name} sells at ${fmtRatio(marginRatio(a.cost, a.sell))} cost against the ${a.jobId} band — below BTG's ${MARGIN_FLOOR}× floor. Move them to a higher-priced job code, renegotiate the rate, or drop them from the roster.`,
                  )
                  .join(" ")}
          </p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- row pieces */

function HeadCell({ sticky }: { sticky?: boolean }) {
  return (
    <div
      role="columnheader"
      className={cx(
        "border-b border-line-soft bg-surface p-4",
        sticky && "sticky left-0 z-10",
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-faint">
        Factor
      </span>
    </div>
  );
}

function LabelCell({
  label,
  sub,
  last,
}: {
  label: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <div
      role="rowheader"
      className={cx(
        "sticky left-0 z-10 bg-surface p-4",
        !last && "border-b border-line-soft",
      )}
    >
      <p className="text-[11px] font-medium text-text">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-snug text-faint">{sub}</p>}
    </div>
  );
}

function ValueCell({
  children,
  last,
}: {
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      role="cell"
      className={cx(
        "snap-start border-l border-line-soft p-4",
        !last && "border-b",
      )}
    >
      {children}
    </div>
  );
}

function BarRow({
  label,
  sub,
  values,
  n,
  rowIndex,
}: {
  label: string;
  sub: string;
  values: number[];
  n: number;
  rowIndex: number;
}) {
  const top = Math.max(...values);
  return (
    <>
      <LabelCell label={label} sub={sub} />
      {values.map((v, i) => {
        const best = v === top && n > 1;
        return (
          <ValueCell key={i}>
            <FactorBar value={v} best={best || n === 1} delay={rowIndex * 60 + i * 40} />
            {best && (
              <span
                className="sx-ins-hot mt-0.5 block text-[10px] font-medium text-admin"
                style={{ ["--sx-d" as string]: `${rowIndex * 60 + 300}ms` }}
              >
                strongest of {n}
              </span>
            )}
          </ValueCell>
        );
      })}
    </>
  );
}
