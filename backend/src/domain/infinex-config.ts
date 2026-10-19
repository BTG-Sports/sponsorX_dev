/**
 * The INFINEX client configuration — 4S3-INT-03
 * (documentation/SponsorX-INFINEX-API-and-Event-Spec.md §4.2; World Contract §6:
 * "Settings come from SponsorX").
 *
 *   DEFAULTS are reviewed code, versioned (CONFIG_DEFAULTS_VERSION), so every
 *   world starts from the same baseline. BTG may override one build's values,
 *   only inside LIMITS — a setting outside them is refused with the reason, so
 *   no override can turn a game into a firehose or switch its heartbeat off.
 *   A game reads its own build's effective config (defaults + override) at
 *   `GET /infinex/config`, with an ETag, and acts on it without a release.
 *
 *   The heartbeat interval also sets when a quiet build counts as missing:
 *   MISSING_AFTER_BEATS intervals (infinex-clients.ts). The telemetry limits
 *   are what the intake (4S4-BE-01) will enforce, read from this same place.
 */
import { createHash } from "node:crypto";

export const CONFIG_DEFAULTS_VERSION = "infinex-config@1.0.0";
/** A build is missing once this many heartbeat intervals pass with none. */
export const MISSING_AFTER_BEATS = 5;

export type InfinexConfig = {
  schemaVersions: { supported: number[]; preferred: number };
  telemetry: { maxBatch: number; maxBytes: number; flushSeconds: number; sampleRates: Record<string, number> };
  manifest: { pollSeconds: number };
  heartbeat: { everySeconds: number };
  flags: Record<string, boolean>;
};

export const CONFIG_DEFAULTS: InfinexConfig = {
  schemaVersions: { supported: [1], preferred: 1 },
  telemetry: { maxBatch: 500, maxBytes: 1_048_576, flushSeconds: 10, sampleRates: { "placement.view": 1, "placement.interaction": 1 } },
  manifest: { pollSeconds: 60 },
  heartbeat: { everySeconds: 30 },
  flags: { telemetry: true, activations: false },
};

/** What an override may set, and within what bounds. */
export const LIMITS = {
  maxBatch: { min: 1, max: 1000 },
  maxBytes: { min: 1024, max: 1_048_576 },
  flushSeconds: { min: 1, max: 300 },
  pollSeconds: { min: 15, max: 900 },
  heartbeatSeconds: { min: 10, max: 300 },
  sampleRate: { min: 0, max: 1 },
} as const;

export type ConfigOverride = {
  telemetry?: { maxBatch?: number; maxBytes?: number; flushSeconds?: number; sampleRates?: Record<string, number> };
  manifest?: { pollSeconds?: number };
  heartbeat?: { everySeconds?: number };
  flags?: Record<string, boolean>;
};

const inRange = (problems: string[], label: string, v: unknown, r: { min: number; max: number }, integer = true) => {
  if (v === undefined) return;
  if (typeof v !== "number" || !Number.isFinite(v) || (integer && !Number.isInteger(v)) || v < r.min || v > r.max) {
    problems.push(`${label} must be ${integer ? "a whole number " : ""}from ${r.min} to ${r.max}.`);
  }
};

/** Every reason an override is refused; empty when it is within the limits. */
export function overrideProblems(o: ConfigOverride): string[] {
  const p: string[] = [];
  inRange(p, "telemetry.maxBatch", o.telemetry?.maxBatch, LIMITS.maxBatch);
  inRange(p, "telemetry.maxBytes", o.telemetry?.maxBytes, LIMITS.maxBytes);
  inRange(p, "telemetry.flushSeconds", o.telemetry?.flushSeconds, LIMITS.flushSeconds);
  inRange(p, "manifest.pollSeconds", o.manifest?.pollSeconds, LIMITS.pollSeconds);
  inRange(p, "heartbeat.everySeconds", o.heartbeat?.everySeconds, LIMITS.heartbeatSeconds);
  for (const [event, rate] of Object.entries(o.telemetry?.sampleRates ?? {})) {
    if (!(event in CONFIG_DEFAULTS.telemetry.sampleRates)) p.push(`${event} is not an event type with a sample rate.`);
    else inRange(p, `telemetry.sampleRates.${event}`, rate, LIMITS.sampleRate, false);
  }
  for (const [flag, on] of Object.entries(o.flags ?? {})) {
    if (!(flag in CONFIG_DEFAULTS.flags)) p.push(`${flag} is not a flag.`);
    else if (typeof on !== "boolean") p.push(`flags.${flag} is true or false.`);
  }
  return p;
}

/** A build's effective config: the defaults, with its override laid over them. */
export function effectiveConfig(override: ConfigOverride | null | undefined): InfinexConfig {
  const o = override ?? {};
  return {
    schemaVersions: { ...CONFIG_DEFAULTS.schemaVersions, supported: [...CONFIG_DEFAULTS.schemaVersions.supported] },
    telemetry: {
      maxBatch: o.telemetry?.maxBatch ?? CONFIG_DEFAULTS.telemetry.maxBatch,
      maxBytes: o.telemetry?.maxBytes ?? CONFIG_DEFAULTS.telemetry.maxBytes,
      flushSeconds: o.telemetry?.flushSeconds ?? CONFIG_DEFAULTS.telemetry.flushSeconds,
      sampleRates: { ...CONFIG_DEFAULTS.telemetry.sampleRates, ...(o.telemetry?.sampleRates ?? {}) },
    },
    manifest: { pollSeconds: o.manifest?.pollSeconds ?? CONFIG_DEFAULTS.manifest.pollSeconds },
    heartbeat: { everySeconds: o.heartbeat?.everySeconds ?? CONFIG_DEFAULTS.heartbeat.everySeconds },
    flags: { ...CONFIG_DEFAULTS.flags, ...(o.flags ?? {}) },
  };
}

/** When a quiet build counts as missing, from its own heartbeat interval. */
export const missingAfterSeconds = (override: ConfigOverride | null | undefined) => effectiveConfig(override).heartbeat.everySeconds * MISSING_AFTER_BEATS;

/** The ETag of what a game would be told — changes with the defaults' version or the build's config. */
export const configEtag = (config: InfinexConfig, configVersion: number) =>
  `"${createHash("sha256").update(JSON.stringify({ v: CONFIG_DEFAULTS_VERSION, configVersion, config })).digest("hex").slice(0, 32)}"`;
