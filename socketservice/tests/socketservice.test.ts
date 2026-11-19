import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";

import { createSocketService, SOCKET_PATH } from "../src/server.ts";
import { checkPass, PASS_AUDIENCE, PassError, publicKeyFrom } from "../src/pass.ts";

/* --------------------------------------------------------------------------
   2S4-BE-18 — the live socket service, over real sockets.
   -------------------------------------------------------------------------- */

const ORIGIN = "https://web.example";
const SECRET = "s".repeat(40);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");

function pass(sub: string, ch: string, o: { key?: KeyObject; life?: number; aud?: string; iat?: number; jti?: string } = {}) {
  const iat = o.iat ?? Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ aud: o.aud ?? PASS_AUDIENCE, sub, ch, iat, exp: iat + (o.life ?? 60), jti: o.jti ?? randomBytes(12).toString("base64url") })).toString("base64url");
  const sig = sign(null, Buffer.from(`v1.${body}`), o.key ?? privateKey).toString("base64url");
  return `v1.${body}.${sig}`;
}

describe("the pass", () => {
  it("accepts a good one and refuses a forged, foreign, stale, long-lived or user-channel one", () => {
    expect(checkPass(pass("u1", "chat:c1:sponsor"), publicKey).ch).toBe("chat:c1:sponsor");
    const bad = [
      pass("u1", "chat:c1:sponsor", { key: other.privateKey }),
      pass("u1", "chat:c1:sponsor", { aud: "api" }),
      pass("u1", "chat:c1:sponsor", { iat: Math.floor(Date.now() / 1000) - 200 }),
      pass("u1", "chat:c1:sponsor", { life: 3600 }),
      pass("u1", "user:u2"),
      pass("u1", "chat:c1;drop"),
      "v1.x.y", "", "not-a-pass",
    ];
    for (const p of bad) expect(() => checkPass(p, publicKey), p.slice(0, 30)).toThrow(PassError);
  });

  it("reads the public key from a PEM or a one-line base64 PEM, and refuses any other key type", () => {
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(publicKeyFrom(pem).asymmetricKeyType).toBe("ed25519");
    expect(publicKeyFrom(Buffer.from(pem).toString("base64")).asymmetricKeyType).toBe("ed25519");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(() => publicKeyFrom(rsa)).toThrow();
  });
});

