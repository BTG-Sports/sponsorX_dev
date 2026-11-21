"use client";

import { useRef, useState } from "react";

import { Button } from "./ui";
import { FileNoteLine, UploadProgress, openFileLink, useFileSend } from "./edition-content";
import { presignEditionFileAction, pressPdfAction, recordEditionFileAction, type FileLinkResult } from "@/app/(app)/admin/next/actions";
import {
  COVER_ACCEPT, EDITION_FILE_WORDS, PRESS_PDF_ACCEPT, declaredType, editionFileProblem, type EditionFileKind,
} from "@/lib/edition-files-live";

/* --------------------------------------------------------------------------
   P9-FE-15 — the edition's cover and its press PDF, on /admin/next/editions
   (P9-BE-27). Each can be uploaded and replaced; the file goes straight from
   the browser to private storage on a signed PUT, with a progress bar
   (components/edition-content.tsx `useFileSend`), and is recorded only once
   the API has checked what arrived — a cover must also open as a picture.
   A refused file says why, in the API's words.

   The cover shows as a preview (a short signed link the server page read).
   The press PDF never goes public: "Open" asks for BTG's signed link each
   time, and it comes down as a download by its name.
   -------------------------------------------------------------------------- */

function Picker({
  editionId, which, has, disabledReason,
}: { editionId: string; which: EditionFileKind; has: boolean; disabledReason?: string }) {
  const up = useFileSend();
  const words = EDITION_FILE_WORDS[which];
  const send = (file: File) =>
    up.send(file, {
      problem: (f) => editionFileProblem(which, f),
      grant: (_type, bytes) => presignEditionFileAction(editionId, which, declaredType(which, file), bytes),
      save: (key, fileName) => recordEditionFileAction(editionId, which, key, fileName),
    });
  const off = up.busy || Boolean(disabledReason);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        title={disabledReason}
        className="inline-flex min-h-8 w-fit cursor-pointer items-center rounded-lg border border-line px-3 text-xs font-medium text-text hover:border-next/50 has-disabled:cursor-not-allowed has-disabled:opacity-40"
      >
        {up.busy ? "Uploading…" : has ? `Replace the ${words.name}` : `Upload the ${words.name}`}
        <input
          type="file"
          accept={which === "cover" ? COVER_ACCEPT : PRESS_PDF_ACCEPT}
          aria-label={has ? `Replace the ${words.name}` : `Upload the ${words.name}`}
          disabled={off}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void send(f);
          }}
        />
      </label>
      {up.busy && <UploadProgress step={up.step} progress={up.progress} name={up.name} onCancel={up.cancel} />}
      <FileNoteLine note={up.note} />
      {disabledReason && <p className="text-[11px] text-faint">{disabledReason}</p>}
    </div>
  );
}

export function EditionFiles({
  editionId, cover, pressPdf, canWrite, takesFiles, pressNeed,
}: {
  editionId: string;
  /** The cover on file: its line ("PNG · 1.2 MB · uploaded Nov 19") and a signed preview link, when one could be read. */
  cover: { line: string; previewUrl: string | null } | null;
  /** The press PDF on file: its line ("press.pdf · 48 MB · uploaded Nov 19"). */
  pressPdf: { line: string } | null;
  /** BTG admins upload, replace and open the press PDF; everyone else who reads the edition sees what is on file. */
  canWrite: boolean;
  /** False for a cancelled edition: it takes no file. */
  takesFiles: boolean;
  /** What the press PDF is for ("Only needed if the edition is printed."). */
  pressNeed: string;
}) {
  const opening = useRef(false);
  const [busyOpen, setBusyOpen] = useState(false);
  const [openNote, setOpenNote] = useState<{ ok: boolean; message: string } | null>(null);
  const off = takesFiles ? undefined : "This edition was cancelled, so it takes no files.";

  const openPdf = async () => {
    if (opening.current) return;
    opening.current = true;
    setBusyOpen(true);
    setOpenNote(null);
    try {
      const link = await pressPdfAction(editionId).catch((): FileLinkResult => ({ ok: false, message: "SponsorX couldn't be reached — try again in a minute." }));
      if (link.ok) openFileLink(link);
      else setOpenNote(link);
    } finally {
      opening.current = false;
      setBusyOpen(false);
    }
  };

  return (
    <div className="divide-y divide-line-soft">
      <div className="flex gap-3.5 p-4">
        <div className="grid aspect-[3/4] w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2 text-center text-[10px] leading-tight text-faint">
          {cover?.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived private link; never optimised or cached by the app
            <img src={cover.previewUrl} alt="The edition's cover" className="size-full object-cover" />
          ) : (
            <span className="px-1">{cover ? "Preview unavailable" : "No cover yet"}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-medium">Cover</p>
          <p className={`text-[11px] [overflow-wrap:anywhere] ${cover ? "text-muted" : "font-medium text-warn"}`}>{cover ? cover.line : "No cover yet"}</p>
          <p className="text-[10px] leading-relaxed text-faint">
            {EDITION_FILE_WORDS.cover.rule}. {EDITION_FILE_WORDS.cover.where}
          </p>
          {canWrite && <Picker editionId={editionId} which="cover" has={Boolean(cover)} disabledReason={off} />}
        </div>
      </div>

      <div className="space-y-1.5 p-4">
        <p className="text-xs font-medium">Press PDF</p>
        <p className={`text-[11px] [overflow-wrap:anywhere] ${pressPdf ? "text-muted" : "text-faint"}`}>{pressPdf ? pressPdf.line : `No press PDF yet. ${pressNeed}`}</p>
        <p className="text-[10px] leading-relaxed text-faint">
          {EDITION_FILE_WORDS["press-pdf"].rule}. {EDITION_FILE_WORDS["press-pdf"].where}
        </p>
        {canWrite && (
          <div className="flex flex-wrap items-start gap-2">
            {pressPdf && (
              <Button variant="secondary" onClick={openPdf} disabled={busyOpen}>
                {busyOpen ? "Opening…" : "Open the press PDF"}
              </Button>
            )}
            <Picker editionId={editionId} which="press-pdf" has={Boolean(pressPdf)} disabledReason={off} />
          </div>
        )}
        <FileNoteLine note={openNote} />
      </div>
    </div>
  );
}
