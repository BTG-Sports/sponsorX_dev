/* --------------------------------------------------------------------------
   3S4-FE-01 · Campaign forecast dashboard — the contract, the words and the
   chart geometry (decided 2026-10-13: "FE only, honest empty states").

   The delivery forecast service (3S4-DATA-01, 3S4-BE-01/02) landed
   2026-10-14 (backend/src/domain/forecast-engine.ts; documentation/
   SponsorX-Forecasting.md). The screens read it through server/engine.ts
   `readEngine("forecast", …)`, show <EnginePending> if the route is ever
   unmounted, and render exactly what is typed here:

   GET /intelligence/forecasts?risk=all|at_risk|watch|on_track&page&size
       → ForecastList { counts, campaigns: ForecastRow[], page }
       One row per ACTIVE campaign (the spec: "pacing and risk for every
       active campaign"), ordered by risk (at risk → watch → on track),
       then lowest probability, then soonest end — compareRisk below.
       `counts` are the whole tenant's, never the page's.
   GET /intelligence/forecasts/:campaignId
       → ForecastDetail: the row plus the pacing series to today, the
       projected band from today to the end date, risk factors, the
       recommended actions, the alert (if a threshold was crossed) and
       every past forecast (acceptance #5: forecasts are persisted).
   PUT /intelligence/forecasts/:campaignId/guarantee { metric, value }
       → { campaignId, guarantee | null } — what the campaign is promised
       by its end date. Unset (metric null), the engine paces against every
       deliverable booked. The forecast is made NIGHTLY, so a new guarantee
       shows from the next one (checkGuarantee, GUARANTEE_SET_ROLES).

   Roles (`campaignForecast`, RBAC matrix §30; lib/admin-access): SUPER_ADMIN,
   BTG_ADMIN, CAMPAIGN_MGR and SALES read; BTG admins and campaign managers
   set the guarantee — the one write on these screens.

   Provenance: `delivered` is verified delivery only (delivery-health.ts's
   rule — a self-reported figure cannot evidence delivery against a
   promise), and says which kind it is. Everything projected is a model
   output and carries its ModelStamp.

   Pure: no fetch, no React — the pages, the chart island and the tests
   import it freely.
   -------------------------------------------------------------------------- */

import type { ModelStamp } from "@/lib/intelligence";
import type { PageInfo } from "@/lib/list-query";
import type { Shortfall } from "@/lib/makegood-live";
import { monotonePath } from "@/lib/monotone-path";

/* ------------------------------------------------------------------ types */

export type RiskLevel = "on_track" | "watch" | "at_risk";
/** backend/src/domain/forecast-rules.ts GUARANTEE_METRICS, in its order. */
export const GUARANTEE_METRICS = ["impressions", "engagements", "redemptions", "deliverables"] as const;
export type GuaranteeMetric = (typeof GUARANTEE_METRICS)[number];
/** Verified kinds only (ui.tsx SourceLabel): system-recorded, platform API, or BTG-verified manual entry. */
export type DeliveredSource = "VERIFIED_SYSTEM" | "VERIFIED_API" | "VERIFIED_MANUAL";

export type ForecastRow = {
  campaignId: string;
  campaignName: string;
  sponsorName: string;
  startsAt: string;
  endsAt: string;
  /** 0..1 — share of the flight elapsed at the forecast. */
  elapsed: number;
  guarantee: { metric: GuaranteeMetric; value: number };
  /** Verified delivery to date. */
  delivered: number;
  deliveredSource: DeliveredSource;
  /** Projected final delivery — the model's range and central estimate. */
  projectedFinal: { low: number; mid: number; high: number };
  /** 0..1 — probability the guarantee is met by the end date. */
  probabilityOfGuarantee: number;
  risk: RiskLevel;
  stamp: ModelStamp;
};

export type ForecastCounts = { active: number; at_risk: number; watch: number; on_track: number };

export type ForecastList = { counts: ForecastCounts; campaigns: ForecastRow[]; page: PageInfo };

