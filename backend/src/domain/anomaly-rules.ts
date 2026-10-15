/**
 * The anomaly rules — 3S8-DATA-01 (documentation/SponsorX-Anomalies.md).
 *
 * Pure: no database. anomaly-engine.ts gathers the last LOOKBACK_DAYS of
 * facts and keeps what these rules flag.
 *
 * Every flag is a rule's claim, not a fact, so each carries its rule, the
 * rule's version and the evidence in words. The five kinds (Spec §15, §22):
 *
 *   spike         a metric stream (one deliverable, one source) whose day is
 *                 at least SPIKE_FACTOR × its trailing median (at least
 *                 SPIKE_MIN_PRIOR earlier days, at least SPIKE_MIN_VIEWS);
 *   duplicate     two deliverables carrying the same published post URL —
 *                 the later one would count the same post twice;
 *   bot           a tracking link clicked BOT_CLICKS times inside one
 *                 BOT_WINDOW_S-second window — a machine's rhythm;
 *   redemption    a reward redeemed BURST_REDEEMS times inside one
 *                 BURST_WINDOW_S window, or one fan redeeming the same
 *                 reward REPEAT_FAN_REDEEMS times;
 *   manual_entry  a hand-entered day at least MANUAL_FACTOR × what the API
 *                 measured that day, or any entry with more engagements than
 *                 views.
 *
 * AUTOMATIC DISPOSITION (user, 2026-10-15: automation first for BTG admins,
 * held for a person when judgement is needed). Only the clear-cut case is
 * decided by SponsorX: a duplicate post URL is excluded from reporting on its
 * own, with the reason — the same post can never count twice. Spikes, bot
 * clicks, suspicious redemptions and manual entries need a person's
 * judgement and wait for one. A person may replace an automatic decision.
 */

export const ANOMALY_RULES_VERSION = "anomaly-rules@1.0.0";
export const LOOKBACK_DAYS = 30;
export const SPIKE_FACTOR = 5;
export const SPIKE_HIGH_FACTOR = 10;
export const SPIKE_MIN_PRIOR = 3;
export const SPIKE_TRAILING_DAYS = 14;
export const SPIKE_MIN_VIEWS = 1000;
export const BOT_CLICKS = 30;
export const BOT_HIGH_CLICKS = 100;
export const BOT_WINDOW_S = 60;
export const BURST_REDEEMS = 10;
export const BURST_WINDOW_S = 300;
export const REPEAT_FAN_REDEEMS = 3;
export const MANUAL_FACTOR = 3;

export type AnomalyKind = "spike" | "duplicate" | "bot" | "redemption" | "manual_entry";
export type Severity = "high" | "medium" | "low";
export type Flag = {
  kind: AnomalyKind;
  severity: Severity;
  ruleId: string;
  subject: { type: "campaign" | "athlete" | "reward" | "metric_stream"; id: string; name: string };
  /** Unique per tenant: a flag is raised once, however many nights it is seen. */
  fingerprint: string;
  evidence: Array<{ label: string; value: string }>;
  /** Set for the clear-cut cases SponsorX decides itself. */
  auto?: { outcome: "excluded_from_reporting"; note: string };
};

const n = (x: number) => Math.round(x).toLocaleString("en-US");
const day = (d: Date) => d.toISOString().slice(0, 10);
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** The most events inside any window of `seconds`, and when that window started. */
export function densest(times: readonly Date[], seconds: number): { count: number; from: Date | null } {
  const ts = [...times].map((t) => t.getTime()).sort((a, b) => a - b);
  let best = 0;
  let from: number | null = null;
  for (let i = 0, j = 0; j < ts.length; j++) {
    while (ts[j]! - ts[i]! >= seconds * 1000) i++;
    if (j - i + 1 > best) { best = j - i + 1; from = ts[i]!; }
  }
  return { count: best, from: from === null ? null : new Date(from) };
}

export type StreamDay = { deliverableId: string; title: string; source: string; day: Date; views: number };

