import Link from "next/link";

import { ContactForm, ContactSent } from "@/components/contact-form";
import { ContactHero, ContactPanel, ContactWays, StageNotice } from "@/components/contact-stage";
import { StageReveal } from "@/components/packages-fx";
import { whenLabel } from "@/lib/guardian-live";
import { backHref, helpdeskTopic, topicLabel, type ApiHelpdesk, type HelpdeskTopicView } from "@/lib/helpdesk-live";
import { helpdeskApi, helpdeskViewer } from "@/server/helpdesk";
import { supportContact } from "@/server/support";

import "./contact.css";

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

   POL-FE-100 — THE REDESIGN. The page now stands on the public pages'
   stage (as /about, /packages, /how-it-works): a hero with the envelope,
   three ways to reach BTG, then one glass panel with the form as three
   numbered steps beside what happens after Send (contact-stage.tsx). The
   form is keyed by the topic, so a link that changes ?topic= (the
   guardianship card) starts it on that topic.
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
    <StageReveal className="sx-stage relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <ContactHero back={back} email={support.email} ready={support.ready} />
      <ContactWays email={support.email} ready={support.ready} />
      <ContactPanel signedIn={signedIn}>
        {preview ? (
          <>
            <StageNotice>Preview of the confirmation — nothing was sent.</StageNotice>
            <ContactSent topic={topicLabel([], topic)} when={`${whenLabel("2026-10-01T10:30:00.000Z")} (sample)`} copyTo="the email you gave (sample)" againHref="/contact#write" />
          </>
        ) : (
          <>
            {desk?.expired && (
              <StageNotice>
                Your sign-in has expired. <Link href="/login" className="font-semibold text-[#bfe6ff] underline underline-offset-2">Sign in again</Link> to send a message from your account.
              </StageNotice>
            )}
            <ContactForm key={topic} topic={topic} topics={desk?.topics ?? []} signedIn={signedIn} name={viewer?.name ?? ""} email={viewer?.email ?? ""} />
          </>
        )}
      </ContactPanel>
    </StageReveal>
  );
}
