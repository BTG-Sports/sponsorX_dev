import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P9-FE-14 — photos, video, ads and the cover in the public reader
   (/next/[school]/[edition], P9-BE-26 / -27).

   GET /public/editions/:school/:id answers `contents[].picture`
   ({url, kind: "image" | "video"} or null), `sponsors[].ad` ({url} or null)
   and `cover` ({url} or null) — the shapes of the backend's own fixtures
   (backend/tests/p9-be-26-edition-pictures.test.ts). Null is normal: a piece
   with no picture must still read well, exactly as it did before.
   -------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));
vi.mock("@/app/(public)/next/[school]/[edition]/actions", () => ({ recordArticleOpenAction: vi.fn() }));

import { coverUrl, issueLine, mediaUrl, pieceMedia, readerSponsors, type PublicEdition } from "@/lib/edition-reader";

const { LiveReader } = await import("@/app/(public)/next/[school]/[edition]/live-reader");

const CDN = "https://cdn.sponsorx.test";

const edition = (o: Partial<PublicEdition> = {}): PublicEdition => ({
  id: "ed1",
  label: "Fall 2026",
  state: "PUBLISHED_DIGITAL",
  publishTarget: "2026-11-01T00:00:00.000Z",
  printDate: null,
  publication: "The Northside Current",
  school: { slug: "northside", name: "Northside High", city: "Arlington", stateCode: "VA" },
  cover: { url: `${CDN}/edition-web/t1/ed1/cover.webp` },
  contents: [
    { id: "a1", kind: "ARTICLE", title: "Season preview", byline: "Maya R.", text: "The Lions open at home.", picture: { url: `${CDN}/edition-web/t1/a1.webp`, kind: "image" } },
    { id: "a2", kind: "VIDEO", title: "Game highlights", byline: null, text: null, picture: { url: `${CDN}/edition-web/t1/a2.mp4`, kind: "video" } },
    { id: "a3", kind: "INTERVIEW", title: "Coach on the record", byline: "Dev P.", text: "We asked the coach.", picture: null },
  ],
  sponsors: [
    { id: "s2", slotCode: "P04-QTR-A", kind: "QUARTER", sponsor: "Corner Deli", ad: null },
    { id: "s1", slotCode: "BACK", kind: "BACK_COVER", sponsor: "Arlington Auto", ad: { url: `${CDN}/edition-web/t1/s1.webp` } },
    { id: "s3", slotCode: "P02-HALF", kind: "HALF", sponsor: "Bright Dental", ad: { url: `${CDN}/edition-web/t1/s3.webp` } },
  ],
  ...o,
});

const html = (e: PublicEdition) => renderToStaticMarkup(createElement(LiveReader, { e }));

describe("P9-FE-14 · what the reader may show", () => {
  it("maps a piece's picture to an image or a video, and null to nothing", () => {
    const e = edition();
    expect(pieceMedia(e.contents[0]!)).toEqual({ kind: "image", url: `${CDN}/edition-web/t1/a1.webp`, alt: "Season preview, by Maya R." });
    expect(pieceMedia(e.contents[1]!)).toEqual({ kind: "video", url: `${CDN}/edition-web/t1/a2.mp4`, alt: "Video: Game highlights" });
    expect(pieceMedia(e.contents[2]!)).toBeNull();
    /* an API before P9-BE-26 sends no `picture` at all */
    expect(pieceMedia({ id: "x", kind: "ARTICLE", title: "Old", byline: null })).toBeNull();
  });

  it("only ever puts an http(s) address in a src", () => {
    expect(mediaUrl(`${CDN}/a.webp`)).toBe(`${CDN}/a.webp`);
    expect(mediaUrl("http://localhost:9000/public/a.webp")).toBe("http://localhost:9000/public/a.webp");
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "", "not a url", null, undefined, 7]) expect(mediaUrl(bad), String(bad)).toBeNull();
    expect(pieceMedia({ id: "x", kind: "PHOTO", title: "t", byline: null, picture: { url: "javascript:alert(1)", kind: "image" } })).toBeNull();
  });

  it("orders the sponsors by position and gives each its ad, or null", () => {
    const rows = readerSponsors(edition());
    expect(rows.map((s) => [s.sponsor, s.position, s.ad !== null, s.wide])).toEqual([
      ["Arlington Auto", "Back cover", true, true],
      ["Bright Dental", "Half page", true, false],
      ["Corner Deli", "Quarter page", false, false],
    ]);
    /* a full-size position with no ad stays a name card, not a wide empty box */
    expect(readerSponsors({ sponsors: [{ id: "s", slotCode: "P", kind: "PRESENTING", sponsor: "X", ad: null }] })[0]).toMatchObject({ ad: null, wide: false });
    /* an API before P9-BE-26 sends no `ad` */
    expect(readerSponsors({ sponsors: [{ id: "s", slotCode: "P", kind: "FULL", sponsor: "X" }] })[0]!.ad).toBeNull();
  });

  it("reads the cover, and counts what the issue holds", () => {
    expect(coverUrl(edition())).toBe(`${CDN}/edition-web/t1/ed1/cover.webp`);
    expect(coverUrl({ cover: null })).toBeNull();
    expect(coverUrl({})).toBeNull();
    expect(issueLine(edition())).toBe("3 pieces · 2 with pictures or video");
    expect(issueLine({ contents: [{ id: "a", kind: "ARTICLE", title: "t", byline: null }] })).toBe("1 piece");
    expect(issueLine({ contents: [] })).toBeNull();
  });
});

