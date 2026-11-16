"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Modal, usePopup } from "@/components/athlete-inventory/inventory-shop";
import { StripeLinkButton } from "@/components/payout-account-panel";
import type { CashBoard, MoneySiding, MoneyStage, MoneyStation } from "@/lib/athlete-money-shop";
import { usd, type AccountPanelView, type PayoutCheck, type PayoutWriteFailure } from "@/lib/payouts-live";
import { MoneyGlyph, type MoneyGlyphName } from "./money-glyphs";

/* --------------------------------------------------------------------------
   POL-FE-97 — the athlete's Payouts, the client half of the top of the page
   (the lists are money-lists.tsx):

   - CashOut       the board: how much can be cashed out now, counting up to
                   the cent, one sentence on what it means, and the one
                   button — "Request payout · $X" — opening a popup that
                   lists the orders it covers and what happens next. Beside
                   it, where the money goes: the payout account on Stripe
                   (the same StripeLinkButton and view as before).
   - MoneyRoad     "How your money moves": Sponsor pays → Unlocking → Ready →
                   On its way → Paid, the API's totals at each stop, dashes
                   flowing toward Paid; what sits off the road (in reserve,
                   frozen, owed back) under it.
   - MoneyChecklist what's left before a payout, as a ring and ticks, with the
                   Stripe button on the account step.

   Words: lib/athlete-money-shop.ts. Styles: inventory.css + money.css.
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

type RequestAction = () => Promise<{ ok: true; count: number } | PayoutWriteFailure>;
type LinkAction = () => Promise<PayoutWriteFailure>;
type Order = { orderId: string; orderRef: string; title: string; amount: string };

/** Cents that count up to the cent once, on arrival. The server renders the real figure; still under reduced motion. */
export function RollMoney({ cents, delay = 0, ms = 1100 }: { cents: number; delay?: number; ms?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const node = el.current;
    if (!node || !first.current) return;
    first.current = false;
    if (cents <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const run = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / ms));
      node.textContent = usd(Math.round(cents * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(run);
    };
    node.textContent = usd(0);
    raf = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(raf);
      node.textContent = usd(cents);
    };
  }, [cents, delay, ms]);
  return <span ref={el}>{usd(cents)}</span>;
}

/* ── the board ─────────────────────────────────────────────────────────── */

export function CashOut({
  board, orders, note, action, panel, linkAction, sample = false,
}: {
  board: CashBoard;
  /** The orders a request would include (requestOrders). */
  orders: Order[];
  /** What stays in reserve, said in the popup. */
  note: string | null;
  action: RequestAction;
  panel: AccountPanelView;
  linkAction: LinkAction;
  /** ?demo=sample: the popup plays, nothing is requested. */
  sample?: boolean;
}) {
  const { phase, opener, show, close } = usePopup();
  const [done, setDone] = useState<string | null>(null);
  return (
    <section id="cash-out" aria-label="Cash out" className="sx-my-board sx-iv-rise" data-mood={board.mood} style={d(0.06)}>
      <div className="sx-my-cash">
        <span aria-hidden="true" className="sx-my-cash-glow" />
        <p className="sx-iv-eyebrow sx-my-cash-eyebrow">
          <MoneyGlyph name={board.mood === "ready" ? "wallet" : board.mood === "wait" ? "hourglass" : "coin"} className="size-3.5" />
          {board.eyebrow}
        </p>
        <p className="sx-my-cash-figure sx-arena-num">
          <RollMoney cents={board.cents} delay={0.25} />
        </p>
        <h2 className="sx-my-cash-title">{board.headline}</h2>
        <p className="sx-my-cash-body">{board.body}</p>

        <div className="sx-my-cash-go">
          <button
            ref={opener}
            type="button"
            disabled={!board.button.enabled}
            onClick={show}
            className="sx-iv-add sx-iv-add-big sx-my-cash-btn"
          >
            <span className="sx-iv-add-plus" aria-hidden="true">
              <MoneyGlyph name="send" className="size-[18px]" />
            </span>
            {board.button.label}
          </button>
          {done ? (
            <p role="status" className="sx-my-done">
              <span className="sx-my-done-tick" aria-hidden="true">
                <MoneyGlyph name="check" className="size-3.5" />
              </span>
              {done}
            </p>
          ) : (
            board.reason && (
              <p className="sx-my-reason">
                <MoneyGlyph name="lock" className="size-3.5" />
                <span>
                  {board.reason}
                  {board.checklist && (
                    <>
                      {" "}
                      <a href="#before" className="sx-iv-inline-link">See what&rsquo;s left</a>
                    </>
                  )}
                </span>
              </p>
            )
          )}
        </div>
      </div>

      <AccountCard panel={panel} action={linkAction} />

      {phase !== "closed" && (
        <RequestPopup
          close={close}
          closing={phase === "closing"}
          amount={usd(board.cents)}
          orders={orders}
          note={note}
          action={action}
          sample={sample}
          onDone={(n) => {
            setDone(sample ? "Sample only: nothing was requested." : n);
            close();
          }}
        />
      )}
    </section>
  );
}

