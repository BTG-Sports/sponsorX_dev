/* P9-BE-26 — which pieces the reader may show, and how their public copies are made. No database. */
import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { mayShow, type Piece } from "../src/domain/edition-pictures-rules";
import { PLAYABLE_VIDEO, VIDEO_TOOL_MISSING, VideoToolMissingError, videoToolArgs, webCopyOfPdfAd, webCopyOfPhoto, webCopyOfVideo } from "../src/lib/web-copy";
import { textPdf } from "./support/document-fixtures";

const now = new Date("2026-12-01T12:00:00Z");
const right = (over: Partial<Piece["rights"][number]> = {}) => ({ grantorKind: "BTG", mayPublishDigital: true, startsAt: new Date("2026-01-01"), endsAt: null, ...over });
const piece = (over: Partial<Piece> = {}): Piece => ({
  kind: "PHOTO", r2Key: "k", fileType: "image/jpeg", adSlotId: null, slotSold: false, reviewState: null, artworkContentType: null,
  rights: [right()], maker: null, ...over,
});

describe("P9-BE-26 · what the reader may show", () => {
  it("a photo or video with a digital right in force, once the edition is published", () => {
    expect(mayShow(piece(), "PUBLISHED_DIGITAL", now)).toBe(true);
    expect(mayShow(piece({ fileType: "video/mp4" }), "PRINTED", now)).toBe(true);
    for (const state of ["PLANNING", "SELLING", "CLOSED", "IN_PRODUCTION", "CANCELLED"]) expect(mayShow(piece(), state, now)).toBe(false);
  });

  it("nothing without a file, nothing a reader can't show, nothing without a right in force", () => {
    expect(mayShow(piece({ r2Key: null }), "PUBLISHED_DIGITAL", now)).toBe(false);
    for (const t of ["application/pdf", "application/x-indesign", "image/svg+xml", "text/html", null]) expect(mayShow(piece({ fileType: t }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(piece({ rights: [] }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(piece({ rights: [right({ mayPublishDigital: false })] }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(piece({ rights: [right({ endsAt: new Date("2026-11-30") })] }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(piece({ rights: [right({ startsAt: new Date("2026-12-02") })] }), "PUBLISHED_DIGITAL", now)).toBe(false);
  });

  it("a minor's piece needs their guardian's right; an adult's own is enough", () => {
    const minor = { birthDate: null, ageBand: "16_17" };
    expect(mayShow(piece({ maker: minor, rights: [right({ grantorKind: "STUDENT" })] }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(piece({ maker: minor, rights: [right({ grantorKind: "GUARDIAN" })] }), "PUBLISHED_DIGITAL", now)).toBe(true);
    expect(mayShow(piece({ maker: { birthDate: new Date("2012-05-01"), ageBand: null }, rights: [right({ grantorKind: "BTG" })] }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(piece({ maker: { birthDate: null, ageBand: "18_PLUS" }, rights: [right({ grantorKind: "STUDENT" })] }), "PUBLISHED_DIGITAL", now)).toBe(true);
  });

  it("an ad: its slot's approved artwork, still sold — and a PDF ad too", () => {
    const ad = (over: Partial<Piece> = {}) => piece({ kind: "AD_CREATIVE", fileType: null, adSlotId: "s", slotSold: true, reviewState: "APPROVED", artworkContentType: "image/png", rights: [right({ grantorKind: "THIRD_PARTY" })], ...over });
    expect(mayShow(ad(), "PUBLISHED_DIGITAL", now)).toBe(true);
    expect(mayShow(ad({ artworkContentType: "application/pdf" }), "PUBLISHED_DIGITAL", now)).toBe(true);
    expect(mayShow(ad({ reviewState: "SPONSOR_REVIEW" }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(ad({ slotSold: false }), "PUBLISHED_DIGITAL", now)).toBe(false);
    expect(mayShow(ad({ rights: [] }), "PUBLISHED_DIGITAL", now)).toBe(false);
  });
});

describe("P9-BE-26 · the public copy, location data removed", () => {
  it("a photo is saved again with no EXIF (no GPS), the right way up", async () => {
    const withExif = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#c33" } })
      .jpeg().withMetadata({ orientation: 6 }).withExifMerge({ IFD0: { Artist: "Somebody" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "39/1 0/1 0/1" } }).toBuffer();
    expect((await sharp(withExif).metadata())).toMatchObject({ exif: expect.anything(), orientation: 6 });
    const copy = await webCopyOfPhoto(withExif);
    if ("problem" in copy) throw new Error(copy.problem);
    expect(copy).toMatchObject({ type: "image/jpeg", ext: "jpg" });
    const meta = await sharp(copy.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    /* Orientation 6 (rotate 90°) was applied, so the stored picture is upright: 20 × 40. */
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it("PNG stays PNG, anything else becomes WebP; an unreadable photo is a problem in words", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: "#0000" } }).png().toBuffer();
    expect(await webCopyOfPhoto(png)).toMatchObject({ type: "image/png" });
    const tiff = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).tiff().toBuffer();
    expect(await webCopyOfPhoto(tiff)).toMatchObject({ type: "image/webp", ext: "webp" });
    expect(await webCopyOfPhoto(Buffer.from("not a photo"))).toMatchObject({ problem: expect.stringMatching(/couldn't be opened/) });
  });

  it("a PDF ad becomes a picture of its first page", async () => {
    const copy = await webCopyOfPdfAd(textPdf(["JOE'S DELI", "Half off subs"]));
    if ("problem" in copy) throw new Error(copy.problem);
    expect(copy.type).toBe("image/png");
    expect((await sharp(copy.body as Buffer).metadata()).width).toBeGreaterThan(100);
    expect(await webCopyOfPdfAd(Buffer.from("%PDF-broken"))).toMatchObject({ problem: expect.stringMatching(/couldn't be drawn/) });
  });

  it("a video is remuxed keeping only picture and sound, with no metadata", () => {
    const args = videoToolArgs("https://signed/in", "/tmp/out.mp4", "mp4");
    expect(args.join(" ")).toContain("-map 0:v -map 0:a? -map_metadata -1 -map_chapters -1 -c copy");
    expect(args).toContain("+faststart");
    expect(videoToolArgs("i", "o", "webm")).not.toContain("+faststart");
    expect(PLAYABLE_VIDEO["video/quicktime"]).toMatchObject({ type: "video/mp4" });
  });

  it("without the video tool there is no copy, and a format a browser can't play is a problem in words", async () => {
    expect(await webCopyOfVideo("video/mp4", "u", async () => { throw new VideoToolMissingError(); })).toEqual({ problem: VIDEO_TOOL_MISSING });
    expect(await webCopyOfVideo("video/x-msvideo", "u", async () => {})).toMatchObject({ problem: expect.stringMatching(/MP4 or WebM/) });
    expect(await webCopyOfVideo("video/mp4", "u", async () => { throw new Error("boom"); })).toMatchObject({ problem: expect.stringMatching(/couldn't be prepared/) });
  });
});
