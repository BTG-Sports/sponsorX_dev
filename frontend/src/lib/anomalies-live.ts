/* --------------------------------------------------------------------------
   3S8-FE-01 · Data quality and anomaly console — the desk's contract and words.

   Reads  GET  /intelligence/anomalies?tab=open|resolved&kind&page&size → AnomalyDesk
   Writes POST /intelligence/anomalies/:id/disposition { outcome, note }
          → 200 { anomaly: Anomaly } (the record with its disposition)
          → 409 anomaly_decided  a person already decided; the record stands
          → 422 anomaly_note     the note is under 8 or over 2,000 characters
          → 404 anomaly_not_found  not this tenant's flag
   Engine "anomalies" (lib/intelligence.ts) — 3S8-DATA-01, mounted 2026-10-15
   (backend/src/domain/anomaly-engine.ts, documentation/SponsorX-Anomalies.md).
   BTG admins and campaign managers (lib/admin-access.ts) — a disposition
   changes what a sponsor's report counts.

   What the reviewer decides (Spec §15, §22): every flag is a rule's claim,
   not a fact, so each one is triaged to one of three outcomes and a note is
   required for every one — a "false positive" with no reason is as
   unauditable as an exclusion with none.

   Two kinds of decision (landed with the engine):
   - AUTOMATIC — SponsorX decides the clear-cut case itself: a duplicate post
     is excluded from reporting the night it is seen (`automatic: true`,
     `by: "SponsorX (automatic)"`). It sits on the Resolved tab, and a person
     may still replace it.
   - A PERSON's — final. A second disposition answers 409.

   Pure: no fetch (server/engine.ts reads, ./actions.ts writes).
   -------------------------------------------------------------------------- */

import { MIN_REASON } from "@/lib/intel-admin";
import type { PageInfo } from "@/lib/list-query";

export type AnomalyKind = "spike" | "duplicate" | "bot" | "redemption" | "manual_entry";
export type AnomalySeverity = "high" | "medium" | "low";
export type AnomalyTab = "open" | "resolved";
export type DispositionOutcome = "confirmed_issue" | "false_positive" | "excluded_from_reporting";

export type Disposition = {
  outcome: DispositionOutcome;
  /** Always present — "" never happens for a person's; the automatic one carries SponsorX's reason. */
  note: string;
  /** Who decided: "email (Role)", "a former user", or "SponsorX (automatic)". */
  by: string;
  at: string;
  /** True when SponsorX decided on its own (a duplicate post). A person may replace it; a person's own is final. */
  automatic: boolean;
};

export type Anomaly = {
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** What was flagged: a campaign, an athlete, a reward, or one metric stream ("title · source"). */
  subject: { type: "campaign" | "athlete" | "reward" | "metric_stream"; id: string; name: string };
  detectedAt: string;
  /**
   * The detection rule and the model stamp it ran with (3S8-DATA-01) —
   * provenance for the flag. `id` is dotted ("duplicate.post"); `version`
   * is the registry's stamp ("anomaly-rules@1.0.0"), not a bare semver.
   */
  rule: { id: string; version: string };
  /** What the rule saw, as the rule states it. */
  evidence: { label: string; value: string }[];
  disposition: Disposition | null;
};

export type AnomalyDesk = {
  /** When the rules last ran for this tenant — the epoch (1970) when they never have; see `rulesRan`. */
  asOf: string;
  counts: {
    open: number;
    resolved: number;
    /** OPEN flags per kind — the KPI tiles. */
    openByKind: Record<AnomalyKind, number>;
  };
  anomalies: Anomaly[];
  page: PageInfo;
};

export const ANOMALY_KINDS: AnomalyKind[] = ["spike", "duplicate", "bot", "redemption", "manual_entry"];

export const KIND: Record<AnomalyKind, { label: string; hint: string }> = {
  spike: { label: "Improbable spike", hint: "A metric stream jumped further than its history allows." },
  duplicate: { label: "Duplicate events", hint: "The same event arrived more than once." },
  bot: { label: "Bot-like behaviour", hint: "Traffic or scans with a machine's rhythm." },
  redemption: { label: "Suspicious redemptions", hint: "Redemptions in a pattern a fan crowd doesn't make." },
  manual_entry: { label: "Manual-entry mismatch", hint: "A hand-entered figure disagrees with what was measured." },
};

export const SEVERITY: Record<AnomalySeverity, { label: string; tone: "danger" | "warn" | undefined }> = {
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warn" },
  low: { label: "Low", tone: undefined },
};

export const SUBJECT_LABEL: Record<Anomaly["subject"]["type"], string> = {
  campaign: "Campaign",
  athlete: "Athlete",
  reward: "Reward",
  metric_stream: "Metric stream",
};

