/* --------------------------------------------------------------------------
   3S8-FE-01 · Data quality and anomaly console — the desk's contract and words.

   Reads  GET  /intelligence/anomalies?tab=open|resolved&kind&page&size → AnomalyDesk
   Writes POST /intelligence/anomalies/:id/disposition { outcome, note }
          → 200 { anomaly: Anomaly } (the record with its disposition)
   Engine "anomalies" (lib/intelligence.ts); waits on 3S8-DATA-01 (rules).
   BTG admins and campaign managers (lib/admin-access.ts) — a disposition
   changes what a sponsor's report counts.

   What the reviewer decides (Spec §15, §22): every flag is a rule's claim,
   not a fact, so each one is triaged to one of three outcomes and a note is
   required for every one — a "false positive" with no reason is as
   unauditable as an exclusion with none. A disposition is recorded once;
   the resolved tab is the record.

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
  note: string;
  /** The reviewer's display name. */
  by: string;
  at: string;
};

export type Anomaly = {
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** What was flagged: a campaign, an athlete, a reward, or one metric stream. */
  subject: { type: "campaign" | "athlete" | "reward" | "metric_stream"; id: string; name: string };
  detectedAt: string;
  /** The detection rule and its version (3S8-DATA-01) — provenance for the flag. */
  rule: { id: string; version: string };
  /** What the rule saw, as the rule states it. */
  evidence: { label: string; value: string }[];
  disposition: Disposition | null;
};

export type AnomalyDesk = {
  /** When detection last ran. */
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
  { key: "excluded_from_reporting", label: "Exclude from reporting", effect: "The flagged events are left out of sponsor reports from now on." },
];

export const OUTCOME_LABEL: Record<DispositionOutcome, string> = Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label])) as Record<DispositionOutcome, string>;

export const ANOMALY_TABS: { key: AnomalyTab; label: string }[] = [
  { key: "open", label: "To review" },
  { key: "resolved", label: "Resolved" },
];

export function anomalyTab(v: string | string[] | undefined): AnomalyTab {
  return (Array.isArray(v) ? v[0] : v) === "resolved" ? "resolved" : "open";
}

export function kindParam(v: string | string[] | undefined): AnomalyKind | "" {
  const s = (Array.isArray(v) ? v[0] : v) ?? "";
  return (ANOMALY_KINDS as string[]).includes(s) ? (s as AnomalyKind) : "";
}

/** The note rule: every outcome needs one. Null when the disposition may be sent. */
export function dispositionError(outcome: DispositionOutcome | "" | null, note: string): string | null {
  if (!outcome || !OUTCOMES.some((o) => o.key === outcome)) return "Choose an outcome.";
  const n = note.trim();
  if (!n) return "Add a note — every outcome is recorded with the reviewer's reason.";
  if (n.length < MIN_REASON) return `Say a little more (at least ${MIN_REASON} characters) so the next reviewer can follow it.`;
  if (n.length > 2000) return "Keep the note under 2,000 characters.";
  return null;
}

export function ruleLabel(rule: Anomaly["rule"]): string {
  return `${rule.id}@${rule.version}`;
}

export const ANOMALY_EMPTY: Record<AnomalyTab, { title: string; hint: string }> = {
  open: { title: "Nothing flagged to review", hint: "Detection rules run on every day's facts; anything they flag waits here for a disposition." },
  resolved: { title: "No dispositions yet", hint: "Every flag a reviewer resolves is kept here with its outcome and note." },
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

/**
 * Dev-only `?demo=sample` preview and the tests' fixture: one seeded case
 * per kind the acceptance test names (duplicate, bot, redemption) plus a
 * spike, a manual-entry mismatch and one resolved. Not data.
 */
export const SAMPLE_ANOMALIES: AnomalyDesk = {
  asOf: "2026-10-13T05:30:00Z",
  counts: { open: 5, resolved: 1, openByKind: { spike: 1, duplicate: 1, bot: 1, redemption: 1, manual_entry: 1 } },
  anomalies: [
    {
      id: "anom-s-1", kind: "duplicate", severity: "high",
      subject: { type: "reward", id: "anom-s-rw-1", name: "Harbor Coffee · free drip" },
      detectedAt: "2026-10-13T05:28:00Z", rule: { id: "dup-redemption-token", version: "1.0.0" },
      evidence: [{ label: "Token", value: "tok_7Q2…" }, { label: "Redemptions", value: "3 in 41 seconds" }, { label: "Single-use", value: "yes" }],
      disposition: null,
    },
    {
      id: "anom-s-2", kind: "bot", severity: "high",
      subject: { type: "campaign", id: "anom-s-c-1", name: "Stride · Court Season" },
      detectedAt: "2026-10-13T05:28:00Z", rule: { id: "bot-scan-cadence", version: "0.4.2" },
      evidence: [{ label: "Scans", value: "220 from one device" }, { label: "Interval", value: "every 2.0 s ± 0.05" }, { label: "User agent", value: "headless" }],
      disposition: null,
    },
    {
      id: "anom-s-3", kind: "redemption", severity: "medium",
      subject: { type: "reward", id: "anom-s-rw-2", name: "Stride · 20% off" },
      detectedAt: "2026-10-12T05:30:00Z", rule: { id: "redemption-geo-velocity", version: "1.1.0" },
      evidence: [{ label: "Redemptions", value: "14 at 3 venues" }, { label: "Venues apart", value: "380 miles" }, { label: "Window", value: "25 minutes" }],
      disposition: null,
    },
    {
      id: "anom-s-4", kind: "spike", severity: "medium",
      subject: { type: "metric_stream", id: "anom-s-ms-1", name: "Riley Carter · Instagram reach" },
      detectedAt: "2026-10-12T05:30:00Z", rule: { id: "stream-zscore", version: "2.0.1" },
      evidence: [{ label: "Reported", value: "184,000" }, { label: "30-day median", value: "6,200" }, { label: "z-score", value: "11.4" }],
      disposition: null,
    },
    {
      id: "anom-s-5", kind: "manual_entry", severity: "low",
      subject: { type: "campaign", id: "anom-s-c-2", name: "Harbor Coffee · Fall Kickoff" },
      detectedAt: "2026-10-11T05:30:00Z", rule: { id: "manual-vs-measured", version: "1.0.0" },
      evidence: [{ label: "Entered", value: "1,200 attendees" }, { label: "Measured scans", value: "312" }],
      disposition: null,
    },
    {
      id: "anom-s-6", kind: "duplicate", severity: "low",
      subject: { type: "metric_stream", id: "anom-s-ms-2", name: "Jordan Lee · TikTok views" },
      detectedAt: "2026-10-09T05:30:00Z", rule: { id: "dup-platform-event", version: "1.0.0" },
      evidence: [{ label: "Event", value: "post 88231 counted twice" }],
      disposition: { outcome: "excluded_from_reporting", note: "Platform webhook retried; second copy left out.", by: "Dana Brooks", at: "2026-10-09T14:02:00Z" },
    },
  ],
  page: { page: 1, size: 12, total: 5, pages: 1 },
};

/** The sample as the API would answer one tab and kind — preview only. */
export function sampleAnomalies(tab: AnomalyTab, kind: AnomalyKind | ""): AnomalyDesk {
  const rows = SAMPLE_ANOMALIES.anomalies.filter((a) => (tab === "open" ? !a.disposition : Boolean(a.disposition)) && (!kind || a.kind === kind));
  return { ...SAMPLE_ANOMALIES, anomalies: rows, page: { page: 1, size: 12, total: rows.length, pages: 1 } };
}
