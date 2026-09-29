# 2026-09-29 — tasks completed

## `npm run deploy` — one command for staging and production (rcfworks)

No board task; tooling asked for by the programme owner.

- **What it does.** `scripts/deploy.mjs`, run as `npm run deploy` from the
  repo root. It deploys the latest commit on **GitHub `main`** (never the
  local working tree) to Railway `api` and `web` in **staging**, waits for
  both to succeed, then asks for a typed `yes` before deploying the **same
  commit** to **production**. Usage: `npm run deploy production`,
  `npm run deploy staging` (staging only), `npm run deploy dry run` (show,
  change nothing). Bare `npm run deploy` prints this usage and does nothing.
- **How.** The Railway CLI's own login (`railway api`, GraphQL
  `serviceInstanceDeployV2` with `commitSha`), polling `deployment.status`.
  A production deploy held at `NEEDS_APPROVAL` is approved by the script,
  since the typed `yes` is that approval. No new dependency.
- **It does not wait for GitHub's checks** — they are refused while the
  Actions quota is exhausted (see 2026-09-28).
- **Documented** in `documentation/SponsorX-Deployment-Runbook.md` §1, "Deploying by hand".
- **Verified.** Dry run resolved both environments; a real staging-only run
  deployed `e73764a` to staging `api` + `web`, both SUCCESS. Production was
  not deployed by the test — it already ran the same code (`29bda05`; the
  only later change is this log folder's sibling, the 09-28 summary).

## Also noted

- Everything merged on 2026-09-28 was already live in both environments at
  `29bda05` (21:02 Manila).
- **Tracker Slack/Sheet broadcasts are down while GitHub Actions is out of
  minutes.** `Tracker notify` failed on the #111 push (13:02 UTC 09-28) and
  `Tracker digest` failed its 13:12 UTC run. Once billing is fixed or minutes
  reset (1 Oct), re-run both from the Actions tab (`Run workflow`).

## Payment-provider board pack (`2S0-PMO-03` groundwork, no status change)

- Reviewed `2S0-PMO-03` for the programme owner: provider requirements,
  recommendation (Stripe Connect, Express accounts, separate charges and
  transfers — one payment splits across several properties/athletes and the
  reserve needs delayed transfers), what BTG must supply, and our side (the
  `backend/src/lib/payments.ts` adapter interface; raw-body webhook
  verification).
- Board pack saved to the owner's Google Drive as a Google Sheet,
  "SponsorX Payment Flow Board Pack" (id
  `1Uu_sBQKTatic6_iM1chDcjgN8OxyGJ_U1er4Yx6L2VQ`), 7 tabs: Summary,
  Flowchart (cell-drawn swimlanes), Flow Steps, Money Split Example (live
  formulas; reproduces the ledger design's $2,799.97 worked example to the
  cent), Provider Options, What's Needed, Waiting Tasks.
- Task stays **Blocked** — waiting on the owner's provider decision.

## Walkthrough logins on staging (no board task; programme owner's request)

- `backend/worker/jobs/seed-personas.mts`, called from `seedEnvironment`
  (so it runs at every non-production worker boot, idempotent). Creates the
  people in the two sign-up-to-payout stories, each at the point the story
  hands over to them: Riley's athlete application SUBMITTED (Hawks roster,
  20% team share), Jordan's student application SUBMITTED (Northside, minor,
  guardian verified), Maya FEATURED and claimable (guardian NOT verified),
  Northside Sports "Fall 2026" SELLING with a 26-slot rate-card flatplan,
  Harbor Coffee and Bowie Auto Care as sponsors, the Westfield Hawks as a
  TEAM property, and five BTG staff logins (admin, network, campaigns,
  finance, sales).
- **No passwords.** Every login is a Clerk test address
  (`<name>+clerk_test@example.com`), code **424242** on staging's development
  Clerk instance; placeholder `clerkId`s are claimed on first sign-in.
- Tested in `tests/pilot-school.test.ts` (same file as the pilot school, whose
  fixed ids it shares): every login claims its row with the right roles and
  links, Riley is in the review queue, Jordan only in Ms. Patel's queue, the
  edition is selling with every slot open, Maya's profile is public and
  claimable. Mutation-checked. Full suite: 1701 pass; the one failure is the
  known local-only QA-02 lock-timing test.
- **Gap found:** approving an athlete who applies through `/join` creates no
  login for them — the seed pre-creates Riley's and Maya's for that reason.

## Walkthrough gaps raised as tasks; `P3-BE-15` built (rcfworks)

- **Five rows added** (Phase 1 sheet rows 256–260, ranges extended to 260;
  header now 256 tasks · 615 person-days; plan doc 196 · 465), all raised by
  the programme owner from the staging walkthrough:
  - `P3-BE-15` (BE, 1d): an approved athlete, and a linked guardian, get a
    login. **Code review.**
  - `P4-FE-07` (FE, 1d): qualify / approve / close a sponsor brief from the
    admin workspace; the Campaigns page links to briefs waiting for matching.
    Ready.
  - `P3-FE-06` (FE, 3d): athlete portal home on real data. Ready.
  - `P3-FE-07` (FE, 3d): property portal on the manager's own property. Ready.
  - `P7-FE-06` (FE, 3d): admin Operations Board on real data. Ready.
- **`P3-BE-15`.** `src/domain/athlete-login.ts`. Called inside
  `reviewApplication`'s transaction on APPROVED — the only path to APPROVED,
  so `/join`, cohort imports and featured-profile claims are all covered —
  for the athlete and a linked guardian, and from `linkGuardian` when the
  athlete is already APPROVED/ACTIVE (the second path). Rows are
  invitations to claim (placeholder `clerkId`); an address held by any
  account in any tenant is never taken over, and the decision's response
  carries `login: { athlete, guardian }` (`created` / `already-linked` /
  `address-in-use` / `no-email`). Audited as `user.provision`
  (`AUDIT_ACTIONS.permission.loginProvision`). Approval email: "Sign in with
  this email address". Tests: `tests/athlete-login.test.ts` (real Postgres,
  sign-in through the identity path, incl. the late-guardian path) and seven
  in `application.review.test.ts` (takeover, duplicate, no-email, other
  decisions, rollback). Mutation-checked three ways. Full suite 1713 pass;
  the one failure is the known local-only QA-02 lock-timing test.
- **Frontend follow-up (not built):** the review panel does not yet show the
  `login` outcome; `address-in-use` would be worth surfacing to reviewers.
- Claude Design brief for the four FE screens handed to the programme owner.
