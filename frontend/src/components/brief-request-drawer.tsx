"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import { CloseIcon, Dropdown } from "@/components/filter-kit";
import { athleteInv, money } from "@/lib/fixtures";
import { BRAND_CATEGORIES, categoryLabel } from "@/lib/brand-categories";
import type { BriefRequest } from "@/lib/brief-request";

/** A live submit (P4-FE-01). Absent in demo mode, where the drawer only
 *  shows its success state — nothing is sent. */
export type BriefSubmit = (
  r: Omit<BriefRequest, "sponsorId">,
) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

const CATEGORY_OPTIONS = BRAND_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }));

/* --------------------------------------------------------------------------
   BriefRequestDrawer — the sponsor marketplace's "Request a brief" / "Add to
   brief" flow (2026-09-15). The front door to the managed-marketplace loop
   (§9 screen 4, §13, §17): a sponsor describes what they want, BTG matches
   athletes, prices it and follows up — request, not self-service checkout.

   Frontend only. Nothing is persisted: submitting swaps the body to a success
   state and that's it. It captures exactly the CampaignBrief fields the
   blueprint names (objective, budget, timing, targeting, category — P4-BE-02),
   so when the backend lands the shape already matches.

   Drawer plumbing mirrors the applications-desk review drawer verbatim —
   portaled to <body>, Escape closes, background scroll locks, focus lands in
   the panel and returns to the trigger on close, click-away backdrop, and the
   slide-out's animationend (with a fallback timer) drives unmount. Sponsor-
   toned. Sponsor prices only — AthleteRate.amount never reaches this page.
   -------------------------------------------------------------------------- */

export type BriefSeed =
  | { kind: "package"; name: string; price: string; packageId?: string }
  | { kind: "job"; name: string; jobId: string; price: string }
  | {
      kind: "athlete";
      name: string;
      sport: string;
      jobName: string;
      sellPrice: number;
    };

/* Targeting options derive from the athlete inventory, exactly as the catalog
   filters do — one source of truth for the sport/geo/tier vocabularies. */
const distinct = (pick: (a: (typeof athleteInv)[number]) => string) =>
  [...new Set(athleteInv.map(pick))].map((v) => ({ value: v, label: v }));

const SPORT_OPTIONS = distinct((a) => a.sport);
const GEO_OPTIONS = distinct((a) => a.geo);
const TIER_OPTIONS = distinct((a) => a.tier).map((o) => ({
  value: o.value,
  label: `${o.label} tier`,
}));

const DURATION_OPTIONS = [
  { value: "2", label: "2 weeks" },
  { value: "4", label: "4 weeks" },
  { value: "8", label: "8 weeks" },
  { value: "12", label: "12 weeks" },
];

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-7"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[11px] font-medium text-muted"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none transition-colors focus:border-sponsor/50 focus-visible:ring-2 focus-visible:ring-sponsor/30";

export function BriefRequestDrawer({
  seed,
  onClose,
  submit,
}: {
  seed: BriefSeed | null;
  onClose: () => void;
  submit?: BriefSubmit;
}) {
  /* `seed` opens the drawer; a local `closing` flag keeps it mounted through
     the slide-out. `onClose` is called once the exit animation lands. */
  const [closing, setClosing] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const requestClose = () => setClosing(true);
  const onClosed = () => {
    setClosing(false);
    onClose();
  };

  useEffect(() => {
    if (!seed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [seed]);

  /* Unmount rides the slide-out's animationend; a fallback timer just past the
     0.22s exit guarantees close even if that event is lost (stale-CSS HMR). */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  if (!seed) return null;
  /* Keyed on seed identity so each open mounts a fresh <BriefForm> — clean
     slate every time, no stale objective/budget from the last request. */
  return createPortal(
    <div
      className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Request a brief"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        className={[
          closing ? "sx-backdrop-out" : "sx-backdrop",
          "absolute inset-0 cursor-default bg-black/55",
        ].join(" ")}
      />

      <div
        className={[
          closing ? "sx-drawer-out" : "sx-drawer",
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl",
        ].join(" ")}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
        <BriefForm
          seed={seed}
          closeBtnRef={closeBtnRef}
          onRequestClose={requestClose}
          submit={submit}
        />
      </div>
    </div>,
    document.body,
  );
}

