"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { decideSponsorRequestAction } from "@/app/(app)/admin/sponsor-requests/actions";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { DocumentCheck, SendBackButton } from "@/components/document-check";
import { Decide, type DecideChoice } from "@/components/record-decide";
import type { BrandCategory } from "@/lib/brand-categories";
import type { ApiDocumentCheck, ApiDocumentReturned } from "@/lib/document-checks-live";
import {
  approveBlock, categoryOptions, rejectSteps, reinstateSteps, whatHappens,
  type ApiSponsorRequestDetail, type LinkChoice, type RequestWriteFailure,
} from "@/lib/sponsor-requests-live";

/* --------------------------------------------------------------------------
   The request's decision — 2S1-FE-03 (design SponsorRequests.dc.html, SR-2,
   SR-3, SR-5, SR-7, SR-8) and 2S1-BE-17 (Reject / Reinstate after approval).

   Redrawn on the record-page shape (POL-FE-108's, which the owner accepted
   for organizations and sign-ups). The owner on the old page: "too many
   information at once, and super cluttered". It had the business type
   chips, a checks list, the same-name choice, Approve and Decline all open
   in a side card on arrival. Now there is ONE button beside the business's
   name, and everything about deciding is in the popup it opens
   (record-decide.tsx):

     waiting   Approve — pick the business type (suggested ones first),
                         answer a same-named sponsor, and read what happens;
                         the final button stays off, saying why, until
                         approveBlock() lets it go. Locked when the email is
                         already a login.
               Decline — a note, required, emailed as written.
     approved  Reject   — what it does, then a reason, required, emailed.
     rejected  Reinstate — what it does.
     declined  no button: nothing to decide.

   The decisions, the server action and the refusals are unchanged.

   SponsorDocumentOpen — one proof of business, through a five-minute,
   audited link asked for only on click.
   -------------------------------------------------------------------------- */

/** The page's one button and the popup behind it. */
export function SponsorDecision({ request, lede }: { request: ApiSponsorRequestDetail; /** Where it stands, in a sentence. */ lede: string }) {
  const r = request;
  const first = r.contactName.split(/\s+/)[0] ?? r.contactName;
  const [picked, setPicked] = useState<BrandCategory[]>(r.suggestedCategories.slice(0, 1));
  const [link, setLink] = useState<LinkChoice>(null);

  const choices: DecideChoice[] = [];
  if (r.state === "NEW") {
    choices.push({
      key: "approve", label: "Approve", icon: "check", kind: "go", action: "Approve and open account",
      text: `Opens ${r.businessName}’s account and emails a sign-in link to ${r.email}.`,
      locked: r.checks.emailInUse ? `${r.email} already has a SponsorX login. Ask them for a different contact.` : undefined,
      blocked: approveBlock(r, picked, link),
      extra: <ApproveChoices request={r} picked={picked} setPicked={setPicked} link={link} setLink={setLink} />,
    });
    choices.push({
      key: "decline", label: "Decline", icon: "ban", kind: "stop", action: "Send and decline",
      text: "Nothing is opened. They’re emailed your note.",
      note: { need: "required", label: `Note to ${first}`, hint: "They read this in an email, exactly as written.", placeholder: "Write the reason in plain words" },
    });
  } else if (r.state === "APPROVED") {
    choices.push({
      key: "reject", label: "Reject the account", icon: "ban", kind: "stop", action: "Send and reject",
      text: "Every login is switched off and your reason is emailed. You can reinstate them within 30 days.",
      extra: <Steps title="What happens when you reject" steps={rejectSteps(r)} />,
      note: { need: "required", label: "Reason", hint: `We email this to ${first} exactly as written.`, placeholder: "Write the reason in plain words" },
    });
  } else if (r.state === "REJECTED") {
    choices.push({
      key: "reinstate", label: "Reinstate", icon: "undo", kind: "go",
      text: "Their logins are switched back on and they’re told the account is back.",
      extra: <Steps title="What happens when you reinstate" steps={reinstateSteps(r)} />,
    });
  }

  return (
    <Decide
      title={`Decide on ${r.businessName}`}
      lede={lede}
      choices={choices}
      /* an open account: nothing is waiting, so the button is outlined */
      quiet={r.state === "APPROVED"}
      buttonLabel={r.state === "APPROVED" ? "Reject the account" : undefined}
      submit={(key, note) => {
        if (key === "approve") {
          return decideSponsorRequestAction(r.id, {
            decision: "APPROVE", categories: picked,
            ...(link?.kind === "link" ? { linkSponsorId: link.sponsorId } : {}),
            ...(link?.kind === "new" ? { newSponsor: true } : {}),
          });
        }
        if (key === "decline") return decideSponsorRequestAction(r.id, { decision: "DECLINE", note: note.trim() });
        if (key === "reject") return decideSponsorRequestAction(r.id, { decision: "REJECT", note: note.trim() });
        return decideSponsorRequestAction(r.id, { decision: "REINSTATE" });
      }}
    />
  );
}

