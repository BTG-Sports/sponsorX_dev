"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import { CloseIcon, Dropdown } from "@/components/filter-kit";
import { DateRangePicker } from "@/components/date-range-picker";
import { athleteInv, money } from "@/lib/fixtures";
import { BRAND_CATEGORIES, categoryLabel } from "@/lib/brand-categories";
import {
  AUDIENCE_TIERS,
  CHANNEL_LABEL,
  MATCH_CHANNELS,
  TIER_LABEL,
  defaultStart,
  earliestStart,
  startDateProblem,
  stateCodesFor,
  targetingOptions,
  type BriefRequest,
  type Targeting,
} from "@/lib/brief-request";
import { athletesWaitingText, submittedMessage, targetWords, type BriefStatus, type WaitingOn } from "@/lib/brief-status";

/** A live submit (P4-FE-01). Absent in demo mode, where the drawer only
 *  shows its success state — nothing is sent. POL-FE-51: `waitingOn` is
 *  the API's one word on who the request now waits on. */
export type BriefSubmit = (
  r: Omit<BriefRequest, "sponsorId">,
) => Promise<{ ok: true; id: string; status?: BriefStatus; waitingOn?: WaitingOn } | { ok: false; error: string }>;

/** POL-FE-51 — could BTG staff this package for the sponsor's sport and
 *  area? The API's yes / no (GET /catalogue/staffing); null when it has no
 *  answer (a package no athlete staffs, or the read failed). */
export type StaffingCheck = (t: { packageId: string; sport: string; geo: string }) => Promise<boolean | null>;

const CATEGORY_OPTIONS = BRAND_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }));

/* --------------------------------------------------------------------------
   BriefRequestDrawer — the sponsor marketplace's "Request a brief" / "Add to
   brief" flow (2026-09-15). The front door to the managed-marketplace loop
   (§9 screen 4, §13, §17): a sponsor describes what they want, BTG matches
   athletes, prices it and follows up — request, not self-service checkout.

   Frontend only. Nothing is persisted: submitting swaps the body to a success
   state and that's it. It captures exactly the CampaignBrief fields the
   blueprint names (objective, budget, timing, targeting, category — P4-BE-02),
   so when the backend lands the shape already matches. Since 3S3-BE-01
   (2026-10-14) the brief also carries the match engine's inputs — the tiers
   and channels wanted, a minimum audience, and the categories to avoid — so
   the drawer asks for them (lib/brief-request.ts maps them).

   Drawer plumbing mirrors the applications-desk review drawer verbatim —
   portaled to <body>, Escape closes, background scroll locks, focus lands in
   the panel and returns to the trigger on close, click-away backdrop, and the
   slide-out's animationend (with a fallback timer) drives unmount. Sponsor-
   toned. Sponsor prices only — AthleteRate.amount never reaches this page.
   -------------------------------------------------------------------------- */

export type BriefSeed =
  /** POL-FE-66 — `adOnly`: a package that staffs nobody (a NEXT ad); the drawer asks no athlete questions. */
  | { kind: "package"; name: string; price: string; packageId?: string; adOnly?: boolean }
  | { kind: "job"; name: string; jobId: string; price: string }
  | {
      kind: "athlete";
      name: string;
      sport: string;
      jobName: string;
      sellPrice: number;
    };

/* DEMO ONLY (POL-FE-51): the sample deck's targeting options derive from the
   fixture athlete inventory, exactly as its catalog filters do. A live
   sponsor's drawer gets `targeting` — the sports and states the tenant's
   ACTIVE athletes actually cover (GET /catalogue/targeting) — because a
   fixture sport no live athlete plays was a guaranteed hold. */
const distinct = (pick: (a: (typeof athleteInv)[number]) => string) =>
  [...new Set(athleteInv.map(pick))].map((v) => ({ value: v, label: v }));

const DEMO_SPORT_OPTIONS = distinct((a) => a.sport);
const DEMO_GEO_OPTIONS = distinct((a) => a.geo);
/* The tiers and channels are the API's own lists (match-vocabulary.ts), the
   athlete catalog's tier words being a subset of them. */
const TIER_OPTIONS = AUDIENCE_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }));
const CHANNEL_OPTIONS = MATCH_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }));

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

/** A row of toggle chips — "any" when none is on. A disabled chip is one the
 *  form already uses elsewhere (your own category can't be one to avoid). */
function Picks({
  label,
  hint,
  options,
  value,
  onChange,
  disabledValues = [],
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabledValues?: string[];
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 block text-[11px] font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={disabledValues.includes(o.value)}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className={[
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                on ? "border-sponsor bg-sponsor/15 text-text" : "border-line text-muted hover:text-text",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
    </fieldset>
  );
}

/** POL-FE-58 — where /s/<code> keeps the code for this browser (the drawer reads it back for 30 days). */
export const STUDENT_CODE_KEY = "sx.studentCode";

/** POL-FE-58 — the code to prefill: the URL's ?code=, else the one /s/<code> kept in this browser
 *  (30 days). The drawer mounts only after a click, so this runs in the browser; "" on the server. */
function readStudentCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromUrl = new URL(window.location.href).searchParams.get("code");
    if (fromUrl) return fromUrl.trim(); /* POL-FE-89 — exactly as given: codes are case-sensitive. */
    const kept = JSON.parse(window.localStorage.getItem(STUDENT_CODE_KEY) ?? "null") as { code?: string; at?: number } | null;
    if (kept?.code && typeof kept.at === "number" && Date.now() - kept.at < 30 * 864e5) return kept.code.trim();
  } catch {
    /* no storage, or a malformed entry: no code */
  }
  return "";
}

