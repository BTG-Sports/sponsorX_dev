import Link from "next/link";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { WhatsWrongPanel } from "@/components/problem-tags";
import { RecordTabs, type RecordTab } from "@/components/record-kit";
import { CheckRows, FactRows, FactTiles, ReasonRows, RecordHeader, RecordSection, notGiven } from "@/components/record-stage";
import { SponsorCategoriesEditor } from "@/components/sponsor-categories-editor";
import { SponsorDecision, SponsorDocumentOpen } from "@/components/sponsor-request-review";
import { EmptyState } from "@/components/states";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import {
  accountTracker, askedAgo, decisionChecks, documentLine, requestFacts, requestPill, requestStanding, roleWords, stampOf,
  type ApiSponsorRequestDetail,
} from "@/lib/sponsor-requests-live";
import { DOCUMENTS_ANCHOR, docAnchor } from "@/lib/support-inbox-live";
import { apiFetch } from "@/server/api";
import { sendBackSponsorDocumentAction, setSponsorCategoriesAction, viewSponsorDocumentAction } from "@/app/(app)/admin/sponsor-requests/actions";

/* --------------------------------------------------------------------------
   One sponsor's record, opened inside New accounts at
   /admin/new-signups/sponsors/:id (BTG admins and Sales). The Sponsor
   requests desk is gone (2026-11-21, the owner: "too many moving
   navigations why not just one navigation", then "just remove the
   onboarding page and the sponsor requests"); /admin/sponsor-requests and
   /admin/sponsor-requests/:id now forward here, so every email already sent
   still lands on the record.

   The record — 2S1-FE-03 (Claude Design SponsorRequests.dc.html,
   SR-2 … SR-8): the business and its contact, what they told us, the
   business type BTG picks, the checks, the proof of business, and the
   decision. Once decided, the account's progress (SR-4) or the note that
   was sent (SR-6) — each step as the API records it, never assumed.

   Redrawn on the record-page shape (POL-FE-108's). The owner: "too many
   information at once, and super cluttered, make it more understandable to
   humans". It was six cards down the page (what's wrong, the business, the
   answers, how it reached BTG, the proof, the business-type chips) beside a
   side card holding the checks, the same-name choice, Approve and Decline —
   everything open at once. Now, top to bottom:
     1. the business's name with ONE status pill, one line of context and
        ONE button. Everything about deciding (the business type, a
        same-named sponsor, what approving does, the note) is in the popup
        it opens (sponsor-request-review.tsx → record-decide.tsx);
     2. four tiles: checks, proof of business, contact, and the step it is at;
     3. tabs, one topic at a time: Overview (why it waits and the checks, or
        how it was decided) · Business (who they are and what they told us,
        the business type) · Proof of business.
   Nothing was removed but the repeats; reads, writes and the "#documents"
   and per-document anchors are unchanged.

   Reads  GET /sponsor-requests/:id
          GET /sponsor-requests/:id/documents/:documentId   on click (./actions.ts)
   Writes POST /sponsor-requests/:id/decision   APPROVE | DECLINE | REJECT | REINSTATE (./actions.ts)
   -------------------------------------------------------------------------- */

const PATH = "/admin/new-signups";
const ACCESS = "/admin/new-signups/sponsors";
const TITLE = "New accounts";

