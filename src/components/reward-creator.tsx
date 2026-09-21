"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import { ScoreRing } from "@/components/score-ring";

/* --------------------------------------------------------------------------
   RewardCreator — the QR / Reward Creator (§9 screen 10, §16) rebuilt as a
   guided three-step wizard (2026-09-16), meant to run inside the rewards
   desk's modal rather than as its own page.

   The old page was one static form with a frozen preview. This one keeps a
   live fan-facing preview in a phone frame the whole way through: every
   keystroke re-renders the exact card the fan will see, and the decorative QR
   re-patterns from a hash of the current design, so cause and effect are
   never out of sight — that is the learning curve doing the teaching.

   §16 honesty is kept, not decorated away: sweepstakes stays blocked pending
   legal, each athlete gets their own opaque token (never the record id),
   single-use is a partial unique index on RewardEvent, and the fan page is a
   no-JS route. Everything here is local-to-visit; `onCreate` hands the draft
   up to the desk, which owns the list.
   -------------------------------------------------------------------------- */

export type RewardTypeOption = {
  value: string;
  blurb: string;
  blocked?: boolean;
};

export type RewardAthlete = {
  slug: string;
  name: string;
  sport: string;
  geo: string;
  tier: string;
  score: number;
  conflict: string | null;
};

export type RewardDraftIn = {
  sponsor: string;
  offer: string;
  redemptionType: string;
  expiration: string;
  terms: string;
  headline: string;
  subhead: string;
  footer: string;
};

/** What the desk needs to append a row when the wizard finishes. */
export type CreatedReward = {
  offer: string;
  sponsor: string;
  type: string;
  expiration: string;
  athletes: number;
};

const SPONSORS = ["Under Armour", "Silver Spring Grill", "Kigali Sports Co."];
const OFFER_IDEAS = ["20% Off", "$5 Off Any Meal", "Free Drink", "BOGO"];
const EXPIRATIONS = ["30 Days", "60 Days", "90 Days", "End of campaign"];

/* Preview themes — static class strings so Tailwind keeps them. */
const THEMES = [
  { name: "Court", frame: "from-primary/15 to-accent/10", ink: "text-primary" },
  { name: "Ember", frame: "from-accent/15 to-primary/5", ink: "text-accent" },
  { name: "Slate", frame: "from-surface-2 to-surface", ink: "text-text" },
] as const;

/* ------------------------- deterministic pseudo-ids ----------------------
   Hash-seeded so server and client render identically (no hydration drift)
   and the same design always draws the same QR — it visibly "regenerates"
   as the fan card changes. A real token and QR are generated into R2 on
   save; these are stand-ins. */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Opaque per-athlete token stand-in — §16: never the record id. */
export function tokenFor(slug: string, offer: string): string {
  return `tok_${hash(`${slug}·${offer}`).toString(36).slice(0, 7).padEnd(7, "0")}`;
}

function qrCells(seed: string): boolean[] {
  let h = hash(seed) || 1;
  const cells: boolean[] = [];
  for (let i = 0; i < 81; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    cells.push(h % 5 < 3);
  }
  return cells;
}