/** Spikes, per stream (deliverable × source), against the trailing median of its earlier days. */
export function spikeFlags(rows: readonly StreamDay[]): Flag[] {
  const streams = new Map<string, StreamDay[]>();
  for (const r of rows) streams.set(`${r.deliverableId}:${r.source}`, [...(streams.get(`${r.deliverableId}:${r.source}`) ?? []), r]);
  const out: Flag[] = [];
  for (const [key, list] of streams) {
    const sorted = [...list].sort((a, b) => a.day.getTime() - b.day.getTime());
    sorted.forEach((r, i) => {
      const prior = sorted.slice(0, i).filter((p) => r.day.getTime() - p.day.getTime() <= SPIKE_TRAILING_DAYS * 86_400_000 && p.views > 0);
      if (prior.length < SPIKE_MIN_PRIOR || r.views < SPIKE_MIN_VIEWS) return;
      const base = median(prior.map((p) => p.views));
      if (base <= 0 || r.views < SPIKE_FACTOR * base) return;
      out.push({
        kind: "spike", severity: r.views >= SPIKE_HIGH_FACTOR * base ? "high" : "medium", ruleId: "spike.views",
        subject: { type: "metric_stream", id: key, name: `${r.title} · ${r.source}` },
        fingerprint: `spike.views:${key}:${day(r.day)}`,
        evidence: [
          { label: "Day", value: day(r.day) }, { label: "Views that day", value: n(r.views) },
          { label: `Usual day (median of ${prior.length})`, value: n(base) }, { label: "Times usual", value: `${(r.views / base).toFixed(1)}×` },
        ],
      });
    });
  }
  return out;
}

export type PostRow = { deliverableId: string; title: string; publishedUrl: string; publishedAt: Date | null; campaignId: string; campaignName: string };

/** The same post URL on two deliverables: the later one is a duplicate, excluded from reporting automatically. */
export function duplicateFlags(rows: readonly PostRow[]): Flag[] {
  const norm = (u: string) => u.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const groups = new Map<string, PostRow[]>();
  for (const r of rows) if (r.publishedUrl.trim()) groups.set(norm(r.publishedUrl), [...(groups.get(norm(r.publishedUrl)) ?? []), r]);
  const out: Flag[] = [];
  for (const [url, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0) || a.deliverableId.localeCompare(b.deliverableId));
    const first = sorted[0]!;
    for (const dup of sorted.slice(1)) {
      out.push({
        kind: "duplicate", severity: "medium", ruleId: "duplicate.post",
        subject: { type: "campaign", id: dup.campaignId, name: dup.campaignName },
        fingerprint: `duplicate.post:${dup.deliverableId}`,
        evidence: [
          { label: "Post", value: url }, { label: "Counted first on", value: `${first.title} (${first.campaignName})` }, { label: "Counted again on", value: `${dup.title} (${dup.campaignName})` },
        ],
        auto: { outcome: "excluded_from_reporting", note: `Excluded automatically by SponsorX: the same post is already counted on "${first.title}", and a post can never count twice.` },
      });
    }
  }
  return out;
}

export type ClickRow = { linkId: string; campaignId: string; campaignName: string; at: Date };

/** A link clicked BOT_CLICKS times inside one minute. One flag per link per day. */
export function botFlags(rows: readonly ClickRow[]): Flag[] {
  const byLinkDay = new Map<string, ClickRow[]>();
  for (const r of rows) byLinkDay.set(`${r.linkId}|${day(r.at)}`, [...(byLinkDay.get(`${r.linkId}|${day(r.at)}`) ?? []), r]);
  const out: Flag[] = [];
  for (const [key, list] of byLinkDay) {
    const d = densest(list.map((r) => r.at), BOT_WINDOW_S);
    if (d.count < BOT_CLICKS) continue;
    const [linkId, on] = key.split("|");
    out.push({
      kind: "bot", severity: d.count >= BOT_HIGH_CLICKS ? "high" : "medium", ruleId: "bot.clicks",
      subject: { type: "campaign", id: list[0]!.campaignId, name: list[0]!.campaignName },
      fingerprint: `bot.clicks:${linkId}:${on}`,
      evidence: [
        { label: "Clicks inside one minute", value: n(d.count) }, { label: "From", value: d.from!.toISOString().slice(0, 19).replace("T", " ") + " UTC" },
        { label: "Clicks that day", value: n(list.length) },
      ],
    });
  }
  return out;
}

