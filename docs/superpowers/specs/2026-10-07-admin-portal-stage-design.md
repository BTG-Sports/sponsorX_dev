# The whole admin portal on the stage (P1-ART-18)

**Date:** 2026-10-07 · **Raised by:** programme owner ("visual redesign the
whole admin page based on what we did, not just the page itself also the
components like popup, modal, etc. i will just see it later after you
finished") · **Scope:** every `/admin/**` route, the admin shell, and the
shared components the desks are built from. Visual only: no read, write,
role rule or page logic changes.

## Approach — the stage moves into the shell

Four desks (P1-ART-14…17) each drew their own Mission Control stage. With
45 admin pages, the stage now belongs to the shell, and the pages are plain
content on it:

- `PortalShell` gains `stage` (the admin layout passes it). On the stage the
  shell root carries `.sx-ops` (the fixed-dark tokens, so the sidebar and
  top bar are night glass too), `<main>` is an `OpsStage` with `OpsGround`
  (no outlined word — dashboards), the house padding, a 1440px column, and
  **no overflow clip** (the matching studio's sticky bars need it; the
  ground clips itself). The theme toggle is hidden on the stage — the stage
  is dark in both themes.
- A tiny client `StagePortals` adds `.sx-ops` to `<body>` while an admin page
  is mounted, so everything portaled to the body — drawers, dialogs, menus,
  the mobile nav — inherits the dark tokens for a Frost user too.
- The four redesigned pages (and their `loading.tsx`) drop their own stage
  wrappers and render content only. `/admin` loses its hero for the
  dashboard header (title + KPI tiles: actions waiting with the queue ring,
  live campaigns, systems operational, deliverables overdue on this page is
  NOT shown — it would be a count of visible rows).

## The shared skin (`globals.css`, scoped under `.sx-ops`)

Marker classes on the shared primitives, restyled on the stage:

| Primitive | class | On the stage |
|---|---|---|
| `Card` | `sx-card` | glass gradient, cyan hairline, bracket corners (pseudo-elements — no clip-path, so dropdowns inside aren't cut) |
| `SectionHeading` h2 | `sx-section-title` | 11px uppercase tracked cyan |
| `Badge` | `sx-badge` | a hairline in its tone (`currentColor` mix) |
| `HeroBand` | `sx-hero-band` | glass panel, glowing top edge |
| `StatTile` | `sx-stat` | the KpiTile look: mono label, glowing top edge |
| `Button` primary / secondary | `sx-btn-primary` / `sx-btn-secondary` | blue gradient chamfer with glow / cyan outline |
| `Tabs` | `sx-tabs` | pills |
| `BlockedNotice` | `sx-notice` | orange pill note |
| page `<h1>` | `sx-page-title` | text-xl/2xl white with a live dot (`::before`) — 52 identical headings swapped by script |
| drawers (`.sx-drawer`, `-out`) | — | dark glass panel, lit left edge |
| dialogs (`[role=dialog] > div > .sx-pop`) | — | glass panel, cyan border, outer glow |
| sidebar / top bar (`.sx-shell-*`) | — | night glass, cyan hairlines, the admin wash |

Everything else (inputs, tables, links, pagers, filters) already reads the
themed tokens the `.sx-ops` block re-pins, so it goes dark by itself.

## Verification

Frontend tests and lint; `next build` in a detached worktree (then the rimraf
check); a browser walk as BTG_ADMIN across a sample of desks — the board,
new sign-ups, applications (+ its drawer), rules (+ its dialog), briefs,
campaigns, finance, approvals, rewards, audit, integrations, a NEXT desk —
in light and dark, 1440 and 390, no console errors, no horizontal overflow.
