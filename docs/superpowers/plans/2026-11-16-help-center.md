# Help & FAQ Center Implementation Plan (POL-FE-99)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A searchable, animated Help & FAQ center in all seven portals, opened from the header "?", with a real screenshot and hotspot on every step.

**Architecture:** Help content is typed data per portal in `frontend/src/lib/help/`; a pure search module ranks it. Shared server components render the home and article pages, with small client islands for search, card tilt, the scroll-driven step rail and the lightbox. Each portal mounts two thin routes (`help/page.tsx`, `help/[slug]/page.tsx`). A Playwright capture script writes WebP screenshots to `public/help/` and hotspot boxes to `lib/help/shots.json`.

**Tech Stack:** Next 16 (app router, async `params`/`searchParams`), React 19, Tailwind 4 + plain CSS (`help.css`), Vitest, `@playwright/test` 1.56 + `sharp` for capture. No new dependencies.

Spec: `docs/superpowers/specs/2026-11-16-help-center-design.md`.

---

## File map

| File | Responsibility |
|---|---|
| `frontend/src/lib/help/types.ts` | `HelpPortal`, `HelpCategory`, `HelpStep`, `HelpArticle`, `HelpContent`, `ShotEntry` |
| `frontend/src/lib/help/{sponsor,athlete,property,next,advisor,finance,admin}.ts` | Content per portal (`export const content: HelpContent`) |
| `frontend/src/lib/help/index.ts` | `helpFor(portal)`, `articleFor(portal, slug)`, `shotFor(id)`, `HELP_ROOT` |
| `frontend/src/lib/help/shots.json` | Capture manifest: id → `{ src, w, h, spot }` |
| `frontend/src/lib/help/search.ts` | `normalise`, `searchHelp(articles, q)` → ranked hits with highlight ranges |
| `frontend/src/components/help/help-home.tsx` | Server: hero, topic grid, list, contact card |
| `frontend/src/components/help/help-article.tsx` | Server: article tour layout |
| `frontend/src/components/help/help-search.tsx` | Client: command bar, typewriter, instant results, Ctrl+K, `?q=` |
| `frontend/src/components/help/help-topics.tsx` | Client: tilt/spotlight cards, topic filter, list |
| `frontend/src/components/help/help-tour.tsx` | Client: step rail progress, in-view zoom, lightbox |
| `frontend/src/components/help/help-shot.tsx` | Server-safe: framed screenshot + hotspot (or placeholder) |
| `frontend/src/components/help/help.css` | All help visuals + keyframes + reduced motion |
| `frontend/src/app/(app)/<portal>/help/page.tsx` ×7 | `<HelpHome portal=… />` |
| `frontend/src/app/(app)/<portal>/help/[slug]/page.tsx` ×7 | `<HelpArticlePage portal=… slug=… />` |
| `frontend/src/components/portal-shell.tsx:283-290` | "?" → `${rootHref}/help`, label "Help and FAQ" |
| `frontend/scripts/help-shots/capture.mjs` | Capture screenshots + manifest |
| `frontend/tests/help-center.test.ts` | Content integrity, search, shell link |
| `frontend/tests/helpdesk-live.test.ts:134` | Update the "?" assertion |

## Task 1: Types, search, content index — TDD

- [ ] Write `frontend/tests/help-center.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HELP_PORTALS, helpFor, articleFor } from "@/lib/help";
import { normalise, searchHelp } from "@/lib/help/search";
import type { HelpArticle } from "@/lib/help/types";

const A = (over: Partial<HelpArticle>): HelpArticle => ({
  slug: "x", category: "c", question: "Q", summary: "", keywords: [], steps: [{ title: "t", body: "b", route: "/", shot: "s" }], ...over,
});

describe("searchHelp", () => {
  const list = [
    A({ slug: "cash-out", question: "How do I cash out my earnings?", keywords: ["payout", "withdraw"] }),
    A({ slug: "buy", question: "How do I buy from the shop?", summary: "Pay at checkout", keywords: ["purchase"] }),
    A({ slug: "steps-only", question: "Something", steps: [{ title: "Open", body: "press Cash out", route: "/", shot: "s" }] }),
  ];
  it("ranks a question match above a step-text match", () => {
    expect(searchHelp(list, "cash out").map((h) => h.article.slug)).toEqual(["cash-out", "steps-only"]);
  });
  it("matches keywords and word prefixes, ignoring case and accents", () => {
    expect(searchHelp(list, "WITHDR")[0].article.slug).toBe("cash-out");
    expect(normalise("Café")).toBe("cafe");
  });
  it("needs every word to match somewhere", () => {
    expect(searchHelp(list, "buy payout")).toEqual([]);
  });
  it("returns highlight ranges inside the question", () => {
    const [hit] = searchHelp(list, "shop");
    expect(hit.question.some((p) => p.hit && p.text.toLowerCase() === "shop")).toBe(true);
  });
  it("an empty query returns nothing", () => expect(searchHelp(list, "  ")).toEqual([]));
});

describe("content integrity", () => {
  for (const portal of HELP_PORTALS) {
    const { categories, articles } = helpFor(portal);
    it(`${portal}: slugs unique, categories and related exist, every step has a shot`, () => {
      expect(articles.length).toBeGreaterThan(0);
      expect(new Set(articles.map((a) => a.slug)).size).toBe(articles.length);
      const cats = new Set(categories.map((c) => c.key));
      const slugs = new Set(articles.map((a) => a.slug));
      for (const a of articles) {
        expect(cats.has(a.category), `${a.slug} category`).toBe(true);
        for (const r of a.related ?? []) expect(slugs.has(r), `${a.slug} → ${r}`).toBe(true);
        expect(a.steps.length).toBeGreaterThan(0);
        for (const s of a.steps) { expect(s.shot).toMatch(new RegExp(`^${portal}/`)); expect(s.route.startsWith(`/${portal === "next" ? "next" : portal}`) || s.route.startsWith("/")).toBe(true); }
      }
      expect(articleFor(portal, articles[0].slug)).toBe(articles[0]);
      expect(articleFor(portal, "no-such-slug")).toBeNull();
    });
  }
});
```

