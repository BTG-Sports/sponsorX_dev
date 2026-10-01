import { Badge, BlockedNotice } from "@/components/ui";
import { CONTACT_TOPICS, SUPPORT_EMAIL, contactTopic, whenLabel } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   /contact — Contact BTG, 2S1-FE-10 (Claude Design Contact.dc.html, "form"
   and "sent"). Public (no login): the way to reach a person at BTG for
   anything that must never be automated — a disputed guardianship first,
   then account and payment questions. Linked from the guardian pages, the
   current guardian's request card, and (once they exist) the decline and
   rejection emails and the account pages. ?topic=guardianship|account|
   payment|other pre-picks the topic.

   SCAFFOLD — 2S1-BE-16 isn't built, and the support mailbox it delivers to
   isn't chosen (2S1-OPS-01), so the address is shown as being set up, not as
   a live one. When both land:
     Writes POST /public/contact     {name, email, topic, message} + attachments (presigned, private bucket);
                                     rate-limited, queued through the worker, never sent on the request path
   Until then the form is local and Send is off. ?demo=sent previews the
   confirmation and never reaches the API.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Contact BTG · SponsorX" };

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const NOT_YET = "Sending goes live with 2S1-BE-16 — nothing is sent yet.";

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ demo?: string | string[]; topic?: string | string[] }> }) {
  const sp = await searchParams;
  const sent = sp.demo === "sent";
  const topic = contactTopic(sp.topic);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      <BlockedNotice>
        Not live yet — messages start reaching BTG with 2S1-BE-16 (the contact form) once the support mailbox is set up (2S1-OPS-01).
        {sent ? " This confirmation is a preview: nothing was sent." : " You can fill the form in, but Send is off."}
      </BlockedNotice>

      <div>
        <h1 className="text-2xl font-bold sm:text-[28px]">Contact BTG</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Questions about guardianship, your account or a payment. A person at BTG reads every message.</p>
      </div>

      <section aria-label="Email address" className="space-y-1.5 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <p className="text-xs text-muted">Or email us directly</p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="select-all text-base font-semibold">{SUPPORT_EMAIL.address}</span>
          {!SUPPORT_EMAIL.live && <Badge tone="warn">Being set up — not receiving mail yet</Badge>}
        </p>
      </section>

      {sent ? (
        <section role="status" aria-label="Message sent" className="space-y-2 rounded-xl border border-success/40 bg-success/6 p-5">
          <p className="text-base font-bold text-success">Sent ✓</p>
          <p className="text-sm leading-relaxed">We&rsquo;ve got your message and will reply by email.</p>
          <p className="text-xs leading-relaxed text-muted">
            Topic: {CONTACT_TOPICS.find((t) => t.key === topic)!.label} · sent {whenLabel("2026-10-01T10:30:00.000Z")} · a copy went to the email you gave (sample)
          </p>
        </section>
      ) : (
        <form aria-label="Message BTG" className="space-y-3.5 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <fieldset>
            <legend className="mb-2 text-xs font-medium">What is it about?</legend>
            <div className="flex flex-wrap gap-2">
              {CONTACT_TOPICS.map((t) => (
                <label
                  key={t.key}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-bg px-3.5 text-sm has-checked:border-primary-soft has-checked:bg-primary/12"
                >
                  <input type="radio" name="topic" value={t.key} defaultChecked={t.key === topic} className="accent-[var(--sx-primary)]" />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-xs font-medium">
              Your name
              <input type="text" name="name" className={field} autoComplete="name" />
            </label>
            <label className="flex flex-col text-xs font-medium">
              Email for our reply
              <input type="email" name="email" className={field} autoComplete="email" />
            </label>
          </div>
          <label className="flex flex-col text-xs font-medium">
            Message
            <textarea name="message" rows={5} className={`${field} resize-y leading-normal`} placeholder="Tell us what happened, and anything that helps — a date, a court order you can send." />
          </label>
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
            <span className="text-sm font-medium text-text">
              Attachments <span className="font-normal text-muted">(optional)</span>
            </span>
            <span>Photos or PDFs that help us understand</span>
            <button type="button" disabled title={NOT_YET} className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text disabled:cursor-not-allowed disabled:opacity-40">
              Add files
            </button>
          </div>
          <button
            type="button"
            disabled
            title={NOT_YET}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </main>
  );
}
