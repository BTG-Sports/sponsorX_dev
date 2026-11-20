/* --------------------------------------------------------------------------
   P9-FE-13 / -15 — a file sent straight from the browser to storage on a
   presigned PUT, with progress.

   Three steps, always: ask the API for a grant (it answers the address and
   the Content-Type to send), PUT the bytes to that address with EXACTLY that
   type — the grant is signed for it, and a file the browser can't name (an
   .indd, a .psd) has an empty `file.type` that storage would refuse — then
   tell the API to record the file, which checks what arrived.

   The bytes never pass through the web server. `fetch` cannot report upload
   progress, so the PUT is an XMLHttpRequest; a 2 GB video needs the bar.

   Pure where it can be: the size rule, the size in words and the failure
   words are plain functions; `putFile` takes its XMLHttpRequest from the
   caller in tests.
   -------------------------------------------------------------------------- */

/** 2 GB, decimal — the API's own cap for a file of any format (lib/file-formats.ts). */
export const ANY_FILE_MAX_BYTES = 2_000_000_000;

/** "1.4 MB", "820 KB", "2 GB" — decimal units, as the limits are stated. */
export function fileSizeWords(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1000;
  let u = 0;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u += 1;
  }
  const shown = n >= 100 || Number.isInteger(n) ? Math.round(n) : Math.round(n * 10) / 10;
  return `${shown} ${units[u]}`;
}

/** Why a file of any format can't be sent, or null. Checked before anything leaves the browser. */
export function anyFileProblem(file: { size: number } | null | undefined, maxBytes = ANY_FILE_MAX_BYTES): string | null {
  if (!file) return "Choose a file first.";
  if (!file.size) return "That file is empty — choose another.";
  if (file.size > maxBytes) return `Keep the file under ${fileSizeWords(maxBytes)} (this one is ${fileSizeWords(file.size)}).`;
  return null;
}

export type PutFailure = { kind: "refused"; status: number } | { kind: "network" } | { kind: "timeout" } | { kind: "cancelled" };

export class UploadError extends Error {
  readonly failure: PutFailure;
  constructor(failure: PutFailure) {
    super(putFailureWords(failure));
    this.name = "UploadError";
    this.failure = failure;
  }
}

/** What went wrong with the PUT, for the person who chose the file. */
export function putFailureWords(f: PutFailure): string {
  switch (f.kind) {
    case "refused":
      return `Storage refused the file (HTTP ${f.status}). Nothing was saved — choose the file again.`;
    case "timeout":
      return "The upload timed out. Nothing was saved — check your connection and try again.";
    case "cancelled":
      return "Upload cancelled. Nothing was saved.";
    default:
      return "The upload didn't reach storage. Nothing was saved — check your connection and try again.";
  }
}

type XhrLike = Pick<XMLHttpRequest, "open" | "setRequestHeader" | "send" | "abort" | "status"> & {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
};

/**
 * PUT `body` to a presigned address with the Content-Type the grant answered.
 * `onProgress` gets whole percents, 0–100. Rejects with an UploadError that
 * says what happened. `signal` cancels it.
 */
export function putFile(
  url: string,
  body: Blob,
  contentType: string,
  opts: { onProgress?: (percent: number) => void; signal?: AbortSignal; xhr?: () => XhrLike } = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req: XhrLike = opts.xhr ? opts.xhr() : (new XMLHttpRequest() as unknown as XhrLike);
    req.open("PUT", url);
    req.setRequestHeader("Content-Type", contentType);
    req.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    req.onload = () => {
      if (req.status >= 200 && req.status < 300) {
        opts.onProgress?.(100);
        resolve();
      } else reject(new UploadError({ kind: "refused", status: req.status }));
    };
    req.onerror = () => reject(new UploadError({ kind: "network" }));
    req.ontimeout = () => reject(new UploadError({ kind: "timeout" }));
    req.onabort = () => reject(new UploadError({ kind: "cancelled" }));
    if (opts.signal) {
      if (opts.signal.aborted) return reject(new UploadError({ kind: "cancelled" }));
      opts.signal.addEventListener("abort", () => req.abort(), { once: true });
    }
    req.send(body);
  });
}

export type UploadGrant = { ok: true; url: string; key: string; contentType: string } | { ok: false; message: string };
export type UploadSaved = { ok: true; message?: string } | { ok: false; message: string };

export type UploadOutcome = { ok: true; key: string; message?: string } | { ok: false; message: string; step: "check" | "grant" | "put" | "save" };

/**
 * The whole three-step upload: grant → PUT with the answered type → save.
 * `grant` and `save` are the page's server actions; a refusal from either is
 * returned in the API's own words.
 */
export async function sendFile(
  file: File,
  steps: {
    grant: (contentType: string, bytes: number) => Promise<UploadGrant>;
    save: (key: string, fileName: string) => Promise<UploadSaved>;
    problem?: (file: File) => string | null;
    onStep?: (step: "grant" | "put" | "save") => void;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
    put?: typeof putFile;
  },
): Promise<UploadOutcome> {
  const refused = (steps.problem ?? anyFileProblem)(file);
  if (refused) return { ok: false, message: refused, step: "check" };

  steps.onStep?.("grant");
  const unreachable = "SponsorX couldn't be reached. Nothing was sent — try again in a minute.";
  const g = await steps.grant(file.type, file.size).catch((): UploadGrant => ({ ok: false, message: unreachable }));
  if (!g.ok) return { ok: false, message: g.message, step: "grant" };

  steps.onStep?.("put");
  try {
    /* The type the grant answered, never `file.type`: it is what was signed. */
    await (steps.put ?? putFile)(g.url, file, g.contentType, { onProgress: steps.onProgress, signal: steps.signal });
  } catch (e) {
    return { ok: false, message: e instanceof UploadError ? e.message : putFailureWords({ kind: "network" }), step: "put" };
  }

  steps.onStep?.("save");
  const s = await steps
    .save(g.key, file.name)
    .catch((): UploadSaved => ({ ok: false, message: "The file uploaded, but SponsorX couldn't be reached to save it. Choose the file again." }));
  if (!s.ok) return { ok: false, message: s.message, step: "save" };
  return { ok: true, key: g.key, message: s.message };
}
