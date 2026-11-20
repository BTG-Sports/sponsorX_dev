import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P9-FE-15 — the edition's cover and press PDF on /admin/next/editions
   (P9-BE-27): upload and replace both, open the press PDF on a signed link,
   and a refused file says why.

     POST /editions/:id/cover|press-pdf/uploads  {contentType, bytes} → {url, key, contentType}
     PUT  (the browser, to `url`, with the answered contentType)
     PUT  /editions/:id/cover|press-pdf          {r2Key, fileName} → {which, type, bytes, fileName, replaced}
     GET  /editions/:id/press-pdf                → {url, fileName, bytes}

   The shapes are the domain's own (backend/src/domain/edition-files.ts).
   -------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const apiFetch = vi.fn();
vi.mock("@/server/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { sendFile } from "@/lib/direct-upload";
import {
  COVER_ACCEPT, COVER_MAX_BYTES, PRESS_PDF_ACCEPT, PRESS_PDF_MAX_BYTES, coverLine, declaredType, editionFileProblem, pressPdfLine,
  pressPdfNeed, takesEditionFiles,
} from "@/lib/edition-files-live";

const { presignEditionFileAction, pressPdfAction, recordEditionFileAction } = await import("@/app/(app)/admin/next/actions");

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const refusal = (message: string, status = 422) => json({ error: { message } }, status);
const sent = (i = 0) => {
  const [path, init] = apiFetch.mock.calls[i] as [string, RequestInit | undefined];
  return { path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
};

beforeEach(() => apiFetch.mockReset());

describe("P9-FE-15 · which file can be the cover, and which the press PDF", () => {
  it("the cover is a JPG, PNG or WebP up to 50 MB — refused in the API's own words before anything is sent", () => {
    expect(COVER_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    expect(COVER_MAX_BYTES).toBe(50 * 1024 * 1024);
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(editionFileProblem("cover", { type, size: 1_200_000, name: "cover" }), type).toBeNull();
    expect(editionFileProblem("cover", { type: "application/pdf", size: 1000, name: "cover.pdf" })).toBe("Upload the cover as a JPG, PNG or WebP.");
    expect(editionFileProblem("cover", { type: "image/svg+xml", size: 1000, name: "cover.svg" })).toBe("Upload the cover as a JPG, PNG or WebP.");
    expect(editionFileProblem("cover", { type: "image/png", size: COVER_MAX_BYTES + 1, name: "big.png" })).toBe("Keep the cover under 50 MB.");
    expect(editionFileProblem("cover", { type: "image/png", size: 0, name: "empty.png" })).toBe("That file is empty — choose another.");
  });

  it("the press file is a PDF up to 2 GB — a PDF the browser didn't name is still a PDF", () => {
    expect(PRESS_PDF_ACCEPT).toBe("application/pdf,.pdf");
    expect(PRESS_PDF_MAX_BYTES).toBe(2_000_000_000);
    expect(editionFileProblem("press-pdf", { type: "application/pdf", size: 480_000_000, name: "press.pdf" })).toBeNull();
    expect(editionFileProblem("press-pdf", { type: "", size: 1000, name: "Fall-2026.PDF" })).toBeNull();
    expect(declaredType("press-pdf", { type: "", name: "Fall-2026.PDF" })).toBe("application/pdf");
    expect(declaredType("cover", { type: "", name: "cover.pdf" })).toBe("");
    expect(editionFileProblem("press-pdf", { type: "image/png", size: 1000, name: "page.png" })).toBe("Upload the press file as a PDF.");
    expect(editionFileProblem("press-pdf", { type: "application/pdf", size: PRESS_PDF_MAX_BYTES + 1, name: "press.pdf" })).toBe("Keep the press PDF under 2 GB.");
  });

  it("says what is on file, and what the press PDF is for", () => {
    expect(coverLine({ type: "image/png", bytes: 1_200_000, uploadedAt: "2026-11-19T15:00:00.000Z" })).toBe("PNG · 1.2 MB · uploaded Nov 19");
    expect(coverLine({ type: "image/webp", bytes: null, uploadedAt: null })).toBe("WebP");
    expect(coverLine(null)).toBeNull();
    expect(pressPdfLine({ fileName: "fall-2026-press.pdf", bytes: 48_000_000, uploadedAt: "2026-11-19T15:00:00.000Z" })).toBe("fall-2026-press.pdf · 48 MB · uploaded Nov 19");
    expect(pressPdfLine({ fileName: null, bytes: 48_000_000, uploadedAt: null })).toBe("Press PDF · 48 MB");
    expect(pressPdfLine(undefined)).toBeNull();
    expect(pressPdfNeed(null, false)).toBe("Only needed if the edition is printed.");
    expect(pressPdfNeed("2026-12-01T00:00:00.000Z", false)).toBe("Needed before the edition goes to print.");
    expect(pressPdfNeed("2026-12-01T00:00:00.000Z", true)).toBe("The printer's file.");
    expect(takesEditionFiles("PUBLISHED_DIGITAL")).toBe(true);
    expect(takesEditionFiles("CANCELLED")).toBe(false);
  });
});

describe("P9-FE-15 · the upload", () => {
  it("presign → PUT with the answered type → record, for the cover", async () => {
    apiFetch
      .mockResolvedValueOnce(json({ url: "https://storage.example/put?sig=1", key: "edition-files/t1/e1/cover/k1", contentType: "image/png", maxBytes: COVER_MAX_BYTES }, 201))
      .mockResolvedValueOnce(json({ which: "cover", type: "image/png", bytes: 3, fileName: null, replaced: false }));
    const put = vi.fn(async () => {});
    /* the browser may say "image/PNG; charset=…" — the grant answers the normalised type, and that is what is sent */
    const file = new File(["abc"], "cover.png", { type: "image/png" });
    const out = await sendFile(file, {
      problem: (f) => editionFileProblem("cover", f),
      grant: (_t, bytes) => presignEditionFileAction("e1", "cover", declaredType("cover", file), bytes),
      save: (key, name) => recordEditionFileAction("e1", "cover", key, name),
      put: put as never,
    });
    expect(sent(0)).toEqual({ path: "/editions/e1/cover/uploads", method: "POST", body: { contentType: "image/png", bytes: 3 } });
    expect(put).toHaveBeenCalledWith("https://storage.example/put?sig=1", file, "image/png", expect.anything());
    expect(sent(1)).toEqual({ path: "/editions/e1/cover", method: "PUT", body: { r2Key: "edition-files/t1/e1/cover/k1", fileName: "cover.png" } });
    expect(out).toEqual({ ok: true, key: "edition-files/t1/e1/cover/k1", message: "The cover is saved." });
  });

  it("a second upload replaces the first, and says so", async () => {
    apiFetch.mockResolvedValueOnce(json({ which: "press-pdf", type: "application/pdf", bytes: 9, fileName: "press.pdf", replaced: true }));
    expect(await recordEditionFileAction("e1", "press-pdf", "edition-files/t1/e1/press-pdf/k2", "press.pdf")).toEqual({ ok: true, message: "The press PDF was replaced." });
    expect(sent()).toEqual({ path: "/editions/e1/press-pdf", method: "PUT", body: { r2Key: "edition-files/t1/e1/press-pdf/k2", fileName: "press.pdf" } });
  });

  it("a refused file says why — at the grant, and at the check when it is recorded", async () => {
    apiFetch.mockResolvedValueOnce(refusal("Upload the press file as a PDF."));
    expect(await presignEditionFileAction("e1", "press-pdf", "image/png", 10)).toEqual({ ok: false, message: "Upload the press file as a PDF." });

    apiFetch.mockResolvedValueOnce(refusal("This edition was cancelled.", 409));
    expect(await presignEditionFileAction("e1", "cover", "image/png", 10)).toEqual({ ok: false, message: "This edition was cancelled." });

    apiFetch.mockResolvedValueOnce(refusal("That cover couldn't be opened as a picture, so it was removed. Upload it again."));
    expect(await recordEditionFileAction("e1", "cover", "edition-files/t1/e1/cover/k3", "cover.png"))
      .toEqual({ ok: false, message: "That cover couldn't be opened as a picture, so it was removed. Upload it again." });

    apiFetch.mockResolvedValueOnce(refusal("That press PDF isn't the size that was declared, so it was removed. Upload it again."));
    expect(await recordEditionFileAction("e1", "press-pdf", "k", "press.pdf"))
      .toEqual({ ok: false, message: "That press PDF isn't the size that was declared, so it was removed. Upload it again." });

    /* a wrong file never reaches the API at all */
    apiFetch.mockReset();
    const out = await sendFile(new File(["x"], "cover.pdf", { type: "application/pdf" }), {
      problem: (f) => editionFileProblem("cover", f),
      grant: (t, b) => presignEditionFileAction("e1", "cover", t, b),
      save: (k, n) => recordEditionFileAction("e1", "cover", k, n),
    });
    expect(out).toEqual({ ok: false, step: "check", message: "Upload the cover as a JPG, PNG or WebP." });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("only the two files exist: anything else is refused here", async () => {
    expect(await presignEditionFileAction("e1", "logo" as never, "image/png", 10)).toEqual({ ok: false, message: "No edition." });
    expect(await recordEditionFileAction("e1", "../x" as never, "k", null)).toEqual({ ok: false, message: "Choose the file again." });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("the press PDF opens on BTG's signed link, as a download", async () => {
    apiFetch.mockResolvedValueOnce(json({ url: "https://storage.example/get?sig=9", fileName: "press.pdf", bytes: 48_000_000 }));
    expect(await pressPdfAction("e1")).toEqual({ ok: true, url: "https://storage.example/get?sig=9", download: true });
    expect(sent()).toMatchObject({ path: "/editions/e1/press-pdf", method: "GET" });

    apiFetch.mockResolvedValueOnce(refusal("This edition has no press PDF yet.", 404));
    expect(await pressPdfAction("e1")).toEqual({ ok: false, message: "This edition has no press PDF yet." });
  });
});

describe("P9-FE-15 · the editions page", () => {
  it("draws what is on file, the cover's signed preview, and BTG's upload / replace / open", () => {
    const page = src("app/(app)/admin/next/editions/live-editions.tsx");
    expect(page).toContain("detail.body?.cover");
    expect(page).toContain("detail.body?.pressPdf");
    expect(page).toContain("/cover`)");
    expect(page).toContain("<EditionFiles");
    expect(page).toContain("canWrite={seller}");
    const island = src("components/edition-files.tsx");
    expect(island).toContain("accept={which === \"cover\" ? COVER_ACCEPT : PRESS_PDF_ACCEPT}");
    expect(island).toContain("`Replace the ${words.name}`");
    expect(island).toContain("`Upload the ${words.name}`");
    expect(island).toContain("Open the press PDF");
    /* a double click opens one link, not two */
    expect(island).toContain("if (opening.current) return;");
  });
});
