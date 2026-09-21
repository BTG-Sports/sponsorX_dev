# `/join` Athlete Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `/join` page with the P1-ART-07 phone-first progressive wizard — ten §11 sections, the minor branch, localStorage drafts, click-wrap agreement, after-submit state — at awwwards-level motion polish.

**Architecture:** One client island (`join-wizard.tsx`) owning phase/step/answers state, driven by a pure, unit-tested flow module (`join-flow.ts`). Three rich sub-components (restrictions, agreement, submitted). Motion extends the existing `sx-*` CSS system in `globals.css`. Server page stays a thin frame reading `?demo=`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4 tokens (`--sx-*`), vitest 5 (new config), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-join-wizard-design.md`

**Deviation noted:** the spec says "Submitted state clears the draft"; we instead keep the stored record with `phase: "submitted"` so a refresh lands on the submitted screen and "Review your answers" still has answers. The *draft* (resumable form) is gone either way.

---

### Task 1: Vitest scaffold + failing join-flow tests

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/join-flow.test.ts`
- Modify: `package.json` (add `test` script)

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 2: Add the test script to `package.json`** — in `"scripts"`, after `"lint"`:

```json
    "test": "vitest run"
```

- [ ] **Step 3: Write the failing tests** — `tests/join-flow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RESTRICTION_CATEGORIES,
  emptyDraft,
  isMinor,
  parseDraft,
  validateSection,
  visibleSections,
} from "@/lib/join-flow";

const NOW = new Date("2026-09-21T12:00:00Z");

describe("isMinor", () => {
  it("is false on the 18th birthday", () => {
    expect(isMinor("2008-09-21", NOW)).toBe(false);
  });
  it("is true the day before the 18th birthday", () => {
    expect(isMinor("2008-09-22", NOW)).toBe(true);
  });
  it("is false for invalid or empty input", () => {
    expect(isMinor("", NOW)).toBe(false);
    expect(isMinor("not-a-date", NOW)).toBe(false);
  });
});

describe("visibleSections", () => {
  it("hides guardian for adults (9 sections)", () => {
    const ids = visibleSections(false).map((s) => s.id);
    expect(ids).toHaveLength(9);
    expect(ids).not.toContain("guardian");
  });
  it("inserts guardian for minors between restrictions and payment", () => {
    const ids = visibleSections(true).map((s) => s.id);
    expect(ids).toHaveLength(10);
    expect(ids.indexOf("guardian")).toBe(ids.indexOf("restrictions") + 1);
    expect(ids.indexOf("payment")).toBe(ids.indexOf("guardian") + 1);
  });
});

describe("validateSection", () => {
  const identity = visibleSections(true).find((s) => s.id === "identity")!;
  const social = visibleSections(true).find((s) => s.id === "social")!;

  it("requires identity fields and a parseable DOB and email", () => {
    const errs = validateSection(identity, {
      firstName: "Maya",
      lastName: "",
      dob: "banana",
      email: "no-at-sign",
      phone: "",
    });
    expect(errs.lastName).toBeTruthy();
    expect(errs.dob).toBeTruthy();
    expect(errs.email).toBeTruthy();
    expect(errs.firstName).toBeUndefined();
    expect(errs.phone).toBeUndefined(); // phone is optional
  });

  it("passes a complete identity", () => {
    const errs = validateSection(identity, {
      firstName: "Maya",
      lastName: "Okonkwo",
      dob: "2009-03-14",
      email: "maya@example.com",
      phone: "",
    });
    expect(Object.keys(errs)).toHaveLength(0);
  });

  it("social needs at least one handle", () => {
    expect(
      validateSection(social, { instagram: "", tiktok: "", youtube: "", followers: "" })
        .instagram,
    ).toBeTruthy();
    expect(
      Object.keys(
        validateSection(social, { instagram: "@maya", tiktok: "", youtube: "", followers: "" }),
      ),
    ).toHaveLength(0);
  });
});

describe("draft round-trip", () => {
  it("survives serialize → parse", () => {
    const d = emptyDraft();
    d.answers.firstName = "Maya";
    d.deals.push({ name: "Midwest Running Co.", category: "Footwear", terms: "exclusive · until Jun 2027" });
    d.excluded.push(RESTRICTION_CATEGORIES[0]);
    d.step = 3;
    d.phase = "steps";
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
  });
  it("rejects garbage and null", () => {
    expect(parseDraft("garbage")).toBeNull();
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 99 }))).toBeNull();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/join-flow`.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/join-flow.test.ts package.json
git commit -m "test(join): vitest scaffold + failing join-flow contract tests"
```

---

### Task 2: `src/lib/join-flow.ts` — pure flow module

**Files:**
- Create: `src/lib/join-flow.ts`

- [ ] **Step 1: Write the module**

```ts
/* --------------------------------------------------------------------------
   /join wizard flow (P1-ART-07 · §11 · §4). Pure data + logic, no React.

   The ten application sections, the one branch (a DOB under 18 inserts the
   guardian section and changes nothing else), per-section validation, and
   the localStorage draft shape. The wizard island renders from this; the
   eventual P3-FE-01 API wiring replaces only where answers go on submit.

   Agreement is click-wrap against v0.4 draft wording — G-05 stopped being a
   gate on 2026-09-15 (documentation/Design/athlete-onboarding/README.md).
   -------------------------------------------------------------------------- */

export type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "email" | "tel" | "date";
  required: boolean;
  half?: boolean; // render two-up on the row
  hint?: string; // sub-label, e.g. the §22 self-reported marker
};

export type SectionDef = {
  id: string;
  /** Rail label on the flow map. */
  title: string;
  /** Step screen heading. */
  heading: string;
  /** Step screen sub-line. */
  sub: string;
  kind: "fields" | "restrictions" | "agreement";
  minorOnly?: boolean;
  /** Extra line under the rail label on the flow map. */
  railNote?: string;
  fields: FieldDef[];
};

