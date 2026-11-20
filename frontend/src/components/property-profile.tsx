"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";

import {
  requestIdentityChangeAction, saveContactAction, saveDescriptionAction, saveManagerAction, type ProfileWrite,
} from "@/app/(app)/property/profile/actions";
import { btn, DialogError, OrderDialog } from "@/components/order-dialog";
import { Badge, Card } from "@/components/ui";
import { PlacePicker } from "@/components/place-picker";
import {
  DESCRIPTION_MAX, changeNotice, detailFields, detailRows, identityDraftFrom, kindNoun, kindWord, orgInitials, placeLine, stateName,
  type ApiPropertyProfile, type ContactDraft, type IdentityDraft, type ManagerDraft,
} from "@/lib/property-profile-live";

/* --------------------------------------------------------------------------
   POL-FE-104 — the property manager's Profile page (property portal).

   Top: the organisation as BTG and sponsors know it — its name, type, place
   and the type's details (a team's league and sport, a school's district and
   sports…) — and one button, "Change name, place or details". Those drive
   matching and the conflict checks, so a change takes effect at once only
   when every safety check passes, and otherwise waits for BTG; the notice
   under the header says which, with the reasons and what was asked for.

   Then four cards of equal height, each with its own Edit in a pop-up, so
   the page reads before it asks: Main contact, Description, Your details
   (all three saved at once) and Sign-in (which is Clerk's: the button opens
   Clerk's own screen).

   The type itself is BTG's, and so is the main contact's email (confirmed
   at sign-up): both are shown and marked, never edited here.
   -------------------------------------------------------------------------- */

type Dialog = null | "identity" | "contact" | "description" | "me";

const FIELD = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const NONE = "Not added yet";
const OFFLINE = "We couldn’t reach SponsorX, so nothing was saved. Try again in a minute.";

/** A team's place is in the United States (onboarding and its documents are US law). */
const US_ONLY = ["US"] as const;

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

/** A card: its facts on top, its one button pinned to the bottom, so a row of cards lines up. */
function Panel({ title, sub, action, children }: { title: string; sub: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>
      <div className="mt-3 flex-1">{children}</div>
      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
    </Card>
  );
}

function DialogFoot({ busy, onClose, save = "Save", saving = "Saving…" }: { busy: boolean; onClose: () => void; save?: string; saving?: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
      <button type="submit" className={btn.primary} disabled={busy}>{busy ? saving : save}</button>
    </div>
  );
}

