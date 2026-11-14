"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { closeSupportAction, replyToSupportAction } from "@/app/(app)/admin/support/[id]/reply-actions";
import { MAX_REPLY, replyProblem } from "@/lib/support-inbox-live";

/* --------------------------------------------------------------------------
   POL-FE-41 — the reply box and "Mark closed" on a support message.
   Send keeps the reply with the message and emails it to the sender from
   noreply@ (the message becomes Answered); the page then re-reads, so the
   reply appears in the thread above. Mark closed is for a message that
   needs nothing more; a reply after closing reopens it as Answered.
   -------------------------------------------------------------------------- */

export function SupportReply({ messageId, email, status, ready }: {
  messageId: string;
  /** Where the reply goes — shown, so BTG knows who reads it. */
  email: string;
  status: string;
  /** False while the message's files are still uploading: the API refuses replies then. */
  ready: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problem = replyProblem(body);
  const closed = status === "CLOSED";

  const send = () =>
    start(async () => {
      setError(null);
      setSent(null);
      const r = await replyToSupportAction(messageId, body).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing was sent." }));
      if (!r.ok) return setError(r.message);
      setBody("");
      setSent(`Sent to ${email}.`);
      router.refresh();
    });

  const close = () =>
    start(async () => {
      setError(null);
      setSent(null);
      const r = await closeSupportAction(messageId).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed." }));
      if (!r.ok) return setError(r.message);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <label htmlFor="support-reply" className="block text-xs text-muted">
        Your reply goes to <span className="font-medium text-text">{email}</span> from noreply@sponsorx.net, and is kept here.
        {closed && " Sending it reopens this message as Answered."}
      </label>
      <textarea
        id="support-reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        maxLength={MAX_REPLY + 500}
        disabled={!ready || pending}
        placeholder={ready ? "Write your reply…" : "Replies open once the message's files have arrived."}
        className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!ready || pending || !!problem} onClick={send}
          className="min-h-9 rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? "Working…" : "Send reply"}
        </button>
        {!closed && (
          <button type="button" disabled={!ready || pending} onClick={close}
            className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40">
            Mark closed
          </button>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-faint">{body.trim().length.toLocaleString("en-US")} / {MAX_REPLY.toLocaleString("en-US")}</span>
        {error && <p role="alert" className="basis-full text-[11px] text-danger">{error}</p>}
        {sent && <p role="status" className="basis-full text-[11px] text-accent">{sent}</p>}
      </div>
    </div>
  );
}
