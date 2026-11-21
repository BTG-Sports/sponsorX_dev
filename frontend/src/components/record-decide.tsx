"use client";

/* --------------------------------------------------------------------------
   record-decide — how BTG decides on a record page (POL-FE-108): ONE button
   beside the name, and a centred popup behind it. Nothing about deciding is
   on the page until that button is pressed.

   The owner, 2026-11-17, on two earlier cuts: a decision form sitting open in
   a card ("showing this immediately is ugly"), then the same card holding a
   sentence and a button ("you're still showing this?"). So the card is gone.

   The button is named for what it opens: "Make a decision" when there is a
   choice to make, or the one action itself ("Reject Dana", "Reinstate Dana")
   when there is only one. A record with nothing to decide draws no button.

   The popup (the applications review's and "How it works"'s sibling):
     1. where the record stands, in a sentence;
     2. the choices side by side, each with its icon, its colour and what
        it does. One that can't be taken yet is greyed and says why;
     3. once one is picked: anything to know first (a guardian's rejection
        takes their athletes with it), then the note, saying if it's required;
     4. Cancel, and one button named for the action. While it can't be
        pressed, the line beside it says what is missing.
   Nothing is saved until that button is pressed. Escape, the scrim and
   Cancel close it; focus stays inside and returns to the page's button.
   Portaled to <body>, so nothing on the page can clip or trap it.

   Used by onboarding-decision.tsx (an organization) and
   live-signup-review.tsx (an athlete's or guardian's sign-up). Styles:
   `.sx-rec-*` in admin/record.css over `.sx-ap-modal` / `.sx-ap-sheet`.
   -------------------------------------------------------------------------- */

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { useDialogFocus } from "./use-dialog-focus";

export type DecideChoice = {
  key: string;
  /** The card's title, e.g. "Approve", "Reject Dana". */
  label: string;
  /** What it does, in a sentence or two. */
  text: string;
  icon: UiGlyph;
  /** go = green, ask = blue, stop = red. */
  kind: "go" | "ask" | "stop";
  /** Why it can't be taken right now; the card is greyed and says this. */
  locked?: string;
  /** Shown once it is picked, first: anything more to choose before it can go
   *  (a sponsor's business type). The caller owns that state. */
  extra?: ReactNode;
  /** Why the final button is off right now, though the choice is open (a
   *  business type isn't picked yet). Said in the footer. */
  blocked?: string | null;
  /** Shown once it is picked, above the note: what to know first. */
  warning?: ReactNode;
  /** A note box: required or optional. Absent = no note for this choice. */
  note?: { need: "required" | "optional"; label: string; hint?: string; placeholder?: string };
  /** The final button's words, when they differ from the label ("Reject and email reason"). */
  action?: string;
};

export type DecideResult = { ok: true } | { ok: false; message: string };

