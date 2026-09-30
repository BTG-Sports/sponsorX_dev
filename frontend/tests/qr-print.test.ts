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

  it("the panel padding adds two modules to the PNG's two, for codes up to version 6 (41 modules)", () => {
    for (const f of Object.values(FORMATS)) {
      const moduleInches = f.qr / (41 + 4); // 41 modules + the PNG's 2-module margin each side
      expect(quietPad(f.qr) / moduleInches).toBeGreaterThanOrEqual(2);
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
