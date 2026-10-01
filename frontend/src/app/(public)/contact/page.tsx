import { ContactForm } from "@/components/contact-form";
import { Badge, BlockedNotice } from "@/components/ui";
import { CONTACT_TOPICS, contactTopic, whenLabel } from "@/lib/guardian-live";
import { supportContact } from "@/server/support";

/* --------------------------------------------------------------------------
   /contact — Contact BTG, 2S1-FE-10 (Claude Design Contact.dc.html, "form"
   and "sent"). Public (no login): the way to reach a person at BTG for
   anything that must never be automated — a disputed guardianship first,
   then account and payment questions. Linked from the guardian pages, the
   current guardian's request card, the decline and rejection emails, the
   reactivation page and the account settings pages.
   ?topic=guardianship|account|payment|other pre-picks the topic.

   LIVE (2S1-BE-16):
     Reads  GET  /public/support             the support address (SUPPORT_EMAIL) and whether it's set up
     Writes POST /public/support/messages    {name, email, topic, message, attachments?} (contact-form.tsx);
                                             attachments presigned to the private bucket; rate-limited;
                                             queued through the worker to the mailbox, never sent on the request path
   ?demo=sent previews the confirmation and never reaches the API.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Contact BTG · SponsorX" };
export const dynamic = "force-dynamic";

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ demo?: string | string[]; topic?: string | string[] }> }) {
  const sp = await searchParams;
  const preview = sp.demo === "sent";
  const topic = contactTopic(sp.topic);
  const support = await supportContact();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      {preview && <BlockedNotice>Preview of the confirmation — nothing was sent.</BlockedNotice>}

      <div>
        <h1 className="text-2xl font-bold sm:text-[28px]">Contact BTG</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Questions about guardianship, your account or a payment. A person at BTG reads every message.</p>
      </div>

      <section aria-label="Email address" className="space-y-1.5 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <p className="text-xs text-muted">Or email us directly</p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="select-all text-base font-semibold">{support.email}</span>
          {!support.ready && <Badge tone="warn">Being set up — not receiving mail yet</Badge>}
        </p>
      </section>

      {preview ? (
        <section role="status" aria-label="Message sent" className="space-y-2 rounded-xl border border-success/40 bg-success/6 p-5">
          <p className="text-base font-bold text-success">Sent ✓</p>
          <p className="text-sm leading-relaxed">We&rsquo;ve got your message and will reply by email.</p>
          <p className="text-xs leading-relaxed text-muted">
            Topic: {CONTACT_TOPICS.find((t) => t.key === topic)!.label} · sent {whenLabel("2026-10-01T10:30:00.000Z")} · a copy went to the email you gave (sample)
          </p>
        </section>
      ) : (
        <ContactForm topic={topic} />
      )}
    </main>
  );
}
