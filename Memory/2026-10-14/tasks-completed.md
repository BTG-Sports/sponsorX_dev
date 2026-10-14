# 2026-10-14

## HeckerCreatives — 3S1-FE-01: figures check on the integrations screen (Code review)

- **Pulled `origin/main`** (6626d0d, #203). It already contains all of `main_development`, so `feature/P1-ART-25-finance-vault` fast-forwarded 61 commits with no conflicts; uncommitted work in the tree was untouched (none of it overlapped upstream).
- **Heads-up from the lead dev today:** the fact ledger (data history and every money/delivery movement — 3S1-BE-01/02, 3S1-DATA-05/06/07, 3S1-QA-01/02/03) is being revised because its tests kept failing; ~90%, expected 2026-10-15 with new FE tasks. This screen was built against today's `facts` shape — **re-walk it when the revision lands.**
- **Built:**
  - `frontend/src/lib/fact-check-live.ts` — turns the `facts` section of `GET /operations/integration-health` into a state: `never`, `failed`, `matching`, `mismatch`. Pure, unit-tested (`tests/fact-check-live.test.ts`, 8).
  - `/admin/integrations` — a "Figures check · nightly" section under the queue: when it last ran, matching or not, since which night, the differences in words (the API sends at most 20, then "…and N more"), and whether admin emails are on in this environment.
  - **A fourth state the task didn't list:** the check could not run (`matches` null with `lastError`). Shown as "not run" with the error — never as a mismatch, matching the backend's rule that a failed run is never emailed as one.
  - A mismatch or a failed run also joins the page's "N things need attention" summary at the top.
- **QA (live, 2026-10-14):** Docker up, the two pending migrations applied (`fact_ledger`, `fact_check_run`), API on :4000 and web on :3000. A temporary Playwright walk staged each state in `FactCheckRun` (days in 2099, deleted afterwards) and looked at the screen as the QA BTG admin on desktop and mobile:
  - never run → "Not run yet"; matching → "Report figures match the app"; two failing nights with 22 differences → "since the night of Jan 2", 20 shown + "…and 2 more", the campaign named; another tenant's difference never shown; a run with an error → "could not run" + the error.
  - Finance is sent to its own `/finance` portal and never reaches the screen.
  - 4/4 walks passed; screenshots reviewed by eye (no overflow at phone width). Frontend suite 139 files / 1,528 tests green, lint clean, `next build` green.
- **Docs/tracker:** Phase 3 plan entry → Code review with a Delivered line; tracker row 66 (Phase 3) → Code review, Owner, Date Started, Notes.

## HeckerCreatives — P1-ART-26: one theme, the day/night toggle removed (Code review)

- **Asked by the programme owner today:** remove day/night mode from the whole web app; the default — dark — is the only theme. New task **P1-ART-26** raised (Phase 1 plan + tracker row 303, ranges extended to 303).
- **Changed:**
  - `components/theme-toggle.tsx` deleted; `portal-shell.tsx` no longer renders the sun/moon button (it showed on the athlete Arena, property, advisor, NEXT and guardian shells).
  - `app/layout.tsx`: the pre-paint script that re-applied `localStorage["sx-theme"]="light"` is gone, so anyone who had picked light gets dark on their next load. `suppressHydrationWarning` stays (the landing loader and the proposal print still write attributes on `<html>`).
  - The Arena's light-only rules (`[data-theme="light"]` floodlight, stripes, lanes, plate shine; the phone dock and sheet) removed from `globals.css` and `mobile-nav.css`.
  - **Kept on purpose:** the Frost light tokens in `globals.css` — the schools proposal prints on them (`lib/print-light.ts`, P1-FE-26). The QR print sheets' `?theme=light|dark` is a print format, not an app theme, and is unchanged. Old "in both themes" remarks in ~20 code comments were left alone (no behaviour; avoids churn in files others edit).
- **QA (production build, 2026-10-14):** every browser started with the old `sx-theme=light` already stored. 232 page visits — public site, BTG admin, athlete, sponsor, Finance, property manager, advisor and student; desktop and mobile; 116 screens including campaign, order and inventory detail pages: 0 theme buttons, 0 `data-theme` on `<html>`, dark ground on every page, 0 page errors, 0 5xx, 0 horizontal overflow. The 8 redirects are routes that forward by design. The schools proposal print still switches to light and back to dark. Screens spot-checked by eye. Frontend 139 files / 1,528 tests, eslint, tsc and `next build` green. Not walked: the guardian shell (no QA guardian login).

## HeckerCreatives — P1-ART-27: signed-in visitors get "<Role> Dashboard" on the public site (Code review)

- **Asked by the programme owner today:** on the landing page, if someone is already signed in and their session hasn't expired, Login and Get Started should take them to their own dashboard. New task **P1-ART-27** (Phase 1 plan + tracker row 304, ranges extended to 304).
- **Built:**
  - `lib/dashboard-link.ts` — names the portal for the button ("Admin Dashboard" … "Student Dashboard"; "Guardian Dashboard" for a guardian). Pure; `tests/dashboard-link.test.ts` (3).
  - `server/my-dashboard.ts` — a server action: `fetchActor()` + `portalFor()`, the same answer `/portal` acts on. Signed out, expired, unprovisioned or the API down → null.
  - `components/my-dashboard.tsx` — `useMyDashboard()`: Clerk's `useAuth()` decides whether the session is live; only then is the action called, once per page, shared by every button. `DashboardCta` for the landing's hero and closing buttons.
  - `site-nav.tsx` — `HeaderActions` (Login + Get Started moved here from `site-chrome.tsx`): signed in, Login steps aside and the gradient button reads "<Role> Dashboard"; the phone menu's pair becomes one full-width button.
  - `/` is still prerendered static — the role is never read during the page render.
  - The footer's "Sign In" link was left as is.
- **QA (production build):** 18/18 Playwright walks, desktop + mobile. Signed out, nothing changes. Each of admin, athlete, sponsor, Finance, property, advisor and student: header + hero + closing all read "<Role> Dashboard" and link to their portal, Login gone, the phone menu shows one button, clicking the header button lands in the portal, `/packages` shares it. **A revoked Clerk session goes back to Login / Get Started** (session revoked via the Clerk API, page reloaded). Screenshots after the 3D loader at 1366 / 412 / 360 px reviewed by eye: the longest label ("Property Dashboard") fits beside the logo at 360 with no overflow. Frontend 140 files / 1,531 tests, eslint, tsc, `next build` green.