export function PropertyProfile({ initial, signIn, now }: {
  initial: ApiPropertyProfile;
  /** "dana@club.org · confirmed" — Clerk's address and whether it is verified. */
  signIn: string;
  /** When the page was read, for the change notice's two-week window. */
  now: string;
}) {
  const clerk = useClerk();
  const [profile, setProfile] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);

  const p = profile.property;
  const me = profile.me;
  const noun = kindNoun(p.kind);
  const place = placeLine(p);
  const notice = changeNotice(profile, new Date(now));
  const details = detailRows(p.kind, p.details);
  const fields = detailFields(p);

  /* The drafts start from what is on file each time a dialog opens. */
  const [identity, setIdentity] = useState<IdentityDraft>(() => identityDraftFrom(p));
  const [contact, setContact] = useState<ContactDraft>({ name: "", phone: "" });
  const [description, setDescription] = useState("");
  const [mine, setMine] = useState<ManagerDraft>({ name: "", jobTitle: "", phone: "" });

  const open = (d: Exclude<Dialog, null>) => {
    setError(null);
    setErrors({});
    setIdentity(identityDraftFrom(p));
    setContact({ name: p.contact?.name ?? "", phone: p.contact?.phone ?? "" });
    setDescription(p.description ?? "");
    setMine({ name: me.name ?? "", jobTitle: me.jobTitle ?? "", phone: me.phone ?? "" });
    setDialog(d);
  };

  /** One write at a time (a ref, so a double click can't send two); on success the page is whatever the API now says. */
  const run = async (write: () => Promise<ProfileWrite>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const r = await write().catch((): ProfileWrite => ({ ok: false, message: OFFLINE }));
      if (r.ok) {
        setProfile(r.profile);
        setDialog(null);
      } else {
        setError(r.message);
        setErrors(r.errors ?? {});
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const close = () => setDialog(null);
  const editButton = (d: Exclude<Dialog, null>, label: string) => <button type="button" className={btn.quiet} onClick={() => open(d)}>{label}</button>;
  const noticeBox = notice?.tone === "wait" ? "border-warn/40 bg-warn/8" : notice?.tone === "late" ? "border-danger/40 bg-danger/8" : "border-success/35 bg-success/8";
  const noticeTitle = notice?.tone === "wait" ? "text-warn" : notice?.tone === "late" ? "text-danger" : "text-success";

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ the organisation, as BTG and sponsors know it */}
      <Card className={`sx-animate min-w-0 ${notice?.tone === "wait" ? "border-warn/40" : notice?.tone === "late" ? "border-danger/40" : ""}`}>
        <div className="flex flex-wrap items-center gap-4">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2 text-xl font-bold tracking-wide text-primary-soft">{orgInitials(p.name)}</span>
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{kindWord(p.kind)}</p>
            <p className="break-words text-xl font-semibold tracking-tight">{p.name}</p>
            <p className={`mt-0.5 text-xs ${place ? "text-muted" : "text-faint"}`}>{place || "No city or state on file"}</p>
          </div>
          {!profile.pendingChange && (
            <button type="button" className={btn.quiet} onClick={() => open("identity")}>Change name, place or details</button>
          )}
        </div>

        {notice && (
          <div role="status" className={`mt-4 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${noticeBox}`}>
            <p className={`font-semibold ${noticeTitle}`}>{notice.title}</p>
            <p className="mt-0.5 text-text/90">{notice.text}</p>
            {notice.rows.length > 0 && (
              <dl className="mt-2 space-y-1 text-text/90">
                {notice.rows.map((r) => (
                  <div key={r.key} className="grid gap-x-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className="min-w-0 break-words">
                      <span className="text-muted line-through decoration-muted/60">{r.before}</span> <span aria-hidden>→</span><span className="sr-only"> changes to </span> <span className="font-medium">{r.after}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {notice.reasons.length > 0 && (
              <>
                <p className="mt-2 text-xs font-semibold text-text/90">{notice.tone === "wait" ? "Why BTG checks it first" : "BTG’s reason"}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-text/85">
                  {notice.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        <dl className="mt-4 grid gap-x-8 border-t border-line/60 pt-2 sm:grid-cols-2">
          <Fact label="Type">
            <span className="flex flex-wrap items-center gap-2">
              {kindWord(p.kind)}
              <Badge tone="neutral">kept by BTG</Badge>
            </span>
          </Fact>
          <Fact label="City" empty={!p.city}>{p.city ?? "Not on file"}</Fact>
          <Fact label="State" empty={!p.stateCode}>{stateName(p.stateCode) || "Not on file"}</Fact>
          {details.map((d) => (
            <Fact key={d.key} label={d.label} empty={!d.value}>{d.value || "Not on file"}</Fact>
          ))}
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Sponsors are matched to your {noun}, and conflicts are checked, on these details.
          {p.details ? "" : ` BTG set up your ${noun}, so it keeps the rest of its details: ask BTG through Help to change them.`}
        </p>
      </Card>

      {/* ------------------------------------------------ four cards, equal height */}
      <div className="sx-animate sx-delay-1 grid items-stretch gap-4 lg:grid-cols-2">
        <Panel
          title="Main contact"
          sub={`Who BTG and sponsors reach about your ${noun}.`}
          action={p.contact ? editButton("contact", "Edit contact") : undefined}
        >
          {p.contact ? (
            <dl className="divide-y divide-line/60">
              <Fact label="Name" empty={!p.contact.name}>{p.contact.name ?? NONE}</Fact>
              <Fact label="Email" empty={!p.contact.email}>
                {p.contact.email ?? NONE}
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">Confirmed at sign-up. Ask BTG through Help to change it.</span>
              </Fact>
              <Fact label="Phone" empty={!p.contact.phone}>{p.contact.phone ?? NONE}</Fact>
            </dl>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              There is no main contact on file. <Link href="/property/help" className="font-medium text-primary-soft hover:underline">Ask BTG through Help</Link> to add one.
            </p>
          )}
        </Panel>

        <Panel title="Description" sub={`Your public description: a few lines about your ${noun}, in your own words.`} action={editButton("description", p.description ? "Edit description" : "Add a description")}>
          <p className={`whitespace-pre-line break-words text-[13px] leading-relaxed ${p.description ? "text-text" : "text-faint"}`}>{p.description ?? NONE}</p>
        </Panel>

        <Panel title="Your details" sub="Your own name, title and phone, as BTG sees them." action={editButton("me", "Edit your details")}>
          <dl className="divide-y divide-line/60">
            <Fact label="Name" empty={!me.name}>{me.name ?? NONE}</Fact>
            <Fact label="Job title" empty={!me.jobTitle}>{me.jobTitle ?? NONE}</Fact>
            <Fact label="Phone" empty={!me.phone}>{me.phone ?? NONE}</Fact>
          </dl>
        </Panel>

        <Panel
          title="Sign-in"
          sub="Your email, password and two-step sign-in are kept by our sign-in provider, not on this page."
          action={<button type="button" className={btn.quiet} onClick={() => clerk.openUserProfile()}>Manage sign-in</button>}
        >
          <dl className="divide-y divide-line/60">
            <Fact label="Email">{signIn}</Fact>
            <Fact label="Password">Changed on the sign-in screen</Fact>
            <Fact label="Two-step">Set up on the sign-in screen</Fact>
          </dl>
        </Panel>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Your payout account, email notifications and closing the account are on{" "}
        <Link href="/property/settings" className="font-medium text-primary-soft hover:underline">Settings</Link>. Your logo and colours are on{" "}
        <Link href="/property/branding" className="font-medium text-primary-soft hover:underline">Branding</Link>.
      </p>

      {/* ------------------------------------------------ the pop-ups */}
      {dialog === "identity" && (
        <OrderDialog id="sx-pp-identity" title="Change name, place or details" onClose={close} onSubmit={() => void run(() => requestIdentityChangeAction(identity))}>
          <p className="text-[13px] leading-relaxed text-muted">
            Most changes take effect at once. A BTG person checks first when another organisation has the name, the legal name or registration number changes,
            a document for the new state isn&rsquo;t on file, or a sponsor has an open order or offer with you.
          </p>
          {/* The fields scroll inside the pop-up, so a long form never pushes its own top or its buttons off a phone. */}
          <div className="-mx-1 flex max-h-[48dvh] flex-col gap-3.5 overflow-y-auto px-1 pb-1">
          <Field id="sx-pp-name" label="Name" error={errors.name}>
            <input id="sx-pp-name" data-autofocus className={FIELD} maxLength={200} autoComplete="organization" value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
          </Field>
          {/* POL-FE-117 — State then City, both picked and searchable. US only: a team
              abroad needs BTG to decide what documents it files first. */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <PlacePicker
              idPrefix="sx-pp"
              only={US_ONLY}
              tone="property"
              value={{ countryCode: "US", regionCode: identity.stateCode, city: identity.city }}
              onChange={(pl) => setIdentity({ ...identity, stateCode: pl.regionCode, city: pl.city })}
              errors={{ region: errors.stateCode, city: errors.city }}
              field={({ key, id, label, hint, error, children }) => <Field key={key} id={id} label={label} hint={hint} error={error}>{children}</Field>}
            />
          </div>
          {fields.map((f) => {
            const id = `sx-pp-d-${f.key}`;
            const value = identity.details[f.key] ?? "";
            const set = (v: string) => setIdentity({ ...identity, details: { ...identity.details, [f.key]: v } });
            return (
              <Field key={f.key} id={id} label={f.optional ? `${f.label} (optional)` : f.label} hint={f.hint} error={errors[`details.${f.key}`]}>
                {f.kind === "textarea" ? (
                  <textarea id={id} className={`${FIELD} resize-y`} rows={3} maxLength={f.max} value={value} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input
                    id={id}
                    className={FIELD}
                    type={f.kind === "date" ? "date" : "text"}
                    inputMode={f.kind === "url" ? "url" : undefined}
                    maxLength={f.kind === "list" || f.kind === "date" ? undefined : f.max}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </Field>
            );
          })}
          <p className="text-[11px] leading-relaxed text-muted">Your type ({kindWord(p.kind).toLowerCase()}) is BTG&rsquo;s to change, so it isn&rsquo;t offered here.</p>
          </div>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={close} save="Send the change" saving="Sending…" />
        </OrderDialog>
      )}

      {dialog === "contact" && (
        <OrderDialog id="sx-pp-contact" title="Main contact" onClose={close} onSubmit={() => void run(() => saveContactAction(contact))}>
          <Field id="sx-pp-cname" label="Name" error={errors.name}>
            <input id="sx-pp-cname" data-autofocus className={FIELD} maxLength={200} autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          </Field>
          <Field id="sx-pp-cphone" label="Phone" hint="Leave it empty to remove it." error={errors.phone}>
            <input id="sx-pp-cphone" className={FIELD} type="tel" inputMode="tel" maxLength={40} autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          </Field>
          <p className="text-[11px] leading-relaxed text-muted">The contact&rsquo;s email{p.contact?.email ? ` (${p.contact.email})` : ""} was confirmed at sign-up, so it isn&rsquo;t changed here.</p>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={close} />
        </OrderDialog>
      )}

      {dialog === "description" && (
        <OrderDialog id="sx-pp-description" title="Description" onClose={close} onSubmit={() => void run(() => saveDescriptionAction(description))}>
          <Field id="sx-pp-desc" label={`About your ${noun}`} hint={`${description.trim().length.toLocaleString("en-US")} of ${DESCRIPTION_MAX.toLocaleString("en-US")} characters. Leave it empty to remove it.`} error={errors.description}>
            <textarea id="sx-pp-desc" data-autofocus className={`${FIELD} resize-y`} rows={7} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={close} />
        </OrderDialog>
      )}

      {dialog === "me" && (
        <OrderDialog id="sx-pp-me" title="Your details" onClose={close} onSubmit={() => void run(() => saveManagerAction(mine))}>
          <Field id="sx-pp-mname" label="Your name" error={errors.name}>
            <input id="sx-pp-mname" data-autofocus className={FIELD} maxLength={120} autoComplete="name" value={mine.name} onChange={(e) => setMine({ ...mine, name: e.target.value })} />
          </Field>
          <Field id="sx-pp-mtitle" label="Job title" error={errors.jobTitle}>
            <input id="sx-pp-mtitle" className={FIELD} maxLength={120} autoComplete="organization-title" value={mine.jobTitle} onChange={(e) => setMine({ ...mine, jobTitle: e.target.value })} />
          </Field>
          <Field id="sx-pp-mphone" label="Phone" error={errors.phone}>
            <input id="sx-pp-mphone" className={FIELD} type="tel" inputMode="tel" maxLength={40} autoComplete="tel" value={mine.phone} onChange={(e) => setMine({ ...mine, phone: e.target.value })} />
          </Field>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={close} />
        </OrderDialog>
      )}
    </div>
  );
}