export function BriefRequestDrawer({
  seed,
  onClose,
  submit,
  targeting,
  checkStaffing,
}: {
  seed: BriefSeed | null;
  onClose: () => void;
  submit?: BriefSubmit;
  /** POL-FE-51 — the live Sport and Geography vocabulary; absent in demo. */
  targeting?: Targeting;
  /** POL-FE-51 — the live "can BTG staff this?" check; absent in demo. */
  checkStaffing?: StaffingCheck;
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
          targeting={targeting}
          checkStaffing={checkStaffing}
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
  targeting,
  checkStaffing,
}: {
  seed: BriefSeed;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
  onRequestClose: () => void;
  submit?: BriefSubmit;
  targeting?: Targeting;
  checkStaffing?: StaffingCheck;
}) {
  /* POL-FE-51 — live options from the live pool; the fixtures only in demo. */
  const live = targeting ? targetingOptions(targeting) : null;
  const sportOptions = live ? live.sports : DEMO_SPORT_OPTIONS;
  const geoOptions = live ? live.geos : DEMO_GEO_OPTIONS;
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState(
    seed.kind === "athlete" ? money(seed.sellPrice) : seed.price,
  );
  /* POL-FE-51 — the field always shows the day that will be sent: today + 14
     (the rule a blank start already followed), never empty and never today.
     The earliest day the calendar offers is tomorrow. */
  const [start, setStart] = useState(() => defaultStart());
  const [minStart] = useState(() => earliestStart());
  const [duration, setDuration] = useState("4");
  /* A seeded sport (the demo's athlete cards) only when it is one of the options. */
  const [sport, setSport] = useState(
    seed.kind === "athlete" && sportOptions.some((o) => o.value === seed.sport) ? seed.sport : "",
  );
  const [geo, setGeo] = useState("");
  const [audienceTiers, setAudienceTiers] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [minFollowers, setMinFollowers] = useState("");
  /* POL-FE-58 (app review B7) — a NEXT student's code, from /s/<code>: the URL's ?code=, or the one
     the business opened last (kept in this browser), so the sale is credited to the student. */
  const [studentCode, setStudentCode] = useState(readStudentCode);
  const [category, setCategory] = useState("");
  const [excludedCategories, setExcludedCategories] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  /* P4-FE-09 — the live answer: approved automatically, or BTG reviewing. */
  const [status, setStatus] = useState<BriefStatus | null>(null);
  /* POL-FE-65 — a held request is followed on Requests, not Campaigns. */
  const [sentId, setSentId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* POL-FE-51 — the API's one word on who a sent request now waits on. */
  const [waitingOn, setWaitingOn] = useState<WaitingOn>(null);
  /* POL-FE-51 — can BTG staff this package for the sport and area picked? */
  const [staffable, setStaffable] = useState<boolean | null>(null);
  const packageId = seed.kind === "package" ? (seed.packageId ?? null) : null;

  useEffect(() => {
    if (!checkStaffing || !packageId) return;
    let stale = false;
    checkStaffing({ packageId, sport, geo })
      .then((v) => { if (!stale) setStaffable(v); })
      .catch(() => { if (!stale) setStaffable(null); });
    return () => {
      stale = true;
    };
  }, [checkStaffing, packageId, sport, geo]);

  const startProblem = startDateProblem(start);
  const canSubmit = objective.trim() !== "" && budget.trim() !== "" && !startProblem && !sending;

  async function send() {
    /* POL-FE-51 — today or a past day is refused here, in words, before
       anything is sent: the API would hold it for DATES. */
    const problem = startDateProblem(start);
    if (problem) {
      setError(problem);
      return;
    }
    if (!submit) {
      setSubmitted(true); // demo mode: nothing is sent
      return;
    }
    setSending(true);
    setError(null);
    const out = await submit({
      objective, budget, start, durationWeeks: Number(duration), sport, geo, tier: "",
      audienceTiers, channels, minFollowers, category, excludedCategories, message, studentCode,
      packageId: seed.kind === "package" ? (seed.packageId ?? null) : null,
      jobName: seed.kind === "job" ? `${seed.name} (${seed.jobId})` : seed.kind === "athlete" ? seed.jobName : null,
    }).catch(() => ({ ok: false as const, error: "Couldn't reach BTG — please try again." }));
    setSending(false);
    if (out.ok) {
      setStatus(out.status ?? null);
      setSentId(out.id ?? null);
      setWaitingOn(out.waitingOn ?? null);
      setSubmitted(true);
    } else setError(out.error);
  }

  if (submitted) {
    /* Live: the API's answer, in its sponsor-safe words. Demo: nothing was
       sent, so the original copy. POL-FE-51 — held because too few athletes
       fit: say so plainly, with what the sponsor can change. */
    const sent = submit ? submittedMessage(status) : null;
    const said =
      sent && waitingOn === "ATHLETES"
        ? {
            ...sent,
            title: "Request received",
            body: athletesWaitingText({
              package: seed.kind === "package" ? { name: seed.name } : null,
              sports: sport ? [sport] : [],
              stateCodes: stateCodesFor(geo),
            }),
          }
        : sent;
    return (
      <div className="flex flex-1 flex-col">
        <DrawerHeader seed={seed} closeBtnRef={closeBtnRef} onClose={onRequestClose} />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent">
            <CheckMark />
          </div>
          <p className="mt-4 text-sm font-semibold tracking-tight">{said ? said.title : "Brief received"}</p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
            {said ? (
              said.body
            ) : (
              <>
                BTG will match eligible athletes, price the campaign, run conflict
                checks and follow up. Nothing is charged now — BTG agrees the
                price with you first.
              </>
            )}
          </p>
          {said && (
            <Link href={sent?.approved ? "/sponsor/campaigns" : sentId ? `/sponsor/requests/${encodeURIComponent(sentId)}` : "/sponsor/requests"} className="mt-3 text-[11px] font-medium text-sponsor hover:underline">
              {sent?.approved ? "Go to Campaigns →" : "Follow your request →"}
            </Link>
          )}
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
          <Field label="Start date">
            {/* POL-FE-51 — the house picker (P1-ART-23), one day, tomorrow at
                the earliest; it always holds a day, so it can't be cleared. */}
            <DateRangePicker
              single
              clearable={false}
              align="left"
              from={start}
              to={null}
              min={minStart}
              onChange={(day) => {
                if (day) {
                  setStart(day);
                  setError(null);
                }
              }}
              tone="sponsor"
              label="Start date"
              allLabel="Pick a start date"
            />
            {startProblem && (
              <p role="alert" className="mt-1 text-[10px] text-danger">
                {startProblem}
              </p>
            )}
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

        {/* POL-FE-66 (app review §2) — an ad staffs nobody: no athlete targeting to ask about. */}
        {!(seed.kind === "package" && seed.adOnly) && (
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
                options={sportOptions}
                onChange={setSport}
                tone="sponsor"
                block
              />
            </Field>
            <Field label="Geography">
              <Dropdown
                label="Target geography"
                allLabel="Any geography"
                value={geo}
                options={geoOptions}
                onChange={setGeo}
                tone="sponsor"
                block
              />
            </Field>
          </div>
          {staffable !== null && (
            <p
              role="status"
              className={["text-[11px]", staffable ? "text-accent" : "text-warn"].join(" ")}
            >
              {staffable
                ? "Ready to staff — BTG has enough athletes for this package here."
                : `Not enough athletes for this package ${sport || geo ? `in ${targetWords(sport ? [sport] : [], stateCodesFor(geo))} ` : ""}yet. Try another sport or area, or send it and BTG will be in touch.`}
            </p>
          )}
          <Picks label="Athlete tiers" hint="None picked means any tier." options={TIER_OPTIONS} value={audienceTiers} onChange={setAudienceTiers} />
          <Picks label="Where to be seen" hint="None picked means no preference." options={CHANNEL_OPTIONS} value={channels} onChange={setChannels} />
          <Field label="Minimum audience" htmlFor="brief-min-followers" hint="Followers on the athlete's largest account. Leave blank for no minimum.">
            <input
              id="brief-min-followers"
              value={minFollowers}
              onChange={(e) => setMinFollowers(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 10,000 or 10k"
              className={inputCls}
            />
          </Field>
        </fieldset>
        )}

        <Field label="Student code (optional)" htmlFor="brief-student-code" hint="A SponsorX NEXT student sent you? Their code credits the sale to them.">
          <input
            id="brief-student-code"
            value={studentCode}
            onChange={(e) => setStudentCode(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            autoComplete="off"
            placeholder="12 characters, exactly as on the card, e.g. aB3x_9QkT2mZ"
            className={inputCls}
          />
        </Field>

        <Field
          label="Your category"
          hint="So BTG can screen out competitor conflicts."
        >
          <Dropdown
            label="Your brand category"
            allLabel="Select a category"
            value={category}
            options={CATEGORY_OPTIONS}
            onChange={(c) => {
              setCategory(c);
              setExcludedCategories((xs) => xs.filter((x) => x !== c));
            }}
            tone="sponsor"
            block
          />
        </Field>

        <Picks
          label="Categories to avoid"
          hint="An athlete or venue tied to one of these won't be matched."
          options={CATEGORY_OPTIONS}
          value={excludedCategories}
          onChange={setExcludedCategories}
          disabledValues={category ? [category] : []}
        />

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
          A request that passes every check is approved at once and becomes your campaign; BTG steps in only when something needs a person, and tells you why.
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
