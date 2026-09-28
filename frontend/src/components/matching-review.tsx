"use client";

import { Card } from "@/components/ui";
import { cx, MarginValue, TierMark } from "@/components/matching-bits";
import {
  blendedMargin,
  fmtRatio,
  jobFor,
  marginBand,
  MARGIN_FLOOR,
  sendSteps,
  sendSummary,
  type MatchAthlete,
} from "@/lib/matching";
import { money } from "@/lib/fixtures";
import { useMatch } from "@/components/matching-data";
import type { SendOutcome } from "@/components/matching-studio";

/* --------------------------------------------------------------------------
   Review & send — the final roster and what sending does (P4-ART-01 §4).

   The floor rule is per-line: a healthy blended margin does not excuse a
   breached line, so the send button stays disabled until the manager
   acknowledges a *recorded* exception. On fixtures, sending is a demo action
   — local to this visit, undoable, never persisted (roster-ops discipline).
   Live (P4-FE-03) it is real: one invitation per athlete per package line,
   per-athlete outcomes reported back, and no Undo — an offer the athlete may
   already be reading cannot be quietly withdrawn from here.

   Desktop renders the offer table; below lg each line becomes a card with
   the same fields — cost, sell and margin never drop out at any width.
   -------------------------------------------------------------------------- */

const GRID =
  "lg:grid lg:grid-cols-[minmax(0,1.5fr)_5.5rem_minmax(0,1.4fr)_5.5rem_5.5rem_6rem_7.5rem] lg:items-center lg:gap-3";

