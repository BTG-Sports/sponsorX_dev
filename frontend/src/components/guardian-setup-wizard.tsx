"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { GuardianAgreementText } from "@/components/guardian-agreement";
import {
  ID_UPLOAD, PROOF_KINDS, RELATIONSHIPS, SETUP_STEPS, guardianAgreement, stepMove,
  type ApiGuardianSetup, type SetupStep,
} from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   The guardian's five steps — 2S1-FE-06, guardian half (design
   GuardianSetup.dc.html, views details / id / proof / agreement / done /
   approved). One island because the step and the answers are shared across
   the steps.

   SCAFFOLD until 2S1-BE-10. Moving between steps is all this does: it is
   local, nothing is saved, and every control that would reach the server —
   both uploads and "Accept and finish" — is off, with the reason in its
   tooltip. "done" and "approved" are only ever the ?demo= previews, so the
   page never pretends a set-up finished.
   -------------------------------------------------------------------------- */

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
const fileBtn =
  "min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text disabled:cursor-not-allowed disabled:opacity-40";

const NOT_YET = "Uploads go live with 2S1-BE-10 — nothing is sent yet.";

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="flex flex-col text-xs font-medium">
      {text}
      {children}
    </label>
  );
}

function DropZone({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-line bg-bg p-4 text-center text-xs text-muted">
      <span className="text-sm font-medium text-text">{title}</span>
      <span>{hint}</span>
      <button type="button" disabled title={NOT_YET} className={fileBtn}>
        Choose file
      </button>
    </div>
  );
}

export function GuardianSetupWizard({ setup, preview }: { setup: ApiGuardianSetup; preview: "done" | "approved" | null }) {
  const [step, setStep] = useState<SetupStep>("details");
  const [name, setName] = useState(setup.guardian.name);
  const [relationship, setRelationship] = useState<string>(setup.guardian.relationship ?? "");
  const [phone, setPhone] = useState(setup.guardian.phone ?? "");
  const [proof, setProof] = useState<string>(setup.proof?.kind ?? PROOF_KINDS[0].key);
  const [accepted, setAccepted] = useState(false);

  const a = setup.athlete.firstName;
  const view: SetupStep | "approved" = preview ?? step;
  const idx = view === "approved" ? SETUP_STEPS.length : SETUP_STEPS.findIndex((s) => s.key === view);
  const title = view === "approved" ? "Approved" : SETUP_STEPS[idx]!.title.replace("the guardian", `${a}’s guardian`);
  const agreement = guardianAgreement(a);

  return (
    <div className="space-y-4">
      <ol aria-label="Steps" className="grid gap-1.5 sm:grid-cols-5">
        {SETUP_STEPS.map((s, i) => {
          const done = i < idx;
          const cur = i === idx;
          return (
            <li
              key={s.key}
              aria-current={cur ? "step" : undefined}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                cur ? "border-primary-soft bg-primary/12 font-semibold text-text" : done ? "border-success/35 text-text" : "border-line text-faint"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  done ? "bg-success/14 text-success" : cur ? "bg-primary/15 text-primary-soft" : "bg-surface-2 text-faint"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span>
                {i + 1} · {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <section aria-label={title} className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>

        {view === "details" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="Your full name">
              <input type="text" className={field} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </Label>
            <Label text={`Relationship to ${a}`}>
              <select className={field} value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="" disabled>
                  Choose one
                </option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Label>
            <Label text="Phone">
              <input type="tel" className={field} value={phone} placeholder="Your phone number" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
            </Label>
            <Label text="Email">
              <input type="email" className={`${field} text-muted`} value={`${setup.guardian.email}${setup.guardian.emailConfirmed ? " · confirmed" : ""}`} readOnly />
            </Label>
          </div>
        )}

        {view === "id" && (
          <div className="space-y-2.5">
            <p className="text-xs leading-relaxed text-muted">A driver&rsquo;s license, passport or state ID. Only BTG&rsquo;s reviewers can open it, and each view is recorded.</p>
            <DropZone title="Add a photo or scan of your ID" hint={ID_UPLOAD.label} />
          </div>
        )}

        {view === "proof" && (
          <div className="space-y-2.5">
            <p className="text-xs leading-relaxed text-muted">One document that shows you&rsquo;re {a}&rsquo;s guardian.</p>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-medium">Which document?</legend>
              {PROOF_KINDS.map((o) => (
                <label
                  key={o.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-bg px-3 py-2.5 text-sm has-checked:border-primary-soft has-checked:bg-primary/8"
                >
                  <input type="radio" name="proof" value={o.key} checked={proof === o.key} onChange={() => setProof(o.key)} className="accent-[var(--sx-primary)]" />
                  {o.label}
                </label>
              ))}
            </fieldset>
            <DropZone title="Add the document" hint={ID_UPLOAD.label} />
          </div>
        )}

        {view === "agreement" && (
          <div className="space-y-2.5">
            <GuardianAgreementText agreement={agreement} />
            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-normal">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 accent-[var(--sx-primary)]" />
              I&rsquo;m {a}&rsquo;s guardian and I accept the guardian agreement.
            </label>
          </div>
        )}

        {view === "done" && (
          <div role="status" className="space-y-2">
            <p className="text-[15px] font-semibold">Thanks, {name.split(" ")[0]}. That&rsquo;s everything.</p>
            <p className="text-sm leading-relaxed text-muted">
              SponsorX checks your documents now. Most checks finish by themselves; if a person needs to look, we&rsquo;ll email you. You don&rsquo;t need to do anything else.
            </p>
          </div>
        )}

        {view === "approved" && (
          <div role="status" className="space-y-3">
            <p className="text-base font-bold text-success">You&rsquo;re approved ✓</p>
            <p className="text-sm leading-relaxed text-muted">
              Sign in to manage {a}&rsquo;s account: approve agreements and payments, and set up where {a}&rsquo;s money is paid.
            </p>
            <Link href="/login" className={`${primaryBtn} self-start`}>
              Sign in to manage {a}&rsquo;s account
            </Link>
          </div>
        )}

        {!preview && (
          <div className="flex flex-wrap justify-between gap-2.5 border-t border-line-soft pt-3">
            <button type="button" className={secondaryBtn} disabled={step === "details"} onClick={() => setStep(stepMove(step, -1))}>
              Back
            </button>
            {step === "agreement" ? (
              <button
                type="button"
                className={primaryBtn}
                disabled
                title={accepted ? "Finishing goes live with 2S1-BE-10 — nothing is sent yet." : "Tick the box to accept the agreement first. (Finishing goes live with 2S1-BE-10.)"}
              >
                Accept and finish
              </button>
            ) : (
              <button type="button" className={primaryBtn} onClick={() => setStep(stepMove(step, 1))}>
                Continue
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
