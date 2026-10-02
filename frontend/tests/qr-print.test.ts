import { describe, expect, it } from "vitest";

import { FORMATS, fallbackAddress, formatOf, quietPad, themeOf } from "../src/lib/qr-print";

/* P6-ART-01 — the printed code must scan: every format prints its QR at or
   above the design's minimum, with a quiet zone of at least four modules. */
describe("printable QR formats", () => {
  it("each format prints the QR at or above its minimum size", () => {
    for (const [name, f] of Object.entries(FORMATS)) expect(f.qr, name).toBeGreaterThanOrEqual(f.minQr);
    expect(FORMATS.poster).toMatchObject({ w: 11, h: 17, qr: 4 });
    expect(FORMATS.tent).toMatchObject({ w: 4, h: 12, qr: 1.75 });
    expect(FORMATS.sticker).toMatchObject({ w: 3, h: 3, qr: 1.25 });
  });

  /* Quiet zone, in modules, for a code N modules wide: the PNG's own 2-module
     margin plus the panel's padding (the PNG is N + 4 modules across). */
  const quietModules = (qrInches: number, n: number) => 2 + quietPad(qrInches) / (qrInches / (n + 4));

  it("the quiet zone is ≥ 4 modules from version 3 (29 modules) up — and only from there", () => {
    for (const f of Object.values(FORMATS)) {
      for (let version = 3; version <= 10; version++) {
        expect(quietModules(f.qr, 17 + 4 * version), `${f.label} v${version}`).toBeGreaterThanOrEqual(4);
      }
      // The boundary, stated: version 2 would fall short, which is why the
      // next test proves a real reward URL never encodes that small.
      expect(quietModules(f.qr, 25)).toBeLessThan(4);
    }
  });

  it("a real reward URL — even on an absurdly short host — encodes at version 3 or larger, so ≥ 4 modules", async () => {
    const QRCode = await import("qrcode");
    const token = "A".repeat(27); // randomBytes(20) as base64url, as reward.ts mints it
    for (const host of ["https://sponsorx.net", "http://localhost:3000", "http://a.co"]) {
      // Same settings as worker/jobs/generate-qr.mts.
      const n = QRCode.create(`${host}/r/${token}`, { errorCorrectionLevel: "M" }).modules.size;
      expect(n, host).toBeGreaterThanOrEqual(29);
      for (const f of Object.values(FORMATS)) expect(quietModules(f.qr, n), `${host} ${f.label}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("unknown query values fall back to the poster, light", () => {
    expect(formatOf("banner")).toBe("poster");
    expect(themeOf(undefined)).toBe("light");
    expect(formatOf("tent")).toBe("tent");
  });

  it("the fallback address is the host plus the fan path", () => {
    expect(fallbackAddress("https://sponsorx.net/", "Ab12Cd")).toBe("sponsorx.net/r/Ab12Cd");
  });
});
