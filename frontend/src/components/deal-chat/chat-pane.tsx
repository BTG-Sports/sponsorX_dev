"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMounted } from "@/components/use-mounted";
import {
  acceptDealOfferAction, callOffDealAction, confirmDealAmountAction, declineDealOfferAction, loadDealChatAction, makeDealOfferAction,
  pickDealCardAction, replyDealOfferAction, sendDealMessageAction,
} from "@/server/deal-chat-actions";
import {
  DEAL_TEXT_MAX, amountOpen, amountView, canWrite, cardQuestion, cardRows, chatTitle, dealStage, dealUsd, isEnded, nextMove, nextQuestion,
  offerButtons, orderHref, otherSide, sideName, threadOf, yourTurn,
  type ApiDealChat, type DealViewer, type ThreadMessage,
} from "@/lib/deal-chat";

import { ChatAvatar, Glyph, IconButton } from "./chat-bits";
import { AgreementDialog, CallOffDialog, ReportDialog } from "./deal-dialogs";
import { AmountBox, AnswerChips, DealPanel, type DealHandlers, type Done } from "./deal-panel";
import { useDealChat, type ChatWrite } from "./use-deal-chat";

/* --------------------------------------------------------------------------
   One deal chat, drawn the way a messenger draws a conversation: who it is
   with on top, the deal checklist pinned under it, the bubbles, and the box
   to type in. The deal itself (answers, amount, agreement) sits beside the
   chat on a wide Messages page and slides over it everywhere else.

   `layout="page"` is the Messages page's middle and right columns;
   `layout="window"` is the small window the round button opens.

   2S4-FE-07 (sponsor), 2S4-FE-08 (athlete, guardian, team manager),
   2S4-FE-09 (BTG reads; nothing here writes for BTG).
   -------------------------------------------------------------------------- */

type Mode = { kind: "message" } | { kind: "offer"; cardKey: string | null } | { kind: "reply"; exchangeId: string };
type Dialog = null | { kind: "agreement" } | { kind: "calloff" } | { kind: "report"; messageId: string; excerpt: string };

const done = (r: ChatWrite): Done => (r.ok ? { ok: true } : { ok: false, message: r.message });

function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function ChatPaneGhost({ label = "Loading the chat" }: { label?: string }) {
  return (
    <div className="sx-dc-pane-ghost" role="status" aria-label={label}>
      <div className="sx-dc-ghost-head"><span className="sx-dc-ghost sx-dc-ghost-dot" /><span className="sx-dc-ghost" style={{ width: "38%", height: 14 }} /></div>
      <div className="sx-dc-ghost-body">
        <span className="sx-dc-ghost" style={{ width: "46%", height: 38 }} />
        <span className="sx-dc-ghost" style={{ width: "30%", height: 38 }} />
        <span className="sx-dc-ghost sx-dc-ghost-r" style={{ width: "52%", height: 38 }} />
        <span className="sx-dc-ghost" style={{ width: "62%", height: 84 }} />
        <span className="sx-dc-ghost sx-dc-ghost-r" style={{ width: "34%", height: 38 }} />
      </div>
      <div className="sx-dc-ghost-foot"><span className="sx-dc-ghost" style={{ height: 40, borderRadius: 999 }} /></div>
    </div>
  );
}

