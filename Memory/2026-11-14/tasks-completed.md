# 2026-11-14

## POL-BE-41: support inbox backend (rcfworks)

- **Checked first.** On main_development only the group G plan existed (PRs #386, #387). None of POL-BE/FE-41 to 43 had been built.
- **Built** on `feat/POL-BE-41-support-inbox`:
  - migration `20261114120000_support_inbox`: a status on each support message (New, Answered, Closed) and a `SupportReply` table;
  - inbox list, the message page's replies and "This person on SponsorX" records, reply and "Mark closed" endpoints;
  - the support@ email is a notice only (no message text, no file names, no reply-to); a new `support.reply` email goes out from noreply@ in the sender's thread;
  - BTG admins get write on `supportMessage` (policy, RBAC Matrix §27, matrix digest updated).
- **Decided with the user:** the inbox filters by status now; the filter by case is added in POL-BE-43, where the cases are stored.
- **Checks:** backend build, lint, security scripts, secret scan, audit and the full backend suite pass on a local Postgres.
- **Merged:** PR #391 into `main_development` (2026-11-14); POL-BE-41 is **Done** on the Polish sheet.
- **Next:** POL-BE-42 ("what's wrong" tags), then POL-BE-43, then the three front-end rows.

## POL-BE-42: "What's wrong" tags, backend (rcfworks)

- **Decided with the user:** six types, the five planned plus **Technical Decision** (for BTG rules a person decides on: restricted business type or words, staff confirm minors, guardian rejected). Every problem carries a code (`MISSING_DOCUMENT`, `EMAIL_NOT_CONFIRMED`, …).
- **Built** on `feat/POL-BE-42-whats-wrong`, which sits on top of `chore/POL-BE-41-done` because both change the tracker:
  - `backend/src/domain/hold-problems.ts` reads the stored reasons; nothing new is stored;
  - `problems` added to New sign-ups (list, stream, athlete page), Sponsor requests (list, page), Onboarding (queue, page) and the support inbox's sender card;
  - only held records have problems.
- **Left out:** a "check couldn't run" code, because no rule writes that reason today.
- **Checks:** backend build, lint, security scripts, secret scan, audit and the full backend suite (3,766 tests) pass.
- **Tracker:** POL-BE-42 is in Code review.

### POL-BE-42 closed
- PR #394 merged to main_development; tracker row set to Done (2026-11-14). Same branch PR'd to main to carry the code there.

### POL-BE-43 — help desk form backend (Code review)
- Cases: `backend/src/domain/helpdesk-cases.ts`, 375 cases from documentation/SponsorX-Helpdesk-Cases.md (ID, topic, section, wording, who). tests/helpdesk-cases.test.ts fails if the file and the document differ. Retired IDs go in `RETIRED_CASE_IDS`, never reused.
- Topics: ACCOUNT, PAYMENT, GUARDIANSHIP, CAMPAIGNS, SHOP, REWARDS, NEXT, OTHER. The first four keep the contact form's keys and labels; GET /public/support still lists only those four (so the old form and its tests are unchanged).
- New GET /public/support/cases: visitor = public + fan + booth staff cases; signed in = role's audiences + "any"; BTG staff = all.
- POST /public/support/messages takes `cases`. Text required only when none ticked or OTH-01 ticked. Wrong-topic / not-yours / unknown case → 422 naming it. Signed-in sender linked via new `SupportMessage.userId`; expired Bearer → 401; signed in without an account → visitor. Clerk is consulted only when a Bearer token or `__session` cookie is present.
- Migration 20261114180000_helpdesk_cases: `caseIds TEXT[]` (GIN index), `userId` FK (SET NULL), CHECK text-or-cases.
- Inbox: rows and detail carry `cases` (today's wording, `retired` flag) and `signedIn` / `account`; `?case=` / `?topic=` narrow the tab and counts. Notice email lists case IDs; sender's copy lists the ticked wording.
- Tests: helpdesk-cases.test.ts, helpdesk-form.test.ts; full suite 3,782 passed locally.

### POL-BE-43 closed
- PR #397 merged to main_development; tracker row set to Done (2026-11-14). Same branch PR'd to main to carry the code (incl. migration 20261114180000_helpdesk_cases).

### POL-FE-41 — support inbox screens (Code review)
- Menu: "Support" under Accounts (BTG admin / super admin), with the New count. Shared-menu change kept small: optional `count` on NavItem (`NavCount` pill in portal-nav, a "N new" line on the phone menu tile) and a `counts` prop on PortalShell. The admin layout still passes `nav={navFor(actor.roles)}` unchanged (HeckerCreatives' commission-live test checks that line); the count comes from `server/support-inbox.ts` (`?status=NEW&page=1&size=1`, any failure = no number).
- `/admin/support`: New / Answered / Closed tabs with API counts, house pager, filter by topic or case (GET form).
- `/admin/support/[id]` (originally HeckerCreatives' 2S1-FE-14 page, now part of this rcfworks row): status, cases ticked, signed-in account, replies, `SupportReply` (Send / Mark closed via `reply-actions.ts`), "This person on SponsorX" card with `ProblemTags` (shared with POL-FE-42). Back link goes to Support.
- Helpers in `lib/support-inbox-live.ts`; tests in `frontend/tests/support-inbox-live.test.ts`. Frontend build, lint, 1,970 tests pass. E2E left to CI (needs Clerk test keys and Redis).

### POL-FE-41 closed
- PR #400 merged to main_development (CI incl. E2E green); acceptance checked clause by clause; tracker row set to Done (2026-11-14). Same branch PR'd to main to carry the screens.

### POL-FE-42 — "What's wrong" panel and row tags (Code review)
- `WhatsWrongPanel` + `ProblemTags` (compact mode, optional links) in `components/problem-tags.tsx`; `problemTarget` / `docAnchor` in `lib/support-inbox-live.ts`.
- Panel at the top of the athlete sign-up page (live-signup-profile.tsx), sponsor request page and organisation page; replaces the plain reasons list when problems exist (org flags keep their list). Document rows got `id="doc-<id>"` anchors and the Documents section `id="documents"`.
- Matching: reason names differ from row names ("Athlete's government ID" vs "Government ID"), so longest contained name wins; no match → Documents section. Sponsor proofs are all named "Proof of business".
- Rows: New sign-ups stream (intake-stage.tsx StreamRows), Sponsor requests New tab (new column), Onboarding queue ("Held because" column renamed "What's wrong").
- Tests: `frontend/tests/whats-wrong-live.test.ts`. Build, lint, 1,978 frontend tests pass.

### POL-FE-42 closed
- PR #403 merged to main_development (CI incl. E2E green); acceptance checked; tracker row set to Done (2026-11-14). Same branch PR'd to main.

### POL-FE-43 — help desk form (Code review)
- `/contact` is the help desk: step 1 section (topic radios + case tick boxes from GET /public/support/cases, "Something else" OTH-01 last on every topic), step 2 the existing "Message BTG" form (name, email, message, files). Message optional once a case is ticked; required when nothing ticked or OTH-01 ticked.
- Signed in: `server/helpdesk.ts` sends the Clerk session (cases by role, message linked); name/email prefilled from Clerk; expired → sign-in notice. Visitor: no token. Cases unreadable → the old form.
- `?` link in portal-shell header → `/contact?back=<rootHref>`; `backHref` only allows portal roots. Old `?topic=` links still work (`helpdeskTopic`).
- Picker kept outside the form on purpose: e2e/qa-phase2's `form.getByLabel("Email")` would otherwise also match GRD-01/03/05 (case-insensitive substring).
- Tests: `frontend/tests/helpdesk-live.test.ts`; build, lint, 1,990 frontend tests pass.
