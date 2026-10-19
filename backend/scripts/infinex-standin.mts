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
 *     the telemetry limits it would send under. Heartbeats carry the manifest
 *     version it shows.
 * No database access and no SponsorX code: what passes here passes for a
 * world built by someone else. `runStandin` is what the tests drive.
 */

export type StandinOptions = {
  baseUrl: string;
  credentialId: string;
  secret: string;
  clientId: string;
  beats?: number;
  fps?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

export type StandinResult = {
  worldId: string; manifestVersion: number; placements: number; heartbeats: number; manifestReads: number;
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
  return { worldId, manifestVersion, placements, heartbeats: beats, manifestReads, config };
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
