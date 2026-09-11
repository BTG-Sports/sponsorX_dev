# SponsorX — Stage 1 QA Verification Report & Checklist

**Tasks:** `P1-QA-01` (§39 loop walk) · `P1-QA-02` (accessibility) · `P1-QA-03` (responsive)

| Document control | |
|---|---|
| Version | 1.0 |
| Date executed | 2026-09-12 |
| Branch / build | `P1-FE-QA-PMO` @ `53c2c53` (post-fix state; all defect fixes included) |
| Executed by | Claude (session-driven QA), owner HeckerCreatives |
| Result | **23 / 23 test cases PASS** (final consolidated run) |
| Detailed method records | `docs/superpowers/audits/2026-09-12-p1-qa-0{1,2,3}-*.md` |
| Sign-off | ☐ rcfworks (pending code review of the branch) |

## 1 · Scope

Verifies the three Stage 1 QA acceptance criteria on the fixture-stage build:

- **P1-QA-01:** the full §39 business loop is representable and rendered — a
  written pass/fail for all 11 steps; every gap fixed or filed.
- **P1-QA-03:** no horizontal scroll at 360px on any route; portal navigation
  usable on a phone.
- **P1-QA-02:** WCAG AA contrast in both themes; keyboard navigation
  complete; the fan redeem page works without JavaScript.

Out of scope: screen-reader semantics (landmarks/live regions), real-device
testing, wired-behaviour testing (Stage 1 is deliberately unwired), visual
taste review (human step).

## 2 · Environment & tooling

