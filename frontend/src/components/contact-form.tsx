"use client";

import { useState, useTransition } from "react";

import { dropAttachmentAction, finishContactAction, submitContactAction, type ContactInput } from "@/app/(public)/contact/actions";
import { CONTACT_TOPICS, idFileProblem, whenLabel, type ContactTopic } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   Contact BTG — 2S1-FE-10 (design Contact.dc.html, "form" and "sent"). The
   form island. LIVE (2S1-BE-16): Send posts the message (submitContactAction).
   With attachments, the API hands back a presigned PUT for each; the browser
   sends the files straight to the private bucket, then finishContactAction
   queues the message. A file that won't upload can be left out
   (dropAttachmentAction). "Sent ✓" shows only once the API says it's queued.
   -------------------------------------------------------------------------- */

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const MAX_FILES = 3;

type Pending = { token: string; failed: { attachmentId: string; filename: string }[] };

export function ContactForm({ topic: initialTopic }: { topic: ContactTopic }) {
  const [topic, setTopic] = useState<ContactTopic>(initialTopic);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [stuck, setStuck] = useState<Pending | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    setError(null);
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      const problem = idFileProblem({ type: f.type, size: f.size });
      if (problem) return setError(`${f.name}: ${problem}`);
      if (next.length >= MAX_FILES) return setError(`At most ${MAX_FILES} files.`);
      next.push(f);
    }
    setFiles(next);
  };

  const finish = async (token: string) => {
    const done = await finishContactAction(token);
    if (!done.ok) return setError(done.message);
    setStuck(null);
    setSentAt(new Date().toISOString());
  };

  const send = () =>
    start(async () => {
      setError(null);
      const input: ContactInput = {
        name, email, topic: topic.toUpperCase() as ContactInput["topic"], message,
        attachments: files.map((f) => ({ filename: f.name, contentType: f.type, bytes: f.size })),
      };
      const r = await submitContactAction(input).catch(() => ({ ok: false as const, message: "We couldn’t reach SponsorX. Nothing was sent — try again." }));
      if (!r.ok) return setError(r.message);
      if (r.queued || !r.token) return setSentAt(new Date().toISOString());
      const failed: Pending["failed"] = [];
      /* The API grants uploads in the order the files were declared. */
      for (const [i, u] of r.uploads.entries()) {
        const file = files[i];
        try {
          const put = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": u.contentType }, body: file });
          if (!put.ok) failed.push({ attachmentId: u.attachmentId, filename: u.filename });
        } catch {
          failed.push({ attachmentId: u.attachmentId, filename: u.filename });
        }
      }
      if (failed.length) {
        setStuck({ token: r.token, failed });
        return setError(`${failed.map((f) => f.filename).join(", ")} didn’t upload. Send without ${failed.length === 1 ? "it" : "them"}, or try again.`);
      }
      await finish(r.token);
    });

  const sendWithout = () =>
    start(async () => {
      if (!stuck) return;
      setError(null);
      for (const f of stuck.failed) {
        const d = await dropAttachmentAction(stuck.token, f.attachmentId);
        if (!d.ok) return setError(d.message);
      }
      await finish(stuck.token);
    });

  if (sentAt) {
    return (
      <section role="status" aria-label="Message sent" className="space-y-2 rounded-xl border border-success/40 bg-success/6 p-5">
        <p className="text-base font-bold text-success">Sent ✓</p>
        <p className="text-sm leading-relaxed">We&rsquo;ve got your message and will reply by email.</p>
        <p className="text-xs leading-relaxed text-muted">
          Topic: {CONTACT_TOPICS.find((t) => t.key === topic)!.label} · sent {whenLabel(sentAt)} · a copy is on its way to {email}
        </p>
      </section>
    );
  }

  const valid = name.trim() && /\S+@\S+\.\S+/.test(email) && message.trim();
  return (
    <form aria-label="Message BTG" className="space-y-3.5 rounded-xl border border-line bg-surface p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <fieldset>
        <legend className="mb-2 text-xs font-medium">What is it about?</legend>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TOPICS.map((t) => (
            <label key={t.key}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-bg px-3.5 text-sm has-checked:border-primary-soft has-checked:bg-primary/12">
              <input type="radio" name="topic" value={t.key} checked={t.key === topic} onChange={() => setTopic(t.key)} className="accent-[var(--sx-primary)]" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-medium">
          Your name
          <input type="text" name="name" className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label className="flex flex-col text-xs font-medium">
          Email for our reply
          <input type="email" name="email" className={field} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        </label>
      </div>
      <label className="flex flex-col text-xs font-medium">
        Message
        <textarea name="message" rows={5} maxLength={5000} className={`${field} resize-y leading-normal`} value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what happened, and anything that helps — a date, a court order you can send." />
      </label>
      <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
        <span className="text-sm font-medium text-text">
          Attachments <span className="font-normal text-muted">(optional)</span>
        </span>
        <span>Photos or PDFs that help us understand — up to {MAX_FILES}, 10 MB each. They&rsquo;re stored privately.</span>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-text">
                {f.name}
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-[11px] text-muted underline">Remove</button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_FILES && (
          <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">
            Add files
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" disabled={pending || !valid} aria-busy={pending}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? "Sending…" : "Send"}
        </button>
        {stuck && (
          <button type="button" onClick={sendWithout} disabled={pending} className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2">
            Send without {stuck.failed.length === 1 ? "that file" : "those files"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
