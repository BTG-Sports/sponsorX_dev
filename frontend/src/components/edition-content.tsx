"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import {
  addAssetAction,
  assetFileAction,
  attachAssetFileAction,
  presignContentUploadAction,
  type FileLinkResult,
} from "@/app/(app)/admin/next/actions";
import { anyFileProblem, fileSizeWords, sendFile, type UploadGrant, type UploadSaved } from "@/lib/direct-upload";
import { ASSET_KIND_WORDS, type AssetKind, type SourceKind } from "@/lib/rights-live";

/* --------------------------------------------------------------------------
   P9-FE-13 — a piece of edition content and its file, on /admin/next/rights.

   - AddContent   the "Add content" form: a title, a kind, a source and —
                  new — its file, in any format up to 2 GB. The file goes
                  straight from the browser to storage on a signed PUT, with
                  a progress bar; the piece is saved only once it has arrived,
                  and the API checks it then (P9-BE-25, POL-BE-110).
   - PieceFile    one piece's file in the list: "Open file" on a short signed
                  link, or "Add its file" for a piece that was added by title.
   - useFileSend  the upload itself, shared with the cover and press PDF on
                  the editions page (edition-files.tsx): one upload at a time
                  (a ref, so a double click can't start two), the step it is
                  on, the percent, Cancel, and the refusal in the API's words.
   -------------------------------------------------------------------------- */

export type FileNote = { ok: boolean; message: string } | null;

type Step = "idle" | "grant" | "put" | "save";

export function useFileSend() {
  const router = useRouter();
  const inFlight = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [note, setNote] = useState<FileNote>(null);

  /** Grant → PUT → save. Resolves true when the file is saved. */
  const send = async (
    file: File,
    steps: {
      grant: (contentType: string, bytes: number) => Promise<UploadGrant>;
      save: (key: string, fileName: string) => Promise<UploadSaved>;
      problem?: (file: File) => string | null;
    },
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    abort.current = new AbortController();
    setNote(null);
    setProgress(0);
    setName(file.name);
    try {
      const out = await sendFile(file, { ...steps, onStep: setStep, onProgress: setProgress, signal: abort.current.signal });
      setNote({ ok: out.ok, message: out.ok ? out.message ?? "File saved." : out.message });
      if (out.ok) router.refresh();
      return out.ok;
    } finally {
      inFlight.current = false;
      abort.current = null;
      setStep("idle");
    }
  };

  return {
    busy: step !== "idle",
    step,
    progress,
    name,
    note,
    setNote,
    send,
    cancel: () => abort.current?.abort(),
  };
}