- [ ] Run `npx vitest run tests/help-center.test.ts` (in `frontend/`) → FAIL (module missing).
- [ ] Implement `types.ts`, `search.ts` (token AND-match; weights question 8, keywords 5, summary 3, step text 1, prefix ×0.7; `parts()` splits a string into `{text, hit}` segments), `index.ts`, and a minimal content file per portal.
- [ ] Re-run → PASS. Commit `feat(POL-FE-99): help content model and search`.

## Task 2: Content per portal

- [ ] Convert each research inventory (`scratchpad/help/<portal>.json`) into `lib/help/<portal>.ts`; shot ids are `<portal>/<slug>-<n>`. Each step carries `route` and the capture metadata (`highlight` locator, `follow` for dynamic routes) in a parallel `capture` field ignored by the UI.
- [ ] Mark 4–6 `top: true` articles per portal (money and orders first).
- [ ] Re-run the content-integrity tests → PASS. Commit.

## Task 3: Shared components + CSS

- [ ] `help-shot.tsx`: browser-frame chrome (three dots + route pill), `<img>` (plain img: host-portable) with `width/height` from the manifest, hotspot `<span>` absolutely positioned in % with a pulsing ring; placeholder when the shot is missing.
- [ ] `help-search.tsx` ("use client"): input with typewriter placeholder from `samples`, results from `searchHelp`, ↑/↓/Enter, Esc clears, Ctrl+K and "/" focus (ignored when typing in a field), `?q=` via `history.replaceState`.
- [ ] `help-topics.tsx` ("use client"): category cards (pointer tilt via CSS vars `--rx/--ry/--mx/--my`, rAF throttled; reduced motion → none), click toggles `?topic=`, list below filtered by topic.
- [ ] `help-tour.tsx` ("use client"): IntersectionObserver marks the step in view (`data-active`), sets `--progress` on the rail; click on a shot opens a `<dialog>` lightbox with FLIP from the thumbnail rect; Esc / backdrop closes.
- [ ] `help-home.tsx` and `help-article.tsx` (server) compose the above; article ends with related questions + "Still stuck? Message BTG" → `/contact?back=/<portal>/help/<slug>`.
- [ ] `help.css`: aurora, kinetic headline (`--i` per letter), conic border (`@property --help-angle`), card reveal, stroke draw, rail fill, hotspot pulse, zoom-to-spot; all under `@media (prefers-reduced-motion: no-preference)` with static fallbacks. Accent from `--help-accent` set per portal.
- [ ] No render props into client islands; pass data only (memory: no-render-props-into-client-islands).

## Task 4: Routes + the "?" button

- [ ] 14 thin pages. `[slug]` page: `const { slug } = await params; const a = articleFor(portal, slug); if (!a) notFound();` + `generateMetadata` title = question.
- [ ] `portal-shell.tsx`: `href={`${rootHref}/help`}`, `aria-label="Help and FAQ"`, `title="Help and FAQ"`.
- [ ] Update `tests/helpdesk-live.test.ts:134` to `/aria-label="Help and FAQ"/` and add a test that the shell href is `${rootHref}/help`.
- [ ] `npx vitest run` → PASS. Load `/sponsor/help` and one article on :3000 → 200, no console errors. Commit.

## Task 5: Capture script + screenshots

- [ ] `scripts/help-shots/capture.mjs`: imports the plan from `scripts/help-shots/plan.json` (generated by `scripts/help-shots/plan.mts` from the content files via `tsx`), signs in per account with `POST https://api.clerk.com/v1/sign_in_tokens` (key from `frontend/.env*` `CLERK_SECRET_KEY`), opens `/login?__clerk_ticket=`, then per step: goto route (or follow the first link matching `follow`), remove `nextjs-portal`, wait idle, box = locator.boundingBox(), screenshot viewport 1440×900, `sharp().webp({quality:80})`, write manifest. Report missing locators / redirects.
- [ ] Run it per portal against :3000. Review a sample of images by eye. Commit images + manifest.

## Task 6: Verify + close out

- [ ] Walk every `/<portal>/help` signed in per role at 1440 and 375 widths; check console, 320px overflow, keyboard (Ctrl+K, arrows, Esc), reduced motion.
- [ ] `npm run build` in a detached worktree (dev stays up).
- [ ] `documentation/polish.md` → `### 99.`; tracker xlsx Polish row; `Memory/2026-11-16/tasks-completed.md`. Commit by pathspec.
