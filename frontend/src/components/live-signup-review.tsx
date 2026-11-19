"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { confirmComingOfAgeAction, signupDecisionAction, signupDocumentAction, signupSendBackAction } from "@/app/(app)/admin/new-signups/actions";
import { DocumentCheck, SendBackButton } from "@/components/document-check";
import { Decide, type DecideChoice } from "@/components/record-decide";
import { RecordTabs, type RecordTab } from "@/components/record-kit";
import { RecordSection } from "@/components/record-stage";
import { cascadeWords, comingOfAgeHold, type ApiSignupDetail } from "@/lib/signups-live";
import { DOCUMENTS_ANCHOR, docAnchor } from "@/lib/support-inbox-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   One live sign-up's decision, documents and viewer — 2S1-FE-07 (design
   NewSignups.dc.html, views athlete / guardian / reject / viewer), for the
   athletes and guardians 2S1-BE-09 / -10 approve automatically.
   Organizations (2S1-BE-06) open their own profile, /admin/onboarding/:id.

   - Documents open in the viewer through a five-minute link the API signs
     and records (signupDocumentAction) — fetched when View is pressed, never
     before, and never stored.
   - Approve (a held athlete), Reject (a required reason, emailed exactly as
     written) and Reinstate go through signupDecisionAction; the page then
     re-reads itself. A guardian's Reject names the athletes it takes with it.
   - POL-FE-02 / POL-BE-02 — Confirm takeover (`can.confirmComingOfAge`): a
     coming-of-age ID that didn't read clear held the takeover for BTG;
     confirming moves control to the athlete (confirmComingOfAgeAction). To
     refuse it, BTG sends the ID back from Documents — the existing send-back.

   POL-FE-108 — two pieces now:
   - SignupDecision   the one button beside the name and the popup behind it
                      (record-decide.tsx). It replaces the "Actions" box —
                      Reject and Reinstate always drawn, one greyed out with
                      its reason in a tooltip — and the separate Reject and
                      Confirm takeover dialogs: each is a choice in the popup
                      now, with the same words and the same server functions.
                      Only what applies is offered.
   - LiveSignupReview the four tiles and the tabs (record-kit.tsx), with the
                      Documents tab and its viewer; the other panels are
                      server-rendered and passed in.
   -------------------------------------------------------------------------- */

type Owner = "athletes" | "guardians";
const ownerOf = (s: ApiSignupDetail): Owner => (s.kind === "ATHLETE" ? "athletes" : "guardians");
const firstOf = (s: ApiSignupDetail) => s.name.split(/\s+/)[0] ?? s.name;

/* ---------------------------------------------------------------- decision */

export function SignupDecision({ signup, lede }: { signup: ApiSignupDetail; /** Where it stands, in a sentence. */ lede: string }) {
  const owner = ownerOf(signup);
  const first = firstOf(signup);
  const cascade = cascadeWords(signup);
  const hold = comingOfAgeHold(signup);
  const held = signup.state === "NEEDS_REVIEW";
  const stillOwed = signup.missing.length > 0;

  const choices: DecideChoice[] = [];
  if (signup.can.confirmComingOfAge) {
    choices.push({
      key: "takeover", label: "Confirm takeover", icon: "check", kind: "go",
      text: `${first} takes control of the account: they accept their own agreements and manage their own money.`,
      warning: (
        <>
          <p><strong>The ID check held it:</strong> {hold ? hold.reasons.join(" · ") : "The ID didn’t read clear."}</p>
          <ul>
            <li>{signup.guardian ? `${signup.guardian.name} stops being ${first}’s guardian and is told.` : "Their guardian is removed and told."}</li>
            <li>Items and new deals un-pause. Orders already agreed carry on as they are.</li>
            <li>Not convinced? Close this and send the ID back from Documents. {first} is asked for a clearer one and the guardian stays in control.</li>
          </ul>
        </>
      ),
    });
  }
  if (held && (signup.can.approve || stillOwed)) {
    choices.push({
      key: "approve", label: `Approve ${first}`, icon: "check", kind: "go",
      text: "They get in straight away and are emailed.",
      locked: stillOwed ? `Locked until they finish: ${signup.missing.join("; ")}.` : !signup.can.approve ? "Your role can’t approve this one." : undefined,
    });
  }
  if (signup.can.reinstate) {
    choices.push({ key: "reinstate", label: `Reinstate ${first}`, icon: "undo", kind: "go", text: "Brings the account back: their sign-in is switched on again." });
  }
  if (signup.can.reject) {
    choices.push({
      key: "reject", label: `Reject ${first}`, icon: "ban", kind: "stop", action: "Reject and email reason",
      text: "Their sign-in is switched off, their listings end and their payouts are held. Money already earned stays owed.",
      warning: (
        <>
          {cascade && <p><strong>{cascade}</strong> Their listings stop and their payouts are held.</p>}
          <p>If they ask, BTG decides whether to reinstate them.</p>
        </>
      ),
      note: { need: "required", label: "Reason", hint: `We email this to ${first} exactly as written.` },
    });
  }

  return (
    <Decide
      title={`Decide on ${signup.name}`}
      lede={lede}
      choices={choices}
      /* approved and nothing held: the one thing on offer is stepping in, so the button stays quiet */
      quiet={!held && !signup.can.confirmComingOfAge && !signup.can.reinstate}
      submit={(key, note) => {
        if (key === "takeover") return confirmComingOfAgeAction(signup.id);
        return signupDecisionAction(owner, signup.id, key as "approve" | "reject" | "reinstate", key === "reject" ? note : undefined);
      }}
    />
  );
}