export function MatchingReview({
  athletes,
  ack,
  onAck,
  sent,
  sending = false,
  outcomes = null,
  onSend,
  onUndo,
  onBack,
}: {
  athletes: MatchAthlete[];
  ack: boolean;
  onAck: (v: boolean) => void;
  sent: boolean;
  sending?: boolean;
  outcomes?: SendOutcome[] | null;
  onSend: () => void;
  /** Absent in live mode — a real send has no Undo. */
  onUndo?: () => void;
  onBack: () => void;
}) {
  const { brief: MATCH_BRIEF, jobs, live, sendBlocked } = useMatch();
  const s = sendSummary(athletes, MATCH_BRIEF);
  const blended = blendedMargin(athletes);
  /* Live, a pick becomes one invitation per package line. */
  const invitationCount = athletes.reduce((n, a) => n + (a.lines?.length ?? 1), 0);
  const failed = (outcomes ?? []).filter((o) => !o.ok);
  const sentCount = (outcomes ?? []).filter((o) => o.ok).length;
  const canSend =
    athletes.length > 0 &&
    (s.exceptions.length === 0 || ack) &&
    !sending &&
    !(live && sendBlocked);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ head */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            Review &amp; send invitations
          </h2>
          <p className="mt-0.5 max-w-prose text-[11px] leading-relaxed text-muted">
            {athletes.length === 1
              ? "One athlete"
              : `${athletes.length} athletes`}
            , what each is being offered, and what happens when you send.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2"
        >
          ← Back to matching
        </button>
      </div>

      {/* ---------------------------------------------------------- totals */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Total k="Athletes" v={`${athletes.length} of ${MATCH_BRIEF.needed}`} />
        <Total k="Athlete cost" v={money(blended.cost)} sub="BTG internal" />
        <Total k="Sell total" v={money(blended.sell)} sub={`of ${money(MATCH_BRIEF.budget)} budget`} />
        <Total
          k="Blended margin"
          v={athletes.length ? `${blended.pct}%` : "—"}
          sub={athletes.length ? fmtRatio(blended.ratio) + " cost" : undefined}
          tone={athletes.length ? marginBand(blended.ratio) : undefined}
        />
      </dl>

      {/* ----------------------------------------------- exception banner */}
      <div className="sx-expand" data-open={s.exceptions.length > 0 && !sent}>
        <div>
          <div className="rounded-xl border border-accent/35 bg-accent/8 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-accent">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4 shrink-0"
                aria-hidden="true"
              >
                <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
                <path d="M12 10.2v4" />
                <path d="M12 17h.01" />
              </svg>
              {s.exceptions.length === 1
                ? `One line on this roster breaks the ${MARGIN_FLOOR}× margin floor`
                : `${s.exceptions.length} lines on this roster break the ${MARGIN_FLOOR}× margin floor`}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {s.exceptions
                .map(
                  (a) =>
                    `${a.name} costs ${money(a.cost)} against a ${money(a.sell)} sell on ${a.jobId} — ${fmtRatio(a.sell / a.cost)}.`,
                )
                .join(" ")}{" "}
              The blended roster margin is{" "}
              {marginBand(blended.ratio) === "below" ? "also below floor" : "healthy"},
              but the floor is a per-line rule.{" "}
              {live
                ? "The invitation only offers the athlete their pay; the Campaign Order refuses a below-floor sell price, so this line must be repriced before BTG drafts it."
                : "Send anyway and the exception is recorded against your name."}
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => onAck(e.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 accent-[var(--sx-accent)]"
              />
              <span className="text-[11px] font-medium leading-relaxed text-text">
                {live
                  ? "I understand the order will need repricing on "
                  : "I am sending with a recorded margin exception on "}
                {s.exceptions.length === 1 ? "1 line" : `${s.exceptions.length} lines`}
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          {/* --------------------------------------------------- the lines */}
          <Card className="p-0">
            {/* header (md+) */}
            <div
              className={cx(
                GRID,
                "hidden border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint",
              )}
            >
              <span>Athlete</span>
              <span>Job code</span>
              <span>Deliverables offered</span>
              <span className="text-right">Offer (cost)</span>
              <span className="text-right">Sell</span>
              <span className="text-right">Margin</span>
              <span>Can accept</span>
            </div>

            {athletes.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted">
                The shortlist is empty — go back to matching and add athletes.
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {athletes.map((a, i) => {
                  const job = jobFor(a.jobId, jobs);
                  const pending = a.guardian === "pending";
                  return (
                    <li
                      key={a.id}
                      className={cx("sx-join-rise px-4 py-3", GRID)}
                      style={{ ["--sx-d" as string]: `${i * 50}ms` }}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <TierMark tier={a.tier} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold tracking-tight">
                            {a.name}
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {a.sport} · {a.tier}
                          </span>
                        </span>
                      </span>

                      <span className="mt-2 block text-[11px] font-medium tabular-nums text-muted lg:mt-0">
                        {a.jobId}
                      </span>

                      <span className="mt-1 block text-[11px] leading-snug text-muted lg:mt-0">
                        {job.deliverable}
                      </span>

                      {/* economics — stacked line on mobile, columns on md+ */}
                      <span className="mt-2 flex items-baseline gap-1.5 text-[11px] lg:mt-0 lg:block lg:text-right">
                        <span className="text-[10px] text-faint lg:hidden">cost</span>
                        <span className="font-medium tabular-nums text-muted">
                          {money(a.cost)}
                        </span>
                      </span>
                      <span className="flex items-baseline gap-1.5 text-[11px] lg:block lg:text-right">
                        <span className="text-[10px] text-faint lg:hidden">sell</span>
                        <span className="font-semibold tabular-nums">
                          {money(a.sell)}
                        </span>
                      </span>
                      <span className="mt-1 block lg:mt-0">
                        <MarginValue cost={a.cost} sell={a.sell} />
                      </span>

                      <span className="mt-2 block lg:mt-0">
                        <span
                          className={cx(
                            "inline-flex items-center gap-1.5 text-[11px] font-medium",
                            pending ? "text-warn" : "text-success",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cx(
                              "size-1.5 rounded-full",
                              pending ? "bg-warn" : "bg-success",
                            )}
                          />
                          {pending ? "Not until consent" : "Yes"}
                        </span>
                        {pending && (
                          <span className="block text-[10px] text-faint">
                            guardian invited in parallel
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ---------------------------------------------- what sending does */}
          <Card className="p-4">
            <p className="text-[11px] font-medium text-muted">What sending does</p>
            <ul className="mt-2.5 space-y-2">
              {sendSteps(athletes, live).map((step, i) => (
                <li
                  key={step}
                  className="sx-join-rise flex items-start gap-2 text-[11px] leading-relaxed text-muted"
                  style={{ ["--sx-d" as string]: `${120 + i * 60}ms` }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mt-0.5 size-3 shrink-0 text-success"
                    aria-hidden="true"
                  >
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                  {step}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* --------------------------------------------------------- send card */}
        <aside className="space-y-4 xl:sticky xl:top-6">
          {sent ? (
            <Card className="sx-pop border-success/30 bg-success/5 p-5 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full border border-success/40 bg-success/10 text-success">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-6"
                  aria-hidden="true"
                >
                  <path d="M4 12.5l5 5L20 6.5" pathLength={1} className="sx-join-draw" />
                </svg>
              </span>
              <p className="mt-3 text-sm font-semibold tracking-tight">
                {live
                  ? `${sentCount} of ${athletes.length} athletes invited`
                  : s.invitations === 1
                    ? "1 invitation sent"
                    : `${s.invitations} invitations sent`}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {live
                  ? "Each athlete has 7 days to respond. The roster now reads their invitation state from the campaign, and it stays in STAFFING until acceptances land."
                  : "Each athlete has 7 days to respond. On a live system the roster would now read SENT per athlete and the campaign would sit in STAFFING until acceptances land."}
              </p>
              {failed.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-left" role="alert">
                  {failed.map((f) => (
                    <li
                      key={f.athleteId}
                      className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger"
                    >
                      <span className="font-semibold">
                        {athletes.find((a) => a.id === f.athleteId)?.name ?? f.athleteId}
                      </span>{" "}
                      — {f.message}
                    </li>
                  ))}
                </ul>
              )}
              {onUndo ? (
                <>
                  <button
                    type="button"
                    onClick={onUndo}
                    className="mt-4 w-full rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
                  >
                    Undo
                  </button>
                  <p className="mt-2 text-[10px] text-faint">
                    Demo actions last for this visit only — nothing is saved.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-4 w-full rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
                >
                  Back to the roster
                </button>
              )}
            </Card>
          ) : (
            <Card className="p-0">
              <div className="border-b border-line-soft bg-surface-2/40 px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
                  Send
                </p>
                <p className="mt-0.5 text-xs font-semibold tracking-tight">
                  {MATCH_BRIEF.campaign}
                </p>
                <p className="truncate text-[10px] text-muted">
                  {MATCH_BRIEF.sponsor} · {MATCH_BRIEF.code}
                </p>
              </div>
              <dl className="space-y-2.5 p-4">
                <SendRow k="Invitations" v={String(invitationCount)} />
                <SendRow
                  k="Guardian consent required"
                  v={String(s.guardianCount)}
                  tone={s.guardianCount > 0 ? "text-warn" : undefined}
                />
                <SendRow
                  k="Margin exceptions"
                  v={String(s.exceptions.length)}
                  tone={s.exceptions.length > 0 ? "text-accent" : undefined}
                />
                <SendRow k="Response deadline" v={s.deadline} />
              </dl>
              <div className="border-t border-line-soft p-4">
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={onSend}
                  data-armed={canSend && s.exceptions.length > 0}
                  className="sx-join-sheen w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink shadow-sm transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending
                    ? "Sending…"
                    : `Send ${invitationCount === 1 ? "1 invitation" : `${invitationCount} invitations`}`}
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-faint">
                  {live && sendBlocked
                    ? sendBlocked
                    : !canSend && s.exceptions.length > 0 && !ack
                    ? "Acknowledge the margin exception above to send."
                    : athletes.length === 0
                      ? "Add at least one athlete to send."
                      : "Invitations go out immediately. Offers are fixed once sent."}
                </p>
              </div>
            </Card>
          )}

          <p className="px-1 text-[10px] leading-relaxed text-faint">
            Athlete cost is BTG-internal. It is not shown on any sponsor surface.
          </p>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

function Total({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "below" | "thin" | "healthy";
}) {
  const toneCls =
    tone === "below" ? "text-accent" : tone === "thin" ? "text-warn" : tone === "healthy" ? "text-success" : "text-text";
  return (
    <Card className="p-3.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">
        {k}
      </dt>
      <dd className={cx("mt-1 text-base font-semibold tabular-nums tracking-tight", toneCls)}>
        {v}
      </dd>
      {sub && <dd className="text-[10px] text-faint">{sub}</dd>}
    </Card>
  );
}

function SendRow({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className={cx("text-[11px] font-semibold tabular-nums", tone ?? "text-text")}>
        {v}
      </dd>
    </div>
  );
}