export const SECTIONS: SectionDef[] = [
  {
    id: "identity",
    title: "Identity",
    heading: "Who you are",
    sub: "Use your legal name — it has to match the agreement you sign at the end.",
    kind: "fields",
    fields: [
      { key: "firstName", label: "Legal first name", placeholder: "Maya", type: "text", required: true, half: true },
      { key: "lastName", label: "Legal last name", placeholder: "Okonkwo", type: "text", required: true, half: true },
      { key: "dob", label: "Date of birth", placeholder: "", type: "date", required: true },
      { key: "email", label: "Email", placeholder: "you@example.com", type: "email", required: true },
      { key: "phone", label: "Phone", placeholder: "(555) 000-0000", type: "tel", required: false },
    ],
  },
  {
    id: "sport",
    title: "Sport & team",
    heading: "Your sport",
    sub: "Where you play and at what level — sponsors are matched to this.",
    kind: "fields",
    fields: [
      { key: "sport", label: "Primary sport", placeholder: "Basketball", type: "text", required: true, half: true },
      { key: "position", label: "Position", placeholder: "Forward", type: "text", required: false, half: true },
      { key: "level", label: "Level", placeholder: "NCAA / High school / Club", type: "text", required: true },
      { key: "team", label: "Team or school", placeholder: "Riverside High", type: "text", required: true },
    ],
  },
  {
    id: "location",
    title: "Location",
    heading: "Where you are",
    sub: "Your home market, plus any secondary markets. Geography feeds matching (§13).",
    kind: "fields",
    fields: [
      { key: "city", label: "City", placeholder: "Silver Spring", type: "text", required: true, half: true },
      { key: "region", label: "State / region", placeholder: "MD", type: "text", required: true, half: true },
      { key: "country", label: "Country", placeholder: "USA", type: "text", required: true },
      { key: "markets", label: "Secondary markets", placeholder: "Optional — e.g. DC metro", type: "text", required: false },
    ],
  },
  {
    id: "social",
    title: "Social accounts",
    heading: "Your channels",
    sub: "At least one handle. Anything you type here is self-reported until verified (§22).",
    kind: "fields",
    fields: [
      { key: "instagram", label: "Instagram", placeholder: "@handle", type: "text", required: false },
      { key: "tiktok", label: "TikTok", placeholder: "@handle", type: "text", required: false },
      { key: "youtube", label: "YouTube", placeholder: "@handle", type: "text", required: false },
      { key: "followers", label: "Total followers", placeholder: "Optional", type: "text", required: false, hint: "Self-reported — verified after approval" },
    ],
  },
  {
    id: "capabilities",
    title: "Content capabilities",
    heading: "What you can make",
    sub: "Formats, turnaround and gear — campaign briefs are matched to this.",
    kind: "fields",
    fields: [
      { key: "formats", label: "Formats", placeholder: "Reels, stories, appearances", type: "text", required: true },
      { key: "turnaround", label: "Typical turnaround", placeholder: "3–5 days", type: "text", required: true, half: true },
      { key: "equipment", label: "Equipment", placeholder: "Optional — phone, ring light…", type: "text", required: false, half: true },
    ],
  },
  {
    id: "interests",
    title: "Brand interests",
    heading: "Brands you'd work with",
    sub: "A preference used for fit scoring — not a promise, and not exclusivity.",
    kind: "fields",
    fields: [
      { key: "categories", label: "Interested categories", placeholder: "Apparel, nutrition, local businesses", type: "text", required: true },
    ],
  },
  {
    id: "restrictions",
    title: "Restrictions & conflicts",
    heading: "Restrictions and conflicts",
    sub: "Every campaign is checked against this screen before it is shown to you. Anything declared here is blocked — not deprioritised.",
    kind: "restrictions",
    railNote: "Enforced on every campaign",
    fields: [],
  },
  {
    id: "guardian",
    title: "Guardian / authorized rep",
    heading: "Your guardian",
    sub: "Because you're under 18, a parent, guardian or authorized representative must confirm by email before you can accept a campaign (§4).",
    kind: "fields",
    minorOnly: true,
    fields: [
      { key: "guardianName", label: "Guardian legal name", placeholder: "Adaeze Okonkwo", type: "text", required: true },
      { key: "guardianRelation", label: "Relationship", placeholder: "Parent / legal guardian", type: "text", required: true },
      { key: "guardianEmail", label: "Guardian email", placeholder: "guardian@example.com", type: "email", required: true },
    ],
  },
  {
    id: "payment",
    title: "Payment recipient",
    heading: "Payment recipient",
    sub: "Who earnings are attributed to. Status only — money moves outside SponsorX in Phase 1.",
    kind: "fields",
    railNote: "Name only — no bank details",
    fields: [
      { key: "recipient", label: "Recipient name", placeholder: "Maya Okonkwo", type: "text", required: true },
    ],
  },
  {
    id: "agreement",
    title: "Agreement",
    heading: "The agreement",
    sub: "Content Collaboration Agreement · v0.4 draft · this wording is not final and will be reissued before launch.",
    kind: "agreement",
    fields: [],
  },
];

/** What §26/A6 never asks for — printed verbatim on the payment step. */
export const NEVER_ASKED =
  "SponsorX never asks for a bank account or routing number, a card, a Social Security number or a tax ID. Money moves outside the system in Phase 1.";

export const RESTRICTION_CATEGORIES = [
  "Betting",
  "Alcohol",
  "Energy drinks",
  "Supplements",
  "Crypto",
  "Weight loss",
] as const;

export type Deal = { name: string; category: string; terms: string };

