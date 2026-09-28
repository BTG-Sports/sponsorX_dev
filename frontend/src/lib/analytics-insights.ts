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

/** "Redemptions are …" — a delta as words. `delta()` writes a fall with a
    leading minus, so "up −83.3%" was possible; "new" means no prior period. */
function trend(delta: string): string {
  if (delta === "new") return "new this period";
  if (delta === "0%") return "flat";
  if (/^[−-]/.test(delta)) return `down ${delta.slice(1)}`;
  return `up ${delta}`;
}

/** Chapter 1 headline: the claimed-but-never-used gap. */
export function headlineInsight(d: Pick<AnalyticsDataset, "funnel" | "deltas">): Insight {
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;
  /* Live data can be empty — say so plainly rather than print "NaN". */
  if (d.funnel[0].value === 0)
    return { pre: "", hot: "Nothing has been scanned in this range yet", post: " — the story fills in as fans scan QR rewards.", tone: "primary" };
  if (claims === 0 && redeemed === 0)
    return { pre: "Fans are scanning, but ", hot: "nobody has claimed a reward yet", post: ".", tone: "accent" };
  /* F-04 (QA pass 5): the booth can redeem a code nobody claimed first, so
     redemptions can outnumber claims — "−3 claimed rewards were never used"
     is not a sentence. The gap is only a count when claims cover it. */
  if (redeemed >= claims)
    return {
      pre: `Redemptions are ${trend(d.deltas.redeemed)} — `,
      hot: "every claimed reward was used",
      post: redeemed > claims ? ", and some codes were redeemed at the booth without a claim first." : ".",
      tone: "accent",
    };
  return {
    pre: `Redemptions are ${trend(d.deltas.redeemed)} — but `,
    hot: `${n(claims - redeemed)} claimed rewards were never used`,
    post: ". Closing that gap is the biggest lever on this page.",
    tone: "accent",
  };
}

/** Chapter 2: name the weakest stage-to-stage conversion. */
export function funnelInsight(d: Pick<AnalyticsDataset, "funnel">): Insight {
  if (d.funnel.some((s, i) => i < d.funnel.length - 1 && s.value === 0))
    return {
      pre: "",
      hot: d.funnel[0].value === 0 ? "No scans in this range" : "Fans stop before the end",
      post: d.funnel[0].value === 0 ? " — the funnel starts at the first scan." : " — a stage with nobody in it has no conversion to compare yet.",
      tone: "primary",
    };
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
  if (!top) return { pre: "", hot: "No scan has a resolved location yet", post: " — the worker resolves city and region after each scan.", tone: "primary" };
  return {
    pre: "",
    hot: `${top.place} alone is ${top.pct}%`,
    post: " of all scans.",
    tone: "primary",
  };
}

/** Chapter 4: share of ALL redemptions (funnel total, not just the listed
    top offers) the single best offer drives. */
export function offerInsight(d: Pick<AnalyticsDataset, "funnel" | "offers">): Insight {
  const totalRedeemed = d.funnel[3].value;
  const top = d.offers[0];
  if (!top || totalRedeemed === 0) return { pre: "", hot: "Nothing redeemed yet", post: " in this range.", tone: "primary" };
  return {
    pre: "One offer drives ",
    hot: `${pct(top.count, totalRedeemed)}% of all redemptions`,
    post: ` — ${top.offer}.`,
    tone: "accent",
  };
}

/** Chapter 5: best claim→redeem converter vs the roster average. */
export function athleteInsight(rows: Pick<AthleteLeaderRow, "name" | "claims" | "redeemed">[]): Insight {
  const totalClaims = rows.reduce((s, r) => s + r.claims, 0);
  if (totalClaims === 0 || !rows.some((r) => r.claims > 0 && r.redeemed > 0))
    return { pre: "", hot: "No athlete's QR has turned a claim into a redemption yet", post: " — the table fills in as fans redeem.", tone: "primary" };
  const totalRedeemed = rows.reduce((s, r) => s + r.redeemed, 0);
  const avg = totalRedeemed / totalClaims;
  const conv = (r: { claims: number; redeemed: number }) => (r.claims ? r.redeemed / r.claims : 0);
  const top = rows.reduce((best, r) => (conv(r) > conv(best) ? r : best));
  const ratio = conv(top) / avg;
  return {
    pre: "",
    hot: `${top.name} converts claims ${ratio.toFixed(1)}× the roster average`,
    post: " — route the next QR drop through the top of this table.",
    tone: "success",
  };
}
