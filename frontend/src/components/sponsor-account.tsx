"use client";

import { useRef, useState, type ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";

import {
  removeLogoAction, requestChangeAction, requestLogoUploadAction, saveCompanyAction, saveLogoAction, saveMeAction, type AccountWrite,
} from "@/app/(app)/sponsor/account/actions";
import { NotificationPrefs } from "@/components/notification-prefs";
import { btn, DialogError, OrderDialog } from "@/components/order-dialog";
import { StadiumChip, StadiumPanel } from "@/components/stadium-stage";
import {
  CATEGORY_OPTIONS, categoryWord, changeNotice, companyInitials, sponsorPrefs, validateLogoFile,
  type ApiSponsorAccount, type ChangeDraft, type CompanyDraft, type MeDraft,
} from "@/lib/sponsor-account-live";
import { saveNotificationPrefAction } from "@/server/notification-prefs-actions";

/* --------------------------------------------------------------------------
   POL-FE-102 — the sponsor's Account page, on the Stadium Board.

   Top: the company as BTG knows it — its logo, name and brand categories —
   and one button, "Change name or categories". Those two feed the conflict
   checks and the Zoho account, so a change takes effect at once only when
   every safety check passes, and otherwise waits for BTG; the notice under
   the header says which.

   Then four cards of equal height, each with its own Edit in a pop-up, so
   the page reads before it asks: Company details, Billing contact, Your
   details, Sign-in (which is Clerk's: the button opens Clerk's own screen).
   Last, the email notifications: only the kinds a sponsor is sent. Every
   kind that can be turned off today is an athlete's or a student's, so the
   section says there is nothing to turn off rather than list switches for
   emails a sponsor never gets (lib/sponsor-account-live.ts sponsorPrefs).

   A Sponsor Viewer sees all of it and no button (the API refuses a viewer's
   write too).
   -------------------------------------------------------------------------- */

type Dialog = null | "company" | "billing" | "me" | "change";

const FIELD = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";

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
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className={`min-w-0 break-words ${empty ? "text-faint" : "text-text"}`}>{children}</dd>
    </div>
  );
}

/** A card: its facts on top, its one button pinned to the bottom, so a row of cards lines up. */
function Card({ title, sub, delay, action, children }: { title: string; sub: string; delay: number; action?: ReactNode; children: ReactNode }) {
  return (
    <StadiumPanel delay={delay} className="flex h-full flex-col">
      <h2 className="sx-section-title">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>
      <dl className="mt-3 flex-1 divide-y divide-line/60">{children}</dl>
      {action && <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div>}
    </StadiumPanel>
  );
}

