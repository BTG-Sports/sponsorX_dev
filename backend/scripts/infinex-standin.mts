/**
 * The stand-in world — 4S3-INT-02 (SponsorX-INFINEX-World-Contract.md: "a
 * script that calls SponsorX exactly as a world will").
 *
 *   SPONSORX_API_URL=https://… INFINEX_CREDENTIAL_ID=… INFINEX_CREDENTIAL_SECRET=sxs_… INFINEX_CLIENT_ID=… \
 *     npm run infinex:standin -w @sponsorx/backend -- --beats 3
 *
 * Plays both halves, through the public API only, as the real ones will:
 *   the world's server — swaps its credential for a token, starts a session
 *     for one registered game build;
 *   the game — reads its config first (4S3-INT-03) and honours it: a
 *     heartbeat every `heartbeat.everySeconds`, the manifest read again once
 *     `manifest.pollSeconds` has passed (with If-None-Match), and it reports
 *     the telemetry limits it sends under. Heartbeats carry the manifest
 *     version it shows. When its session has a signing key (4S4-BE-01), it
 *     sends a signed telemetry batch — a render and a visibility event for
 *     every live placement — split to the build's maxBatch.
 * No database access and no SponsorX code: what passes here passes for a
 * world built by someone else. `runStandin` is what the tests drive.
 */

import { createHmac, randomUUID } from "node:crypto";

export type StandinOptions = {
  baseUrl: string;
  credentialId: string;
  secret: string;
  clientId: string;
  beats?: number;
  fps?: number;
  /** Send telemetry when the session can sign (default true). */
  telemetry?: boolean;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

export type TelemetrySummary = { batches: number; sent: number; accepted: number; duplicate: number; quarantined: number; rejected: number };
export type StandinResult = {
  worldId: string; manifestVersion: number; placements: number; heartbeats: number; manifestReads: number;
  telemetry: TelemetrySummary | null;
  /** The batches as sent — a caller may resend them (they are idempotent by eventId). */
  sentBatches: { events: Record<string, unknown>[] }[];
  config: { heartbeatSeconds: number; pollSeconds: number; maxBatch: number; maxBytes: number; configVersion: number };
};

async function call(baseUrl: string, method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 304) return { notModified: true } as Record<string, unknown>;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  const etag = res.headers.get("etag");
  return etag ? { ...json, etag } : json;
}