export const AGREEMENT = {
  version: "v0.4 draft",
  checkbox: "I have read and accept the Content Collaboration Agreement (v0.4 draft).",
  recordNote:
    "Ticking the box records your acceptance, the date and time, and the exact version of the text shown above. You'll be emailed a copy.",
  clauses: [
    {
      title: "1. What this covers",
      body: "This agreement governs content you create for a brand through SponsorX. A separate brief is issued for each campaign and sits on top of these terms.",
    },
    {
      title: "2. Your content",
      body: "You own what you make. You grant the brand a licence to use the agreed content on the channels named in the campaign brief, for the period named there.",
    },
    {
      title: "3. Disclosure",
      body: "You will disclose paid partnerships as required by law and by the platform you post on. SponsorX will tell you what is required for each campaign.",
    },
    {
      title: "4. Eligibility",
      body: "You confirm the details in this application are true, and that if you are under 18 your guardian's confirmation is required before you accept a campaign.",
    },
    {
      title: "5. Ending it",
      body: "Either side can end this agreement in writing. Campaigns already accepted are completed under their own briefs.",
    },
  ],
} as const;

/* ------------------------------------------------------------------ logic */

/** Under 18 at `now`. Invalid or partial dates are NOT minors — the branch
    only opens on a parseable under-18 date of birth. */
export function isMinor(dob: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()),
  );
  return d.getTime() > cutoff.getTime();
}

/** The one branch: guardian appears only for minors. Everything else —
    numbering, progress segments — derives from this list. */
export function visibleSections(minor: boolean): SectionDef[] {
  return SECTIONS.filter((s) => !s.minorOnly || minor);
}

/** Per-field error messages; empty object = section passes. */
export function validateSection(
  section: SectionDef,
  answers: Record<string, string>,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of section.fields) {
    const v = (answers[f.key] ?? "").trim();
    if (f.required && !v) errs[f.key] = "Required";
  }
  if (section.id === "identity") {
    const dob = (answers.dob ?? "").trim();
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) errs.dob = "Enter a full date";
    const email = (answers.email ?? "").trim();
    if (email && !email.includes("@")) errs.email = "Enter a valid email";
  }
  if (section.id === "guardian") {
    const email = (answers.guardianEmail ?? "").trim();
    if (email && !email.includes("@")) errs.guardianEmail = "Enter a valid email";
  }
  if (section.id === "social") {
    const any = ["instagram", "tiktok", "youtube"].some((k) => (answers[k] ?? "").trim());
    if (!any) errs.instagram = "Add at least one handle";
  }
  return errs;
}

/* ------------------------------------------------------------------ draft */

export type JoinPhase = "intro" | "steps" | "submitted";

export type JoinDraft = {
  v: 1;
  phase: JoinPhase;
  step: number;
  answers: Record<string, string>;
  deals: Deal[];
  excluded: string[];
  accepted: boolean;
  /** ISO timestamp, set at submit. */
  submittedAt?: string;
};

export const DRAFT_KEY = "sx-join-draft-v1";

export function emptyDraft(): JoinDraft {
  return { v: 1, phase: "intro", step: 0, answers: {}, deals: [], excluded: [], accepted: false };
}

/** Safe parse: anything malformed → null (start fresh, never crash). */
export function parseDraft(raw: string | null): JoinDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as JoinDraft;
    if (
      d?.v !== 1 ||
      typeof d.step !== "number" ||
      typeof d.answers !== "object" ||
      !Array.isArray(d.deals) ||
      !Array.isArray(d.excluded) ||
      !["intro", "steps", "submitted"].includes(d.phase)
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS — 4 suites, all green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/join-flow.ts
git commit -m "feat(join): pure flow module — sections, minor branch, validation, draft (P1-ART-07)"
```

---

### Task 3: Wizard motion CSS

**Files:**
- Modify: `src/app/globals.css` (append at end of file)

- [ ] **Step 1: Append the motion block**

```css
/* --------------------------------------------------------------------------
   /join wizard motion (P1-ART-07, 2026-09-21). Same rules as the chart
   system above: final state lives in the DOM, every animation settles onto
   it, reduced motion kills all of it. One signature moment per screen; the
   only loop is the active progress segment's recessive breathe.
   -------------------------------------------------------------------------- */

/* Stage glow behind the phone column — primary up top, accent low-right.
   --sx-join-glow-b crossfades the accent in as the athlete passes the
   enforced section. Registered so the number itself transitions (gradients
   don't interpolate); the wizard writes the var onto .sx-join-stage
   directly (reveal.tsx precedent — DOM state React never owns). */
@property --sx-join-glow-b {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}
.sx-join-stage {
  position: relative;
  isolation: isolate;
  transition: --sx-join-glow-b 0.9s ease;
}
.sx-join-stage::before {
  content: "";
  position: absolute;
  top: -48px;
  left: 50%;
  width: min(620px, 100vw);
  height: 560px;
  transform: translateX(-50%);
  background:
    radial-gradient(58% 52% at 50% 0%, color-mix(in srgb, var(--sx-primary) 13%, transparent), transparent 72%),
    radial-gradient(46% 40% at 74% 82%, color-mix(in srgb, var(--sx-accent) calc(7% + var(--sx-join-glow-b, 0) * 8%), transparent), transparent 72%);
  filter: blur(10px);
  pointer-events: none;
  z-index: -1;
}

/* Cascade entrance — rows/fields ride --sx-d for stagger. */
@keyframes sx-join-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
.sx-join-rise { animation: sx-join-rise 0.5s var(--sx-ease) var(--sx-d, 0s) both; }

/* Directional step entrance — the wizard sets --sx-from per direction. */
@keyframes sx-join-step {
  from { opacity: 0; transform: translateX(var(--sx-from, 24px)); }
  to { opacity: 1; transform: none; }
}
.sx-join-step { animation: sx-join-step 0.38s var(--sx-ease) both; }

/* Intro rail draws top-to-bottom. */
@keyframes sx-join-rail { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.sx-join-rail { transform-origin: top; animation: sx-join-rail 0.9s var(--sx-ease) 0.15s both; }

/* Progress segments: fill wipes left→right; active breathes (recessive);
   inserting the guardian segment re-layouts via the flex transition. */
.sx-join-seg { position: relative; overflow: hidden; transition: background-color 0.3s ease; }
@keyframes sx-join-wipe { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.sx-join-seg--fill::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  transform-origin: left;
  animation: sx-join-wipe 0.45s var(--sx-ease) both;
}
@keyframes sx-join-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.sx-join-seg--active::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  animation: sx-join-breathe 2.4s ease-in-out 0.5s infinite;
}

/* Height-expand for the minor notice and the add-deal form (grid-rows trick). */
.sx-expand { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.45s var(--sx-ease); }
.sx-expand > * { overflow: hidden; min-height: 0; }
.sx-expand[data-open="true"] { grid-template-rows: 1fr; }

/* Stroke draw for checks/ticks — paths use pathLength=1. */
@keyframes sx-join-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
.sx-join-draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: sx-join-draw 0.7s var(--sx-ease) var(--sx-d, 0.1s) forwards;
}