export function AccountCard({ panel, action }: { panel: AccountPanelView; action: LinkAction }) {
  const tone = panel.status === "READY" ? "ok" : "todo";
  return (
    <section id="payout-account" aria-labelledby="payout-account-title" className="sx-my-account sx-iv-rise" data-tone={tone} style={d(0.16)}>
      <div className="sx-my-account-top">
        <span className="sx-my-account-mark" aria-hidden="true">
          <MoneyGlyph name="bank" className="size-6" />
          {tone === "ok" && (
            <span className="sx-my-account-ok">
              <MoneyGlyph name="check" className="size-3" />
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="sx-iv-eyebrow">Where it goes</span>
          <h2 id="payout-account-title" className="sx-my-account-title">Your payout account</h2>
        </span>
        <span className="sx-my-chip" data-tone={tone}>
          <span className="sx-iv-state-dot" aria-hidden="true" />
          {panel.chip.label}
        </span>
      </div>
      {panel.status !== "READY" && (
        <p role={panel.waiting > 0 ? "status" : undefined} className="sx-my-account-head">
          {panel.headline}
        </p>
      )}
      <p className="sx-my-account-body">{panel.body}</p>
      {panel.guardianLine && <p className="sx-my-account-guardian">{panel.guardianLine}</p>}
      <div className="sx-my-account-foot">
        {!panel.guardianOnly && (
          <div className="sx-my-stripe" data-variant={panel.cta.variant}>
            <StripeLinkButton cta={panel.cta} action={action} testBadge={panel.testBadge} />
          </div>
        )}
        <p className="sx-my-account-safe">
          <MoneyGlyph name="shield" className="size-3.5" />
          Bank and tax details stay with Stripe. SponsorX never sees them.
        </p>
      </div>
    </section>
  );
}

function RequestPopup({
  close, closing, amount, orders, note, action, sample, onDone,
}: {
  close: () => void;
  closing: boolean;
  amount: string;
  orders: Order[];
  note: string | null;
  action: RequestAction;
  sample: boolean;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayoutWriteFailure | null>(null);
  /* A double click must not request twice (memory: double-submit-needs-a-ref). */
  const sent = useRef(false);

  const go = async () => {
    if (sent.current) return;
    sent.current = true;
    setBusy(true);
    setError(null);
    try {
      if (sample) {
        await new Promise((r) => window.setTimeout(r, 700));
        onDone("");
        return;
      }
      const r = await action();
      if (r.ok) onDone("Requested ✓ It’s on its way. Follow it in Your payouts below.");
      else {
        setError(r);
        sent.current = false;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal close={close} closing={closing} title={`Cash out ${amount}?`} lede="It goes to your payout account on Stripe." icon="coin" focus="[data-autofocus]">
      <div className="sx-my-pop">
        {orders.length > 0 && (
          <div className="sx-my-receipt">
            <p className="sx-iv-eyebrow">What it covers</p>
            <ul>
              {orders.map((o, i) => (
                <li key={o.orderId} className="sx-iv-rise" style={d(0.1 + i * 0.05)}>
                  <span className="min-w-0">
                    <span className="sx-my-receipt-title">{o.title}</span>
                    <span className="sx-my-receipt-ref">Order {o.orderRef}</span>
                  </span>
                  <span className="sx-arena-num sx-my-receipt-amt">{o.amount}</span>
                </li>
              ))}
            </ul>
            <p className="sx-my-receipt-total">
              <span>You get</span>
              <span className="sx-arena-num">{amount}</span>
            </p>
          </div>
        )}
        {note && <p className="sx-my-pop-note">{note}</p>}

        <ol className="sx-my-next" aria-label="What happens next">
          {[
            { icon: "check" as MoneyGlyphName, t: "Approved", b: "Most payouts are approved automatically." },
            { icon: "send" as MoneyGlyphName, t: "Sent", b: "Handed to Stripe for your bank." },
            { icon: "bank" as MoneyGlyphName, t: "In your bank", b: "Usually within a few days." },
          ].map((s, i) => (
            <li key={s.t} className="sx-iv-rise" style={d(0.2 + i * 0.07)}>
              <span className="sx-my-next-dot" aria-hidden="true">
                <MoneyGlyph name={s.icon} className="size-4" />
              </span>
              <span className="sx-my-next-t">{s.t}</span>
              <span className="sx-my-next-b">{s.b}</span>
            </li>
          ))}
        </ol>

        {error && (
          <p role="alert" className="sx-iv-error">
            {error.message}
            {error.reasons.length > 0 && ` Still needed: ${error.reasons.join(" · ")}.`}
          </p>
        )}
        {sample && <p className="sx-my-pop-note">Sample page: nothing is requested.</p>}

        <div className="sx-my-pop-actions">
          <button type="button" onClick={close} className="sx-my-ghost">
            Not now
          </button>
          <button type="button" data-autofocus disabled={busy} onClick={go} className="sx-iv-add sx-my-pop-go">
            {busy ? <span className="sx-iv-spin" aria-hidden="true" /> : (
              <span className="sx-iv-add-plus" aria-hidden="true">
                <MoneyGlyph name="send" className="size-4" />
              </span>
            )}
            {busy ? "Requesting…" : `Request ${amount}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ── the road money travels ────────────────────────────────────────────── */

const STATION_GLYPH: Record<MoneyStage, MoneyGlyphName> = {
  pay: "clock",
  locked: "unlock",
  ready: "wallet",
  moving: "send",
  paid: "bank",
};

const SIDING_GLYPH: Record<MoneySiding["key"], MoneyGlyphName> = { reserve: "lock", frozen: "snow", owed: "undo" };

/** The road itself: five stops and what sits off it. Drawn inside the help popup. */
function MoneyRoad({ stations, sidings }: { stations: MoneyStation[]; sidings: MoneySiding[] }) {
  return (
    <div className="sx-my-road">
      <div className="sx-my-stations-wrap">
        <span aria-hidden="true" className="sx-my-rail">
          <span className="sx-my-rail-flow" />
        </span>
        <ol className="sx-my-stations">
          {stations.map((s, i) => (
            <li
              key={s.key}
              className="sx-my-station"
              data-money={s.key}
              data-empty={s.cents === 0 ? "" : undefined}
              aria-current={s.key === "ready" && s.cents > 0 ? "step" : undefined}
              style={d(0.2 + i * 0.1)}
            >
              <span className="sx-my-station-dot" aria-hidden="true">
                <MoneyGlyph name={STATION_GLYPH[s.key]} className="size-[18px]" />
                {s.key === "ready" && s.cents > 0 && <span className="sx-my-ping" />}
              </span>
              <span className="sx-my-station-text">
                <span className="sx-my-station-label">
                  <span className="sx-my-step" aria-hidden="true">{i + 1}</span>
                  {s.label}
                </span>
                <span className="sx-my-station-amt sx-arena-num">
                  <RollMoney cents={s.cents} delay={0.3 + i * 0.1} ms={900} />
                </span>
                <span className="sx-my-station-hint">{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {sidings.length > 0 && (
        <div className="sx-my-sidings">
          <span className="sx-my-sidings-or">Off the road</span>
          {sidings.map((s, i) => (
            <p key={s.key} className="sx-my-siding sx-iv-rise" data-siding={s.key} style={d(0.6 + i * 0.07)}>
              <span className="sx-my-siding-mark" aria-hidden="true">
                <MoneyGlyph name={SIDING_GLYPH[s.key]} className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="sx-my-siding-top">
                  {s.label} <strong className="sx-arena-num">{usd(s.cents)}</strong>
                </span>
                <span className="sx-my-siding-hint">{s.hint}</span>
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** "How money moves", beside the title: a help button that opens the road in a popup (owner, 2026-11-16). */
export function MoneyRoadHelp({ stations, sidings }: { stations: MoneyStation[]; sidings: MoneySiding[] }) {
  const { phase, opener, show, close } = usePopup();
  const ready = stations.some((s) => s.key === "ready" && s.cents > 0);
  return (
    <>
      <button ref={opener} type="button" onClick={show} aria-haspopup="dialog" className="sx-iv-rules sx-my-help">
        <span className="sx-my-help-mark" aria-hidden="true">
          <MoneyGlyph name="help" className="size-4" />
        </span>
        How money moves
      </button>
      {phase !== "closed" && (
        <Modal
          close={close}
          closing={phase === "closing"}
          title="How your money moves"
          lede="Every sale goes left to right. Here's how much of yours is at each stop right now."
          icon="coin"
        >
          <MoneyRoad stations={stations} sidings={sidings} />
          <p className="sx-my-road-foot">
            <MoneyGlyph name={ready ? "wallet" : "clock"} className="size-4" />
            <span>
              {ready
                ? "Money at Ready is yours to cash out now, with the Request payout button."
                : "Nothing is at Ready yet. Each sale moves along on its own as the sponsor pays, you deliver and they confirm."}
            </span>
          </p>
          <div className="sx-my-pop-actions">
            <button type="button" onClick={close} className="sx-iv-add">
              <span className="sx-iv-add-plus" aria-hidden="true">
                <MoneyGlyph name="check" className="size-4" />
              </span>
              Got it
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── what's left before a payout ───────────────────────────────────────── */

export function MoneyChecklist({
  checks, canRequest, panel, linkAction,
}: { checks: PayoutCheck[]; canRequest: boolean; panel: AccountPanelView; linkAction: LinkAction }) {
  const done = checks.filter((c) => c.ok).length;
  const left = checks.length - done;
  const share = checks.length ? done / checks.length : 0;
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <section id="before" aria-labelledby="before-title" className="sx-my-check sx-iv-rise" style={d(0.1)}>
      <div className="sx-my-check-head">
        <span
          className="sx-my-ring"
          role="progressbar"
          aria-label="Payout checklist"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={checks.length}
          style={{ "--c": C, "--off": C * (1 - share) } as CSSProperties}
        >
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r={R} className="sx-my-ring-bg" />
            <circle cx="32" cy="32" r={R} className="sx-my-ring-fill" />
          </svg>
          <span className="sx-my-ring-n sx-arena-num">
            {done}
            <span>/{checks.length}</span>
          </span>
        </span>
        <span className="min-w-0">
          <h2 id="before-title" className="sx-my-check-title">
            {canRequest ? "Some of your money is held back" : "Before you can cash out"}
          </h2>
          <span className="sx-my-check-sub">
            {canRequest
              ? "You can cash out what's ready now. The rest unlocks once these are done."
              : left === 1
                ? "One thing left. Once it's done, the button above lights up."
                : `${left} things left. Once they're done, the button above lights up.`}
          </span>
        </span>
      </div>
      <ul className="sx-my-check-list">
        {checks.map((c, i) => (
          <li key={c.key} className="sx-my-check-item sx-iv-rise" data-ok={c.ok ? "" : undefined} style={d(0.18 + i * 0.06)}>
            <span className="sx-my-check-dot" aria-hidden="true">
              <MoneyGlyph name={c.ok ? "check" : c.key === "account" ? "bank" : c.key === "dispute" ? "snow" : c.key === "problem" ? "alert" : "clock"} className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="sx-my-check-label">
                <span className="sr-only">{c.ok ? "Done: " : "Not yet: "}</span>
                {c.label}
              </span>
              {!c.ok && c.key === "account" && (
                <span className="sx-my-check-act">
                  {panel.guardianOnly ? (
                    <span className="sx-my-account-guardian">{panel.guardianLine}</span>
                  ) : (
                    <span className="sx-my-stripe" data-variant="primary">
                      <StripeLinkButton cta={panel.cta} action={linkAction} testBadge={panel.testBadge} />
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="sx-my-check-state">{c.ok ? "Done" : "Not yet"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
