"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";

import { createCampaign, orderCodeFor, type CreateCampaignResult } from "@/app/(focus)/sponsor/campaigns/new/actions";
import { Confetti, Words, reducedMotion } from "@/components/brief-fx";
import { FocusRail, FocusShell, LineField, Problem, delay } from "@/components/focus-wizard";
import { OrderSheet, type OrderSheetBlock } from "@/components/order-sheet";
import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { AUDIENCE_TIERS, CHANNEL_LABEL, MATCH_CHANNELS, OBJECTIVE_MIN_WORDS, TIER_LABEL, wordCount } from "@/lib/brief-request";
import { athletesWaitingText, submittedMessage } from "@/lib/brief-status";
import {
  BUILDER_DRAFT_KEY,
  BUILDER_STEPS,
  CATEGORY_CHOICES,
  JOB_HINT,
  MAX_DISCLOSURES,
  ORDER_CODE,
  asksStates,
  blankDraft,
  countryName,
  countryOptions,
  dollarsCents,
  fieldWords,
  jobName,
  mixJobs,
  orderDetailsOf,
  parseStoredDraft,
  stateOptions,
  stepAnswer,
  stepProblems,
  storeDraft,
  suggestOrderCode,
  toggleJob,
  withCountry,
  withDates,
  type BuilderCatalogue,
  type BuilderDraft,
  type BuilderField,
  type BuilderJob,
  type BuilderStepId,
  type BuilderTargeting,
  type MediaDraft,
} from "@/lib/campaign-builder";
import { fmtDay as fmtValidDay, parseDay } from "@/lib/day-range";
import { JOB_NAME, centsWords, channelWord, choiceWord, isJobId, paidKindWord, paidMediaNeedsPay } from "@/lib/order-details";

/* --------------------------------------------------------------------------
   The sponsor's campaign builder — POL-FE-107 and POL-FE-116
   (polish.md §107, §116), the whole of /sponsor/campaigns/new. (BTG's own
   "Create campaign" island is components/campaign-builder.tsx, a different
   screen: /admin/campaigns/new.)

   "+ Create a campaign" used to open the package list, so a sponsor could
   only pick a ready-made bundle (§107). It now opens this: a blank campaign
   of the sponsor's own, built step by step, full screen, in the same frame
   as the sponsor brief (focus-wizard.tsx):

     campaign → budget and dates → who to reach → brand safety
     → what athletes do → deliverables → usage and paid media
     → exclusivity and payment → review and send

   The first four are §107's (country, with states for the United States
   only). The next four set every field of the Athlete Campaign Order
   template (§116); the deliverables step changes with the jobs picked, each
   job asking for its own medium's details as the API's catalogue lists them.
   The last step is the order as each athlete will read it (order-sheet.tsx),
   every part with an Edit that comes straight back.

   Sending goes to POST /briefs with no package (./actions.ts), and only
   then says where the campaign stands: approved straight away, or with BTG.
   A failure keeps every answer and says what happened. The draft is kept on
   this device as it is typed.

   What is checked, and the exact request, are lib/campaign-builder.ts.
   -------------------------------------------------------------------------- */

const STEP_MS = 200;
const REVIEW = BUILDER_STEPS.length - 1;
/** A date in words; a date field that was cleared says so instead of breaking the page. */
const fmtDay = (day: string) => (parseDay(day) ? fmtValidDay(day) : "not set");
const emptySubscribe = () => () => {};

/* Where each block of the order's summary is changed. */
const BLOCK_STEP: Record<OrderSheetBlock, BuilderStepId> = {
  head: "jobs",
  deliverables: "deliverables",
  usage: "usage",
  paid: "usage",
  exclusivity: "terms",
  payment: "terms",
};

const DISCLOSURE_CHOICES = ["#ad", "Paid partnership", "#sponsored", "#partner"];
/* The categories a brand most often keeps clear of come first; the rest open on request. */
const OFTEN_AVOIDED = ["ALCOHOL", "TOBACCO_VAPE", "CANNABIS", "GAMBLING", "FIREARMS", "ADULT"].filter((c) => (BRAND_CATEGORIES as readonly string[]).includes(c));

const AFTER = [
  { title: "SponsorX checks it at once", sub: "If every check passes it is approved straight away. If not, a person at BTG looks at it and gets back to you." },
  { title: "Athletes are matched", sub: "Only athletes in the country you picked who fit your campaign." },
  { title: "Each athlete reads this order", sub: "They accept it before any work starts, and so does a guardian for a minor." },
] as const;

type Sent = Extract<CreateCampaignResult, { ok: true }>;

