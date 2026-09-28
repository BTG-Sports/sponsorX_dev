"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge, Card, Meter } from "@/components/ui";
import {
  agreements,
  athlete,
  athletePublic,
  money,
  profileChecklist,
  rates,
} from "@/lib/fixtures";
import {
  CHECKLIST_SECTION,
  SECTIONS,
  type SectionKey,
} from "@/lib/profile-sections";

/* --------------------------------------------------------------------------
   Profile editor — the §11 sections as an editable hub (2026-09-14).

   Prototype ahead of P3-BE-01/05 + P3-FE-03: a hub (not a wizard — editing
   is random-access, only first-run onboarding is linear) with the nine §11
   sections in a rail, one form pane at a time. Every section is labelled
   Public (renders on /athletes/[slug]) or Private (BTG-internal), because
   "who sees this?" is the first question every athlete asks.

   The managed-marketplace model (§10) shapes the save semantics: Save marks
   the section complete and queues it for BTG review — nothing claims to go
   live instantly. Edits are client state only (fixtures are static), and the
   page says so.

   Two §26 rules are load-bearing here: the rate card is confirmed, never
   edited (BTG sets rates; the athlete's rate never renders publicly), and
   the payment section holds NO bank details and NO tax ID — payouts happen
   outside SponsorX in Phase 1 (stack decision A6).

   Active section lives in the URL (?section=, history.replaceState — the
   house idiom) so refresh keeps your place and links can deep-link a section.
   -------------------------------------------------------------------------- */

const isSection = (v: string | undefined): v is SectionKey =>
  SECTIONS.some((s) => s.key === v);

const INTEREST_OPTIONS = [
  "Training", "Sneakers", "Faith", "Leadership", "Gaming", "Fitness",
  "Nutrition", "Fashion", "Tech", "Community", "Music", "Education",
];

/** §26 exclusion categories the conflict check runs against. */
const RESTRICTION_OPTIONS = [
  "Alcohol", "Gambling & betting", "Tobacco & vaping", "Cannabis",
  "Crypto & trading", "Political", "Energy drinks", "Fast food",
];

/* ------------------------------------------------------------- primitives */

const INPUT_CLS =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none transition-colors focus:border-athlete/50 focus-visible:ring-2 focus-visible:ring-athlete/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-text">{label}</span>
      {hint && <span className="mt-0.5 block text-[10px] text-faint">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
        active
          ? "border-athlete/40 bg-athlete/10 text-text"
          : "border-line bg-surface text-muted hover:text-text",
      ].join(" ")}
    >
      {active ? "✓ " : ""}
      {children}
    </button>
  );
}

function ScopeChip({ scope }: { scope: "public" | "private" }) {
  return scope === "public" ? (
    <Badge tone="primary">Public — on your profile</Badge>
  ) : (
    <Badge tone="neutral">Private — BTG only</Badge>
  );
}

function LockNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 size-3.5 shrink-0 text-muted"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 1 1 8 0v4" />
      </svg>
      <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- editor */