export function ChatPane({ id, initial, viewer, layout, onBack, onClose, onMinimise, fullHref, sample = false }: {
  id: string;
  initial: ApiDealChat | null;
  /** The `?demo=sample` preview: nothing is sent, picked or signed. */
  sample?: boolean;
  viewer: DealViewer;
  layout: "page" | "window";
  /** Phone, Messages page: back to the list of chats. */
  onBack?: () => void;
  /** Window: close it, or fold it down to its title. */
  onClose?: () => void;
  onMinimise?: () => void;
  /** Window: the same chat on the Messages page. */
  fullHref?: string;
}) {
  const mounted = useMounted();
  const { chat, problem, gone, act } = useDealChat(id, initial, sample);
  const now = useNow();

  const [mode, setMode] = useState<Mode>({ kind: "message" });
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ body: string; kind: Mode["kind"] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  /* The deal beside the chat (a wide Messages page) and over it (anywhere else). */
  const [side, setSide] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);

  const sending = useRef(false);
  const offerFlight = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);

  const items = useMemo(() => (chat && mounted ? threadOf(chat, now) : []), [chat, mounted, now]);
  const count = chat?.messages.length ?? 0;
  const tailKey = chat ? `${chat.status.agreedCount}-${chat.agreement?.id ?? ""}-${chat.orderState}-${chat.status.amount.agreed}` : "";

  /* Stay at the newest message unless the reader scrolled up to read older ones. */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
  }, [count, tailKey, pending, mounted]);
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current && !atBottom.current) setFresh(true);
    lastCount.current = count;
  }, [count]);

  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    atBottom.current = true;
    setFresh(false);
  };

  const wide = () => layout === "page" && typeof window !== "undefined" && window.matchMedia("(min-width: 1360px)").matches;
  const toggleDeal = () => (wide() ? setSide((v) => !v) : setSheet((v) => !v));
  const showDeal = () => (wide() ? setSide(true) : setSheet(true));

  const focusBox = () => requestAnimationFrame(() => box.current?.focus());

  const grow = () => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  };

  if (gone) {
    return (
      <div className="sx-dc-pane sx-dc-pane-empty" data-layout={layout}>
        {(onBack || onClose) && <div className="sx-dc-head"><span className="grow" />{onBack && <IconButton label="Back to your chats" name="back" onClick={onBack} />}{onClose && <IconButton label="Close chat" name="x" onClick={onClose} />}</div>}
        <div className="sx-dc-blank">
          <span className="sx-dc-blank-mark"><Glyph name="chat" size={26} /></span>
          <h3>This chat can&apos;t be found</h3>
          <p>It may belong to another account, or the link may be wrong. Pick a chat from your list.</p>
        </div>
      </div>
    );
  }
  if (!chat || !mounted) {
    return (
      <div className="sx-dc-pane" data-layout={layout}>
        {problem ? (
          <div className="sx-dc-blank">
            <span className="sx-dc-blank-mark"><Glyph name="chat" size={26} /></span>
            <h3>The chat didn&apos;t load</h3>
            <p>{problem} It tries again by itself.</p>
            {onClose && <button type="button" className="sx-dc-btn" onClick={onClose}>Close</button>}
          </div>
        ) : (
          <ChatPaneGhost />
        )}
      </div>
    );
  }

  const you = chat.yourSide;
  const title = chatTitle(chat);
  const other = you ? sideName(chat, otherSide(you)) : "";
  const stage = dealStage(chat);
  const writable = canWrite(chat);
  const ended = isEnded(chat);
  const rows = cardRows(chat);
  const question = writable ? nextQuestion(chat) : null;
  const differ = writable && !question && !chat.agreement ? rows.find((r) => r.state === "differ" && !r.offerOpen) ?? null : null;
  const amount = amountView(chat);
  const askAmount = writable && !question && !differ && !chat.agreement && amountOpen(chat) && chat.status.agreedCount === chat.status.cardCount && (amount.mineCents == null || amount.mismatch);
  const order = orderHref(viewer.portal, chat.orderId);

  const handlers: DealHandlers = {
    pick: (cardKey, value) => act(() => pickDealCardAction(id, cardKey, value)).then(done),
    amount: (cents) => act(() => confirmDealAmountAction(id, cents)).then(done),
    startOffer: (cardKey) => {
      setMode({ kind: "offer", cardKey });
      setSheet(false);
      setError(null);
      focusBox();
    },
    openAgreement: () => setDialog({ kind: "agreement" }),
    openCallOff: () => setDialog({ kind: "calloff" }),
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending.current) return;
    sending.current = true;
    atBottom.current = true;
    const sent = mode;
    setPending({ body, kind: sent.kind });
    setText("");
    setError(null);
    requestAnimationFrame(grow);
    try {
      const r = await act(() =>
        sent.kind === "offer" ? makeDealOfferAction(id, body, sent.cardKey) : sent.kind === "reply" ? replyDealOfferAction(id, sent.exchangeId, body) : sendDealMessageAction(id, body),
      );
      if (r.ok) {
        setMode({ kind: "message" });
      } else {
        /* Nothing typed is lost: it goes back in the box. */
        setText(body);
        setError(r.message);
        requestAnimationFrame(grow);
      }
    } finally {
      sending.current = false;
      setPending(null);
    }
  };

  const answerOffer = async (key: string, write: () => Promise<ChatWrite>) => {
    if (offerFlight.current) return;
    offerFlight.current = true;
    setBusyOffer(key);
    setError(null);
    try {
      const r = await act(write);
      if (!r.ok) setError(r.message);
    } finally {
      offerFlight.current = false;
      setBusyOffer(null);
    }
  };

  const bubble = (m: ThreadMessage) => {
    const offer = m.exchange;
    const buttons = offer && m.latestOfOffer ? offerButtons(chat, offer) : null;
    const isOffer = m.kind !== "TEXT";
    const reportable = !!you && !m.mine && m.state === "VISIBLE";
    return (
      <li key={m.id} className="sx-dc-msg" data-mine={m.mine ? "" : undefined} data-first={m.first ? "" : undefined} data-last={m.last ? "" : undefined} data-offer={isOffer ? "" : undefined} data-state={m.state}>
        {!m.mine && <span className="sx-dc-msg-pic">{m.last && <ChatAvatar name={m.author} size={28} />}</span>}
        <div className="sx-dc-msg-col">
          {m.first && (!you || m.byGuardian) && <span className="sx-dc-msg-who">{!you ? m.author : ""}{m.byGuardian ? `${!you ? " · " : ""}Parent or guardian` : ""}</span>}
          <div className="sx-dc-msg-line">
            <div className="sx-dc-bubble" title={m.time}>
              {isOffer && (
                <span className="sx-dc-bubble-tag">
                  <Glyph name={m.kind === "OFFER" ? "tag" : "reply"} size={12} />
                  {m.kind === "OFFER" ? "Offer" : "Reply to the offer"}
                </span>
              )}
              {m.kind === "OFFER" && offer?.about && <span className="sx-dc-bubble-about">About: {offer.about}</span>}
              <span className="sx-dc-bubble-text">{m.body}</span>
            </div>
            {reportable && (
              <button type="button" className="sx-dc-report" aria-label="Report this message to BTG" title="Report to BTG" onClick={() => setDialog({ kind: "report", messageId: m.id, excerpt: m.body.length > 240 ? `${m.body.slice(0, 240)}…` : m.body })}>
                <Glyph name="flag" size={14} />
              </button>
            )}
          </div>

          {m.state === "HELD" && (
            <span className="sx-dc-msg-note" data-tone="warn">
              <Glyph name="shield" size={12} />
              {you ? `Waiting for a BTG check. ${other} can't see it yet.` : `Held: ${m.heldReasons.join("; ") || "waiting for a BTG check"}`}
            </span>
          )}
          {m.state === "KEPT_BACK" && (
            <span className="sx-dc-msg-note" data-tone="off"><Glyph name="shield" size={12} />Kept back by BTG{m.keptBackReason ? `: ${m.keptBackReason}` : "."}</span>
          )}
          {m.reported && <span className="sx-dc-msg-note" data-tone="warn"><Glyph name="flag" size={12} />Reported{m.reportReason ? `: ${m.reportReason}` : ""}</span>}

          {buttons && offer && (
            <div className="sx-dc-offer" data-state={offer.state}>
              <p>{buttons.note}</p>
              {buttons.open && (
                <div className="sx-dc-offer-acts">
                  {buttons.canAccept && offer.latestMessageId && (
                    <button type="button" className="sx-dc-btn" data-kind="primary" disabled={busyOffer !== null} onClick={() => void answerOffer(`a-${offer.id}`, () => acceptDealOfferAction(id, offer.id, offer.latestMessageId!))}>
                      {busyOffer === `a-${offer.id}` ? "Accepting…" : "Accept"}
                    </button>
                  )}
                  {buttons.canReply && (
                    <button type="button" className="sx-dc-btn" disabled={busyOffer !== null} onClick={() => { setMode({ kind: "reply", exchangeId: offer.id }); setError(null); focusBox(); }}>
                      Reply
                    </button>
                  )}
                  {buttons.canDecline && (
                    <button type="button" className="sx-dc-btn" data-kind="quiet-danger" disabled={busyOffer !== null} onClick={() => void answerOffer(`d-${offer.id}`, () => declineDealOfferAction(id, offer.id))}>
                      {busyOffer === `d-${offer.id}` ? "Declining…" : "Decline"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {m.last && <time className="sx-dc-msg-time" dateTime={m.createdAt}>{m.time}</time>}
        </div>
      </li>
    );
  };

  const modeAbout = mode.kind === "offer" ? cardQuestion(chat, mode.cardKey) : null;
  const placeholder = !writable
    ? ""
    : mode.kind === "offer"
      ? "Write your offer in your own words…"
      : mode.kind === "reply"
        ? "Write your reply to the offer…"
        : `Message ${other}…`;

  return (
    <div className="sx-dc-pane" data-layout={layout} data-side={side ? "" : undefined} data-sheet={sheet ? "" : undefined}>
      <section className="sx-dc-conv" aria-label={`Chat with ${title}`}>
        <header className="sx-dc-head">
          {onBack && <span className="sx-dc-head-back"><IconButton label="Back to your chats" name="back" onClick={onBack} /></span>}
          <ChatAvatar name={you === "SPONSOR" ? chat.sellerName : chat.sponsorName} size={layout === "window" ? 34 : 40} dot={yourTurn(chat)} />
          <div className="sx-dc-head-main">
            <h2>{title}</h2>
            <p>Order {chat.orderRef} · {stage.label}</p>
          </div>
          <div className="sx-dc-head-acts">
            {fullHref && <IconButton label="Open in Messages" name="expand" href={fullHref} size={16} />}
            <IconButton label="Deal details" name="info" onClick={toggleDeal} active={layout === "page" ? undefined : sheet} />
            {onMinimise && <IconButton label="Minimise" name="minus" onClick={onMinimise} />}
            {onClose && <IconButton label="Close chat" name="x" onClick={onClose} />}
          </div>
        </header>

        <button type="button" className="sx-dc-pin" onClick={showDeal} data-tone={stage.tone}>
          <span className="sx-dc-pin-mark"><Glyph name="pin" size={15} /></span>
          <span className="sx-dc-pin-main">
            <b>Deal checklist · {chat.status.agreedCount} of {chat.status.cardCount} agreed</b>
            <small>{nextMove(chat)}</small>
          </span>
          <span className="sx-dc-pips" aria-hidden>{rows.map((r) => <i key={r.key} data-state={r.state} />)}</span>
        </button>

        <div
          className="sx-dc-thread"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
            if (atBottom.current && fresh) setFresh(false);
          }}
        >
          <div className="sx-dc-intro">
            <ChatAvatar name={you === "SPONSOR" ? chat.sellerName : chat.sponsorName} size={56} />
            <h3>{title}</h3>
            <p>
              {you
                ? `This is your deal chat with ${other} about order ${chat.orderRef}. Answer the questions, talk it through, then sign one agreement. Payment opens only after both of you sign.`
                : `The deal chat for order ${chat.orderRef}. You're reading it as BTG: nothing you do here is seen by either side.`}
            </p>
          </div>

          <ol className="sx-dc-msgs" aria-live="polite">
            {items.map((it) => (it.type === "day" ? <li key={it.id} className="sx-dc-day"><span>{it.label}</span></li> : bubble(it)))}
            {pending && (
              <li className="sx-dc-msg" data-mine="" data-first="" data-last="" data-offer={pending.kind !== "message" ? "" : undefined} data-pending="">
                <div className="sx-dc-msg-col">
                  <div className="sx-dc-msg-line"><div className="sx-dc-bubble"><span className="sx-dc-bubble-text">{pending.body}</span></div></div>
                  <span className="sx-dc-msg-time">Sending…</span>
                </div>
              </li>
            )}
          </ol>

          {/* What the deal asks for next, as a card in the chat (spec §3.3, §3.7, §3.6). */}
          {question && (
            <div className="sx-dc-card" data-kind="question">
              <p className="sx-dc-card-eyebrow"><Glyph name="list" size={13} />Question {question.index + 1} of {question.total}</p>
              <h4>{question.row.question}</h4>
              <AnswerChips key={question.row.key} row={question.row} onPick={(v) => handlers.pick(question.row.key, v)} />
              <p className="sx-dc-hint">{question.row.theirs ? `${other} has answered. ` : ""}An answer is agreed when both of you pick the same one, and then it is locked.</p>
            </div>
          )}
          {differ && (
            <div className="sx-dc-card" data-kind="differ">
              <p className="sx-dc-card-eyebrow"><Glyph name="x" size={13} />Your answers differ</p>
              <h4>{differ.question}</h4>
              <p className="sx-dc-card-sides">You: <b>{differ.mineLabel}</b> · {other}: <b>{differ.theirsLabel}</b></p>
              <div className="sx-dc-card-acts">
                <button type="button" className="sx-dc-btn" data-kind="primary" onClick={() => handlers.startOffer(differ.key)}><Glyph name="tag" size={14} />Make an offer</button>
                <button type="button" className="sx-dc-btn" onClick={showDeal}>Change my answer</button>
              </div>
              <p className="sx-dc-hint">An offer is plain words: say what would make it work for you. {other} can reply, accept or decline.</p>
            </div>
          )}
          {askAmount && (
            <div className="sx-dc-card" data-kind="amount">
              <p className="sx-dc-card-eyebrow"><Glyph name="dollar" size={13} />Last step before the agreement</p>
              <h4>Confirm the final amount</h4>
              <AmountBox key={`${amount.mineCents}-${amount.theirsCents}`} chat={chat} onConfirm={handlers.amount} idPrefix="sx-dc-inline" />
            </div>
          )}
          {chat.agreement && !chat.calledOff && (
            <div className="sx-dc-card" data-kind="agreement" data-tone={stage.tone}>
              <p className="sx-dc-card-eyebrow"><Glyph name="file" size={13} />{stage.label}</p>
              <h4>{stage.key === "sign" ? "The agreement is ready" : "The agreement"}</h4>
              <p className="sx-dc-card-sides">{stage.text}{chat.status.amount.agreedCents != null ? ` Amount to pay: ${dealUsd(chat.status.amount.agreedCents)}.` : ""}</p>
              <div className="sx-dc-card-acts">
                <button type="button" className="sx-dc-btn" data-kind={stage.key === "sign" && stage.tone === "you" && chat.mayAccept ? "primary" : undefined} onClick={handlers.openAgreement}>
                  {stage.key === "sign" && stage.tone === "you" ? "Read and sign" : "Read the agreement"}
                </button>
                {stage.key === "signed-pay" && you === "SPONSOR" && order && <a className="sx-dc-btn" data-kind="primary" href={order}><Glyph name="card" size={14} />Go to the order to pay</a>}
              </div>
            </div>
          )}
          {chat.calledOff && (
            <div className="sx-dc-card" data-kind="off">
              <p className="sx-dc-card-eyebrow"><Glyph name="x" size={13} />Deal called off</p>
              <h4>{you && chat.calledOff.side === you ? "You called the deal off" : `${sideName(chat, chat.calledOff.side)} called the deal off`}</h4>
              <p className="sx-dc-card-sides">&ldquo;{chat.calledOff.reason}&rdquo;</p>
              <p className="sx-dc-hint">The order is cancelled, its dates are back on sale and nothing was charged.</p>
            </div>
          )}
          {ended && !chat.calledOff && <p className="sx-dc-system">{stage.text}</p>}
        </div>

        {fresh && (
          <button type="button" className="sx-dc-fresh" onClick={toBottom}><Glyph name="chevron" size={14} />New messages</button>
        )}

        {error && (
          <p className="sx-dc-err sx-dc-err-bar" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setError(null)}><Glyph name="x" size={14} /></button>
          </p>
        )}

        {writable ? (
          <form
            className="sx-dc-compose"
            data-mode={mode.kind}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {mode.kind !== "message" && (
              <div className="sx-dc-compose-mode">
                <Glyph name={mode.kind === "offer" ? "tag" : "reply"} size={14} />
                <span>
                  <b>{mode.kind === "offer" ? "Making an offer" : "Replying to the offer"}</b>
                  {modeAbout ? ` about: ${modeAbout}` : mode.kind === "offer" ? ". Plain words: what would make this deal work for you?" : ". A reply clears both accepts."}
                </span>
                <button type="button" aria-label="Back to an ordinary message" onClick={() => setMode({ kind: "message" })}><Glyph name="x" size={14} /></button>
              </div>
            )}
            <div className="sx-dc-compose-row">
              {!chat.agreement && (
                <button
                  type="button"
                  className="sx-dc-icon sx-dc-compose-offer"
                  aria-label="Make an offer"
                  title="Make an offer"
                  aria-pressed={mode.kind === "offer"}
                  data-active={mode.kind === "offer" ? "" : undefined}
                  onClick={() => { setMode((m) => (m.kind === "offer" ? { kind: "message" } : { kind: "offer", cardKey: null })); focusBox(); }}
                >
                  <Glyph name="tag" />
                </button>
              )}
              <label className="sx-dc-compose-box">
                <span className="sr-only">{placeholder}</span>
                <textarea
                  ref={box}
                  rows={1}
                  value={text}
                  maxLength={DEAL_TEXT_MAX}
                  placeholder={placeholder}
                  onChange={(e) => { setText(e.target.value); grow(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
              </label>
              <button type="submit" className="sx-dc-send" aria-label={mode.kind === "offer" ? "Send the offer" : mode.kind === "reply" ? "Send the reply" : "Send"} disabled={!text.trim() || pending !== null}>
                <Glyph name="send" size={18} />
              </button>
            </div>
          </form>
        ) : (
          <p className="sx-dc-compose-off">
            {!you
              ? "BTG reads every chat and writes in none. Held and reported messages are on the review desk."
              : ended
                ? "This chat is read-only now."
                : "You're viewing this chat. A Sponsor Admin writes in it."}
          </p>
        )}
      </section>

      <aside className="sx-dc-deal" aria-label="The deal">
        <DealPanel chat={chat} viewer={viewer} handlers={handlers} now={now} onClose={() => (wide() ? setSide(false) : setSheet(false))} />
      </aside>

      {dialog?.kind === "agreement" && chat.agreement && (
        <AgreementDialog chat={chat} viewer={viewer} sample={sample} onClose={() => setDialog(null)} onSigned={() => void act(() => loadDealChatAction(id))} />
      )}
      {dialog?.kind === "calloff" && (
        <CallOffDialog chat={chat} onClose={() => setDialog(null)} onCallOff={(reason) => act(() => callOffDealAction(id, reason)).then(done)} />
      )}
      {dialog?.kind === "report" && <ReportDialog messageId={dialog.messageId} excerpt={dialog.excerpt} sample={sample} onClose={() => setDialog(null)} />}
    </div>
  );
}
