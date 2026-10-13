/* --------------------------------------------------------------------------
   Phase 3 · Intelligence — the screens' shared vocabulary (3S2-FE-01 …
   3S8-FE-02, decided 2026-10-13: "FE only, honest empty states").

   Every Phase 3 screen reads an engine that the backend chain is still
   building (rcfworks: warehouse → features → CPM, matching, forecasting,
   make-goods, attribution, scenarios, anomalies, model registry). Until an
   engine's route is mounted, its screen says so — by name, with the tasks it
   waits on — and shows no number at all. A placeholder figure would be a
   statistic with no retrieval path (the "stats must be retrievable" rule,
   Blueprint §22). When the route lands, the same page renders it; nothing on
   the frontend has to change but the contract, if it moved.

   The contracts each screen expects are written down in
   documentation/SponsorX-Phase3-Screen-Contracts.md — the proposal the
   engines are built against.

   Pure: no fetch here (server/engine.ts reads), so client islands and tests
   import it freely.
   -------------------------------------------------------------------------- */

export type EngineKey =
  | "pricing"
  | "matching"
  | "forecast"
  | "makegood"
  | "attribution"
  | "sponsorHub"
  | "propertyHub"
  | "scenarios"
  | "anomalies"
  | "models";

export type Engine = {
  key: EngineKey;
  /** The engine's name as staff say it. */
  name: string;
  /** The screen task this engine feeds. */
  screen: string;
  /** The backend / data tasks that must land before the screen lights up. */
  waitsOn: string[];
  /** The route the screen reads (relative to /api/v1). */
  endpoint: string;
  /** What will appear here, in words — never a number. */
  shows: string[];
  /** One plain sentence for a sponsor or property: no task ids, no routes. */
  plain: string;
};

export const ENGINES: Record<EngineKey, Engine> = {
  pricing: {
    key: "pricing",
    name: "Dynamic CPM engine",
    screen: "3S2-FE-01",
    waitsOn: ["3S2-BE-01 feature snapshots", "3S2-BE-02 CPM engine v1", "3S2-BE-03 recommendation and override records"],
    endpoint: "GET /intelligence/pricing",
    shows: [
      "Recommended CPM next to the current rate, per inventory item",
      "Every factor that moved the price, and by how much",
      "Model version and confidence on every recommendation",
      "The historical range the price sits in",
      "An override that needs a reason and never edits the recommendation",
    ],
    plain: "Rate recommendations appear here once SponsorX has enough sales history to price from.",
  },
  matching: {
    key: "matching",
    name: "Match scoring service",
    screen: "3S3-FE-01",
    waitsOn: ["3S3-BE-01 sponsor brief model", "3S3-BE-02 match scoring", "3S3-BE-03 eligibility filter"],
    endpoint: "GET /intelligence/briefs/:briefId/matches",
    shows: [
      "Athletes, properties and inventory ranked against a brief",
      "A match score with the reasons behind it, in words a salesperson can repeat",
      "Only what is available and free of category conflicts",
      "Saved shortlists per brief",
    ],
    plain: "Recommended matches appear here once matching is switched on.",
  },
  forecast: {
    key: "forecast",
    name: "Delivery forecast service",
    screen: "3S4-FE-01",
    waitsOn: ["3S4-DATA-01 daily pacing job", "3S4-BE-01 delivery forecast", "3S4-BE-02 risk thresholds and alerts"],
    endpoint: "GET /intelligence/forecasts",
    shows: [
      "Projected final delivery for every active campaign",
      "The probability of hitting the guarantee",
      "Pacing: delivered so far against time elapsed",
      "Risk factors and the recommended action",
      "Every past forecast, so the model can be judged",
    ],
    plain: "Delivery forecasts appear here once pacing is measured nightly.",
  },
  makegood: {
    key: "makegood",
    name: "Make-good recommendation engine",
    screen: "3S5-FE-01",
    waitsOn: ["3S4-BE-01 delivery forecast", "3S5-BE-01 make-good engine", "3S5-BE-02 approval workflow"],
    endpoint: "GET /intelligence/make-goods",
    shows: [
      "Each campaign's shortfall against what was sold",
      "Substitute inventory that is available and conflict-free",
      "An equivalency score and the cost impact of each option",
      "Approval by a manager, recorded and audited",
    ],
    plain: "Make-good options appear here when a campaign falls short.",
  },
  attribution: {
    key: "attribution",
    name: "Attribution framework",
    screen: "3S6-FE-01",
    waitsOn: ["3S0-PMO-01 attribution language", "3S6-BE-01 adapters", "3S6-BE-02 attribution event model", "3S6-BE-03 matching", "3S6-BE-04 reconciliation queue"],
    endpoint: "GET /intelligence/attribution",
    shows: [
      "Verified redemptions, verified transactions, modelled attribution and estimated media value — never blended",
      "Source, method, window and confidence on every attributed event",
      "Unmatched and ambiguous events, kept in view",
    ],
    plain: "Attributed sales appear here once a commerce partner is connected.",
  },
  sponsorHub: {
    key: "sponsorHub",
    name: "Sponsor intelligence",
    screen: "3S7-FE-01",
    waitsOn: ["3S1-DATA-02 daily campaign facts (done)", "a sponsor-scoped read of the warehouse (no task yet)"],
    endpoint: "GET /intelligence/sponsor",
    shows: [
      "What worked across all your campaigns",
      "Your best-performing formats and partners",
      "Audience segments your campaigns reached",
      "Renewal recommendations",
    ],
    plain: "Insights across all your campaigns appear here once enough of them have run.",
  },
  propertyHub: {
    key: "propertyHub",
    name: "Property intelligence",
    screen: "3S7-FE-02",
    waitsOn: ["3S2-BE-02 CPM engine v1", "a property-scoped read of the warehouse (no task yet)"],
    endpoint: "GET /intelligence/property",
    shows: [
      "Rate recommendations for your inventory",
      "Revenue opportunity you are leaving open",
      "Sell-through by inventory type",
      "Which sponsor categories fit you best",
      "An inventory quality score",
    ],
    plain: "Rate and opportunity insights appear here once SponsorX has enough sales history to price from.",
  },
  scenarios: {
    key: "scenarios",
    name: "Scenario planning service",
    screen: "3S7-FE-03",
    waitsOn: ["3S4-BE-01 delivery forecast", "3S7-BE-01 scenario planning"],
    endpoint: "GET /intelligence/scenarios",
    shows: [
      "Budget, CPM, audience and inventory mix, adjusted live",
      "Expected delivery and revenue for each scenario",
      "Two scenarios side by side",
    ],
    plain: "Scenario planning appears here once forecasting is live.",
  },
  anomalies: {
    key: "anomalies",
    name: "Anomaly detection",
    screen: "3S8-FE-01",
    waitsOn: ["3S1-DATA-02 daily campaign facts (done)", "3S8-DATA-01 anomaly detection rules"],
    endpoint: "GET /intelligence/anomalies",
    shows: [
      "Improbable spikes and flagged metric streams",
      "Duplicate events and bot-like behaviour",
      "Suspicious redemption patterns",
      "Manual-entry inconsistencies",
      "The reviewer's disposition on each one",
    ],
    plain: "Data-quality flags appear here once anomaly detection runs.",
  },
  models: {
    key: "models",
    name: "Model registry",
    screen: "3S8-FE-02",
    waitsOn: ["3S0-PMO-02 model governance policy", "3S8-BE-01 model registry and activation"],
    endpoint: "GET /intelligence/models",
    shows: [
      "Every model and rule set, with its versions",
      "Activate, roll back and compare — no deploy",
      "Pricing factors, thresholds and benchmarks",
      "Rollouts and per-tenant feature flags",
    ],
    plain: "Model settings appear here once the registry is live.",
  },
};

