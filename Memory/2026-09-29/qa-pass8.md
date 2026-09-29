# QA pass 8 — failure modes, volume, regression, production build (HeckerCreatives, 2026-09-29)

This pass covered ground [QA pass 7](qa-pass7.md) didn't:
- API outage, and a session or role that changes mid-flight;
- 132 campaigns for one sponsor, and hostile or very long names;
- cross-tenant isolation;
- keyboard-only use of the brief;
- a regression smoke over every live screen that shares the code touched today;
- the **production standalone build** (`node .next/standalone/frontend/server.js`, the
  Dockerfile's command).

The specs were throwaway and have been deleted, and all `qa8_` rows were removed.
Pass 7's F-1 and F-2 are still unfixed; this pass tested the tree as it stands.

## Results

- **Dev server:** 10/10 checks after harness fixes. The harness bugs were a page
  reused across probes, a capture taken during streaming, and a wait on an
  attribute that never appeared.
- **Outage probe:** 1/1 (it has to kill the API).
- **Production build:** 7/7, covering volume, hostile names, cross-tenant and
  smoke over 31 routes.

## Findings, ranked

This continues pass 7's numbering.

| # | Sev | Origin | Finding |
|---|---|---|---|
| F-9 | Medium | new (exposes old) | **`GET /campaigns` caps at 100 rows, and the new live pages present the capped answer as the whole truth.** A sponsor with 132 campaigns sees "100 campaigns" on the list, with 32 missing, and campaign #130 shows "Campaign not found". The admin board's booked / invoiced / collected totals and "N in total" silently undercount once a tenant passes 100 campaigns. This confirms pass 7's F-5 and makes it wider. **Fix:** paginate `/campaigns` (cursor, like `/applications`) and page through it in the readers; at minimum, return `hasMore` and show "100+". Money totals need a server-side aggregate, not a client sum over a capped list. |
| F-10 | Medium | new | **`saveSocials` throws instead of returning an error value.** When the session has expired (`apiFetch` throws "Not signed in.") or the API is unreachable, Save accounts shows the portal error boundary, "Something broke on our side", with a 500 in the console. The other server actions here return `{ ok: false, message }`. **Fix:** catch inside the action and return "Your session ended — sign in again" or "Couldn't reach SponsorX — nothing changed". |
| F-11 | Low | new | **A long campaign name overflows the detail page by 23px at 390px**, in both dev and production. The `<h1>` doesn't wrap one long unbroken word. The list and admin board are fine (0px). **Fix:** add `break-words` / `min-w-0` to the header block. |
| F-12 | Low | new | **During an API outage, a real property's public page says "This page doesn't exist".** `fetchPublicProperty` returns null for "unreachable" and "not found" alike, so an outage looks like a deleted property. Under the (public) streaming it's still HTTP 200 (F-7). **Fix:** tell a 404 apart from a network or 5xx failure, and show "temporarily unavailable" for the latter. |
| F-13 | Low | old | **The brief's goal and budget radio groups ignore arrow keys.** Each option is a `role="radio"` button in the tab order, so Tab + Space works: a keyboard-only brief reached Received. But the ARIA radio-group pattern (arrows move and select, one tab stop) isn't implemented. Enter in a text field doesn't advance either. |
| F-14 | Info | old | **`/portal` logs minified React error #441 in the production build**, once, during sign-in routing. Not seen in dev. `/portal` wasn't touched today, so this needs a non-minified repro. |
| F-15 | Info | old | **Local production runs need `HOSTNAME` to resolve for Next 16's self-proxy.** With `HOSTNAME=127.0.0.1` the standalone server proxies to `localhost`, which is `::1` on Windows, and every request hangs up. `0.0.0.0` works. The Dockerfile sets no `HOSTNAME`. Railway works today, but Next's own Docker guidance pins `ENV HOSTNAME=0.0.0.0`; worth adding before something else sets it. |

## What passed

**Outage**, with the API killed mid-session:
- `/sponsor`, `/sponsor/campaigns`, the campaign detail and `/admin` each show
  "This page couldn't load", with no sample data. The layout's actor read fails
  before the page does.
- A brief sent during the outage says "We couldn't reach BTG just now — nothing
  was sent" and doesn't show Received.
- The demo property slug still renders the sample.

**Session and role**
- With the role revoked mid-session, the next load lands on `/portal` "Your
  account isn't set up yet", and the campaigns are gone.
- A SPONSOR_ADMIN with no sponsor link gets "0 campaigns" and the empty state,
  never another sponsor's data.

**Cross-tenant**
- A sponsor in `e2e_fan_tenant` sees only "E2E Campaign".
- The seed tenant's campaigns are absent, and 403 is returned on their ops.
- BTG_ADMIN's board in the seed tenant doesn't include the other tenant's
  campaign.

**Hostile data**
- The name `<script>alert('x')</script><b onmouseover=…>` renders as text on the
  list and detail, with no element injected and no dialog, in dev and
  production.

**Volume**
- The list paginates 12 per page; `size=60&page=3` shows the last 40.
- The list loads in about 1.1s at 100 rows.

**Keyboard**
- The full brief works by keyboard (Tab / Space / Enter) and creates 1 Inquiry.

**Regression smoke**, dev and production (every live screen for SPONSOR_ADMIN,
BTG_ADMIN, ATHLETE, plus public: 31 routes)
- Every route returns 200 with no error boundary.
- 0 console or page errors, apart from F-14.

## Suggested fix order

1. F-2 and F-10: data loss and the error boundary on the two new write paths.
2. F-1: public 500s.
3. F-9: truthful campaign counts and money.
4. F-11, F-12, F-13.

## Fix pass — passes 7 and 8 (same day)

Each fix was re-tested in the browser with a throwaway spec (since deleted):
7/7 checks plus the outage re-test passed, with 0 console or page errors.

| # | Status | What changed |
|---|---|---|
| F-1 | **Fixed** | `publicProperty`, `publicProfile` and `resolveStudentCode` each refuse a NUL with their own not-found error, so every route keeps its stable error code (the reward routes' `unknown_token` included). As a safety net, `errorBody` maps Postgres `22021` to **400 `invalid_input`**, which also covers a NUL inside any JSON body (that was a 500 too). A first attempt with a global path guard broke `qa6.fixes` P6-BE-03's `unknown_token` code and was replaced. Tests: `tests/nul-input.test.ts`. |
| F-2 | **Fixed** | The brief wizard writes every edit to `localStorage` as it's made, not only on Continue. Re-test: after a 429, a reload still shows company, name and email; a retry once the limit clears sends exactly 1 Inquiry. |
| F-3 | **Fixed** | An ATHLETE with no athlete record gets "Your account isn't linked to an athlete profile yet" on `/athlete` and on the editor, instead of the error boundary. `/athlete/profile` (P3-FE-03) is unchanged. |
| F-4 | **Fixed (property)** | An unlinked PROPERTY_MGR gets "isn't linked to a property", never the sample. The GUARDIAN view of `/athlete` is unchanged: a guardian portal isn't built yet. |
| F-5 / F-9 | **Fixed** | `GET /campaigns` is paged: `?limit` from 1 to 100 (default 100), `?cursor`, and `page.hasMore` / `nextCursor`, with a total order of startDate then id. There is a new `GET /campaigns/:id` in the same row shape, with the same money gating, and registry rows for both. `server/campaigns.ts` (`fetchAllCampaigns`, `fetchCampaign`) is used by the sponsor list, detail and dashboard, the admin board, and the admin Campaigns and Rewards pages. Re-test with 132 campaigns: "132 campaigns", "Showing 121–132 of 132", #131's detail opens, and the board and admin Campaigns page match the database (140 in total). Tests: 5 new route tests, plus `campaigns-paging.test.ts` (5). |
| F-6 | **Fixed** | `toInquiry` moved to `lib/brief-inquiry.ts`, so the `"use server"` file exports only the action. The action now also rejects a non-object draft instead of throwing. |
| F-10 | **Fixed** | `saveSocials` returns errors as values: an expired session says "Your session ended — sign in again", an outage says "Couldn't reach SponsorX", and a 401 is handled too. The editor also catches transport failure. Re-tested for both an expired session and an API outage, with no error boundary. |
| F-11 | **Fixed** | The detail header gets `min-w-0` and `overflow-wrap:anywhere`: 0px overflow at 390px with a 200-character name. |
| F-12 | **Fixed** | The public property page tells `missing` (404 → not-found) apart from `unavailable` (network, 5xx, timeout or 429 → "This profile is temporarily unavailable" with a brief CTA). The demo slugs no longer call the API. |
| F-13 | **Fixed** | The goal and budget radio groups have one tab stop, arrows move and select, Home/End jump, and it wraps. |
| F-15 | **Fixed** | The web Dockerfile pins `ENV HOSTNAME=0.0.0.0`. |
| F-14 | **Closed, not a defect** | The redacted `/portal` render error was `fetch failed` / `ECONNREFUSED :4000`: the production server's first sign-in happened while the API was being restarted after the outage probe. |
| F-7 | Open (old) | Public `notFound()` still returns HTTP 200 under `(public)/loading.tsx`. Fixing it means moving or removing that loading boundary for every public page, which is a team call. |
| F-8 | Open (info) | Whether SPONSOR_ANALYST sees spend is a policy question. |

**Verified after the fixes**
- Backend vitest 1711/1711 and tsc clean. The pilot school was re-seeded after
  the suite.
- Frontend vitest 391/391, eslint clean, and `npm run build` green (dev server
  stopped by port first, then restarted).
