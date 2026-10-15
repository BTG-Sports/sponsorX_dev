/**
 * The delivery forecast's rules — 3S4-DATA-01, 3S4-BE-01, 3S4-BE-02
 * (documentation/SponsorX-Forecasting.md).
 *
 * Pure: no database, no clock unless one is passed. forecast-engine.ts
 * gathers the facts; these rules decide.
 *
 * THE GUARANTEE. What a campaign is promised to reach by its end date: a
 * number of impressions, engagements or redemptions set by BTG — or, unset,
 * every deliverable booked, published and verified (user, 2026-10-14).
 *
 * TWO FORECASTS, BECAUSE THE TWO KINDS OF PROMISE BEHAVE DIFFERENTLY.
 *
 *   A FLOW (impressions, engagements, redemptions) accrues day by day. Its
 *   final is today's total plus a daily rate over the days left. Early on
 *   the observed rate is mostly noise, so it is blended with the plan's rate
 *   (the guarantee spread evenly over the flight), trusting the observed
 *   rate fully once FULL_TRUST_ELAPSED of the flight has gone. The spread of
 *   the daily figures gives the range and, through a normal approximation,
 *   the probability of reaching the guarantee.
 *
 *   DELIVERABLES are a schedule. Each one still to be verified has a chance
 *   of landing before the end date: high when not yet due (lower for an
 *   athlete who has been late), lower once overdue, lower still with under a
 *   week left. The guarantee (every one) holds if every one lands, so the
 *   probability is their product.
 *
 * RISK (user, 2026-10-14): on track at WATCH_BELOW (80%) or better; watch
 * from AT_RISK_BELOW (50%) to 80%; at risk below 50%.
 */

/** 2.0.0 (2026-10-15): the pace's own uncertainty widens the early spread (forecastFlow, paceUncertainty). */
export const FORECAST_MODEL_VERSION = "forecast-rules@2.0.0";
export const GUARANTEE_METRICS = ["impressions", "engagements", "redemptions", "deliverables"] as const;
export type GuaranteeMetric = (typeof GUARANTEE_METRICS)[number];
export type Risk = "on_track" | "watch" | "at_risk";

/** Below this probability a campaign is on watch (user, 2026-10-14). */
export const WATCH_BELOW = 0.8;
/** Below this it is at risk (user, 2026-10-14). */
export const AT_RISK_BELOW = 0.5;
/** The observed daily rate is trusted fully once this share of the flight has gone. */
export const FULL_TRUST_ELAPSED = 0.3;
/** The range is the central 80%: z for the 10th and 90th percentiles. */
export const BAND_Z = 1.2816;
/** A deliverable not yet due lands before the end with this chance — less for a late athlete. */
export const P_NOT_YET_DUE = 0.98;
export const P_OVERDUE = 0.75;
export const P_OVERDUE_LAST_WEEK = 0.4;

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
/** Whole days from a to b, counting both. */
export const daysInclusive = (a: Date, b: Date) => Math.floor((utcDay(b) - utcDay(a)) / DAY_MS) + 1;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(utcDay(d) + n * DAY_MS);

/** Where the flight stands on `today`: total days, days gone (today counts), days left, the share gone. */
export function flight(start: Date, end: Date, today: Date) {
  const total = Math.max(1, daysInclusive(start, end));
  const gone = Math.min(total, Math.max(0, daysInclusive(start, today)));
  return { total, gone, left: total - gone, elapsed: Math.round((gone / total) * 10_000) / 10_000 };
}

/** The standard normal CDF (Abramowitz–Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

export type Projection = { low: number; mid: number; high: number; probability: number };

/**
 * A flow's forecast. `daily` is the verified delivery on each day gone, in
 * order (length = days gone).
 */
/**
 * `paceUncertainty` (forecast-rules@2.0.0, user-approved 2026-10-15 after the
 * backtest, documentation/SponsorX-Backtest.md §4): the pace itself is
 * uncertain — a campaign can slow down or pick up — so the remaining days'
 * total has a second spread, rate × paceUncertainty × (share of the flight
 * still to go) × days left, perfectly shared across those days. It is widest
 * early and gone at the end. 0 is the 1.x forecast exactly.
 */
