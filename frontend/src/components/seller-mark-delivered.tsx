"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { markDeliveredAction, requestProofUploadAction } from "@/app/(app)/seller-sales-actions";
import { linkProblem, proofProblem } from "@/lib/seller-orders-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   2S4-FE-03 / 2S4-FE-04 — "Mark delivered" and its dialog (Orders.dc.html,
   mark view). Live (2S4-BE-07):

     the photo   → requestProofUploadAction (POST /sales/:id/proof), then the
                   browser PUTs the file straight to the private bucket
     the mark    → markDeliveredAction (POST /sales/:id/delivered) with the
                   note, the photo's key and/or a link

   The sponsor then has 24 hours to confirm or report a problem; if they
   don't answer, it counts as confirmed.
   -------------------------------------------------------------------------- */

const primary =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-line px-3.5 text-xs font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

export function SellerMarkDelivered({
  lineId,
  applies,
  why,
  sponsor,
  summary,
}: {
  /** The order line — what the API's delivery routes take. */
  lineId: string;
  /** Whether this line can be marked at all (only while in delivery). */
  applies: boolean;
  /** The reason shown beside the button. */
  why: string;
  sponsor: string;
  /** "Youth basketball clinic with Riley Carter · 2 sessions · Oct 10 and Oct 17" */
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={primary} disabled={!applies} title={applies ? undefined : why} onClick={() => setOpen(true)}>
        Mark delivered
      </button>
      <span className="text-xs text-muted">{why}</span>
      {open && <MarkDialog lineId={lineId} sponsor={sponsor} summary={summary} onClose={() => setOpen(false)} />}
    </div>
  );
}

function MarkDialog({ lineId, sponsor, summary, onClose }: { lineId: string; sponsor: string; summary: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [photo, setPhoto] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const upload = async (f: File) => {
    setError(null);
    const problem = proofProblem({ type: f.type, size: f.size });
    if (problem) return setError(problem);
    setUploading(true);
    try {
      const g = await requestProofUploadAction(lineId, { contentType: f.type, bytes: f.size });
      if (!g.ok) return setError(g.message);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: f });
      } catch {
        return setError("The photo didn't reach storage. Check your connection and try again — or mark delivered without it.");
      }
      if (!put.ok) return setError("Storage refused the photo. Try again, or mark delivered without it.");
      setPhoto({ key: g.key, name: f.name });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const submit = () => {
    setError(null);
    if (!note.trim()) return setError("Say what was delivered — the sponsor reads this note.");
    const badLink = linkProblem(link);
    if (badLink) return setError(badLink);
    start(async () => {
      const r = await markDeliveredAction(lineId, { note, proofKey: photo?.key ?? null, proofLink: link.trim() || null });
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };

  const busy = pending || uploading;
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="mk-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
        <form
          className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 id="mk-title" className="text-base font-semibold tracking-tight">Mark this line delivered?</h2>
          <p className="text-xs text-muted">{summary}</p>
          <label htmlFor="mk-note" className="block text-sm font-semibold">
            What happened <span className="font-medium text-warn">(required)</span>
          </label>
          <textarea
            id="mk-note"
            data-autofocus
            rows={3}
            required
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Both clinics held, Oct 10 and 17, 18 kids each"
            className="-mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
          />
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface px-4 py-4 text-center text-xs text-muted">
            <span className="text-sm font-medium text-text">
              Add a photo or a link <span className="font-normal text-muted">(optional)</span>
            </span>
            <span>Helps if {sponsor} has a question later.</span>
            <input
              ref={file}
              id="mk-photo"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <span className="flex flex-wrap justify-center gap-2">
              <button type="button" className={secondary} disabled={busy} onClick={() => file.current?.click()}>
                {uploading ? "Uploading…" : photo ? "Change photo" : "Choose photo"}
              </button>
              <button type="button" className={secondary} disabled={busy} onClick={() => setShowLink(true)} aria-expanded={showLink}>
                Add link
              </button>
            </span>
            {photo && <span className="text-[11px] text-accent" role="status">{photo.name} attached</span>}
            {showLink && (
              <label className="mt-1 block w-full text-left">
                <span className="text-[11px] font-medium text-muted">Link (https)</span>
                <input
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://"
                  className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-muted">
            {sponsor} is asked to confirm, and has 24 hours to confirm or report a problem. If they don’t answer in time, it counts as confirmed.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
            <button type="submit" className={primary} disabled={busy}>
              {pending ? "Marking…" : "Mark delivered"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
