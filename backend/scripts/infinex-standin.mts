/**
 * The stand-in world — 4S3-INT-02 (SponsorX-INFINEX-World-Contract.md: "a
 * script that calls SponsorX exactly as a world will").
 *
 *   SPONSORX_API_URL=https://… INFINEX_CREDENTIAL_ID=… INFINEX_CREDENTIAL_SECRET=sxs_… INFINEX_CLIENT_ID=… \
 *     npm run infinex:standin -w @sponsorx/backend -- --beats 3 --every 30
 *
 * Plays both halves, through the public API only, as the real ones will:
 *   the world's server — swaps its credential for a token, starts a session
 *     for one registered game build;
 *   the game — reads its world's manifest with the session's token, then
 *     sends heartbeats carrying the manifest version it shows.
 * No database access and no SponsorX code: what passes here passes for a
 * world built by someone else. `runStandin` is what the tests drive.
 */

export type StandinOptions = {
  baseUrl: string;
  credentialId: string;
  secret: string;
  clientId: string;
  beats?: number;
  everySeconds?: number;
  fps?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

export type StandinResult = { worldId: string; manifestVersion: number; placements: number; heartbeats: number };

async function call(baseUrl: string, method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/v1${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
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

  /* The game. */
  const game = String(session.accessToken);
  const manifest = await call(o.baseUrl, "GET", `/virtual/worlds/${encodeURIComponent(worldId)}/manifest`, game);
  const manifestVersion = Number(manifest.manifestVersion);
  const placements = Array.isArray(manifest.placements) ? manifest.placements.length : 0;
  log(`game: manifest v${manifestVersion}, ${placements} placement(s) live`);
  for (let i = 1; i <= beats; i++) {
    await call(o.baseUrl, "POST", "/infinex/heartbeat", game, { manifestVersion, fps: o.fps ?? 60, errorCount: 0 });
    log(`game: heartbeat ${i}/${beats}`);
    if (i < beats) await sleep((o.everySeconds ?? 30) * 1000);
  }
  return { worldId, manifestVersion, placements, heartbeats: beats };
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
    beats: Number(arg("beats") ?? 1), everySeconds: Number(arg("every") ?? 30),
  }).then(
    (r) => { console.log(`stand-in world: ${JSON.stringify(r)}`); },
    (e: unknown) => { console.error(`stand-in world failed: ${(e as Error).message}`); process.exit(1); },
  );
}