/** Cumulative, one point per day up to the forecast. */
export type PacingPoint = { date: string; delivered: number; expected: number };
/** Cumulative, from the last pacing day to the end date. */
export type ProjectionPoint = { date: string; low: number; mid: number; high: number };
export type RiskFactor = { key: string; label: string; detail: string };
/** The four recommended actions of 3S4-BE-02. */
export type ActionKind = "accelerate_content" | "add_deliverable" | "change_channel" | "reserve_make_good";
export type RecommendedAction = { kind: ActionKind; label: string; detail: string };
/** A threshold crossing (3S4-BE-02) — raised before the end date, never after. */
export type ForecastAlert = { raisedAt: string; risk: Exclude<RiskLevel, "on_track">; threshold: number };
export type HistoryEntry = { forecastAt: string; projectedMid: number; probability: number; modelVersion: string };

export type ForecastDetail = ForecastRow & {
  pacing: PacingPoint[];
  projection: ProjectionPoint[];
  riskFactors: RiskFactor[];
  actions: RecommendedAction[];
  alert: ForecastAlert | null;
  /** Newest first. */
  history: HistoryEntry[];
  /**
   * The campaign's open and approved make-goods (3S5-BE-02), newest first —
   * sent only to those who may read `makeGood` (BTG admins, campaign
   * managers); absent for Sales.
   */
  makeGoods?: Shortfall[];
};

export const EMPTY_FORECAST_LIST: ForecastList = {
  counts: { active: 0, at_risk: 0, watch: 0, on_track: 0 },
  campaigns: [],
  page: { page: 1, size: 12, total: 0, pages: 1 },
};

/* ------------------------------------------------------------------- tabs */

export type ForecastTabKey = "all" | RiskLevel;

export const FORECAST_TABS: { key: ForecastTabKey; label: string }[] = [
  { key: "all", label: "All active" },
  { key: "at_risk", label: "At risk" },
  { key: "watch", label: "Watch" },
  { key: "on_track", label: "On track" },
];

export function forecastTab(v: string | string[] | undefined): { key: ForecastTabKey; label: string } {
  const k = Array.isArray(v) ? v[0] : v;
  return FORECAST_TABS.find((t) => t.key === k) ?? FORECAST_TABS[0]!;
}

export function tabCount(counts: ForecastCounts, key: ForecastTabKey): number {
  return key === "all" ? counts.active : counts[key];
}

/* ------------------------------------------------------------------- risk */

export const RISK_META: Record<RiskLevel, { label: string; tone: "success" | "warn" | "danger"; rank: number }> = {
  at_risk: { label: "At risk", tone: "danger", rank: 0 },
  watch: { label: "Watch", tone: "warn", rank: 1 },
  on_track: { label: "On track", tone: "success", rank: 2 },
};

/** The API's order: risk first, then the lowest probability, then the soonest end. */
export function compareRisk(a: ForecastRow, b: ForecastRow): number {
  return (
    RISK_META[a.risk].rank - RISK_META[b.risk].rank ||
    a.probabilityOfGuarantee - b.probabilityOfGuarantee ||
    Date.parse(a.endsAt) - Date.parse(b.endsAt)
  );
}

/* ----------------------------------------------------------------- pacing */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const DAY = 86_400_000;

/** Straight-line plan: where delivery should be at this point of the flight. */
export function linearExpected(row: Pick<ForecastRow, "guarantee" | "elapsed">): number {
  return row.guarantee.value * clamp01(row.elapsed);
}

/** Delivered ÷ straight-line expected. Null before anything was expected. */
export function paceRatio(row: Pick<ForecastRow, "guarantee" | "elapsed" | "delivered">): number | null {
  const expected = linearExpected(row);
  return expected > 0 ? row.delivered / expected : null;
}

export function paceWords(row: Pick<ForecastRow, "guarantee" | "elapsed" | "delivered">): string {
  const r = paceRatio(row);
  if (r === null) return "Not started";
  const p = Math.round(r * 100);
  if (p >= 100) return `Ahead of pace · ${p}%`;
  if (p >= 90) return `Near pace · ${p}%`;
  return `Behind pace · ${p}%`;
}

/** The row's mini bar, on the guarantee's scale (100% = guarantee). */
export function pacingBar(row: Pick<ForecastRow, "guarantee" | "elapsed" | "delivered" | "projectedFinal">) {
  const g = row.guarantee.value;
  const share = (n: number) => (g > 0 ? Math.round(clamp01(n / g) * 1000) / 10 : 0);
  return {
    delivered: share(row.delivered),
    expected: share(linearExpected(row)),
    projected: share(row.projectedFinal.mid),
    /** Projected to pass the guarantee (the bar caps at 100%). */
    over: row.projectedFinal.mid > g,
  };
}