/** What a screen got from its engine: the data, or "not built yet". */
export type EngineRead<T> = { state: "live"; data: T } | { state: "pending"; engine: Engine };

/**
 * Is this response "the route is not mounted" rather than an answer?
 *
 * The API's catch-all (backend/src/app.ts) answers an unknown route with
 * exactly `404 { error: { code: "not_found" } }` — no message. A mounted
 * route that cannot find a record says why (a message), and an engine that
 * is mounted but deliberately off may answer 501. Anything else is a real
 * failure and must surface as one — never as "coming soon".
 */
export function routeMissing(status: number, body: unknown): boolean {
  if (status === 501) return true;
  if (status !== 404) return false;
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return err?.code === "not_found" && err.message === undefined;
}

/* ------------------------------------------------------------- provenance */

/** Every model output carries these (acceptance criterion 1, Spec §22). */
export type ModelStamp = {
  /** e.g. "cpm-rules@1.2.0" */
  modelVersion: string;
  /** 0..1 */
  confidence: number;
  computedAt: string;
};

export type ConfidenceBand = "high" | "medium" | "low";

/** Bands for a 0..1 confidence: ≥ 0.75 high, ≥ 0.5 medium, below that low. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}

export function confidenceLabel(confidence: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  return `${pct}% · ${confidenceBand(confidence)} confidence`;
}

/**
 * The four attribution classes (3S0-PMO-01, Spec §17.4): four different
 * claims that must never be blended into one figure in a sponsor report.
 */
export type AttributionClass = "VERIFIED_REDEMPTION" | "VERIFIED_TRANSACTION" | "MODELLED" | "ESTIMATED_MEDIA_VALUE";

export const ATTRIBUTION_CLASSES: Record<AttributionClass, { label: string; claim: string; tone: "verified" | "modelled" | "estimated" }> = {
  VERIFIED_REDEMPTION: {
    label: "Verified redemption",
    claim: "A fan redeemed the reward — SponsorX recorded it.",
    tone: "verified",
  },
  VERIFIED_TRANSACTION: {
    label: "Verified transaction",
    claim: "A partner's order matched exactly, by token, order id or click id.",
    tone: "verified",
  },
  MODELLED: {
    label: "Modelled attribution",
    claim: "A probabilistic match. Shown with its method and confidence — never as verified.",
    tone: "modelled",
  },
  ESTIMATED_MEDIA_VALUE: {
    label: "Estimated media value",
    claim: "What the exposure would have cost to buy. An estimate, not revenue.",
    tone: "estimated",
  },
};

export const ATTRIBUTION_ORDER: AttributionClass[] = ["VERIFIED_REDEMPTION", "VERIFIED_TRANSACTION", "MODELLED", "ESTIMATED_MEDIA_VALUE"];

/* ------------------------------------------------------------- formatting */

/** $1,234 from cents — whole dollars; Intelligence figures are estimates. */
export function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** $12.40 — a CPM keeps its cents. */
export function cpm(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** "+12%" / "−8%" — a factor's push on the price, signed. */
export function signedPct(fraction: number): string {
  const v = Math.round(fraction * 100);
  return v > 0 ? `+${v}%` : v < 0 ? `−${Math.abs(v)}%` : "0%";
}