export function SponsorCampaignBuilder({
  catalogue,
  targeting,
  now,
}: {
  catalogue: BuilderCatalogue;
  targeting: BuilderTargeting;
  /** When the page was rendered, so the server and the browser start from the same blank campaign. */
  now: string;
}) {
  const today = useMemo(() => new Date(now), [now]);
  const storedRaw = useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return localStorage.getItem(BUILDER_DRAFT_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const seeded = useMemo(() => parseStoredDraft(storedRaw, catalogue, today) ?? { draft: blankDraft(catalogue, today), step: 0 }, [storedRaw, catalogue, today]);
  const [touched, setTouched] = useState<{ draft: BuilderDraft; step: number } | null>(null);
  const { draft, step } = touched ?? seeded;
  const def = BUILDER_STEPS[step];

  const [dir, setDir] = useState<1 | -1>(1);
  const [leaving, setLeaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  /* Set by an Edit on the review: Continue then goes straight back to it. */
  const [toReview, setToReview] = useState(false);
  const [moreAvoid, setMoreAvoid] = useState(false);
  const [ownTag, setOwnTag] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  /* The API's three letters for the name, once asked. */
  const [apiCode, setApiCode] = useState<{ name: string; code: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  /* A step change or a send in flight. Refs, not state: a second click in the
     same tick must see the first (a state flag is still false there). */
  const moving = useRef(false);
  const posting = useRef(false);
  const landed = useRef(false);

  const countries = useMemo(() => countryOptions(targeting.countryCodes), [targeting.countryCodes]);
  const states = useMemo(() => stateOptions(targeting.stateCodes), [targeting.stateCodes]);
  const ctx = { catalogue, countries: targeting.countryCodes };

  const write = (next: BuilderDraft, at = step) => {
    setTouched({ draft: next, step: at });
    try {
      localStorage.setItem(BUILDER_DRAFT_KEY, storeDraft(next, at));
    } catch {
      /* private mode: in memory still works for this visit */
    }
  };
  const set = (patch: Partial<BuilderDraft>, ...clear: string[]) => {
    if (clear.some((k) => errors[k])) setErrors(Object.fromEntries(Object.entries(errors).filter(([k]) => !clear.includes(k))));
    write({ ...draft, ...patch });
  };
  const toggle = (key: "states" | "sports" | "tiers" | "channels" | "avoid" | "usageChannels" | "paidKinds" | "paidPlatforms" | "disclosures", value: string) => {
    const has = draft[key].includes(value);
    set({ [key]: has ? draft[key].filter((v) => v !== value) : [...draft[key], value] } as Partial<BuilderDraft>, key);
  };
  const setMedia = (jobId: string, field: string, value: string | boolean) => {
    const key = `media.${jobId}.${field.startsWith("mix:") ? "monthlyMix" : field}`;
    set({ media: { ...draft.media, [jobId]: { ...(draft.media[jobId] ?? {}), [field]: value } } }, key, `media.${jobId}.maxSeconds`, `media.${jobId}.images`);
  };

  /* The order code on screen: the sponsor's own, else the API's for this name, else the same rule worked out here. */
  const name = draft.name.trim();
  const suggested = apiCode && apiCode.name === name ? apiCode.code : suggestOrderCode(name);
  const typedCode = draft.orderCode.trim().toUpperCase();
  const code = ORDER_CODE.test(typedCode) ? typedCode : suggested;
  const year = today.getUTCFullYear();

  /* Asked once the name is settled: from the jobs step on, and again if the name changes. */
  useEffect(() => {
    if (step < 4 || !name || apiCode?.name === name) return;
    let live = true;
    void orderCodeFor(name)
      .then((c) => {
        if (live && c) setApiCode({ name, code: c });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [step, name, apiCode]);

  /* The step leaves, then the next one arrives. While it leaves it is inert,
     so nothing typed in those 200ms is lost to the step change. */
  const go = (to: number, keep?: Record<string, string>) => {
    if (moving.current || to === step) return;
    moving.current = true;
    setErrors(keep ?? {});
    setDir(to > step ? 1 : -1);
    setLeaving(true);
    window.setTimeout(
      () => {
        write(draft, to);
        setLeaving(false);
        moving.current = false;
      },
      reducedMotion() ? 0 : STEP_MS,
    );
  };

  const focusFirst = (errs: Record<string, string>) => {
    const at = [...(stepRef.current?.querySelectorAll<HTMLElement>("[data-field]") ?? [])].find((el) => errs[el.dataset.field ?? ""]);
    (at?.matches("input, textarea, select, button") ? at : at?.querySelector<HTMLElement>("input, textarea, select, button"))?.focus();
  };

  const send = () => {
    if (posting.current) return;
    posting.current = true;
    setSending(true);
    setSendError(null);
    /* The code on the review is the one that is sent. */
    void createCampaign({ ...draft, orderCode: code })
      .then((r) => {
        if (r.ok) {
          try {
            localStorage.removeItem(BUILDER_DRAFT_KEY);
          } catch {
            /* nothing was stored */
          }
          setSent(r);
          window.scrollTo({ top: 0 });
          return;
        }
        if (r.step !== undefined && r.problems && r.step !== step) {
          setToReview(true);
          go(r.step, r.problems);
        } else setSendError(r.error);
      })
      .catch(() => setSendError("Something went wrong and nothing was sent. Your answers are saved. Try again."))
      .finally(() => {
        posting.current = false;
        setSending(false);
      });
  };

  const goNext = () => {
    if (moving.current) return;
    if (step === REVIEW) return send();
    const errs = stepProblems(def.id, draft, ctx);
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirst(errs);
    const to = toReview ? REVIEW : step + 1;
    setToReview(false);
    go(to);
  };

  const edit = (id: BuilderStepId) => {
    setToReview(true);
    go(BUILDER_STEPS.findIndex((s) => s.id === id));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    goNext();
  };

  /* A new step takes the focus on its heading, so a screen reader reads the
     question. Not on arrival: the page's first focus is the visitor's. */
  useEffect(() => {
    if (!landed.current) {
      landed.current = true;
      return;
    }
    if (!sent) headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [step, sent]);

  /* Problems carried to a step by a refused send: put the cursor on the first. */
  useEffect(() => {
    if (!leaving && Object.keys(errors).length) focusFirst(errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a step has just arrived
  }, [step, leaving]);

  const details = orderDetailsOf(draft, catalogue);
  const picked = catalogue.jobs.filter((j) => draft.jobs.includes(j.jobId));
  const progress = sent ? 1 : (step + (step === REVIEW ? 0.6 : 0.35)) / BUILDER_STEPS.length;
  const days = draft.start && draft.end && draft.end >= draft.start ? Math.round((Date.parse(draft.end) - Date.parse(draft.start)) / 864e5) : null;
  const goalWords = wordCount(draft.goal);
  const avoidShown = CATEGORY_CHOICES.filter((c) => moreAvoid || OFTEN_AVOIDED.includes(c.value) || draft.avoid.includes(c.value));
  const tags = [...new Set([...DISCLOSURE_CHOICES, ...draft.disclosures])];

  const addOwnTag = () => {
    const t = ownTag.trim().slice(0, 60);
    if (!t) return;
    if (!draft.disclosures.includes(t) && draft.disclosures.length < MAX_DISCLOSURES) set({ disclosures: [...draft.disclosures, t] }, "disclosures");
    setOwnTag("");
  };

  return (
    <FocusShell
      step={step}
      count={BUILDER_STEPS.length}
      done={!!sent}
      progress={progress}
      progressLabel="Campaign progress"
      progressText={sent ? "Campaign sent" : `Step ${step + 1} of ${BUILDER_STEPS.length}: ${def.label}`}
      home={{ href: "/sponsor", label: "Back to your dashboard" }}
      /* A portal page: no boot screen to wait for. */
      boot={false}
      exit={sent ? { href: "/sponsor/campaigns", label: "Back to campaigns" } : { href: "/sponsor/campaigns", label: "Save and exit" }}
    >
      {sent ? (
        <SentScreen sent={sent} name={name} draft={draft} />
      ) : (
        <div className="relative mx-auto grid w-full max-w-[1240px] flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14 lg:px-10 xl:gap-20">
          <FocusRail
            title="Your campaign"
            label="Campaign steps"
            compact
            steps={BUILDER_STEPS.map((s, i) => ({
              id: s.id,
              label: s.label,
              state: i < step ? "done" : i === step ? "now" : "next",
              answer: stepAnswer(s.id, draft),
              open: i < step,
            }))}
            onOpen={(i) => {
              /* From the review, a change comes straight back to it. */
              if (step === REVIEW) setToReview(true);
              go(i);
            }}
            note="Your answers are saved on this device as you go."
          />

          <form onSubmit={onSubmit} noValidate className="flex min-w-0 flex-col">
            <div
              key={def.id}
              ref={stepRef}
              inert={leaving}
              data-leaving={leaving ? "" : undefined}
              className="bx-step flex flex-1 flex-col px-5 pb-6 pt-7 sm:px-8 lg:px-0 lg:pt-10"
              style={{ "--bx-dir": dir } as CSSProperties}
            >
              <p className="bx-rise text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-soft">
                Step {step + 1} of {BUILDER_STEPS.length}
                <span className="text-muted"> · {def.label}</span>
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className={`mt-4 font-semibold leading-[1.06] tracking-tight outline-none ${
                  def.id === "review" ? "text-[clamp(1.8rem,3.4vw,2.6rem)]" : "max-w-[22ch] text-[clamp(1.9rem,4.4vw,3.1rem)]"
                }`}
              >
                <Words text={def.heading} />
              </h1>
              <p className="bx-rise mt-4 max-w-xl text-base leading-relaxed text-muted" style={delay(0.22)}>
                {def.sub}
              </p>

              <div className={`mt-9 ${def.id === "review" ? "max-w-[980px]" : "max-w-[760px]"}`}>
                {/* -------------------------------------------- campaign */}
                {def.id === "campaign" && (
                  <div className="space-y-8">
                    <LineField
                      prefix="cb"
                      def={{ key: "name", label: "Campaign name", placeholder: "e.g. What's on your pregame playlist?" }}
                      className="bx-rise"
                      style={delay(0.3)}
                      maxLength={80}
                      value={draft.name}
                      error={errors.name}
                      hint="Athletes and BTG see this name on the order."
                      onChange={(v) => set({ name: v }, "name")}
                    />
                    <Area
                      field="goal"
                      label="What should the campaign achieve?"
                      className="bx-rise"
                      style={delay(0.38)}
                      value={draft.goal}
                      error={errors.goal}
                      maxLength={1800}
                      placeholder="e.g. Get local students into our new store before the season opens"
                      hint={`In your own words, at least ${OBJECTIVE_MIN_WORDS} words. You have ${goalWords}.`}
                      onChange={(v) => set({ goal: v }, "goal")}
                    />
                  </div>
                )}

                {/* ---------------------------------------------- budget */}
                {def.id === "budget" && (
                  <div className="grid gap-8 sm:grid-cols-2">
                    <LineField
                      prefix="cb"
                      def={{ key: "budget", label: "Budget for the whole campaign, in dollars", placeholder: "e.g. 2,500" }}
                      className="bx-rise sm:col-span-2"
                      style={delay(0.3)}
                      maxLength={16}
                      value={draft.budget}
                      error={errors.budget}
                      hint="BTG prices the campaign inside this. Nothing is charged now."
                      onChange={(v) => set({ budget: v }, "budget")}
                    />
                    <LineField
                      prefix="cb"
                      def={{ key: "start", label: "Starts", placeholder: "", type: "date" }}
                      className="bx-rise"
                      style={delay(0.38)}
                      value={draft.start}
                      error={errors.start}
                      onChange={(v) => {
                        if (errors.start || errors.end) setErrors({});
                        write(withDates(draft, v, draft.end));
                      }}
                    />
                    <LineField
                      prefix="cb"
                      def={{ key: "end", label: "Ends", placeholder: "", type: "date" }}
                      className="bx-rise"
                      style={delay(0.44)}
                      value={draft.end}
                      error={errors.end}
                      hint={days !== null ? `Runs ${days} day${days === 1 ? "" : "s"}.` : undefined}
                      onChange={(v) => {
                        if (errors.start || errors.end) setErrors({});
                        write(withDates(draft, draft.start, v));
                      }}
                    />
                  </div>
                )}

                {/* ----------------------------------------------- reach */}
                {def.id === "reach" && (
                  <div className="space-y-8">
                    <Pick
                      field="country"
                      label="Country"
                      className="bx-rise max-w-sm"
                      style={delay(0.3)}
                      value={draft.country}
                      error={errors.country}
                      options={countries}
                      hint="Only athletes in this country are matched."
                      onChange={(v) => {
                        if (errors.country || errors.states) setErrors({});
                        write(withCountry(draft, v));
                      }}
                    />
                    {/* States are a United States question only (§107). */}
                    <div className="sx-expand" data-open={asksStates(draft.country)}>
                      <div inert={!asksStates(draft.country)}>
                        <ChipSet
                          field="states"
                          label="States"
                          optional
                          hint="Leave them all off for anywhere in the United States."
                          options={states}
                          values={draft.states}
                          error={errors.states}
                          onToggle={(v) => toggle("states", v)}
                        />
                      </div>
                    </div>
                    {!asksStates(draft.country) && (
                      <p className="text-sm text-muted">Outside the United States a campaign covers the whole country: {countryName(draft.country)}.</p>
                    )}
                    {targeting.sports.length > 0 && (
                      <ChipSet
                        field="sports"
                        label="Sports"
                        optional
                        hint="Leave them all off for any sport."
                        className="bx-rise"
                        style={delay(0.36)}
                        options={[...new Set(targeting.sports)].filter(Boolean).map((s) => ({ value: s, label: s }))}
                        values={draft.sports}
                        onToggle={(v) => toggle("sports", v)}
                      />
                    )}
                    <ChipSet
                      field="tiers"
                      label="Audience size"
                      optional
                      hint="The size of athlete you want. Leave them all off for any."
                      className="bx-rise"
                      style={delay(0.42)}
                      options={AUDIENCE_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }))}
                      values={draft.tiers}
                      onToggle={(v) => toggle("tiers", v)}
                    />
                    <Box
                      field="minFollowers"
                      label="Smallest audience, in followers"
                      optional
                      className="bx-rise max-w-sm"
                      style={delay(0.48)}
                      inputMode="text"
                      placeholder="e.g. 10,000 or 10k"
                      value={draft.minFollowers}
                      error={errors.minFollowers}
                      onChange={(v) => set({ minFollowers: v }, "minFollowers")}
                    />
                    <ChipSet
                      field="channels"
                      label="Where you want to be seen"
                      optional
                      hint="Leave them all off for no preference."
                      className="bx-rise"
                      style={delay(0.54)}
                      options={MATCH_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
                      values={draft.channels}
                      onToggle={(v) => toggle("channels", v)}
                    />
                  </div>
                )}

                {/* ---------------------------------------------- safety */}
                {def.id === "safety" && (
                  <div className="space-y-8">
                    <Pick
                      field="category"
                      label="Your own category"
                      optional
                      className="bx-rise max-w-sm"
                      style={delay(0.3)}
                      value={draft.category}
                      error={errors.category}
                      options={[{ value: "", label: "Not listed, or skip" }, ...CATEGORY_CHOICES]}
                      hint="An athlete who has ruled this category out is never matched."
                      onChange={(v) => set({ category: v }, "category", "avoid")}
                    />
                    <div className="bx-rise" style={delay(0.38)}>
                      <ChipSet
                        field="avoid"
                        label="Categories to avoid"
                        optional
                        hint="An athlete tied to one of these is never matched to your campaign."
                        options={avoidShown.filter((c) => c.value !== draft.category)}
                        values={draft.avoid}
                        error={errors.avoid}
                        onToggle={(v) => toggle("avoid", v)}
                        after={
                          <button type="button" aria-expanded={moreAvoid} onClick={() => setMoreAvoid(!moreAvoid)} className="bx-chip" data-quiet="">
                            {moreAvoid ? "Fewer categories" : `More categories (${CATEGORY_CHOICES.length - avoidShown.length})`}
                          </button>
                        }
                      />
                    </div>
                  </div>
                )}

                {/* ------------------------------------------------ jobs */}
                {def.id === "jobs" && (
                  <div className="space-y-8">
                    <Area
                      field="prompt"
                      label="The prompt athletes answer"
                      className="bx-rise"
                      style={delay(0.3)}
                      rows={3}
                      value={draft.prompt}
                      error={errors.prompt}
                      maxLength={1000}
                      placeholder="e.g. Before a game, I gotta have ___. What's yours?"
                      hint="One line each athlete makes their own. It is the first thing on their order."
                      onChange={(v) => set({ prompt: v }, "prompt")}
                    />
                    <div className="bx-rise" style={delay(0.38)}>
                      <p id="cb-jobs-label" className="text-sm font-medium text-muted">
                        Jobs <span className="text-[12px] font-normal text-faint">Pick one or more</span>
                      </p>
                      <div
                        role="group"
                        aria-labelledby="cb-jobs-label"
                        aria-describedby={errors.jobs ? "err-jobs" : undefined}
                        data-field="jobs"
                        className="bx-group mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
                      >
                        {catalogue.jobs.map((job) => {
                          const on = draft.jobs.includes(job.jobId);
                          return (
                            <button
                              key={job.jobId}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              onClick={() => set(toggleJob(draft, job.jobId, catalogue), "jobs")}
                              className="bx-card flex items-center gap-4 p-4"
                            >
                              <span className="bx-ring" aria-hidden />
                              <span className="min-w-0 flex-1">
                                <span className="block text-base font-semibold leading-snug">{jobName(job)}</span>
                                <span className="mt-1 block text-sm leading-snug text-muted">{isJobId(job.jobId) ? JOB_HINT[job.jobId] : job.jobId}</span>
                              </span>
                              <Tick />
                            </button>
                          );
                        })}
                      </div>
                      <Problem id="err-jobs" text={errors.jobs} />
                    </div>
                  </div>
                )}

                {/* ---------------------------------------- deliverables */}
                {def.id === "deliverables" && (
                  <div className="space-y-8">
                    {picked.length === 0 && (
                      <p className="bx-panel p-5 text-sm text-muted">
                        No job is picked yet.{" "}
                        <button type="button" onClick={() => go(BUILDER_STEPS.findIndex((s) => s.id === "jobs"))} className="text-accent-soft underline-offset-4 hover:underline">
                          Pick the jobs first
                        </button>
                        .
                      </p>
                    )}
                    {/* The deliverable section changes with each job's medium (§116). */}
                    {picked.map((job, i) => (
                      <fieldset key={job.jobId} className="bx-panel bx-rise p-5 sm:p-6" style={delay(0.3 + i * 0.06)}>
                        <legend className="float-left mb-4 w-full text-base font-semibold text-text">
                          {jobName(job)} <span className="ml-1 text-xs font-medium text-muted">{job.jobId}</span>
                        </legend>
                        <div className="clear-both grid gap-x-6 gap-y-5 sm:grid-cols-2">
                          {job.fields.map((f) => (
                            <MediaField key={f.field} job={job} f={f} typed={draft.media[job.jobId] ?? {}} errors={errors} onChange={(field, v) => setMedia(job.jobId, field, v)} />
                          ))}
                        </div>
                      </fieldset>
                    ))}

                    <div className="bx-rise grid gap-x-6 gap-y-5 sm:grid-cols-2" style={delay(0.42)}>
                      <p className="text-sm font-medium text-muted sm:col-span-2">
                        Publish window <span className="text-[12px] font-normal text-faint">Inside the campaign&rsquo;s dates, {fmtDay(draft.start)} to {fmtDay(draft.end)}</span>
                      </p>
                      <Box field="windowStart" label="First day" type="date" value={draft.windowStart} error={errors.windowStart} onChange={(v) => set({ windowStart: v }, "windowStart", "windowEnd")} />
                      <Box field="windowEnd" label="Last day" type="date" value={draft.windowEnd} error={errors.windowEnd} onChange={(v) => set({ windowEnd: v }, "windowStart", "windowEnd")} />
                    </div>

                    <div className="bx-rise" style={delay(0.48)}>
                      <ChipSet
                        field="disclosures"
                        label="Disclosure on every post"
                        hint="How each post says it is paid for."
                        options={tags.map((t) => ({ value: t, label: t }))}
                        values={draft.disclosures}
                        error={errors.disclosures}
                        onToggle={(v) => toggle("disclosures", v)}
                      />
                      <div className="mt-4 flex max-w-sm items-end gap-3">
                        <Box field="ownTag" label="Add your own" optional className="flex-1" maxLength={60} placeholder="e.g. #YourBrandPartner" value={ownTag} onChange={setOwnTag} onEnter={addOwnTag} />
                        <button type="button" onClick={addOwnTag} className="bx-ghost px-4 text-sm" style={{ minHeight: 46 }}>
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ----------------------------------------------- usage */}
                {def.id === "usage" && (
                  <div className="space-y-8">
                    <ChipSet
                      field="usageChannels"
                      label="Authorized channels"
                      hint="Where the content may be published or used."
                      className="bx-rise"
                      style={delay(0.3)}
                      options={catalogue.channels.map((c) => ({ value: c, label: channelWord(c) }))}
                      values={draft.usageChannels}
                      error={errors.usageChannels}
                      onToggle={(v) => toggle("usageChannels", v)}
                    />
                    <div className="bx-rise grid gap-x-6 gap-y-5 sm:grid-cols-2" style={delay(0.36)}>
                      <Box
                        field="usageDays"
                        label="Usage period"
                        unit="days after the publish window ends"
                        inputMode="numeric"
                        value={draft.usageDays}
                        error={errors.usageDays}
                        hint={`0 is during the publish window only. At most ${catalogue.limits.usagePeriodDays}.`}
                        onChange={(v) => set({ usageDays: v }, "usageDays")}
                      />
                      <Box field="territory" label="Territory" maxLength={120} value={draft.territory} error={errors.territory} onChange={(v) => set({ territory: v }, "territory")} />
                    </div>
                    <Area
                      field="restrictions"
                      label="Additional rights or restrictions"
                      optional
                      className="bx-rise"
                      style={delay(0.42)}
                      rows={2}
                      maxLength={1000}
                      value={draft.restrictions}
                      error={errors.restrictions}
                      placeholder="e.g. No edits that change the athlete's words"
                      onChange={(v) => set({ restrictions: v }, "restrictions")}
                    />

                    <div className="bx-rise" style={delay(0.48)}>
                      <YesNo
                        field="paid"
                        label="Will you also run this content as paid media?"
                        hint="Boosted posts, whitelisting, ads, print and the like. It is not included unless you add it here."
                        value={draft.paid}
                        onChange={(v) => set({ paid: v }, "paidKinds", "paidDays", "paidTerritory", "paidExtra")}
                      />
                    </div>
                    <div className="sx-expand" data-open={draft.paid}>
                      <div inert={!draft.paid}>
                        <div className="space-y-6 pt-1">
                          <ChipSet
                            field="paidKinds"
                            label="What kind"
                            options={catalogue.paidMediaKinds.map((k) => ({ value: k, label: paidKindWord(k) }))}
                            values={draft.paidKinds}
                            error={errors.paidKinds}
                            onToggle={(v) => toggle("paidKinds", v)}
                          />
                          <ChipSet
                            field="paidPlatforms"
                            label="On which platforms"
                            optional
                            options={catalogue.channels.map((c) => ({ value: c, label: channelWord(c) }))}
                            values={draft.paidPlatforms}
                            onToggle={(v) => toggle("paidPlatforms", v)}
                          />
                          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                            <Box field="paidDays" label="For how long" unit="days" inputMode="numeric" value={draft.paidDays} error={errors.paidDays} onChange={(v) => set({ paidDays: v }, "paidDays")} />
                            <Box field="paidTerritory" label="Where it runs" maxLength={120} value={draft.paidTerritory} error={errors.paidTerritory} onChange={(v) => set({ paidTerritory: v }, "paidTerritory")} />
                            <Box
                              field="paidExtra"
                              label="Extra pay for each athlete, in dollars"
                              optional
                              className="sm:col-span-2"
                              inputMode="decimal"
                              placeholder="e.g. 150"
                              value={draft.paidExtra}
                              error={errors.paidExtra}
                              hint="On top of the athlete's fee. Leave it blank and BTG sets it with you: no order goes out until it is set."
                              onChange={(v) => set({ paidExtra: v }, "paidExtra")}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ----------------------------------------------- terms */}
                {def.id === "terms" && (
                  <div className="space-y-8">
                    <div className="bx-rise" style={delay(0.3)}>
                      <YesNo
                        field="exclusive"
                        label="Should the athletes stay out of your category while this runs?"
                        hint="Exclusivity applies only as you set it here."
                        value={draft.exclusive}
                        onChange={(v) =>
                          set(
                            {
                              exclusive: v,
                              /* Starts from your own category, in words. */
                              exclCategory: v && !draft.exclCategory.trim() && (BRAND_CATEGORIES as readonly string[]).includes(draft.category) ? categoryLabel(draft.category as BrandCategory) : draft.exclCategory,
                            },
                            "exclCategory",
                            "exclDays",
                            "exclScope",
                          )
                        }
                      />
                    </div>
                    <div className="sx-expand" data-open={draft.exclusive}>
                      <div inert={!draft.exclusive}>
                        <div className="grid gap-x-6 gap-y-5 pt-1 sm:grid-cols-2">
                          <Box
                            field="exclCategory"
                            label="Restricted category"
                            className="sm:col-span-2"
                            maxLength={120}
                            placeholder="e.g. Sports drinks"
                            value={draft.exclCategory}
                            error={errors.exclCategory}
                            onChange={(v) => set({ exclCategory: v }, "exclCategory")}
                          />
                          <Box field="exclDays" label="Exclusivity period" unit="days from acceptance" inputMode="numeric" value={draft.exclDays} error={errors.exclDays} onChange={(v) => set({ exclDays: v }, "exclDays")} />
                          <Box field="exclScope" label="Geographic scope" maxLength={120} value={draft.exclScope} error={errors.exclScope} onChange={(v) => set({ exclScope: v }, "exclScope")} />
                        </div>
                      </div>
                    </div>

                    <div className="bx-rise" style={delay(0.38)}>
                      <YesNo
                        field="sponsorApproval"
                        label="Do you want to approve each post before it goes live?"
                        hint="BTG reviews every post either way. Yes adds your own approval after BTG's."
                        value={draft.sponsorApproval}
                        onChange={(v) => set({ sponsorApproval: v })}
                      />
                    </div>

                    <div className="bx-rise grid gap-x-6 gap-y-5 sm:grid-cols-2" style={delay(0.44)}>
                      <Box
                        field="paymentDays"
                        label="Payment timing"
                        unit="days after every deliverable is verified"
                        inputMode="numeric"
                        className="sm:col-span-2"
                        value={draft.paymentDays}
                        error={errors.paymentDays}
                        hint={`When the athlete is paid. At most ${catalogue.limits.paymentDaysAfterVerified} days.`}
                        onChange={(v) => set({ paymentDays: v }, "paymentDays")}
                      />
                    </div>
                    <Area
                      field="nonCash"
                      label="Product or anything else the athlete receives"
                      optional
                      className="bx-rise"
                      style={delay(0.5)}
                      rows={2}
                      maxLength={500}
                      value={draft.nonCash}
                      error={errors.nonCash}
                      placeholder="e.g. A pair of shoes to keep"
                      onChange={(v) => set({ nonCash: v }, "nonCash")}
                    />
                    <div className="bx-rise" style={delay(0.56)}>
                      <Box
                        field="orderCode"
                        label="Order code"
                        optional
                        className="max-w-[12rem]"
                        maxLength={3}
                        placeholder={suggested}
                        value={draft.orderCode}
                        error={errors.orderCode}
                        onChange={(v) => set({ orderCode: v.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3) }, "orderCode")}
                      />
                      <p className="mt-2 text-[12px] leading-relaxed text-faint">
                        Three letters from the campaign&rsquo;s name. Each athlete&rsquo;s order is numbered{" "}
                        <span className="font-medium text-muted">
                          SX-{code}-{year}-0001
                        </span>
                        , 0002 and so on. If another campaign has the code this year, the next free one is used.
                      </p>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------- review */}
                {def.id === "review" && (
                  <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-start">
                    <div className="space-y-6">
                      {paidMediaNeedsPay(details) && (
                        <p role="status" className="bx-rise rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-text" style={delay(0.28)}>
                          Paid media is added with no extra pay for the athletes yet. BTG sets it with you, and no order goes out until it is set.
                        </p>
                      )}
                      <div className="cb-sheet bx-rise px-5 py-5 sm:px-7" style={delay(0.3)}>
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="text-sm font-semibold tracking-tight text-text">The campaign</h2>
                          <EditButton label="the campaign" onClick={() => edit("campaign")} />
                        </div>
                        <dl className="mt-1 divide-y divide-line-soft">
                          <Row label="Name" value={name || "—"} />
                          <Row label="Goal" value={draft.goal.trim() || "—"} />
                          <Row label="Budget" value={dollarsCents(draft.budget) ? centsWords(dollarsCents(draft.budget) ?? 0) : "—"} onEdit={() => edit("budget")} />
                          <Row label="Dates" value={`${fmtDay(draft.start)} to ${fmtDay(draft.end)}`} />
                          <Row
                            label="Who to reach"
                            onEdit={() => edit("reach")}
                            value={[
                              countryName(draft.country) + (asksStates(draft.country) ? (draft.states.length ? `: ${draft.states.join(", ")}` : ": any state") : ": the whole country"),
                              draft.sports.length ? draft.sports.join(", ") : "Any sport",
                              draft.tiers.length ? draft.tiers.map((t) => TIER_LABEL[t as keyof typeof TIER_LABEL] ?? t).join(", ") : "Any audience size",
                              draft.minFollowers.trim() ? `At least ${draft.minFollowers.trim()} followers` : "",
                              draft.channels.length ? draft.channels.map((c) => CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL] ?? c).join(", ") : "Any channel",
                            ]
                              .filter(Boolean)
                              .join("\n")}
                          />
                          <Row
                            label="Brand safety"
                            onEdit={() => edit("safety")}
                            value={[
                              `Your category: ${(BRAND_CATEGORIES as readonly string[]).includes(draft.category) ? categoryLabel(draft.category as BrandCategory) : "not set"}`,
                              `Avoid: ${draft.avoid.length ? draft.avoid.map((c) => ((BRAND_CATEGORIES as readonly string[]).includes(c) ? categoryLabel(c as BrandCategory) : c)).join(", ") : "nothing"}`,
                            ].join("\n")}
                          />
                        </dl>
                      </div>

                      <div className="cb-sheet bx-rise px-5 py-5 sm:px-7" style={delay(0.38)}>
                        <OrderSheet
                          heading="The order each athlete reads"
                          input={{
                            details,
                            orderNumber: `SX-${code}-${year}-0001, then 0002 and so on: one for each athlete`,
                            campaign: name || null,
                            compensation: "Set for each athlete from their own rate, inside your budget",
                          }}
                          edit={(block) => <EditButton label={block === "head" ? "the prompt and jobs" : block} onClick={() => edit(BLOCK_STEP[block])} />}
                        />
                      </div>
                    </div>

                    <div className="bx-rise" style={delay(0.46)}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">After you send it</p>
                      <ol className="mt-4 space-y-4">
                        {AFTER.map((a, i) => (
                          <li key={a.title} className="flex gap-3">
                            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/50 text-xs font-semibold text-accent-soft">
                              {i + 1}
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-text">{a.title}</span>
                              <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{a.sub}</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* The action bar: Back and the main button on one row, pinned,
                except on a very short screen where it would cover the step. */}
            <div className="bx-actions bx-chrome sticky bottom-0 z-10 px-5 pb-5 pt-8 sm:px-8 lg:px-0 lg:pb-8 [@media(max-height:500px)]:static">
              {sendError && step === REVIEW && (
                <p role="alert" className="mb-3 max-w-[760px] rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {sendError}
                </p>
              )}
              <div className="flex max-w-[760px] items-center gap-3">
                {step > 0 && (
                  <button type="button" onClick={() => go(step - 1)} disabled={sending} className="bx-ghost inline-flex items-center gap-2 px-4 sm:px-5">
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10 3.5L5.5 8l4.5 4.5" />
                    </svg>
                    Back
                  </button>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  aria-busy={sending}
                  className="bx-cta sx-join-sheen inline-flex flex-1 items-center justify-center gap-2.5 px-6 text-base sm:flex-none sm:px-9"
                >
                  {step === REVIEW ? (
                    sending ? (
                      <>
                        <span className="bx-spin" aria-hidden />
                        Sending…
                      </>
                    ) : (
                      "Send to BTG"
                    )
                  ) : toReview ? (
                    "Back to review"
                  ) : (
                    "Continue"
                  )}
                  {!sending && (
                    <svg viewBox="0 0 16 16" className="bx-arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="mt-3 text-[12px] text-faint">No card and no payment. Nothing is charged now.</p>
            </div>
          </form>
        </div>
      )}
    </FocusShell>
  );
}

/* ---------------------------------------------------------------- sent */

function SentScreen({ sent, name, draft }: { sent: Sent; name: string; draft: BuilderDraft }) {
  const said = submittedMessage(sent.status);
  const waiting = sent.waitingOn === "ATHLETES" ? athletesWaitingText({ package: null, sports: draft.sports, stateCodes: draft.states }) : null;
  return (
    <main className="relative mx-auto w-full max-w-2xl flex-1 px-5 pb-16 pt-10 sm:px-8 lg:pt-14">
      {said.approved && <Confetti />}
      <div className="bx-check">
        <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 12.5l4 4 8-9" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.35s" } as CSSProperties} />
        </svg>
      </div>
      <h1 className="mt-7 text-[clamp(2.2rem,6vw,3.6rem)] font-semibold leading-[1.04] tracking-tight">
        <Words text={said.approved ? "Campaign approved." : "Campaign sent."} />
      </h1>
      <p className="bx-rise mt-4 max-w-xl text-base leading-relaxed text-muted" style={delay(0.2)}>
        {name ? <span className="font-semibold text-text">{name}. </span> : null}
        {said.approved ? said.body : `${sent.status.text}. You can follow it on your Requests page.`}
      </p>
      {waiting && (
        <p role="status" className="bx-panel bx-rise mt-6 p-5 text-sm leading-relaxed text-text" style={delay(0.28)}>
          {waiting}
        </p>
      )}
      <div className="bx-rise mt-10 flex flex-wrap items-center gap-3" style={delay(0.36)}>
        <Link
          href={said.approved ? "/sponsor/campaigns" : `/sponsor/requests/${encodeURIComponent(sent.id)}`}
          className="bx-cta sx-join-sheen inline-flex items-center justify-center gap-2.5 px-6 text-sm"
        >
          {said.approved ? "Open your campaigns" : "See your request"}
          <svg viewBox="0 0 16 16" className="bx-arrow size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </Link>
        <Link href="/sponsor" className="bx-ghost inline-flex items-center px-5 text-sm">
          Back to your dashboard
        </Link>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- one medium field */

function MediaField({
  job,
  f,
  typed,
  errors,
  onChange,
}: {
  job: BuilderJob;
  f: BuilderField;
  typed: MediaDraft;
  errors: Record<string, string>;
  onChange: (field: string, value: string | boolean) => void;
}) {
  const w = fieldWords(job.jobId, f.field);
  const key = `media.${job.jobId}.${f.field}`;
  const text = typeof typed[f.field] === "string" ? (typed[f.field] as string) : "";
  const error = errors[key];
  switch (f.kind) {
    case "integer":
    case "number":
      return (
        <Box
          field={key}
          label={w.label}
          unit={w.unit}
          hint={w.hint ?? (f.min !== undefined && f.max !== undefined ? `From ${f.min} to ${f.max}.` : undefined)}
          inputMode={f.kind === "number" ? "decimal" : "numeric"}
          value={text}
          error={error}
          onChange={(v) => onChange(f.field, v)}
        />
      );
    case "choice": {
      const options = (f.choices ?? []).map((c) => ({ value: c, label: choiceWord(c) }));
      return options.length > 4 ? (
        <Pick field={key} label={w.label} hint={w.hint} value={text} error={error} options={options} onChange={(v) => onChange(f.field, v)} />
      ) : (
        <ChipOne field={key} label={w.label} hint={w.hint} value={text} error={error} options={options} onPick={(v) => onChange(f.field, v)} />
      );
    }
    case "boolean":
      return <YesNo field={key} label={w.label} hint={w.hint} value={typed[f.field] === true} onChange={(v) => onChange(f.field, v)} />;
    case "date":
      return <Box field={key} label={w.label} hint={w.hint} type="date" value={text} error={error} onChange={(v) => onChange(f.field, v)} />;
    case "datetime":
      return <Box field={key} label={w.label} hint={w.hint} type="datetime-local" value={text} error={error} onChange={(v) => onChange(f.field, v)} />;
    case "list":
      return (
        <fieldset data-field={key} className="sm:col-span-2" aria-describedby={error ? `err-${key}` : undefined}>
          <legend className="text-sm font-medium text-muted">{w.label}</legend>
          {w.hint && <p className="mt-1 text-[12px] text-faint">{w.hint}</p>}
          <div className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {mixJobs(job).map((id) => (
              <Box
                key={id}
                field={`${key}.${id}`}
                label={isJobId(id) ? JOB_NAME[id] : id}
                unit="a month"
                inputMode="numeric"
                placeholder="0"
                value={typeof typed[`mix:${id}`] === "string" ? (typed[`mix:${id}`] as string) : ""}
                onChange={(v) => onChange(`mix:${id}`, v)}
              />
            ))}
          </div>
          <Problem id={`err-${key}`} text={error} />
        </fieldset>
      );
    case "text?":
      return (
        <Area field={key} label={w.label} hint={w.hint} optional className="sm:col-span-2" rows={2} maxLength={f.max} value={text} error={error} onChange={(v) => onChange(f.field, v)} />
      );
    default:
      return (f.max ?? 0) >= 400 ? (
        <Area field={key} label={w.label} hint={w.hint} className="sm:col-span-2" rows={2} maxLength={f.max} value={text} error={error} onChange={(v) => onChange(f.field, v)} />
      ) : (
        <Box field={key} label={w.label} hint={w.hint} className="sm:col-span-2" maxLength={f.max} value={text} error={error} onChange={(v) => onChange(f.field, v)} />
      );
  }
}

/* ---------------------------------------------------------------- small parts */

type Common = { field: string; label: string; hint?: string; error?: string; optional?: boolean; className?: string; style?: CSSProperties };
type Option = { value: string; label: string };

const idOf = (field: string) => `cb-${field.replace(/[^A-Za-z0-9_-]/g, "-")}`;

function FieldLabel({ htmlFor, label, optional }: { htmlFor?: string; label: string; optional?: boolean }) {
  const inner = (
    <>
      {label}
      {optional && <span className="text-[12px] font-normal text-faint">Optional</span>}
    </>
  );
  return htmlFor ? (
    <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium text-muted">
      {inner}
    </label>
  ) : (
    <p className="flex items-baseline gap-2 text-sm font-medium text-muted">{inner}</p>
  );
}

function Below({ field, hint, error }: { field: string; hint?: string; error?: string }) {
  const id = idOf(field);
  return (
    <>
      {hint && !error && (
        <p id={`hint-${id}`} className="mt-2 text-[12px] leading-relaxed text-faint">
          {hint}
        </p>
      )}
      <Problem id={`err-${id}`} text={error} />
    </>
  );
}
const describedBy = (field: string, hint?: string, error?: string) => (error ? `err-${idOf(field)}` : hint ? `hint-${idOf(field)}` : undefined);

/** A typed answer in a box; with `unit`, a short number and its unit after it. */
function Box({
  field,
  label,
  hint,
  error,
  optional,
  className = "",
  style,
  value,
  onChange,
  onEnter,
  type = "text",
  inputMode,
  placeholder,
  maxLength,
  unit,
}: Common & {
  value: string;
  onChange: (value: string) => void;
  /** Enter does this instead of moving to the next step (the "Add your own" field). */
  onEnter?: () => void;
  type?: "text" | "date" | "datetime-local";
  inputMode?: "text" | "numeric" | "decimal";
  placeholder?: string;
  maxLength?: number;
  unit?: string;
}) {
  const id = idOf(field);
  const input = (
    <input
      id={id}
      type={type}
      name={field}
      data-field={field}
      inputMode={inputMode}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength ?? (unit ? 6 : undefined)}
      autoComplete="off"
      aria-invalid={!!error}
      aria-describedby={describedBy(field, hint, error)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onEnter
          ? (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              onEnter();
            }
          : undefined
      }
      className="cb-input"
    />
  );
  return (
    <div className={className} style={style}>
      <FieldLabel htmlFor={id} label={label} optional={optional} />
      <div className="mt-2">
        {unit ? (
          <div className="cb-unit">
            {input}
            <span>{unit}</span>
          </div>
        ) : (
          input
        )}
      </div>
      <Below field={field} hint={hint} error={error} />
    </div>
  );
}

function Area({
  field,
  label,
  hint,
  error,
  optional,
  className = "",
  style,
  value,
  onChange,
  rows = 4,
  placeholder,
  maxLength,
}: Common & { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; maxLength?: number }) {
  const id = idOf(field);
  return (
    <div className={className} style={style}>
      <FieldLabel htmlFor={id} label={label} optional={optional} />
      <textarea
        id={id}
        name={field}
        data-field={field}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={!!error}
        aria-describedby={describedBy(field, hint, error)}
        onChange={(e) => onChange(e.target.value)}
        className="cb-input mt-2"
      />
      <Below field={field} hint={hint} error={error} />
    </div>
  );
}

function Pick({ field, label, hint, error, optional, className = "", style, value, options, onChange }: Common & { value: string; options: Option[]; onChange: (value: string) => void }) {
  const id = idOf(field);
  return (
    <div className={className} style={style}>
      <FieldLabel htmlFor={id} label={label} optional={optional} />
      <select
        id={id}
        name={field}
        data-field={field}
        value={value}
        aria-invalid={!!error}
        aria-describedby={describedBy(field, hint, error)}
        onChange={(e) => onChange(e.target.value)}
        className="cb-input mt-2"
      >
        {!options.some((o) => o.value === value) && <option value={value}>Pick one</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Below field={field} hint={hint} error={error} />
    </div>
  );
}

/** Any number of a few: each chip is on or off. */
function ChipSet({
  field,
  label,
  hint,
  error,
  optional,
  className = "",
  style,
  options,
  values,
  onToggle,
  after,
}: Common & { options: Option[]; values: string[]; onToggle: (value: string) => void; after?: ReactNode }) {
  return (
    <div className={className} style={style} role="group" aria-label={label} aria-describedby={describedBy(field, hint, error)} data-field={field}>
      <FieldLabel label={label} optional={optional} />
      <div className="mt-3 flex flex-wrap gap-2.5">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={values.includes(o.value)} onClick={() => onToggle(o.value)} className="bx-chip">
            {o.label}
          </button>
        ))}
        {after}
      </div>
      <Below field={field} hint={hint} error={error} />
    </div>
  );
}

/* The WAI-ARIA radio-group keys: one tab stop, arrows move and select. */
function onRadioKeys(e: React.KeyboardEvent<HTMLDivElement>) {
  const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (move === undefined && e.key !== "Home" && e.key !== "End") return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  if (radios.length === 0) return;
  e.preventDefault();
  const at = radios.indexOf(document.activeElement as HTMLButtonElement);
  const next = e.key === "Home" ? 0 : e.key === "End" ? radios.length - 1 : (Math.max(at, 0) + (move ?? 0) + radios.length) % radios.length;
  radios[next].focus();
  radios[next].click();
}

/** One of a few. */
function ChipOne({ field, label, hint, error, className = "", style, options, value, onPick }: Common & { options: Option[]; value: string; onPick: (value: string) => void }) {
  return (
    <div className={className} style={style}>
      <FieldLabel label={label} />
      <div role="radiogroup" aria-label={label} aria-describedby={describedBy(field, hint, error)} data-field={field} onKeyDown={onRadioKeys} className="mt-3 flex flex-wrap gap-2.5">
        {options.map((o, i) => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on || (!options.some((x) => x.value === value) && i === 0) ? 0 : -1} onClick={() => onPick(o.value)} className="bx-chip">
              {o.label}
            </button>
          );
        })}
      </div>
      <Below field={field} hint={hint} error={error} />
    </div>
  );
}

function YesNo({ field, label, hint, className = "", style, value, onChange }: Common & { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <ChipOne
      field={field}
      label={label}
      hint={hint}
      className={className}
      style={style}
      value={value ? "yes" : "no"}
      options={[
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" },
      ]}
      onPick={(v) => onChange(v === "yes")}
    />
  );
}

function Tick() {
  return (
    <span className="bx-tick" aria-hidden>
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="#0a0c10" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} />
      </svg>
    </span>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mr-2 min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-accent-soft underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
    >
      Edit<span className="sr-only"> {label}</span>
    </button>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-start gap-4 py-2.5">
      <dt className="w-[92px] shrink-0 pt-0.5 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-medium text-text [overflow-wrap:anywhere]">{value}</dd>
      {onEdit && <EditButton label={label.toLowerCase()} onClick={onEdit} />}
    </div>
  );
}