/** Whole days to the end date from `now`, never negative. */
export function daysLeft(endsAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now) / DAY));
}

export function daysLeftWords(endsAt: string, now: number): string {
  const d = daysLeft(endsAt, now);
  return d === 0 ? "Ends today" : d === 1 ? "1 day left" : `${d} days left`;
}

/** How long before the end the alert fired (acceptance #6: before, not after). */
export function alertLeadDays(alert: ForecastAlert, endsAt: string): number {
  return Math.floor((Date.parse(endsAt) - Date.parse(alert.raisedAt)) / DAY);
}

export function alertWords(alert: ForecastAlert, endsAt: string): string {
  const lead = alertLeadDays(alert, endsAt);
  const when = lead > 0 ? `${lead} day${lead === 1 ? "" : "s"} before the campaign ends` : "on or after the end date";
  return `${RISK_META[alert.risk].label} alert raised ${dayLabel(alert.raisedAt)}, ${when}: the probability of the guarantee fell below ${Math.round(alert.threshold * 100)}%.`;
}

/** Projected central estimate ÷ guarantee. */
export function projectedShare(row: Pick<ForecastRow, "guarantee" | "projectedFinal">): number {
  return row.guarantee.value > 0 ? row.projectedFinal.mid / row.guarantee.value : 0;
}

/* ------------------------------------------------------------------ words */

export const METRIC_WORD: Record<GuaranteeMetric, string> = {
  impressions: "impressions",
  engagements: "engagements",
  redemptions: "redemptions",
  deliverables: "deliverables",
};

