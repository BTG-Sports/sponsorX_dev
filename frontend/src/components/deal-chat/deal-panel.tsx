"use client";

import { useRef, useState } from "react";

import {
  amountOpen, amountView, canWrite, cardRows, centsFromInput, chatTitle, dealStage, dealUsd, deadlineWords, inputFromCents, isEnded,
  orderHref, otherSide, sideName,
  type ApiDealChat, type CardRow, type DealViewer,
} from "@/lib/deal-chat";

import { AgreementDownload } from "./agreement-download";
import { ChatAvatar, Glyph, PanelSection, StagePill } from "./chat-bits";

/* --------------------------------------------------------------------------
   The deal beside the chat — Messenger keeps "Chat info" here; a deal chat
   keeps the deal: the checklist with its answers (spec §3.2, §3.3), the
   final amount (§3.7), the agreement (§3.6, §3.9) and calling it off (§3.5).
   The same panel is the right-hand column of the Messages page and the
   sheet a chat window slides over itself.
   -------------------------------------------------------------------------- */

export type Done = { ok: true } | { ok: false; message: string };

export type DealHandlers = {
  pick: (cardKey: string, value: string | string[]) => Promise<Done>;
  amount: (cents: number) => Promise<Done>;
  /** Put the composer in offer mode, about a question or about nothing in particular. */
  startOffer: (cardKey: string | null) => void;
  openAgreement: () => void;
  openCallOff: () => void;
};

