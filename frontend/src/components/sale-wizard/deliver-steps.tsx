"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type DragEvent } from "react";

import { markDeliveredAction, requestProofUploadAction } from "@/app/(app)/seller-sales-actions";
import { Arrow, Tick, d } from "@/components/wizard-kit";
import { CONFIRM_HOURS, linkProblem, proofProblem } from "@/lib/seller-orders-live";

/* --------------------------------------------------------------------------
   POL-FE-96 — "Mark delivered" as three short steps right in the page,
   instead of the old pop-up over it:

     1  What did you do?   the note the sponsor reads (required)
     2  Add proof          a photo or PDF (drop or pick), or a link — optional
     3  Send it            what happens next, then the button

   Same writes as seller-mark-delivered.tsx (2S4-BE-07): the photo is a
   presigned PUT straight to the private bucket (requestProofUploadAction),
   then markDeliveredAction with the note, the photo's key and the link.
   A photo the API refuses on opening it (P8-FE-11) is dropped so another
   can be picked. On success the page refreshes; the wizard sees the sale
   move to step 3 and cheers.

   `sample` (the ?demo=sample walk) never uploads or writes: "sending"
   moves the sample to its next state instead.

   Kept for e2e: the note's id `mk-note` and a button named "Mark delivered".
   A busy ref stops a double click sending twice (memory: double-submit-
   needs-a-ref).
   -------------------------------------------------------------------------- */

export function DeliverSteps({ lineId, sponsor, summary, sample = false }: {
  lineId: string;
  sponsor: string;
  /** "Youth basketball clinic · 2 sessions · Oct 10 and Oct 17" */
  summary: string;
  sample?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [photo, setPhoto] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);

  const wrote = note.trim().length > 0;
  const badLink = linkProblem(link);
  const proofDone = Boolean(photo) || (link.trim() !== "" && !badLink);

  const upload = async (f: File) => {
    setError(null);
    const problem = proofProblem({ type: f.type, size: f.size });
    if (problem) return setError(problem);
    if (sample) return setPhoto({ key: "sample", name: f.name });
    setUploading(true);
    try {
      const g = await requestProofUploadAction(lineId, { contentType: f.type, bytes: f.size });
      if (!g.ok) return setError(g.message);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: f });
      } catch {
        return setError("The photo didn't reach storage. Check your connection and try again, or send without it.");
      }
      if (!put.ok) return setError("Storage refused the photo. Try again, or send without it.");
      setPhoto({ key: g.key, name: f.name });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !uploading && !pending) void upload(f);
  };

  const submit = () => {
    if (busy.current) return;
    setError(null);
    if (!wrote) {
      setNudge((n) => n + 1);
      noteBox.current?.focus();
      return setError(`Say what you delivered first — ${sponsor} reads this note.`);
    }
    if (badLink) return setError(badLink);
    busy.current = true;
    start(async () => {
      try {
        if (sample) {
          router.push(`${window.location.pathname}?demo=sample&as=checking`, { scroll: false });
          return;
        }
        const r = await markDeliveredAction(lineId, { note, proofKey: photo?.key ?? null, proofLink: link.trim() || null });
        if (!r.ok) {
          if (photo && r.photoRefused) setPhoto(null);
          setError(r.message);
          return;
        }
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  const off = pending || uploading;

  return (
    <form
      className="sx-sl-form"
      aria-label="Mark delivered"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* 1 — what happened */}
      <div className="sx-sl-block sx-cw-rise" data-done={wrote ? "" : undefined} style={d(0.2)}>
        <BlockHead n={1} done={wrote} title="What did you do?" tag="Required" />
        <p className="sx-sl-block-help">One or two lines {sponsor} can check it against: {summary}.</p>
        <textarea
          ref={noteBox}
          id="mk-note"
          rows={3}
          maxLength={2000}
          value={note}
          disabled={pending}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Both clinics held, Oct 10 and 17, 18 kids each — your banner up both days"
          className="sx-sl-input"
          data-nudge={nudge > 0 && !wrote ? (nudge % 2 ? "a" : "b") : undefined}
          aria-describedby="mk-note-count"
        />
        <p id="mk-note-count" className="mt-1.5 text-right text-[11px] text-faint">{note.length} / 2000</p>
      </div>

      {/* 2 — proof */}
      <div className="sx-sl-block sx-cw-rise" data-done={proofDone ? "" : undefined} style={d(0.28)}>
        <BlockHead n={2} done={proofDone} title="Add proof" tag="Optional" />
        <p className="sx-sl-block-help">A photo or a link helps if {sponsor} has a question later.</p>
        <input
          ref={file}
          id="mk-photo"
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <button
          type="button"
          className="sx-sl-drop"
          data-drag={drag ? "" : undefined}
          data-has={photo ? "" : undefined}
          disabled={off}
          onClick={() => file.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <span aria-hidden="true" className="sx-sl-drop-icon">{photo ? <Tick /> : <Camera />}</span>
          <span className="min-w-0 text-left">
            <strong className="block truncate text-sm text-text">
              {uploading ? "Uploading…" : photo ? photo.name : "Drop a photo here, or choose one"}
            </strong>
            <span className="block text-[11px] text-muted">{photo ? "Attached · press to change it" : "JPEG, PNG or PDF, up to 10 MB"}</span>
          </span>
        </button>
        {showLink ? (
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold text-muted">Link (https)</span>
            <input
              type="url"
              inputMode="url"
              value={link}
              disabled={pending}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
              className="sx-sl-input mt-1"
            />
            {link.trim() !== "" && badLink && <span className="mt-1 block text-[11px] text-warn">{badLink}</span>}
          </label>
        ) : (
          <button type="button" className="sx-sl-textlink mt-2.5" onClick={() => setShowLink(true)} disabled={pending}>
            + Add a link instead
          </button>
        )}
      </div>

      {/* 3 — send */}
      <div className="sx-sl-block sx-sl-send sx-cw-rise" data-ready={wrote ? "" : undefined} style={d(0.36)}>
        <BlockHead n={3} done={false} title="Send it" />
        <ol className="sx-sl-next">
          <li><span aria-hidden="true">→</span><span>{sponsor} gets your note and has <strong>{CONFIRM_HOURS} hours</strong> to confirm it or report a problem.</span></li>
          <li><span aria-hidden="true">→</span><span>If they don&rsquo;t answer in time, it counts as <strong>confirmed</strong> automatically.</span></li>
          <li><span aria-hidden="true">→</span><span>Once it&rsquo;s confirmed, your share moves to Payouts.</span></li>
        </ol>
        {error && <p role="alert" className="sx-cw-msg mt-3" data-tone="danger">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className="sx-cw-go sx-sl-big" data-ready={wrote && !off ? "" : undefined} aria-disabled={!wrote || off}>
            {pending ? "Marking…" : "Mark delivered"} {!pending && <Arrow />}
          </button>
          {!wrote && <span className="text-xs text-muted">Write what you did in step 1 first.</span>}
          {sample && <span className="text-xs text-faint">Sample — nothing is sent.</span>}
        </div>
      </div>
    </form>
  );
}

function BlockHead({ n, done, title, tag }: { n: number; done: boolean; title: string; tag?: string }) {
  return (
    <p className="sx-cw-label">
      <span className="sx-cw-label-n sx-sl-n" data-done={done ? "" : undefined} aria-hidden="true">{done ? <Tick /> : n}</span>
      {title}
      {tag && <span className="sx-sl-chip">{tag}</span>}
    </p>
  );
}

function Camera() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
