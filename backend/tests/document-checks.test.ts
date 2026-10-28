import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  datesIn, expiryIn, kindFound, nameFound, pictureProblem, readFindings, sniffType, type ReadExpectation,
} from "../src/domain/document-check-rules";
import { documentHolds } from "../src/domain/document-reading";
import { inspectDocument } from "../src/lib/document-inspect";
import { stopReader } from "../src/lib/ocr";
import { idCard, ID_LINES, scannedPdf, spoil, textPdf } from "./support/document-fixtures";

/* --------------------------------------------------------------------------
   P8-BE-09 — every document upload is opened at its confirm step and
   refused, in words, when nobody could read it: not what it says it is,
   damaged, password-locked, too small, too dark, blank, washed out or
   blurred. P8-BE-11 — what a document says is compared with the record:
   the right name, the right kind, not expired, the athlete's date of birth.

   Found 2026-10-28: an ID uploaded as an almost black, blurred photo went
   straight through. The `dark` and `blurred` pictures here stand in for it
   (the real one is a person's ID, so it is not kept; it measured mean 12,
   sharpness 6 — both refused by the limits below).
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-10-28T12:00:00Z");
const athleteId = (over: Partial<ReadExpectation> = {}): ReadExpectation => ({
  label: "Athlete's government ID",
  names: [{ who: "The athlete", name: "Ardinia Townes", kind: "person" }],
  kind: "GOVERNMENT_ID", expires: true, birthDate: new Date("2005-03-14T00:00:00Z"), ...over,
});

afterAll(async () => {
  await stopReader();
});

describe("P8-BE-09 · the file is what it says", () => {
  it("knows a file by its own first bytes", async () => {
    const png = await idCard(ID_LINES);
    expect(sniffType(png)).toBe("image/png");
    expect(sniffType(await sharp(png).jpeg().toBuffer())).toBe("image/jpeg");
    expect(sniffType(await sharp(png).webp().toBuffer())).toBe("image/webp");
    expect(sniffType(textPdf(["x"]))).toBe("application/pdf");
    expect(sniffType(Buffer.from("<html><body>not a pdf</body></html>"))).toBeNull();
  });

  it("refuses a renamed file", async () => {
    const r = await inspectDocument(await idCard(ID_LINES), "image/jpeg");
    expect(r).toMatchObject({ ok: false, problem: "not_its_type" });
    expect(!r.ok && r.reason).toMatch(/renamed/);
    expect(await inspectDocument(Buffer.from("%!PS-Adobe-3.0 not a pdf"), "application/pdf")).toMatchObject({ ok: false, problem: "not_its_type" });
  });

  it("refuses a damaged file", async () => {
    const png = await idCard(ID_LINES);
    expect(await inspectDocument(png.subarray(0, 200), "image/png")).toMatchObject({ ok: false, problem: "damaged" });
    expect(await inspectDocument(Buffer.from("%PDF-1.4\nthis is not a pdf at all\n%%EOF"), "application/pdf")).toMatchObject({ ok: false, problem: "damaged" });
  });
});

describe("P8-BE-09 · a photo someone can read", () => {
  it("passes a clear ID card, and one shot on a phone", async () => {
    const good = await idCard(ID_LINES);
    const r = await inspectDocument(good, "image/png");
    expect(r.ok).toBe(true);
    expect(r.ok && r.document.pictures).toHaveLength(1);
    expect((await inspectDocument(await spoil.phone(good), "image/jpeg")).ok).toBe(true);
  });

  it("passes a card small on a plain table, and one in a dim room", async () => {
    const good = await idCard(ID_LINES);
    const onTable = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#4a4f55" } })
      .composite([{ input: await sharp(good).resize(900).png().toBuffer(), left: 700, top: 600 }]).jpeg().toBuffer();
    expect((await inspectDocument(onTable, "image/jpeg")).ok).toBe(true);
    expect((await inspectDocument(await sharp(good).linear(0.45, 0).png().toBuffer(), "image/png")).ok).toBe(true);
  });

  it.each([
    ["too dark", "too_dark", (p: Buffer) => spoil.dark(p), /too dark to read\. Retake it in good light/],
    ["blurred", "blurry", (p: Buffer) => spoil.blurred(p), /blurred\. Hold the camera still/],
    ["washed out", "washed_out", (p: Buffer) => spoil.washedOut(p), /washed out/],
    ["blank", "blank", () => spoil.blank(), /nothing readable/],
    ["too small", "too_small", (p: Buffer) => spoil.tiny(p), /too small to read/],
  ] as const)("refuses a photo that is %s, saying why", async (_label, problem, make, words) => {
    const r = await inspectDocument(await make(await idCard(ID_LINES)), "image/png");
    expect(r).toMatchObject({ ok: false, problem });
    expect(!r.ok && r.reason).toMatch(words);
  });

  it("judges the measures in order: size, then dark, washed out, blank, blur", () => {
    const fine = { width: 1000, height: 630, mean: 200, spread: 40, sharpness: 60 };
    expect(pictureProblem(fine)).toBeNull();
    expect(pictureProblem({ ...fine, width: 399, height: 600 })).toBe("too_small");
    expect(pictureProblem({ ...fine, mean: 12, spread: 10, sharpness: 6 })).toBe("too_dark");
    expect(pictureProblem({ ...fine, spread: 5 })).toBe("blank");
    expect(pictureProblem({ ...fine, mean: 250, spread: 12 })).toBe("washed_out");
    expect(pictureProblem({ ...fine, mean: 254, spread: 2 })).toBe("washed_out");
    expect(pictureProblem({ ...fine, sharpness: 6 })).toBe("blurry");
    /* A clean scan of a mostly white page is bright but not flat: not washed out. */
    expect(pictureProblem({ ...fine, mean: 245, spread: 30 })).toBeNull();
  });
});

