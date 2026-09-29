import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OnboardingDecisionPanel } from "@/components/onboarding-decision";
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
  documentKindLabel,
  fileSize,
  missingByStep,
  stepsFor,
  type ApiOnboarding,
  type ApiOnboardingDocument,
} from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One property application — 2S1-FE-02. Every answer the applicant saved,
   what the API still reports missing, the verification documents, and the
   decision panel.

   Reads GET /onboarding/:id and GET /onboarding/:id/documents (each file's
   downloadUrl is a fifteen-minute, audited link into the private bucket —
   opened in a new tab; reload for fresh ones). Writes POST
   /onboarding/:id/decision via the panel's server action. BTG_ADMIN and
   SUPER_ADMIN only. The API answers an unknown id with 403, so for a
   reviewer who does hold the role that reads as "no such application".

   Honest gaps: the API does not return who decided (decidedBy) or any
   history beyond the latest note — the audit log has it
   (GET /audit-log?entity=PropertyOnboarding&entityId=…).
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
  const [res, docsRes] = await Promise.all([
    apiFetch(`/onboarding/${encodeURIComponent(id)}`),
    apiFetch(`/onboarding/${encodeURIComponent(id)}/documents`),
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
  if (!docsRes.ok && docsRes.status !== 403) throw new Error(`The application's documents didn't load (${docsRes.status}).`);
  const o = (await res.json()) as ApiOnboarding;
  const documents: ApiOnboardingDocument[] = docsRes.ok ? ((await docsRes.json()) as { documents: ApiOnboardingDocument[] }).documents : [];

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
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
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
            <SectionHeading title="Documents" hint="Each link opens the file for fifteen minutes and is recorded in the audit log. Reload the page for fresh links." />
            {documents.length === 0 ? (
              <p className="text-xs text-faint">No documents uploaded. They are optional on the application.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      {d.downloadUrl ? (
                        <a href={d.downloadUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-primary hover:underline">
                          {d.filename}
                        </a>
                      ) : (
                        <p className="truncate text-sm font-medium">{d.filename}</p>
                      )}
                      <p className="text-[11px] text-muted">
                        {documentKindLabel(d.kind)} · {fileSize(d.bytes)}
                      </p>
                    </div>
                    {d.uploadedAt ? (
                      <span className="text-[11px] text-muted">Uploaded {dateLabel(d.uploadedAt)}</span>
                    ) : (
                      <span className="text-[11px] text-warn">Never arrived — no file to open</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

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
            <OnboardingDecisionPanel key={o.state} id={o.id} state={o.state} />
          </Card>
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