describe("P9-FE-14 · the page", () => {
  it("shows the cover, each piece's photo or video with its article, and each sponsor's ad in its position", () => {
    const out = html(edition());
    expect(out).toContain(`<img src="${CDN}/edition-web/t1/ed1/cover.webp" alt="The cover of The Northside Current, Fall 2026"`);
    expect(out).toContain(`<img src="${CDN}/edition-web/t1/a1.webp" alt="Season preview, by Maya R."`);
    /* a video plays in place, with controls, and not full-screen on a phone */
    expect(out).toMatch(new RegExp(`<video src="${CDN}/edition-web/t1/a2.mp4" controls="" playsInline=""`, "i"));
    expect(out).toContain(`<img src="${CDN}/edition-web/t1/s1.webp" alt="Advertisement from Arlington Auto"`);
    expect(out).toContain("Sponsored · Back cover");
    expect(out).toContain("Sponsored · Half page");
    /* the back cover comes before the half page */
    expect(out.indexOf("Arlington Auto")).toBeLessThan(out.indexOf("Bright Dental"));
    /* the picture sits between its piece's title and its text button */
    const piece = out.slice(out.indexOf("Season preview"), out.indexOf("Game highlights"));
    expect(piece.indexOf("<img")).toBeGreaterThan(-1);
    expect(piece.indexOf("<img")).toBeLessThan(piece.indexOf(">Read<"));
  });

  it("a piece with no picture still reads well, and a sponsor with no ad keeps its name card", () => {
    const out = html(edition());
    const plain = out.slice(out.indexOf("Coach on the record"), out.indexOf("Made possible by"));
    expect(plain).not.toContain("<img");
    expect(plain).not.toContain("<video");
    expect(plain).not.toContain("<figure");
    expect(plain).toContain("By Dev P.");
    expect(plain).toContain(">Read<");
    const deli = out.slice(out.indexOf("Corner Deli") - 200, out.indexOf("Corner Deli") + 200);
    expect(deli).toContain("Quarter page");
    expect(deli).not.toContain("<img");
  });

  it("an edition with no pictures at all is the reader as it was", () => {
    const e = edition({
      cover: null,
      contents: [{ id: "a3", kind: "ARTICLE", title: "Words only", byline: "Dev P.", text: "Just text." }],
      sponsors: [{ id: "s2", slotCode: "P04-QTR-A", kind: "QUARTER", sponsor: "Corner Deli" }],
    });
    const out = html(e);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<video");
    expect(out).toContain("Words only");
    expect(out).toContain("1 piece");
  });

  it("stays host-portable and fits a phone", () => {
    const src = readFileSync(new URL("../src/app/(public)/next/[school]/[edition]/live-reader.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "next\/image"/);
    expect(src).not.toContain("<Image");
    /* nothing has a fixed width wider than a 390px phone's column: media is w-full, the cover w-40 */
    expect(src).toContain('className="block aspect-video w-full bg-black"');
    expect(src).toContain("w-full object-contain");
    expect(src).toContain("w-40 shrink-0");
    expect(src).toContain("flex-col gap-6 px-6 pb-10 pt-14 sm:flex-row");
    /* lazy below the fold; the page has its own loading skeleton */
    expect(src.match(/loading="lazy"/g)?.length).toBe(2);
    const loading = readFileSync(new URL("../src/app/(public)/next/[school]/[edition]/loading.tsx", import.meta.url), "utf8");
    expect(loading).toContain('aria-label="Loading the edition"');
  });
});