describe("P8-BE-09 · a PDF", () => {
  it("passes a PDF with its own words, handing them on", async () => {
    const r = await inspectDocument(textPdf(ID_LINES), "application/pdf");
    expect(r.ok).toBe(true);
    expect(r.ok && r.document.text).toContain("TOWNES, ARDINIA M");
    expect(r.ok && r.document.pictures).toHaveLength(0);
  });

  it("passes a typed PDF with only a line of words — a white page is not a washed-out photo", async () => {
    const r = await inspectDocument(textPdf(["Rory Mkt4821 driver's licence"]), "application/pdf");
    expect(r.ok).toBe(true);
    expect(r.ok && r.document.text).toContain("Rory Mkt4821");
  });

  it("calls a PDF page with nothing on it blank, never washed out", async () => {
    const r = await inspectDocument(textPdf(["x"]), "application/pdf");
    expect(r).toMatchObject({ ok: false, problem: "blank" });
    expect(!r.ok && r.reason).toMatch(/^There's nothing readable on the first page of that PDF/);
    expect(pictureProblem({ width: 1000, height: 1294, mean: 252, spread: 14, sharpness: 128 }, "page")).toBeNull();
  });

  it("refuses a password-locked PDF", async () => {
    const r = await inspectDocument(textPdf(ID_LINES, { locked: true }), "application/pdf");
    expect(r).toMatchObject({ ok: false, problem: "locked" });
    expect(!r.ok && r.reason).toMatch(/password-protected/);
  });

  it("judges a scanned PDF's first page like a photo", async () => {
    const good = await inspectDocument(await scannedPdf(await idCard(ID_LINES)), "application/pdf");
    expect(good.ok).toBe(true);
    expect(good.ok && good.document.pictures.length).toBe(1);
    const dark = await inspectDocument(await scannedPdf(await spoil.dark(await idCard(ID_LINES))), "application/pdf");
    expect(dark).toMatchObject({ ok: false, problem: "too_dark" });
    expect(!dark.ok && dark.reason).toMatch(/^The first page of that PDF is too dark/);
  });
});

describe("P8-BE-11 · what the document says", () => {
  const text = ID_LINES.join("\n");

  it("finds a person's first and last name, forgiving one OCR slip and the order", () => {
    expect(nameFound({ who: "x", name: "Ardinia Townes", kind: "person" }, text)).toBe(true);
    expect(nameFound({ who: "x", name: "Ardinia Townes", kind: "person" }, "TOWNES, ARDINIAM")).toBe(true);
    expect(nameFound({ who: "x", name: "Ardinia Townes", kind: "person" }, "T0WNES ARDINIA")).toBe(true);
    expect(nameFound({ who: "x", name: "Ardinia Townes Jr.", kind: "person" }, text)).toBe(true);
    expect(nameFound({ who: "x", name: "Ardinia Towne", kind: "person" }, "BROWN ARDINIA")).toBe(false);
    expect(nameFound({ who: "x", name: "Riley Carter", kind: "person" }, text)).toBe(false);
    /* A last name alone is not enough. */
    expect(nameFound({ who: "x", name: "Riley Townes", kind: "person" }, text)).toBe(false);
  });

  it("finds a business by most of its words, ignoring LLC and the like", () => {
    const reg = "STATE OF OHIO CERTIFICATE OF ORGANIZATION RIVERSIDE HAWKS YOUTH FOOTBALL LLC";
    expect(nameFound({ who: "x", name: "Riverside Hawks Youth Football, LLC", kind: "business" }, reg)).toBe(true);
    expect(nameFound({ who: "x", name: "The Riverside Hawks Football Club", kind: "business" }, reg)).toBe(true);
    expect(nameFound({ who: "x", name: "Lakeview Panthers Club", kind: "business" }, reg)).toBe(false);
  });

  it("knows each kind by its words", () => {
    expect(kindFound("GOVERNMENT_ID", text)).toBe(true);
    expect(kindFound("GOVERNMENT_ID", "LINCOLN HIGH SCHOOL STUDENT")).toBe(false);
    expect(kindFound("SCHOOL_ID", "LINCOLN HIGH SCHOOL STUDENT 2026")).toBe(true);
    expect(kindFound("BIRTH_CERTIFICATE", "CERTIFICATE OF LIVE BIRTH COUNTY OF FRANKLIN")).toBe(true);
    expect(kindFound("BIRTH_CERTIFICATE", "CERTIFICATE OF ACHIEVEMENT")).toBe(false);
    expect(kindFound("COURT_ORDER", "IN THE PROBATE COURT ... LETTERS OF GUARDIANSHIP")).toBe(true);
    expect(kindFound("BUSINESS_REGISTRATION", "ARTICLES OF ORGANIZATION")).toBe(true);
    expect(kindFound("AGREEMENT", "ATHLETE REPRESENTATION AGREEMENT")).toBe(true);
  });

  it("reads dates the ways documents print them, and the labelled expiry", () => {
    expect(datesIn("DOB 03/14/2005", NOW)[0]!.date.toISOString().slice(0, 10)).toBe("2005-03-14");
    expect(datesIn("issued 2024-01-09", NOW)[0]!.date.toISOString().slice(0, 10)).toBe("2024-01-09");
    expect(datesIn("14 MAR 2005", NOW)[0]!.date.toISOString().slice(0, 10)).toBe("2005-03-14");
    expect(datesIn("March 14, 2005", NOW)[0]!.date.toISOString().slice(0, 10)).toBe("2005-03-14");
    expect(datesIn("EXP 03/14/29", NOW)[0]!.date.toISOString().slice(0, 10)).toBe("2029-03-14");
    expect(expiryIn("DOB 03/14/2005 ISS 03/14/2021 EXP 03/14/2025", NOW)!.toISOString().slice(0, 10)).toBe("2025-03-14");
    expect(expiryIn("DOB 03/14/2005", NOW)).toBeNull();
  });

  it("is clear when everything matches", () => {
    expect(readFindings(text, athleteId(), NOW)).toEqual({ state: "CLEAR", findings: [] });
  });

  it("flags each mismatch in words", () => {
    const r = readFindings(text.replace("EXP 03/14/2029", "EXP 03/14/2024"), athleteId({
      names: [{ who: "The athlete", name: "Riley Carter", kind: "person" }], birthDate: new Date("2006-07-01T00:00:00Z"),
    }), NOW);
    expect(r.state).toBe("FLAGGED");
    expect(r.findings.map((f) => f.says)).toEqual([
      "The athlete (Riley Carter) isn't named on it",
      "It looks expired: 03/14/2024",
      "The date of birth on the account (07/01/2006) isn't on it",
    ]);
    expect(readFindings("LINCOLN HIGH SCHOOL STUDENT ID ARDINIA TOWNES 2026", athleteId({ birthDate: null }), NOW).findings.map((f) => f.code))
      .toEqual(["KIND_NOT_FOUND"]);
  });

  it("accepts a birth date printed day first", () => {
    expect(readFindings(text.replace("DOB 03/14/2005", "DOB 14.03.2005"), athleteId(), NOW).state).toBe("CLEAR");
  });

  it("calls a document with almost no words unread, never clear", () => {
    expect(readFindings("~~ .. ||", athleteId(), NOW)).toEqual({
      state: "UNREAD", findings: [{ code: "NO_TEXT", says: "No words could be read on it — check it by eye" }],
    });
  });
});

describe("P8-BE-11 · which documents hold an approval", () => {
  const clear = { checkState: "CLEAR", checkFindings: [] };
  const flagged = { checkState: "FLAGGED", checkFindings: [{ code: "NAME_NOT_FOUND", says: "The athlete (A B) isn't named on it" }] };
  const unread = { checkState: "UNREAD", checkFindings: [{ code: "NO_TEXT", says: "No words could be read on it — check it by eye" }] };

  it("holds on the newest flagged or unread document, with its findings as reasons", () => {
    expect(documentHolds("Athlete's government ID", [flagged])).toEqual(["Document check — Athlete's government ID: The athlete (A B) isn't named on it"]);
    expect(documentHolds("Athlete's government ID", [flagged, unread])).toEqual(["Document check — Athlete's government ID: No words could be read on it — check it by eye"]);
  });

  it("is met by any clear one, or one never read (uploaded before the check)", () => {
    expect(documentHolds("x", [flagged, clear])).toEqual([]);
    expect(documentHolds("x", [clear, flagged])).toEqual([]);
    expect(documentHolds("x", [{ checkState: null, checkFindings: null }])).toEqual([]);
    expect(documentHolds("x", [])).toEqual([]);
  });
});

describe("P8-BE-11 · reading a real picture, on our own server", { timeout: 120_000 }, () => {
  it("reads an ID photo and a scanned PDF as clear, and a wrong person's ID as flagged", async () => {
    const { readDocument } = await import("../src/domain/document-reading");
    const photo = await inspectDocument(await spoil.phone(await idCard(ID_LINES)), "image/jpeg");
    expect(photo.ok).toBe(true);
    expect(await readDocument(photo.ok ? photo.document : undefined, athleteId(), NOW)).toMatchObject({ checkState: "CLEAR", checkFindings: [] });

    const scan = await inspectDocument(await scannedPdf(await idCard(ID_LINES)), "application/pdf");
    expect(await readDocument(scan.ok ? scan.document : undefined, athleteId(), NOW)).toMatchObject({ checkState: "CLEAR" });

    const other = await inspectDocument(await idCard(["STATE OF OHIO DRIVER LICENSE", "CARTER, RILEY J", "DOB 07/01/2006", "EXP 07/01/2030"]), "image/png");
    const read = await readDocument(other.ok ? other.document : undefined, athleteId(), NOW);
    expect(read?.checkState).toBe("FLAGGED");
    expect((read?.checkFindings as { code: string }[]).map((f) => f.code)).toEqual(["NAME_NOT_FOUND", "BIRTH_DATE_NOT_FOUND"]);
  });

  it("reads a card photographed sideways", async () => {
    const { readDocument } = await import("../src/domain/document-reading");
    const sideways = await sharp(await idCard(ID_LINES)).rotate(90).png().toBuffer();
    const r = await inspectDocument(sideways, "image/png");
    expect(await readDocument(r.ok ? r.document : undefined, athleteId(), NOW)).toMatchObject({ checkState: "CLEAR" });
  });

  it("stores nothing when there was nothing to read", async () => {
    const { readDocument } = await import("../src/domain/document-reading");
    expect(await readDocument(undefined, athleteId(), NOW)).toBeNull();
  });
});