/** Approve's own choices: the business type, a same-named sponsor, and what approving does. */
function ApproveChoices({ request: r, picked, setPicked, link, setLink }: {
  request: ApiSponsorRequestDetail;
  picked: BrandCategory[];
  setPicked: (next: (p: BrandCategory[]) => BrandCategory[]) => void;
  link: LinkChoice;
  setLink: (l: LinkChoice) => void;
}) {
  /* no suggestion: there is nothing to lead with, so every type shows */
  const [all, setAll] = useState(r.suggestedCategories.length === 0);
  const options = categoryOptions(r.suggestedCategories);
  /* the suggested and the picked ones first; the rest behind "Show all" so the popup isn't a wall of chips */
  const shown = all ? options : options.filter((c) => c.suggested || picked.includes(c.value));
  const hidden = options.length - shown.length;
  const suggestion = r.suggestedCategories[0];
  const toggle = (c: BrandCategory) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  return (
    <>
      <fieldset className="sx-rec-field">
        <legend className="sx-rec-label">
          <span>1. Business type <em data-need="">pick at least one</em></span>
        </legend>
        <p className="sx-rec-why">
          {suggestion && r.categoryText ? <>Suggested from what they wrote: &ldquo;{r.categoryText}&rdquo;. </> : null}
          The clash check uses this: an athlete who won&rsquo;t work with this type never sees their briefs.
        </p>
        <div className="sx-rec-picks">
          {shown.map((c) => {
            const on = picked.includes(c.value);
            return (
              <label key={c.value} className="sx-rec-pick" data-on={on ? "" : undefined}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(c.value)} />
                <Glyph ui={on ? "check" : "plus"} className="size-3" />
                {c.label}
                {c.suggested && <span className="sx-rec-pick-tag">suggested</span>}
              </label>
            );
          })}
          {(hidden > 0 || (all && r.suggestedCategories.length > 0)) && (
            <button type="button" className="sx-rec-pick sx-rec-pick-more" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${options.length} types`}
            </button>
          )}
        </div>
      </fieldset>

      {r.checks.matches.length > 0 && (
        <fieldset className="sx-rec-field">
          <legend className="sx-rec-label">
            <span>2. A sponsor named &ldquo;{r.checks.matches[0]!.name}&rdquo; already exists <em data-need="">choose one</em></span>
          </legend>
          <div className="sx-rec-opts">
            {r.checks.matches.map((m) => (
              <label key={m.id} className="sx-rec-opt" data-off={m.hasLogin ? "" : undefined}>
                <input type="radio" name="sx-link" disabled={m.hasLogin} checked={link?.kind === "link" && link.sponsorId === m.id} onChange={() => setLink({ kind: "link", sponsorId: m.id })} />
                <span>
                  <strong>Link to it</strong>
                  <span>
                    Use the existing &ldquo;{m.name}&rdquo;{m.fromZoho ? ", already in Zoho" : ""}. No second sponsor is created.
                    {m.hasLogin ? " It already has people signing in, so it can’t be linked here." : ""}
                  </span>
                </span>
              </label>
            ))}
            <label className="sx-rec-opt">
              <input type="radio" name="sx-link" checked={link?.kind === "new"} onChange={() => setLink({ kind: "new" })} />
              <span>
                <strong>Create a new one</strong>
                <span>It&rsquo;s a different business with the same name.</span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      {picked.length > 0 && <Steps title="What happens when you approve" steps={whatHappens(r, picked, link)} />}
    </>
  );
}

/** What a choice does, in the order it happens. */
function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="sx-rec-steps">
      <p className="sx-rec-steps-k">{title}</p>
      <ol>
        {steps.map((s, i) => (
          <li key={i}>
            <span aria-hidden="true">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------- proof of business */

type ViewDocument = () => Promise<{ ok: true; url: string; expiresInSeconds: number } | RequestWriteFailure>;
type SendBackDocument = (reason: string) => Promise<{ ok: true } | RequestWriteFailure>;

/**
 * One proof of business: a five-minute, audited link, asked for on click.
 * P8-FE-11 — and what reading it found, Send back with a reason (POST
 * …/documents/:id/send-back), and no View once BTG sent it back (its file
 * is gone).
 */
export function SponsorDocumentOpen({ filename, uploaded, view, check = null, returned = null, who, sendBack }: {
  filename: string; uploaded: boolean; view: ViewDocument;
  check?: ApiDocumentCheck; returned?: ApiDocumentReturned; who?: string; sendBack?: SendBackDocument;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!uploaded) return <span className="text-[11px] text-warn">Upload not finished</span>;
  const ask = () =>
    start(async () => {
      setError(null);
      const r = await view();
      if (!r.ok) return setError(r.message);
      setUrl(r.url);
    });
  return (
    <span className="flex min-w-0 flex-col gap-1.5 sm:items-end">
      <span className="flex flex-wrap items-center gap-2">
        {returned ? (
          <span className="text-[11px] text-muted">File deleted</span>
        ) : url ? (
          <>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">Open {filename} →</a>
            <span className="text-[11px] text-faint">the link lasts 5 minutes ·</span>
            <button type="button" onClick={ask} disabled={pending} className="text-[11px] text-muted underline disabled:opacity-40">new link</button>
          </>
        ) : (
          <button type="button" disabled={pending} aria-label={`View ${filename}`} onClick={ask}
            className="min-h-8 rounded-lg border border-line px-3 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40">
            {pending ? "Opening…" : "View"}
          </button>
        )}
        {!returned && sendBack && (
          <SendBackButton name={filename} who={who ?? "The sponsor"} send={sendBack} onDone={() => router.refresh()} />
        )}
      </span>
      <DocumentCheck check={check} returned={returned} className="sm:text-right" />
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