export type RedeemRow = { rewardId: string; offerText: string; at: Date };
/**
 * One fan's redemptions of one reward, grouped in the database. The fan's
 * address never leaves it (tests/fan-pii.test.ts): only the count and the
 * fan's first redemption, whose id keys the flag.
 */
export type RepeatFanRow = { rewardId: string; offerText: string; n: number; firstEventId: string; firstAt: Date };

/** Bursts of redemptions on one reward. */
export function redemptionFlags(rows: readonly RedeemRow[]): Flag[] {
  const out: Flag[] = [];
  const byRewardDay = new Map<string, RedeemRow[]>();
  for (const r of rows) byRewardDay.set(`${r.rewardId}|${day(r.at)}`, [...(byRewardDay.get(`${r.rewardId}|${day(r.at)}`) ?? []), r]);
  for (const [key, list] of byRewardDay) {
    const d = densest(list.map((r) => r.at), BURST_WINDOW_S);
    if (d.count < BURST_REDEEMS) continue;
    const [rewardId, on] = key.split("|");
    out.push({
      kind: "redemption", severity: "high", ruleId: "redemption.burst",
      subject: { type: "reward", id: rewardId!, name: list[0]!.offerText },
      fingerprint: `redemption.burst:${rewardId}:${on}`,
      evidence: [{ label: "Redemptions inside 5 minutes", value: n(d.count) }, { label: "From", value: d.from!.toISOString().slice(0, 19).replace("T", " ") + " UTC" }],
    });
  }
  return out;
}

/** One fan redeeming the same reward REPEAT_FAN_REDEEMS times or more. */
export function repeatFanFlags(rows: readonly RepeatFanRow[]): Flag[] {
  return rows.filter((r) => r.n >= REPEAT_FAN_REDEEMS).map((r) => ({
    kind: "redemption" as const, severity: "medium" as const, ruleId: "redemption.repeat_fan",
    subject: { type: "reward" as const, id: r.rewardId, name: r.offerText },
    fingerprint: `redemption.repeat_fan:${r.rewardId}:${r.firstEventId}`,
    evidence: [
      { label: "Times one fan redeemed", value: n(r.n) },
      { label: "Their first redemption", value: r.firstAt.toISOString().slice(0, 19).replace("T", " ") + " UTC" },
    ],
  }));
}

export type EntryRow = { deliverableId: string; title: string; day: Date; source: string; views: number; engagements: number };

const HAND_ENTERED = new Set(["VERIFIED_MANUAL", "SELF_REPORTED"]);

/** Hand-entered figures far above what the API measured the same day, or with more engagements than views. */
export function manualFlags(rows: readonly EntryRow[]): Flag[] {
  const out: Flag[] = [];
  const api = new Map(rows.filter((r) => r.source === "VERIFIED_API").map((r) => [`${r.deliverableId}|${day(r.day)}`, r.views]));
  for (const r of rows) {
    if (!HAND_ENTERED.has(r.source)) continue;
    const key = `${r.deliverableId}:${r.source}`;
    const measured = api.get(`${r.deliverableId}|${day(r.day)}`) ?? 0;
    if (measured > 0 && r.views >= MANUAL_FACTOR * measured) {
      out.push({
        kind: "manual_entry", severity: "medium", ruleId: "manual.over_measured",
        subject: { type: "metric_stream", id: key, name: `${r.title} · ${r.source}` },
        fingerprint: `manual.over_measured:${key}:${day(r.day)}`,
        evidence: [
          { label: "Day", value: day(r.day) }, { label: "Entered by hand", value: n(r.views) }, { label: "Measured by the API", value: n(measured) },
          { label: "Times measured", value: `${(r.views / measured).toFixed(1)}×` },
        ],
      });
    }
    if (r.engagements > r.views) {
      out.push({
        kind: "manual_entry", severity: "low", ruleId: "manual.engagement_over_views",
        subject: { type: "metric_stream", id: key, name: `${r.title} · ${r.source}` },
        fingerprint: `manual.engagement_over_views:${key}:${day(r.day)}`,
        evidence: [{ label: "Day", value: day(r.day) }, { label: "Views", value: n(r.views) }, { label: "Engagements", value: n(r.engagements) }],
      });
    }
  }
  return out;
}