| | |
|---|---|
| App | Next.js 16.3.4 (Turbopack), server components, fixture data |
| Server under test | `next dev` on `localhost:3000` (build gates additionally verified: `tsc --noEmit`, `eslint src`, `next build` — all green) |
| Driver | Headless Chrome (`--headless=new`) via Chrome DevTools Protocol; Node v22.17.1 (built-in WebSocket) |
| Mobile emulation | `Emulation.setDeviceMetricsOverride` 360×800, mobile |
| Keyboard | Real `Input.dispatchKeyEvent` (Tab / Escape) — never programmatic `.focus()` |
| Themes | Dark = default; light applied **pre-paint** via `localStorage("sx-theme")` + reload (the app's own mechanism) |

## 3 · Test execution summary — final consolidated run

23 automated cases in four groups, executed against the final committed build.
An initial run reported 18/23; **all five failures were test-harness defects,
not product defects** — each was diagnosed, the harness corrected, and the
case re-executed (§6). Final: **23/23 PASS**.

## 4 · Test cases and results

### 4.1 · P1-QA-01 — §39 loop walk (group A)

Method: navigate each loop screen, assert content markers render; manually
verify every dead-end control carries an explanatory annotation.

| ID | Loop step | Screen | Expected | Result |
|---|---|---|---|---|
| A-01 | 1 · Athlete application | `/join` | Ten §11 sections incl. guardian branch; submit blocked w/ B1 tooltip | **PASS** |
| A-02 | 2 · Approval | `/admin/applications` | Queue, score snapshot, §4 guardian gate, terminal Rejected state | **PASS** |
| A-03 | 3 · NIL job / rate | `/athlete` | Rate card SX-01…07 at confirmed rates | **PASS** |
| A-04 | 4 · Sponsor brief | `/sponsor/marketplace?tab=athletes` | "Add to brief" CTAs, annotated as unwired DRAFT CampaignBrief | **PASS** |
| A-05 | 5 · Matching | `/admin/campaigns/new` | Eligibility list w/ scores + conflict flags (§13 step 3) | **PASS** |
| A-06 | 6 · Invitation | `/athlete/invitations` | Full lifecycle incl. DECLINED / EXPIRED rows | **PASS** |
| A-07 | 7 · Campaign Order | `/athlete/orders/inv_1` | Terms + agreement clauses; acceptance blocked (§37 / guide §08) | **PASS** |
| A-08 | 7b · Declined order terminal | `/athlete/orders/inv_5` | "Order status" panel w/ decline reason, no accept card | **PASS** |
| A-09 | 8 · Deliverable review | `/admin/approvals` | Review queue w/ versioning, annotated approve/revise | **PASS** |
| A-10 | 9 · Tracking / under-delivery | `/admin/campaigns/c3` | 11/22 shortfall notice, Under-delivering + Replacement-needed roster flags | **PASS** |
| A-11 | 10 · Earnings | `/athlete/earnings` | §21 states incl. HELD w/ reason; reconciles with `/admin/finance` | **PASS** |
| A-12 | 11 · Sponsor report | `/sponsor/campaigns/c1/report` | ROI gauge, money story incl. media value, sourcing footnote | **PASS** (see H-01) |

Steps 4→5 and reward creation are staff-mediated by design (§13 managed
model); the fan leg of step 9 is separately covered by `/r/[token]` (C-06).

### 4.2 · P1-QA-03 — responsive, 360px (group B)

| ID | Test case | Method | Expected | Result |
|---|---|---|---|---|
| B-01 | Page width, **30 routes** (every page incl. tab + demo variants) | `max(documentElement.scrollWidth, body.scrollWidth)` at 360×800 | = 360 on every route (compare to literal 360 — see H-02) | **PASS 30/30** |
| B-02 | Phone nav, athlete portal | Open drawer → count visible links → Escape | Opens (6 links), `aria-expanded` → false after Escape | **PASS** |
| B-03 | Phone nav, sponsor portal | same | 5 links; closes | **PASS** |
| B-04 | Phone nav, property portal | same | 3 links; closes | **PASS** |
| B-05 | Phone nav, admin portal | same | 10 links; closes | **PASS** |

### 4.3 · P1-QA-02 — accessibility (group C)

| ID | Test case | Method | Expected | Result |
|---|---|---|---|---|
| C-01 | AA contrast, dark theme | Composite fg/bg for every text node, 10 pages (853 nodes); 4.5:1 normal / 3:1 large | 0 below AA | **PASS — 0/853** |
| C-02 | AA contrast, light theme | Same, theme applied pre-paint (853 nodes) | 0 below AA | **PASS — 0/853** |
| C-03 | Focus visibility | Real Tab keypress → `document.activeElement` | `:focus-visible` matches; visible outline (`auto`) | **PASS** |
| C-04 | Focus order semantics | 5 pages: positive `tabindex`, click-only div/span | 0 offenders | **PASS — 0** |
| C-05 | User menu keyboard | Open menu → Escape | Menu closes | **PASS** |
| C-06 | No-JS fan redeem | `Emulation.setScriptExecutionDisabled` → load `/r/demo-token` | Full copy, 4 funnel steps, token render (502 chars) | **PASS** |

Gradient contexts (hero bands, gradient headlines) are excluded from the
automated walk and verified by composite math in the audit record: body text
on bands ≥ 12:1 at the worst 20%-alpha edge; gradient headlines are
large-text (3:1 rule) with endpoint ratios 6.19 / 8.18.

## 5 · Defect log — product defects found and fixed

All 11 defects were found by these audits and fixed on this branch; the final
run (§4) verifies the fixed state.

| # | Severity | Defect | Root cause | Fix / commit |
|---|---|---|---|---|
| D-01 | Minor | `/athlete/invitations` Decline button silently unwired | Missing annotation (admin screens had them; athlete screens didn't) | Tooltip added · `b07267d` |
| D-02 | Minor | `/athlete` dashboard Decline — same | same | `b07267d` |
| D-03 | Minor | `/athlete` Upload proof — tooltip existed only for the minor/guardian case | Conditional title fell through to none | `b07267d` |
| D-04 | Major | `/athletes/[slug]` 415px wide at 360 (page scrolls/zooms on phones) | Implicit mobile grid column adopts min-content; `minmax(0,…)` only existed at `lg:` | `min-w-0` on grid children · `2154c35` |
| D-05 | Major | `/sponsor/campaigns/[id]/report` 395px | same pattern at `xl:` | `2154c35` |
| D-06 | Major | `/sponsor/marketplace` 380px (all three tabs) | same, card grids | `2154c35` |
| D-07 | Major | `/admin/campaigns/new` **624px** | same + `min-w-[34rem]` table propagating through `overflow-x-auto` during intrinsic sizing | `2154c35` |
| D-08 | Major | Dark `--sx-text-faint` 3.05:1 (captions/labels below AA on every screen) | Token never measured for dark theme | `#7e88a0` (5.14) · `76df208` |
| D-09 | Major | Light `--sx-text-faint` 2.54:1 | A2's light sweep covered brand/chip tokens, not text-faint | `#52708f` (5.16) · `76df208` |
| D-10 | Major | White-on-primary CTAs 2.95:1 in dark theme (~27 sites) | `text-white` on bright brand fill | Themed `--sx-cta-ink` (dark ink 6.64 / light white 5.67), sweep to `text-cta-ink` · `76df208` |
| D-11 | Minor | Light `--sx-accent-soft` 2.68:1 as text and as CTA hover fill | Token missed the light darkening pass | `#9c4507` · `76df208` |

**One observation logged, not filed:** sponsors have no brief-status surface
after "Add to brief" — consistent with the §13 managed model (BTG drives
matching); raising it would be a plan change by PR, not a tracker edit.

## 6 · Test-harness anomalies (false failures — read before re-running)

The initial consolidated run reported 5 failures; each was a harness defect.
Recorded so regression runs don't rediscover them:

| # | Symptom | Actual cause | Harness correction |
|---|---|---|---|
| H-01 | A-12 "Media Value" marker missing | Page renders "Media value"; the capitalised string exists only in a code comment and an unused legacy fixture | Match case-insensitively |
| H-02 | (earlier run) 3 routes "passed" width while actually overflowing | Chrome mobile emulation **expands the layout viewport** around overflowing content, so `scrollWidth <= innerWidth` always holds | Compare `scrollWidth` to literal 360 |
| H-03 | B-02…05 "Escape doesn't close drawer" | Drawer runs a ~160ms exit animation; check at 350ms raced it | Assert on `aria-expanded` after ≥1s |
| H-04 | (earlier run) ~50 phantom AA failures in light theme incl. ratio-1.01 "white on white" | Setting `data-theme` mid-page in an evaluation doesn't recompute Tailwind v4 theme properties the way a real load does | Apply theme pre-paint via `localStorage` before navigation |
| H-05 | (earlier run) `$40`/`$220` "athlete rates" on every page incl. the site map | Next.js RSC flight payload uses `"$40"`-style row-reference tokens in inline `<script>` | Strip `<script>` blocks before string-matching; trust import analysis |

## 7 · Traceability

| Acceptance criterion | Cases | Status |
|---|---|---|
| §39 loop: pass/fail for all 11 steps, gaps fixed or filed | A-01…A-12, D-01…D-03 | **Met** |
| No horizontal scroll at 360px | B-01 (30 routes), D-04…D-07 | **Met** |
| Portal nav usable on phone | B-02…B-05 | **Met** |
| Contrast AA in both themes | C-01, C-02, D-08…D-11 + gradient math | **Met** |
| Keyboard navigation complete | C-03, C-04, C-05, B-02…B-05 (Escape) | **Met** |
| Redeem page passes without JS | C-06 | **Met** |

## 8 · Residual risks

- Contrast is enforced at **token level**; a hand-rolled hex on a future page
  won't be caught until the checker re-runs. Re-run on new pages.
- `text-muted` at 11px measured 4.25 at the extreme 20%-alpha edge of a
  `from-primary/20` band (real placement sits over lower alpha). Avoid muted
  small copy at the leftmost band edge.
- All checks ran in headless Chrome; engine-specific rendering (Safari/Gecko)
  and real-device touch behaviour are unverified.
- Screen-reader semantics are not covered (candidate follow-up task).

## 9 · Regression re-run

Dev server on `:3000`, then drive headless Chrome over CDP
(`--headless=new --remote-debugging-port=<port>`; Node ≥21 has WebSocket
built in). The four groups are: (A) marker walk of the 12 loop screens,
(B) `scrollWidth` vs literal 360 across all routes + drawer open/Escape with
`aria-expanded` assertions, (C) contrast walk (composite ancestor
`background-color`, skip `aria-hidden`/`svg`/gradient-below-opaque, light
theme via pre-paint localStorage) + Tab/`:focus-visible` + no-JS redeem.
Honour §6 or the run will report phantom failures. Build gates (`tsc`,
`eslint`, `next build`) run before the suite.
