"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";

import { addRosterAction } from "@/app/(app)/advisor/actions";
import { saveAdvisorMeAction, type AdvisorWrite } from "@/app/(app)/advisor/profile/actions";
import { btn, DialogError, OrderDialog } from "@/components/order-dialog";
import { RosterPaste } from "@/components/roster-paste";
import { SchoolEmailDomain } from "@/components/school-email-domain";
import { Badge, Card, SectionHeading } from "@/components/ui";
import {
  domainLine, rosterCountLine, rosterUpdatedLine, schoolKindWord, type AdvisorMeDraft, type ApiAdvisorProfile,
} from "@/lib/advisor-profile-live";

/* --------------------------------------------------------------------------
   POL-FE-103 — the school advisor's Profile page (NEXT portal, plain cards).

   Top: two cards of equal height — Your details (name, title, phone; one
   Edit, in a pop-up) and Sign-in (Clerk's: the button opens Clerk's own
   screen). The name is what the advisor's students read on their own
   Profile page in place of a bare email, and the card says so.

   Then the school: its name and type (BTG's — shown with who keeps them and
   where to ask), the email domain and the roster's size and last update.
   Under it the two controls the advisor home already has, unchanged: the
   email domain (the API refuses a public mail provider and says why) and
   the roster box. Each calls router.refresh() when it saves, and the school
   card is drawn from the page's own read, so it shows what was just saved.
   -------------------------------------------------------------------------- */

const FIELD = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const NONE = "Not added yet";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
      {children}
      {hint && !error && <p className="text-[11px] leading-relaxed text-muted">{hint}</p>}
      {error && <p role="alert" className="text-[11px] leading-relaxed text-danger">{error}</p>}
    </div>
  );
}

function Fact({ label, children, empty }: { label: string; children: ReactNode; empty?: boolean }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 break-words ${empty ? "text-faint" : "text-text"}`}>{children}</dd>
    </div>
  );
}

/** A card: its facts on top, its one button pinned to the bottom, so the two cards line up. */
function Panel({ title, sub, action, children }: { title: string; sub: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>
      <dl className="mt-3 flex-1 divide-y divide-line/60">{children}</dl>
      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
    </Card>
  );
}

export function AdvisorProfile({ profile, signIn }: {
  /** The page's own read. The school is drawn from it as it is, so a saved domain or roster shows after the refresh. */
  profile: ApiAdvisorProfile;
  /** "dana@school.edu · confirmed" — Clerk's address and whether it is verified. */
  signIn: string;
}) {
  const clerk = useClerk();
  const [me, setMe] = useState(profile.me);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdvisorMeDraft>({ name: "", jobTitle: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const school = profile.school;

  const edit = () => {
    setError(null);
    setErrors({});
    setSaved(false);
    setDraft({ name: me.name ?? "", jobTitle: me.jobTitle ?? "", phone: me.phone ?? "" });
    setOpen(true);
  };

  /** One save at a time (a ref, so a double click can't send two); the card then shows what the API answered. */
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const r = await saveAdvisorMeAction(draft).catch((): AdvisorWrite => ({ ok: false, message: "We couldn’t reach SponsorX, so nothing was saved. Try again in a minute." }));
      if (r.ok) {
        setMe(r.profile.me);
        setOpen(false);
        setSaved(true);
      } else {
        setError(r.message);
        setErrors(r.errors ?? {});
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ the advisor, and how they sign in */}
      <div className="sx-animate grid items-stretch gap-4 lg:grid-cols-2">
        <Panel
          title="Your details"
          sub={me.name ? "Your students see your name beside your email on their Profile page." : "Add your name: until you do, your students see only your email address."}
          action={(
            <>
              <button type="button" className={btn.quiet} onClick={edit}>Edit your details</button>
              {saved && <span role="status" className="text-xs text-success">Saved.</span>}
            </>
          )}
        >
          <Fact label="Name" empty={!me.name}>{me.name ?? NONE}</Fact>
          <Fact label="Title" empty={!me.jobTitle}>{me.jobTitle ?? NONE}</Fact>
          <Fact label="Phone" empty={!me.phone}>{me.phone ?? NONE}</Fact>
        </Panel>

        <Panel
          title="Sign-in"
          sub="Your email, password and two-step sign-in are kept by our sign-in provider, not on this page."
          action={<button type="button" className={btn.quiet} onClick={() => clerk.openUserProfile()}>Manage sign-in</button>}
        >
          <Fact label="Email">{signIn}</Fact>
          <Fact label="Password">Changed on the sign-in screen</Fact>
          <Fact label="Two-step">Set up on the sign-in screen</Fact>
        </Panel>
      </div>

      {/* ------------------------------------------------ the school */}
      <section className="sx-animate sx-delay-1 min-w-0">
        <SectionHeading title="Your school" hint="The one school this login reviews for." />
        <Card className="min-w-0">
          <dl className="divide-y divide-line/60">
            <Fact label="Name">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{school.name}</span>
                <Badge tone="neutral">kept by BTG</Badge>
              </span>
            </Fact>
            <Fact label="Type">
              <span className="flex flex-wrap items-center gap-2">
                {schoolKindWord(school.kind)}
                <Badge tone="neutral">kept by BTG</Badge>
              </span>
            </Fact>
            <Fact label="Email domain" empty={!school.emailDomain}>
              {school.emailDomain ? <span className="font-medium">@{school.emailDomain}</span> : "None on file"}
              <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{domainLine(school.emailDomain)}</span>
            </Fact>
            <Fact label="Roster" empty={school.roster.count < 1}>{rosterCountLine(school.roster.count)}</Fact>
            <Fact label="Roster updated" empty={school.roster.count < 1}>{rosterUpdatedLine(school.roster)}</Fact>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            The school&rsquo;s name and type are BTG&rsquo;s to change, so they can&rsquo;t be edited here. If either is wrong, <Link href="/advisor/help" className="font-medium text-next hover:underline">ask BTG through Help</Link>.
          </p>
        </Card>
      </section>

      {/* ------------------------------------------------ the two settings the advisor changes */}
      <section className="sx-animate sx-delay-2 min-w-0 space-y-4">
        <SectionHeading title="Who is approved automatically" hint="Yours to change. Every change is recorded with your name and the time." />
        <SchoolEmailDomain propertyId={school.id} school={school.name} emailDomain={school.emailDomain} rosterEntries={school.roster.count} />
        <RosterPaste propertyId={school.id} onFile={school.roster.count} save={addRosterAction} />
      </section>

      {/* ------------------------------------------------ the pop-up */}
      {open && (
        <OrderDialog id="sx-adv-me" title="Your details" onClose={() => setOpen(false)} onSubmit={() => void save()}>
          <Field id="sx-adv-name" label="Your name" hint="Shown to your students beside your email. Leave it empty to remove it." error={errors.name}>
            <input id="sx-adv-name" data-autofocus className={FIELD} maxLength={120} autoComplete="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field id="sx-adv-title" label="Title" hint="For example: Journalism teacher, Yearbook advisor." error={errors.jobTitle}>
            <input id="sx-adv-title" className={FIELD} maxLength={120} autoComplete="organization-title" value={draft.jobTitle} onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })} />
          </Field>
          <Field id="sx-adv-phone" label="Phone" hint="Your students don’t see it." error={errors.phone}>
            <input id="sx-adv-phone" className={FIELD} type="tel" inputMode="tel" maxLength={40} autoComplete="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </Field>
          <DialogError message={error} />
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={btn.quiet} onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </OrderDialog>
      )}
    </div>
  );
}