export function forecastFlow(guarantee: number, daily: readonly number[], total: number, fullTrust = FULL_TRUST_ELAPSED, paceUncertainty = 0): Projection & { rate: number; sdDay: number } {
  const gone = daily.length;
  const left = Math.max(0, total - gone);
  const delivered = daily.reduce((t, x) => t + x, 0);
  const plan = guarantee / total;
  const mu = gone ? delivered / gone : 0;
  const sigma = gone ? Math.sqrt(daily.reduce((t, x) => t + (x - mu) ** 2, 0) / gone) : 0;
  const w = Math.min(1, gone / total / fullTrust);
  const rate = w * mu + (1 - w) * plan;
  const sdDay = w * sigma + (1 - w) * 0.5 * plan;
  const mid = delivered + rate * left;
  const sdPace = rate * paceUncertainty * (left / total) * left;
  const sd = Math.sqrt((sdDay * Math.sqrt(left)) ** 2 + sdPace ** 2);
  const probability = left === 0 || sd === 0 ? (mid >= guarantee ? 1 : 0) : normalCdf((mid - guarantee) / sd);
  return {
    low: Math.round(Math.max(delivered, mid - BAND_Z * sd)), mid: Math.round(mid), high: Math.round(mid + BAND_Z * sd),
    probability: round4(probability), rate, sdDay,
  };
}

export type PendingDeliverable = { dueOn: Date; onTimeRate: number | null };

/** The chance one deliverable still to verify lands before the end date. */
export function landingChance(d: PendingDeliverable, today: Date, end: Date): number {
  if (utcDay(d.dueOn) < utcDay(today)) return daysInclusive(today, end) >= 7 ? P_OVERDUE : P_OVERDUE_LAST_WEEK;
  return d.onTimeRate === null ? P_NOT_YET_DUE : Math.min(P_NOT_YET_DUE, 0.5 + 0.5 * d.onTimeRate);
}

/** The deliverables' forecast: every one booked is the guarantee unless BTG set a number. */
export function forecastDeliverables(guarantee: number, delivered: number, pending: readonly PendingDeliverable[], today: Date, end: Date): Projection {
  const ps = pending.map((d) => landingChance(d, today, end));
  const mid = delivered + ps.reduce((t, p) => t + p, 0);
  const sd = Math.sqrt(ps.reduce((t, p) => t + p * (1 - p), 0));
  const needed = guarantee - delivered;
  /* The guarantee holds if `needed` of them land; with every one needed it is their product. */
  const probability = needed <= 0 ? 1 : needed > ps.length ? 0
    : needed === ps.length ? ps.reduce((t, p) => t * p, 1)
    : sd === 0 ? (mid >= guarantee ? 1 : 0) : normalCdf((mid - (guarantee - 0.5)) / sd);
  return {
    low: Math.round(Math.max(delivered, mid - BAND_Z * sd)), mid: Math.round(mid), high: Math.round(Math.min(delivered + ps.length, mid + BAND_Z * sd)),
    probability: round4(probability),
  };
}

/** The settings behind risk and alerts: the built-in ones, or the tenant's active version (3S8-BE-01). */
export type ForecastSettings = { watchBelow: number; atRiskBelow: number; alertMinElapsed: number };
export const FORECAST_DEFAULTS: ForecastSettings = { watchBelow: WATCH_BELOW, atRiskBelow: AT_RISK_BELOW, alertMinElapsed: 0.2 };

/** Risk under the given settings (3S8-BE-01). */
export function riskWith(probability: number, t: Pick<ForecastSettings, "watchBelow" | "atRiskBelow">): Risk {
  return probability >= t.watchBelow ? "on_track" : probability >= t.atRiskBelow ? "watch" : "at_risk";
}

/** Risk under the built-in settings. */
export function riskOf(probability: number): Risk {
  return riskWith(probability, FORECAST_DEFAULTS);
}