/** POST a body signed with a game session's key, exactly as a world must (§5.3). */
export async function signedPost(baseUrl: string, path: string, session: { accessToken: string; keyId: string; signingKey: string }, body: unknown) {
  const raw = JSON.stringify(body);
  const t = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac("sha256", session.signingKey).update(`${t}.`).update(raw).digest("hex");
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1${path}`, {
    method: "POST", body: raw,
    headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json", "sponsorx-key-id": session.keyId, "sponsorx-signature": `t=${t},v1=${v1}` },
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

export async function runStandin(o: StandinOptions): Promise<StandinResult> {
  const log = o.log ?? ((line: string) => console.log(line));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const beats = o.beats ?? 1;

  /* The world's server. */
  const server = await call(o.baseUrl, "POST", "/infinex/token", null, { credentialId: o.credentialId, secret: o.secret });
  log(`server: token until ${String(server.expiresAt)}`);
  const session = await call(o.baseUrl, "POST", `/infinex/clients/${encodeURIComponent(o.clientId)}/sessions`, String(server.accessToken));
  const worldId = String(session.worldId);
  log(`server: game session for client ${o.clientId}, world ${worldId}, until ${String(session.expiresAt)}${session.signingKey ? "" : " (no signing key: INFINEX_SIGNING_SECRET is not set)"}`);

  /* The game: its config first, then everything it does follows it. */
  const game = String(session.accessToken);
  const cfg = await call(o.baseUrl, "GET", "/infinex/config", game) as {
    heartbeat: { everySeconds: number }; manifest: { pollSeconds: number }; telemetry: { maxBatch: number; maxBytes: number }; configVersion: number;
  };
  const config = { heartbeatSeconds: cfg.heartbeat.everySeconds, pollSeconds: cfg.manifest.pollSeconds, maxBatch: cfg.telemetry.maxBatch, maxBytes: cfg.telemetry.maxBytes, configVersion: cfg.configVersion };
  log(`game: config v${config.configVersion} — heartbeat every ${config.heartbeatSeconds}s, manifest every ${config.pollSeconds}s, telemetry batches ≤ ${config.maxBatch} events / ${config.maxBytes} bytes`);
  const manifestPath = `/virtual/worlds/${encodeURIComponent(worldId)}/manifest`;
  let manifest = await call(o.baseUrl, "GET", manifestPath, game);
  let manifestReads = 1;
  let manifestVersion = Number(manifest.manifestVersion);
  let placements = Array.isArray(manifest.placements) ? manifest.placements.length : 0;
  log(`game: manifest v${manifestVersion}, ${placements} placement(s) live`);
  /* Telemetry: what it saw, signed, within its build's limits. */
  let telemetry: TelemetrySummary | null = null;
  const sentBatches: { events: Record<string, unknown>[] }[] = [];
  if (o.telemetry !== false && session.signingKey && placements) {
    const now = new Date().toISOString();
    const sessionRef = `ses_${randomUUID().slice(0, 8)}`;
    const events = (manifest.placements as { placementId: string; deploymentId: string; asset: { assetId: string; version: number } }[]).flatMap((p) => [
      { eventId: randomUUID(), schemaVersion: 1, eventType: "placement.render", occurredAt: now, subject: { worldId, placementId: p.placementId, deploymentId: p.deploymentId }, session: { sessionRef }, data: { assetId: p.asset.assetId, assetVersion: p.asset.version } },
      { eventId: randomUUID(), schemaVersion: 1, eventType: "placement.visible", occurredAt: now, subject: { worldId, placementId: p.placementId, deploymentId: p.deploymentId }, session: { sessionRef }, data: { visiblePct: 80, dwellMs: 2500 } },
    ]);
    telemetry = { batches: 0, sent: events.length, accepted: 0, duplicate: 0, quarantined: 0, rejected: 0 };
    for (let i = 0; i < events.length; i += config.maxBatch) {
      const batch = { events: events.slice(i, i + config.maxBatch) };
      const r = await signedPost(o.baseUrl, "/infinex/telemetry", { accessToken: game, keyId: String(session.keyId), signingKey: String(session.signingKey) }, batch);
      if (r.status !== 207) throw new Error(`POST /infinex/telemetry → ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`);
      sentBatches.push(batch);
      telemetry.batches += 1;
      for (const k of ["accepted", "duplicate", "quarantined", "rejected"] as const) telemetry[k] += Number(r.json[k] ?? 0);
    }
    log(`game: telemetry — ${telemetry.sent} event(s) in ${telemetry.batches} signed batch(es): ${telemetry.accepted} accepted, ${telemetry.duplicate} duplicate, ${telemetry.rejected} rejected`);
  } else if (o.telemetry !== false) {
    log(`game: no telemetry sent (${session.signingKey ? "nothing live to report" : "the session has no signing key"})`);
  }
  let sinceManifest = 0;
  for (let i = 1; i <= beats; i++) {
    await call(o.baseUrl, "POST", "/infinex/heartbeat", game, { manifestVersion, fps: o.fps ?? 60, errorCount: 0 });
    log(`game: heartbeat ${i}/${beats}`);
    if (i === beats) break;
    await sleep(config.heartbeatSeconds * 1000);
    sinceManifest += config.heartbeatSeconds;
    if (sinceManifest >= config.pollSeconds) {
      sinceManifest = 0;
      const next = await call(o.baseUrl, "GET", manifestPath, game, undefined, manifest.etag ? { "if-none-match": String(manifest.etag) } : {});
      manifestReads += 1;
      if (!next.notModified) {
        manifest = next;
        manifestVersion = Number(next.manifestVersion);
        placements = Array.isArray(next.placements) ? next.placements.length : 0;
      }
      log(`game: manifest ${next.notModified ? "unchanged" : `now v${manifestVersion}`}`);
    }
  }
  return { worldId, manifestVersion, placements, heartbeats: beats, manifestReads, config, telemetry, sentBatches };
}

/* The command line. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const need = (name: string) => {
    const v = process.env[name];
    if (!v) { console.error(`Set ${name}.`); process.exit(2); }
    return v;
  };
  runStandin({
    baseUrl: need("SPONSORX_API_URL"), credentialId: need("INFINEX_CREDENTIAL_ID"), secret: need("INFINEX_CREDENTIAL_SECRET"), clientId: need("INFINEX_CLIENT_ID"),
    beats: Number(arg("beats") ?? 1),
  }).then(
    (r) => { console.log(`stand-in world: ${JSON.stringify(r)}`); },
    (e: unknown) => { console.error(`stand-in world failed: ${(e as Error).message}`); process.exit(1); },
  );
}
