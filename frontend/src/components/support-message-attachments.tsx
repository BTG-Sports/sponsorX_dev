"use client";

import { useState, useTransition } from "react";

import { openAttachmentAction } from "@/app/(app)/admin/support/[id]/actions";
import { attachmentProblem, type ApiSupportAttachment } from "@/lib/support-message-live";

/* --------------------------------------------------------------------------
   2S1-FE-14 — "Open" on a support message's attachment: openAttachmentAction
   asks the API for the file's five-minute, audited link, and the browser
   opens it in a new tab (noopener). A file that never finished uploading
   says so without asking; a refusal is shown in the API's words.
   -------------------------------------------------------------------------- */

export function OpenAttachment({ messageId, attachment }: { messageId: string; attachment: ApiSupportAttachment }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problem = attachmentProblem(attachment);
  const open = () => {
    setError(null);
    start(async () => {
      const res = await openAttachmentAction(messageId, attachment.id);
      if (!res.ok) return setError(res.message);
      window.open(res.url, "_blank", "noopener");
    });
  };
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" onClick={open} disabled={pending || Boolean(problem)} aria-label={`Open ${attachment.filename}`}
        title={problem ?? "Opens in a new tab through a five-minute link"}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 md:min-h-9 md:w-auto md:text-xs">
        {pending ? "Opening…" : "Open"}
      </button>
      {problem && <span className="text-[11px] text-warn">{problem}</span>}
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
