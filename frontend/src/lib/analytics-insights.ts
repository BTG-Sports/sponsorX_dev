import type {
  AnalyticsDataset,
  AthleteLeaderRow,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Insight sentences for the admin analytics guided story (spec 2026-09-17).

   Every sentence is DERIVED from the dataset the chart below it renders —
   never hand-written prose — so the words can't drift from the numbers.
   Output is three fragments (pre / hot / post) so the UI can color and
   animate the emphasized phrase without dangerouslySetInnerHTML.
   -------------------------------------------------------------------------- */

export type Insight = {
  pre: string;
  hot: string;
  post: string;
  tone: "success" | "accent" | "primary";
};

const n = (v: number) => v.toLocaleString("en-US");
const pct = (part: number, whole: number) =>
  Math.round((part / whole) * 100);

/** Chapter 1 headline: the claimed-but-never-used gap. */
export function headlineInsight(d: AnalyticsDataset): Insight {
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;
  return {
    pre: `Redemptions are up ${d.deltas.redeemed} — but `,
    hot: `${n(claims - redeemed)} claimed rewards were never used`,
    post: ". Closing that gap is the biggest lever on this page.",
    tone: "accent",
  };
}

/** Chapter 2: name the weakest stage-to-stage conversion. */
export function funnelInsight(d: AnalyticsDataset): Insight {
  let worst = 1;
  for (let i = 2; i < d.funnel.length; i++) {
    const rate = d.funnel[i].value / d.funnel[i - 1].value;
    if (rate < d.funnel[worst].value / d.funnel[worst - 1].value) worst = i;
  }
  const from = d.funnel[worst - 1];
  const to = d.funnel[worst];
  return {
    pre: "Fans stay in until the weak step — only ",
    hot: `${pct(to.value, from.value)}% of ${from.stage.toLowerCase()}s become ${to.stage.toLowerCase()}s`,
    post: ".",
    tone: "accent",
  };
}

/** Chapter 3: concentration of the top location. */
export function locationInsight(
  locations: { place: string; pct: number }[],
): Insight {
  const top = locations[0];
  return {
    pre: "",
    hot: `${top.place} alone is ${top.pct}%`,
    post: " of all scans.",
    tone: "primary",
  };
}

/** Chapter 4: share of ALL redemptions (funnel total, not just the listed
    top offers) the single best offer drives. */
export function offerInsight(d: AnalyticsDataset): Insight {
  const totalRedeemed = d.funnel[3].value;
  const top = d.offers[0];
  return {
    pre: "One offer drives ",
    hot: `${pct(top.count, totalRedeemed)}% of all redemptions`,
    post: ` — ${top.offer}.`,
    tone: "accent",
  };
}

/** Chapter 5: best claim→redeem converter vs the roster average. */
export function athleteInsight(rows: AthleteLeaderRow[]): Insight {
  const totalClaims = rows.reduce((s, r) => s + r.claims, 0);
  const totalRedeemed = rows.reduce((s, r) => s + r.redeemed, 0);
  const avg = totalRedeemed / totalClaims;
  const top = rows.reduce((best, r) =>
    r.redeemed / r.claims > best.redeemed / best.claims ? r : best,
  );
  const ratio = top.redeemed / top.claims / avg;
  return {
    pre: "",
    hot: `${top.name} converts claims ${ratio.toFixed(1)}× the roster average`,
    post: " — route the next QR drop through the top of this table.",
    tone: "success",
  };
}
