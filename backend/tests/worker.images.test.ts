/**
 * P6-BE-06 — QR into R2 — and P5-BE-07 — image derivatives.
 *
 * Both jobs really encode: `qrcode` and `sharp` run for these tests, because
 * "a QR PNG is generated" and "320/640/1280 webp derivatives" are claims
 * about bytes and a mocked encoder would prove neither. Only the database and
 * the bucket are stubbed.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  fanUrlFor, handleGenerateQr, qrKeyFor, renderQrPng,
} from "../worker/jobs/generate-qr.mts";
import {
  DERIVATIVE_WIDTHS, derivativeKeyFor, deriveWidths, handleDeriveImage, srcSetFor,
} from "../worker/jobs/derive-image.mts";

let rows: Record<string, unknown>[] = [];
let queries: { sql: string; params: unknown[] }[] = [];
let stored: { key: string; contentType: string; bytes: number }[] = [];

const db = () =>
  ({
    query: (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return Promise.resolve({ rows: sql.trim().startsWith("SELECT") ? rows : [] });
    },
  }) as never;

const putObject = (key: string, body: Buffer, contentType: string) => {
  stored.push({ key, contentType, bytes: body.length });
  return Promise.resolve();
};

beforeEach(() => {
  rows = [];
  queries = [];
  stored = [];
});

describe("P6-BE-06 · a QR PNG per token, in the private bucket", () => {
  it("really encodes a PNG", async () => {
    const png = await renderQrPng("https://sponsorx.net/r/abc");
    /* PNG magic number — this is an image, not a promise of one. */
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(png.length).toBeGreaterThan(100);
  });

  it("points the QR at the fan page for that token", () => {
    expect(fanUrlFor("https://sponsorx.net", "tok-1")).toBe(
      "https://sponsorx.net/r/tok-1",
    );
  });

  it("tolerates a trailing slash on APP_URL", () => {
    expect(fanUrlFor("https://sponsorx.net/", "t")).toBe("https://sponsorx.net/r/t");
  });

  it("escapes a token that would otherwise break the path", () => {
    expect(fanUrlFor("https://x.test", "a/b?c")).toBe("https://x.test/r/a%2Fb%3Fc");
  });

  it("keys the object under the tenant", () => {
    expect(qrKeyFor("t1", "tok_1")).toBe("t/t1/reward-qr/tok_1.png");
  });

  it("stores it as image/png and records the key on the token", async () => {
    rows = [{ id: "tok_1", tenantId: "t1", token: "abc", qrKey: null }];
    const out = await handleGenerateQr(db(), { tokenId: "tok_1" }, {
      appUrl: "https://sponsorx.net",
      putObject,
    });

    expect(out).toMatchObject({ generated: true, key: "t/t1/reward-qr/tok_1.png" });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.contentType).toBe("image/png");

    const update = queries.find((q) => q.sql.includes("UPDATE"));
    expect(update!.params).toEqual(["tok_1", "t/t1/reward-qr/tok_1.png"]);
  });

  /* Jobs retry. A retry that generated a second image would orphan the
     first in a bucket nobody lists. */
  it("does nothing for a token that already has one", async () => {
    rows = [{ id: "tok_1", tenantId: "t1", token: "abc", qrKey: "t/t1/reward-qr/tok_1.png" }];
    const out = await handleGenerateQr(db(), { tokenId: "tok_1" }, {
      appUrl: "https://sponsorx.net", putObject,
    });
    expect(out).toEqual({ generated: false, reason: "already generated" });
    expect(stored).toEqual([]);
  });

  it("is silent about a token that no longer exists", async () => {
    rows = [];
    const out = await handleGenerateQr(db(), { tokenId: "gone" }, {
      appUrl: "https://sponsorx.net", putObject,
    });
    expect(out).toEqual({ generated: false, reason: "token no longer exists" });
  });
});

describe("P5-BE-07 · 320/640/1280 webp derivatives", () => {
  /* A real 1600px PNG, encoded by sharp so the resize has something to do. */
  async function sourceImage(width = 1600): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: { width, height: Math.round(width * 0.5), channels: 3, background: { r: 10, g: 120, b: 200 } },
    }).png().toBuffer();
  }

  it("produces exactly the three widths, as webp", async () => {
    const derived = await deriveWidths(await sourceImage());
    expect(derived.map((d) => d.width)).toEqual([...DERIVATIVE_WIDTHS]);

    const sharp = (await import("sharp")).default;
    for (const d of derived) {
      const meta = await sharp(d.body).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(d.width);
    }
  });

  /* A 200px logo asked for a 1280 derivative would otherwise be upscaled
     into a blurry file larger than the original, which the page would then
     download in preference to the sharp one. */
  it("never enlarges a small original", async () => {
    const derived = await deriveWidths(await sourceImage(200));
    const sharp = (await import("sharp")).default;
    for (const d of derived) {
      expect((await sharp(d.body).metadata()).width).toBeLessThanOrEqual(200);
    }
  });

  it("keys derivatives beside the original, never over it", () => {
    const key = "t/t1/deliverable/dlv_1/abc";
    expect(derivativeKeyFor(key, 640)).toBe("t/t1/deliverable/dlv_1/abc@640.webp");
    expect(derivativeKeyFor(key, 640)).not.toBe(key);
  });

  it("stores all three and records the keys on the asset", async () => {
    rows = [{ id: "ast_1", r2Key: "t/t1/deliverable/dlv_1/abc", derivatives: null }];
    const out = await handleDeriveImage(db(), { assetId: "ast_1" }, {
      getObject: () => sourceImage(),
      putObject,
    });

    expect(out).toMatchObject({ derived: true });
    expect(stored).toHaveLength(3);
    expect(stored.every((s) => s.contentType === "image/webp")).toBe(true);
    expect(stored.map((s) => s.key)).toEqual([
      "t/t1/deliverable/dlv_1/abc@320.webp",
      "t/t1/deliverable/dlv_1/abc@640.webp",
      "t/t1/deliverable/dlv_1/abc@1280.webp",
    ]);

    const update = queries.find((q) => q.sql.includes("UPDATE"));
    expect(JSON.parse(update!.params[1] as string)).toMatchObject({
      "320": "t/t1/deliverable/dlv_1/abc@320.webp",
    });
  });

  it("does nothing for an asset already derived", async () => {
    rows = [{ id: "ast_1", r2Key: "k", derivatives: { "320": "k@320.webp" } }];
    const out = await handleDeriveImage(db(), { assetId: "ast_1" }, {
      getObject: () => sourceImage(), putObject,
    });
    expect(out).toEqual({ derived: false, reason: "already derived" });
    expect(stored).toEqual([]);
  });

  /* Athlete video lands in the same table. sharp cannot read it, and that is
     not a failure worth retrying forever. */
  it("skips a file that is not a still image", async () => {
    rows = [{ id: "ast_1", r2Key: "k", derivatives: null }];
    const out = await handleDeriveImage(db(), { assetId: "ast_1" }, {
      getObject: () => Promise.resolve(Buffer.from("not an image at all")),
      putObject,
    });
    expect(out).toEqual({ derived: false, reason: "not a still image" });
    expect(stored).toEqual([]);
  });

  it("builds the srcSet a plain <img> needs — §11, no next/image", () => {
    expect(
      srcSetFor({ "320": "a.webp", "640": "b.webp", "1280": "c.webp" }),
    ).toBe("a.webp 320w, b.webp 640w, c.webp 1280w");
  });

  it("omits a width that was never produced", () => {
    expect(srcSetFor({ "320": "a.webp" })).toBe("a.webp 320w");
  });
});
