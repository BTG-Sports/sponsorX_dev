import Link from "next/link";

import { ContactForm } from "@/components/contact-form";
import { Badge, BlockedNotice } from "@/components/ui";
import { whenLabel } from "@/lib/guardian-live";
import { backHref, helpdeskTopic, topicLabel, type ApiHelpdesk, type HelpdeskTopicView } from "@/lib/helpdesk-live";
import { helpdeskApi, helpdeskViewer } from "@/server/helpdesk";
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

   POL-FE-43 — THE HELP DESK. The form lists the eight topics and, under
   the chosen one, the cases to tick (GET /public/support/cases): a visitor
   sees the public cases; signed in (the ? in every portal opens this page),
   their role's, with their name and email filled in, and the message is
   linked to their account. ?back=/athlete (a portal's page) shows the way
   back. If the cases can't be read the form still works as before: a topic
   and a message.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Contact BTG · SponsorX" };
export const dynamic = "force-dynamic";

/** The help desk's topics and cases for this person; an expired session; or nothing readable (the plain form). */
async function helpdesk(): Promise<{ topics: HelpdeskTopicView[]; signedIn: boolean; expired: boolean }> {
  try {
    const res = await helpdeskApi("/public/support/cases");
    if (res.status === 401) return { topics: [], signedIn: false, expired: true };
    if (!res.ok) return { topics: [], signedIn: false, expired: false };
    const d = (await res.json()) as ApiHelpdesk;
    return { topics: Array.isArray(d.topics) ? d.topics : [], signedIn: d.signedIn === true, expired: false };
  } catch {
    return { topics: [], signedIn: false, expired: false };
  }
}

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ demo?: string | string[]; topic?: string | string[]; back?: string | string[] }> }) {
  const sp = await searchParams;
  const preview = sp.demo === "sent";
  const [support, desk, viewer] = await Promise.all([supportContact(), preview ? Promise.resolve(null) : helpdesk(), helpdeskViewer()]);
  const signedIn = desk?.signedIn ?? false;
  const topic = helpdeskTopic(sp.topic, signedIn);
  const back = backHref(sp.back);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-6 lg:py-12">
      {preview && <BlockedNotice>Preview of the confirmation — nothing was sent.</BlockedNotice>}
      {back && <Link href={back} className="text-xs text-muted hover:text-text">← Back to your portal</Link>}

      <div>
        <h1 className="text-2xl font-bold sm:text-[28px]">Contact BTG</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">Pick what it&rsquo;s about and tick what&rsquo;s wrong. A person at BTG reads every message and replies by email.</p>
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
            Topic: {topicLabel([], topic)} · sent {whenLabel("2026-10-01T10:30:00.000Z")} · a copy went to the email you gave (sample)
          </p>
        </section>
      ) : (
        <>
          {desk?.expired && (
            <BlockedNotice>
              Your sign-in has expired. <Link href="/login" className="underline">Sign in again</Link> to send a message from your account.
            </BlockedNotice>
          )}
          <ContactForm topic={topic} topics={desk?.topics ?? []} signedIn={signedIn} name={viewer?.name ?? ""} email={viewer?.email ?? ""} />
        </>
      )}
    </main>
  );
}