/** The upload as it runs: what is happening, the bar, and Cancel while bytes are moving. */
export function UploadProgress({ step, progress, name, onCancel }: { step: Step; progress: number; name: string | null; onCancel: () => void }) {
  if (step === "idle") return null;
  const words =
    step === "grant" ? "Starting the upload…" : step === "save" ? "Checking the file…" : `Uploading ${name ?? "the file"} — ${progress}%`;
  return (
    <div className="w-full min-w-0" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted">
        <span className="min-w-0 truncate">{words}</span>
        {step === "put" && (
          <button type="button" onClick={onCancel} className="shrink-0 font-medium text-muted underline hover:text-text">
            Cancel
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={`Uploading ${name ?? "the file"}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={step === "save" ? 100 : progress}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-next transition-[width] duration-200 ease-out"
          style={{ width: `${step === "save" ? 100 : step === "grant" ? 2 : Math.max(2, progress)}%` }}
        />
      </div>
    </div>
  );
}

export function FileNoteLine({ note }: { note: FileNote }) {
  if (!note) return null;
  return (
    <p role={note.ok ? "status" : "alert"} className={`text-[11px] [overflow-wrap:anywhere] ${note.ok ? "text-success" : "text-danger"}`}>
      {note.message}
    </p>
  );
}

/** Open a signed link: in a new tab, or — a file a browser mustn't open in place — as a download. */
export function openFileLink(link: Extract<FileLinkResult, { ok: true }>) {
  if (link.download) window.location.assign(link.url);
  else window.open(link.url, "_blank", "noopener");
}

const field =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-admin";
const label = "flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted";
const fileInput =
  "block w-full min-w-0 text-[11px] normal-case text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-text";

const KINDS = (Object.keys(ASSET_KIND_WORDS) as AssetKind[]).map((k) => [k, ASSET_KIND_WORDS[k]] as const);
const SOURCES: Array<[SourceKind, string]> = [
  ["STUDENT", "Student"], ["ATHLETE", "Athlete"], ["BTG", "SponsorX"], ["THIRD_PARTY", "Third party"],
];

export function AddContent({ editionId, takesFiles = true }: { editionId: string; takesFiles?: boolean }) {
  const router = useRouter();
  const up = useFileSend();
  const picker = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AssetKind>("ARTICLE");
  const [source, setSource] = useState<SourceKind>("BTG");
  const [file, setFile] = useState<File | null>(null);

  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Add content</Button>;

  const cleared = () => {
    setTitle("");
    setFile(null);
    if (picker.current) picker.current.value = "";
  };

  const submit = async () => {
    if (saving.current || up.busy) return;
    if (!title.trim()) return up.setNote({ ok: false, message: "Give the piece a title." });
    const piece = { title, kind, sourceKind: source };
    if (file) {
      const ok = await up.send(file, {
        grant: (contentType, bytes) => presignContentUploadAction(editionId, contentType, bytes),
        save: (key, fileName) => addAssetAction(editionId, { ...piece, r2Key: key, fileName }),
      });
      if (ok) cleared();
      return;
    }
    saving.current = true;
    setAdding(true);
    up.setNote(null);
    try {
      const r = await addAssetAction(editionId, piece).catch(() => ({ ok: false as const, message: "SponsorX couldn't be reached. Nothing was added — try again in a minute." }));
      up.setNote(r);
      if (r.ok) {
        cleared();
        router.refresh();
      }
    } finally {
      saving.current = false;
      setAdding(false);
    }
  };

  const busy = up.busy || adding;
  const problem = file ? anyFileProblem(file) : null;
  return (
    <form
      aria-label="Add content"
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className={`${label} min-w-0 flex-1 basis-48`}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} required disabled={busy} className={`${field} normal-case`} />
      </label>
      <label className={label}>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)} disabled={busy} className={`${field} normal-case`}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className={label}>
        Source
        <select value={source} onChange={(e) => setSource(e.target.value as SourceKind)} disabled={busy} className={`${field} normal-case`}>
          {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {takesFiles && (
        <label className={`${label} min-w-0 basis-full`}>
          Its file — optional
          <input
            ref={picker}
            type="file"
            disabled={busy}
            className={fileInput}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              up.setNote(null);
            }}
          />
          <span className="text-[11px] normal-case tracking-normal text-faint">
            {file
              ? `${file.name} · ${fileSizeWords(file.size)}`
              : "Any format, up to 2 GB: a photo, a video, a PDF, an InDesign or Photoshop file. It goes straight to private storage. You can also add it later."}
          </span>
          {problem && <span role="alert" className="text-[11px] normal-case tracking-normal text-danger">{problem}</span>}
        </label>
      )}
      <button type="submit" disabled={busy || Boolean(problem)} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {up.busy ? "Uploading…" : adding ? "Adding…" : file ? "Upload and add" : "Add"}
      </button>
      <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-2 py-2 text-xs text-muted hover:text-text disabled:opacity-40">Done</button>
      {up.busy && <div className="basis-full"><UploadProgress step={up.step} progress={up.progress} name={up.name} onCancel={up.cancel} /></div>}
      <div className="basis-full"><FileNoteLine note={up.note} /></div>
    </form>
  );
}

/** One piece's file in the content list: open it, or give it one. */
export function PieceFile({
  editionId, assetId, title, hasFile, mayAttach,
}: { editionId: string; assetId: string; title: string; hasFile: boolean; mayAttach: boolean }) {
  const up = useFileSend();
  const opening = useRef(false);
  const [busyOpen, setBusyOpen] = useState(false);

  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    setBusyOpen(true);
    up.setNote(null);
    try {
      const link = await assetFileAction(assetId).catch((): FileLinkResult => ({ ok: false, message: "SponsorX couldn't be reached — try again in a minute." }));
      if (link.ok) openFileLink(link);
      else up.setNote(link);
    } finally {
      opening.current = false;
      setBusyOpen(false);
    }
  };

  const attach = (file: File) =>
    up.send(file, {
      grant: (contentType, bytes) => presignContentUploadAction(editionId, contentType, bytes),
      save: (key, fileName) => attachAssetFileAction(assetId, key, fileName),
    });

  let control: ReactNode = null;
  if (hasFile) {
    control = (
      <Button variant="secondary" onClick={open} disabled={busyOpen}>
        {busyOpen ? "Opening…" : "Open file"}
      </Button>
    );
  } else if (mayAttach) {
    control = (
      <label className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-line px-3 text-xs font-medium text-text hover:border-next/50 has-disabled:cursor-not-allowed has-disabled:opacity-40">
        {up.busy ? "Uploading…" : "Add its file"}
        <input
          type="file"
          aria-label={`Add the file for ${title}`}
          disabled={up.busy}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void attach(f);
          }}
        />
      </label>
    );
  }
  if (!control && !up.note) return null;
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:items-end">
      {control}
      {up.busy && <UploadProgress step={up.step} progress={up.progress} name={up.name} onCancel={up.cancel} />}
      <FileNoteLine note={up.note} />
    </div>
  );
}
