"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";

import {
  acceptGuardianAgreementAction, confirmGuardianDocumentAction, requestGuardianDocumentAction, saveGuardianDetailsAction,
} from "@/app/(public)/guardian/setup/actions";
import { GuardianAgreementText } from "@/components/guardian-agreement";
import { IdUpload } from "@/components/id-upload";
import {
  PROOF_KINDS, RELATIONSHIP_OPTIONS, SETUP_STEPS, agreementFromBody, firstOpenStep, stepMove,
  type ApiGuardianSetup, type ApiGuardianSetupLive, type RelationshipCode, type SetupStep,
} from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   The guardian's five steps — 2S1-FE-06, guardian half (design
   GuardianSetup.dc.html, views details / id / proof / agreement / done /
   approved). One island because the step and the answers are shared across
   the steps.

   LIVE (mode "live", since 2S1-BE-10): each step saves as the guardian goes
   — details (PATCH), the ID and the proof straight to the private bucket
   (IdUpload: a presigned PUT, then confirm), the agreement accepted against
   the version and text shown. Every answer is the page's new status, so
   "done" and "approved" are what the API says, never assumed.

   PREVIEW (mode "preview", ?demo=done|approved on the sample guardian):
   the two after-finishing views only, and nothing is sent.
   -------------------------------------------------------------------------- */

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

type Mode =
  | { kind: "live"; token: string; setup: ApiGuardianSetupLive }
  | { kind: "preview"; setup: ApiGuardianSetup; preview: "done" | "approved" };

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="flex flex-col text-xs font-medium">
      {text}
      {children}
    </label>
  );
}

function Steps({ idx }: { idx: number }) {
  return (
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
  );
}

export function GuardianSetupWizard({ mode }: { mode: Mode }) {
  if (mode.kind === "preview") return <Preview setup={mode.setup} view={mode.preview} />;
  return <Live token={mode.token} initial={mode.setup} />;
}

/* ------------------------------------------------------------------ live */

