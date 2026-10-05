"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  CAPTION_MAX,
  CREATIVE_ACCEPT,
  CREATIVE_TYPES_WORDS,
  disclosureHint,
  missingDisclosures,
} from "@/lib/content-checks";

/* --------------------------------------------------------------------------
   DeliverableUpload — the athlete's upload, straight to R2 (P5-FE-03, §24).

   Built for the case in the task: a phone that loses signal halfway. The
   flow is four steps, and each one can fail and be retried ON ITS OWN:

     1. start    — ask for a presigned PUT (the API picks the key)
     2. upload   — PUT the bytes to R2 with real progress (XHR, not fetch —
                   fetch has no upload progress)
     3. record   — tell the API the upload landed (a new creative version)
     4. submit   — with the caption: NOT_STARTED → DRAFT_SUBMITTED, or a
                   resubmission while it is back with the athlete. The API
                   runs the automatic checks (P5-BE-09) — a failing draft
                   comes straight back with each failure in words.

   A dropped connection during 2 keeps the chosen file and offers "Retry
   upload" (with a fresh URL — presigns expire). If 2 finished but 3 failed,
   the key is kept in sessionStorage, so even a reload can finish recording
   it instead of making the athlete upload a 200 MB video twice. Nothing
   here is optimistic: the page refreshes from Postgres when it's done.
   -------------------------------------------------------------------------- */

type Step = "idle" | "start" | "upload" | "record" | "submit" | "done";
type Fail = { ok: false; message: string };
type Ok<T> = { ok: true } & T;

const ACCEPT = "image/*,video/*,application/pdf";
/* P5-BE-09 — an athlete's draft takes only the types the automatic checks
   allow; anything else would just come back as a failed check. */
const DRAFT_ACCEPT = CREATIVE_ACCEPT;
const MAX_BYTES = 2 * 1024 ** 3; // 2 GB — a long 4K reel fits; a mistake doesn't

const pendingKey = (id: string) => `sx:pending-upload:${id}`;

const noSubscribe = () => () => {};
function readPending(id: string): string | null {
  try {
    return window.sessionStorage.getItem(pendingKey(id));
  } catch {
    return null; // storage blocked — the retry buttons still work this visit
  }
}

