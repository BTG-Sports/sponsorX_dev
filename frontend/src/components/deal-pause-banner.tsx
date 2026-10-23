"use client";

import { useRouter } from "next/navigation";

import { PrivateFileUpload, type UploadDone, type UploadGrant } from "@/components/private-file-upload";
import {
  DISPUTE_FILE_ACCEPT,
  disputeFileProblem,
  pauseWords,
  raisedByWords,
  type ApiDealDispute,
} from "@/lib/deal-disputes-live";
import {
  DOCUMENTS_LIMIT_WORDS,
  GUARDIAN_PICK_WARD_NOTE,
  documentsCountWords,
  documentsLimitReached,
  fileSizeWords,
} from "@/lib/athlete-order-pause";
import { dayOf, type Tone } from "@/lib/order-automation-live";

/* --------------------------------------------------------------------------
   DealPauseBanner — P8-FE-06. The pause on the athlete's order (and the
   guardian's, acting for a minor): what BTG raised, what it asked for, the
   documents sent so far, the upload while it is still open, and BTG's
   decision once there is one.

   The order read says nothing about a pause; the page joins the dispute by
   orderId (latestDisputeFor) and hands it here. Uploads go browser → private
   bucket through PrivateFileUpload: the action asks for a presigned PUT, the
   browser sends the bytes, the action confirms — then the page refreshes so
   the list is Postgres's, not this island's.
   -------------------------------------------------------------------------- */

const BOX: Record<Tone, { box: string; title: string }> = {
  primary: { box: "border-primary/40 bg-primary/8", title: "text-primary-soft" },
  warn: { box: "border-warn/40 bg-warn/8", title: "text-warn" },
  accent: { box: "border-accent/40 bg-accent/10", title: "text-accent" },
  danger: { box: "border-danger/40 bg-danger/10", title: "text-danger" },
  neutral: { box: "border-line bg-surface", title: "text-text" },
};

export function DealPauseBanner({
  dispute: d,
  viewerIsGuardian,
  canUpload,
  request,
  confirm,
}: {
  dispute: ApiDealDispute;
  /** A guardian acting for the minor — the words say "you (as their guardian)". */
  viewerIsGuardian: boolean;
  /** The athlete's own login, or the guardian acting for them. */
  canUpload: boolean;
  request: (disputeId: string, file: { filename: string; contentType: string; bytes: number }) => Promise<UploadGrant>;
  confirm: (disputeId: string, documentId: string) => Promise<UploadDone>;
}) {
  const router = useRouter();
  const words = pauseWords(d, viewerIsGuardian);
  const skin = BOX[words.tone];
  const sent = d.documents.length;
  const full = documentsLimitReached(sent);

  return (
    <section
      role="status"
      aria-label={d.paused ? "Deal paused" : "BTG's decision"}
      data-dispute-state={d.state}
      className={`space-y-3 rounded-xl border px-4 py-3.5 ${skin.box}`}
    >
      <div>
        <p className={`text-sm font-semibold ${skin.title}`}>{words.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-text/85">{words.text}</p>
      </div>

      {words.ask && (
        <div>
          <p className="text-[11px] font-medium text-muted">What BTG asked for</p>
          <p className="mt-1 rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{words.ask}</p>
        </div>
      )}

      <div>
        <p className="text-[11px] font-medium text-muted">The concern</p>
        <p className="mt-1 text-[13px] leading-relaxed text-text/85">{d.reason}</p>
        <p className="mt-1 text-[11px] text-faint">
          Raised by {raisedByWords(d)} · opened {dayOf(d.openedAt)}
          {d.resolvedAt ? ` · decided ${dayOf(d.resolvedAt)}` : ""}
        </p>
      </div>

      <div>
        <p className="text-[11px] font-medium text-muted">
          Documents sent{sent > 0 ? ` · ${documentsCountWords(sent)}` : ""}
        </p>
        {sent === 0 ? (
          <p className="mt-1 text-[13px] text-text/85">No documents sent yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line-soft rounded-lg border border-line bg-bg">
            {d.documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3.5 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-text" title={doc.filename}>{doc.filename}</span>
                <span className="text-[11px] text-muted tabular-nums">
                  {fileSizeWords(doc.bytes)} · {dayOf(doc.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {d.paused && canUpload && !full && (
        <PrivateFileUpload
          label={sent === 0 ? "Send a document" : "Send another document"}
          hint="Each file goes straight to BTG's private store."
          accept={DISPUTE_FILE_ACCEPT}
          problem={disputeFileProblem}
          typesLabel="PDF, JPEG, PNG or WebP, up to 10 MB"
          moreLabel="Send another file"
          request={(file) => request(d.id, file)}
          confirm={(id) => confirm(d.id, id)}
          onDone={() => router.refresh()}
        />
      )}
      {d.paused && canUpload && full && (
        <p className="text-[12px] leading-relaxed text-muted">{DOCUMENTS_LIMIT_WORDS}</p>
      )}
      {d.paused && !canUpload && (
        <p className="text-[12px] leading-relaxed text-muted">{GUARDIAN_PICK_WARD_NOTE}</p>
      )}
    </section>
  );
}