export function SponsorAccount({ initial, signIn, now }: {
  initial: ApiSponsorAccount;
  /** "dana@company.com · confirmed" — Clerk's address and whether it is verified. */
  signIn: string;
  /** When the page was read, for the change notice's two-week window. */
  now: string;
}) {
  const clerk = useClerk();
  const [account, setAccount] = useState(initial);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoNote, setLogoNote] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const inFlight = useRef(false);
  const file = useRef<HTMLInputElement>(null);

  const c = account.company;
  const edit = account.canEdit;
  /* Only the kinds of email a sponsor is sent (today: none of the ones that can be turned off). */
  const prefs = sponsorPrefs(account.notificationPreferences);
  const notice = changeNotice(account, new Date(now));

  /* The drafts start from what is on file each time a dialog opens. */
  const [company, setCompany] = useState<CompanyDraft>({ website: "", address: "", billingName: "", billingEmail: "", billingPhone: "" });
  const [me, setMe] = useState<MeDraft>({ name: "", jobTitle: "" });
  const [change, setChange] = useState<ChangeDraft>({ name: "", categories: [] });

  const open = (d: Exclude<Dialog, null>) => {
    setError(null);
    setErrors({});
    setCompany({ website: c.website ?? "", address: c.address ?? "", billingName: c.billingContact.name ?? "", billingEmail: c.billingContact.email ?? "", billingPhone: c.billingContact.phone ?? "" });
    setMe({ name: account.me.name ?? "", jobTitle: account.me.jobTitle ?? "" });
    setChange({ name: c.name, categories: [...c.categories] });
    setDialog(d);
  };

  /** One write at a time; on success the page is whatever the API now says. */
  const run = async (write: () => Promise<AccountWrite>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const r = await write().catch((): AccountWrite => ({ ok: false, message: "We couldn’t reach SponsorX, so nothing was saved. Try again in a minute." }));
      if (r.ok) {
        setAccount(r.account);
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

  const uploadLogo = async (picked: File) => {
    if (inFlight.current) return;
    const v = validateLogoFile(picked);
    if (!v.ok) return setLogoNote({ tone: "error", text: v.message });
    inFlight.current = true;
    setLogoBusy(true);
    setLogoNote(null);
    try {
      const grant = await requestLogoUploadAction({ type: picked.type, size: picked.size }).catch(() => ({ ok: false as const, message: "We couldn’t reach SponsorX. Try again in a minute." }));
      if (!grant.ok) return setLogoNote({ tone: "error", text: grant.message });
      /* Straight to storage, with the type the upload was signed for; it never passes through the web server. */
      const put = await fetch(grant.uploadUrl, { method: "PUT", headers: { "Content-Type": v.contentType }, body: picked }).catch(() => null);
      if (!put?.ok) return setLogoNote({ tone: "error", text: put ? `Storage refused the picture (HTTP ${put.status}). Try again.` : "The picture didn’t reach storage. Check your connection and try again." });
      const saved = await saveLogoAction(grant.logoKey).catch((): AccountWrite => ({ ok: false, message: "We couldn’t reach SponsorX, so the logo wasn’t saved." }));
      if (!saved.ok) return setLogoNote({ tone: "error", text: saved.message });
      setAccount(saved.account);
      setLogoNote({ tone: "ok", text: "Logo saved." });
    } finally {
      inFlight.current = false;
      setLogoBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const removeLogo = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLogoBusy(true);
    setLogoNote(null);
    try {
      const r = await removeLogoAction().catch((): AccountWrite => ({ ok: false, message: "We couldn’t reach SponsorX, so nothing changed." }));
      if (r.ok) {
        setAccount(r.account);
        setLogoNote({ tone: "ok", text: "Logo removed." });
      } else {
        setLogoNote({ tone: "error", text: r.message });
      }
    } finally {
      inFlight.current = false;
      setLogoBusy(false);
    }
  };

  const none = "Not added yet";
  const editButton = (d: Exclude<Dialog, null>, label: string) => (edit ? <button type="button" className={btn.quiet} onClick={() => open(d)}>{label}</button> : null);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ the company, as BTG knows it */}
      <StadiumPanel delay={0.06} tone={notice?.tone === "wait" ? "you" : notice?.tone === "late" ? "late" : undefined}>
        <div className="flex flex-wrap items-center gap-4">
          {c.logoUrl ? (
            /* A plain <img>: the logo is a public-bucket URL, and next/image optimisation is host-specific (stay host-portable). */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logoUrl} alt={`${c.name} logo`} className="size-16 shrink-0 rounded-2xl border border-line bg-white object-contain p-1.5" />
          ) : (
            <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl border border-line bg-surface-2 text-xl font-bold tracking-wide text-primary-soft">{companyInitials(c.name)}</span>
          )}
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Company</p>
            <p className="truncate text-xl font-semibold tracking-tight">{c.name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.categories.length ? c.categories.map((k) => <StadiumChip key={k}>{categoryWord(k)}</StadiumChip>) : <span className="text-xs text-faint">No categories on file</span>}
            </div>
          </div>
          {edit && !account.pendingChange && (
            <button type="button" className={btn.quiet} onClick={() => open("change")}>Change name or categories</button>
          )}
        </div>

        {notice && (
          <div role="status" className={`mt-4 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${notice.tone === "wait" ? "border-warn/40 bg-warn/8" : notice.tone === "late" ? "border-danger/40 bg-danger/8" : "border-success/35 bg-success/8"}`}>
            <p className={`font-semibold ${notice.tone === "wait" ? "text-warn" : notice.tone === "late" ? "text-danger" : "text-success"}`}>{notice.title}</p>
            <p className="mt-0.5 text-text/90">{notice.text}</p>
            {notice.reasons.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-text/85">
                {notice.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
        {!edit && <p className="mt-4 text-xs leading-relaxed text-muted">You&rsquo;re a Sponsor Viewer, so this page is read-only. A Sponsor Admin on your team can change these details.</p>}
      </StadiumPanel>

      {/* ------------------------------------------------ four cards, equal height */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Card title="Company details" sub="Shown on your orders and to the people you work with." delay={0.12} action={editButton("company", "Edit company details")}>
          <Fact label="Logo">
            <span className="flex flex-wrap items-center gap-2">
              <span className={c.logoUrl ? "" : "text-faint"}>{c.logoUrl ? "On file" : none}</span>
              {edit && (
                <>
                  <input ref={file} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose a logo picture" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
                  <button type="button" className="text-xs font-semibold text-primary-soft underline-offset-2 hover:underline disabled:opacity-50" disabled={logoBusy} onClick={() => file.current?.click()}>
                    {logoBusy ? "Working…" : c.logoUrl ? "Replace" : "Upload a logo"}
                  </button>
                  {c.logoUrl && !logoBusy && <button type="button" className="text-xs font-semibold text-muted underline-offset-2 hover:text-danger hover:underline" onClick={() => void removeLogo()}>Remove</button>}
                </>
              )}
            </span>
            {logoNote && <span role={logoNote.tone === "error" ? "alert" : "status"} className={`mt-1 block text-[11px] ${logoNote.tone === "error" ? "text-danger" : "text-success"}`}>{logoNote.text}</span>}
            {edit && !logoNote && <span className="mt-1 block text-[11px] text-muted">PNG or JPEG, up to 1 MB.</span>}
          </Fact>
          <Fact label="Website" empty={!c.website}>
            {c.website ? <a href={c.website} target="_blank" rel="noreferrer noopener" className="text-primary-soft underline-offset-2 hover:underline">{c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : none}
          </Fact>
          <Fact label="Address" empty={!c.address}><span className="whitespace-pre-line">{c.address ?? none}</span></Fact>
        </Card>

        <Card title="Billing contact" sub="Who BTG writes to about invoices and payments." delay={0.16} action={editButton("billing", "Edit billing contact")}>
          <Fact label="Name" empty={!c.billingContact.name}>{c.billingContact.name ?? none}</Fact>
          <Fact label="Email" empty={!c.billingContact.email}>{c.billingContact.email ?? none}</Fact>
          <Fact label="Phone" empty={!c.billingContact.phone}>{c.billingContact.phone ?? none}</Fact>
        </Card>

        <Card title="Your details" sub="Your own name and role, as your team and BTG see them." delay={0.2} action={editButton("me", "Edit your details")}>
          <Fact label="Name" empty={!account.me.name}>{account.me.name ?? none}</Fact>
          <Fact label="Job title" empty={!account.me.jobTitle}>{account.me.jobTitle ?? none}</Fact>
          <Fact label="Role">{edit ? "Sponsor Admin" : "Sponsor Viewer (read only)"}</Fact>
        </Card>

        <Card
          title="Sign-in"
          sub="Your email, password and two-step sign-in are kept by our sign-in provider, not on this page."
          delay={0.24}
          action={<button type="button" className={btn.quiet} onClick={() => clerk.openUserProfile()}>Manage sign-in</button>}
        >
          <Fact label="Email">{signIn}</Fact>
          <Fact label="Password">Changed on the sign-in screen</Fact>
          <Fact label="Two-step">Set up on the sign-in screen</Fact>
        </Card>
      </div>

      {/* ------------------------------------------------ notifications */}
      <StadiumPanel delay={0.28}>
        {prefs.length > 0 ? (
          <NotificationPrefs
            initial={prefs}
            save={async (event, muted) => {
              const r = await saveNotificationPrefAction(event, muted);
              return r.ok ? { ok: true, preferences: sponsorPrefs(r.preferences) } : r;
            }}
          />
        ) : (
          <>
            <h2 className="sx-section-title">Notifications</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              Every email SponsorX sends you is about your orders, your requests or your account, so there is none to turn off. If an optional kind of email is added for sponsors, its switch will appear here.
            </p>
          </>
        )}
      </StadiumPanel>

      {/* ------------------------------------------------ the pop-ups */}
      {dialog === "company" && (
        <OrderDialog id="sx-acct-company" title="Company details" onClose={() => setDialog(null)} onSubmit={() => void run(() => saveCompanyAction(company))}>
          <Field id="sx-acct-website" label="Website" hint="Leave it empty to remove it." error={errors.website}>
            <input id="sx-acct-website" data-autofocus className={FIELD} inputMode="url" autoComplete="url" placeholder="https://yourcompany.com" value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} />
          </Field>
          <Field id="sx-acct-address" label="Address" error={errors.address}>
            <textarea id="sx-acct-address" className={`${FIELD} resize-y`} rows={3} maxLength={500} autoComplete="street-address" value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} />
          </Field>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={() => setDialog(null)} />
        </OrderDialog>
      )}

      {dialog === "billing" && (
        <OrderDialog id="sx-acct-billing" title="Billing contact" onClose={() => setDialog(null)} onSubmit={() => void run(() => saveCompanyAction(company))}>
          <Field id="sx-acct-bname" label="Name" error={errors.billingName}>
            <input id="sx-acct-bname" data-autofocus className={FIELD} maxLength={120} autoComplete="name" value={company.billingName} onChange={(e) => setCompany({ ...company, billingName: e.target.value })} />
          </Field>
          <Field id="sx-acct-bemail" label="Email" error={errors.billingEmail}>
            <input id="sx-acct-bemail" className={FIELD} type="email" inputMode="email" maxLength={200} autoComplete="email" value={company.billingEmail} onChange={(e) => setCompany({ ...company, billingEmail: e.target.value })} />
          </Field>
          <Field id="sx-acct-bphone" label="Phone" error={errors.billingPhone}>
            <input id="sx-acct-bphone" className={FIELD} type="tel" inputMode="tel" maxLength={40} autoComplete="tel" value={company.billingPhone} onChange={(e) => setCompany({ ...company, billingPhone: e.target.value })} />
          </Field>
          <p className="text-[11px] leading-relaxed text-muted">Never a card or bank number: payments are taken on Stripe&rsquo;s own page.</p>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={() => setDialog(null)} />
        </OrderDialog>
      )}

      {dialog === "me" && (
        <OrderDialog id="sx-acct-me" title="Your details" onClose={() => setDialog(null)} onSubmit={() => void run(() => saveMeAction(me))}>
          <Field id="sx-acct-name" label="Your name" error={errors.name}>
            <input id="sx-acct-name" data-autofocus className={FIELD} maxLength={120} autoComplete="name" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} />
          </Field>
          <Field id="sx-acct-title" label="Job title" error={errors.jobTitle}>
            <input id="sx-acct-title" className={FIELD} maxLength={120} autoComplete="organization-title" value={me.jobTitle} onChange={(e) => setMe({ ...me, jobTitle: e.target.value })} />
          </Field>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={() => setDialog(null)} />
        </OrderDialog>
      )}

      {dialog === "change" && (
        <OrderDialog id="sx-acct-change" title="Change name or categories" onClose={() => setDialog(null)} onSubmit={() => void run(() => requestChangeAction({ name: c.name, categories: c.categories }, change))}>
          <p className="text-[13px] leading-relaxed text-muted">
            Most changes take effect at once. A BTG person checks first when another sponsor has the name, a sensitive category is added, or a running deal depends on a category you&rsquo;re dropping.
          </p>
          <Field id="sx-acct-cname" label="Company name" error={errors.name}>
            <input id="sx-acct-cname" data-autofocus className={FIELD} maxLength={200} autoComplete="organization" value={change.name} onChange={(e) => setChange({ ...change, name: e.target.value })} />
          </Field>
          <fieldset className="min-w-0">
            <legend className="text-[13px] font-semibold">Brand categories</legend>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">What your company sells. Athletes are matched and checked for conflicts against these.</p>
            <div className="mt-2 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-bg p-2.5">
              {CATEGORY_OPTIONS.map((o) => {
                const on = change.categories.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChange({ ...change, categories: on ? change.categories.filter((v) => v !== o.value) : [...change.categories, o.value] })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-cta-ink" : "border-line text-muted hover:border-primary/50 hover:text-text"}`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {errors.categories && <p role="alert" className="mt-1 text-[11px] text-danger">{errors.categories}</p>}
          </fieldset>
          <DialogError message={error} />
          <DialogFoot busy={busy} onClose={() => setDialog(null)} save="Send the change" saving="Sending…" />
        </OrderDialog>
      )}
    </div>
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
