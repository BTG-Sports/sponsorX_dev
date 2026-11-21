"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Glyph as DeskGlyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { HowItWorks, SegTabs, StatusPill, rise, type FlowStep } from "@/components/desk-kit";
import { btn, DialogError, NoteField, OrderDialog } from "@/components/order-dialog";
import { keepBackDealMessageAction, releaseDealMessageAction } from "@/server/deal-chat-actions";
import { KIND_WORD, agoShort, reviewRows, type ApiDealChat, type ApiDealReviewItem, type ChatRow, type DealViewer, type ReviewRow } from "@/lib/deal-chat";

import { SAMPLE_NOTE } from "@/lib/deal-chat-sample";

import { Glyph } from "./chat-bits";
import { onDealInbox } from "./deal-socket";
import { Messenger } from "./messenger";

import "./deal-chat.css";

/* --------------------------------------------------------------------------
   2S4-FE-09 — BTG's Deal chats desk, on Mission Control.

   Two things, as two tabs:
     Needs a check  every message held before the other side sees it (a
                    phone number, an email address, a handle, an outside
                    payment link, a restricted word) and every message a
                    side reported. Release it, or keep it back with a reason
                    the sender reads.
     All chats      every deal chat, to read. BTG writes in none.

   Drawn like the other desks (desk-kit): a small title, number cards, a tab
   bar, "How it works", work first.
   -------------------------------------------------------------------------- */

type Tab = "review" | "chats";

const STEPS: FlowStep[] = [
  { icon: "users", title: "A sponsor orders", text: "A deal chat opens between the sponsor and each seller on the order. They settle the details and sign one agreement before anything is paid." },
  { icon: "shield", title: "SponsorX watches the chat", text: "A message with a phone number, an email address, a social handle, an outside payment link or a restricted word is held. The other side does not see it yet." },
  { icon: "hourglass", title: "It waits for you here", text: "Held messages and messages a side reported are listed under “Needs a check”, the oldest first. The deal can’t be signed while one is held." },
  { icon: "check", title: "You decide", text: "Release it and the other side sees it. Keep it back and the sender is emailed your reason; a kept-back offer ends." },
];

const VIEWER: DealViewer = { portal: "admin", guardian: false };

function Stat({ icon, name, value, sub, tone, alert, i }: { icon: UiGlyph; name: string; value: number; sub: string; tone: string; alert?: boolean; i: number }) {
  return (
    <div data-spot="" className="sx-ap-stat sx-ap-rise" style={rise(0.08 + i * 0.06, { "--c": alert ? "#fb923c" : tone } as CSSProperties)}>
      <span aria-hidden="true" className="sx-ap-stat-beam" />
      <dt className="sx-ap-stat-top">
        <span className="sx-ap-stat-icon" aria-hidden="true"><DeskGlyph ui={alert ? "alert" : icon} className="size-[18px]" /></span>
        <span className="sx-ap-stat-name">{name}</span>
      </dt>
      <dd className="sx-ap-stat-num">{value}</dd>
      <dd className="sx-ap-stat-sub" data-late={alert ? "" : undefined}>{sub}</dd>
    </div>
  );
}