export function Decide({ title, lede, choices, submit, quiet = false, buttonLabel }: {
  /** The popup's title, e.g. "Decide on Westfield Hawks". */
  title: string;
  /** Where the record stands, in a sentence. */
  lede: string;
  choices: DecideChoice[];
  submit: (key: string, note: string) => Promise<DecideResult>;
  /** Nothing is waiting on BTG: the page's button is outlined, not filled. */
  quiet?: boolean;
  /** The page's button, when "Make a decision" doesn't say it ("Suspend or reject"). */
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (choices.length === 0) return null;
  const only = choices.length === 1 ? choices[0]! : null;
  const label = buttonLabel ?? (only ? only.label : "Make a decision");
  const kind = quiet || only?.kind === "stop" ? "quiet" : only ? only.kind : "ask";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="sx-rec-btn sx-rec-open" data-kind={kind}>
        {label}
        <Glyph ui="arrow" className="size-4" />
      </button>
      {open &&
        createPortal(
          <DecideDialog
            title={title}
            lede={lede}
            choices={choices}
            submit={submit}
            onClose={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />,
          document.body,
        )}
    </>
  );
}

function DecideDialog({ title, lede, choices, submit, onClose, onDone }: {
  title: string;
  lede: string;
  choices: DecideChoice[];
  submit: (key: string, note: string) => Promise<DecideResult>;
  onClose: () => void;
  onDone: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const titleId = useId();
  const open = choices.filter((c) => !c.locked);
  const [picked, setPicked] = useState<string | null>(open.length === 1 && choices.length === 1 ? open[0]!.key : null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const choice = choices.find((c) => c.key === picked) ?? null;
  const needNote = choice?.note?.need === "required";
  const blocked = choice?.blocked ?? null;
  const ready = choice !== null && !blocked && (!needNote || note.trim().length > 0);

  const go = () => {
    if (!choice || !ready) return;
    setMessage(null);
    start(async () => {
      const r = await submit(choice.key, note).catch(
        (): DecideResult => ({ ok: false, message: "Couldn’t reach SponsorX just now. Nothing changed. Try again in a minute." }),
      );
      if (r.ok) onDone();
      else setMessage(r.message);
    });
  };

  return (
    <div ref={ref} className="sx-ops sx-rec sx-ap-modal">
      <div className="sx-ap-scrim" onClick={pending ? undefined : onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="sx-ap-sheet sx-rec-sheet" data-n={Math.min(choices.length, 3)}>
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
        <span aria-hidden="true" className="sx-ap-sheet-scan" />
        <div className="sx-ap-sheet-head">
          <span className="sx-ap-sheet-badge" aria-hidden="true">
            <Glyph ui="shield" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="sx-ap-sheet-title">{title}</h2>
            <p className="sx-ap-sheet-lede">{lede}</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="sx-ap-close" aria-label="Close">
            <Glyph ui="close" className="size-4" />
          </button>
        </div>

        <div className="sx-ap-sheet-body sx-rec-sheet-body">
          <div className="sx-rec-cards" role="radiogroup" aria-label="Decision" data-n={Math.min(choices.length, 3)}>
            {choices.map((c, i) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={picked === c.key}
                disabled={Boolean(c.locked) || pending}
                data-kind={c.kind}
                data-locked={c.locked ? "" : undefined}
                data-autofocus={c.key === (open[0]?.key ?? "") ? "" : undefined}
                onClick={() => {
                  setPicked(c.key);
                  setMessage(null);
                }}
                className="sx-rec-card"
                style={{ "--d": `${0.1 + i * 0.07}s` } as CSSProperties}
              >
                <span className="sx-rec-card-icon" aria-hidden="true">
                  <Glyph ui={c.locked ? "lock" : c.icon} className="size-[18px]" />
                </span>
                <span className="sx-rec-card-title">{c.label}</span>
                <span className="sx-rec-card-text">{c.text}</span>
                {c.locked && <span className="sx-rec-card-lock">{c.locked}</span>}
              </button>
            ))}
          </div>

          {choice && (choice.extra || choice.warning || choice.note) && (
            <div className="sx-rec-more" key={choice.key}>
              {choice.extra}
              {choice.warning && <div role="note" className="sx-rec-warn">{choice.warning}</div>}
              {choice.note && (
                <label className="sx-rec-label">
                  <span>
                    {choice.note.label} {needNote ? <em data-need="">required</em> : <em>optional</em>}
                  </span>
                  {choice.note.hint && <span className="sx-rec-why">{choice.note.hint}</span>}
                  <textarea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={choice.note.placeholder} className="sx-rec-input" />
                </label>
              )}
            </div>
          )}
          {message && (
            <p role="alert" className="sx-rec-alert">
              {message}
            </p>
          )}
        </div>

        <div className="sx-ap-sheet-foot sx-rec-sheet-foot">
          <p className="sx-rec-why" aria-live="polite">
            {!choice ? "Pick one above. Nothing is saved until you press the button." : blocked ? blocked : !ready ? "Write it first. It is emailed to them as you wrote it." : "Nothing is saved until you press the button."}
          </p>
          <button type="button" onClick={onClose} disabled={pending} className="sx-rec-btn sx-rec-btn-sm" data-kind="quiet">
            Cancel
          </button>
          <button type="button" disabled={!ready || pending} onClick={go} className="sx-rec-btn sx-rec-btn-sm" data-kind={choice ? choice.kind : "ask"}>
            {pending ? <span className="sx-ap-spin" aria-hidden="true" /> : choice && <Glyph ui={choice.icon} className="size-4" />}
            {pending ? "Saving…" : choice ? (choice.action ?? choice.label) : "Choose first"}
          </button>
        </div>
      </section>
    </div>
  );
}