/** A question's answers as chips. One tap picks a single answer; a tick-all question is saved with its button. */
export function AnswerChips({ row, disabled, onPick }: { row: CardRow; disabled?: boolean; onPick: (value: string | string[]) => Promise<Done> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<string[]>(row.mine ?? []);
  const inFlight = useRef(false);

  const send = async (value: string | string[], mark: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(mark);
    setError(null);
    try {
      const r = await onPick(value);
      if (!r.ok) setError(r.message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const same = ticked.length === (row.mine?.length ?? 0) && ticked.every((v) => row.mine?.includes(v));

  return (
    <div className="sx-dc-answers">
      <div className="sx-dc-chips" role="group" aria-label={row.question}>
        {row.answers.map((a) => {
          const on = row.multi ? ticked.includes(a.value) : !!row.mine?.includes(a.value);
          return (
            <button
              key={a.value}
              type="button"
              className="sx-dc-chip"
              aria-pressed={on}
              disabled={disabled || busy !== null}
              data-busy={busy === a.value ? "" : undefined}
              onClick={() => {
                if (row.multi) setTicked((t) => (t.includes(a.value) ? t.filter((v) => v !== a.value) : [...t, a.value]));
                else if (!on) void send(a.value, a.value);
              }}
            >
              {on && <Glyph name="check" size={13} />}
              {a.label}
            </button>
          );
        })}
      </div>
      {row.multi && (
        <button type="button" className="sx-dc-btn" data-kind="primary" disabled={disabled || busy !== null || ticked.length === 0 || same} onClick={() => void send(ticked, "all")}>
          {busy ? "Saving…" : row.mine ? "Change my answer" : "Save my answer"}
        </button>
      )}
      {error && <p className="sx-dc-err" role="alert">{error}</p>}
    </div>
  );
}

/** The final amount: pre-filled, confirmed or typed over by each side, agreed when the two match (spec §3.7). */
export function AmountBox({ chat, onConfirm, idPrefix }: { chat: ApiDealChat; onConfirm: (cents: number) => Promise<Done>; idPrefix: string }) {
  const a = amountView(chat);
  const [text, setText] = useState(inputFromCents(a.prefillCents));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const you = chat.yourSide;
  const other = you ? sideName(chat, otherSide(you)) : "";
  const open = amountOpen(chat) && canWrite(chat);
  const cents = centsFromInput(text);

  const confirm = async () => {
    if (cents === null) return setError("Type the amount in dollars, like 1150 or 1150.50.");
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await onConfirm(cents);
      if (!r.ok) setError(r.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const mineWord = you ? "You" : chat.sponsorName;
  const theirsWord = you ? other : chat.sellerName;

  return (
    <div className="sx-dc-amount">
      <p className="sx-dc-amount-orig">Original amount <b>{dealUsd(a.originalCents)}</b></p>

      {a.agreed && a.agreedCents != null ? (
        <p className="sx-dc-amount-final"><Glyph name="check" size={16} />Agreed: <b>{dealUsd(a.agreedCents)}</b></p>
      ) : (
        <ul className="sx-dc-amount-sides">
          <li data-set={a.mineCents != null ? "" : undefined}>{mineWord}: <b>{a.mineCents != null ? dealUsd(a.mineCents) : "not confirmed yet"}</b></li>
          <li data-set={a.theirsCents != null ? "" : undefined}>{theirsWord}: <b>{a.theirsCents != null ? dealUsd(a.theirsCents) : "not confirmed yet"}</b></li>
        </ul>
      )}

      {a.mismatch && <p className="sx-dc-note" data-tone="warn">Your amounts don&apos;t match. Settle it in the chat, then confirm the same amount.</p>}
      {chat.moneyNudge && !a.agreed && <p className="sx-dc-note" data-tone="info">{chat.moneyNudge}</p>}

      {open && chat.mayAccept && (
        <form
          className="sx-dc-amount-form"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <label htmlFor={`${idPrefix}-amount`}>Amount to pay</label>
          <div className="sx-dc-amount-row">
            <span className="sx-dc-money">
              <i aria-hidden>$</i>
              <input id={`${idPrefix}-amount`} inputMode="decimal" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${idPrefix}-amount-hint`} />
            </span>
            <button type="submit" className="sx-dc-btn" data-kind="primary" disabled={busy}>
              {busy ? "Saving…" : a.mineCents != null ? "Change" : "Confirm"}
            </button>
          </div>
          <p id={`${idPrefix}-amount-hint`} className="sx-dc-hint">Pre-filled with the amount on the table. Type over it if you agreed a different one. It locks when both of you confirm the same amount.</p>
        </form>
      )}
      {open && !chat.mayAccept && you === "SELLER" && <p className="sx-dc-note" data-tone="info">Only your parent or guardian can confirm the amount.</p>}
      {error && <p className="sx-dc-err" role="alert">{error}</p>}
    </div>
  );
}

const ROW_MARK: Record<CardRow["state"], { glyph: "check" | "x" | "clock"; word: string }> = {
  agreed: { glyph: "check", word: "Agreed" },
  differ: { glyph: "x", word: "Your answers differ" },
  yours: { glyph: "clock", word: "Needs your answer" },
  theirs: { glyph: "clock", word: "Waiting" },
  open: { glyph: "clock", word: "Not answered" },
};

function ChecklistRow({ row, chat, handlers }: { row: CardRow; chat: ApiDealChat; handlers: DealHandlers }) {
  const you = chat.yourSide;
  const other = you ? sideName(chat, otherSide(you)) : "";
  const writable = canWrite(chat);
  const [changing, setChanging] = useState(false);
  const mark = ROW_MARK[row.state];
  const left = you ? "You" : chat.sponsorName;
  const right = you ? other : chat.sellerName;

  return (
    <li className="sx-dc-row" data-state={row.state}>
      <span className="sx-dc-row-mark" title={mark.word}><Glyph name={mark.glyph} size={13} /></span>
      <div className="sx-dc-row-main">
        <p className="sx-dc-row-q">{row.question}</p>
        {row.state === "agreed" && <p className="sx-dc-row-a"><b>{row.mineLabel}</b> · agreed and locked</p>}
        {row.state === "differ" && <p className="sx-dc-row-a">{left}: <b>{row.mineLabel}</b> · {right}: <b>{row.theirsLabel}</b></p>}
        {row.state === "theirs" && you && <p className="sx-dc-row-a">You: <b>{row.mineLabel}</b> · waiting for {other}</p>}
        {row.state === "theirs" && !you && <p className="sx-dc-row-a">{row.mine ? `${left}: ${row.mineLabel}` : `${right}: ${row.theirsLabel}`} · the other side hasn&apos;t answered</p>}
        {row.state === "yours" && <p className="sx-dc-row-a">{row.theirs ? `${other} has answered. ` : ""}Pick your answer:</p>}
        {row.state === "open" && <p className="sx-dc-row-a">Nobody has answered yet.</p>}

        {writable && (row.state === "yours" || changing) && (
          <AnswerChips
            row={row}
            onPick={async (v) => {
              const r = await handlers.pick(row.key, v);
              if (r.ok) setChanging(false);
              return r;
            }}
          />
        )}
        {writable && (row.state === "differ" || row.state === "theirs") && !changing && (
          <div className="sx-dc-row-acts">
            <button type="button" className="sx-dc-link" onClick={() => setChanging(true)}>Change my answer</button>
            {row.state === "differ" && !chat.agreement && (row.offerOpen ? <span className="sx-dc-tag">Offer open</span> : <button type="button" className="sx-dc-link" onClick={() => handlers.startOffer(row.key)}>Make an offer</button>)}
          </div>
        )}
      </div>
    </li>
  );
}

export function DealPanel({ chat, viewer, handlers, now, onClose }: {
  chat: ApiDealChat;
  viewer: DealViewer;
  handlers: DealHandlers;
  now: Date;
  /** Shown as a sheet: the button that puts the chat back in front. */
  onClose?: () => void;
}) {
  const rows = cardRows(chat);
  const stage = dealStage(chat);
  const deadline = deadlineWords(chat.signingDeadline, now);
  const order = orderHref(viewer.portal, chat.orderId);
  const you = chat.yourSide;
  const ended = isEnded(chat);
  const paid = ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "REFUNDED"].includes(chat.orderState);
  const mayCallOff = !!you && !ended && !paid && chat.mayAccept;
  /* The sponsor signed when the agreement is out and it is no longer their turn. */
  const waitsOn = chat.agreement && chat.orderState === "IN_CHAT" ? chat.status.turn.filter((t) => t !== "BTG").map((t) => sideName(chat, t)) : [];

  return (
    <div className="sx-dc-deal-in">
      <div className="sx-dc-deal-top">
        {onClose && (
          <button type="button" className="sx-dc-icon sx-dc-deal-close" aria-label="Back to the chat" onClick={onClose}><Glyph name="back" /></button>
        )}
        <ChatAvatar name={you === "SPONSOR" ? chat.sellerName : chat.sponsorName} size={64} />
        <h3>{chatTitle(chat)}</h3>
        <p>Order {chat.orderRef}</p>
        <StagePill stage={stage} />
        <p className="sx-dc-deal-text">{stage.text}</p>
        <div className="sx-dc-deal-quick">
          {order && <a className="sx-dc-quick" href={order}><span><Glyph name="order" /></span>Order</a>}
          <button type="button" className="sx-dc-quick" onClick={handlers.openAgreement} disabled={!chat.agreement}><span><Glyph name="file" /></span>Agreement</button>
          {chat.agreement && <AgreementDownload id={chat.agreement.id} className="sx-dc-quick" variant="quick"><span><Glyph name="download" /></span>PDF</AgreementDownload>}
        </div>
      </div>

      {chat.calledOff && (
        <div className="sx-dc-note" data-tone="off">
          <b>{you && chat.calledOff.side === you ? "You" : sideName(chat, chat.calledOff.side)} called the deal off.</b> &ldquo;{chat.calledOff.reason}&rdquo;
        </div>
      )}

      <PanelSection title="Deal checklist" note={`${chat.status.agreedCount} of ${chat.status.cardCount} agreed`}>
        <div className="sx-dc-progress" role="img" aria-label={`${chat.status.agreedCount} of ${chat.status.cardCount} questions agreed`}>
          {rows.map((r) => <i key={r.key} data-state={r.state} />)}
        </div>
        <ul className="sx-dc-rows">
          {rows.map((r) => <ChecklistRow key={r.key} row={r} chat={chat} handlers={handlers} />)}
        </ul>
        {canWrite(chat) && !chat.agreement && (
          <button type="button" className="sx-dc-link sx-dc-offer-any" onClick={() => handlers.startOffer(null)}>
            <Glyph name="tag" size={14} />Make an offer about something else
          </button>
        )}
      </PanelSection>

      <PanelSection title="Final amount" note={chat.status.amount.agreed ? "Agreed" : "Not agreed yet"}>
        <AmountBox key={`${chat.status.amount.sponsorCents}-${chat.status.amount.sellerCents}`} chat={chat} onConfirm={handlers.amount} idPrefix="sx-dc-panel" />
      </PanelSection>

      <PanelSection title="Agreement" note={chat.agreement ? (waitsOn.length ? "Waiting for signatures" : "Signed by both") : "Not ready yet"}>
        {chat.agreement ? (
          <div className="sx-dc-agr-card">
            <p>
              {waitsOn.length
                ? `Everything is agreed, and the agreement is filled in from this chat. Waiting for ${waitsOn.join(" and ")} to sign.`
                : "Signed by both of you. It can be downloaded at any time."}
            </p>
            <div className="sx-dc-agr-card-acts">
              <button type="button" className="sx-dc-btn" data-kind={you && chat.status.turn.includes(you) && chat.mayAccept ? "primary" : undefined} onClick={handlers.openAgreement}>
                {you && chat.status.turn.includes(you) && chat.orderState === "IN_CHAT" ? "Read and sign" : "Read the agreement"}
              </button>
              <AgreementDownload id={chat.agreement.id} className="sx-dc-btn"><Glyph name="download" size={15} />PDF</AgreementDownload>
            </div>
          </div>
        ) : (
          <p className="sx-dc-hint">One agreement, filled in from this chat. It appears once every question and the final amount are agreed, no offer is open, and nothing is waiting for a BTG check.</p>
        )}
        {deadline && <p className="sx-dc-deadline" data-urgent={deadline.urgent ? "" : undefined}><Glyph name="clock" size={14} />{deadline.text}</p>}
      </PanelSection>

      <PanelSection title="Good to know" defaultOpen={false}>
        <ul className="sx-dc-know">
          <li><Glyph name="shield" size={15} />Keep the deal and the payment on SponsorX. A message with a phone number, an email address, a social handle or an outside payment link is checked by BTG before the other side sees it.</li>
          <li><Glyph name="file" size={15} />Only agreed answers and accepted offers go into the agreement. Ordinary messages don&apos;t.</li>
          <li><Glyph name="card" size={15} />Nothing is charged until both of you have signed and the sponsor pays.</li>
        </ul>
      </PanelSection>

      {mayCallOff && (
        <div className="sx-dc-danger">
          <button type="button" className="sx-dc-btn" data-kind="danger" onClick={handlers.openCallOff}>Call the deal off</button>
          <p className="sx-dc-hint">Cancels the order for everyone on it. Nothing is charged.</p>
        </div>
      )}
      {!!you && !ended && !paid && !chat.mayAccept && you === "SELLER" && (
        <p className="sx-dc-note" data-tone="info">You can talk and answer the questions. Only your parent or guardian can accept an offer, confirm the amount, sign or call the deal off.</p>
      )}
      {you === "SPONSOR" && !chat.mayAccept && <p className="sx-dc-note" data-tone="info">You&apos;re viewing this chat. A Sponsor Admin writes, signs and pays.</p>}
    </div>
  );
}
