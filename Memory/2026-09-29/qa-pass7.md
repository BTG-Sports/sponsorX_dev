# QA pass 7 — the P2-FE-01 live wiring (HeckerCreatives, 2026-09-29)

This pass tested today's P2-FE-01 working tree. It was an adversarial and edge
pass on top of the 8 happy-path walks in `tasks-completed.md`. The Playwright
spec was throwaway: it used local QA seeds and was deleted afterwards, and every
`qa7_` row it created was removed.

## Automated baseline (code unchanged since these runs)

- Backend vitest: 1700/1700.
- Frontend vitest: 386/386.
- eslint, tsc and `npm run build` are green.
- QA spec: 23 checks. 21 pass, 2 fail, and the 2 failures are real defects
  (F-1 and F-2 below).
  - The first run had 5 more failures. All five were harness bugs (Clerk not yet
    loaded, a selector match, a missing `<main>`) and pass after the fix.
- 0 page errors and 0 dialogs, apart from the expected error boundary in F-4.

## Findings, ranked

**Origin**: *new* means introduced today; *old* means it was already there.

| # | Sev | Origin | Finding |
|---|---|---|---|
| F-1 | Medium | new + old | **A NUL byte in a public slug returns 500.** Affected: `GET /public/properties/:slug` (new), `/public/athletes/:slug` and `/public/s/:code` (old). Postgres raises `22021 invalid byte sequence 0x00` and it surfaces as `internal_error`, so it's a noisy 500 anyone can trigger. Other public routes already 404 (`/public/editions`, `/tracking`, `/rewards`, `/onboarding`). **Fix:** reject `\0` (or apply the web page's `^[a-z0-9-]{1,120}$` rule) at the route, returning 404. Better: one param guard in the router. |
| F-2 | Medium | new | **The brief's failure message promises "Your answers are saved on this device", but step-4 answers are lost.** `setAnswer` only calls `setTouched`, and `localStorage` is written only on Continue. After a 429 or network failure, a reload returns to step 4 with Company, Name and Email empty, which is data loss on the sponsor funnel. **Fix:** persist the draft before calling `submitBriefRequest`, or on every answer change. |
| F-3 | Low | old | **A signed-in ATHLETE with no athlete row gets "Something broke on our side".** `/athletes/me` answers 403, and the page throws to the error boundary. That reads as an outage, but it's a provisioning gap. `/athlete/profile` behaves the same. **Fix:** a specific "your account isn't linked to an athlete profile yet — contact BTG" state. |
| F-4 | Low | old | **An unlinked PROPERTY_MGR, or a GUARDIAN on `/athlete`, sees the sample property or athlete.** The "Demo data" notice is shown, so it isn't presented as theirs, but a "not linked" state would be clearer. There is no guardian portal yet. |
| F-5 | Low | new | **Sponsor campaign detail finds the campaign inside `GET /campaigns`, which caps at 100 rows.** A sponsor's 101st-oldest campaign would show "Campaign not found". Not reachable with Phase 1 volumes. **Fix:** a scoped `GET /campaigns/:id`, or return package and money on `/ops`. |
| F-6 | Info | new | **`toInquiry` is exported from a `"use server"` file**, so Next exposes it as a callable server action. It's pure and harmless, but it should move to `lib/brief-flow.ts`. |
| F-7 | Info | old | **Public `notFound()` returns HTTP 200** under `(public)/loading.tsx` streaming. The not-found UI renders. Already flagged today. |
| F-8 | Info | old | **SPONSOR_ANALYST receives budget, contracted, invoiced and paid.** That matches `fields.ts` (SPONSOR_ROLES read campaign value). It's listed so that "analyst sees spend" is a decision someone made on purpose. |

## What passed

**Security and scope**
- A sponsor gets 403 on another sponsor's `/campaigns/:id/ops` and on
  `/team/roster`.
- A sponsor's `/ops` body has no `offered` key and every `invite` is null, so no
  athlete pay leaks.
- A cross-sponsor or garbage campaign id shows "Campaign not found".
- An athlete's PUT on another athlete's socials returns 403, and the target is
  unchanged.
- A forged `source: VERIFIED_API` is stored as `SELF_REPORTED`.
- The property manager's `/team/roster` is own-property only.

**Public property**
- The JSON keys match the whitelist exactly.
- No birthDate, ageBand, legal name, email, tenant or Zoho id appears anywhere
  in the body.
- The minor is counted, not named.
- A non-public (CHANGES_REQUESTED) minor is not counted.
- Traversal, SQL, 600-character, unicode and upper-case slugs return 404.
- The rate limit trips at exactly 120/min (5 of 125 refused) and doesn't affect
  other routes.
- A property named `<img src=x onerror=alert(1)> "Quote" & Co` renders as text,
  with no image element and no dialog.

**Sponsor**
- All 4 own campaigns show, and the other sponsor's doesn't.
- The count reads "4 campaigns".
- `?q=`, `?status=` and junk params (`status=BOGUS&sort=views&page=999&size=7`)
  all behave.
- The STAFFING campaign shows "No Campaign Orders yet", "starts in …" and no
  report link.
- The empty sponsor gets empty states on both the list and the dashboard.
- Demo states still render.

**Admin board**
- SUPER_ADMIN, SALES, CAMPAIGN_MGR, NETWORK_MGR and FINANCE all render with no
  error.
- Sections outside a role say so: 1–3 "not in your role", plus 2 "BTG admin's".
- BTG_ADMIN's booked total ($4,250 over 9 campaigns, 3 live) matches the API
  exactly.
- All 9 board links return 200.

**Athlete**
- A minor with no guardian sees the gate banner, "No guardian linked yet" and
  0 live upload links.
- A minor with a verified guardian sees "Verified" and no banner.

**Profile editor**
- `?section=bogus` falls back to Identity, and payment shows the "not collected"
  copy.
- A handle of just "@" leaves Save disabled.
- A 70-character handle and followers above INT4 are refused with a message,
  and nothing is written.
- Non-digits are stripped from the follower field.
- Rows cap at 4 with unique platforms.

**Brief**
- An invalid email is blocked client-side.
- A double-click creates exactly 1 Inquiry.
- The name "  Pat   Q  " is split as Pat / Q.
- A 429 shows the "Too many requests" message (but see F-2 on the draft).

**Accessibility and layout**
- One h1 on every page tested, and 0 unnamed buttons, links or inputs.
- 0px horizontal overflow at 390px on every changed page.

## Not covered

- An API outage during brief submit: the server action runs server-side, so the
  browser can't intercept it.
- Real screen-reader and axe runs: axe isn't installed.
- Production build served with `node .next/standalone`.