function fmtBytes(n: number): string {
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function DeliverableUpload({
  deliverableId,
  firstUpload,
  label,
  presign,
  register,
  submit,
  captioned = false,
  requiredDisclosures = [],
  initialCaption = "",
  canResubmitAsIs = false,
  accept,
}: {
  deliverableId: string;
  /** NOT_STARTED — this upload also submits the draft. */
  firstUpload: boolean;
  /** P5-BE-09 — an athlete's draft: a caption box, and every upload is
   *  submitted with it (a first submission, or a resubmission while it is
   *  back with the athlete) so the automatic checks run. Off for other
   *  uploads that reuse this component (edition ad artwork). */
  captioned?: boolean;
  label: string;
  /** P9-BE-22 — the size is passed too; an upload that signs it (edition
   *  ad artwork) uses it, the others ignore it. */
  presign: (id: string, contentType: string, bytes: number) => Promise<Ok<{ url: string; key: string }> | Fail>;
  register: (id: string, key: string) => Promise<Ok<{ version: number }> | Fail>;
  submit: (id: string, caption: string) => Promise<Ok<{ state: string; passed?: boolean }> | Fail>;
  /** P5-BE-09 — what the caption must carry (the accepted offer's terms). */
  requiredDisclosures?: string[];
  /** The caption last submitted, to edit rather than retype. */
  initialCaption?: string;
  /** Back with the athlete with a file already there: resubmit it with a
   *  corrected caption, no new upload. */
  canResubmitAsIs?: boolean;
  /** The file picker's accept list, where an upload allows fewer types
   *  (edition ad artwork: PDF, PNG or JPG). */
  accept?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState(initialCaption);
  const missing = missingDisclosures(caption, requiredDisclosures);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<{ at: Step; message: string } | null>(null);
  /* An upload that landed but was never recorded — finish it, don't redo
     it. Read from sessionStorage (null on the server), then owned locally. */
  const stored = useSyncExternalStore(noSubscribe, () => readPending(deliverableId), () => null);
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const pending = override === undefined ? stored : override;

  const remember = (key: string | null) => {
    setOverride(key);
    try {
      if (key) window.sessionStorage.setItem(pendingKey(deliverableId), key);
      else window.sessionStorage.removeItem(pendingKey(deliverableId));
    } catch {
      /* ignore */
    }
  };

  const put = (url: string, f: File) =>
    new Promise<void>((resolve, reject) => {
      const req = new XMLHttpRequest();
      xhr.current = req;
      req.open("PUT", url);
      req.setRequestHeader("Content-Type", f.type);
      req.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      req.onload = () =>
        req.status >= 200 && req.status < 300
          ? resolve()
          : reject(new Error(`Storage refused the upload (HTTP ${req.status}).`));
      req.onerror = () => reject(new Error("The connection dropped during the upload."));
      req.ontimeout = () => reject(new Error("The upload timed out."));
      req.onabort = () => reject(new Error("Upload cancelled."));
      req.send(f);
    });

  /** Steps 3–4, from a key that is already in R2. */
  const finish = async (key: string) => {
    setStep("record");
    const r = await register(deliverableId, key);
    if (!r.ok) {
      setError({ at: "record", message: r.message });
      return;
    }
    remember(null);
    if (firstUpload || captioned) {
      await submitNow();
      return;
    }
    setStep("done");
    router.refresh();
  };

  /** Step 4 alone — also the "resubmit as it is" path. */
  async function submitNow() {
    setError(null);
    setStep("submit");
    const s = await submit(deliverableId, caption);
    if (!s.ok) {
      setError({ at: "submit", message: s.message });
      return;
    }
    setStep("done");
    router.refresh();
  }

  /** Steps 1–4 for the chosen file. */
  const run = async (f: File) => {
    setError(null);
    setProgress(0);
    setStep("start");
    const p = await presign(deliverableId, f.type || "application/octet-stream", f.size);
    if (!p.ok) {
      setError({ at: "start", message: p.message });
      return;
    }
    setStep("upload");
    try {
      await put(p.url, f);
    } catch (e) {
      setError({ at: "upload", message: e instanceof Error ? e.message : "The upload failed." });
      return;
    }
    remember(p.key);
    await finish(p.key);
  };

  const choose = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) {
      setFile(null);
      setError({ at: "idle", message: `That file is ${fmtBytes(f.size)} — the limit is ${fmtBytes(MAX_BYTES)}.` });
      return;
    }
    setFile(f);
  };

  const busy = step !== "idle" && step !== "done" && !error;

  return (
    <div className="space-y-3">
      {pending && !busy && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-[11px] leading-relaxed text-text">
          An upload finished but wasn&rsquo;t recorded yet.
          <button
            type="button"
            onClick={() => {
              setError(null);
              void finish(pending);
            }}
            className="ml-1.5 font-semibold text-warn underline underline-offset-2"
          >
            Finish recording it
          </button>
        </div>
      )}

      <label
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          file ? "border-athlete/50 bg-athlete/5" : "border-line hover:border-athlete/40",
          busy ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
      >
        <input
          ref={input}
          type="file"
          accept={accept ?? (captioned ? DRAFT_ACCEPT : ACCEPT)}
          className="sr-only"
          disabled={busy}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <span className="text-xs font-semibold">{file ? file.name : label}</span>
        <span className="text-[11px] text-muted">
          {file
            ? fmtBytes(file.size)
            : captioned
              ? `A ${CREATIVE_TYPES_WORDS} · up to 2 GB · goes straight to secure storage`
              : "Photo, video or PDF · up to 2 GB · goes straight to secure storage"}
        </span>
      </label>

      {/* P5-BE-09 — the caption the athlete will post, checked on submit. */}
      {captioned && (
      <label className="block">
        <span className="text-[11px] font-medium text-muted">Caption you&rsquo;ll post</span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
          disabled={busy}
          rows={3}
          maxLength={CAPTION_MAX}
          placeholder={requiredDisclosures.length ? `e.g. Game day with the team ${requiredDisclosures.join(" ")}` : "What you'll write with the post"}
          className="mt-1 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed outline-none transition-colors focus:border-athlete/60 disabled:opacity-60"
        />
        <span className={`mt-1 block text-[10px] leading-relaxed ${missing.length && caption.trim() ? "text-warn" : "text-faint"}`}>
          {disclosureHint(requiredDisclosures)}
          {missing.length > 0 && caption.trim() && ` Still missing: ${missing.join(", ")}.`}
        </span>
      </label>
      )}

      {(step === "upload" || (error?.at === "upload" && progress > 0)) && (
        <div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Upload progress"
          >
            <div className="h-full rounded-full bg-athlete transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[10px] tabular-nums text-faint">{progress}% uploaded</p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          {error.message}
          {error.at !== "idle" && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                if ((error.at === "record" || error.at === "submit") && pending) void finish(pending);
                else if (error.at === "submit") void submitNow();
                else if (file) void run(file);
              }}
              className="mt-1.5 block font-semibold underline underline-offset-2"
            >
              {error.at === "upload" ? "Retry upload" : error.at === "record" ? "Retry recording it" : "Try again"}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!file || busy}
          onClick={() => file && void run(file)}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {step === "start"
            ? "Starting…"
            : step === "upload" && !error
              ? `Uploading… ${progress}%`
              : step === "record" && !error
                ? "Recording…"
                : step === "submit" && !error
                  ? "Submitting…"
                  : firstUpload
                    ? "Upload and submit"
                    : captioned
                      ? "Upload new version and resubmit"
                      : "Upload new version"}
        </button>
        {step === "upload" && !error && (
          <button
            type="button"
            onClick={() => xhr.current?.abort()}
            className="rounded-lg border border-line px-3 py-2.5 text-xs font-medium text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
        )}
      </div>
      {captioned && canResubmitAsIs && (
        <button
          type="button"
          disabled={busy || Boolean(file)}
          onClick={() => void submitNow()}
          className="w-full rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Resubmit the current version with this caption
        </button>
      )}
      {captioned && (
        <p className="text-[10px] leading-relaxed text-faint">
          Submitting runs quick automatic checks — a file, its type, and the
          caption&rsquo;s disclosures. If one fails, it comes straight back here
          saying what to fix, before BTG reviews it.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ proof */

export function PublishProof({
  deliverableId,
  publish,
}: {
  deliverableId: string;
  publish: (id: string, url: string) => Promise<Ok<{ state: string }> | Fail>;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    const r = await publish(deliverableId, url);
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.message);
  };
  return (
    <div className="space-y-2.5">
      <label className="block">
        <span className="text-[11px] font-medium text-muted">Link to the live post</span>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.instagram.com/p/…"
          className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none transition-colors focus:border-athlete/60"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !url.trim()}
        onClick={go}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Recording…" : "Mark as published"}
      </button>
      <p className="text-[10px] leading-relaxed text-faint">
        BTG checks the live post before it counts toward your earning.
      </p>
    </div>
  );
}