export const OUTCOMES: { key: DispositionOutcome; label: string; effect: string }[] = [
  { key: "confirmed_issue", label: "Confirmed issue", effect: "It's real. The flag stays on the record and the figures it touches are marked." },
  { key: "false_positive", label: "False positive", effect: "Nothing was wrong. The figures stand; the note tells the rule's owner why." },
  { key: "excluded_from_reporting", label: "Exclude from reporting", effect: "The decision is recorded and the figure is flagged; leaving it out of sponsor reports follows in a later task." },
];

export const OUTCOME_LABEL: Record<DispositionOutcome, string> = Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label])) as Record<DispositionOutcome, string>;

export const ANOMALY_TABS: { key: AnomalyTab; label: string }[] = [
  { key: "open", label: "To review" },
  { key: "resolved", label: "Resolved" },
];

/** Who decided, and whether a person may still: SponsorX's own may be replaced; a person's is final. */
export const DECIDER = {
  automatic: { label: "SponsorX decided this automatically", hint: "A post can never count twice, so SponsorX excluded it the night it was seen. You may replace that decision; yours is then final." },
  person: { label: "Decided — final", hint: "A person's decision stands; the API refuses a second one." },
} as const;

export function anomalyTab(v: string | string[] | undefined): AnomalyTab {
  return (Array.isArray(v) ? v[0] : v) === "resolved" ? "resolved" : "open";
}

export function kindParam(v: string | string[] | undefined): AnomalyKind | "" {
  const s = (Array.isArray(v) ? v[0] : v) ?? "";
  return (ANOMALY_KINDS as string[]).includes(s) ? (s as AnomalyKind) : "";
}

/** The note bounds and the API's own 422 wording (anomaly-engine.ts AnomalyNoteError) — shown before the call, so the two never disagree. */
export const NOTE_MIN = MIN_REASON;
export const NOTE_MAX = 2000;
export const NOTE_RULE = `Every outcome needs a note of ${NOTE_MIN} to ${NOTE_MAX.toLocaleString("en-US")} characters.`;

/** The note rule: every outcome needs one. Null when the disposition may be sent. */
export function dispositionError(outcome: DispositionOutcome | "" | null, note: string): string | null {
  if (!outcome || !OUTCOMES.some((o) => o.key === outcome)) return "Choose an outcome.";
  const n = note.trim();
  if (!n) return `Add a note — ${NOTE_RULE.charAt(0).toLowerCase()}${NOTE_RULE.slice(1)}`;
  if (n.length < NOTE_MIN || n.length > NOTE_MAX) return NOTE_RULE;
  return null;
}

/**
 * Where a flag stands for the person reading it:
 * open — no decision yet; automatic — SponsorX's, replaceable; final — a person's.
 */
export type ReviewState = "open" | "automatic" | "final";
export function reviewState(a: Pick<Anomaly, "disposition">): ReviewState {
  if (!a.disposition) return "open";
  return a.disposition.automatic ? "automatic" : "final";
}

/** The API answers the epoch for `asOf` when the rules have never run for this tenant. */
export function rulesRan(asOf: string): boolean {
  const t = new Date(asOf).getTime();
  return Number.isFinite(t) && t > 0;
}

/** "duplicate.post · anomaly-rules@1.0.0" — the stamp already carries its "@", so it is not repeated. */
export function ruleLabel(rule: Anomaly["rule"]): string {
  return rule.version.includes("@") ? `${rule.id} · ${rule.version}` : `${rule.id}@${rule.version}`;
}

export const ANOMALY_EMPTY: Record<AnomalyTab, { title: string; hint: string }> = {
  open: { title: "Nothing flagged to review", hint: "The rules run nightly over the last 30 days; anything they flag waits here for a disposition." },
  resolved: { title: "No dispositions yet", hint: "Every flag decided — by a person, or by SponsorX for a duplicate post — is kept here with its outcome and note." },
};

export function emptyAnomalyDesk(): AnomalyDesk {
  return {
    asOf: new Date(0).toISOString(),
    counts: { open: 0, resolved: 0, openByKind: { spike: 0, duplicate: 0, bot: 0, redemption: 0, manual_entry: 0 } },
    anomalies: [],
    page: { page: 1, size: 12, total: 0, pages: 1 },
  };
}

/* ------------------------------------------------------------- sample */

const STAMP = "anomaly-rules@1.0.0";

/**
 * Dev-only `?demo=sample` preview and the tests' fixture, shaped like the
 * engine's own output: one flag per rule in SponsorX-Anomalies.md, the
 * duplicate post already excluded by SponsorX (automatic, replaceable) and
 * one flag a person decided (final). Not data.
 */
