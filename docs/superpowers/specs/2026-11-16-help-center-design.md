# Help & FAQ center — design (POL-FE-99)

Approved by the owner 2026-11-16. Replaces the header "?" link to the contact
form (POL-FE-43) with a searchable, navigable help center in every portal.

## Scope

- Seven portals, each its own help center inside its own shell and stage:
  `sponsor` (Stadium Board), `athlete` (Arena; guardian and minor articles
  included), `property`, `next` (student), `advisor`, `finance` (Vault),
  `admin` (Mission Control). Staff desks get "how this desk works" articles.
- Every article answers one question with numbered steps. Every step has a
  real screenshot of the live app and a hotspot on the thing to click.
- Not in scope: a "Was this helpful?" vote (no backend to store it; a fake
  count breaks stats-must-be-retrievable), editing help in-app, translations.

## Routes

- `/<portal>/help` — the help home: hero search, topic cards, top questions,
  "Still stuck? Message BTG".
- `/<portal>/help/<slug>` — one article as a guided tour. Unknown slug →
  `notFound()`.
- Both are thin `page.tsx` wrappers per portal over shared components, so the
  portal's own layout (auth, shell, stage, nav) wraps them unchanged.
- The header "?" in `PortalShell` links to `${rootHref}/help`, labelled
  "Help and FAQ". The contact form stays reachable from every help page via
  `/contact?back=<current help url>`.

## Content model — `frontend/src/lib/help/`

```ts
type HelpPortal = "sponsor" | "athlete" | "property" | "next" | "advisor" | "finance" | "admin";
type HelpCategory = { key: string; title: string; blurb: string; icon: HelpIcon };
type HelpStep = { title: string; body: string; route: string; shot: string /* id */ };
type HelpArticle = {
  slug: string; category: string; question: string; summary: string;
  keywords: string[]; steps: HelpStep[]; notes?: string[]; related?: string[];
  audience?: "guardian" | "minor"; top?: boolean;
};
```

- One file per portal exporting `{ categories, articles }`; `index.ts` maps
  portal → content and exposes `helpFor(portal)`, `articleFor(portal, slug)`.
- `shots.json` (written by the capture script) maps shot id →
  `{ src, w, h, spot: { x, y, w, h } | null }` with the spot in percent of
  the image. A step whose shot is missing renders a framed "screenshot
  coming" placeholder, never a broken image.
- `search.ts` — pure ranking: tokenised, case- and accent-insensitive,
  prefix match; weights question > keywords > summary > step text; returns
  matched ranges for highlighting. Unit-tested.

## Screenshots — `frontend/scripts/help-shots/`

- `capture.mjs` reads a capture plan (portal, shot id, route, highlight
  locator, account) generated from the content files, signs in per QA
  account with a Clerk sign-in token (`/login?__clerk_ticket=`), opens each
  route at 1440×900 against `HELP_BASE_URL` (default `http://localhost:3000`),
  removes the dev `<nextjs-portal>` badge, waits for network idle, measures
  the highlight locator's box, saves `public/help/<portal>/<id>.webp` (sharp)
  and merges the entry into `shots.json`.
- A step whose locator isn't found is still captured, with `spot: null`, and
  listed in the run report. A route that redirects away (no data / no role)
  is skipped and reported.
- Dynamic routes resolve their record by opening the list page and following
  its first matching link (declared per step).

## Visual design

Theme follows the portal: `--help-accent` from the portal accent, on the
stage ground the shell already draws. CSS animations plus small client
islands; no new dependencies. All motion off under
`prefers-reduced-motion`.

- **Hero** — kinetic headline (letters rise in a stagger), command-bar search
  with an animated conic-gradient border, typewriter placeholder cycling real
  questions from that portal, accent aurora behind.
- **Search** — instant results under the bar, matched words highlighted,
  Ctrl+K or "/" focuses it, arrows + Enter move through results, `?q=` kept
  in the URL (history.replaceState).
- **Topic cards** — pointer-driven 3D tilt and spotlight, icons draw in (SVG
  stroke), staggered reveal on scroll, article count per card. Clicking a
  card filters the list below to that topic (`?topic=`).
- **Article** — sticky step rail whose progress line fills as you scroll;
  each screenshot in a browser frame with a slow zoom toward the hotspot as
  its step enters view, a spotlight dimming the rest, and a pulsing ring on
  the hotspot; click opens a full-size lightbox (FLIP zoom, Esc closes).
  Related questions and the contact card close the page.
- **Phone** — one column, no horizontal scroll at 320px, rail becomes a
  numbered list, dock clearance kept by the shell.

## Testing

- Vitest: unique slugs per portal; every category referenced exists; every
  `related` slug exists; every step names a shot; search ranking and
  highlighting; `PortalShell` "?" points at `${rootHref}/help`.
- Live: load every `/<portal>/help` and a sample of articles on the running
  dev server signed in per role; no console errors; 320px no overflow.
- `npm run build` in a detached worktree (the dev server stays up).
