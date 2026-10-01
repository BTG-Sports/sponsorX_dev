import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OnboardingDecisionPanel } from "@/components/onboarding-decision";
import { OrgDocumentOpen } from "@/components/org-document-open";
import { EmptyState } from "@/components/states";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { waitLabel } from "@/lib/marketplace-ops-live";
import {
  BUSINESS_FIELDS,
  ORG_TYPE_COPY,
  STATE_COPY,
  businessFormFrom,
  contactsFrom,
  dateLabel,
  fileSize,
  missingByStep,
  stepsFor,
  type ApiOnboarding,
} from "@/lib/onboarding-live";
import { checklistHeading, momentOf, profileDocumentLine, profileStanding, type ApiOrgProfile } from "@/lib/org-profile-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One organization — 2S1-FE-02 (the application) and, since 2S1-FE-05, the
   organization profile page every BTG email links to (2S1-BE-06: "BTG
   admins are emailed a link to each new organisation's profile"). It is
   this page, not a new route: the email's link is
   ${APP_URL}/admin/onboarding/<id>, and the application, its documents and
   BTG's decisions already live here.

   What it shows: how the organization stands (approved automatically, held
   with its reasons, flagged after a document change, rejected); the
   checklist as it was when the system approved it (or the live one while
   it waits); every answer; every document with its history, each opened
   through a five-minute audited link only when BTG clicks View; its
   activity; its logins; and the decisions open now — Reject (a reason,
   emailed) and Reinstate included.

   Reads  GET /onboarding/:id            the application and what is missing
          GET /onboarding/:id/profile    standing, checklist, documents + history, activity, logins
   Writes POST /onboarding/:id/decision  (the panel's server action)
          GET /onboarding/:id/documents/:documentId  (the viewer's server action — a 5-minute link, audited)
   BTG_ADMIN and SUPER_ADMIN only. The API answers an unknown id with 403,
   so for a reviewer who does hold the role that reads as "no such
   application". The full audit trail stays one click away.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/onboarding";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Property verification" roles={lacking} />;

  const { id } = await params;
  const [res, profileRes] = await Promise.all([
    apiFetch(`/onboarding/${encodeURIComponent(id)}`),
    apiFetch(`/onboarding/${encodeURIComponent(id)}/profile`),
  ]);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-5">
        <Link href={PATH} className="text-xs text-muted hover:text-text">
          ← Property verification
        </Link>
        <EmptyState mark="inbox" title="No application matches this link" hint="It may belong to another tenant, or the address is incomplete." action={{ label: "Back to the queue", href: PATH }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`The application didn't load (${res.status}).`);
  if (!profileRes.ok) throw new Error(`The organization's profile didn't load (${profileRes.status}).`);
  const o = (await res.json()) as ApiOnboarding;
  const p = (await profileRes.json()) as ApiOrgProfile;
  const standing = profileStanding(p);
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";

  const state = STATE_COPY[o.state];
  const contacts = contactsFrom(o.contacts);
  const business = businessFormFrom(o.orgType, o.details);
  const missing = missingByStep(o.missing, o.orgType);
  const steps = stepsFor(o.orgType);
  const wait = o.state === "PENDING_REVIEW" ? waitLabel(o.submittedAt, new Date().getTime()) : null;

  return (
    <div className="space-y-6">
      <Link href={o.state === "PENDING_REVIEW" ? PATH : `${PATH}?state=${o.state}`} className="text-xs text-muted hover:text-text">
        ← Property verification
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{o.orgName}</h1>
          <p className="mt-1 text-xs text-muted">
            {ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}
            {o.stateCode ? ` · ${o.stateCode}` : ""} · started {dateLabel(o.createdAt)}
            {o.submittedAt ? ` · submitted ${dateLabel(o.submittedAt)}` : ""}
            {wait ? ` · waiting ${wait}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          <Badge tone={standing.tone}>
            <span aria-hidden="true" className="mr-1">{standing.mark}</span>
            {standing.label}
          </Badge>
        </div>
      </div>

      {(p.reasons.length > 0 || p.nameTakenBy) && (
        <section aria-label="Why it needs review" className={`${section} border-warn/40`}>
          <h2 className="text-sm font-semibold">{p.onboardingState === "PENDING_REVIEW" ? "Why it is waiting" : "Flagged for you"}</h2>
          <ul className="mt-2">
            {p.reasons.map((r) => (
              <li key={r} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-warn/15 text-[10px] font-bold text-warn">!</span>
                <span className="min-w-0 flex-1">{r}</span>
              </li>
            ))}
            {p.nameTakenBy && (
              <li className="border-t border-line-soft py-2.5 text-[13px] text-muted">The name is already held by &ldquo;{p.nameTakenBy}&rdquo;.</li>
            )}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section aria-label="Checklist" className={section}>
            <h2 className="text-sm font-semibold">{checklistHeading(p)}</h2>
            <ul className="mt-2">
              {p.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                  <span
                    aria-hidden="true"
                    className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${c.ok ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn"}`}
                  >
                    {c.ok ? "✓" : "!"}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{c.label}</span>
                  <Badge tone={c.ok ? "accent" : "warn"}>{c.ok ? "Passed" : "Not yet"}</Badge>
                </li>
              ))}
            </ul>
          </section>

          {o.missing.length > 0 && (
            <Card className="border-warn/30">
              <SectionHeading title="Still missing" hint="What the API says this application lacks before it can be submitted." />
              <ul className="space-y-1 text-sm">
                {steps
                  .filter((s) => missing[s.key]?.length)
                  .map((s) => (
                    <li key={s.key}>
                      <span className="font-medium">{s.label}:</span> <span className="text-muted">{missing[s.key]!.join(", ")}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card>
            <SectionHeading title="Organisation" />
            <dl className="divide-y divide-line-soft">
              <Row label="Name">{o.orgName}</Row>
              <Row label="Type">{ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}</Row>
              <Row label="State">{o.stateCode ?? <span className="text-faint">Not given</span>}</Row>
            </dl>
          </Card>

          <Card>
            <SectionHeading title="Contacts" hint="The primary contact becomes the property manager's login on first approval." />
            {contacts.length === 0 ? (
              <p className="text-xs text-faint">No contacts saved.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {contacts.map((c, i) => (
                  <li key={`${c.email}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {c.name} <span className="font-normal text-muted">· {c.role}</span>
                      </p>
                      <p className="break-all text-[11px] text-muted">
                        {c.email}
                        {c.phone ? ` · ${c.phone}` : ""}
                      </p>
                    </div>
                    {c.primary && <Badge tone="primary">Primary</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeading title={steps[2]!.label} />
            <dl className="divide-y divide-line-soft">
              {BUSINESS_FIELDS[o.orgType].map((f) => (
                <Row key={f.key} label={f.label}>
                  {business[f.key] ? (
                    f.kind === "url" ? (
                      <a href={business[f.key]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {business[f.key]}
                      </a>
                    ) : (
                      business[f.key]
                    )
                  ) : (
                    <span className="text-faint">Not given</span>
                  )}
                </Row>
              ))}
            </dl>
          </Card>

          <Card>
            <SectionHeading
              title="Documents"
              hint="View opens the file for five minutes and is recorded in the audit log against you. Earlier files stay listed after a replacement or removal."
            />
            {p.requirements.length > 0 && (
              <ul aria-label="Required documents" className="mb-3 flex flex-wrap gap-1.5">
                {p.requirements.map((r) => (
                  <li key={r.key}>
                    <Badge tone={r.done ? "accent" : "warn"}>
                      <span aria-hidden="true" className="mr-1">{r.done ? "✓" : "!"}</span>
                      {r.label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {p.documents.length === 0 ? (
              <p className="text-xs text-faint">No documents have arrived yet.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {p.documents.map((d) => (
                  <li key={d.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${d.current ? "" : "opacity-70"}`}>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {d.filename}
                        {!d.current && <span className="ml-1.5 text-[11px] font-normal text-faint">earlier file</span>}
                      </p>
                      <p className="text-[11px] text-muted">
                        {profileDocumentLine(d)} · {fileSize(d.bytes)}
                      </p>
                    </div>
                    <OrgDocumentOpen onboardingId={o.id} documentId={d.id} filename={d.filename} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section aria-label="Activity" className={section}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Activity</h2>
              <Link href={`/admin/audit?entity=PropertyOnboarding&entityId=${encodeURIComponent(o.id)}`} className="text-[11px] text-primary hover:underline">
                Full history →
              </Link>
            </div>
            <ol className="mt-2 text-xs">
              {p.activity.map((a, i) => (
                <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
                  <span className="shrink-0 text-muted sm:w-32">{momentOf(a.at)}</span>
                  <span className="min-w-0 break-words">
                    {a.text}
                    {a.byBtg && <span className="text-faint"> · BTG</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <Card>
            <SectionHeading title="Payout and terms" />
            <dl className="divide-y divide-line-soft">
              <Row label="Payout acknowledgement">
                {o.payoutAcknowledgedAt ? `Accepted ${dateLabel(o.payoutAcknowledgedAt)}` : <span className="text-faint">Not yet</span>}
                <span className="mt-0.5 block text-[11px] text-faint">Bank and tax details go to the payment provider, never to SponsorX.</span>
              </Row>
              <Row label="Property terms">
                {o.termsAcceptedAt ? `Accepted ${dateLabel(o.termsAcceptedAt)}` : <span className="text-faint">Not accepted</span>}
                {o.termsAgreementId && <span className="mt-0.5 block text-[11px] text-faint">Agreement {o.termsAgreementId}</span>}
              </Row>
              <Row label="Listing access">{o.listingAccess ? "Granted" : "None"}</Row>
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeading title="Decision" hint="Recorded against your account, with the note, in the audit log." />
            <OnboardingDecisionPanel key={o.state} id={o.id} state={o.state} hadProperty={Boolean(o.propertyId)} />
          </Card>
          <section aria-label="Details" className={section}>
            <h2 className="text-sm font-semibold">At a glance</h2>
            <dl className="mt-2 grid grid-cols-[7.5rem_1fr] text-[13px]">
              {p.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="border-t border-line-soft py-2 pr-3 text-muted">{d.label}</dt>
                  <dd className="min-w-0 break-words border-t border-line-soft py-2">{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {p.logins.length > 0 && (
            <section aria-label="Logins" className={section}>
              <h2 className="text-sm font-semibold">Logins</h2>
              <ul className="mt-2 text-xs">
                {p.logins.map((l) => (
                  <li key={l.email} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2">
                    <span className="min-w-0 break-all">{l.email}</span>
                    <Badge tone={l.switchedOff ? "danger" : "accent"}>{l.switchedOff ? "Switched off" : l.signedIn ? "Signed in" : "Not signed in yet"}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(o.reviewNotes || o.decidedAt) && (
            <Card>
              <SectionHeading
                title="Last decision"
                action={
                  <Link href={`/admin/audit?entity=PropertyOnboarding&entityId=${encodeURIComponent(o.id)}`} className="text-[11px] text-primary hover:underline">
                    Full history →
                  </Link>
                }
              />
              <p className="text-xs text-muted">{dateLabel(o.decidedAt)}</p>
              {o.reviewNotes && <p className="mt-2 whitespace-pre-wrap text-sm">&ldquo;{o.reviewNotes}&rdquo;</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
