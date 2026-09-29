"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import {
  acceptTermsAction,
  confirmDocumentAction,
  requestDocumentAction,
  saveStepAction,
  submitOnboardingAction,
  type ViewResult,
} from "@/app/(public)/onboarding/actions";
import {
  BUSINESS_FIELDS,
  DOCUMENT_KINDS,
  EMPTY_CONTACT,
  MAX_CONTACTS,
  MAX_DOCUMENTS,
  ORG_TYPE_COPY,
  US_STATES,
  businessBody,
  businessFormFrom,
  checkDocument,
  contactsBody,
  contactsFrom,
  dateLabel,
  documentKindLabel,
  fileSize,
  firstOpenStep,
  missingByStep,
  missingLabel,
  registrationRequired,
  stepOfMissing,
  stepStatus,
  stepsFor,
  validateBusiness,
  validateContacts,
  validateOrganisation,
  type ApiOnboarding,
  type ApiOnboardingDocument,
  type ApiTerms,
  type BusinessForm,
  type ContactForm,
  type Errors,
  type StepKey,
} from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-01 — the property onboarding wizard, for an application the
   applicant may still edit (DRAFT, CHANGES_REQUESTED). Each step saves on
   its own (PATCH /public/onboarding/:token) so an organisation can finish
   over several sittings; the ticks come from the API's own `missing[]`, not
   from anything this screen decides. Documents go straight to the private
   bucket (a presigned PUT), then are confirmed. Submit is refused by the API
   with the list while anything is missing, and that list is shown by step.

   Left out on purpose: the design's "brand categories you won't accept"
   step — there is no public route to save restrictions during onboarding
   (restrictions are set after approval, signed in). No bank or tax fields,
   ever: the API refuses them, and the payout step says where they go.
   -------------------------------------------------------------------------- */

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none aria-[invalid=true]:border-danger";
const primaryBtn =
  "rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn = "rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-40";

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium">
      {label}
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] font-normal text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-normal text-danger">{error}</span>}
    </label>
  );
}

