import Link from "next/link";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OnboardingDecisionPanel } from "@/components/onboarding-decision";
import { OrgDocumentOpen } from "@/components/org-document-open";
import { WhatsWrongPanel } from "@/components/problem-tags";
import { RecordTabs, type RecordTab } from "@/components/record-kit";
import { CheckRows, FactRows, FactTiles, ReasonRows, RecordHeader, RecordSection, Timeline, notGiven } from "@/components/record-stage";
import { EmptyState } from "@/components/states";
import { waitLabel } from "@/lib/marketplace-ops-live";
import {
  BUSINESS_FIELDS,
  ORG_TYPE_COPY,
  businessFormFrom,
  contactsFrom,
  dateLabel,
  fileSize,
  missingByStep,
  stepsFor,
  type ApiOnboarding,
} from "@/lib/onboarding-live";
import { checklistHeading, momentOf, profileDocumentLine, type ApiOrgProfile } from "@/lib/org-profile-live";
import { orgFacts, orgNextStep, orgPill } from "@/lib/record-ui";
import { DOCUMENTS_ANCHOR, docAnchor } from "@/lib/support-inbox-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One organization's record, opened inside New accounts at
   /admin/new-signups/organizations/:id. The Onboarding desk is gone
   (2026-11-21, the owner: "just remove the onboarding page and the sponsor
   requests since we already have a new sign-ups page"); /admin/onboarding
   and /admin/onboarding/:id now forward here, so every email already sent
   still lands on the record.

   One organization — 2S1-FE-02 (the application) and, since 2S1-FE-05, the
   organization profile page every BTG email links to (2S1-BE-06: "BTG
   admins are emailed a link to each new organisation's profile"). It is
   this page, not a new route: the email's link is
   ${APP_URL}/admin/onboarding/<id>, and the application, its documents and
   BTG's decisions already live here.

   What it holds: how the organization stands (approved automatically, held
   with its reasons, flagged after a document change, rejected); the
   checklist as it was when the system approved it (or the live one while
   it waits); every answer; every document with its history, each opened
   through a five-minute audited link only when BTG clicks View; its
   activity; its logins; and the decisions open now — Reject (a reason,
   emailed) and Reinstate included.

   POL-FE-108 (2026-11-17) — redrawn. The owner: "the pages are too
   confusing for a human … having many information at once can haywire a
   human's brain". It was nine panels down the page and four more beside
   them, two status badges, the same facts in three places ("Organisation",
   "At a glance", the business details) and "Passed" in the brand's orange.
   Now, top to bottom:
     1. the name with ONE status pill, one line of context and ONE button
        ("Make a decision" / "Suspend or reject" / "Reinstate"). The
        button opens the decision in a popup (record-decide.tsx): where it
        stands, the choices and what each does, the note. Nothing about
        deciding is on the page itself. A "Your next step" card beside the
        page was tried twice and the owner turned it down both times
        ("showing this immediately is ugly", then "you're still showing
        this?");
     2. four tiles: checks passed, required documents, primary contact,
        listing access;
     3. tabs, one topic at a time: Overview (what's wrong, what's missing,
        the checks) · Organization · People (contacts, logins) · Documents ·
        History. A tab with something to look at carries a dot.
   Nothing was removed but the repeats; reads, writes and links (the
   "#documents" and per-document anchors included) are unchanged.

   Reads  GET /onboarding/:id            the application and what is missing
          GET /onboarding/:id/profile    standing, checklist, documents + history, activity, logins
   Writes POST /onboarding/:id/decision  (the panel's server action)
          GET /onboarding/:id/documents/:documentId  (the viewer's server action — a 5-minute link, audited)
   BTG_ADMIN and SUPER_ADMIN only. The API answers an unknown id with 403,
   so for a reviewer who does hold the role that reads as "no such
   application". The full audit trail stays one click away.
   -------------------------------------------------------------------------- */

const PATH = "/admin/new-signups";
const ACCESS = "/admin/new-signups/organizations";
const TITLE = "New accounts";

export async function OrgRecord({ id }: { id: string }) {
  const lacking = await staffWithoutAccess(ACCESS);
  if (lacking) return <NotInRole path={ACCESS} title={TITLE} roles={lacking} />;

  const [res, profileRes] = await Promise.all([
    apiFetch(`/onboarding/${encodeURIComponent(id)}`),
    apiFetch(`/onboarding/${encodeURIComponent(id)}/profile`),
  ]);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="sx-rec space-y-5">
        <Link href={PATH} className="sx-rec-back">
          <Glyph ui="back" className="size-3.5" />
          {TITLE}
        </Link>
        <EmptyState mark="inbox" title="No application matches this link" hint="It may belong to another tenant, or the address is incomplete." action={{ label: "Back to new accounts", href: PATH }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`The application didn't load (${res.status}).`);
  if (!profileRes.ok) throw new Error(`The organization's profile didn't load (${profileRes.status}).`);
  const o = (await res.json()) as ApiOnboarding;
  const p = (await profileRes.json()) as ApiOrgProfile;

  const waiting = o.state === "PENDING_REVIEW";
  const problems = waiting ? o.problems ?? [] : [];
  const contacts = contactsFrom(o.contacts);
  const primary = contacts.find((c) => c.primary) ?? contacts[0] ?? null;
  const business = businessFormFrom(o.orgType, o.details);
  const missing = missingByStep(o.missing, o.orgType);
  const steps = stepsFor(o.orgType);
  const wait = waiting ? waitLabel(o.submittedAt, new Date().getTime()) : null;
  const typeWord = ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType;
  const audit = `/admin/audit?entity=PropertyOnboarding&entityId=${encodeURIComponent(o.id)}`;

  const currentDocs = p.documents.filter((d) => d.current);
  const hasReasons = p.reasons.length > 0 || Boolean(p.nameTakenBy);
  const checksFailing = p.checks.some((c) => !c.ok);
  const docsMissing = p.requirements.some((r) => !r.done);
  /* Waiting on BTG, or flagged since: only then is a gap something to act on. */
  const attention = waiting || (o.state === "APPROVED" && p.flagged);


  /* ------------------------------------------------------------- overview */
  const overview = (
    <>
      {/* POL-FE-42 — a waiting application's problems, as tags; a plain list for an approved one's flags. */}
      {problems.length > 0 ? (
        <WhatsWrongPanel problems={problems} documents={currentDocs.map((d) => ({ id: d.id, name: d.label }))}>
          {p.nameTakenBy && <>The name is already held by &ldquo;{p.nameTakenBy}&rdquo;.</>}
        </WhatsWrongPanel>
      ) : hasReasons && (
        <RecordSection title={waiting ? "Why it is waiting" : "Flagged for you"} icon="alert" tone="amber">
          <ReasonRows items={p.reasons}>
            {p.nameTakenBy && <li className="sx-rec-row sx-rec-row-quiet">The name is already held by &ldquo;{p.nameTakenBy}&rdquo;.</li>}
          </ReasonRows>
        </RecordSection>
      )}

      {o.missing.length > 0 && (
        <RecordSection title="Still missing from the application" hint="The applicant has to add these before it can be submitted." icon="hourglass" tone="amber">
          <FactRows
            rows={steps.filter((s) => missing[s.key]?.length).map((s) => ({ label: s.label, value: missing[s.key]!.join(", ") }))}
          />
        </RecordSection>
      )}

      <RecordSection title="Checks" hint={checklistHeading(p)} icon="shield">
        <CheckRows items={p.checks} />
      </RecordSection>
    </>
  );

  /* --------------------------------------------------------- organization */
  const organization = (
    <>
      <RecordSection title={steps[2]!.label} icon="school">
        <FactRows
          rows={[
            { label: "Type", value: typeWord },
            { label: "State", value: o.stateCode ?? notGiven },
            ...BUSINESS_FIELDS[o.orgType].map((f) => ({
              label: f.label,
              value: business[f.key] ? (
                f.kind === "url" ? (
                  <a href={business[f.key]} target="_blank" rel="noopener noreferrer" className="sx-rec-link">
                    {business[f.key]}
                  </a>
                ) : (
                  business[f.key]
                )
              ) : notGiven,
            })),
          ]}
        />
      </RecordSection>

      <RecordSection title="Payout and terms" icon="coin">
        <FactRows
          rows={[
            {
              label: "Payout acknowledgement",
              value: o.payoutAcknowledgedAt ? `Accepted ${dateLabel(o.payoutAcknowledgedAt)}` : <span className="sx-rec-none">Not yet</span>,
              note: "Bank and tax details go to the payment provider, never to SponsorX.",
            },
            {
              label: "Property terms",
              value: o.termsAcceptedAt ? `Accepted ${dateLabel(o.termsAcceptedAt)}` : <span className="sx-rec-none">Not accepted</span>,
              note: o.termsAgreementId ? `Agreement ${o.termsAgreementId}` : undefined,
            },
            { label: "Listing access", value: o.listingAccess ? "Granted" : "None" },
          ]}
        />
      </RecordSection>
    </>
  );

  /* --------------------------------------------------------------- people */
  const people = (
    <>
      <RecordSection title="Contacts" hint="The primary contact becomes the property manager’s login on first approval." icon="users">
        {contacts.length === 0 ? (
          <p className="sx-rec-empty">No contacts saved.</p>
        ) : (
          <ul className="sx-rec-rows">
            {contacts.map((c, i) => (
              <li key={`${c.email}-${i}`} className="sx-rec-row sx-rec-person">
                <span className="min-w-0 flex-1">
                  <span className="sx-rec-person-name">
                    {c.name} <span>· {c.role}</span>
                  </span>
                  <span className="sx-rec-person-sub">
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </span>
                </span>
                {c.primary && <span className="sx-rec-chip" data-tone="blue">Primary</span>}
              </li>
            ))}
          </ul>
        )}
      </RecordSection>

      {p.logins.length > 0 && (
        <RecordSection title="Logins" hint="Who can sign in for this organization." icon="lock">
          <ul className="sx-rec-rows">
            {p.logins.map((l) => (
              <li key={l.email} className="sx-rec-row sx-rec-person">
                <span className="min-w-0 flex-1 break-all">{l.email}</span>
                <span className="sx-rec-chip" data-tone={l.switchedOff ? "red" : l.signedIn ? "green" : "muted"}>
                  {l.switchedOff ? "Switched off" : l.signedIn ? "Signed in" : "Not signed in yet"}
                </span>
              </li>
            ))}
          </ul>
        </RecordSection>
      )}
    </>
  );

  /* ------------------------------------------------------------ documents */
  const documents = (
    <RecordSection
      id={DOCUMENTS_ANCHOR}
      title="Documents"
      hint="View opens the file for five minutes and is recorded in the audit log against you. Earlier files stay listed after a replacement or removal."
      icon="stack"
    >
      {p.requirements.length > 0 && (
        <ul aria-label="Required documents" className="sx-rec-reqs">
          {p.requirements.map((r) => (
            <li key={r.key} className="sx-rec-chip" data-tone={r.done ? "green" : "amber"}>
              <Glyph ui={r.done ? "check" : "alert"} className="size-3" />
              {r.label}
              <span className="sr-only">{r.done ? " (in)" : " (missing)"}</span>
            </li>
          ))}
        </ul>
      )}
      {p.documents.length === 0 ? (
        <p className="sx-rec-empty">No documents have arrived yet.</p>
      ) : (
        <ul className="sx-rec-rows">
          {p.documents.map((d) => (
            <li key={d.id} id={docAnchor(d.id)} className="sx-rec-row sx-rec-doc" data-old={d.current ? undefined : ""}>
              <span className="min-w-0 flex-1">
                <span className="sx-rec-person-name">
                  {d.filename}
                  {!d.current && <span> · {d.returned ? "sent back" : "earlier file"}</span>}
                </span>
                <span className="sx-rec-person-sub">
                  {profileDocumentLine(d)} · {fileSize(d.bytes)}
                </span>
              </span>
              {/* P8-FE-11 — what reading it found, Send back, and no View once its file is gone. */}
              <OrgDocumentOpen
                onboardingId={o.id} documentId={d.id} filename={d.filename}
                check={d.check ?? null} returned={d.returned ?? null} who={o.orgName} canSendBack={d.current}
              />
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );

  /* -------------------------------------------------------------- history */
  const history = (
    <>
      {(o.reviewNotes || o.decidedAt) && (
        <RecordSection title="Last decision" hint={dateLabel(o.decidedAt)} icon="edit">
          {o.reviewNotes ? <blockquote className="sx-rec-quote">&ldquo;{o.reviewNotes}&rdquo;</blockquote> : <p className="sx-rec-empty">No note was written.</p>}
        </RecordSection>
      )}
      <RecordSection
        title="Activity"
        icon="clock"
        action={
          <Link href={audit} className="sx-rec-link sx-rec-link-sm">
            Full history →
          </Link>
        }
      >
        <Timeline
          items={p.activity.map((a) => ({
            at: momentOf(a.at),
            text: (
              <>
                {a.text}
                {a.byBtg && <span className="sx-rec-none"> · BTG</span>}
              </>
            ),
          }))}
        />
      </RecordSection>
    </>
  );

  const next = orgNextStep(p);

  /* A tab with something to look at carries a dot; People and Documents say how many they hold. */
  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview", panel: overview, dot: problems.length > 0 || hasReasons || o.missing.length > 0 || (waiting && checksFailing) },
    { key: "organization", label: "Organization", panel: organization },
    { key: "people", label: "People", panel: people, count: contacts.length },
    { key: "documents", label: "Documents", panel: documents, count: currentDocs.length, dot: attention && docsMissing },
    { key: "history", label: "History", panel: history },
  ];

  return (
    <div className="sx-rec">
      <RecordHeader
        back={{ href: waiting ? `${PATH}?review=1` : PATH, label: TITLE }}
        icon="school"
        kind="ORGANIZATION"
        title={o.orgName}
        meta={[typeWord, o.stateCode, o.submittedAt ? `submitted ${dateLabel(o.submittedAt)}` : `started ${dateLabel(o.createdAt)}`, wait && `waiting ${wait}`]}
        pill={orgPill(p)}
        /* the one button; where it stands and the choices are in its popup */
        action={<OnboardingDecisionPanel key={o.state} id={o.id} name={o.orgName} state={o.state} lede={`${next.title}. ${next.text}`} hadProperty={Boolean(o.propertyId)} />}
      />

      <div className="sx-rec-main">
        <FactTiles facts={orgFacts(p, { listingAccess: o.listingAccess, contact: primary ? { name: primary.name, role: primary.role } : null, attention })} />
        <RecordTabs tabs={tabs} label={`About ${o.orgName}`} />
      </div>
    </div>
  );
}