function Live({ token, initial }: { token: string; initial: ApiGuardianSetupLive }) {
  const [s, setS] = useState(initial);
  const [step, setStep] = useState<SetupStep>(firstOpenStep(initial));
  const [name, setName] = useState(initial.guardian.name);
  const [relationship, setRelationship] = useState<RelationshipCode | "">(initial.guardian.relationship ?? "");
  const [phone, setPhone] = useState(initial.guardian.phone ?? "");
  const [proof, setProof] = useState<string>(initial.proof?.kind ?? PROOF_KINDS[0].key);
  const [accepted, setAccepted] = useState(Boolean(initial.agreementAcceptedAt));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const a = s.athlete.firstName;
  const finished = s.state === "APPROVED" || s.state === "CHECKING" || s.state === "HELD";
  const view: SetupStep | "approved" | "rejected" = s.state === "REJECTED" ? "rejected" : s.state === "APPROVED" ? "approved" : finished && step === "done" ? "done" : step;
  const idx = view === "approved" ? SETUP_STEPS.length : view === "rejected" ? 0 : SETUP_STEPS.findIndex((x) => x.key === view);
  const title = view === "approved" ? "Approved" : view === "rejected" ? "Closed by BTG" : SETUP_STEPS[idx]!.title.replace("the guardian", `${a}’s guardian`);
  const agreement = s.agreement ? agreementFromBody(s.agreement.body, s.agreement.version) : null;
  const locked = s.state === "APPROVED";

  const apply = (next: ApiGuardianSetupLive) => {
    setS(next);
    if (next.agreementAcceptedAt) setAccepted(true);
  };

  const saveDetails = () =>
    start(async () => {
      setError(null);
      if (!relationship) return setError(`Choose how you're related to ${a}.`);
      const r = await saveGuardianDetailsAction(token, { legalName: name, relationship, phone });
      if (!r.ok) return setError(r.message);
      apply(r.data);
      setStep(stepMove("details", 1));
    });

  const accept = () =>
    start(async () => {
      setError(null);
      if (!s.agreement) return setError("The guardian agreement isn't available yet — try again in a minute.");
      const r = await acceptGuardianAgreementAction(token, { agreementId: s.agreement.agreementId, bodyHash: s.agreement.bodyHash });
      if (!r.ok) return setError(r.message);
      apply(r.data);
      setStep("done");
    });

  const next = () => {
    setError(null);
    if (step === "details") {
      if (locked) return setStep("id");
      return saveDetails();
    }
    setStep(stepMove(step, 1));
  };

  return (
    <div className="space-y-4">
      <Steps idx={idx} />
      <section aria-label={title} className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>

        {view === "details" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Label text="Your full name">
              <input type="text" className={field} value={name} autoComplete="name" disabled={locked} onChange={(e) => setName(e.target.value)} />
            </Label>
            <Label text={`Relationship to ${a}`}>
              <select className={field} value={relationship} disabled={locked} onChange={(e) => setRelationship(e.target.value as RelationshipCode)}>
                <option value="" disabled>
                  Choose one
                </option>
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </Label>
            <Label text="Phone">
              <input type="tel" className={field} value={phone} placeholder="Your phone number" autoComplete="tel" disabled={locked} onChange={(e) => setPhone(e.target.value)} />
            </Label>
            <Label text="Email">
              <input type="email" className={`${field} text-muted`} value={`${s.guardian.email}${s.guardian.emailConfirmed ? " · confirmed" : ""}`} readOnly />
            </Label>
            {locked && <p className="text-xs text-muted sm:col-span-2">Your details are approved. To change them, contact BTG.</p>}
          </div>
        )}

        {view === "id" && (
          <div className="space-y-2.5">
            <p className="text-xs leading-relaxed text-muted">A driver&rsquo;s license, passport or state ID. Only BTG&rsquo;s reviewers can open it, and each view is recorded.</p>
            <IdUpload
              title="Add a photo or scan of your ID"
              doneLabel={s.idUploaded ? "Your ID is in" : null}
              request={(f) => requestGuardianDocumentAction(token, "GUARDIAN_ID", null, f)}
              confirm={(id) => confirmGuardianDocumentAction(token, id)}
              onDone={apply}
            />
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
            <IdUpload
              title="Add the document"
              doneLabel={s.proof ? `${s.proof.fileName} is in` : null}
              request={(f) => requestGuardianDocumentAction(token, "GUARDIANSHIP_PROOF", proof, f)}
              confirm={(id) => confirmGuardianDocumentAction(token, id)}
              onDone={apply}
            />
          </div>
        )}

        {view === "agreement" && (
          <div className="space-y-2.5">
            {agreement ? (
              <GuardianAgreementText agreement={agreement} />
            ) : (
              <p className="text-xs text-warn">The guardian agreement can&rsquo;t be shown just now. Try again in a minute.</p>
            )}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-normal">
              <input type="checkbox" checked={accepted} disabled={Boolean(s.agreementAcceptedAt)} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 accent-[var(--sx-primary)]" />
              I&rsquo;m {a}&rsquo;s guardian and I accept the guardian agreement.
            </label>
            {s.agreementAcceptedAt && <p className="text-xs text-success">Accepted — this records the version, the time, and your device.</p>}
          </div>
        )}

        {view === "done" && (
          <div role="status" className="space-y-2">
            <p className="text-[15px] font-semibold">Thanks, {name.split(" ")[0]}. That&rsquo;s everything from you.</p>
            {s.state === "HELD" ? (
              <p className="text-sm leading-relaxed text-muted">A person at BTG is checking {a}&rsquo;s sign-up before it&rsquo;s approved. We&rsquo;ll email you either way — you don&rsquo;t need to do anything else.</p>
            ) : s.athleteMissing.length ? (
              <p className="text-sm leading-relaxed text-muted">
                You&rsquo;re approved as soon as {a} finishes too. Still to do: {s.athleteMissing.join("; ")}. We&rsquo;ll email you when it&rsquo;s done.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-muted">SponsorX checks everything now. Most checks finish by themselves; if a person needs to look, we&rsquo;ll email you.</p>
            )}
          </div>
        )}

        {view === "approved" && (
          <div role="status" className="space-y-3">
            <p className="text-base font-bold text-success">You&rsquo;re approved ✓</p>
            <p className="text-sm leading-relaxed text-muted">
              Sign in with {s.guardian.email} to manage {a}&rsquo;s account: approve agreements and payments, and set up where {a}&rsquo;s money is paid.
            </p>
            <Link href="/login" className={`${primaryBtn} self-start`}>
              Sign in to manage {a}&rsquo;s account
            </Link>
          </div>
        )}

        {view === "rejected" && (
          <div role="status" className="space-y-2">
            <p className="text-sm leading-relaxed text-muted">BTG has closed this guardian account. The reason was in the email BTG sent you.</p>
            <Link href="/contact?topic=guardianship" className="text-sm text-primary-soft hover:underline">Contact BTG</Link>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-danger">{error}</p>}

        {(view === "details" || view === "id" || view === "proof" || view === "agreement") && (
          <div className="flex flex-wrap justify-between gap-2.5 border-t border-line-soft pt-3">
            <button type="button" className={secondaryBtn} disabled={step === "details" || pending} onClick={() => setStep(stepMove(step, -1))}>
              Back
            </button>
            {step === "agreement" ? (
              s.agreementAcceptedAt ? (
                <button type="button" className={primaryBtn} onClick={() => setStep("done")}>Continue</button>
              ) : (
                <button type="button" className={primaryBtn} disabled={!accepted || pending || !s.agreement} onClick={accept}
                  title={accepted ? undefined : "Tick the box to accept the agreement first."}>
                  {pending ? "Saving…" : "Accept and finish"}
                </button>
              )
            ) : (
              <button
                type="button"
                className={primaryBtn}
                disabled={pending || (step === "id" && !s.idUploaded) || (step === "proof" && !s.proof)}
                title={step === "id" && !s.idUploaded ? "Upload your ID first." : step === "proof" && !s.proof ? "Upload the document first." : undefined}
                onClick={next}
              >
                {pending ? "Saving…" : "Continue"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- preview */

function Preview({ setup, view }: { setup: ApiGuardianSetup; view: "done" | "approved" }) {
  const a = setup.athlete.firstName;
  const idx = view === "approved" ? SETUP_STEPS.length : SETUP_STEPS.findIndex((s) => s.key === view);
  return (
    <div className="space-y-4">
      <Steps idx={idx} />
      <section aria-label={view === "approved" ? "Approved" : "Done"} className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">{view === "approved" ? "Approved" : "Done"}</h2>
        {view === "done" ? (
          <div role="status" className="space-y-2">
            <p className="text-[15px] font-semibold">Thanks, {setup.guardian.name.split(" ")[0]}. That&rsquo;s everything.</p>
            <p className="text-sm leading-relaxed text-muted">
              SponsorX checks your documents now. Most checks finish by themselves; if a person needs to look, we&rsquo;ll email you. You don&rsquo;t need to do anything else.
            </p>
          </div>
        ) : (
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
      </section>
    </div>
  );
}