export function OnboardingWizard({ token, initial, terms }: { token: string; initial: ApiOnboarding; terms: ApiTerms | null }) {
  const router = useRouter();
  const [view, setView] = useState<ApiOnboarding>(initial);
  const [step, setStep] = useState<StepKey>(() => firstOpenStep(initial));
  const [org, setOrg] = useState({ orgName: initial.orgName, stateCode: initial.stateCode ?? "" });
  const [contacts, setContacts] = useState<ContactForm[]>(() => {
    const saved = contactsFrom(initial.contacts);
    return saved.length ? saved : [{ ...EMPTY_CONTACT, primary: true }];
  });
  const [business, setBusiness] = useState<BusinessForm>(() => businessFormFrom(initial.orgType, initial.details));
  const [payoutChecked, setPayoutChecked] = useState(Boolean(initial.payoutAcknowledgedAt));
  const [termsChecked, setTermsChecked] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ text: string; reload?: boolean } | null>(null);
  const [submitMissing, setSubmitMissing] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  const steps = stepsFor(view.orgType);
  const idx = Math.max(0, steps.findIndex((s) => s.key === step));
  const byStep = missingByStep(view.missing, view.orgType);
  const changes = view.state === "CHANGES_REQUESTED";
  const termsAccepted = Boolean(view.termsAcceptedAt) && !!terms && view.termsAgreementId === terms.agreementId;

  const go = (to: StepKey) => {
    setStep(to);
    setErrors({});
    setMessage(null);
    window.scrollTo({ top: 0 });
  };
  const nextStep = () => go(steps[Math.min(steps.length - 1, idx + 1)]!.key);

  /** Run a save; on success take the API's view and move on. */
  const save = (run: () => Promise<ViewResult>, advance = true) => {
    setMessage(null);
    start(async () => {
      const r = await run();
      if (!r.ok) {
        setMessage({ text: r.message, reload: r.status === 409 });
        return;
      }
      setView(r.view);
      setSubmitMissing(null);
      if (advance) nextStep();
    });
  };

  const saveOrganisation = () => {
    const e = validateOrganisation(org);
    setErrors(e);
    if (Object.keys(e).length) return;
    save(() => saveStepAction(token, { step: "organisation", orgName: org.orgName.trim(), stateCode: org.stateCode }));
  };
  const saveContacts = () => {
    const e = validateContacts(contacts);
    setErrors(e);
    if (Object.keys(e).length) return;
    save(() => saveStepAction(token, { step: "contacts", contacts: contactsBody(contacts) }));
  };
  const saveBusiness = () => {
    const e = validateBusiness(view.orgType, business, view.stateCode);
    setErrors(e);
    if (Object.keys(e).length) return;
    save(() => saveStepAction(token, { step: "business", details: businessBody(view.orgType, business) }));
  };
  const savePayout = () => {
    if (view.payoutAcknowledgedAt) return nextStep();
    if (!payoutChecked) return setErrors({ payout: "Tick the box to confirm you've read this." });
    save(() => saveStepAction(token, { step: "payout", acknowledged: true }));
  };
  const saveTerms = () => {
    if (termsAccepted) return nextStep();
    if (!terms?.body) return;
    if (!termsChecked) return setErrors({ terms: "Tick the box to accept the terms." });
    const body = terms.body;
    save(() => acceptTermsAction(token, terms.agreementId, body));
  };
  const submit = () => {
    setMessage(null);
    start(async () => {
      const r = await submitOnboardingAction(token);
      if (!r.ok) {
        setMessage({ text: r.message, reload: r.status === 409 });
        setSubmitMissing(r.missing ?? null);
        return;
      }
      setView(r.view);
      router.refresh();
    });
  };

  const setContact = (i: number, patch: Partial<ContactForm>) =>
    setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : patch.primary ? { ...c, primary: false } : c)));

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Application steps" className="hidden lg:block">
        <p className="text-[11px] uppercase tracking-[0.2em] text-faint">{ORG_TYPE_COPY[view.orgType].label} · application</p>
        <p className="mt-1 truncate text-sm font-semibold">{view.orgName}</p>
        <ol className="mt-4 space-y-1">
          {steps.map((s, i) => {
            const st = stepStatus(s.key, view);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(s.key)}
                  aria-current={s.key === step ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    s.key === step ? "bg-surface-2 text-text" : "text-muted hover:text-text"
                  }`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums ${
                      st === "done" ? "border-accent/50 bg-accent/12 text-accent" : "border-line"
                    }`}
                  >
                    {st === "done" ? "✓" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {st === "optional" && <span className="text-[10px] text-faint">optional</span>}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-[11px] text-faint">Each step saves when you continue. Come back any time with this page&rsquo;s address.</p>
      </nav>

      <section className="min-w-0 space-y-5">
        <div className="lg:hidden">
          <p className="text-[11px] text-muted">
            Step {idx + 1} of {steps.length} · {steps[idx]!.label}
          </p>
          <div className="mt-2 flex gap-1">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                aria-label={s.label}
                onClick={() => go(s.key)}
                className={`h-1.5 flex-1 rounded-full ${i === idx ? "bg-primary" : stepStatus(s.key, view) === "done" ? "bg-accent/60" : "bg-surface-2"}`}
              />
            ))}
          </div>
        </div>

        {changes && view.reviewNotes && (
          <div className="rounded-xl border border-primary/40 bg-primary/8 p-4">
            <p className="text-xs font-semibold text-primary-soft">Changes requested by BTG · {dateLabel(view.decidedAt)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">&ldquo;{view.reviewNotes}&rdquo;</p>
            <p className="mt-2 text-[11px] text-muted">Make the changes, then resubmit from Review &amp; submit. Everything else stays as you submitted it.</p>
          </div>
        )}

        {step === "organisation" && (
          <StepCard title="Organisation" hint="Shown to BTG during review. Your public profile comes later.">
            <Field label="Organisation name" error={errors.orgName}>
              <input
                className={field}
                value={org.orgName}
                maxLength={200}
                aria-invalid={errors.orgName ? "true" : "false"}
                onChange={(e) => setOrg({ ...org, orgName: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <input className={`${field} text-muted`} value={ORG_TYPE_COPY[view.orgType].label} readOnly />
            </Field>
            <Field label="State you operate in" error={errors.stateCode} hint="SponsorX operates in the United States.">
              <select
                className={field}
                value={org.stateCode}
                aria-invalid={errors.stateCode ? "true" : "false"}
                onChange={(e) => setOrg({ ...org, stateCode: e.target.value })}
              >
                <option value="">Choose a state…</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Actions pending={pending} onBack={null} onNext={saveOrganisation} />
          </StepCard>
        )}

        {step === "contacts" && (
          <StepCard title="Contacts" hint="Who BTG talks to. The primary contact gets the emails — and, on approval, the login to manage your property.">
            {contacts.map((c, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-line-soft p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="radio"
                      name="primary"
                      checked={c.primary}
                      onChange={() => setContact(i, { primary: true })}
                      className="accent-[var(--sx-primary)]"
                    />
                    Primary contact
                  </label>
                  {contacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}
                      className="text-[11px] text-muted hover:text-danger"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" error={errors[`${i}.name`]}>
                    <input className={field} value={c.name} autoComplete="name" onChange={(e) => setContact(i, { name: e.target.value })} aria-invalid={errors[`${i}.name`] ? "true" : "false"} />
                  </Field>
                  <Field label="Role" error={errors[`${i}.role`]}>
                    <input className={field} value={c.role} placeholder="e.g. Team manager" onChange={(e) => setContact(i, { role: e.target.value })} aria-invalid={errors[`${i}.role`] ? "true" : "false"} />
                  </Field>
                  <Field label="Email" error={errors[`${i}.email`]}>
                    <input type="email" className={field} value={c.email} autoComplete="email" onChange={(e) => setContact(i, { email: e.target.value })} aria-invalid={errors[`${i}.email`] ? "true" : "false"} />
                  </Field>
                  <Field label="Phone (optional)" error={errors[`${i}.phone`]}>
                    <input type="tel" className={field} value={c.phone} autoComplete="tel" onChange={(e) => setContact(i, { phone: e.target.value })} aria-invalid={errors[`${i}.phone`] ? "true" : "false"} />
                  </Field>
                </div>
              </div>
            ))}
            {errors.list && <p className="text-xs text-danger">{errors.list}</p>}
            {contacts.length < MAX_CONTACTS && (
              <button
                type="button"
                onClick={() => setContacts((cs) => [...cs, { ...EMPTY_CONTACT, primary: cs.length === 0 }])}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Add another contact
              </button>
            )}
            <Actions pending={pending} onBack={() => go("organisation")} onNext={saveContacts} />
          </StepCard>
        )}

        {step === "business" && (
          <StepCard title={steps[2]!.label} hint="What BTG checks before you can list. Only what's asked for here — nothing about bank accounts or tax.">
            {BUSINESS_FIELDS[view.orgType].map((f) => {
              const required = !f.optional || (f.key === "stateRegistrationId" && registrationRequired(view.orgType, view.stateCode));
              const label = required ? f.label : `${f.label} (optional)`;
              const common = {
                className: field,
                value: business[f.key] ?? "",
                "aria-invalid": errors[f.key] ? ("true" as const) : ("false" as const),
              };
              return (
                <Field key={f.key} label={label} error={errors[f.key]} hint={f.hint}>
                  {f.kind === "textarea" ? (
                    <textarea {...common} rows={3} maxLength={f.max} onChange={(e) => setBusiness({ ...business, [f.key]: e.target.value })} />
                  ) : (
                    <input
                      {...common}
                      type={f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text"}
                      maxLength={f.kind === "list" ? undefined : f.max}
                      placeholder={f.kind === "url" ? "https://" : undefined}
                      onChange={(e) => setBusiness({ ...business, [f.key]: e.target.value })}
                    />
                  )}
                </Field>
              );
            })}
            {view.orgType !== "SCHOOL" && !view.stateCode && (
              <p className="text-[11px] text-faint">Organisations in CA, NY, TX, FL and IL must also give their state registration number — pick your state on the first step.</p>
            )}
            <Actions pending={pending} onBack={() => go("contacts")} onNext={saveBusiness} />
          </StepCard>
        )}

        {step === "payout" && (
          <StepCard title="How you get paid" hint="Payout and tax details go to our payment partner, never to SponsorX.">
            <div className="space-y-2 text-sm leading-relaxed text-muted">
              <p>
                Payouts are made through the marketplace&rsquo;s payment provider. You set up bank and tax details on the provider&rsquo;s own page — SponsorX never asks for,
                sees or stores them.
              </p>
              <p>Payouts follow an order closing, less BTG fees and processing. Every cent shows in your earnings ledger once you&rsquo;re approved.</p>
            </div>
            {view.payoutAcknowledgedAt ? (
              <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">Acknowledged on {dateLabel(view.payoutAcknowledgedAt)}.</p>
            ) : (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={payoutChecked} onChange={(e) => setPayoutChecked(e.target.checked)} className="mt-0.5 size-3.5 accent-[var(--sx-primary)]" />
                <span className="text-xs font-medium leading-relaxed">
                  I understand SponsorX won&rsquo;t collect bank or tax details, and payouts are set up with the payment provider.
                </span>
              </label>
            )}
            {errors.payout && <p className="text-xs text-danger">{errors.payout}</p>}
            <Actions pending={pending} onBack={() => go("business")} onNext={savePayout} />
          </StepCard>
        )}

        {step === "documents" && (
          <StepCard title="Documents" hint="Optional, and they help BTG verify you faster. PDF, JPEG or PNG up to 20 MB each. Only BTG reviewers see these.">
            <DocumentsStep token={token} documents={view.documents} onChange={(documents) => setView((v) => ({ ...v, documents }))} />
            <Actions pending={pending} onBack={() => go("payout")} onNext={() => go("agreements")} nextLabel="Continue" />
          </StepCard>
        )}

        {step === "agreements" && (
          <StepCard title="Property terms" hint="Read them through — accepting records exactly this version.">
            {!terms || terms.body === null ? (
              <p className="rounded-lg bg-warn/10 px-3 py-2.5 text-xs text-warn">The terms aren&rsquo;t available right now — contact BTG.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted">SponsorX Property Terms · version {terms.version}</p>
                <div tabIndex={0} className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line-soft bg-surface-2 p-3 text-xs leading-relaxed">
                  {terms.body}
                </div>
                {termsAccepted ? (
                  <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">
                    You accepted version {terms.version} on {dateLabel(view.termsAcceptedAt)}.
                  </p>
                ) : (
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input type="checkbox" checked={termsChecked} onChange={(e) => setTermsChecked(e.target.checked)} className="mt-0.5 size-3.5 accent-[var(--sx-primary)]" />
                    <span className="text-xs font-medium leading-relaxed">
                      I&rsquo;ve read the SponsorX Property Terms (version {terms.version}) shown above and accept them on behalf of {view.orgName}.
                    </span>
                  </label>
                )}
                {errors.terms && <p className="text-xs text-danger">{errors.terms}</p>}
              </>
            )}
            <Actions
              pending={pending}
              onBack={() => go("documents")}
              onNext={saveTerms}
              nextLabel={termsAccepted ? "Continue" : "Accept and continue"}
              disabled={!terms || terms.body === null}
            />
          </StepCard>
        )}

        {step === "review" && (
          <StepCard title={changes ? "Review & resubmit" : "Review & submit"} hint="BTG reviews every application. You'll hear back by email at the primary contact's address.">
            <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
              {steps
                .filter((s) => s.key !== "review")
                .map((s) => {
                  const st = stepStatus(s.key, view);
                  const missing = byStep[s.key] ?? [];
                  return (
                    <li key={s.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          <span className={st === "done" ? "text-accent" : st === "optional" ? "text-faint" : "text-warn"}>
                            {st === "done" ? "✓" : st === "optional" ? "○" : "!"}
                          </span>{" "}
                          {s.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">{summaryFor(s.key, view, terms)}</p>
                        {missing.length > 0 && <p className="mt-0.5 text-[11px] text-warn">Still needed: {missing.join(", ")}</p>}
                      </div>
                      <button type="button" onClick={() => go(s.key)} className="shrink-0 text-xs text-primary hover:underline">
                        Edit
                      </button>
                    </li>
                  );
                })}
            </ul>
            {submitMissing && submitMissing.length > 0 && (
              <div className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
                <p className="font-semibold">BTG can&rsquo;t review it until these are in:</p>
                <ul className="mt-1 list-disc pl-4">
                  {submitMissing.map((k) => (
                    <li key={k}>
                      <button type="button" className="underline" onClick={() => go(stepOfMissing(k))}>
                        {missingLabel(k, view.orgType)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" onClick={() => go("agreements")} className={secondaryBtn} disabled={pending}>
                Back
              </button>
              <button type="button" onClick={submit} className={primaryBtn} disabled={pending || view.missing.length > 0}>
                {pending ? "Sending…" : changes ? "Resubmit for review" : "Submit for review"}
              </button>
              {view.missing.length > 0 && <span className="text-[11px] text-faint">Finish the steps marked ! first.</span>}
            </div>
          </StepCard>
        )}

        {message && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2">
            <p className="text-xs text-danger">{message.text}</p>
            {message.reload && (
              <button type="button" onClick={() => router.refresh()} className="text-xs font-medium text-danger underline">
                Reload
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function StepCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Actions({
  pending,
  onBack,
  onNext,
  nextLabel = "Save and continue",
  disabled,
}: {
  pending: boolean;
  onBack: (() => void) | null;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      {onBack && (
        <button type="button" onClick={onBack} className={secondaryBtn} disabled={pending}>
          Back
        </button>
      )}
      <button type="button" onClick={onNext} className={primaryBtn} disabled={pending || disabled}>
        {pending ? "Saving…" : nextLabel}
      </button>
    </div>
  );
}

/** One line per step for the review list, from the saved answers only. */
function summaryFor(step: StepKey, v: ApiOnboarding, terms: ApiTerms | null): string {
  switch (step) {
    case "organisation":
      return [v.orgName, v.stateCode].filter(Boolean).join(" · ") || "Not answered yet";
    case "contacts": {
      const cs = contactsFrom(v.contacts);
      const p = cs.find((c) => c.primary);
      return cs.length ? `${cs.length} contact${cs.length === 1 ? "" : "s"}${p ? ` · primary ${p.name} (${p.email})` : ""}` : "Not answered yet";
    }
    case "business": {
      const f = businessFormFrom(v.orgType, v.details);
      const filled = BUSINESS_FIELDS[v.orgType].filter((x) => f[x.key]?.trim());
      return filled.length ? filled.map((x) => f[x.key]).join(" · ") : "Not answered yet";
    }
    case "payout":
      return v.payoutAcknowledgedAt ? `Acknowledged ${dateLabel(v.payoutAcknowledgedAt)}` : "Not acknowledged yet";
    case "documents": {
      const n = v.documents.filter((d) => d.uploadedAt).length;
      return n ? `${n} uploaded` : "None — optional";
    }
    case "agreements":
      return v.termsAcceptedAt ? `Accepted${terms && v.termsAgreementId === terms.agreementId ? ` version ${terms.version}` : ""} ${dateLabel(v.termsAcceptedAt)}` : "Not accepted yet";
    default:
      return "";
  }
}

/* ── documents: request a PUT, send the bytes, confirm ─────────────────── */

function DocumentsStep({
  token,
  documents,
  onChange,
}: {
  token: string;
  documents: ApiOnboardingDocument[];
  onChange: (docs: ApiOnboardingDocument[]) => void;
}) {
  const [kind, setKind] = useState(DOCUMENT_KINDS[0]!.key);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const full = documents.length >= MAX_DOCUMENTS;

  const replace = (docs: ApiOnboardingDocument[], d: ApiOnboardingDocument) => {
    const i = docs.findIndex((x) => x.id === d.id);
    return i < 0 ? [...docs, d] : docs.map((x) => (x.id === d.id ? d : x));
  };

  const confirm = async (docs: ApiOnboardingDocument[], id: string) => {
    const c = await confirmDocumentAction(token, id);
    if (!c.ok) {
      setError(c.message);
      return;
    }
    onChange(replace(docs, c.document));
  };

  const upload = async (file: File) => {
    setError(null);
    const problem = checkDocument({ name: file.name, type: file.type, size: file.size }, documents.length);
    if (problem) return setError(problem);
    setBusy(`Uploading ${file.name}…`);
    try {
      const g = await requestDocumentAction(token, { kind, filename: file.name, contentType: file.type, bytes: file.size });
      if (!g.ok) return setError(g.message);
      const docs = replace(documents, g.document);
      onChange(docs);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: file });
      } catch {
        return setError("The upload didn't reach storage. Check your connection, then use Check again — or upload the file again.");
      }
      if (!put.ok) return setError("Storage refused the upload. Try the file again.");
      await confirm(docs, g.document.id);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const recheck = async (id: string) => {
    setError(null);
    setBusy("Checking the upload…");
    try {
      await confirm(documents, id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {documents.length > 0 ? (
        <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.filename}</p>
                <p className="text-[11px] text-muted">
                  {documentKindLabel(d.kind)} · {fileSize(d.bytes)}
                </p>
              </div>
              {d.uploadedAt ? (
                <span className="text-[11px] font-medium text-accent">Received {dateLabel(d.uploadedAt)}</span>
              ) : (
                <span className="flex items-center gap-2 text-[11px] text-warn">
                  Not received
                  <button type="button" disabled={busy !== null} onClick={() => recheck(d.id)} className="underline disabled:opacity-40">
                    Check again
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-faint">No documents yet. Proof you have the rights to sell your inventory, or your business registration, helps most.</p>
      )}

      {full ? (
        <p className="text-xs text-muted">This application holds the most documents it can ({MAX_DOCUMENTS}). Documents can&rsquo;t be removed once added.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end">
          <Field label="What is it?">
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy !== null}>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="File">
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              disabled={busy !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
              className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:font-medium file:text-text"
            />
          </Field>
        </div>
      )}
      {busy && <p className="text-xs text-muted">{busy}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-[11px] text-faint">Documents can&rsquo;t be removed once added, and you can&rsquo;t open them again from here — only BTG reviewers can.</p>
    </div>
  );
}
