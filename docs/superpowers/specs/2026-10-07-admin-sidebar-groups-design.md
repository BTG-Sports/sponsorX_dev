# The admin sidebar's collapsible groups (P1-ART-21)

**Date:** 2026-10-07 · **Raised by:** programme owner ("restructure the
navigation buttons in the side, its too many, if its possible to have a
collapsable please do so" … "and sort them orderly") · **Scope:** the admin
portal's sidebar and phone drawer. No route, role rule or page changes.

## What was wrong

Twenty-nine links in one flat column, in the order the desks were built —
Payouts between Guardian handoffs and Onboarding, Network after that, the
five NEXT desks at the bottom. Taller than a laptop screen; nothing to scan
by.

## The groups

Dashboard stays on top. Every other desk sits in one of seven groups, in
the order BTG works, and alphabetical inside each:

| Group | Desks |
|---|---|
| Intake | Applications · New sign-ups · Onboarding · Sponsor requests |
| Campaigns | Approvals · Briefs · Campaigns · Offers · Rewards |
| Marketplace | Delivery issues · Marketplace · Restricted words |
| Money | Commission · Finance · Payouts · Refunds to send |
| Accounts | Closed accounts · Guardian handoffs · Network |
| NEXT | Editions · Inventory · Prospects · Rights · Splits |
| System | Analytics · Audit log · Integrations |

The NEXT desks drop their "NEXT " prefix inside their group. The per-role
filter (`lib/admin-access`) and the commission-only rule are unchanged; a
group with no desks for a role doesn't appear.

## How it folds

- A group header is a button: a caret, the name, and the count of desks in
  it. `aria-expanded` and `aria-controls` tie it to its list.
- **The group holding the open page is open on arrival** and its header
  carries the portal accent; closed, its count badge is lit so a viewer
  sees where they are.
- Every other group opens and closes on its header. **The viewer's choice
  is remembered per browser** (`localStorage`, `sx-nav-open:<portal>`),
  read through `useSyncExternalStore` so the server and the hydrating
  client agree on "none open" and the browser's memory joins right after —
  no state set in an effect, no hydration mismatch. Closing the current
  page's group holds for the visit.
- The phone drawer lists the groups by name with their desks two to a row,
  scrolling; before, 29 lines of large type had to fit one screen.

## Mechanics

`NavItem` gains `group?: string`. `lib/nav-groups.ts` (pure, unit-tested)
folds a nav into `{ top, groups }` in order of first appearance, finds the
active group, and reads / writes the remembered keys. A nav with no groups
renders flat, so the sponsor, athlete, property and student portals are
untouched. A test reads the admin layout and pins Dashboard on top, the
seven groups in order, and A → Z inside each.

## Verified

tsc, eslint, unit tests; a Playwright pass as BTG_ADMIN — the dashboard
with seven closed groups, a desk opening its own group only, a header
toggling and the choice surviving a reload, the phone drawer; no console
error.
