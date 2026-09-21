"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, BlockedNotice, Card } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import { ScoreRing } from "@/components/score-ring";
import { SearchInput, Dropdown, FilterChip } from "@/components/filter-kit";
import { scoreBand } from "@/lib/applications-ui";
import { money } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   CampaignBuilder — the admin "Create Campaign" flow, rebuilt as one client
   island (2026-09-15 redesign of §9 screen 8 / §13's managed workflow).

   The old page was static: read-only display boxes, a decorative stepper, and
   checkboxes that changed nothing. This turns it into a guided five-step
   builder with a live projection rail that recomputes reach, budget and
   roster on every change — the same island idiom the applications desk uses
   (URL-synced state, animated score rings, local demo actions with undo).

   §26 still shows a category-conflicting athlete as *blocked* rather than
   hiding them, and §08's invitation block is surfaced honestly at launch.
   Everything is local-to-visit; nothing is persisted.
   -------------------------------------------------------------------------- */

/* -------- shapes the server page hands in (all from lib/fixtures) -------- */

type Inventory = {
  id: string;
  name: string;
  property: string;
  estViews: string;
  cpm: number;
  price: number; // cents
  state: string;
  platforms: string[];
};

type Athlete = {
  slug: string;
  name: string;
  sport: string;
  geo: string;
  tier: string;
  score: number;
  conflict: string | null;
  selected: boolean;
};

type Draft = {
  name: string;
  dates: string;
  platforms: { label: string; on: boolean }[];
};

type Reward = {
  sponsor: string;
  offer: string;
  redemptionType: string;
  expiration: string;
  headline: string;
  subhead: string;
  footer: string;
};

/* -------------------------------- helpers -------------------------------- */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const fmtCompact = (n: number) => compact.format(n);

/** "1.2M" / "750K" → an integer view ceiling for the projection meter. */
function parseViews(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([MK]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  return Math.round(n * (u === "M" ? 1e6 : u === "K" ? 1e3 : 1));
}

const dollars = (cents: number) => Math.round(cents / 100);
/** CPM math: budget dollars ÷ CPM × 1000 impressions. */
const reachFor = (cents: number, cpm: number) =>
  cpm > 0 ? Math.round((dollars(cents) / cpm) * 1000) : 0;

const EXPIRATIONS = ["30 Days", "60 Days", "90 Days", "No expiry"];

/* --------------------------- animated number ----------------------------
   Tweens its text to the target whenever `value` changes — the projection
   rail's "wow". Writes via a ref (textContent) rather than setState, the same
   way count-up.tsx sidesteps this repo's set-state-in-effect rule. Honors
   reduced-motion by snapping to the value. */
function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = current.current;
    const to = value;
    if (from === to) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = to;
      el.textContent = format(to);
      return;
    }
    const t0 = performance.now();
    const dur = 480;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      el.textContent = format(Math.round(v));
      if (p < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        current.current = to;
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, format]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
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

/* --------------------------- small form pieces --------------------------- */

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

const inputCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-text outline-none transition-colors focus-visible:border-admin/50 focus-visible:ring-2 focus-visible:ring-admin/25";

/* ============================== component ================================ */

export function CampaignBuilder({
  inventory,
  athletes,
  steps,
  draft,
  reward,
  initialStep = 0,
  syncUrl = true,
  onCancel,
}: {
  inventory: Inventory[];
  athletes: Athlete[];
  steps: string[];
  draft: Draft;
  reward: Reward;
  initialStep?: number;
  /** Write the current step to ?step= — off when the builder runs in a modal. */
  syncUrl?: boolean;
  /** When set, "Cancel" calls this (e.g. close the modal) instead of leaving. */
  onCancel?: () => void;
}) {
  const lastStep = steps.length - 1;
  const clampStep = (n: number) => Math.max(0, Math.min(lastStep, n));

  const [step, setStep] = useState(() => clampStep(initialStep));
  const [furthest, setFurthest] = useState(() => clampStep(initialStep));

  /* --- draft state --- */
  const [invId, setInvId] = useState(inventory[0]?.id ?? "");
  const inv = useMemo(
    () => inventory.find((x) => x.id === invId) ?? inventory[0],
    [inventory, invId],
  );

  const [name, setName] = useState(draft.name);
  const [dates, setDates] = useState(draft.dates);
  const [budget, setBudget] = useState(inv?.price ?? 0); // cents
  const [platforms, setPlatforms] = useState<Set<string>>(
    () => new Set(draft.platforms.filter((p) => p.on).map((p) => p.label)),
  );

  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(athletes.filter((a) => a.selected && !a.conflict).map((a) => a.slug)),
  );

  const [rewardOn, setRewardOn] = useState(false);
  const [offer, setOffer] = useState(reward.offer);
  const [expiration, setExpiration] = useState(reward.expiration);

  const [launched, setLaunched] = useState(false);

  /* Athlete filters (step 3). */
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("");
  const [tier, setTier] = useState("");

  /* Selecting a package resets the budget to its list price and seeds its
     platforms — the projection should reflect the thing you just chose. */
  const chooseInventory = (id: string) => {
    const next = inventory.find((x) => x.id === id);
    if (!next) return;
    setInvId(id);
    setBudget(next.price);
  };

  /* --- derived projection --- */
  const cpm = inv?.cpm ?? 1;
  const reach = reachFor(budget, cpm);
  const target = parseViews(inv?.estViews ?? "0");
  const reachPct = target > 0 ? Math.min(100, Math.round((reach / target) * 100)) : 0;
  const overTarget = target > 0 && reach > target;
  const roster = picked.size;

  /* --- URL sync: only the step, preserving any other params (e.g. from). --- */
  useEffect(() => {
    if (!syncUrl) return;
    const p = new URLSearchParams(window.location.search);
    if (step > 0) p.set("step", String(step + 1));
    else p.delete("step");
    const qs = p.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", next);
    }
  }, [step, syncUrl]);

  const go = (n: number) => {
    const c = clampStep(n);
    setStep(c);
    setFurthest((f) => Math.max(f, c));
  };

  /* Step 3 is the one gate: the managed loop needs at least one athlete. */
  const canAdvance = step !== 2 || roster > 0;

  const togglePlatform = (label: string) =>
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const togglePick = (a: Athlete) => {
    if (a.conflict) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(a.slug)) next.delete(a.slug);
      else next.add(a.slug);
      return next;
    });
  };

  const eligible = useMemo(() => athletes.filter((a) => !a.conflict), [athletes]);
  const allEligiblePicked = eligible.length > 0 && eligible.every((a) => picked.has(a.slug));
  const toggleAll = () =>
    setPicked(() =>
      allEligiblePicked ? new Set() : new Set(eligible.map((a) => a.slug)),
    );

  const sportOptions = useMemo(
    () => [...new Set(athletes.map((a) => a.sport))].sort(),
    [athletes],
  );
  const tierOptions = useMemo(
    () => [...new Set(athletes.map((a) => a.tier))].sort(),
    [athletes],
  );

  const needle = q.trim().toLowerCase();
  const shownAthletes = useMemo(
    () =>
      athletes.filter(
        (a) =>
          (!sport || a.sport === sport) &&
          (!tier || a.tier === tier) &&
          (!needle ||
            [a.name, a.sport, a.geo].join(" ").toLowerCase().includes(needle)),
      ),
    [athletes, sport, tier, needle],
  );
  const athletesFiltered = Boolean(needle || sport || tier);
  const clearAthleteFilters = () => {
    setQ("");
    setSport("");
    setTier("");
  };

  const pickedList = athletes.filter((a) => picked.has(a.slug));
  const blockedCount = athletes.filter((a) => a.conflict).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      {/* ============================ canvas ============================ */}
      <div className="min-w-0 space-y-6">
        <Card className="p-4">
          <Stepper steps={steps} current={step} furthest={furthest} onJump={go} />
        </Card>

        {/* Re-key on step so the fade-up replays as you move through. */}
        <div key={step} className="sx-animate space-y-6">
          {step === 0 && (
            <StepInventory
              inventory={inventory}
              selectedId={invId}
              onSelect={chooseInventory}
            />
          )}

          {step === 1 && (
            <StepDetails
              name={name}
              onName={setName}
              dates={dates}
              onDates={setDates}
              budget={budget}
              onBudget={setBudget}
              inv={inv}
              reach={reach}
              platforms={platforms}
              onTogglePlatform={togglePlatform}
              draftPlatforms={draft.platforms.map((p) => p.label)}
            />
          )}

          {step === 2 && (
            <StepAthletes
              shown={shownAthletes}
              picked={picked}
              onToggle={togglePick}
              q={q}
              onQ={setQ}
              sport={sport}
              onSport={setSport}
              tier={tier}
              onTier={setTier}
              sportOptions={sportOptions}
              tierOptions={tierOptions}
              filtered={athletesFiltered}
              onClear={clearAthleteFilters}
              total={athletes.length}
              rosterCount={roster}
              allPicked={allEligiblePicked}
              onToggleAll={toggleAll}
            />
          )}

          {step === 3 && (
            <StepRewards
              on={rewardOn}
              onToggle={setRewardOn}
              reward={reward}
              offer={offer}
              onOffer={setOffer}
              expiration={expiration}
              onExpiration={setExpiration}
            />
          )}

          {step === 4 && (
            <StepReview
              inv={inv}
              name={name}
              dates={dates}
              budget={budget}
              reach={reach}
              platforms={[...platforms]}
              pickedList={pickedList}
              blockedCount={blockedCount}
              rewardOn={rewardOn}
              offer={offer}
              expiration={expiration}
              launched={launched}
            />
          )}

          {/* ---------------------------- nav bar ---------------------------- */}
          <div className="flex flex-wrap items-center gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-text"
              >
                Cancel
              </button>
            ) : (
              <Link
                href="/admin"
                className="rounded-lg px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-text"
              >
                Cancel
              </Link>
            )}
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
              {step < lastStep ? (
                <span className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    disabled={!canAdvance}
                    onClick={() => go(step + 1)}
                    className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next: {steps[step + 1]} →
                  </button>
                  {!canAdvance && (
                    <span className="text-[10px] text-warn">
                      Pick at least one athlete to continue.
                    </span>
                  )}
                </span>
              ) : launched ? (
                <button
                  type="button"
                  onClick={() => setLaunched(false)}
                  className="rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2"
                >
                  Undo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setLaunched(true)}
                  className="rounded-lg bg-primary px-5 py-2.5 text-xs font-medium text-cta-ink shadow-sm transition-colors hover:bg-primary-soft"
                >
                  Launch campaign →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================== rail ============================== */}
      <aside className="space-y-4 xl:sticky xl:top-6">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line-soft bg-surface-2/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
              Live projection
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold tracking-tight">
              {inv?.name ?? "—"}
            </p>
            <p className="truncate text-[10px] text-muted">{inv?.property}</p>
          </div>

          <div className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Estimated reach
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight text-text">
                <AnimatedNumber value={reach} format={fmtCompact} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                views
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={[
                  "h-full rounded-full transition-[width] duration-500 ease-out",
                  overTarget ? "bg-accent" : "bg-primary",
                ].join(" ")}
                style={{ width: `${Math.max(3, reachPct)}%` }}
              />
            </div>
            <p className="mt-1.5 flex items-center justify-between text-[10px] text-faint">
              <span>
                {overTarget
                  ? "Above the package estimate"
                  : `${reachPct}% of ${inv?.estViews ?? "—"} estimate`}
              </span>
              <span className="rounded-full bg-surface-2 px-1.5 py-px font-semibold text-muted">
                est
              </span>
            </p>

            <dl className="mt-4 space-y-2.5 border-t border-line-soft pt-4">
              <RailRow k="Budget" v={money(budget)} />
              <RailRow k="CPM" v={`$${cpm}`} />
              <RailRow
                k="Athletes"
                v={
                  <span className={roster === 0 ? "text-warn" : undefined}>
                    {roster} of {athletes.length}
                  </span>
                }
              />
              <RailRow k="Platforms" v={String(platforms.size)} />
              <RailRow k="Reward" v={rewardOn ? offer : "None"} />
            </dl>
          </div>
        </Card>

        <BlockedNotice>
          Sending invitations creates Campaign Orders, and acceptance stays
          blocked until counsel approves the Campaign Order template (guide
          §08). The builder can be finished; the invitations cannot go out yet.
        </BlockedNotice>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Conflict check</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            §26 requires category conflicts to be checked before an invitation
            is sent.{" "}
            {blockedCount > 0
              ? `${blockedCount} athlete on a competing deal is shown blocked — not silently filtered — so you know why the roster is short.`
              : "No conflicts on the current roster."}
          </p>
        </Card>
      </aside>
    </div>
  );
}

function RailRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="text-[11px] font-medium tabular-nums text-text">{v}</dd>
    </div>
  );
}

/* ========================= step 1 · inventory ========================= */

function StepInventory({
  inventory,
  selectedId,
  onSelect,
}: {
  inventory: Inventory[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <StepHead
        n={1}
        title="Choose your inventory"
        blurb="Pick the sponsorship package this campaign runs against. It sets the CPM and a suggested budget — you can fine-tune both next."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {inventory.map((x) => {
          const active = x.id === selectedId;
          const booked = x.state === "BOOKED" || x.state === "SOLD_OUT";
          return (
            <button
              key={x.id}
              type="button"
              disabled={booked}
              onClick={() => onSelect(x.id)}
              aria-pressed={active}
              className={[
                "group relative rounded-xl border p-4 text-left transition-all",
                booked
                  ? "cursor-not-allowed border-line bg-surface opacity-55"
                  : active
                    ? "border-primary/60 bg-primary/5 shadow-sm"
                    : "border-line bg-surface hover:border-primary/30 hover:bg-surface-2/40",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute right-3 top-3 grid size-5 place-items-center rounded-full border text-[10px] font-bold transition-colors",
                  active
                    ? "border-primary bg-primary text-cta-ink"
                    : "border-line text-transparent group-hover:border-primary/40",
                ].join(" ")}
                aria-hidden="true"
              >
                ✓
              </span>
              <p className="pr-6 text-xs font-semibold tracking-tight">{x.name}</p>
              <p className="mt-0.5 text-[10px] text-muted">{x.property}</p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight tabular-nums">
                  {x.estViews}
                </span>
                <span className="text-[10px] text-faint">est. views · ${x.cpm} CPM</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {x.platforms.map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted"
                  >
                    {p}
                  </span>
                ))}
                {booked && <Badge tone="warn">Booked</Badge>}
              </div>
              <p className="mt-3 text-[11px] font-medium tabular-nums text-muted">
                {money(x.price)}
                <span className="ml-1 text-[10px] font-normal text-faint">
                  list price
                </span>
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ========================== step 2 · details ========================== */

function StepDetails({
  name,
  onName,
  dates,
  onDates,
  budget,
  onBudget,
  inv,
  reach,
  platforms,
  onTogglePlatform,
  draftPlatforms,
}: {
  name: string;
  onName: (v: string) => void;
  dates: string;
  onDates: (v: string) => void;
  budget: number;
  onBudget: (cents: number) => void;
  inv: Inventory;
  reach: number;
  platforms: Set<string>;
  onTogglePlatform: (label: string) => void;
  draftPlatforms: string[];
}) {
  const minD = 5_000;
  const maxD = Math.max(minD * 2, Math.round((inv.price / 100) * 1.5));
  const stepD = 1_000;
  const value = dollars(budget);

  return (
    <section className="space-y-5">
      <StepHead
        n={2}
        title="Campaign details"
        blurb="Name it, set the flight dates, and slide the budget — the projection on the right updates as you go."
      />
      <Card className="space-y-5">
        <Labelled label="Campaign name">
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Player of the Week — Under Armour"
          />
        </Labelled>

        <Labelled label="Flight dates">
          <input
            value={dates}
            onChange={(e) => onDates(e.target.value)}
            className={inputCls}
            placeholder="Jun 1, 2026 – Nov 30, 2026"
          />
        </Labelled>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="text-[11px] font-medium text-muted">Budget</label>
            <span className="text-sm font-semibold tabular-nums tracking-tight">
              {money(budget)}
            </span>
          </div>
          <input
            type="range"
            min={minD}
            max={maxD}
            step={stepD}
            value={value}
            onChange={(e) => onBudget(Number(e.target.value) * 100)}
            aria-label="Campaign budget"
            className="mt-2 w-full accent-[var(--sx-primary)]"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-faint">
            <span>${minD.toLocaleString()}</span>
            <span className="text-muted">
              ≈ {fmtCompact(reach)} views at ${inv.cpm} CPM
            </span>
            <span>${maxD.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted">
            Platforms
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {draftPlatforms.map((p) => {
              const on = platforms.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onTogglePlatform(p)}
                  aria-pressed={on}
                  className={[
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                    on
                      ? "border-primary/40 bg-primary/10 text-text"
                      : "border-line text-muted hover:text-text",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid size-3.5 place-items-center rounded text-[8px] font-bold",
                      on ? "bg-primary text-cta-ink" : "bg-surface-2 text-transparent",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </section>
  );
}

/* ========================= step 3 · athletes ========================= */

function StepAthletes({
  shown,
  picked,
  onToggle,
  q,
  onQ,
  sport,
  onSport,
  tier,
  onTier,
  sportOptions,
  tierOptions,
  filtered,
  onClear,
  total,
  rosterCount,
  allPicked,
  onToggleAll,
}: {
  shown: Athlete[];
  picked: Set<string>;
  onToggle: (a: Athlete) => void;
  q: string;
  onQ: (v: string) => void;
  sport: string;
  onSport: (v: string) => void;
  tier: string;
  onTier: (v: string) => void;
  sportOptions: string[];
  tierOptions: string[];
  filtered: boolean;
  onClear: () => void;
  total: number;
  rosterCount: number;
  allPicked: boolean;
  onToggleAll: () => void;
}) {
  return (
    <section>
      <StepHead
        n={3}
        title="Match athletes"
        blurb="Filter the eligible network and build your roster. Each ring is the Content Value Score — a quick read of fit."
        action={
          <button
            type="button"
            onClick={onToggleAll}
            className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            {allPicked ? "Clear selection" : "Select all eligible"}
          </button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={onQ}
          placeholder="Search name, sport or area…"
          label="Search athletes"
          tone="admin"
        />
        <Dropdown
          label="Filter by sport"
          allLabel="All sports"
          value={sport}
          onChange={onSport}
          options={sportOptions.map((s) => ({ value: s, label: s }))}
          tone="admin"
        />
        <Dropdown
          label="Filter by tier"
          allLabel="All tiers"
          value={tier}
          onChange={onTier}
          options={tierOptions.map((t) => ({ value: t, label: t }))}
          tone="admin"
        />
        <span className="ml-auto text-[11px] font-medium text-muted">
          {rosterCount} selected
        </span>
      </div>

      {filtered && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {q.trim() && (
            <FilterChip tone="admin" label="Remove search" onClear={() => onQ("")}>
              &ldquo;{q.trim()}&rdquo;
            </FilterChip>
          )}
          {sport && (
            <FilterChip tone="admin" label="Remove sport filter" onClear={() => onSport("")}>
              {sport}
            </FilterChip>
          )}
          {tier && (
            <FilterChip tone="admin" label="Remove tier filter" onClear={() => onTier("")}>
              {tier}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-muted transition-colors hover:text-danger"
          >
            Clear all
          </button>
          <span className="ml-auto text-xs text-muted">
            {shown.length} of {total}
          </span>
        </div>
      )}

      {shown.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-sm font-medium">Nothing matches these filters</p>
          <p className="mt-1 text-xs text-muted">
            Try a name, a sport like “Soccer”, or a different tier.
          </p>
          <button
            type="button"
            onClick={onClear}
            className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
          >
            Clear all filters
          </button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((a) => (
            <AthleteCard
              key={a.slug}
              athlete={a}
              selected={picked.has(a.slug)}
              onToggle={() => onToggle(a)}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-faint">
        Score is the Content Value Score (§14) — engagement, content quality,
        audience, reliability, geography, fit and sponsor performance.
        Rules-based in Phase 1; algorithmic scoring is a Phase 3 job.
      </p>
    </section>
  );
}

function AthleteCard({
  athlete: a,
  selected,
  onToggle,
}: {
  athlete: Athlete;
  selected: boolean;
  onToggle: () => void;
}) {
  const blocked = Boolean(a.conflict);
  const band = scoreBand(a.score);
  return (
    <div
      className={[
        "relative rounded-xl border p-4 transition-all",
        blocked
          ? "border-danger/25 bg-danger/5"
          : selected
            ? "border-primary/60 bg-primary/5 shadow-sm"
            : "border-line bg-surface hover:border-primary/30",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <ScoreRing value={a.score} size={48} strokeWidth={4} textCls="text-xs" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Monogram
              text={initials(a.name)}
              shape="circle"
              tone={blocked ? "neutral" : selected ? "primary" : "accent"}
              className="size-6 text-[9px]"
            />
            <p className="min-w-0 truncate text-xs font-semibold tracking-tight">
              {a.name}
            </p>
          </div>
          <p className="mt-1 truncate text-[11px] text-muted">
            {a.sport} · {a.geo}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="primary">{a.tier}</Badge>
            <span className="text-[10px] font-medium text-faint">{band.label}</span>
          </div>
        </div>
      </div>

      {blocked ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/25 bg-surface/60 px-2.5 py-2">
          <Badge tone="danger">Blocked</Badge>
          <span className="min-w-0 flex-1 text-[10px] leading-tight text-danger">
            {a.conflict}
          </span>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={selected}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium transition-colors",
              selected
                ? "bg-primary/15 text-primary-soft hover:bg-primary/20"
                : "border border-line text-muted hover:bg-surface-2 hover:text-text",
            ].join(" ")}
          >
            <span
              className={[
                "grid size-3.5 place-items-center rounded-full text-[8px] font-bold",
                selected ? "bg-primary text-cta-ink" : "border border-line",
              ].join(" ")}
              aria-hidden="true"
            >
              {selected ? "✓" : "+"}
            </span>
            {selected ? "Invited" : "Add to roster"}
          </button>
          <Link
            href={`/athletes/${a.slug}?from=builder`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-line px-2.5 py-2 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
            title="View public profile"
          >
            ↗
          </Link>
        </div>
      )}
    </div>
  );
}

/* ========================== step 4 · rewards ========================== */

function StepRewards({
  on,
  onToggle,
  reward,
  offer,
  onOffer,
  expiration,
  onExpiration,
}: {
  on: boolean;
  onToggle: (v: boolean) => void;
  reward: Reward;
  offer: string;
  onOffer: (v: string) => void;
  expiration: string;
  onExpiration: (v: string) => void;
}) {
  return (
    <section className="space-y-5">
      <StepHead
        n={4}
        title="Attach a fan reward"
        blurb="Optional. A QR reward fans redeem at events — you can skip it now and add one later from the Reward Creator."
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-tight">Fan reward</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {on ? "A reward is attached to this campaign." : "No reward — this step is optional."}
            </p>
          </div>
          <Toggle on={on} onToggle={() => onToggle(!on)} label="Attach a fan reward" />
        </div>

        {on && (
          <div className="sx-animate grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <Labelled label="Offer" hint="Shown on the fan's redemption card.">
                <input
                  value={offer}
                  onChange={(e) => onOffer(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 20% Off"
                />
              </Labelled>
              <Labelled label="Expiration">
                <div className="flex flex-wrap gap-2">
                  {EXPIRATIONS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => onExpiration(x)}
                      aria-pressed={x === expiration}
                      className={[
                        "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                        x === expiration
                          ? "border-primary/40 bg-primary/10 text-text"
                          : "border-line text-muted hover:text-text",
                      ].join(" ")}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </Labelled>
              <Link
                href="/admin/rewards?new=1"
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent transition-colors hover:text-accent-soft"
              >
                Design the full reward in Reward Creator ↗
              </Link>
            </div>

            {/* coupon preview */}
            <RewardPreview
              headline={offer ? offer.toUpperCase() : reward.headline}
              subhead={reward.subhead}
              footer={reward.footer}
              expiration={expiration}
            />
          </div>
        )}
      </Card>
    </section>
  );
}

function RewardPreview({
  headline,
  subhead,
  footer,
  expiration,
}: {
  headline: string;
  subhead: string;
  footer: string;
  expiration: string;
}) {
  return (
    <div className="w-full self-start rounded-xl border border-dashed border-primary/40 bg-gradient-to-br from-primary/10 to-accent/5 p-5 text-center sm:w-52">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        Fan reward
      </p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-text">{headline}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
        {subhead}
      </p>
      <div className="mx-auto my-4 grid size-16 place-items-center rounded-lg bg-text/90 text-[8px] font-bold text-bg">
        QR
      </div>
      <p className="text-[10px] text-faint">{footer}</p>
      <p className="mt-1 text-[10px] text-muted">Expires: {expiration}</p>
    </div>
  );
}

function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={[
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-surface-2",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 grid size-5 place-items-center rounded-full bg-bg shadow transition-all",
          on ? "left-[1.375rem]" : "left-0.5",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
  );
}

/* ======================= step 5 · review & launch ======================= */

function StepReview({
  inv,
  name,
  dates,
  budget,
  reach,
  platforms,
  pickedList,
  blockedCount,
  rewardOn,
  offer,
  expiration,
  launched,
}: {
  inv: Inventory;
  name: string;
  dates: string;
  budget: number;
  reach: number;
  platforms: string[];
  pickedList: Athlete[];
  blockedCount: number;
  rewardOn: boolean;
  offer: string;
  expiration: string;
  launched: boolean;
}) {
  return (
    <section className="space-y-5">
      <StepHead
        n={5}
        title="Review & launch"
        blurb="One last look. Nothing is sent until counsel clears the Campaign Order template — this assembles the draft."
      />

      {launched && (
        <div className="sx-pop flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/8 p-4">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/20 text-accent"
            aria-hidden="true"
          >
            🎉
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-text">
              Draft assembled — {name || "Untitled campaign"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              On a live system this would create the Campaign Orders and move
              the campaign to <span className="font-medium text-text">STAFFING</span>.
              Invitations stay held until counsel approves the template (§08).
              This is a demo — nothing was saved.
            </p>
          </div>
        </div>
      )}

      <Card className="divide-y divide-line-soft p-0">
        <ReviewRow k="Inventory" v={`${inv.name} · ${inv.property}`} />
        <ReviewRow k="Campaign" v={name || "—"} />
        <ReviewRow k="Flight" v={dates || "—"} />
        <ReviewRow
          k="Budget"
          v={
            <span className="tabular-nums">
              {money(budget)}{" "}
              <span className="text-faint">· ≈ {fmtCompact(reach)} est. views</span>
            </span>
          }
        />
        <ReviewRow
          k="Platforms"
          v={platforms.length ? platforms.join(", ") : "None selected"}
        />
        <ReviewRow
          k="Reward"
          v={rewardOn ? `${offer} · expires ${expiration}` : "None"}
        />
      </Card>

      {/* roster */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold tracking-tight">
            Roster{" "}
            <span className="text-muted">({pickedList.length})</span>
          </h3>
          {blockedCount > 0 && (
            <span className="text-[11px] text-danger">
              {blockedCount} blocked by conflict check
            </span>
          )}
        </div>
        {pickedList.length === 0 ? (
          <Card className="py-6 text-center text-xs text-muted">
            No athletes selected yet — go back to step 3 to build the roster.
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {pickedList.map((a) => (
                <li key={a.slug} className="flex items-center gap-3 px-4 py-3">
                  <ScoreRing value={a.score} size={34} strokeWidth={3.5} textCls="text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    <p className="truncate text-[10px] text-muted">
                      {a.sport} · {a.geo}
                    </p>
                  </div>
                  <Badge tone="primary">{a.tier}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  );
}

function ReviewRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">
        {k}
      </dt>
      <dd className="text-xs font-medium text-text">{v}</dd>
    </div>
  );
}

/* ------------------------------- step head ------------------------------- */

function StepHead({
  n,
  title,
  blurb,
  action,
}: {
  n: number;
  title: string;
  blurb: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
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
      {action}
    </div>
  );
}