/** The projected band, from tomorrow to the end date, straight from today's total to the final. */
export function projectionPath(today: Date, end: Date, delivered: number, p: Projection) {
  const left = Math.max(0, daysInclusive(today, end) - 1);
  const out: Array<{ date: string; low: number; mid: number; high: number }> = [];
  for (let i = 1; i <= left; i++) {
    const f = i / left;
    out.push({ date: isoDay(addDays(today, i)), low: Math.round(delivered + (p.low - delivered) * f), mid: Math.round(delivered + (p.mid - delivered) * f), high: Math.round(delivered + (p.high - delivered) * f) });
  }
  return out;
}

/* ───────────────────────────── why, and what to do (3S4-BE-02) ───────────────────────────── */

export type ChannelDelivery = { channel: string; published: number; delivered: number };
export type RiskFactor = { key: string; label: string; detail: string };
export type ActionKind = "accelerate_content" | "add_deliverable" | "change_channel" | "reserve_make_good";
export type Action = { kind: ActionKind; label: string; detail: string };

export type Situation = {
  metric: GuaranteeMetric;
  guarantee: number;
  delivered: number;
  expectedToday: number;
  projectedMid: number;
  elapsed: number;
  daysLeft: number;
  overdue: number;
  channels: readonly ChannelDelivery[];
  risk: Risk;
};

const n = (x: number) => Math.round(x).toLocaleString("en-US");
const CHANNEL_WORDS: Record<string, string> = {
  INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube", X: "X", FACEBOOK: "Facebook", OTHER: "other social",
  IN_PERSON: "in person", UNPUBLISHED: "unpublished", EDITION_PRINT: "print", EDITION_DIGITAL: "digital edition", CAMPAIGN: "the campaign",
};
const words = (c: string) => CHANNEL_WORDS[c.replace(/^SOCIAL_/, "")] ?? c.toLowerCase().replaceAll("_", " ");

/** The channel delivering least per published deliverable — under 30% of the campaign's average — and the best one. */
export function channelLag(channels: readonly ChannelDelivery[]): { lag: ChannelDelivery; best: ChannelDelivery; avg: number } | null {
  const live = channels.filter((c) => c.published > 0);
  if (live.length < 2) return null;
  const avg = live.reduce((t, c) => t + c.delivered, 0) / live.reduce((t, c) => t + c.published, 0);
  const per = (c: ChannelDelivery) => c.delivered / c.published;
  const sorted = [...live].sort((a, b) => per(a) - per(b) || a.channel.localeCompare(b.channel));
  const lag = sorted[0]!;
  const best = sorted[sorted.length - 1]!;
  return avg > 0 && per(lag) < 0.3 * avg && per(best) > per(lag) ? { lag, best, avg } : null;
}

export function riskFactors(s: Situation): RiskFactor[] {
  const out: RiskFactor[] = [];
  const unit = s.metric;
  if (s.expectedToday > 0 && s.delivered < 0.8 * s.expectedToday) {
    out.push({ key: "behind_pace", label: "Behind pace", detail: `${n(s.delivered)} of ${n(s.expectedToday)} ${unit} expected by today (${Math.round((s.delivered / s.expectedToday) * 100)}%).` });
  }
  if (s.overdue > 0) out.push({ key: "overdue_work", label: "Overdue work", detail: `${s.overdue} deliverable(s) past due and not verified.` });
  if (s.projectedMid < s.guarantee) {
    out.push({ key: "projected_shortfall", label: "Projected shortfall", detail: `Projected ${n(s.projectedMid)} against a guarantee of ${n(s.guarantee)} — ${n(s.guarantee - s.projectedMid)} short.` });
  }
  const lag = s.metric === "deliverables" || s.metric === "redemptions" ? null : channelLag(s.channels);
  if (lag) {
    out.push({ key: "channel_lag", label: "Channel lagging", detail: `${words(lag.lag.channel)}: ${n(lag.lag.delivered / lag.lag.published)} ${unit} per deliverable against ${n(lag.avg)} on average.` });
  }
  if (s.elapsed >= 0.8 && s.projectedMid < s.guarantee) out.push({ key: "running_out", label: "Running out of time", detail: `${s.daysLeft} day(s) left.` });
  return out;
}