function ReviewCard({ row, chatTitle, now, onOpenChat, sample }: { row: ReviewRow; chatTitle: string | null; now: Date; onOpenChat: (chatId: string) => void; sample: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"release" | "keep" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const inFlight = useRef(false);

  const run = async (kind: "release" | "keep") => {
    if (inFlight.current) return;
    if (kind === "keep" && !reason.trim()) return;
    if (sample) return setError(SAMPLE_NOTE);
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    try {
      const r = await (kind === "release" ? releaseDealMessageAction(row.messageId) : keepBackDealMessageAction(row.messageId, reason.trim())).catch(() => ({ ok: false as const, message: "We couldn't reach SponsorX. Nothing changed. Try again." }));
      if (r.ok) {
        setAsking(false);
        router.refresh();
      } else {
        setError(r.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const held = row.why === "held";
  return (
    <li className="sx-dc-review" data-why={row.why}>
      <div className="sx-dc-review-top">
        <StatusPill tone={held ? "amber" : "red"} act>{held ? "Held" : "Reported"}</StatusPill>
        <b>{KIND_WORD[row.kind]} from the {row.side === "SPONSOR" ? "sponsor" : "seller"}</b>
        <span>Order {row.orderRef}{chatTitle ? ` · ${chatTitle}` : ""}</span>
        <time dateTime={row.createdAt} suppressHydrationWarning>{agoShort(row.createdAt, now)} ago</time>
      </div>
      <blockquote>{row.body}</blockquote>
      {row.reasons.length > 0 && (
        <p className="sx-dc-review-why">
          <Glyph name={held ? "shield" : "flag"} size={14} />
          {held ? "Held because: " : "Reported: "}{row.reasons.join("; ")}
        </p>
      )}
      {!held && row.reasons.length === 0 && <p className="sx-dc-review-why"><Glyph name="flag" size={14} />Reported with no reason given.</p>}
      {error && !asking && <p className="sx-dc-err" role="alert">{error}</p>}
      <div className="sx-dc-review-acts">
        <button type="button" className="sx-dc-btn" data-kind="primary" disabled={busy !== null} onClick={() => void run("release")}>
          {busy === "release" ? "Working…" : held ? "Release to the other side" : "Clear the report"}
        </button>
        <button type="button" className="sx-dc-btn" data-kind="danger" disabled={busy !== null} onClick={() => { setError(null); setAsking(true); }}>Keep it back…</button>
        <button type="button" className="sx-dc-btn" onClick={() => onOpenChat(row.chatId)}>Read the chat</button>
      </div>

      {asking && (
        <OrderDialog id={`sx-dc-keep-${row.messageId}`} title="Keep this message back?" onClose={() => setAsking(false)} onSubmit={() => void run("keep")}>
          <p className="text-[13px] leading-relaxed text-muted">
            The other side never sees it. {row.kind === "OFFER" ? "The offer ends. " : row.kind === "REPLY" ? "The reply drops out of the offer and both accepts are cleared. " : ""}The sender is emailed your reason.
          </p>
          <NoteField id={`sx-dc-keep-reason-${row.messageId}`} label="Why is it kept back?" hint="The sender reads this, word for word." value={reason} onChange={setReason} />
          <DialogError message={error} />
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={btn.quiet} onClick={() => setAsking(false)}>Cancel</button>
            <button type="submit" className={btn.danger} disabled={busy !== null || !reason.trim()}>{busy === "keep" ? "Keeping it back…" : "Keep it back"}</button>
          </div>
        </OrderDialog>
      )}
    </li>
  );
}

export function DealChatsDesk({ reviews, rows, initialChat, readAt, sample }: {
  /** `?demo=sample`: sample chats and messages. Nothing is released or kept back. */
  sample?: ApiDealChat[];
  reviews: ApiDealReviewItem[];
  rows: ChatRow[];
  initialChat: ApiDealChat | null;
  /** When the lists were read, as words. */
  readAt: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  /* Live, while the desk is on screen (BTG's inbox pass): a message was held, reported, released or kept back somewhere — the desk's lists are read again. */
  useEffect(() => {
    if (sample) return;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const off = onDealInbox(() => {
      clearTimeout(soon);
      soon = setTimeout(() => router.refresh(), 600);
    });
    return () => {
      clearTimeout(soon);
      off();
    };
  }, [router, sample]);
  const tab: Tab = params.get("chat") || params.get("tab") === "chats" ? "chats" : params.get("tab") === "review" ? "review" : reviews.length > 0 ? "review" : "chats";
  const [now] = useState(() => new Date());

  const list = reviewRows(reviews);
  const held = list.filter((r) => r.why === "held").length;
  const reported = list.length - held;
  const open = rows.filter((r) => !r.ended).length;
  const titles = new Map(rows.map((r) => [r.id, r.title]));

  const go = (next: Tab, chatId?: string) => {
    const q = new URLSearchParams();
    if (sample) q.set("demo", "sample");
    q.set("tab", next);
    if (chatId) q.set("chat", chatId);
    window.history.pushState(null, "", `${pathname}?${q.toString()}`);
  };

  return (
    <div className="sx-dc-desk">
      <header>
        <div className="sx-ap-rise flex flex-wrap items-center justify-between gap-3" style={rise(0.02)}>
          <h1 className="sx-page-title">Deal chats</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="sx-ap-live"><span className="sx-ap-live-dot" aria-hidden="true" />{sample ? "Sample data" : `Live · read ${readAt}`}</span>
            <HowItWorks lede="From an order to a signed agreement, and where you come in." steps={STEPS}>
              <li>
                <span className="sx-ap-key-mark"><StatusPill tone="amber" act>Held</StatusPill></span>
                <span>The other side hasn&rsquo;t seen it. It waits until you release it or keep it back.</span>
              </li>
              <li>
                <span className="sx-ap-key-mark"><StatusPill tone="red" act>Reported</StatusPill></span>
                <span>Both sides can see it. One of them asked you to look.</span>
              </li>
            </HowItWorks>
          </div>
        </div>
        <p className="sx-ap-rise mt-2 max-w-2xl text-sm leading-relaxed text-[#9aa4b2]" style={rise(0.06)}>
          Sponsors and sellers settle each deal in a chat before anything is paid. You read any chat, and check the few messages that are{" "}
          <strong className="font-semibold text-[#fdba74]">held or reported</strong>.
        </p>
      </header>

      <dl aria-label="Deal chats in numbers" className="sx-ap-stats mt-6">
        <Stat i={0} icon="shield" name="Held for a check" value={held} sub={held ? "The other side can't see these yet" : "Nothing is held"} tone="#fb923c" alert={held > 0} />
        <Stat i={1} icon="alert" name="Reported" value={reported} sub={reported ? "A side asked you to look" : "Nothing is reported"} tone="#f87171" alert={reported > 0} />
        <Stat i={2} icon="users" name="Open chats" value={open} sub="Deals being agreed or delivered" tone="#60a5fa" />
        <Stat i={3} icon="stack" name="All chats" value={rows.length} sub="Open and closed" tone="#94a3b8" />
      </dl>

      {/* The tab bar is laid out by the desks' toolbar (`.sx-ap-bar`, applications.css): without it the sliding
          marker has nothing to sit inside and spreads over the page, covering the buttons under it. */}
      <div className="sx-ap-bar mb-3 mt-6">
        <div className="sx-ap-bar-tabs">
        <SegTabs<Tab>
          label="Show"
          tab={tab}
          onPick={(t) => go(t)}
          tabs={[
            { key: "review", label: "Needs a check", dot: list.length > 0 },
            { key: "chats", label: "All chats" },
          ]}
        />
        </div>
      </div>

      {tab === "review" ? (
        list.length === 0 ? (
          <div className="sx-dc sx-dc-desk-empty">
            <span className="sx-dc-blank-mark"><Glyph name="shield" size={26} /></span>
            <h3>Nothing needs a check</h3>
            <p>No message is held and none is reported. New ones appear here, and BTG admins are emailed.</p>
          </div>
        ) : (
          <ul className="sx-dc sx-dc-reviews">
            {list.map((r) => (
              <ReviewCard key={r.messageId} row={r} chatTitle={titles.get(r.chatId) ?? null} now={now} sample={!!sample} onOpenChat={(id) => go("chats", id)} />
            ))}
          </ul>
        )
      ) : (
        <Messenger viewer={VIEWER} initialRows={rows} initialChat={initialChat} sample={sample} embedded />
      )}
    </div>
  );
}