function BriefForm({
  seed,
  closeBtnRef,
  onRequestClose,
  submit,
}: {
  seed: BriefSeed;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
  onRequestClose: () => void;
  submit?: BriefSubmit;
}) {
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState(
    seed.kind === "athlete" ? money(seed.sellPrice) : seed.price,
  );
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("4");
  const [sport, setSport] = useState(seed.kind === "athlete" ? seed.sport : "");
  const [geo, setGeo] = useState("");
  const [tier, setTier] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = objective.trim() !== "" && budget.trim() !== "" && !sending;

  async function send() {
    if (!submit) {
      setSubmitted(true); // demo mode: nothing is sent
      return;
    }
    setSending(true);
    setError(null);
    const out = await submit({
      objective, budget, start, durationWeeks: Number(duration), sport, geo, tier,
      category, message,
      packageId: seed.kind === "package" ? (seed.packageId ?? null) : null,
      jobName: seed.kind === "job" ? `${seed.name} (${seed.jobId})` : seed.kind === "athlete" ? seed.jobName : null,
    }).catch(() => ({ ok: false as const, error: "Couldn't reach BTG — please try again." }));
    setSending(false);
    if (out.ok) setSubmitted(true);
    else setError(out.error);
  }

  if (submitted) {
    return (
      <div className="flex flex-1 flex-col">
        <DrawerHeader seed={seed} closeBtnRef={closeBtnRef} onClose={onRequestClose} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent">
            <CheckMark />
          </div>
          <p className="mt-4 text-sm font-semibold tracking-tight">Brief received</p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
            BTG will match eligible athletes, price the campaign, run conflict
            checks and follow up. Phase 1 is managed — there&rsquo;s no
            self-service checkout (§17).
          </p>
          <button
            type="button"
            onClick={onRequestClose}
            className="mt-5 rounded-lg bg-sponsor px-5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void send();
      }}
    >
      <DrawerHeader seed={seed} closeBtnRef={closeBtnRef} onClose={onRequestClose} />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <Field label="Objective" htmlFor="brief-objective" hint="What should this campaign achieve?">
          <textarea
            id="brief-objective"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            rows={3}
            required
            placeholder="e.g. Drive foot traffic to three DMV store openings"
            className={inputCls}
          />
        </Field>

        <Field label="Budget" htmlFor="brief-budget" hint="Indicative — BTG confirms final pricing.">
          <input
            id="brief-budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            required
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="brief-start">
            <input
              id="brief-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Duration">
            <Dropdown
              label="Campaign duration"
              allLabel="Select duration"
              value={duration}
              options={DURATION_OPTIONS}
              onChange={setDuration}
              tone="sponsor"
              includeAll={false}
              block
            />
          </Field>
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line-soft p-3">
          <legend className="px-1 text-[10px] font-medium uppercase tracking-wide text-faint">
            Who to reach
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sport">
              <Dropdown
                label="Target sport"
                allLabel="Any sport"
                value={sport}
                options={SPORT_OPTIONS}
                onChange={setSport}
                tone="sponsor"
                block
              />
            </Field>
            <Field label="Tier">
              <Dropdown
                label="Target tier"
                allLabel="Any tier"
                value={tier}
                options={TIER_OPTIONS}
                onChange={setTier}
                tone="sponsor"
                block
              />
            </Field>
          </div>
          <Field label="Geography">
            <Dropdown
              label="Target geography"
              allLabel="Any geography"
              value={geo}
              options={GEO_OPTIONS}
              onChange={setGeo}
              tone="sponsor"
              block
            />
          </Field>
        </fieldset>

        <Field
          label="Your category"
          hint="So BTG can screen out competitor conflicts (§26)."
        >
          <Dropdown
            label="Your brand category"
            allLabel="Select a category"
            value={category}
            options={CATEGORY_OPTIONS}
            onChange={setCategory}
            tone="sponsor"
            block
          />
        </Field>

        <Field label="Message to BTG" htmlFor="brief-message" hint="Optional.">
          <textarea
            id="brief-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Anything else the matching team should know"
            className={inputCls}
          />
        </Field>
      </div>

      {/* pinned footer — submit stays in reach without scrolling the form */}
      <div className="shrink-0 border-t border-line-soft bg-surface p-4">
        {error && (
          <p role="alert" className="mb-2 text-[11px] text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-sponsor py-2.5 text-xs font-medium text-cta-ink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "Sending…" : "Submit brief to BTG"}
        </button>
        <p className="mt-2 text-center text-[10px] text-faint">
          A request, not a purchase — BTG matches and prices it, then follows up.
        </p>
      </div>
    </form>
  );
}

function DrawerHeader({
  seed,
  closeBtnRef,
  onClose,
}: {
  seed: BriefSeed;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line-soft p-5">
      {seed.kind === "package" ? (
        <Monogram text={initials(seed.name)} tone="primary" className="size-10 text-xs" />
      ) : (
        <Monogram
          text={initials(seed.name)}
          shape="circle"
          tone="primary"
          className="size-10 text-xs"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold tracking-tight">
            {seed.name}
          </span>
          <Badge tone={seed.kind === "athlete" ? "accent" : "primary"}>
            {seed.kind === "package" ? "Package" : seed.kind === "job" ? "NIL job" : "Requested athlete"}
          </Badge>
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {seed.kind === "athlete"
            ? `${seed.jobName} · ${money(seed.sellPrice)}`
            : `${seed.price} · request a brief`}
        </p>
      </div>
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