/** The recommended actions — only for a campaign that is not on track. */
export function recommendedActions(s: Situation): Action[] {
  if (s.risk === "on_track") return [];
  const out: Action[] = [];
  const gap = Math.max(0, s.guarantee - s.projectedMid);
  if (s.overdue > 0) {
    out.push({ kind: "accelerate_content", label: "Accelerate content", detail: `Chase the ${s.overdue} overdue deliverable(s) — the plan already counts on them.` });
  }
  const lag = s.metric === "deliverables" || s.metric === "redemptions" ? null : channelLag(s.channels);
  if (lag) {
    out.push({ kind: "change_channel", label: "Change channel",
      detail: `Move the remaining deliverables from ${words(lag.lag.channel)} to ${words(lag.best.channel)}, which delivers ${n(lag.best.delivered / lag.best.published)} per deliverable.` });
  }
  if (gap > 0 && s.elapsed < 0.8 && s.metric !== "deliverables") {
    const published = s.channels.reduce((t, c) => t + c.published, 0);
    const per = published ? s.delivered / published : 0;
    out.push({ kind: "add_deliverable", label: "Add a deliverable",
      detail: per > 0 ? `Add about ${Math.ceil(gap / per)} deliverable(s): at ${n(per)} ${s.metric} each, that covers the ${n(gap)} gap.` : `Add a deliverable to cover the projected ${n(gap)} ${s.metric} gap.` });
  }
  if (gap > 0 && s.elapsed >= 0.8) {
    out.push({ kind: "reserve_make_good", label: "Reserve make-good inventory", detail: `Reserve make-good inventory for a projected ${n(gap)} ${s.metric} short, with ${s.daysLeft} day(s) left.` });
  }
  if (!out.length) out.push({ kind: "accelerate_content", label: "Accelerate content", detail: "Bring the remaining deliverables forward to lift delivery while there is time." });
  return out;
}

/* ───────────────────────────── alerts (3S4-BE-02) ───────────────────────────── */

export type OpenAlert = { id: string; risk: "watch" | "at_risk"; emailed: boolean } | null;
export type AlertMove = {
  /** A new alert to raise, and whether to email it (at risk only). */
  raise: { risk: "watch" | "at_risk"; threshold: number; email: boolean } | null;
  /** Close the open alert: back on track, or superseded by a worse one. */
  close: boolean;
  /** Tell them it recovered: an emailed at-risk alert closed by getting back on track. */
  emailRecovery: boolean;
};

/** No alert is raised before this share of the flight has gone: early on, delivery lags the posts. */
export const ALERT_MIN_ELAPSED = 0.2;

/**
 * What a new risk does to the campaign's open alert. Raised only before the
 * end date and once ALERT_MIN_ELAPSED of the flight has gone; an at-risk
 * alert is emailed once and held until the campaign is back on track (a dip
 * to watch does not close it), so a campaign hovering around a threshold
 * does not email every night.
 */
export function alertMove(open: OpenAlert, risk: Risk, beforeEnd: boolean, elapsed: number, t: ForecastSettings = { ...FORECAST_DEFAULTS, alertMinElapsed: ALERT_MIN_ELAPSED }): AlertMove {
  const none: AlertMove = { raise: null, close: false, emailRecovery: false };
  if (risk === "on_track") return open ? { raise: null, close: true, emailRecovery: open.risk === "at_risk" && open.emailed } : none;
  if (!beforeEnd || elapsed < t.alertMinElapsed) return none;
  if (risk === "watch") return open ? none : { raise: { risk: "watch", threshold: t.watchBelow, email: false }, close: false, emailRecovery: false };
  if (open?.risk === "at_risk") return none;
  return { raise: { risk: "at_risk", threshold: t.atRiskBelow, email: true }, close: !!open, emailRecovery: false };
}