describe("the service", () => {
  const svc = createSocketService({ passKey: publicKey, publishSecret: SECRET, allowedOrigins: [ORIGIN], sessionMs: 60_000 });
  let base = "";
  const open: Socket[] = [];

  const client = (auth: Record<string, unknown>, origin = ORIGIN) => {
    const s = connect(base, { path: SOCKET_PATH, transports: ["websocket"], auth, extraHeaders: { origin }, reconnection: false, forceNew: true });
    open.push(s);
    return s;
  };
  const connected = (s: Socket) => new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });
  const refused = (s: Socket) => new Promise<string>((resolve) => {
    s.once("connect", () => resolve("connected"));
    s.once("connect_error", (e) => resolve(e.message));
  });
  const next = <T>(s: Socket, event: string, ms = 1500) => new Promise<T | "timeout">((resolve) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    s.once(event, (d: T) => { clearTimeout(t); resolve(d); });
  });
  /* node:http, not fetch: fetch won't let a caller set the Host header, and the publish door is decided by it. */
  const publish = (notices: unknown, opts: { host?: string; secret?: string } = {}) =>
    new Promise<{ status: number }>((resolve, reject) => {
      const u = new URL(`${base}/internal/publish`);
      const body = JSON.stringify({ notices });
      const req = request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), authorization: `Bearer ${opts.secret ?? SECRET}`, host: opts.host ?? `localhost:${u.port}` },
      }, (res) => { res.resume(); res.on("end", () => resolve({ status: res.statusCode ?? 0 })); });
      req.on("error", reject);
      req.end(body);
    });

  beforeAll(async () => {
    await svc.listen(0);
    base = `http://127.0.0.1:${(svc.http.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    open.forEach((s) => s.close());
    await svc.close();
  });

  it("answers its health check", async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it("refuses a connection with no pass, a forged pass, a used pass, or from another website", async () => {
    expect(await refused(client({}))).toBe("unauthorized");
    expect(await refused(client({ pass: pass("u1", "chat:c1:sponsor", { key: other.privateKey }) }))).toBe("unauthorized");
    const once = pass("u1", "chat:c1:sponsor");
    const first = client({ pass: once });
    await connected(first);
    expect(await refused(client({ pass: once }))).toBe("unauthorized");
    expect(await refused(client({ pass: pass("u1", "chat:c1:sponsor") }, "https://evil.example"))).not.toBe("connected");
  });

  it("delivers a notice to its channel only, with ids and states only", async () => {
    const sponsor = client({ pass: pass("u-s", "chat:c2:sponsor") });
    const seller = client({ pass: pass("u-a", "chat:c2:seller") });
    const outsider = client({ pass: pass("u-x", "chat:c9:sponsor") });
    await Promise.all([connected(sponsor), connected(seller), connected(outsider)]);
    const gotSponsor = next(sponsor, "chat:changed");
    const gotSeller = next(seller, "chat:changed", 400);
    const gotOutsider = next(outsider, "chat:changed", 400);
    const r = await publish([{ channels: ["chat:c2:sponsor"], event: "chat:changed", data: { chatId: "c2", orderId: "o2", what: "held" } }]);
    expect(r.status).toBe(202);
    expect(await gotSponsor).toEqual({ chatId: "c2", orderId: "o2", what: "held" });
    expect(await gotSeller).toBe("timeout");
    expect(await gotOutsider).toBe("timeout");
  });

  it("adds channels one pass at a time, only for the same person, and never twice with one pass", async () => {
    const s = client({ pass: pass("u-j", "inbox:sponsor:sp1") });
    await connected(s);
    const join = (p: string) => new Promise<{ ok: boolean }>((resolve) => s.emit("join", { pass: p }, resolve));
    const p = pass("u-j", "chat:c3:sponsor");
    expect(await join(p)).toEqual({ ok: true, channel: "chat:c3:sponsor" });
    expect((await join(p)).ok).toBe(false);
    expect((await join(pass("someone-else", "chat:c4:sponsor"))).ok).toBe(false);
    const got = next(s, "chat:form");
    await publish([{ channels: ["chat:c3:sponsor"], event: "chat:form", data: { chatId: "c3" } }]);
    expect(await got).toEqual({ chatId: "c3" });
  });

  it("a browser can't publish: its events go nowhere", async () => {
    const a = client({ pass: pass("u-p1", "chat:c5:sponsor") });
    const b = client({ pass: pass("u-p2", "chat:c5:seller") });
    await Promise.all([connected(a), connected(b)]);
    const got = next(b, "chat:changed", 400);
    a.emit("chat:changed", { chatId: "c5" });
    expect(await got).toBe("timeout");
  });

  it("chat:closed takes everyone off that chat's channels; access:ended closes the person's connections", async () => {
    const s = client({ pass: pass("u-c", "chat:c6:seller") });
    await connected(s);
    const closed = next(s, "chat:closed");
    await publish([{ channels: ["chat:c6:seller"], event: "chat:closed", data: { chatId: "c6", why: "CALLED_OFF" } }]);
    expect(await closed).toMatchObject({ why: "CALLED_OFF" });
    const after = next(s, "chat:changed", 400);
    await publish([{ channels: ["chat:c6:seller"], event: "chat:changed", data: { chatId: "c6" } }]);
    expect(await after).toBe("timeout");

    const gone = new Promise<string>((resolve) => s.once("disconnect", (reason) => resolve(reason)));
    await publish([{ channels: ["user:u-c"], event: "access:ended", data: {} }]);
    expect(await gone).toBe("io server disconnect");
  });

  it("the publish door: only on the private host, only with the secret, only well-formed notices", async () => {
    expect((await publish([{ channels: ["chat:c7:btg"], event: "chat:changed" }], { host: "socketservice.sponsorx.net" })).status).toBe(404);
    expect((await publish([{ channels: ["chat:c7:btg"], event: "chat:changed" }], { secret: "wrong".repeat(8) })).status).toBe(401);
    expect((await publish([{ channels: ["chat:c7;x"], event: "chat:changed" }])).status).toBe(400);
    expect((await publish([{ channels: ["chat:c7:btg"], event: "<script>" }])).status).toBe(400);
  });

  it("asks for a fresh pass when the session time is up", async () => {
    const short = createSocketService({ passKey: publicKey, publishSecret: SECRET, allowedOrigins: [ORIGIN], sessionMs: 150 });
    await short.listen(0);
    const s = connect(`http://127.0.0.1:${(short.http.address() as AddressInfo).port}`, {
      path: SOCKET_PATH, transports: ["websocket"], auth: { pass: pass("u-r", "chat:c8:sponsor") }, extraHeaders: { origin: ORIGIN }, reconnection: false, forceNew: true,
    });
    const renew = next(s, "session:renew");
    expect(await renew).toEqual({});
    s.close();
    await short.close();
  });
});