/* CTA sheen — one sweep on hover, and once when the submit button arms. */
.sx-join-sheen { position: relative; overflow: hidden; }
.sx-join-sheen::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.35) 50%, transparent 65%);
  transform: translateX(-130%);
  pointer-events: none;
}
@keyframes sx-join-sweep { to { transform: translateX(130%); } }
.sx-join-sheen:hover::after { animation: sx-join-sweep 0.9s ease both; }
.sx-join-sheen[data-armed="true"]::after { animation: sx-join-sweep 0.9s ease 0.15s both; }

@media (prefers-reduced-motion: reduce) {
  .sx-join-rise,
  .sx-join-step,
  .sx-join-rail { animation: none; opacity: 1; transform: none; }
  .sx-join-seg--fill::after { animation: none; transform: none; }
  .sx-join-seg--active::after { animation: none; }
  .sx-join-draw { animation: none; stroke-dashoffset: 0; }
  .sx-join-sheen::after { display: none; }
  .sx-expand { transition: none; }
  .sx-join-stage::before { transition: none; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(join): wizard motion system — stage glow, step choreography, draws, sheen"
```

---

### Task 4: Restrictions step component

**Files:**
- Create: `src/components/join-restrictions-step.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { RESTRICTION_CATEGORIES, type Deal } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   Section 7 — the enforced one (P1-ART-07 comp 07). Existing deals as cards
   with a derived "blocked while active" line, a dashed add-row that expands
   into an inline form, and the six category chips. Declared = blocked, not
   deprioritised; the orange treatment is the enforcement signal (§26).
   -------------------------------------------------------------------------- */

export function JoinRestrictionsStep({
  deals,
  excluded,
  onDealsChange,
  onExcludedChange,
}: {
  deals: Deal[];
  excluded: string[];
  onDealsChange: (deals: Deal[]) => void;
  onExcludedChange: (excluded: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Deal>({ name: "", category: "", terms: "" });

  const commitDeal = () => {
    if (!form.name.trim() || !form.category.trim()) return;
    onDealsChange([...deals, { ...form, terms: form.terms.trim() || "terms not specified" }]);
    setForm({ name: "", category: "", terms: "" });
    setAdding(false);
  };

  const toggle = (cat: string) =>
    onExcludedChange(
      excluded.includes(cat) ? excluded.filter((c) => c !== cat) : [...excluded, cat],
    );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium text-muted">
          Sponsorships or deals you already have
        </p>
        <div className="mt-2 space-y-3">
          {deals.map((deal, i) => (
            <div
              key={`${deal.name}-${i}`}
              className="sx-join-rise rounded-xl border border-line bg-surface-2 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{deal.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {deal.category} · {deal.terms}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${deal.name}`}
                  onClick={() => onDealsChange(deals.filter((_, j) => j !== i))}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-accent">
                <svg viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M3.5 3.5l9 9" />
                </svg>
                {deal.category} campaigns are blocked while this is active
              </p>
            </div>
          ))}

          <div className="sx-expand" data-open={adding}>
            <div>
              <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted">Brand or deal name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Midwest Running Co."
                    className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Category</span>
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Footwear"
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Terms</span>
                    <input
                      type="text"
                      value={form.terms}
                      onChange={(e) => setForm({ ...form, terms: e.target.value })}
                      placeholder="exclusive · until Jun 2027"
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={commitDeal}
                    disabled={!form.name.trim() || !form.category.trim()}
                    className="rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-cta-ink transition-opacity disabled:opacity-40"
                  >
                    Add deal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded-lg px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3.5 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add another deal
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium text-muted">Categories you will not promote</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {RESTRICTION_CATEGORIES.map((cat) => {
            const on = excluded.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(cat)}
                className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
                  on
                    ? "border-accent/60 bg-accent/12 text-text"
                    : "border-line bg-surface-2 text-text hover:border-line/80 hover:bg-surface"
                }`}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded transition-colors ${
                    on ? "sx-pop bg-accent" : "bg-text"
                  }`}
                >
                  {on && (
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="var(--sx-cta-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
                    </svg>
                  )}
                </span>
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11px] text-faint">
        You can update restrictions at any time from your profile.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/join-restrictions-step.tsx
git commit -m "feat(join): restrictions step — deal cards, add-deal expand, category chips"
```

---

### Task 5: Agreement step component

**Files:**
- Create: `src/components/join-agreement-step.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { AGREEMENT } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   Section 10 — click-wrap (P1-ART-07 comp 10). Scrollable v0.4 draft terms,
   a real checkbox whose tick draws in, and the recording note. The Submit
   button itself lives in the wizard's action bar and is gated on `accepted`.
   G-05 stopped being a gate 2026-09-15 — the wording is draft, labelled so.
   -------------------------------------------------------------------------- */

export function JoinAgreementStep({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="max-h-[46vh] space-y-5 overflow-y-auto rounded-xl border border-line bg-surface-2 p-5">
        {AGREEMENT.clauses.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-text">{c.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3.5 rounded-xl border border-line bg-surface-2 p-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${
            accepted ? "bg-primary" : "bg-text"
          }`}
        >
          {accepted && (
            <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-cta-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
            </svg>
          )}
        </span>
        <span className="text-sm leading-relaxed text-text">{AGREEMENT.checkbox}</span>
      </label>

      <p className="text-xs leading-relaxed text-faint">{AGREEMENT.recordNote}</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/join-agreement-step.tsx
git commit -m "feat(join): agreement step — scrollable v0.4 click-wrap with drawn tick"
```

---

### Task 6: Submitted view component

**Files:**
- Create: `src/components/join-submitted.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

/* --------------------------------------------------------------------------
   After submit (P1-ART-07 comp 11). Submission is not approval: a person at
   BTG reads every application. The guardian-pending card (minors, §4) blocks
   accepting a campaign, not the review itself — the copy says so in bold.
   The 900ms entrance: check draws, timeline cascades, guardian card rises.
   -------------------------------------------------------------------------- */

const TIMELINE = [
  { key: "submitted", title: "Submitted", tone: "success" },
  { key: "review", title: "Under review", sub: "Reviewed by hand. We'll email you either way.", tone: "warn" },
  { key: "decision", title: "Decision", sub: "Accepted, or declined with a reason.", tone: "muted" },
] as const;

export function JoinSubmitted({
  minor,
  guardianName,
  submittedAt,
  onReviewAnswers,
  onUpdateRestrictions,
}: {
  minor: boolean;
  guardianName: string;
  submittedAt: string;
  onReviewAnswers: () => void;
  onUpdateRestrictions: () => void;
}) {
  const when = new Date(submittedAt);
  const stamp = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="px-6 py-10">
      <div className="sx-join-rise grid size-16 place-items-center rounded-full border-2 border-success/50">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12.5l4 4 8-9" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.15s" } as React.CSSProperties} />
        </svg>
      </div>

      <h1 className="sx-join-rise mt-6 text-3xl font-semibold tracking-tight" style={{ "--sx-d": "0.1s" } as React.CSSProperties}>
        Application submitted
      </h1>
      <p className="sx-join-rise mt-3 text-sm leading-relaxed text-muted" style={{ "--sx-d": "0.18s" } as React.CSSProperties}>
        Submitting isn&apos;t approval. A person at BTG reads every application —
        usually within 3 business days.
      </p>

      <div className="mt-8 border-t border-line pt-8">
        <ol className="space-y-7">
          {TIMELINE.map((t, i) => (
            <li key={t.key} className="sx-join-rise relative flex gap-5 pl-1" style={{ "--sx-d": `${0.3 + i * 0.12}s` } as React.CSSProperties}>
              {i < TIMELINE.length - 1 && (
                <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%+8px)] w-px bg-line" />
              )}
              <span
                aria-hidden
                className={`relative z-10 mt-1 size-[21px] shrink-0 rounded-full ${
                  t.tone === "success"
                    ? "bg-success"
                    : t.tone === "warn"
                      ? "border-2 border-warn bg-bg"
                      : "border-2 border-line bg-bg"
                }`}
              />
              <div>
                <p className={`text-base font-semibold ${t.tone === "warn" ? "text-warn" : t.tone === "muted" ? "text-muted" : "text-text"}`}>
                  {t.title}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {t.key === "submitted" ? stamp : "sub" in t ? t.sub : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {minor && (
        <div
          className="sx-join-rise mt-8 rounded-xl border border-warn/45 border-l-2 border-l-warn bg-surface-2 p-5"
          style={{ "--sx-d": "0.7s" } as React.CSSProperties}
        >
          <p className="flex items-center gap-2.5 text-base font-semibold text-text">
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="var(--sx-warn)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5V8l2.5 1.5" />
            </svg>
            Waiting on your guardian
          </p>
          <p className="mt-2 text-sm leading-relaxed text-warn">
            {guardianName || "Your guardian"} hasn&apos;t confirmed yet. This does{" "}
            <strong className="font-semibold">not</strong> hold up your review — it only stops
            you accepting a campaign once you&apos;re approved.
          </p>
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-warn/60 px-4 py-2.5 text-sm font-semibold text-warn transition-colors hover:bg-warn/10"
            >
              Resend email
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              Change guardian
            </button>
          </div>
        </div>
      )}

      <div className="mt-10">
        <p className="text-[11px] font-medium text-muted">While you wait</p>
        <div className="mt-2 space-y-3">
          {[
            { label: "Review your answers", onClick: onReviewAnswers },
            { label: "Update restrictions", onClick: onUpdateRestrictions },
          ].map((row, i) => (
            <button
              key={row.label}
              type="button"
              onClick={row.onClick}
              className="sx-join-rise flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-4 text-left text-sm font-medium text-text transition-colors hover:bg-surface"
              style={{ "--sx-d": `${0.85 + i * 0.08}s` } as React.CSSProperties}
            >
              {row.label}
              <svg viewBox="0 0 16 16" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5L10.5 8 6 12.5" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/join-submitted.tsx
git commit -m "feat(join): submitted view — drawn check, review timeline, guardian-pending card"
```

---

### Task 7: The wizard island

**Files:**
- Create: `src/components/join-wizard.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  DRAFT_KEY,
  NEVER_ASKED,
  SECTIONS,
  emptyDraft,
  isMinor,
  parseDraft,
  validateSection,
  visibleSections,
  type FieldDef,
  type JoinDraft,
} from "@/lib/join-flow";
import { JoinAgreementStep } from "./join-agreement-step";
import { JoinRestrictionsStep } from "./join-restrictions-step";
import { JoinSubmitted } from "./join-submitted";

/* --------------------------------------------------------------------------
   The /join wizard island (P1-ART-07). intro → steps → submitted, one §11
   section per screen, the §4 guardian branch inserted live by the DOB on
   section 1, drafts in localStorage after every commit ("saved after every
   section" — actually true). Fixtures-only: submit transitions state, no
   POST — P3-FE-01 wires the API and replaces only where answers go.

   Motion rides the sx-join-* system in globals.css; direction is a CSS var;
   focus moves to the step heading on every transition so screen readers
   track the step change.
   -------------------------------------------------------------------------- */

type Demo = "submitted" | "minor" | null;

function seed(demo: Demo): JoinDraft {
  const d = emptyDraft();
  if (demo === "minor") {
    d.phase = "steps";
    d.answers.dob = "2009-03-14";
    d.answers.firstName = "Maya";
    d.answers.lastName = "Okonkwo";
  }
  if (demo === "submitted") {
    d.phase = "submitted";
    d.answers = {
      firstName: "Maya", lastName: "Okonkwo", dob: "2009-03-14",
      email: "maya.okonkwo@example.com", guardianName: "Adaeze Okonkwo",
      guardianRelation: "Parent", guardianEmail: "adaeze@example.com",
    };
    d.accepted = true;
    d.submittedAt = "2026-09-17T16:12:00";
  }
  return d;
}

export function JoinWizard({ demo }: { demo: Demo }) {
  const [draft, setDraft] = useState<JoinDraft>(() => seed(demo));
  const [dir, setDir] = useState<1 | -1>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
  const [reviewing, setReviewing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  /* Hydrate a stored draft (not in demo mode). */
  useEffect(() => {
    if (demo) return;
    const stored = parseDraft(localStorage.getItem(DRAFT_KEY));
    if (stored) setDraft(stored);
  }, [demo]);

  /* Persist + saved-indicator theatre. */
  const persist = (next: JoinDraft) => {
    setDraft(next);
    if (!demo) localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    setSave("saving");
    window.setTimeout(() => setSave("saved"), 350);
  };

  const minor = isMinor(draft.answers.dob ?? "");
  const sections = visibleSections(minor);
  const section = sections[Math.min(draft.step, sections.length - 1)];
  const restrictionsIdx = sections.findIndex((s) => s.id === "restrictions");
  const pastEnforced = draft.step > restrictionsIdx;

  /* Focus the heading on step / phase changes. */
  useEffect(() => {
    if (draft.phase === "steps") headingRef.current?.focus({ preventScroll: true });
  }, [draft.step, draft.phase]);

  /* Glow crossfade: the ::before lives on the page-level .sx-join-stage
     ancestor, so write the var there directly (reveal.tsx precedent). */
  useEffect(() => {
    document
      .querySelector<HTMLElement>(".sx-join-stage")
      ?.style.setProperty(
        "--sx-join-glow-b",
        draft.phase === "steps" && pastEnforced ? "1" : "0",
      );
  }, [draft.phase, pastEnforced]);

  const setAnswer = (key: string, value: string) =>
    setDraft({ ...draft, answers: { ...draft.answers, [key]: value } });

  const goNext = () => {
    const errs = validateSection(section, draft.answers);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = section.fields.find((f) => errs[f.key]);
      if (first)
        stepRef.current
          ?.querySelector<HTMLInputElement>(`[name="${first.key}"]`)
          ?.focus();
      return;
    }
    setDir(1);
    if (section.kind === "agreement") {
      persist({ ...draft, phase: "submitted", submittedAt: new Date().toISOString() });
    } else {
      persist({ ...draft, step: draft.step + 1 });
    }
  };

  const goBack = () => {
    setErrors({});
    setDir(-1);
    if (draft.step === 0) persist({ ...draft, phase: "intro" });
    else persist({ ...draft, step: draft.step - 1 });
  };

  const finishLater = () => persist({ ...draft, phase: "intro" });

  const startOrResume = () => {
    setDir(1);
    persist({ ...draft, phase: "steps" });
  };

  const startOver = () => {
    setDir(1);
    persist({ ...emptyDraft(), phase: "steps" });
  };

  /* ------------------------------------------------------------ submitted */
  if (draft.phase === "submitted") {
    if (reviewing) {
      return (
        <div className="px-6 py-10">
          <button
            type="button"
            onClick={() => setReviewing(false)}
            className="flex min-h-11 items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
            Back
          </button>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Your answers</h1>
          <p className="mt-1 text-sm text-muted">Read-only — the application is with BTG.</p>
          <div className="mt-6 space-y-6">
            {sections
              .filter((s) => s.fields.length > 0)
              .map((s) => (
                <div key={s.id} className="rounded-xl border border-line bg-surface-2 p-4">
                  <h2 className="text-sm font-semibold">{s.title}</h2>
                  <dl className="mt-3 space-y-2">
                    {s.fields.map((f) => (
                      <div key={f.key} className="flex justify-between gap-4 text-sm">
                        <dt className="text-muted">{f.label}</dt>
                        <dd className="text-right text-text">
                          {(draft.answers[f.key] ?? "").trim() || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            {(draft.deals.length > 0 || draft.excluded.length > 0) && (
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <h2 className="text-sm font-semibold">Restrictions &amp; conflicts</h2>
                {draft.deals.map((deal) => (
                  <p key={deal.name} className="mt-2 text-sm text-muted">
                    {deal.name} — {deal.category} · {deal.terms}
                  </p>
                ))}
                {draft.excluded.length > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    Will not promote: {draft.excluded.join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return (
      <JoinSubmitted
        minor={minor}
        guardianName={draft.answers.guardianName ?? ""}
        submittedAt={draft.submittedAt ?? ""}
        onReviewAnswers={() => setReviewing(true)}
        onUpdateRestrictions={() => {
          setDir(1);
          persist({ ...draft, phase: "steps", step: restrictionsIdx });
        }}
      />
    );
  }

  /* ---------------------------------------------------------------- intro */
  if (draft.phase === "intro") {
    const hasDraft =
      Object.values(draft.answers).some((v) => v.trim()) || draft.step > 0;
    return (
      <div className="px-6 py-10">
        <p className="sx-join-rise text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Athlete application
        </p>
        <h1 className="sx-join-rise mt-2 text-3xl font-semibold tracking-tight" style={{ "--sx-d": "0.05s" } as React.CSSProperties}>
          Ten sections
        </h1>
        <p className="sx-join-rise mt-2 text-sm leading-relaxed text-muted" style={{ "--sx-d": "0.1s" } as React.CSSProperties}>
          About 8 minutes. Progress is saved after every section — leave and
          come back.
        </p>

        <div className="relative mt-8">
          <span aria-hidden className="sx-join-rail absolute bottom-4 left-[15px] top-4 w-px bg-line" />
          <ol className="space-y-1">
            {SECTIONS.map((s, i) => {
              const enforced = s.id === "restrictions";
              const conditional = s.minorOnly === true;
              return (
                <li
                  key={s.id}
                  className="sx-join-rise relative flex items-start gap-4 py-2.5"
                  style={{ "--sx-d": `${0.15 + i * 0.045}s` } as React.CSSProperties}
                >
                  <span
                    className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      enforced
                        ? "border border-accent bg-bg text-accent"
                        : conditional
                          ? "border border-dashed border-accent/70 bg-bg text-accent"
                          : i === 0
                            ? "border border-primary bg-bg text-primary"
                            : "bg-surface-2 text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {conditional ? (
                    <div className="flex-1 rounded-xl border border-line border-l-2 border-l-accent bg-surface-2 p-3.5">
                      <p className="text-base font-medium text-text">{s.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-accent">
                        The one branch. Appears only if the date of birth on
                        section 1 is under 18. Nothing else changes.
                      </p>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <p className="text-base font-medium text-text">{s.title}</p>
                      {s.railNote && (
                        <p className={`mt-0.5 text-sm ${enforced ? "text-accent" : "text-muted"}`}>
                          {s.railNote}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            <li className="sx-join-rise relative flex items-center gap-4 py-2.5" style={{ "--sx-d": `${0.15 + SECTIONS.length * 0.045}s` } as React.CSSProperties}>
              <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2">
                <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.9s" } as React.CSSProperties} />
                </svg>
              </span>
              <p className="text-base text-muted">Submitted — reviewed by hand</p>
            </li>
          </ol>
        </div>

        <div className="sx-join-rise mt-8" style={{ "--sx-d": "0.75s" } as React.CSSProperties}>
          <button
            type="button"
            onClick={startOrResume}
            className="sx-join-sheen min-h-12 w-full rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-cta-ink transition-colors hover:bg-primary-soft"
          >
            {hasDraft ? `Resume — section ${draft.step + 1} of ${sections.length}` : "Start application"}
          </button>
          {hasDraft && (
            <button
              type="button"
              onClick={startOver}
              className="mt-3 min-h-11 w-full rounded-xl px-5 py-2.5 text-sm text-muted transition-colors hover:text-text"
            >
              Start over
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- steps */
  const n = draft.step + 1;
  const total = sections.length;
  const armed = section.kind !== "agreement" || draft.accepted;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {/* chrome */}
      <div className="border-b border-line px-6 pb-4 pt-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="grid size-11 -ml-2.5 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <svg viewBox="0 0 16 16" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3.5L5.5 8l4.5 4.5" />
            </svg>
          </button>
          <p aria-live="polite" className="text-sm text-muted">
            Section {n} of {total}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-success">
            <span className={`size-1.5 rounded-full bg-success ${save === "saving" ? "sx-pop" : ""}`} />
            {save === "saving" ? "Saving…" : "Progress saved"}
          </p>
        </div>
        <div className="mt-3.5 flex gap-1.5">
          {sections.map((s, i) => (
            <span
              key={s.id}
              className={`sx-join-seg h-1 flex-1 rounded-full ${
                i < draft.step
                  ? `sx-join-seg--fill ${s.id === "restrictions" ? "text-accent" : "text-primary"} bg-surface-2`
                  : i === draft.step
                    ? `sx-join-seg--active ${s.id === "restrictions" ? "text-accent" : "text-primary"} bg-surface-2`
                    : "bg-surface-2"
              }`}
            />
          ))}
        </div>
      </div>

      {/* body */}
      <div
        key={`${section.id}-${dir}`}
        ref={stepRef}
        className="sx-join-step flex-1 px-6 py-7"
        style={{ "--sx-from": dir === 1 ? "24px" : "-24px" } as React.CSSProperties}
      >
        {section.kind === "restrictions" && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M8 1.5l5 2v4c0 3.2-2.1 5.6-5 7-2.9-1.4-5-3.8-5-7v-4l5-2z" />
            </svg>
            Enforced
          </span>
        )}
        {section.kind === "agreement" && (
          <span className="mb-3 inline-flex items-center rounded-lg border border-warn/60 bg-warn/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">
            Draft
          </span>
        )}
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">
          {section.heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{section.sub}</p>

        <div className="mt-6">
          {section.kind === "fields" && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {section.fields.map((f, i) => (
                <Field
                  key={f.key}
                  def={f}
                  index={i}
                  value={draft.answers[f.key] ?? ""}
                  error={errors[f.key]}
                  onChange={(v) => setAnswer(f.key, v)}
                />
              ))}
              {section.id === "identity" && (
                <div className="sx-expand col-span-2" data-open={minor}>
                  <div>
                    <div className="rounded-xl border border-accent/50 border-l-2 border-l-accent bg-surface-2 p-4">
                      <p className="flex items-center gap-2.5 text-sm font-semibold text-text">
                        <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="var(--sx-accent)" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="8" cy="8" r="6.5" />
                          <path d="M8 5v3.5M8 11h.01" />
                        </svg>
                        One extra section is added
                      </p>
                      <p className="mt-1.5 pl-[26px] text-sm leading-relaxed text-accent">
                        Because you&apos;re under 18, section 8 asks for a parent,
                        guardian or authorized representative. Everything else in
                        the application is the same.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {section.id === "payment" && (
                <p className="col-span-2 rounded-xl border border-line bg-surface-2 p-4 text-sm leading-relaxed text-muted">
                  {NEVER_ASKED}
                </p>
              )}
            </div>
          )}
          {section.kind === "restrictions" && (
            <JoinRestrictionsStep
              deals={draft.deals}
              excluded={draft.excluded}
              onDealsChange={(deals) => setDraft({ ...draft, deals })}
              onExcludedChange={(excluded) => setDraft({ ...draft, excluded })}
            />
          )}
          {section.kind === "agreement" && (
            <JoinAgreementStep
              accepted={draft.accepted}
              onAcceptedChange={(accepted) => setDraft({ ...draft, accepted })}
            />
          )}
        </div>
      </div>

      {/* action bar */}
      <div className="sticky bottom-0 border-t border-line bg-bg/95 px-6 py-4 backdrop-blur">
        <button
          type="button"
          onClick={goNext}
          disabled={!armed}
          data-armed={section.kind === "agreement" && draft.accepted}
          className="sx-join-sheen min-h-12 w-full rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-cta-ink transition-all hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {section.kind === "agreement" ? "Submit application" : "Save and continue"}
        </button>
        {section.kind !== "agreement" && (
          <button
            type="button"
            onClick={finishLater}
            className="mt-1 min-h-11 w-full rounded-xl px-5 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Save and finish later
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  def,
  index,
  value,
  error,
  onChange,
}: {
  def: FieldDef;
  index: number;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={`sx-join-rise block ${def.half ? "col-span-1" : "col-span-2"}`}
      style={{ "--sx-d": `${index * 0.035}s` } as React.CSSProperties}
    >
      <span className="text-[11px] font-medium text-muted">{def.label}</span>
      <input
        type={def.type}
        name={def.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        aria-invalid={!!error}
        className={`mt-1.5 min-h-11 w-full rounded-xl border bg-surface-2 px-3.5 py-3 text-base text-text placeholder:text-faint transition-colors focus:outline-none ${
          error ? "border-danger" : "border-line focus:border-primary/60"
        }`}
      />
      {def.hint && !error && <span className="mt-1 block text-[11px] text-faint">{def.hint}</span>}
      {error && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
    </label>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/join-wizard.tsx
git commit -m "feat(join): the wizard island — intro rail, step chrome, minor branch, drafts"
```

---

### Task 8: Server page rewrite + fixtures cleanup

**Files:**
- Modify: `src/app/(public)/join/page.tsx` (full replace)
- Modify: `src/lib/fixtures.ts` (remove `applicationSections`)

- [ ] **Step 1: Verify `applicationSections` has no other consumers**

Run: `grep -rn "applicationSections" src --include="*.ts*"`
Expected: only `src/lib/fixtures.ts` (definition) and `src/app/(public)/join/page.tsx` (the page being replaced). If anything else appears, stop and reassess.

- [ ] **Step 2: Replace the page**

```tsx
import { JoinWizard } from "@/components/join-wizard";

/* --------------------------------------------------------------------------
   Athlete Application — §11, and §39's front door. P1-ART-07 built in-app:
   the phone-first progressive wizard (one section per screen, the §4 guardian
   branch, localStorage drafts, v0.4 click-wrap, after-submit state).

   Fixtures-only: submit transitions state, no POST — P3-FE-01 wires the API.
   ?demo=minor lands on section 1 with an under-18 DOB; ?demo=submitted lands
   on the after-submit state with the guardian card.
   -------------------------------------------------------------------------- */

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const d = demo === "submitted" ? "submitted" : demo === "minor" ? "minor" : null;

  return (
    <div className="sx-join-stage">
      <div className="mx-auto w-full max-w-[430px]">
        <JoinWizard demo={d} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Remove `applicationSections` from `fixtures.ts`** — delete the whole block from the `/* ---- (public)/join … ---- */` banner comment through the closing `] as const;` (lines ~853–957). `join-flow.ts` owns this now, with the corrected (click-wrap, not counsel-blocked) agreement copy.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean/green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/join/page.tsx" src/lib/fixtures.ts
git commit -m "feat(join): P1-ART-07 wizard replaces the static /join; fixtures section data retired"
```

---

### Task 9: Build + driven verification

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: compiles clean, `/join` in the route list.

- [ ] **Step 2: Drive the dev server** (`npm run dev`, then curl)

- `curl -s localhost:3000/join | grep -o "Ten sections"` → intro SSRs
- `curl -s "localhost:3000/join?demo=submitted" | grep -o "Application submitted"` → demo state works (client island renders after hydration — if curl only shows the shell, verify in a browser instead)
- Browser pass (human or DevTools): adult flow = 9 sections; DOB `2009-03-14` on section 1 expands the notice and the bar gains a segment; refresh mid-flow resumes; agreement checkbox arms Submit; submit lands on the timeline; `prefers-reduced-motion` kills the choreography.

- [ ] **Step 3: Note anything not verifiable programmatically** for the human pass (motion feel on a real phone, scrollspy of the terms card).

---

### Task 10: Task board, memory log, wrap-up

- [ ] **Step 1: Task board** — in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (openpyxl in a scratchpad venv, backup first): add a Phase 1 FE row (next free `P1-FE-nn`, fractional `Order`) — "Build the /join athlete onboarding wizard (P1-ART-07 in-app)", Status `Code review`, Owner + Date Started/Done = 2026-09-21. Extend autofilter, Status validation, conditional-formatting ranges and the Dashboard formulas by one row (the CLAUDE.md trap).

- [ ] **Step 2: Memory log** — `Memory/2026-09-21/tasks-completed.md`: what was built, the spec/plan links, the counsel-gate → click-wrap correction in fixtures, verification results, what needs a human eye.

- [ ] **Step 3: Commit**

```bash
git add Memory/2026-09-21/tasks-completed.md
git commit -m "docs(memory): 2026-09-21 /join wizard build (P1-ART-07 in-app)"
```
