import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P9-FE-13 — a file picker on the rights page's "Add content" form
   (P9-BE-25): any format, up to 2 GB, straight to storage on a signed PUT
   with progress; a refused file says why; a piece's file opens from the list;
   a piece added by title can be given its file. And the student's draft
   picker takes any format too.

   The upload is three calls — grant, PUT, save — and the PUT must carry the
   Content-Type the grant ANSWERED: the grant is signed for it, and a file the
   browser can't name (an .indd) has an empty `file.type`.
   -------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const apiFetch = vi.fn();
vi.mock("@/server/api", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import {
  ANY_FILE_MAX_BYTES, UploadError, anyFileProblem, fileSizeWords, putFailureWords, putFile, sendFile,
} from "@/lib/direct-upload";
import {
  ASSET_KIND_WORDS, contentPieces, fileTypeWords, mayAttachFile, pieceFileLine, type ApiContentPiece,
} from "@/lib/rights-live";

const {
  addAssetAction, assetFileAction, attachAssetFileAction, presignContentUploadAction,
} = await import("@/app/(app)/admin/next/actions");

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const refusal = (message: string, status = 422) => json({ error: { message } }, status);
const sent = (i = 0) => {
  const [path, init] = apiFetch.mock.calls[i] as [string, RequestInit | undefined];
  return { path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
};

beforeEach(() => apiFetch.mockReset());

/* A stand-in for XMLHttpRequest that records what was sent. */
function fakeXhr(end: (x: ReturnType<typeof make>) => void) {
  function make() {
    return {
      method: "", url: "", headers: {} as Record<string, string>, body: null as unknown, status: 0, aborted: false,
      upload: { onprogress: null as null | ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) },
      onload: null as null | (() => void), onerror: null as null | (() => void), ontimeout: null as null | (() => void), onabort: null as null | (() => void),
      open(m: string, u: string) { this.method = m; this.url = u; },
      setRequestHeader(k: string, v: string) { this.headers[k] = v; },
      send(b: unknown) { this.body = b; queueMicrotask(() => end(this)); },
      abort() { this.aborted = true; this.onabort?.(); },
    };
  }
  const made: ReturnType<typeof make>[] = [];
  return { made, xhr: () => { const x = make(); made.push(x); return x as never; } };
}

describe("P9-FE-13 · a file of any format, in words", () => {
  it("sizes read in decimal units, as the limits are stated", () => {
    expect(fileSizeWords(820)).toBe("820 B");
    expect(fileSizeWords(48_000_000)).toBe("48 MB");
    expect(fileSizeWords(1_420_000)).toBe("1.4 MB");
    expect(fileSizeWords(2_000_000_000)).toBe("2 GB");
    expect(fileSizeWords(null)).toBe("");
  });

  it("only an empty file or one over 2 GB is refused before anything is sent — never a format", () => {
    expect(ANY_FILE_MAX_BYTES).toBe(2_000_000_000);
    expect(anyFileProblem({ size: 48_000_000 })).toBeNull();
    expect(anyFileProblem({ size: ANY_FILE_MAX_BYTES })).toBeNull();
    expect(anyFileProblem({ size: 0 })).toBe("That file is empty — choose another.");
    expect(anyFileProblem({ size: 2_100_000_000 })).toBe("Keep the file under 2 GB (this one is 2.1 GB).");
    expect(anyFileProblem(null)).toBe("Choose a file first.");
  });

  it("names a file's type the way a person would, by its type or — when the browser has none — its extension", () => {
    expect(fileTypeWords("application/pdf", "press.pdf")).toBe("PDF");
    expect(fileTypeWords("image/jpeg", "team.jpg")).toBe("JPG picture");
    expect(fileTypeWords("video/quicktime", "game.mov")).toBe("MOV video");
    expect(fileTypeWords("application/octet-stream", "cover-story.indd")).toBe("InDesign file");
    expect(fileTypeWords("application/octet-stream", "poster.psd")).toBe("Photoshop file");
    expect(fileTypeWords("application/octet-stream", "notes.xyz")).toBe("XYZ file");
    expect(fileTypeWords(null, null)).toBe("File");
  });
});

describe("P9-FE-13 · the PUT to storage", () => {
  it("sends the bytes with the type it is given, and reports progress in whole percents", async () => {
    const seen: number[] = [];
    const f = fakeXhr((x) => {
      x.upload.onprogress?.({ lengthComputable: true, loaded: 250, total: 1000 });
      x.upload.onprogress?.({ lengthComputable: true, loaded: 1000, total: 1000 });
      x.status = 200;
      x.onload?.();
    });
    const body = new Blob(["abc"]);
    await putFile("https://storage.example/put?sig=1", body, "application/octet-stream", { onProgress: (p) => seen.push(p), xhr: f.xhr });
    expect(f.made[0]).toMatchObject({ method: "PUT", url: "https://storage.example/put?sig=1", headers: { "Content-Type": "application/octet-stream" } });
    expect(f.made[0]!.body).toBe(body);
    expect(seen).toEqual([25, 100, 100]);
  });

  it("says what went wrong: storage refused it, the connection dropped, or it was cancelled", async () => {
    const refused = fakeXhr((x) => { x.status = 403; x.onload?.(); });
    await expect(putFile("u", new Blob(["a"]), "image/png", { xhr: refused.xhr })).rejects.toMatchObject({ failure: { kind: "refused", status: 403 } });
    const dropped = fakeXhr((x) => x.onerror?.());
    await expect(putFile("u", new Blob(["a"]), "image/png", { xhr: dropped.xhr })).rejects.toBeInstanceOf(UploadError);
    expect(putFailureWords({ kind: "refused", status: 403 })).toBe("Storage refused the file (HTTP 403). Nothing was saved — choose the file again.");
    expect(putFailureWords({ kind: "network" })).toContain("didn't reach storage");

    const stop = new AbortController();
    const hung = fakeXhr(() => stop.abort());
    await expect(putFile("u", new Blob(["a"]), "image/png", { xhr: hung.xhr, signal: stop.signal })).rejects.toMatchObject({ failure: { kind: "cancelled" } });
    expect(hung.made[0]!.aborted).toBe(true);
  });
});

describe("P9-FE-13 · grant → PUT → save", () => {
  const indd = () => new File(["x".repeat(64)], "cover-story.indd", { type: "" });

  it("PUTs with the type the grant answered — not the browser's empty one — then saves the key and the file's name", async () => {
    const calls: string[] = [];
    const put = vi.fn(async (_u: string, _b: Blob, type: string, o?: { onProgress?: (p: number) => void }) => {
      calls.push(`put:${type}`);
      o?.onProgress?.(100);
    });
    const steps: string[] = [];
    const out = await sendFile(indd(), {
      grant: async (contentType, bytes) => {
        calls.push(`grant:${JSON.stringify(contentType)}:${bytes}`);
        return { ok: true, url: "https://storage.example/put", key: "edition-content/t1/e1/k1", contentType: "application/octet-stream" };
      },
      save: async (key, name) => {
        calls.push(`save:${key}:${name}`);
        return { ok: true, message: "saved" };
      },
      onStep: (s) => steps.push(s),
      put: put as never,
    });
    expect(calls).toEqual(['grant:"":64', "put:application/octet-stream", "save:edition-content/t1/e1/k1:cover-story.indd"]);
    expect(steps).toEqual(["grant", "put", "save"]);
    expect(out).toEqual({ ok: true, key: "edition-content/t1/e1/k1", message: "saved" });
  });

  it("a refused file says why, at whichever step refused it, and nothing after that step runs", async () => {
    const grant = vi.fn(async () => ({ ok: false as const, message: "This edition was cancelled, so it takes no content." }));
    const save = vi.fn();
    const put = vi.fn();
    expect(await sendFile(indd(), { grant, save, put: put as never })).toEqual({ ok: false, step: "grant", message: "This edition was cancelled, so it takes no content." });
    expect(put).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    /* the API's check when the piece is saved (POL-BE-110): the wrong file is removed, and it says so */
    const ok = async () => ({ ok: true as const, url: "u", key: "k", contentType: "image/png" });
    const out = await sendFile(indd(), {
      grant: ok, put: (async () => {}) as never,
      save: async () => ({ ok: false, message: "That file isn't the size that was declared, so it was removed. Upload it again." }),
    });
    expect(out).toEqual({ ok: false, step: "save", message: "That file isn't the size that was declared, so it was removed. Upload it again." });

    const dropped = await sendFile(indd(), { grant: ok, save, put: (async () => { throw new UploadError({ kind: "network" }); }) as never });
    expect(dropped).toMatchObject({ ok: false, step: "put" });
    expect(save).not.toHaveBeenCalled();

    const empty = await sendFile(new File([], "empty.pdf"), { grant, save, put: put as never });
    expect(empty).toEqual({ ok: false, step: "check", message: "That file is empty — choose another." });
  });
});

describe("P9-FE-13 · the rights page's server actions", () => {
  it("asks for a grant with the browser's type (empty for a file it can't name) and the exact size, and returns the type to PUT with", async () => {
    apiFetch.mockResolvedValueOnce(json({ url: "https://storage.example/put", key: "edition-content/t1/e1/k1", contentType: "application/octet-stream", maxBytes: 2_000_000_000 }, 201));
    const g = await presignContentUploadAction("e1", "", 48_000_000);
    expect(sent()).toEqual({ path: "/editions/e1/assets/uploads", method: "POST", body: { contentType: "", bytes: 48_000_000 } });
    expect(g).toEqual({ ok: true, url: "https://storage.example/put", key: "edition-content/t1/e1/k1", contentType: "application/octet-stream" });
  });

  it("a refused grant says why, in the API's words", async () => {
    apiFetch.mockResolvedValueOnce(refusal("Keep the file under 2 GB."));
    expect(await presignContentUploadAction("e1", "video/mp4", 1)).toEqual({ ok: false, message: "Keep the file under 2 GB." });
    expect(await presignContentUploadAction("e1", "video/mp4", 0)).toEqual({ ok: false, message: "That file is empty — choose another." });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("adds a piece with its file: the key and the name it was chosen with", async () => {
    apiFetch.mockResolvedValueOnce(json({ id: "a1" }, 201));
    const r = await addAssetAction("e1", { kind: "DESIGN", title: " Cover story ", sourceKind: "BTG", r2Key: "edition-content/t1/e1/k1", fileName: "cover-story.indd" });
    expect(sent()).toEqual({
      path: "/editions/e1/assets", method: "POST",
      body: { kind: "DESIGN", title: "Cover story", sourceKind: "BTG", r2Key: "edition-content/t1/e1/k1", fileName: "cover-story.indd" },
    });
    expect(r).toEqual({ ok: true, message: "“Cover story” added with its file — it needs a right before the edition can clear." });
  });

  it("still adds a piece by title alone, and the save's refusal of a wrong file is shown as written", async () => {
    apiFetch.mockResolvedValueOnce(json({ id: "a2" }, 201));
    await addAssetAction("e1", { kind: "ARTICLE", title: "Season preview", sourceKind: "STUDENT" });
    expect(sent().body).toEqual({ kind: "ARTICLE", title: "Season preview", sourceKind: "STUDENT" });

    apiFetch.mockResolvedValueOnce(refusal("That file isn't the type of file that was asked for, so it was removed. Upload it again."));
    const r = await addAssetAction("e1", { kind: "PHOTO", title: "Team", sourceKind: "BTG", r2Key: "k", fileName: "team.jpg" });
    expect(r).toEqual({ ok: false, message: "That file isn't the type of file that was asked for, so it was removed. Upload it again." });
  });

  it("gives a piece added by title its file, and shows why a piece can't take one", async () => {
    apiFetch.mockResolvedValueOnce(json({ id: "a1", fileType: "application/pdf", fileBytes: 10, fileName: "a.pdf" }));
    expect(await attachAssetFileAction("a1", "edition-content/t1/e1/k2", "a.pdf")).toEqual({ ok: true, message: "File saved." });
    expect(sent()).toEqual({ path: "/edition-assets/a1/file", method: "PUT", body: { r2Key: "edition-content/t1/e1/k2", fileName: "a.pdf" } });

    apiFetch.mockResolvedValueOnce(refusal("A student's piece carries the file from their draft.", 409));
    expect(await attachAssetFileAction("a3", "k", "a.pdf")).toEqual({ ok: false, message: "A student's piece carries the file from their draft." });
  });

  it("opens a piece's file on a signed link, and says when it must download", async () => {
    apiFetch.mockResolvedValueOnce(json({ url: "https://storage.example/get?sig=1", fileType: "application/octet-stream", fileName: "cover-story.indd", download: true }));
    expect(await assetFileAction("a1")).toEqual({ ok: true, url: "https://storage.example/get?sig=1", download: true });
    expect(sent()).toMatchObject({ path: "/edition-assets/a1/file", method: "GET" });

    apiFetch.mockResolvedValueOnce(json({ url: "https://storage.example/get?sig=2", fileType: "image/png", fileName: "team.png", download: false }));
    expect(await assetFileAction("a2")).toEqual({ ok: true, url: "https://storage.example/get?sig=2", download: false });

    apiFetch.mockResolvedValueOnce(refusal("This piece has no file.", 404));
    expect(await assetFileAction("a4")).toEqual({ ok: false, message: "This piece has no file." });
  });
});

describe("P9-FE-13 · the content list", () => {
  const piece = (o: Partial<ApiContentPiece>): ApiContentPiece => ({
    id: "a", kind: "PHOTO", title: "t", sourceKind: "BTG", studentId: null, campaignId: null,
    hasFile: false, fileType: null, fileBytes: null, fileName: null, ...o,
  });

  it("says what each piece's file is, or that it has none", () => {
    expect(pieceFileLine(piece({ hasFile: true, fileType: "application/octet-stream", fileBytes: 48_000_000, fileName: "cover-story.indd" }), fileSizeWords))
      .toBe("cover-story.indd · InDesign file · 48 MB");
    expect(pieceFileLine(piece({ hasFile: true, fileType: "image/png", fileBytes: null, fileName: null }), fileSizeWords)).toBe("PNG picture");
    expect(pieceFileLine(piece({}), fileSizeWords)).toBe("No file yet");
  });

  it("offers \"Add its file\" only where a file can still be added", () => {
    expect(mayAttachFile(piece({}), "SELLING")).toBe(true);
    expect(mayAttachFile(piece({}), "IN_PRODUCTION")).toBe(true);
    expect(mayAttachFile(piece({ hasFile: true }), "SELLING")).toBe(false);
    /* ad artwork is its sponsor's upload, on the slot */
    expect(mayAttachFile(piece({ kind: "AD_CREATIVE" }), "SELLING")).toBe(false);
    for (const s of ["PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED", "CANCELLED"]) expect(mayAttachFile(piece({}), s), s).toBe(false);
  });

  it("lists what still has no file first, and knows the design kind", () => {
    const rows = contentPieces([piece({ id: "1", hasFile: true }), piece({ id: "2" }), piece({ id: "3", hasFile: true }), piece({ id: "4" })]);
    expect(rows.map((r) => r.id)).toEqual(["2", "4", "1", "3"]);
    expect(ASSET_KIND_WORDS.DESIGN).toBe("Design");
  });

  it("the rights page reads the pieces' files and draws the picker and the open control", () => {
    const page = src("app/(app)/admin/next/rights/live-rights.tsx");
    expect(page).toContain("/assets`)");
    expect(page).toContain("<AddContent editionId={e.id}");
    expect(page).toContain("<PieceFile editionId={e.id} assetId={p.id}");
    const island = src("components/edition-content.tsx");
    expect(island).toContain('type="file"');
    expect(island).not.toContain("accept=");
    expect(island).toContain('role="progressbar"');
    /* one upload at a time: a ref flipped at once, not a state flag */
    expect(island).toContain("if (inFlight.current) return false;");
  });
});