export async function SponsorRequestRecord({ id }: { id: string }) {
  const lacking = await staffWithoutAccess(ACCESS);
  if (lacking) return <NotInRole path={ACCESS} title={TITLE} roles={lacking} />;
  const res = await apiFetch(`/sponsor-requests/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="sx-rec space-y-5">
        <Link href={PATH} className="sx-rec-back">
          <Glyph ui="back" className="size-3.5" />
          {TITLE}
        </Link>
        <EmptyState mark="inbox" title="No sponsor request matches this link" hint="The address may be incomplete." action={{ label: `Back to ${TITLE.toLowerCase()}`, href: PATH }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Sponsor request unavailable (${res.status}).`);
  const r = (await res.json()) as ApiSponsorRequestDetail;

  const waiting = r.state === "NEW";
  /* Back to the stream: its Needs review view while this one waits, as an athlete's does */
  const back = { href: waiting ? `${PATH}?review=1` : PATH, label: TITLE };
  const first = r.contactName.split(/\s+/)[0] ?? r.contactName;
  /* POL-FE-42 — a waiting request's problems, as tags; they replace the plain list of reasons. */
  const problems = waiting ? r.problems ?? [] : [];
  const checks = decisionChecks(r);
  const docs = r.documents.filter((d) => !d.returned);
  const who = r.progress?.decidedBy ? `${r.progress.decidedBy.email} (${roleWords(r.progress.decidedBy.roles)})` : r.autoApproved ? "the system" : "BTG";
  const types = (r.progress?.categories ?? []) as BrandCategory[];

  /* ------------------------------------------------------------- overview */
  const overview = waiting ? (
    <>
      {problems.length > 0 ? (
        <WhatsWrongPanel problems={problems} documents={r.documents.map((d) => ({ id: d.id, name: "Proof of business" }))} />
      ) : r.reviewReasons.length > 0 && (
        <RecordSection title="Why it is waiting" hint="The system couldn’t approve it by itself." icon="alert" tone="amber">
          <ReasonRows items={r.reviewReasons} />
        </RecordSection>
      )}
      <RecordSection title="Checks" hint="What approving needs. A sponsor with the same name is answered in the decision." icon="shield">
        <CheckRows items={checks} />
      </RecordSection>
    </>
  ) : r.state === "APPROVED" ? (
    <>
      <RecordSection
        title={r.autoApproved ? "Approved automatically" : "Approved"}
        hint={r.autoApproved ? `Every check passed, so no one at BTG had to review it · ${stampOf(r.decidedAt)}` : `By ${who} · ${stampOf(r.decidedAt)}`}
        icon="check"
        tone="green"
      >
        <StepRows steps={accountTracker(r) ?? []} />
        <p className="sx-rec-empty mt-3">{first} signs in with {r.email} and lands in the sponsor portal.</p>
      </RecordSection>
    </>
  ) : (
    <RecordSection
      title={r.state === "REJECTED" ? "Rejected: their logins are off" : "Declined"}
      hint={`By ${who} · ${stampOf(r.decidedAt)}`}
      icon={r.state === "REJECTED" ? "ban" : "close"}
    >
      <p className="sx-rec-quote-k">{r.state === "REJECTED" ? `Reason emailed to ${first}` : `Note sent to ${first}`}</p>
      {r.decisionNote ? <blockquote className="sx-rec-quote">{r.decisionNote}</blockquote> : <p className="sx-rec-empty">No note was written.</p>}
      <p className="sx-rec-empty mt-3">
        {r.state === "REJECTED"
          ? `${first} can’t sign in until you reinstate them.`
          : r.progress?.emailSentAt
            ? `The email went to ${r.email}.`
            : `The email to ${r.email} is queued. It goes once our email service is connected.`}
      </p>
    </RecordSection>
  );

  /* ------------------------------------------------------------- business */
  const business = (
    <>
      <RecordSection title="Who they are" hint={`Asked ${stampOf(r.createdAt)} through “Become a sponsor”`} icon="users">
        <FactRows
          rows={[
            { label: "Business", value: r.businessName },
            { label: "Contact", value: r.contactName },
            { label: "Email", value: r.email },
            { label: "Phone", value: r.phone ?? notGiven },
          ]}
        />
      </RecordSection>

      <RecordSection title="What they told us" icon="megaphone">
        {r.answers.length ? (
          <FactRows rows={r.answers.map((a) => ({ label: a.label, value: a.value }))} />
        ) : (
          <p className="sx-rec-empty">They didn&rsquo;t add anything beyond their contact details.</p>
        )}
      </RecordSection>

      <RecordSection
        title="Business type"
        hint={waiting ? "You pick it when you approve. The clash check uses it to keep their briefs away from athletes who said no to this type." : "The clash check uses this from the next brief on."}
        icon="tag"
      >
        {waiting ? (
          <p className="sx-rec-empty">
            {r.suggestedCategories.length
              ? <>Suggested: {r.suggestedCategories.map(categoryLabel).join(", ")}{r.categoryText ? <>, from &ldquo;{r.categoryText}&rdquo;</> : null}.</>
              : "No suggestion. You choose it in the decision."}
          </p>
        ) : (
          <div className="space-y-3">
            {types.length ? (
              <ul className="sx-rec-reqs" aria-label="Business type">
                {types.map((c) => <li key={c} className="sx-rec-chip" data-tone="blue">{categoryLabel(c)}</li>)}
              </ul>
            ) : (
              <p className="sx-rec-empty">None recorded.</p>
            )}
            {/* POL-FE-72 — the business type can be corrected after the account is open. */}
            {r.state === "APPROVED" && r.sponsorId && (
              <SponsorCategoriesEditor sponsorId={r.sponsorId} initial={types} save={setSponsorCategoriesAction} />
            )}
          </div>
        )}
      </RecordSection>
    </>
  );

  /* ------------------------------------------------------------ documents */
  const documents = (
    <RecordSection
      id={DOCUMENTS_ANCHOR}
      title="Proof of business"
      hint="View opens the file for five minutes and is recorded against you."
      icon="stack"
    >
      {r.documents.length === 0 ? (
        <p className="sx-rec-empty">Nothing uploaded yet. Every sponsor needs a proof of business before the account opens.</p>
      ) : (
        <ul className="sx-rec-rows">
          {r.documents.map((d) => (
            <li key={d.id} id={docAnchor(d.id)} className="sx-rec-row sx-rec-doc" data-old={d.returned ? "" : undefined}>
              <span className="min-w-0 flex-1">
                <span className="sx-rec-person-name">{d.filename}{d.returned && <span> · sent back</span>}</span>
                <span className="sx-rec-person-sub">{documentLine(d)}</span>
              </span>
              {/* P8-FE-11 — what reading it found, Send back, and no View once its file is gone. */}
              <SponsorDocumentOpen
                filename={d.filename} uploaded={Boolean(d.uploadedAt)} check={d.check ?? null} returned={d.returned ?? null} who={r.businessName}
                view={viewSponsorDocumentAction.bind(null, r.id, d.id)} sendBack={sendBackSponsorDocumentAction.bind(null, r.id, d.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );

  /* A tab with something to look at carries a dot. */
  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview", panel: overview, dot: waiting && (problems.length > 0 || r.reviewReasons.length > 0 || checks.some((c) => !c.ok)) },
    { key: "business", label: "Business", panel: business },
    { key: "documents", label: "Proof of business", panel: documents, count: docs.length || undefined, dot: waiting && (docs.length === 0 || docs.some((d) => d.check?.state === "FLAGGED")) },
  ];

  return (
    <div className="sx-rec">
      <RecordHeader
        back={back}
        icon="megaphone"
        kind="SPONSOR"
        title={r.businessName}
        meta={[r.contactName, waiting ? `asked ${askedAgo(r.createdAt)}` : `asked ${stampOf(r.createdAt)}`]}
        pill={requestPill(r)}
        /* the one button; the choices and what each does are in its popup */
        action={<SponsorDecision key={r.state} request={r} lede={requestStanding(r)} />}
      />

      <div className="sx-rec-main">
        <FactTiles facts={requestFacts(r)} />
        <RecordTabs tabs={tabs} label={`About ${r.businessName}`} />
      </div>
    </div>
  );
}

/** The account's progress, each step as the API records it. */
function StepRows({ steps }: { steps: { label: string; state: "done" | "current" | "todo"; note: string }[] }) {
  return (
    <ul className="sx-rec-rows">
      {steps.map((s) => (
        <li key={s.label} className="sx-rec-row" data-ok={s.state === "done" ? "" : undefined} data-wait={s.state === "done" ? undefined : ""}>
          <span className="sx-rec-tick" aria-hidden="true">
            <Glyph ui={s.state === "done" ? "check" : "hourglass"} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="sx-rec-person-name">{s.label}</span>
            <span className="sx-rec-person-sub">{s.note}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
