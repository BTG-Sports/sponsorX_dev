import {
  EARNING_COPY,
  athlete,
  athleteCareer,
  athleteEarningsTrend,
  earningItems,
  earnings,
  heldNote,
} from "@/lib/fixtures";
import { JOURNEY, STATUS_DETAIL, when } from "@/lib/earnings-ui";

/* --------------------------------------------------------------------------
   AthleteEarningsReport — the serializable model behind "Export report" on
   the athlete earnings screen (§24, §21). Owner-framed: this is the athlete's
   own statement, not a sponsor artefact. Same contract as the other report
   models: the server page builds it from fixtures today, from tenant-scoped
   Postgres queries later, and the renderers print it verbatim.

   The page's two scopes ride along explicitly: career figures are canonical
   (athleteCareer, Postgres) while the money-journey buckets and activity rows
   are the in-cycle sample — the exporters must label both, or the statement
   implies $320 is all that's approved when the canonical figure is $8,400.

   Phase 1 constraint (§24, §26, Addendum A6): status only — no money moves
   through SponsorX, and bank details / tax IDs exist nowhere, including here.
   -------------------------------------------------------------------------- */

export type AthleteEarningsReport = {
  meta: {
    title: string;
    athlete: string;
    sport: string;
    tier: string;
    period: string;
    /** Download filename without extension. */
    fileStem: string;
    footnote: string;
  };
  /** Canonical career figures — Postgres. */
  summary: { label: string; value: string; detail: string; provenance: string }[];
  /** §21 pipeline, this cycle's sample — plain-English stage copy. */
  journey: {
    scopeNote: string;
    stages: {
      title: string;
      amountCents: number;
      orders: number;
      meaning: string;
    }[];
    held: { amountCents: number; orders: number; note: string } | null;
  };
  /** Monthly earnings, 2026 — Postgres. */
  trend: {
    rows: { month: string; amountCents: number }[];
    avgCents: number;
  };
  /** The athlete's own earning rows, newest first — in-cycle sample. */
  activity: {
    rows: {
      campaign: string;
      jobId: string;
      jobName: string;
      amountCents: number;
      status: string;
      statusDetail: string;
      reference: string | null;
      updatedAt: string;
    }[];
    totalCents: number;
  };
  notes: string[];
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export function buildAthleteEarningsReport(): AthleteEarningsReport {
  const byState = Object.fromEntries(earnings.map((e) => [e.state, e]));
  const held = byState.HELD;

  const trendRows = athleteEarningsTrend.map((cents, i) => ({
    month: MONTH_LABELS[i] ?? "",
    amountCents: cents,
  }));
  const avgCents = Math.round(
    athleteEarningsTrend.reduce((s, v) => s + v, 0) / athleteEarningsTrend.length,
  );
  const lastMonth = trendRows[trendRows.length - 1].month;

  const mine = earningItems
    .filter((e) => e.athlete === athlete.displayName)
    .sort((a, b) => when(b.updatedAt) - when(a.updatedAt));

  return {
    meta: {
      title: "Earnings Statement",
      athlete: athlete.displayName,
      sport: `${athlete.sport} · ${athlete.position}`,
      tier: `${athlete.tier} tier`,
      period: `2026 season · January – ${lastMonth}`,
      fileStem: `SponsorX-Earnings-Statement-${athlete.displayName.replace(/\s+/g, "-")}-2026`,
      footnote:
        "Demo dataset — figures shaped to the Earning and Deliverable tables in Postgres (§21, §24).",
    },
    summary: [
      {
        label: "Career earnings",
        value: money(athleteCareer.careerEarningsCents),
        detail: "everything earned across campaigns, to date",
        provenance: "Postgres · canonical",
      },
      {
        label: "On the way",
        value: money(athleteCareer.approvedCents),
        detail: `approved for payout — lands ${athleteCareer.nextPayout}`,
        provenance: "Postgres · canonical",
      },
      {
        label: "Monthly average",
        value: money(avgCents),
        detail: `January – ${lastMonth} 2026`,
        provenance: "Postgres · canonical",
      },
      {
        label: "On-time delivery",
        value: `${athleteCareer.onTimeRatePct}%`,
        detail: "Deliverable due vs submitted timestamps — sponsors notice",
        provenance: "Postgres · canonical",
      },
    ],
    journey: {
      scopeNote:
        "Every order moves left to right — reviewed, cleared, approved, paid. These buckets are this cycle's orders, not the career total.",
      stages: JOURNEY.map((stage) => {
        const bucket = byState[stage.state];
        return {
          title: stage.title,
          amountCents: bucket?.amount ?? 0,
          orders: bucket?.count ?? 0,
          meaning: stage.blurb,
        };
      }),
      held: held
        ? {
            amountCents: held.amount,
            orders: held.count,
            note: heldNote.replace(" (§21)", ""),
          }
        : null,
    },
    trend: { rows: trendRows, avgCents },
    activity: {
      rows: mine.map((e) => ({
        campaign: e.campaign,
        jobId: e.jobId,
        jobName: e.jobName,
        amountCents: e.amount,
        status: EARNING_COPY[e.state],
        statusDetail: STATUS_DETAIL[e.state],
        reference: e.reference,
        updatedAt: e.updatedAt,
      })),
      totalCents: mine.reduce((s, e) => s + e.amount, 0),
    },
    notes: [
      "Career figures are canonical Postgres totals; the money-journey buckets and activity rows are the current cycle's sample and will not sum to the career figure.",
      "Phase 1 tracks earning status only — no money moves through SponsorX. BTG Finance handles the payout itself, outside the platform.",
      "Your bank account and tax ID never touch SponsorX (§26); paid orders carry a Zoho Books reference for your records.",
      "An order on hold is not lost — BTG Finance re-checks it and it re-enters the pipeline once cleared (§21).",
    ],
  };
}