/* ---------------------------------------------------------- tiles and tabs */

export function LiveSignupReview({ signup, tiles, overview, details, extras, history, overviewDot }: {
  signup: ApiSignupDetail;
  tiles: ReactNode;
  overview: ReactNode;
  details: ReactNode;
  /** An athlete's content review, home page and rate card; absent for a guardian. */
  extras?: ReactNode;
  history: ReactNode;
  /** Something on Overview is BTG's to read (held, flagged). */
  overviewDot: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | { doc: string; name: string }>(null);
  const owner = ownerOf(signup);
  const first = firstOf(signup);

  const documents = (
    <RecordSection id={DOCUMENTS_ANCHOR} title="Documents" hint="Each view opens a link that expires in 5 minutes. Views are recorded." icon="stack">
      {signup.documents.length === 0 ? (
        <p className="sx-rec-empty">No documents uploaded.</p>
      ) : (
        <ul className="sx-rec-rows">
          {signup.documents.map((d) => (
            <li key={d.id} id={docAnchor(d.id)} className="sx-rec-row sx-rec-doc">
              <span className="min-w-0 flex-1">
                <span className="sx-rec-person-name">{d.name}</span>
                <span className="sx-rec-person-sub">{d.sub}</span>
                {/* P8-FE-11 — what reading it found; sent back, with the reason (its file is gone). */}
                <DocumentCheck check={d.check ?? null} returned={d.returned ?? null} className="mt-1" />
              </span>
              {d.viewable ? (
                <span className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpen({ doc: d.id, name: d.name })} aria-label={`View ${d.name}`}
                    className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">
                    View
                  </button>
                  <SendBackButton name={d.name} who={first}
                    send={(reason) => signupSendBackAction(owner, signup.id, d.id, reason)} onDone={() => router.refresh()} />
                </span>
              ) : (
                <span className="sx-rec-chip" data-tone="muted">{d.returned ? "File deleted" : "Recorded"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </RecordSection>
  );

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview", panel: overview, dot: overviewDot },
    { key: "details", label: "Details", panel: details },
    { key: "documents", label: "Documents", panel: documents, count: signup.documents.length },
    ...(extras ? [{ key: "content", label: "Content & rates", panel: extras }] : []),
    { key: "history", label: "History", panel: history },
  ];

  return (
    <div className="sx-rec-main">
      {tiles}
      <RecordTabs tabs={tabs} label={`About ${signup.name}`} />
      {open && <Viewer owner={owner} id={signup.id} doc={open.doc} name={open.name} who={signup.name} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Viewer({ owner, id, doc, name, who, onClose }: { owner: Owner; id: string; doc: string; name: string; who: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [link, setLink] = useState<{ url: string } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      const r = await signupDocumentAction(owner, id, doc);
      setLink(r.ok ? { url: r.url } : { error: r.message });
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vw-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/90" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:py-10">
        <div className="sx-pop relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <h2 id="vw-title" className="min-w-0 flex-1 text-sm font-semibold">{name} · {who}</h2>
            <button type="button" data-autofocus onClick={onClose} className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">Close</button>
          </div>
          <p role="status" className="border-b border-warn/30 bg-warn/8 px-4 py-2 text-xs font-semibold text-warn">
            <span aria-hidden="true">● </span>Link expires in 5 minutes · this view is recorded
          </p>
          {link && "url" in link ? (
            <iframe title={`${name} · ${who}`} src={link.url} className="m-4 h-72 rounded-xl border border-line bg-bg sm:h-[28rem]" />
          ) : (
            <div className="m-4 grid h-72 place-items-center rounded-xl border border-dashed border-line bg-bg px-4 text-center text-[13px] text-muted sm:h-[28rem]">
              <span className="space-y-3">
                <span className="block">Opening it signs a 5-minute link and records that you viewed it.</span>
                <button type="button" onClick={load} disabled={pending}
                  className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-50">
                  {pending ? "Opening…" : "Open the document"}
                </button>
                {link && "error" in link && <span role="alert" className="block text-xs text-danger">{link.error}</span>}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
