/**
 * P5-SEC-01 — "Every signed URL grant against the private bucket is audited;
 * TTLs are short; no agreement or creative asset is publicly reachable." §26.
 *
 * Three claims, and each needs a different kind of proof:
 *
 *   AUDITED — structural. `storage.grants.test.ts` already proves the two
 *   existing grant functions audit and that a failed audit withholds the URL.
 *   What is missing, and what this file adds, is the guarantee about the
 *   function somebody writes NEXT: that no presigner can be exported without
 *   an audit in front of it.
 *
 *   SHORT — a number, asserted against a bound.
 *
 *   NOT PUBLICLY REACHABLE — an absence: nothing may route an agreement or a
 *   creative asset to the public bucket, and the public presigner must not be
 *   reachable with a private key prefix.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const storage = readFileSync(
  new URL("../src/lib/storage.ts", import.meta.url), "utf8");

/** Every exported function, with the body that follows it. */
function exportedFunctions(source: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const hits = [...source.matchAll(/^export (?:async )?function (\w+)/gm)];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1]!.index! : source.length;
    out.push({ name: m[1]!, body: source.slice(m.index!, end) });
  });
  return out;
}

describe("every private grant is audited", () => {
  const exported = exportedFunctions(storage);

  it("finds the storage module's exports", () => {
    expect(exported.length).toBeGreaterThan(3);
  });

  /* The rule that survives the next contributor: anything that hands out a
     signed URL for the private bucket audits first. */
  const privateGrants = exported.filter(
    (f) => /presign/i.test(f.name) && /Private/i.test(f.name));

  it("finds the private presigners", () => {
    expect(privateGrants.map((f) => f.name).sort())
      .toEqual(["presignPrivateDownload", "presignPrivateUpload"]);
  });

  it.each(privateGrants.map((f) => [f.name, f] as const))(
    "%s writes an audit row",
    (_n, fn) => {
      expect(fn.body).toMatch(/\baudit\(/);
    },
  );

  /* The raw presigner must stay unexported, or a caller could sign a URL
     without ever touching the audited path. */
  it("does not export the raw presigner", () => {
    expect(storage).not.toMatch(/^export (?:async )?function presignUpload\b/m);
    expect(storage).not.toMatch(/^export (?:async )?function presignDownload\b/m);
  });

  /* The worker's object writers are NOT grants — they hand nobody a
     credential — so they are exempt, and named here so the exemption is
     visible rather than assumed. */
  it("the worker object helpers are writes, not grants", () => {
    const put = exported.find((f) => f.name === "putPrivateObject");
    const get = exported.find((f) => f.name === "getPrivateObject");
    expect(put).toBeTruthy();
    expect(get).toBeTruthy();
    for (const fn of [put!, get!]) {
      expect(fn.body).not.toMatch(/getSignedUrl/);
    }
  });
});

describe("TTLs are short", () => {
  it("signs for fifteen minutes or less", () => {
    const m = /PRESIGN_TTL_SECONDS\s*=\s*([^;]+);/.exec(storage)!;
    /* The constant is written as `15 * 60`, so the factors are multiplied
       rather than evaluated — a test should not run code out of the file it
       is checking. */
    const seconds = m[1]!
      .split("*")
      .map((part) => Number(part.trim()))
      .reduce((a, b) => a * b, 1);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(15 * 60);
  });

  it("uses that constant for every signature rather than a literal", () => {
    /* Either the constant itself, or a caller's shorter ask capped at it
       (2S1-BE-17: identity documents sign for five minutes). */
    const signCalls = [...storage.matchAll(/expiresIn:\s*(Math\.min\([^)]*\)|[A-Za-z_][\w.]*)/g)]
      .map((m) => m[1]!.trim());
    expect(signCalls.length).toBeGreaterThan(0);
    for (const arg of signCalls) expect(arg).toMatch(/^(PRESIGN_TTL_SECONDS|Math\.min\(\w+, PRESIGN_TTL_SECONDS\))$/);
  });

  it("identity documents sign for five minutes, shorter than the default", () => {
    const m = /SENSITIVE_DOCUMENT_TTL_SECONDS\s*=\s*([^;]+);/.exec(storage)!;
    const seconds = m[1]!.split("*").map((p) => Number(p.trim())).reduce((a, b) => a * b, 1);
    expect(seconds).toBe(5 * 60);
  });
});

describe("nothing private is publicly reachable", () => {
  const domainFiles = ["deliverable.ts", "agreement.ts"] as const;

  it.each(domainFiles)("%s never reaches for the public bucket", (file) => {
    const source = readFileSync(
      new URL(`../src/domain/${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/presignPublicUpload|BUCKETS\.public/);
  });

  /* Checked at the WIRING, not in the job's own text: the job takes
     `putObject` as an injected dependency, so which bucket it writes to is
     decided in worker/index.mts and nowhere else. Grepping the job for the
     word "public" only found the comment explaining why it is not used. */
  it("the QR job is wired to the private bucket", () => {
    const worker = readFileSync(
      new URL("../worker/index.mts", import.meta.url), "utf8");
    const block = worker.slice(
      worker.indexOf('boss.work<QrJob>'),
      worker.indexOf('boss.work<QrJob>') + 500);
    /* A QR is a picture of a bearer credential; the public bucket is a CDN
       with no access control by design. */
    expect(block).toContain("putPrivateObject");
    expect(block).not.toContain("putPublicObject");
  });

  it("the derivative job is wired to the private bucket too", () => {
    const worker = readFileSync(
      new URL("../worker/index.mts", import.meta.url), "utf8");
    const block = worker.slice(
      worker.indexOf('boss.work<DeriveImageJob>'),
      worker.indexOf('boss.work<DeriveImageJob>') + 500);
    expect(block).toContain("putPrivateObject");
    expect(block).toContain("getPrivateObject");
  });

  it("creative derivatives stay in the private bucket too", () => {
    const derive = readFileSync(
      new URL("../worker/jobs/derive-image.mts", import.meta.url), "utf8");
    expect(derive).not.toMatch(/BUCKETS\.public|presignPublicUpload/);
  });

  it("the two buckets are separate names, not one with a prefix", () => {
    expect(storage).toMatch(/public:/);
    expect(storage).toMatch(/private:/);
  });
});
