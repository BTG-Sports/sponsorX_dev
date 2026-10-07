# 2026-10-07

## HeckerCreatives — P1-ART-18: the whole admin portal on the stage (Code review)

The owner asked for the whole admin portal in the Mission Control language, components included, without check-ins. Spec: `docs/superpowers/specs/2026-10-07-admin-portal-stage-design.md`. Branch `feature/P1-ART-18-admin-portal-stage`, stacked on P1-ART-17.

- **The stage is now the admin shell's.** `PortalShell` takes `stage`; the admin layout sets it. The root carries `.sx-ops`, `<main>` is an `OpsStage` with `OpsGround` (no word), the house padding and 1440px column, no overflow clip (the matching studio's sticky bars need it). The theme toggle is hidden there.
  - `StagePortals` adds `.sx-ops` to `<body>` while mounted, so drawers, dialogs and menus portaled to the body are on the stage even for Frost users.
  - The four desks from P1-ART-14…17 drop their own stage wrappers. `/admin`'s hero is now a dashboard header (`OpsHeader`: title + tiles, with a compact ring tile by queue).
- **A shared skin** in `globals.css` under `.sx-ops`, keyed on marker classes added to the primitives (`sx-card`, `sx-badge`, `sx-section-title`, `sx-hero-band`, `sx-stat`, `sx-btn-*`, `sx-tabs`, `sx-notice`, `sx-page-title`). It also matches `role=tablist/tab`, the `rounded-lg border border-line bg-surface p-1` link-strip idiom, native `select` / `input` / `textarea`, `button.bg-primary` / `button.border-line`, `.sx-drawer`, and `[role=dialog] > div > .sx-pop`.
  - 52 identical `<h1 className="text-xl font-semibold tracking-tight">` swept to `sx-page-title` across 38 files.
  - Cards get bracket corners from pseudo-elements, not clip-path, so a dropdown inside a Card isn't cut off.
  - 24 files still use native `<select>`; they're skinned, not replaced.
- **Environment, two findings:**
  1. **Docker Desktop was off.** Started it, `npm run docker:up`, then the API.
  2. **The PC clock is ~10 minutes behind Clerk's.** Every session token was "not active yet" (API 401; Next's Clerk middleware handshake-looped /login → /portal). `w32tm /resync` needs admin. Added an optional `CLERK_CLOCK_SKEW_MS` to the API (`backend/src/config/env.ts`, `auth/clerk.ts`) and to `frontend/src/proxy.ts`; both servers were started with it for the walk only. The owner should sync the clock. Saved as Claude memory "clock-skew-breaks-clerk".
- **Verified:**
  - Frontend 1167 tests, eslint, tsc (frontend and backend).
  - Playwright sampler as BTG_ADMIN: 27 desks on the stage, `body.sx-ops` true on each, no console errors, overflow 0; the applications drawer and the rules dialog dark; light theme identical; 390px on three pages.
  - `next build` in a detached worktree: green, all 45 `/admin` routes.
- **Tracker:** P1-ART-18 is Phase 1 row 294 (Order 32.996, Code review); ranges extended to 294; a 2026-10-07 snapshot row added.