/** 9×9 grid with the three finder squares real QRs have. */
export function QrPattern({ seed, className }: { seed: string; className?: string }) {
  const cells = qrCells(seed);
  const finder = (r: number, c: number) =>
    ((r < 3 && c < 3) || (r < 3 && c > 5) || (r > 5 && c < 3)) &&
    !(r === 1 && c === 1) &&
    !(r === 1 && c === 7) &&
    !(r === 7 && c === 1);
  return (
    <div
      className={[
        "grid grid-cols-9 gap-[2px] rounded-md bg-white p-1.5",
        className ?? "size-24",
      ].join(" ")}
      aria-hidden="true"
    >
      {cells.map((on, i) => {
        const r = Math.floor(i / 9);
        const c = i % 9;
        return (
          <span
            key={i}
            className={[
              "rounded-[1px] transition-colors duration-300",
              finder(r, c) || on ? "bg-black" : "bg-white",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------ form pieces ------------------------------ */

const inputCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-text outline-none transition-colors placeholder:text-faint focus-visible:border-admin/50 focus-visible:ring-2 focus-visible:ring-admin/25";

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={[
        "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
        on
          ? "border-primary/40 bg-primary/10 text-text"
          : "border-line text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function StepHead({
  n,
  title,
  blurb,
}: {
  n: number;
  title: string;
  blurb: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-admin/15 text-[11px] font-bold text-admin">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 max-w-prose text-[11px] leading-relaxed text-muted">
          {blurb}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- stepper ------------------------------- */

function Stepper({
  steps,
  current,
  furthest,
  onJump,
}: {
  steps: string[];
  current: number;
  furthest: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-3">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= furthest;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              className={[
                "flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors",
                reachable ? "cursor-pointer hover:bg-surface-2" : "cursor-default",
              ].join(" ")}
            >
              <span
                className={[
                  "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-primary text-cta-ink shadow-sm"
                    : done
                      ? "bg-accent/15 text-accent"
                      : "bg-surface-2 text-faint",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "text-[11px] font-medium whitespace-nowrap",
                  active ? "text-text" : done ? "text-muted" : "text-faint",
                ].join(" ")}
              >
                {s}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={[
                  "hidden h-px w-5 rounded-full transition-colors sm:block",
                  i < current ? "bg-accent/40" : "bg-line",
                ].join(" ")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ============================== component ================================ */

export function RewardCreator({
  steps,
  draft,
  types,
  athletes,
  onCancel,
  onCreate,
}: {
  steps: string[];
  draft: RewardDraftIn;
  types: readonly RewardTypeOption[];
  athletes: RewardAthlete[];
  onCancel: () => void;
  onCreate: (r: CreatedReward) => void;
}) {
  const lastStep = steps.length - 1;
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);

  /* --- step 1 · reward details --- */
  const [sponsor, setSponsor] = useState(draft.sponsor);
  const [offer, setOffer] = useState(draft.offer);
  const [type, setType] = useState(draft.redemptionType);
  const [expiration, setExpiration] = useState(draft.expiration);
  const [terms, setTerms] = useState(draft.terms ?? "");

  /* --- step 2 · design --- */
  const [subhead, setSubhead] = useState(draft.subhead);
  const [footer, setFooter] = useState(draft.footer);
  const [theme, setTheme] = useState(0);

  /* --- step 3 · distribution --- */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const headline = offer.trim() ? offer.trim().toUpperCase() : draft.headline;
  const eligible = useMemo(() => athletes.filter((a) => !a.conflict), [athletes]);
  const blockedCount = athletes.length - eligible.length;

  const go = (n: number) => {
    const c = Math.max(0, Math.min(lastStep, n));
    setStep(c);
    setFurthest((f) => Math.max(f, c));
  };

  const togglePick = (a: RewardAthlete) => {
    if (a.conflict) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(a.slug)) next.delete(a.slug);
      else next.add(a.slug);
      return next;
    });
  };
  const allPicked = eligible.length > 0 && eligible.every((a) => picked.has(a.slug));
  const toggleAll = () =>
    setPicked(() => (allPicked ? new Set() : new Set(eligible.map((a) => a.slug))));

  /* Gates, one per step, each with a plain-English reason under the button. */
  const gate =
    step === 0 && !offer.trim()
      ? "Name the offer to continue."
      : step === 2 && picked.size === 0
        ? "Pick at least one athlete — §16 attribution needs a token holder."
        : null;

  const create = () =>
    onCreate({
      offer: offer.trim(),
      sponsor,
      type,
      expiration,
      athletes: picked.size,
    });

  const th = THEMES[theme];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
      {/* ============================ canvas ============================ */}
      <div className="min-w-0 space-y-5">
        <Card className="p-4">
          <Stepper steps={steps} current={step} furthest={furthest} onJump={go} />
        </Card>

        {/* Re-key on step so the fade-up replays as you move through. */}
        <div key={step} className="sx-animate space-y-5">
          {step === 0 && (
            <section className="space-y-4">
              <StepHead
                n={1}
                title="What is the reward?"
                blurb="Sponsor, offer and how a fan redeems it. The card on the right is what the fan will see — it updates as you type."
              />
              <Card className="space-y-4">
                <Labelled label="Sponsor">
                  <div className="flex flex-wrap gap-2">
                    {SPONSORS.map((s) => (
                      <Chip key={s} on={s === sponsor} onClick={() => setSponsor(s)}>
                        {s}
                      </Chip>
                    ))}
                  </div>
                </Labelled>

                <Labelled
                  label="Offer"
                  hint="Short and loud — it becomes the headline of the fan card."
                >
                  <input
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. 20% Off"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OFFER_IDEAS.map((o) => (
                      <Chip key={o} on={o === offer} onClick={() => setOffer(o)}>
                        {o}
                      </Chip>
                    ))}
                  </div>
                </Labelled>

                <Labelled label="Redemption type">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {types.map((t) => {
                      const active = t.value === type;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          disabled={t.blocked}
                          onClick={() => setType(t.value)}
                          aria-pressed={active}
                          className={[
                            "rounded-xl border p-3 text-left transition-all",
                            t.blocked
                              ? "cursor-not-allowed border-line bg-surface opacity-60"
                              : active
                                ? "border-primary/60 bg-primary/5 shadow-sm"
                                : "border-line bg-surface hover:border-primary/30 hover:bg-surface-2/40",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={[
                                "grid size-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold",
                                active
                                  ? "border-primary bg-primary text-cta-ink"
                                  : "border-line text-transparent",
                              ].join(" ")}
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                            <span className="text-xs font-semibold tracking-tight">
                              {t.value}
                            </span>
                            {t.blocked && <Badge tone="warn">Needs legal</Badge>}
                          </span>
                          <span className="mt-1.5 block text-[10px] leading-relaxed text-muted">
                            {t.blurb}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Labelled>

                <Labelled label="Expiration">
                  <div className="flex flex-wrap gap-2">
                    {EXPIRATIONS.map((x) => (
                      <Chip key={x} on={x === expiration} onClick={() => setExpiration(x)}>
                        {x}
                      </Chip>
                    ))}
                  </div>
                </Labelled>

                <Labelled
                  label="Terms & conditions"
                  hint="§26 requires consent and version tracking for fan marketing — terms are versioned with the reward."
                >
                  <textarea
                    rows={3}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Add terms (optional)"
                    className={`${inputCls} resize-none`}
                  />
                </Labelled>
              </Card>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              <StepHead
                n={2}
                title="Design the fan card"
                blurb="Fine-tune the words and pick a look. The QR is decorative here — a real one is generated into R2 when the reward saves."
              />
              <Card className="space-y-4">
                <Labelled label="Headline" hint="Set by the offer — edit it on step 1.">
                  <input value={headline} disabled className={`${inputCls} opacity-70`} />
                </Labelled>
                <Labelled label="Subhead">
                  <input
                    value={subhead}
                    onChange={(e) => setSubhead(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. YOUR NEXT PURCHASE"
                  />
                </Labelled>
                <Labelled label="Footer line">
                  <input
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. BTG WIN REWARD"
                  />
                </Labelled>
                <Labelled label="Card theme">
                  <div className="flex flex-wrap gap-2">
                    {THEMES.map((t, i) => (
                      <button
                        key={t.name}
                        type="button"
                        onClick={() => setTheme(i)}
                        aria-pressed={i === theme}
                        className={[
                          "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                          i === theme
                            ? "border-primary/40 bg-primary/10 text-text"
                            : "border-line text-muted hover:text-text",
                        ].join(" ")}
                      >
                        <span
                          className={`size-3.5 rounded-full bg-gradient-to-br ${t.frame} border border-line`}
                          aria-hidden="true"
                        />
                        {t.name}
                      </button>
                    ))}
                  </div>
                </Labelled>
              </Card>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              <StepHead
                n={3}
                title="Who hands it out?"
                blurb="Each athlete gets their own opaque token and URL, so relative performance is measurable — one reward, many tokens (§16)."
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted">
                  <span className="font-semibold text-text">{picked.size}</span> of{" "}
                  {eligible.length} eligible selected
                  {blockedCount > 0 && (
                    <span className="text-danger"> · {blockedCount} blocked</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
                >
                  {allPicked ? "Clear selection" : "Select all eligible"}
                </button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {athletes.map((a) => {
                  const on = picked.has(a.slug);
                  const blocked = Boolean(a.conflict);
                  return (
                    <button
                      key={a.slug}
                      type="button"
                      disabled={blocked}
                      onClick={() => togglePick(a)}
                      aria-pressed={on}
                      className={[
                        "rounded-xl border p-3 text-left transition-all",
                        blocked
                          ? "cursor-not-allowed border-danger/25 bg-danger/5"
                          : on
                            ? "border-primary/60 bg-primary/5 shadow-sm"
                            : "border-line bg-surface hover:border-primary/30",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-2.5">
                        <ScoreRing value={a.score} size={34} strokeWidth={3.5} textCls="text-[10px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold tracking-tight">
                            {a.name}
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {a.sport} · {a.geo}
                          </span>
                        </span>
                        <span
                          className={[
                            "grid size-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold",
                            on
                              ? "border-primary bg-primary text-cta-ink"
                              : "border-line text-transparent",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      </span>
                      {blocked ? (
                        <span className="mt-2 flex items-center gap-1.5">
                          <Badge tone="danger">Blocked</Badge>
                          <span className="text-[10px] text-danger">{a.conflict}</span>
                        </span>
                      ) : (
                        on && (
                          <span className="mt-2 block truncate rounded-md bg-surface-2 px-2 py-1 font-mono text-[10px] text-muted">
                            {tokenFor(a.slug, headline)} · /r/…
                          </span>
                        )
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] leading-relaxed text-faint">
                Tokens are opaque — never the record id — and scan, landing,
                claim and redeem are four separate events, so the funnel is
                real (§16). §26 shows conflicted athletes blocked, not hidden.
              </p>
            </section>
          )}

          {/* ---------------------------- nav bar ---------------------------- */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
            <div className="ml-auto flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => go(step - 1)}
                  className="rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
                >
                  ← Back
                </button>
              )}
              <span className="flex flex-col items-end gap-1">
                {step < lastStep ? (
                  <button
                    type="button"
                    disabled={Boolean(gate)}
                    onClick={() => go(step + 1)}
                    className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next: {steps[step + 1]} →
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(gate)}
                    onClick={create}
                    className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink shadow-sm transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Create reward →
                  </button>
                )}
                {gate && <span className="text-[10px] text-warn">{gate}</span>}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================== live fan preview ======================== */}
      <aside className="space-y-3 lg:sticky lg:top-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
          Live preview · what the fan sees
        </p>
        {/* phone frame */}
        <div className="mx-auto w-full max-w-[16rem] rounded-[1.75rem] border border-line bg-surface p-2 shadow-sm">
          <div className="mx-auto mb-1.5 h-1 w-12 rounded-full bg-line" aria-hidden="true" />
          <div
            className={`rounded-[1.25rem] border border-line bg-gradient-to-br px-4 py-6 text-center ${th.frame}`}
          >
            <Monogram
              text={initials(sponsor)}
              shape="circle"
              tone="neutral"
              className="mx-auto size-9 text-[9px]"
            />
            <p className="mt-3 break-words text-2xl font-bold tracking-tight text-text">
              {headline}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
              {subhead.trim() || " "}
            </p>
            <div className="mt-4 flex justify-center">
              <QrPattern seed={`${sponsor}·${headline}·${type}`} className="size-24" />
            </div>
            <p className="mt-2 text-[10px] text-faint">Scan to Claim</p>
            <div className="mt-4 border-t border-line-soft pt-3">
              <p className={`text-[10px] font-semibold tracking-wide ${th.ink}`}>
                {footer.trim() || " "}
              </p>
              <p className="mt-0.5 text-[9px] text-faint">
                Expires: {expiration} · Powered by SponsorX
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/r/tok123"
          className="block rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
        >
          Open the fan redeem page →
        </Link>
        <p className="text-[10px] leading-relaxed text-faint">
          That page renders without JavaScript — it is hit on a phone, on venue
          wifi, once (guide §06).
        </p>
      </aside>
    </div>
  );
}