export const SAMPLE_ANOMALIES: AnomalyDesk = {
  asOf: "2026-10-13T05:30:00.000Z",
  counts: { open: 5, resolved: 2, openByKind: { spike: 1, duplicate: 0, bot: 1, redemption: 1, manual_entry: 2 } },
  anomalies: [
    {
      id: "anom-s-1", kind: "redemption", severity: "high",
      subject: { type: "reward", id: "anom-s-rw-1", name: "Free drip coffee, game day" },
      detectedAt: "2026-10-13T05:28:00.000Z", rule: { id: "redemption.burst", version: STAMP },
      evidence: [{ label: "Redemptions inside 5 minutes", value: "14" }, { label: "From", value: "2026-10-12 19:02:11 UTC" }],
      disposition: null,
    },
    {
      id: "anom-s-2", kind: "bot", severity: "high",
      subject: { type: "campaign", id: "anom-s-c-1", name: "Stride · Court Season" },
      detectedAt: "2026-10-13T05:28:00.000Z", rule: { id: "bot.clicks", version: STAMP },
      evidence: [{ label: "Clicks inside one minute", value: "126" }, { label: "From", value: "2026-10-12 03:14:00 UTC" }, { label: "Clicks that day", value: "131" }],
      disposition: null,
    },
    {
      id: "anom-s-3", kind: "spike", severity: "medium",
      subject: { type: "metric_stream", id: "anom-s-ms-1", name: "Court Season reel · VERIFIED_API" },
      detectedAt: "2026-10-12T05:30:00.000Z", rule: { id: "spike.views", version: STAMP },
      evidence: [{ label: "Day", value: "2026-10-11" }, { label: "Views that day", value: "38,400" }, { label: "Usual day (median of 9)", value: "6,200" }, { label: "Times usual", value: "6.2×" }],
      disposition: null,
    },
    {
      id: "anom-s-4", kind: "manual_entry", severity: "medium",
      subject: { type: "metric_stream", id: "anom-s-ms-2", name: "Fall Kickoff story · MANUAL" },
      detectedAt: "2026-10-12T05:30:00.000Z", rule: { id: "manual.over_measured", version: STAMP },
      evidence: [{ label: "Day", value: "2026-10-10" }, { label: "Entered by hand", value: "1,200" }, { label: "Measured by the API", value: "312" }, { label: "Times measured", value: "3.8×" }],
      disposition: null,
    },
    {
      id: "anom-s-5", kind: "manual_entry", severity: "low",
      subject: { type: "metric_stream", id: "anom-s-ms-3", name: "Fall Kickoff story · SELF_REPORTED" },
      detectedAt: "2026-10-11T05:30:00.000Z", rule: { id: "manual.engagement_over_views", version: STAMP },
      evidence: [{ label: "Day", value: "2026-10-09" }, { label: "Views", value: "90" }, { label: "Engagements", value: "140" }],
      disposition: null,
    },
    {
      id: "anom-s-6", kind: "duplicate", severity: "medium",
      subject: { type: "campaign", id: "anom-s-c-2", name: "Harbor Coffee · Fall Kickoff" },
      detectedAt: "2026-10-10T05:30:00.000Z", rule: { id: "duplicate.post", version: STAMP },
      evidence: [
        { label: "Post", value: "instagram.com/p/c7x9q" },
        { label: "Counted first on", value: "Kickoff reel (Harbor Coffee · Fall Kickoff)" },
        { label: "Counted again on", value: "Kickoff reel, week 2 (Harbor Coffee · Fall Kickoff)" },
      ],
      disposition: {
        outcome: "excluded_from_reporting",
        note: 'Excluded automatically by SponsorX: the same post is already counted on "Kickoff reel", and a post can never count twice.',
        by: "SponsorX (automatic)", at: "2026-10-10T05:30:00.000Z", automatic: true,
      },
    },
    {
      id: "anom-s-7", kind: "redemption", severity: "medium",
      subject: { type: "reward", id: "anom-s-rw-2", name: "20% off Stride footwear" },
      detectedAt: "2026-10-09T05:30:00.000Z", rule: { id: "redemption.repeat_fan", version: STAMP },
      evidence: [{ label: "Times one fan redeemed", value: "3" }, { label: "Their first redemption", value: "2026-10-07 18:40:12 UTC" }],
      disposition: {
        outcome: "false_positive", note: "Family plan — the venue confirms one card covered three tickets.",
        by: "dana@btg.invalid (Campaign manager)", at: "2026-10-09T14:02:00.000Z", automatic: false,
      },
    },
  ],
  page: { page: 1, size: 12, total: 7, pages: 1 },
};

/** The sample as the API would answer one tab and kind — preview only. */
export function sampleAnomalies(tab: AnomalyTab, kind: AnomalyKind | ""): AnomalyDesk {
  const rows = SAMPLE_ANOMALIES.anomalies.filter((a) => (tab === "open" ? !a.disposition : Boolean(a.disposition)) && (!kind || a.kind === kind));
  return { ...SAMPLE_ANOMALIES, anomalies: rows, page: { page: 1, size: 12, total: rows.length, pages: 1 } };
}