export function ProfileEditor({ initialSection }: { initialSection?: string }) {
  const [active, setActive] = useState<SectionKey>(
    isSection(initialSection) ? initialSection : "identity",
  );

  /* Done-state seeds from the fixture checklist and updates live as
     sections are saved — the rail and the meter respond instantly. */
  const [done, setDone] = useState<Record<SectionKey, boolean>>(() =>
    Object.fromEntries(
      profileChecklist.map((c) => [CHECKLIST_SECTION[c.label], c.done]),
    ) as Record<SectionKey, boolean>,
  );

  /* Transient per-section "Saved" confirmation. */
  const [savedFlash, setSavedFlash] = useState<SectionKey | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSaved = (key: SectionKey) => {
    setDone((d) => ({ ...d, [key]: true }));
    setSavedFlash(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(null), 2500);
  };
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  /* ---- form state, seeded from fixtures ---- */
  const [identity, setIdentity] = useState({
    displayName: athlete.displayName,
    region: athlete.region,
    bio: athletePublic.about,
  });
  const [sport, setSport] = useState({
    sport: athlete.sport,
    position: athlete.position,
    school: athlete.school,
  });
  const [socialRows, setSocialRows] = useState(
    [
      { platform: "Instagram", handle: "@shammah", followers: "128000" },
      { platform: "TikTok", handle: "@shammahk", followers: "64500" },
      { platform: "YouTube", handle: "@shammahkwizera", followers: "9200" },
    ],
  );
  const [capabilities, setCapabilities] = useState<Set<string>>(
    () => new Set(athletePublic.inventory.map((i) => i.jobId)),
  );
  const [interests, setInterests] = useState<Set<string>>(
    () => new Set(athletePublic.interests),
  );
  const [restrictions, setRestrictions] = useState<{
    none: boolean;
    categories: Set<string>;
    note: string;
  }>({ none: false, categories: new Set(), note: "" });
  const [ratesConfirmed, setRatesConfirmed] = useState(false);
  const [payment, setPayment] = useState({ payee: "", email: "" });
  const [agreementRead, setAgreementRead] = useState(false);
  const [agreementSigned, setAgreementSigned] = useState(false);

  /* Active section in the URL without navigation. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (active === "identity") p.delete("section");
    else p.set("section", active);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [active]);

  const doneCount = SECTIONS.filter((s) => done[s.key]).length;
  const completion = Math.round((doneCount / SECTIONS.length) * 100);
  const section = SECTIONS.find((s) => s.key === active)!;

  /* ---- per-section validity: Save enables only when it would succeed ---- */
  const valid: Record<SectionKey, boolean> = {
    identity: identity.displayName.trim().length > 0,
    sport: sport.sport.trim().length > 0,
    socials: socialRows.every((r) => r.handle.trim().length > 0),
    capabilities: capabilities.size > 0,
    interests: interests.size > 0,
    restrictions: restrictions.none || restrictions.categories.size > 0,
    rates: ratesConfirmed,
    payment: payment.payee.trim().length > 0 && payment.email.includes("@"),
    agreements: agreementSigned,
  };

  const toggle = (set: Set<string>, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const railItem = (s: (typeof SECTIONS)[number], compact: boolean) => {
    const isActive = s.key === active;
    return (
      <button
        key={s.key}
        type="button"
        onClick={() => setActive(s.key)}
        aria-current={isActive ? "true" : undefined}
        className={[
          compact
            ? "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors"
            : "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors",
          isActive
            ? compact
              ? "border-athlete/40 bg-athlete/10 text-text"
              : "bg-athlete/10 text-text"
            : compact
              ? "border-line bg-surface text-muted hover:text-text"
              : "text-muted hover:bg-surface-2/70 hover:text-text",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold",
            done[s.key]
              ? "bg-accent/15 text-accent"
              : "border border-line text-faint",
          ].join(" ")}
        >
          {done[s.key] ? "✓" : ""}
        </span>
        {s.label}
      </button>
    );
  };

  const saveBar = (key: SectionKey, invalidHint: string) => (
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
      <button
        type="button"
        disabled={!valid[key]}
        onClick={() => markSaved(key)}
        className="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save section
      </button>
      {savedFlash === key ? (
        <span
          aria-live="polite"
          className="sx-pop inline-flex items-center gap-1.5 text-[11px] font-medium text-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
            <path d="m5 13 4 4L19 7" />
          </svg>
          Saved — queued for BTG review
        </span>
      ) : (
        !valid[key] && <span className="text-[11px] text-faint">{invalidHint}</span>
      )}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------------------------------------ rail */}
      {/* min-w-0: below lg the implicit grid track grew to the chip row's
          full width (~950px at 390), so the row's own overflow-x-auto never
          engaged and the whole editor ran off the phone (frontend audit). */}
      <aside className="min-w-0 lg:sticky lg:top-20">
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-semibold tabular-nums">{completion}%</span>
            <span className="text-[10px] text-muted">
              {doneCount}/{SECTIONS.length} sections
            </span>
          </div>
          <div className="mt-2">
            <Meter value={completion} tone="accent" />
          </div>
        </Card>

        {/* vertical rail ≥lg, scrollable chip row below */}
        <nav aria-label="Profile sections" className="mt-3 hidden space-y-0.5 lg:block">
          {SECTIONS.map((s) => railItem(s, false))}
        </nav>
        <nav
          aria-label="Profile sections"
          className="sx-snap-x mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
        >
          {SECTIONS.map((s) => railItem(s, true))}
        </nav>
      </aside>

      {/* ------------------------------------------------------------ pane */}
      <section className="min-w-0">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{section.label}</h2>
            <ScopeChip scope={section.scope} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{section.blurb}</p>

          <div className="mt-5 space-y-4">
            {/* -------------------------------------------------- identity */}
            {active === "identity" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Display name" hint="Shown as your profile headline.">
                    <input
                      className={INPUT_CLS}
                      value={identity.displayName}
                      onChange={(e) => setIdentity({ ...identity, displayName: e.target.value })}
                    />
                  </Field>
                  <Field label="Region" hint="Where you compete and live.">
                    <input
                      className={INPUT_CLS}
                      value={identity.region}
                      onChange={(e) => setIdentity({ ...identity, region: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Bio" hint="2–3 sentences — sponsors read this first.">
                  <textarea
                    rows={3}
                    className={`${INPUT_CLS} resize-y`}
                    value={identity.bio}
                    onChange={(e) => setIdentity({ ...identity, bio: e.target.value })}
                  />
                </Field>
                <Field label="Profile photo">
                  <button
                    type="button"
                    title="Uploads go direct to R2 via presigned URL — not wired in the prototype"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-4 text-[11px] text-muted transition-colors hover:border-athlete/40 hover:text-text"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                      <path d="M12 16V4m0 0 4 4m-4-4L8 8M4 16v4h16v-4" />
                    </svg>
                    Upload a portrait — coming with the media pipeline
                  </button>
                </Field>
                {saveBar("identity", "Display name is required.")}
              </>
            )}

            {/* ----------------------------------------------------- sport */}
            {active === "sport" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Sport">
                    <input
                      className={INPUT_CLS}
                      value={sport.sport}
                      onChange={(e) => setSport({ ...sport, sport: e.target.value })}
                    />
                  </Field>
                  <Field label="Position">
                    <input
                      className={INPUT_CLS}
                      value={sport.position}
                      onChange={(e) => setSport({ ...sport, position: e.target.value })}
                    />
                  </Field>
                  <Field label="School / eligibility">
                    <input
                      className={INPUT_CLS}
                      value={sport.school}
                      onChange={(e) => setSport({ ...sport, school: e.target.value })}
                    />
                  </Field>
                </div>
                {saveBar("sport", "Sport is required.")}
              </>
            )}

            {/* --------------------------------------------------- socials */}
            {active === "socials" && (
              <>
                <div className="space-y-3">
                  {socialRows.map((row, i) => (
                    <div key={row.platform} className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_9rem] sm:items-end">
                      <p className="pb-2 text-xs font-medium">{row.platform}</p>
                      <Field label="Handle">
                        <input
                          className={INPUT_CLS}
                          value={row.handle}
                          onChange={(e) =>
                            setSocialRows(socialRows.map((r, j) => (j === i ? { ...r, handle: e.target.value } : r)))
                          }
                        />
                      </Field>
                      <Field label="Followers">
                        <input
                          className={INPUT_CLS}
                          inputMode="numeric"
                          value={row.followers}
                          onChange={(e) =>
                            setSocialRows(socialRows.map((r, j) => (j === i ? { ...r, followers: e.target.value.replace(/[^\d]/g, "") } : r)))
                          }
                        />
                      </Field>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-faint">
                  Counts you enter are labelled{" "}
                  <Badge tone="warn">self-reported</Badge> on your profile until
                  platform verification connects in Phase 3 (§22) — sponsors
                  always see which is which.
                </p>
                {saveBar("socials", "Every account needs a handle.")}
              </>
            )}

            {/* ---------------------------------------------- capabilities */}
            {active === "capabilities" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {rates.map((r) => (
                    <TogglePill
                      key={r.jobId}
                      active={capabilities.has(r.jobId)}
                      onClick={() => setCapabilities(toggle(capabilities, r.jobId))}
                    >
                      {r.name}
                    </TogglePill>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-faint">
                  Selected jobs appear as your Available Inventory at catalogue
                  prices (§5). Unselecting removes them from what sponsors can
                  request.
                </p>
                {saveBar("capabilities", "Pick at least one job you'll deliver.")}
              </>
            )}

            {/* ------------------------------------------------- interests */}
            {active === "interests" && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {INTEREST_OPTIONS.map((opt) => (
                    <TogglePill
                      key={opt}
                      active={interests.has(opt)}
                      onClick={() => setInterests(toggle(interests, opt))}
                    >
                      {opt}
                    </TogglePill>
                  ))}
                </div>
                <p className="text-[10px] leading-relaxed text-faint">
                  Shown on your public profile and used to route the right
                  briefs to you in matching.
                </p>
                {saveBar("interests", "Pick at least one interest.")}
              </>
            )}

            {/* ---------------------------------------------- restrictions */}
            {active === "restrictions" && (
              <>
                <LockNote>
                  Never shown to sponsors or fans. BTG runs every invitation
                  against this list before it reaches you (§26) — a declared
                  conflict means the invitation is never sent.
                </LockNote>
                <div className="flex flex-wrap gap-1.5">
                  {RESTRICTION_OPTIONS.map((opt) => (
                    <TogglePill
                      key={opt}
                      active={restrictions.categories.has(opt)}
                      onClick={() =>
                        setRestrictions({
                          ...restrictions,
                          none: false,
                          categories: toggle(restrictions.categories, opt),
                        })
                      }
                    >
                      {opt}
                    </TogglePill>
                  ))}
                </div>
                <Field label="Anything else?" hint="School policy, existing exclusivity, personal lines — plain words are fine.">
                  <textarea
                    rows={2}
                    className={`${INPUT_CLS} resize-y`}
                    value={restrictions.note}
                    onChange={(e) => setRestrictions({ ...restrictions, note: e.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={restrictions.none}
                    onChange={(e) =>
                      setRestrictions({
                        none: e.target.checked,
                        categories: e.target.checked ? new Set() : restrictions.categories,
                        note: restrictions.note,
                      })
                    }
                    className="size-3.5 accent-[var(--sx-primary)]"
                  />
                  I have no restrictions — I&rsquo;m explicitly saying so, not skipping this.
                </label>
                {saveBar("restrictions", "Declare at least one category, or confirm you have none.")}
              </>
            )}

            {/* ----------------------------------------------------- rates */}
            {active === "rates" && (
              <>
                <LockNote>
                  BTG sets these with you (your {athlete.tier} tier applies a{" "}
                  {athlete.tierMultiplier} multiplier — §6). Sponsors never see
                  these numbers; they see catalogue prices. To change a rate,
                  talk to your BTG manager — this screen only confirms them.
                </LockNote>
                <Card className="p-0">
                  <ul className="divide-y divide-line-soft">
                    {rates.map((r) => (
                      <li key={r.jobId} className="flex items-center gap-3 px-4 py-2.5">
                        <Badge tone="neutral">{r.jobId}</Badge>
                        <span className="min-w-0 flex-1 truncate text-xs">{r.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{money(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <label className="flex items-center gap-2 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={ratesConfirmed}
                    onChange={(e) => setRatesConfirmed(e.target.checked)}
                    className="size-3.5 accent-[var(--sx-primary)]"
                  />
                  These rates are correct and I&rsquo;m happy to work at them.
                </label>
                {saveBar("rates", "Tick the confirmation to save.")}
              </>
            )}

            {/* --------------------------------------------------- payment */}
            {active === "payment" && (
              <>
                <LockNote>
                  SponsorX never holds bank details or a tax ID (§26, stack
                  decision A6). Payouts are sent by BTG Finance outside the
                  platform — this section only says who to pay and where to
                  send the remittance note.
                </LockNote>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Legal payee name" hint="The person or company BTG Finance pays.">
                    <input
                      className={INPUT_CLS}
                      placeholder="e.g. Shammah Kwizera"
                      value={payment.payee}
                      onChange={(e) => setPayment({ ...payment, payee: e.target.value })}
                    />
                  </Field>
                  <Field label="Remittance email" hint="Where payment confirmations go.">
                    <input
                      type="email"
                      className={INPUT_CLS}
                      placeholder="you@example.com"
                      value={payment.email}
                      onChange={(e) => setPayment({ ...payment, email: e.target.value })}
                    />
                  </Field>
                </div>
                {saveBar("payment", "Payee name and a valid email are required.")}
              </>
            )}

            {/* ------------------------------------------------ agreements */}
            {active === "agreements" && (
              <>
                <Card className="p-0">
                  <ul className="divide-y divide-line-soft">
                    {agreements.map((ag) => (
                      <li key={ag.kind} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-accent" aria-hidden="true">✓</span>
                        <span className="min-w-0 flex-1 truncate text-xs">{ag.kind}</span>
                        <span className="text-[10px] text-faint">v{ag.version} · accepted {ag.acceptedAt}</span>
                      </li>
                    ))}
                    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span
                        aria-hidden="true"
                        className={agreementSigned ? "text-accent" : "text-warn"}
                      >
                        {agreementSigned ? "✓" : "!"}
                      </span>
                      <span className="min-w-0 flex-1 text-xs">
                        NIL Platform Terms{" "}
                        <span className="text-[10px] text-faint">v2 · updated for Phase 1</span>
                      </span>
                      {agreementSigned ? (
                        <Badge tone="accent">accepted just now</Badge>
                      ) : (
                        <Badge tone="warn">needs acceptance</Badge>
                      )}
                    </li>
                  </ul>
                </Card>
                {!agreementSigned && (
                  <>
                    <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                      <input
                        type="checkbox"
                        checked={agreementRead}
                        onChange={(e) => setAgreementRead(e.target.checked)}
                        className="mt-0.5 size-3.5 accent-[var(--sx-primary)]"
                      />
                      I&rsquo;ve read the NIL Platform Terms v2 and accept them.
                      Acceptance records the exact text shown, who accepted,
                      and when.
                    </label>
                    <button
                      type="button"
                      disabled={!agreementRead}
                      onClick={() => {
                        setAgreementSigned(true);
                        markSaved("agreements");
                      }}
                      className="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Accept &amp; sign
                    </button>
                  </>
                )}
                {agreementSigned && savedFlash === "agreements" && (
                  <p aria-live="polite" className="sx-pop text-[11px] font-medium text-accent">
                    ✓ Signed — click-wrap recorded for the demo.
                  </p>
                )}
                <p className="text-[10px] leading-relaxed text-faint">
                  Minors additionally need a verified guardian to authorize —
                  whether that requires true e-sign is an open legal decision,
                  so the guardian branch isn&rsquo;t prototyped here.
                </p>
              </>
            )}
          </div>
        </Card>

        {/* pane footer: previous / next section, so the hub also walks
            linearly for people who prefer a wizard feel */}
        <div className="mt-4 flex items-center justify-between">
          {(() => {
            const i = SECTIONS.findIndex((s) => s.key === active);
            const prev = SECTIONS[i - 1];
            const next = SECTIONS[i + 1];
            return (
              <>
                {prev ? (
                  <button
                    type="button"
                    onClick={() => setActive(prev.key)}
                    className="text-[11px] font-medium text-muted transition-colors hover:text-text"
                  >
                    ← {prev.label}
                  </button>
                ) : (
                  <span />
                )}
                {next ? (
                  <button
                    type="button"
                    onClick={() => setActive(next.key)}
                    className="text-[11px] font-medium text-muted transition-colors hover:text-text"
                  >
                    {next.label} →
                  </button>
                ) : (
                  <Link
                    href="/athlete/profile"
                    className="text-[11px] font-medium text-accent transition-colors hover:text-accent-soft"
                  >
                    Done — view your profile →
                  </Link>
                )}
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );
}