/** 1,234 · 12.9K · 1.2M — arithmetic, not Intl compact, so server and browser agree. */
export function fmtCount(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${trim(a / 1_000_000)}M`;
  if (a >= 10_000) return `${sign}${trim(a / 1_000)}K`;
  return `${sign}${Math.round(a).toLocaleString("en-US")}`;
}
const trim = (v: number) => (v >= 100 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toString());

/** "Oct 2" — UTC, so server and browser print the same day. */
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function flightWords(row: Pick<ForecastRow, "startsAt" | "endsAt">): string {
  return `${dayLabel(row.startsAt)} – ${dayLabel(row.endsAt)}`;
}

export const ACTION_WORD: Record<ActionKind, string> = {
  accelerate_content: "Accelerate content",
  add_deliverable: "Add a deliverable",
  change_channel: "Change channel",
  reserve_make_good: "Reserve make-good inventory",
};

/** A link carries `?demo=sample` through while the sample preview is on. */
export function sampleHref(href: string, sample: boolean): string {
  if (!sample) return href;
  return `${href}${href.includes("?") ? "&" : "?"}demo=sample`;
}

/* -------------------------------------------------------------- guarantee */

/** Who the API lets set a guarantee (`campaignForecast` write — policy.ts).
 *  Sales, the page's other role, reads. Mirrors the policy as admin-access.ts
 *  does; the API stays the enforcement. */
export const GUARANTEE_SET_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR"] as const;

export function canSetGuarantee(roles: readonly string[]): boolean {
  return roles.some((r) => (GUARANTEE_SET_ROLES as readonly string[]).includes(r));
}

/** The API's ceiling (contracts/intelligence.ts GuaranteeInput). */
export const GUARANTEE_MAX = 2_000_000_000;

/** What PUT …/guarantee takes: a metric and how many, or null to clear
 *  (the engine then paces against every deliverable booked). */
export type GuaranteeInput = { metric: GuaranteeMetric; value: number } | { metric: null };

/** "500,000" → 500000, "500k" → 500000, "1.2m" → 1200000; anything else null. */
export function guaranteeCount(text: string): number | null {
  const t = (text ?? "").trim().toLowerCase().replace(/,/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([km])?$/);
  if (!m) return null;
  return Math.round(Number(m[1]) * (m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1));
}

/**
 * The guarantee form's rules, shown as you type and re-checked by the server
 * action. An empty metric is "the default" — every deliverable booked — and
 * needs no number; a named metric needs a whole number from 1 to the API's
 * ceiling.
 */
export function checkGuarantee(metricInput: string, valueInput: string): { ok: true; input: GuaranteeInput } | { ok: false; message: string } {
  const metric = (metricInput ?? "").trim();
  if (!metric) return { ok: true, input: { metric: null } };
  if (!(GUARANTEE_METRICS as readonly string[]).includes(metric)) return { ok: false, message: "Pick what the campaign is promised." };
  const value = guaranteeCount(valueInput);
  if (value === null || value < 1) return { ok: false, message: `How many ${metric} by the end date — a whole number, e.g. 500,000 or 500k.` };
  if (value > GUARANTEE_MAX) return { ok: false, message: `A guarantee is at most ${fmtCount(GUARANTEE_MAX)} ${metric}.` };
  return { ok: true, input: { metric: metric as GuaranteeMetric, value } };
}

/** "500,000 impressions by Oct 31", or the default in words. */
export function guaranteeWords(g: { metric: GuaranteeMetric; value: number } | null, endsAt: string): string {
  if (!g) return `Every deliverable booked, published and verified by ${dayLabel(endsAt)} (the default).`;
  return `${g.value.toLocaleString("en-US")} ${METRIC_WORD[g.metric]} by ${dayLabel(endsAt)}.`;
}

/* ------------------------------------------------------------- the chart */

export type ChartBox = { w: number; h: number; pad: { top: number; right: number; bottom: number; left: number } };

export const PACING_BOX: ChartBox = { w: 760, h: 280, pad: { top: 20, right: 20, bottom: 28, left: 56 } };

/** The next clean number at or above n (1 / 2 / 2.5 / 5 × 10^k). */
export function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

/** One hover stop: every series' value at that day. */
export type ChartStop = {
  x: number;
  date: string;
  delivered?: number;
  expected?: number;
  low?: number;
  mid?: number;
  high?: number;
};

export type PacingGeometry = {
  box: ChartBox;
  yMax: number;
  yTicks: { y: number; value: number }[];
  xTicks: { x: number; label: string }[];
  delivered: string;
  deliveredArea: string;
  expected: string;
  band: string;
  mid: string;
  guaranteeY: number;
  todayX: number | null;
  end: { x: number; yMid: number } | null;
  stops: ChartStop[];
};

/**
 * Pure: the pacing chart's paths on ONE y-scale (cumulative delivery of the
 * guarantee's metric). x runs from the start date to the end date, so the
 * projected band visibly reaches the end of the flight.
 */
export function pacingGeometry(d: Pick<ForecastDetail, "startsAt" | "endsAt" | "guarantee" | "pacing" | "projection">, box: ChartBox = PACING_BOX): PacingGeometry {
  const { w, h, pad } = box;
  const t0 = Date.parse(d.startsAt);
  const t1 = Math.max(Date.parse(d.endsAt), t0 + DAY);
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const peak = Math.max(
    d.guarantee.value,
    ...d.pacing.map((p) => Math.max(p.delivered, p.expected)),
    ...d.projection.map((p) => p.high),
  );
  const yMax = niceCeil(peak * 1.05);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const x = (iso: string) => r1(pad.left + ((Date.parse(iso) - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => r1(pad.top + plotH - (Math.max(0, v) / yMax) * plotH);
  const base = pad.top + plotH;

  const line = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");

  const dx = d.pacing.map((p) => x(p.date));
  const delivered = d.pacing.length ? monotonePath(dx, d.pacing.map((p) => y(p.delivered))) : "";
  const deliveredArea = d.pacing.length ? `${delivered} L${dx[dx.length - 1]},${base} L${dx[0]},${base} Z` : "";
  const expected = line(d.pacing.map((p) => ({ x: x(p.date), y: y(p.expected) })));

  const px = d.projection.map((p) => x(p.date));
  const band = d.projection.length
    ? `${line(d.projection.map((p, i) => ({ x: px[i]!, y: y(p.high) })))} ${d.projection
        .map((p, i) => ({ x: px[i]!, y: y(p.low) }))
        .reverse()
        .map((p) => `L${p.x},${p.y}`)
        .join(" ")} Z`
    : "";
  const mid = d.projection.length ? monotonePath(px, d.projection.map((p) => y(p.mid))) : "";

  const yTicks = [0, 1, 2, 3, 4].map((k) => ({ value: (yMax / 4) * k, y: y((yMax / 4) * k) }));
  const spanDays = (t1 - t0) / DAY;
  const xTicks = [0, 1, 2, 3, 4].map((k) => {
    const iso = new Date(t0 + Math.round((spanDays / 4) * k) * DAY).toISOString();
    return { x: x(iso), label: dayLabel(iso) };
  });

  const last = d.pacing[d.pacing.length - 1];
  const lastProj = d.projection[d.projection.length - 1];

  /* Hover stops: each pacing day, then each projected day after it. */
  const stops: ChartStop[] = d.pacing.map((p) => ({ x: x(p.date), date: p.date, delivered: p.delivered, expected: p.expected }));
  for (const p of d.projection) {
    const same = stops.find((s) => s.date === p.date);
    if (same) Object.assign(same, { low: p.low, mid: p.mid, high: p.high });
    else stops.push({ x: x(p.date), date: p.date, low: p.low, mid: p.mid, high: p.high });
  }
  stops.sort((a, b) => a.x - b.x);

  return {
    box,
    yMax,
    yTicks,
    xTicks,
    delivered,
    deliveredArea,
    expected,
    band,
    mid,
    guaranteeY: y(d.guarantee.value),
    todayX: last ? x(last.date) : null,
    end: lastProj ? { x: x(lastProj.date), yMid: y(lastProj.mid) } : null,
    stops,
  };
}

/** Index of the stop nearest an x position (the crosshair snaps to it). */
export function nearestStop(stops: readonly ChartStop[], px: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i]!.x - px) < Math.abs(stops[best]!.x - px)) best = i;
  return best;
}

/* ----------------------------------------------------------------- sample */

/* `?demo=sample` only (server/engine.ts wantsSample) and the tests. Every
   id is prefixed `sample-fc-`; nothing here is a real campaign. */

function sampleDetail(o: {
  id: string;
  name: string;
  sponsor: string;
  start: string;
  days: number;
  today: number;
  guarantee: number;
  metric: GuaranteeMetric;
  /** Daily delivery as a share of the straight-line daily plan. */
  rate: number;
  probability: number;
  risk: RiskLevel;
  confidence: number;
}): ForecastDetail {
  const t0 = Date.parse(o.start);
  const iso = (k: number) => new Date(t0 + k * DAY).toISOString();
  const perDay = o.guarantee / o.days;
  const pacing: PacingPoint[] = [];
  for (let k = 0; k <= o.today; k++) {
    /* A slow first week, then the campaign's own rate — deterministic. */
    const ramp = Math.min(1, (k + 1) / 7);
    const prev = pacing[k - 1]?.delivered ?? 0;
    pacing.push({ date: iso(k), delivered: Math.round(prev + perDay * o.rate * ramp), expected: Math.round(perDay * k) });
  }
  const delivered = pacing[pacing.length - 1]!.delivered;
  const remaining = o.days - o.today;
  const projection: ProjectionPoint[] = [];
  for (let k = 0; k <= remaining; k++) {
    const mid = delivered + perDay * o.rate * k;
    const spread = perDay * 0.35 * k;
    projection.push({ date: iso(o.today + k), low: Math.round(mid - spread), mid: Math.round(mid), high: Math.round(mid + spread) });
  }
  const end = projection[projection.length - 1]!;
  const computedAt = iso(o.today);
  const atRisk = o.risk !== "on_track";
  return {
    campaignId: o.id,
    campaignName: o.name,
    sponsorName: o.sponsor,
    startsAt: iso(0),
    endsAt: iso(o.days),
    elapsed: o.today / o.days,
    guarantee: { metric: o.metric, value: o.guarantee },
    delivered,
    deliveredSource: "VERIFIED_API",
    projectedFinal: { low: end.low, mid: end.mid, high: end.high },
    probabilityOfGuarantee: o.probability,
    risk: o.risk,
    stamp: { modelVersion: "forecast-pacing@0.1.0", confidence: o.confidence, computedAt },
    pacing,
    projection,
    riskFactors: atRisk
      ? [
          { key: "pace", label: "Behind straight-line pace", detail: `Verified delivery is ${Math.round(o.rate * 100)}% of the daily plan since launch.` },
          { key: "overdue", label: "Deliverables overdue", detail: "Two posts are past their due date and not yet verified." },
          { key: "channel", label: "One channel carrying the load", detail: "Most delivery so far came from a single platform." },
        ]
      : [],
    actions: atRisk
      ? [
          { kind: "accelerate_content", label: ACTION_WORD.accelerate_content, detail: "Ask the athletes with overdue posts to publish this week." },
          { kind: "change_channel", label: ACTION_WORD.change_channel, detail: "Move the next post to the platform with the higher verified reach." },
          { kind: "reserve_make_good", label: ACTION_WORD.reserve_make_good, detail: "Hold substitute inventory in case the gap does not close." },
        ]
      : [],
    alert: atRisk ? { raisedAt: iso(o.today - 2), risk: o.risk as Exclude<RiskLevel, "on_track">, threshold: o.risk === "at_risk" ? 0.5 : 0.75 } : null,
    history: [0, 1, 2, 3, 4].map((k) => ({
      forecastAt: iso(o.today - k * 3),
      projectedMid: Math.round(end.mid * (1 + k * 0.04)),
      probability: Math.min(0.99, o.probability + k * 0.05),
      modelVersion: k < 4 ? "forecast-pacing@0.1.0" : "forecast-pacing@0.0.9",
    })),
  };
}

export const SAMPLE_FORECAST_DETAILS: ForecastDetail[] = [
  sampleDetail({ id: "sample-fc-river", name: "Riverside Fall Kickoff", sponsor: "Northwind Outfitters", start: "2026-09-01T00:00:00.000Z", days: 60, today: 42, guarantee: 500_000, metric: "impressions", rate: 0.62, probability: 0.18, risk: "at_risk", confidence: 0.71 }),
  sampleDetail({ id: "sample-fc-court", name: "Courtside Hydration", sponsor: "Bluepeak Drinks", start: "2026-09-15T00:00:00.000Z", days: 45, today: 28, guarantee: 120_000, metric: "engagements", rate: 0.88, probability: 0.55, risk: "watch", confidence: 0.64 }),
  sampleDetail({ id: "sample-fc-cards", name: "Game-day Cards", sponsor: "Harbor Credit Union", start: "2026-09-20T00:00:00.000Z", days: 40, today: 23, guarantee: 3_000, metric: "redemptions", rate: 1.12, probability: 0.91, risk: "on_track", confidence: 0.82 }),
  sampleDetail({ id: "sample-fc-trail", name: "Trail Season Launch", sponsor: "Summit Gear Co.", start: "2026-08-25T00:00:00.000Z", days: 70, today: 49, guarantee: 800_000, metric: "impressions", rate: 1.02, probability: 0.78, risk: "on_track", confidence: 0.77 }),
];

const rowOf = (d: ForecastDetail): ForecastRow => ({
  campaignId: d.campaignId,
  campaignName: d.campaignName,
  sponsorName: d.sponsorName,
  startsAt: d.startsAt,
  endsAt: d.endsAt,
  elapsed: d.elapsed,
  guarantee: d.guarantee,
  delivered: d.delivered,
  deliveredSource: d.deliveredSource,
  projectedFinal: d.projectedFinal,
  probabilityOfGuarantee: d.probabilityOfGuarantee,
  risk: d.risk,
  stamp: d.stamp,
});

const sampleRows = SAMPLE_FORECAST_DETAILS.map(rowOf).sort(compareRisk);

export const SAMPLE_FORECAST_LIST: ForecastList = {
  counts: {
    active: sampleRows.length,
    at_risk: sampleRows.filter((r) => r.risk === "at_risk").length,
    watch: sampleRows.filter((r) => r.risk === "watch").length,
    on_track: sampleRows.filter((r) => r.risk === "on_track").length,
  },
  campaigns: sampleRows,
  page: { page: 1, size: 12, total: sampleRows.length, pages: 1 },
};

/** The sample list as the API would answer one tab of it. */
export function sampleForecastList(tab: ForecastTabKey): ForecastList {
  const campaigns = tab === "all" ? SAMPLE_FORECAST_LIST.campaigns : SAMPLE_FORECAST_LIST.campaigns.filter((r) => r.risk === tab);
  return { ...SAMPLE_FORECAST_LIST, campaigns, page: { page: 1, size: 12, total: campaigns.length, pages: 1 } };
}

export function sampleForecastDetail(campaignId: string): ForecastDetail | null {
  return SAMPLE_FORECAST_DETAILS.find((d) => d.campaignId === campaignId) ?? null;
}
