/* P9-BE-25 — the any-format rules (lib/file-formats.ts), no database. */
import { describe, expect, it } from "vitest";

import { ANY_FILE_MAX_BYTES, anyFileType, downloadDisposition, isPicture, opensInPlace, safeFileName } from "../src/lib/file-formats";

describe("P9-BE-25 · any format", () => {
  it("takes any media type as declared, lowercased and without parameters", () => {
    expect(anyFileType("Video/MP4; codecs=avc1")).toBe("video/mp4");
    expect(anyFileType("application/x-indesign")).toBe("application/x-indesign");
    expect(anyFileType("image/vnd.adobe.photoshop")).toBe("image/vnd.adobe.photoshop");
    expect(anyFileType("application/zip")).toBe("application/zip");
  });

  it("names a file the browser couldn't as octet-stream, and refuses what isn't a type", () => {
    expect(anyFileType("")).toBe("application/octet-stream");
    expect(anyFileType(null)).toBe("application/octet-stream");
    expect(anyFileType("not a type")).toBeNull();
    expect(anyFileType("video")).toBeNull();
    expect(anyFileType("text/html\r\nX-Evil: 1")).toBeNull();
  });

  it("opens only images (not SVG), video, audio and PDF in place", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "audio/mpeg", "application/pdf"]) expect(opensInPlace(t)).toBe(true);
    for (const t of ["text/html", "image/svg+xml", "application/octet-stream", "application/x-indesign", "application/javascript", null]) expect(opensInPlace(t)).toBe(false);
  });

  it("calls only images and video pictures — what the reader can show", () => {
    expect(isPicture("image/png")).toBe(true);
    expect(isPicture("video/mp4")).toBe(true);
    expect(isPicture("image/svg+xml")).toBe(false);
    expect(isPicture("application/pdf")).toBe(false);
  });

  it("downloads everything else, by a safe name", () => {
    expect(downloadDisposition("image/png", "x.png")).toBeNull();
    expect(downloadDisposition("application/x-indesign", "Cover v3.indd")).toBe('attachment; filename="Cover v3.indd"');
    expect(downloadDisposition("text/html", null)).toBe("attachment");
    expect(downloadDisposition("image/svg+xml", 'a"b.svg')).toBe('attachment; filename="a-b.svg"');
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\Cover v3.indd")).toBe("Cover v3.indd");
    expect(safeFileName("   ")).toBeNull();
  });

  it("fits 2 GB in a 32-bit column", () => {
    expect(ANY_FILE_MAX_BYTES).toBe(2_000_000_000);
    expect(ANY_FILE_MAX_BYTES).toBeLessThanOrEqual(2 ** 31 - 1);
  });
});
