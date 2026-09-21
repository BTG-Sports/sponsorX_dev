# 2026-09-21 — tasks completed

## Board repair — seven of Jan's rows were lost in a binary conflict

The task board is a committed `.xlsx`, so git cannot merge it. On 2026-09-21 two
copies diverged and the conflict was resolved by discarding, which meant one
side's work vanished silently.

**The two versions were disjoint**, which is what made it dangerous:

| | `c4e614d` (HeckerCreatives) | `e1cd205` (rcfworks, HEAD) |
|---|---|---|
| Rows | 195 — `P1-FE-09` … `P1-FE-15` present | 188 — all seven missing |
| The 2026-09-18 backend work | absent — every row Blocked, no notes, 9 Done | intact — 42 Done, full notes |

Jan had been editing a stale copy, so their file never carried the Railway,
Prisma, outbox or audit updates; the discard then kept mine and dropped their
seven rows. Neither file was correct on its own.

**Resolved the way CLAUDE.md says to** — do not resolve by discarding theirs.
Took the richer HEAD board and grafted Jan's seven rows back in at their original
orders (33.9 – 33.996), owner `HeckerCreatives`, status `Code review` preserved.
195 rows, no duplicates, 77 formulas byte-identical, and the autofilter, Status
validation and three conditional-formatting ranges all extended 193 → 200.

**The lesson for a binary tracker:** a conflict on it is not a merge, it is a
choice between two files, and the losing side disappears without a diff to review.
Check the row count and the ID set on both sides before resolving — a version with
*fewer* rows is the tell.

**Still open:** `P1-FE-09` … `P1-FE-15` exist on the board but have no entries in
`documentation/SponsorX-Phase1-Managed-Marketplace.md`. The plan document owns
task definitions, so those seven need writing by whoever did the work.

## `P0-OPS-03` — Clerk production instance, on `sponsorx.net`

The domain landed: `sponsorx.net` was registered through Cloudflare on 2026-09-18,
Cloudflare nameservers authoritative, registrar lock on, zone empty. That released
the thread `P0-OPS-06` had been holding — a Clerk production instance needs a domain.

**The development instance from 2026-09-14 was gone.** The ICARRE FOUNDATION
workspace listed no applications at all, so `SponsorXDev` had been deleted or was
never in that workspace. Nothing was lost — it held default settings only.

**Recreated as `SponsorX`**, not `SponsorXDev`: one Clerk *application* contains both
the development and production *instances*, so a name carrying "Dev" mislabels half of
it. That naming confusion is the likely reason the first one went astray.

Settings chosen, and why each one is a project rule rather than a preference:

- **Consumer**, not B2B — B2B enables Clerk Organizations for roles and permissions,
  and Addendum A4 puts tenancy and roles in Postgres. Organizations left off for the
  same reason.
- **Email only.** Phone off because G-06 puts SMS out of Phase 1 entirely. Google off
  because a production Clerk instance needs your own Google OAuth credentials, meaning
  a Google Cloud project and consent screen that no task in the 345 covers.

**DNS was written by Cloudflare Domain Connect, not by hand.** Clerk's *Configure
automatically* button on the Domains page runs the Domain Connect flow; you authorise
in Cloudflare and Clerk writes all five records itself. This is strictly better than
hand-entry: no transcription risk, and the records come out **DNS-only** rather than
proxied, which is the mistake that breaks Clerk verification behind Cloudflare. The
usual caveat — Clerk may add a DMARC policy — did not apply, because the zone was empty.

Verified independently of the dashboard: all five CNAMEs resolve on both `1.1.1.1` and
`8.8.8.8`, and SSL has **issued** for `clerk.sponsorx.net` and `accounts.sponsorx.net`
(Google Trust Services WE1, from 2026-09-21) — the dashboard still read *Issuing* at
the time. No `_dmarc` TXT exists on the zone; it is not one of the five and did not
block verification.

**The row stays In progress**, and this is the honest reading of a two-part *Done when*.
Both instances exist — first half met. The second, "MFA available for privileged roles",
cannot be met on the Hobby plan: **all three** MFA strategies are Pro-badged
(SMS — also unavailable with phone numbers off, correctly — Authenticator application,
and Backup codes), and *Require multi-factor authentication* needs at least one strategy
enabled, so it is unreachable too. This matches the 2026-09-14 finding and remains a
launch cost at provisioning sequence step 16. When Pro is bought, the strategy to enable
is **TOTP + backup codes, never SMS**, because G-06 forbids the SMS channel outright.

**Keys were deliberately not captured.** Clerk's setup checklist offers to write
`pk_live`/`sk_live` into a local `.env.local`; they belong in Railway when `P2-INT-01`
installs the SDK, and touching them now would breach the B0 no-new-dependencies rule.

IDs for later: application `app_3JcMVfla0x1djZe95U38EcsxfRP`, development instance
`ins_3JcMVgKOWFsPxVEQknFjjWg8d8k`, production instance `ins_3JcQVIy69lPJqNJb4XcS0PHDe2o`.

**Left open by this session:** `P0-OPS-06` is now factually complete except for its
written half — the chosen name still has to be recorded in `.claude/stack-decision.md`,
and the Implementation Guide still assumes `sponsorx.com` and `app.sponsorx.com`
throughout, which is dead. `P2-OPS-11` and the fan-QR short-link domain were the other
two threads waiting on the domain.

## Decision — Phase 1 proceeds on the Clerk Hobby plan

Recorded on the task board against `P2-INT-02`, with a cross-reference from
`P0-OPS-03` so it is findable from either row.

**Hobby is not a sandbox.** The free plan includes a production instance with up
to 10,000 monthly active users, and the production instance verified on
`sponsorx.net` today is the one a minimal launch runs on. Launching on the
*development* instance was considered and rejected: dev instances cap at 100
users, serve `.accounts.dev` URLs, and Clerk treats their sessions as
non-production.

**`P2-INT-02` is the only Phase 1 task that needs Clerk Pro.** Nothing else in
the §39 loop touches a paid feature — sign-up, sign-in, sessions, the account
portal and auth email from `sponsorx.net` are all included. Three further Pro
traps are avoided by decisions already taken: Satellites (multi-domain) is Pro
and the single-host `sponsorx.net` choice removes the need; Organizations is
where Clerk's B2B pricing sits and is off per Addendum A4; Google OAuth is off.
The only visible cost of staying free is the "Secured by Clerk" badge on the
sign-in box.

So `P2-INT-02` is **deferred by choice, not blocked** — it buys Pro at
provisioning step 16, before real admin and finance accounts touch invoices and
earnings, and enables **TOTP plus backup codes, never SMS** (G-06). Until then
the compensating control is that admin accounts are the two-person team.

## `P2-INT-01` — mock-auth replaced with Clerk *(Code review, not Done)*

Real sign-in works. The mirror does not yet have a database to write to, so
half the `Done when` is unverified — see the end of this section.

**Two deprecations shaped the whole design, and both were found by reading
rather than by assuming.**

*Next 16 renamed `middleware.ts` to `proxy.ts`.* The exported function must be
named `proxy`, and the `edge` runtime is not supported under the new name — the
proxy runtime is `nodejs` and cannot be configured. Clerk 7.9.2 already knows:
its `suggestMiddlewareLocation()` looks for `middleware` *and* `proxy` when the
installed Next is 16 or higher, so `clerkMiddleware()` is still correct in a
file that is no longer called middleware.

*Clerk deprecated `createRouteMatcher()`*, and its reasoning is worth keeping:
"middleware-based auth checks rely on path matching, which can diverge from how
Next.js routes requests and leave protected resources reachable." So protection
is **not** in the proxy. Each portal's `layout.tsx` calls `auth.protect()`, and
because a layout wraps every page beneath it, adding a route cannot bypass the
check. The proxy now only attaches Clerk's request context. This is also where
`requireActor()` goes in `P2-BE-04`, so the two agree rather than duplicating.

**`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login` has to be an environment variable.**
Clerk's note on `auth()` states that server-side redirect URLs can only come
from env vars — not from the `ClerkProvider` prop and not from the
`clerkMiddleware` option. Without it, signed-out visitors are bounced to
Clerk's hosted portal on `accounts.dev` rather than the designed screen, which
is exactly what happened on the first run. **`P2-OPS-04` must set it in
Railway**, or staging will send people to a vendor URL.

**The mirror never invents a tenant.** A Clerk identity with no matching `User`
row is authenticated but *unprovisioned*, and `/portal` says so plainly. That
is the managed-marketplace model: BTG staff grant access, athletes are approved
rather than self-served. Linking is by verified email — an admin creates the
`User` row ahead of time and the first sign-in claims it by writing the real
`clerkId`. Creating a tenant here would be precisely the drift of authorization
into the identity provider that Addendum A4 exists to stop.

**`/portal` is the only route that touches the database.** Everything else
still runs on fixtures, which is what keeps the app buildable and runnable on a
machine with no `DATABASE_URL`.

**A build failure worth remembering:** `src/server/db.ts` constructed the Prisma
client at module import. `next build` imports every route module to collect its
configuration, so the first build died with "DATABASE_URL is not set" while
collecting `/portal` — a missing connection string became a *build* failure
rather than a *query* failure. The client is now built on first use behind a
proxy object, so the throw happens at the first real query, where the message
makes sense. Any future module that imports `db` at the top level inherits this
fix rather than re-hitting it.

**Verified:** `npm run build` passes; all four portals and their nested pages
(`/admin/finance`, `/sponsor/marketplace`, `/athlete/earnings`) return 307 to
`/login` signed out; `/`, `/packages`, `/join`, `/map`, `/athletes/[slug]` and
the fan surfaces `/r/[token]` and `/t/[code]` stay reachable; no deprecation
warnings remain in the dev log.

**Not verified, and the reason the row is Code review rather than Done:**
`User.clerkId mirrors the Clerk identity` cannot be exercised locally. There is
no local Postgres by design — Railway is private-networking only, and the
machine has neither docker nor psql. The mirror, `/portal`'s role-aware
routing and the unprovisioned state all need a staging deploy to prove.

## Staging is live, and the first deploy found a bug localhost cannot show you

`P2-INT-01` was deployed to Railway staging and given a public URL,
`https://web-staging-904a.up.railway.app`. Clerk's three variables were set on
staging `web` — the development keys, because the production Clerk instance is
bound to `sponsorx.net` and will not serve a `*.up.railway.app` host — and each
value was checked by hash against the local file rather than assumed, after a
byte-order mark in `.env.local` made the shell mis-read line 1.

Everything verified on localhost held on the real host: every portal and nested
page 307s to `/login`, the public pages and `/r/[token]` stay open, `/login`
serves Clerk, and the redirect goes to our own screen rather than
`accounts.dev`. The pre-deploy step reported "2 migrations found… No pending
migrations to apply", which is the first confirmation that `web` reaches
Postgres over private networking.

**The bug: `/t/ABC123` redirected to `https://localhost:8080/`.** The scaffold
route builds its fallback with `new URL(FALLBACK_URL, req.url)`, and inside a
Railway container `req.url` carries the internal origin, not the public host.

The lesson is about *where* it was caught. On `localhost:3000` the internal and
public origins are the same string, so this class of bug is invisible until the
app sits behind a proxy — no amount of local testing would have found it. It
was raised as a note on `P6-BE-01` (still Blocked; the note stops the defect
being rebuilt, it does not unblock the row) with the fix named: prefer a
relative `Location` header, which is valid per RFC 7231, needs no origin at all
and honours the host-portability rule, over reconstructing the origin from
`x-forwarded-*`. `/r/[token]` was checked for the same pattern and is clean.

Two further observations from the deploy, both belonging to other rows:
`next start` warns that it "does not work with `output: standalone`"
(`P2-OPS-02` owns that), and Prisma is advertising 8.0.0-rc against the pinned
7.10.0 (`P2-BE-01` owns pins).

## `P2-BE-04` — `requireActor()` and the scope functions *(Code review)*

The task's own note calls retrofitting this "the most expensive mistake
available", so the shape was agreed before any code was written.

**Policy and filter are separate, and that is the whole design.**
`authz-policy.ts` is a complete transcription of the agreed RBAC matrix as
pure data — 32 resources, 12 roles, 3 actions, no Prisma, no imports that can
drift. `scope.ts` turns a scope token into a Prisma `where` fragment, and only
for resources something actually queries (today `user`, `tenant`, `auditLog`).

The reasoning is worth keeping, because the tempting alternative looks more
thorough: writing thirty speculative `where` fragments for models nothing
reads yet would be authorisation code whose correctness nobody can check, and
**wrong authorisation code is worse than absent authorisation code, because it
looks like protection.** Each B-milestone adds its builder with the model's
real shape in front of it. The policy being complete is what lets `P2-SEC-01`
assert the entire matrix without a database.

**Deny fails closed twice.** An unlisted resource/role/action denies. A
resource whose builder is unwritten *throws* rather than returning `{}` —
because in Prisma an empty `where` matches every row in the table, so "no
restriction" and "no access" would be the same object. That is the single most
plausible way to leak an entire tenant, so both layers refuse it.

The three cells the matrix defers to its own decisions D1 and D3 resolve to a
denial rather than an allowance: widening later is safe, narrowing later is a
regression someone has already built on.

**A throwaway check found a real bug in the new code.** `scopeFor()` seeded
its accumulator as `"deny"` and only replaced on strictly-greater breadth —
and `deferred` and `deny` are both zero-breadth, so `deferred` could never
surface. Access was still correctly refused, but the distinction had been
documented as meaningful one screen earlier and was unreachable in practice.
The lesson is the cheap one: assertions over a policy table cost minutes and
catch the errors that reading the code does not, because the code looked
obviously correct.

**It closes the hole `P2-INT-01` left open.** Those layouts checked
authentication only, so any signed-in Clerk identity — including a stranger
who self-registered on a public URL — could open the admin workspace.
`requirePortalAccess()` now admits only the roles a portal is for, and
forwards a wrong-portal visit to the actor's own portal rather than
dead-ending.

**And a flaw in the first draft of that gate, caught before committing:** it
caught *every* error and redirected to "your account isn't set up yet". A
database outage would have been reported to the user as a confident lie about
their account. Only the two known error types are handled now; everything else
is rethrown. Three error types exist for the same reason — unauthenticated,
unprovisioned and forbidden have three different remedies, and collapsing them
sends a new sponsor round a sign-in loop that can never succeed.

**Known small regression:** the sign-in redirect no longer carries
`?redirect_url=`, because our own `redirect("/login")` replaced Clerk's
`auth.protect()`. A user lands on their portal rather than the page they
originally asked for. Cosmetic, recorded on the row for a polish pass.

Verified anonymously on staging after deploy: all four portals and `/portal`
307 to `/login`, the public surface and `/r/[token]` unaffected, no runtime
errors. What is *not* verified is the signed-in path — that a real actor with
`BTG_ADMIN` reaches `/admin` and an athlete is turned away from it.
## Branch sync — main_development ⇄ development/Jan/frontend-page-reworks

Merged `main_development` (63 commits: Prisma/AWS/Clerk/pg backend stack,
contracts, worker, migrations, docs) into the frontend branch, resolved 14
conflicts, then fast-forwarded `main_development` to the result and pushed.

- **package.json** — union: main_development's baseline + `next 16.3.5` /
  `react 19.3.0`, plus the report libs (`exceljs`, `jspdf`, `jspdf-autotable`).
  Lockfile regenerated with `npm install`.
- **Memory logs 09-16 / 09-17** — both sides' entries unioned.
- **graphify-out/* + tracker xlsx** — kept ours; graphify needs re-ingestion.
- Verified `prisma generate` + `tsc --noEmit` before committing the merge
  (`9e02892`); `origin/main_development` now at that commit.
- **Board repair from the xlsx conflict:** taking "ours" reverted rcfworks'
  ART closures locally — `P1-ART-07` was back to `Ready`. Reset to `Done` /
  2026-09-18 / rcfworks (their `1a794c8` is the authority).

## Task — `P1-FE-16` · Build the /join athlete onboarding wizard (P1-ART-07 in-app)

**Trigger:** user asked to put the accepted P1-ART-07 design (athlete
onboarding, §11 ten sections) inside the web app, with awwwards-level polish.

**Spec:** [docs/superpowers/specs/2026-09-21-join-wizard-design.md](../../docs/superpowers/specs/2026-09-21-join-wizard-design.md)
**Plan:** [docs/superpowers/plans/2026-09-21-join-wizard.md](../../docs/superpowers/plans/2026-09-21-join-wizard.md)

### What was built

The static, no-JS `/join` stack (all ten sections on one page, submit
disabled) is replaced by the design's **phone-first progressive wizard**:
intro flow-map → one section per screen → after-submit state.

- [join-flow.ts](../../src/lib/join-flow.ts) — pure, unit-tested flow module:
  the ten §11 sections (headings/subs verbatim from the comps), `isMinor`
  (UTC birthday math, invalid dates are not minors), `visibleSections`
  (guardian §4 inserted only for minors — numbering and progress segments
  derive from the list), per-section validation (identity DOB/email rules,
  social needs ≥1 handle), draft (de)serialize for localStorage
  (`sx-join-draft-v1`), restriction categories, the v0.4 agreement clauses.
- [join-wizard.tsx](../../src/components/join-wizard.tsx) — the island.
  Hydration via `useSyncExternalStore` (journey-strip precedent) so a stored
  draft swaps in post-hydration with **no setState-in-effect and no SSR
  mismatch**; private-mode `localStorage` throws are swallowed. Directional
  step transitions (CSS var), focus moves to the heading each step,
  `aria-live` on "Section N of M". Read-only "Review your answers" +
  "Update restrictions" from the submitted state.
- [join-restrictions-step.tsx](../../src/components/join-restrictions-step.tsx)
  — ENFORCED step: deal cards with the derived "blocked while active" line,
  expanding add-deal form, six orange toggle chips.
- [join-agreement-step.tsx](../../src/components/join-agreement-step.tsx) —
  click-wrap: scrollable v0.4 terms, drawn tick, recording note. **Submit is
  gated on the tick — the old "blocked until counsel" gate is gone** (G-05
  closed 2026-09-15 per the design README); the stale copy was removed from
  `fixtures.ts` along with `applicationSections` (join-flow owns the data;
  the old page was its only consumer).
- [join-submitted.tsx](../../src/components/join-submitted.tsx) — drawn
  success check, Submitted → Under review → Decision timeline,
  guardian-pending card (minors; "does **not** hold up your review").
- Wow layer in [globals.css](../../src/app/globals.css) (`sx-join-*`,
  extends the chart-motion system): stage glow that warms toward accent
  after the enforced section (`@property`-registered var, written onto the
  stage by the island — reveal.tsx precedent), intro rail draw + cascade,
  directional step entrances with field stagger, progress-segment wipes +
  breathing active segment (restrictions segment fills orange), grid-rows
  height-expand for the minor notice, stroke-drawn ticks, CTA sheen that
  fires once when the agreement arms Submit. All killed by
  `prefers-reduced-motion`.

### Verification

`vitest` 10/10 (new `vitest.config.ts` + `test` script — first unit tests in
the repo); `tsc`, eslint (join files clean; 2 pre-existing errors in
`documentation/Design/matching-roster-review/support.js` are rcfworks'
deliverable, untouched), `next build` clean, `/join` dynamic. Dev server
driven: intro rail, `?demo=minor` (section 1 + branch notice),
`?demo=submitted` (timeline + guardian card) all SSR correctly.
**Not yet eyeballed in a real browser:** motion feel on a phone viewport,
draft resume after refresh, the branch inserting a progress segment live —
worth a human pass.

### Follow-ups (same day)

- **Login → /join.** The login page's sign-up link pointed at `/packages`
  (stale). Now `/join`, relabelled "Apply as an athlete" — the application
  is not account creation. `/join` was already linked from the marketing
  home CTAs and the footer.
- **Desktop split-stage.** The phone-first column read as "mobile site on
  desktop" at 1920px (the brief never asked for a desktop comp). At `lg+`
  the page is now a split stage: sticky brand panel (headline + §26 trust
  notes, single-sourced from `join-flow.NEVER_ASKED`) beside the wizard as
  an elevated 430px card (`lg:` border/shadow, action bar `lg:rounded-b-2xl`).
  The form column never widens; below `lg` nothing changed.

## Late-day follow-ups on both wizards (all verified in a real browser)

- **Login gets both front doors.** The single sign-up line became a
  "New to SponsorX?" block: "Apply as an athlete" (blue, `/join`) ·
  "Request a sponsor brief" (orange, `/brief`). Deliberately not "Sign up
  as a sponsor" — sponsors get no self-service account in Phase 1 (§17).
- **Package select redesigned.** The native `<select>` popup is OS-rendered
  and unstylable; replaced by a custom listbox — pop-in panel, drawn accent
  check, price meta right-aligned, ↑/↓ roving, Escape/outside-click
  (export-report dropdown discipline).
- **Stacking bug (user-found, browser).** The listbox panel painted *under*
  the later-DOM timing field and the backdrop-blur action bar. Root cause
  worth remembering: **`sx-join-rise`/`sx-join-step` fill-mode animations
  keep every animated sibling a permanent stacking context**, so a panel's
  own z-index can never beat a later sibling from inside. Fix: open state
  lifted to the wizard (`openSelect`); while open, the select wrapper takes
  `z-30`, the step body `z-20`, the action bar an explicit `z-10`.
- **Audience → designed dropdown** (values grounded in §4/§16 reach:
  HS/college followings, event crowds); the package listbox generalized to
  `WizardSelect` and reused. **Market → free text by user decision** (it
  was briefly a MARKETS dropdown from athleteInv geos, then reverted):
  an out-of-network market is a lead BTG wants to see, not an input error.
  Step copy sets coverage expectations instead ("strongest in the DMV,
  hub in Kigali").

Board: **P1-FE-16 and P1-FE-17 both closed Done, 2026-09-21**, acceptance
notes updated. Google Sheet mirror remains the human end-of-day step.

## Task — `P1-FE-17` · Build the /brief sponsor brief-request wizard (B3 public intake)

**Trigger:** user asked for the sponsor counterpart of /join.

**Spec:** [docs/superpowers/specs/2026-09-21-brief-wizard-design.md](../../docs/superpowers/specs/2026-09-21-brief-wizard-design.md)

Sponsors don't self-signup in Phase 1 (managed marketplace, §17) — their
front door is "brief BTG, get a matched shortlist back". That journey
dead-ended at `/packages`' inert "Request a brief" buttons (`not wired (B3)`).
Now they link `/brief?package=<id>`:

- [brief-flow.ts](../../src/lib/brief-flow.ts) — pure module: four steps
  (goal chips → budget bands + package select → market → contact), §7-bracketed
  budget bands, `packageOption` (unknown/missing ids → "Not sure yet", so a
  bad URL can't break the intake), validation, `sx-brief-draft-v1` draft.
- [brief-wizard.tsx](../../src/components/brief-wizard.tsx) — island in
  **sponsor orange** (`--sx-accent`), reusing the whole `sx-join-*` motion
  system (zero new CSS) and the `useSyncExternalStore` hydration discipline.
  No intro (the /packages catalog is the intro), no agreement step (nothing
  is signed — it's a request). Received-state timeline: Received → Matching
  (§13/§26) → Proposal, "no card, no checkout, no commitment" said twice.
- [brief/page.tsx](../../src/app/(public)/brief/page.tsx) — split-stage frame
  like /join; **`pkg` passed only when `?package=` present** so a bare visit
  resumes the stored draft instead of resetting it.
- No design deliverable existed (2S0-ART-01 is Phase 2 self-service), so the
  design follows the P1-ART-07 wizard language.

**Verified:** vitest 18/18 (brief-flow: step validation, email rule, package
fallback, draft round-trip), tsc/lint/build clean, `/brief` + `?demo=submitted`
+ all six `/packages` links driven via dev server. Human pass: chips motion,
select styling on a real phone.

### Task board

Added **P1-FE-17** (row 56, Order 33.998, `Code review`, started 2026-09-21,
depends on P1-FE-16); extended autofilter, Status validation, CF ranges and
the 15 Dashboard formulas from row 200 → 201.

Added **P1-FE-16** (row 55, Order 33.997, `Code review`, started 2026-09-21);
extended autofilter, Status validation, 3 CF ranges and all 15 Dashboard
formulas from row 199 → 200. Also reset `P1-ART-07` to `Done` (see branch-sync
note). Backup in the session scratchpad. Google Sheet mirror is the human's
end-of-day step.

## Task — `P4-FE-06` · Build the matching & roster-review workspace in-app (P4-ART-01 in-app)

**Trigger:** user asked to put the P4-ART-01 matching / roster-review design
inside the web app with awwwards-level polish, designed for desktop, tablet
**and** mobile (rcfworks' brief was deliberately 1440-only — the user
overrode that).

**Spec:** [docs/superpowers/specs/2026-09-21-matching-studio-design.md](../../docs/superpowers/specs/2026-09-21-matching-studio-design.md)
**Design source:** `documentation/Design/matching-roster-review/` (BRIEF.md is
the real contract; the `.dc.html` is reference, not pixel law)

### What was built

The **Matching Studio** at `/admin/campaigns/match` — §13 step 3 for a new
STAFFING campaign (*Southwest Hydration Push — Rally Sports Drink*,
`CMP-2026-0418`) whose card now leads the `/admin/campaigns` list. All five
design states live in one island:

- [matching.ts](../../src/lib/matching.ts) — pure, 27 vitest tests: the
  brief (cents, `money()`), the 14-athlete Texas roster (each composite =
  round(mean(six factors)) — asserted, so "explainable score" stays true),
  `MARGIN_FLOOR = 1.4` band math, filter/sort with **conflicts never
  hidden** (blocked athletes bypass every filter except search), computed
  relax suggestions (each count is a genuine re-run), slot assignment with
  visible overflow, send summary/steps, conflict-detail records for Lena +
  Sasha.
- [matching-studio.tsx](../../src/components/matching-studio.tsx) —
  orchestrator: URL-synced filters + `?view=`, ordered shortlist, brief HUD
  with live slot meter, roster table/cards, dock, bottom bar, sheets,
  drawer plumbing (roster-ops discipline). Plus
  [matching-bits](../../src/components/matching-bits.tsx) (tier mark,
  provenance mark, margin value, score cell, tween number — one source so
  views can't drift), [matching-compare](../../src/components/matching-compare.tsx)
  (compares the *actual* shortlist, sticky label column, snap strip on
  phones), [matching-review](../../src/components/matching-review.tsx)
  (send gated on a recorded-exception checkbox; demo send with Undo),
  [matching-conflict](../../src/components/matching-conflict.tsx) (drawer:
  declaration facts, why-it-blocks, three actions).
- Motion rides the existing `sx-join-*`/`sx-viz-*` systems; the only new CSS
  is the bottom sheet (`sx-match-sheet`, globals.css), reduced-motion 1ms so
  the animationend unmount still fires.

### Lessons that cost a cycle (browser-verified via Playwright)

- **The mock's 1440 doesn't survive the portal sidebar.** Filter rail +
  table + dock at `xl` left ~570px for a 9-column grid — rows overflowed
  *under* the dock (found because a Playwright click on "Why" was
  intercepted). Zones now earn their place a breakpoint late: cards < `lg`
  (2-up from `sm`), 8-col table `lg+`, dock rail `xl+`, filter rail `2xl+`,
  and **cost is never a column** — it's the permanent subline under Sell.
- **A mount-flag focus guard refires under StrictMode's double effect** and
  yanked the page down on load. Guard on the previous *value* instead.

**Verified:** vitest 46/46 (27 new), tsc, eslint, `next build` clean;
Playwright drove all five states at 1440/1920/834/390 — send-gate →
send → undo, conflict drawer from a real click, dock CTAs, computed
empty-state suggestions ("Drop minimum score to 85 · 1 match").
Screenshots in the session scratchpad (`mx-*.png`).

### Task board

Added **P4-FE-06** (row 117, Order 93.5, `Code review`, started 2026-09-21,
depends on P4-ART-01); extended autofilter, Status validation, 3 CF ranges
and all 15 Dashboard formulas from row 201 → 202. Also restored
**P4-ART-01 → Done / 2026-09-17 / rcfworks** — the 09-21 merge had reverted
it to `Ready`, same failure as P1-ART-07. Backup in the session scratchpad.
Google Sheet mirror remains the human end-of-day step.

## Merge — development/Jan/frontend-page-reworks → main_development

Pushed the branch (91 commits), then merged into `main_development`. Two
conflicts, resolved the way CLAUDE.md prescribes:

- **This file** (add/add): both sides' sections unioned — rcfworks' board-repair
  note plus Jan's task logs above.
- **Tracker xlsx** (binary): diffed base `9e02892` against both sides by task
  ID before choosing. main_development's copy was the richer base (80 changed
  rows, LEG rows split into a new **Legal** sheet, P2-BE-05/06 closures,
  P1-FE-09..15 repair); the branch's only board changes were three new rows.
  Took main_development's file and re-appended **P1-FE-16 (Done)**,
  **P1-FE-17 (Done)** and **P4-FE-06 (Code review)** at rows 200–202;
  autofilter, Status validation, 3 CF ranges and all 15 Phase-1 Dashboard
  formulas extended 200 → 202. P1-ART-07 / P4-ART-01 kept main's authoritative
  rcfworks closures (both sides agreed on Done). Verified: 198 Phase-1 rows,
  no duplicate IDs, 75 Dashboard formulas intact, Legal sheet preserved.
  Backups in the session scratchpad.

## Repo restructure — frontend/ + backend/ workspaces, Docker local stack, Express backend scaffold

**Trigger:** user asked to "create the scaffold of the backend" — split the repo
into `frontend/` and `backend/` folders, use Docker to initialise Postgres,
MinIO, Redis, Prisma and the worker, and stand up a backend file structure.
User explicitly directed the backend stack: **Node.js + Express.js**.

**Architecture change — raised, then user-confirmed the same day; docs + board reconciled.**
The scaffold diverged from the documented stack (Next.js route handlers, "one
service"; the reconciliation doc listed Express/Redis/MinIO as the *rejected*
stack). Raised it for decision; user confirmed — *"we're gonna go with this… make
the API more versatile than just existing inside Next.js."* So it is now official:
- **`.claude/stack-decision.md`** — added **Addendum B** (repo split + standalone
  Express API); marked A2 (route handlers) superseded and A3 (Redis) amended
  (Redis is cache/rate-limit only; **queue stays in Postgres**).
- **CLAUDE.md** — stack table, "one language, two workspaces" rule, Postgres/Redis
  rule and Status line all updated.
- **Task board** — added **P0-OPS-06** (below).

### What was done

- **Split via `git mv`** (history preserved): `src/ public/ tests/` + all Next
  config → `frontend/`; `prisma/ worker/` → `backend/`. Had to kill a running
  `next dev` (it locked `src/` on Windows) before the move would go.
- **npm workspaces** at root (`frontend`, `backend`). Frontend renamed
  `@sponsorx/frontend`; new `@sponsorx/backend`. Root scripts: `dev:web`,
  `dev:api`, `dev:worker`, `build`, `test`, `docker:up/down`, `infra:up/down`.
- **Backend scaffold** (`backend/src/`), Express 5, run via **tsx** (no build
  step): `index.ts` (listen) + `app.ts` (routes/middleware split for tests),
  `config/env.ts` (Zod-validated env), `db/client.ts` (Prisma `PrismaPg`
  adapter, mirrors the frontend one), `lib/redis.ts` (ioredis, cache-only,
  `redisReachable()`), `lib/storage.ts` (S3 presign for MinIO/R2, two buckets),
  `routes/health.ts` (`/health` liveness + `/health/ready` probing PG/Redis/S3),
  `routes/v1/`. Worker kept at `backend/worker/index.mts`.
- **Prisma: one schema, two clients.** Schema stays the single source at
  `backend/prisma/schema.prisma`; added a second `generator frontend` block
  writing `frontend/src/generated/prisma`, `generator client` →
  `backend/src/generated/prisma`. `frontend/prisma.config.ts` repointed at the
  backend schema so `next build`'s `prisma generate` still produces its client.
  Both gitignored.
- **Docker** (`docker-compose.yml`): postgres 17, redis 7, minio (+ `minio-setup`
  one-shot creating public/private buckets), `migrate` (one-shot
  `prisma migrate deploy`), `worker`. `api` + `web` under an `apps` profile
  (default `up` = infra + data plane; apps run on host for fast iteration).
  `backend/Dockerfile` (tsx runtime, serves api/worker/migrate by command
  override) and `frontend/Dockerfile` (Next standalone). `.dockerignore` added.
- **`.gitignore`** rewritten for the workspace layout (per-workspace
  `node_modules`, `.next`, both generated Prisma dirs). **`.env.example`**
  rewritten (root `.env` for backend, `frontend/.env.local` for web; defaults
  match compose). **`.npmrc`** pins `legacy-peer-deps=true` — see gotcha below.

### Gotchas (cost real time)

- **npm arborist crash.** `npm install` under the new workspace graph died with
  `Cannot read properties of null (reading 'edgesOut')` in `#loadPeerSet`
  (npm 10.9.2, resolving vitest's peers). Worked around with
  `legacy-peer-deps=true` in `.npmrc` (also keeps Docker `npm ci` consistent).
- **Side effect of that:** legacy-peer-deps stops auto-installing peers, so
  `vite` (vitest 5's peer) went missing and `vitest` failed at startup with
  `Cannot find package 'vite'`. Fixed by adding `vite 7.1.12` as an explicit
  devDependency in both workspaces.
- **Redis health false-negative.** First `/health/ready` reported `redis:false`
  though the container was healthy: `enableOfflineQueue:false` + `lazyConnect`
  makes the first `ping()` reject before the socket opens. Removed the offline-
  queue override and added `redisReachable()` that opens the lazy connection
  first.

### Verification (all green)

- `npm install` (workspaces) ✓ · `prisma generate` → both clients ✓
- backend `tsc --noEmit` ✓ · frontend `next build` ✓ · tests **46/46** ✓
- `docker compose config` valid ✓ · infra `up` → postgres/redis/minio all
  **healthy**, `minio-setup` created both buckets & exited 0 ✓
- `prisma migrate deploy` applied both migrations to dockerised PG ✓
- API booted against the stack: `/health` 200, `/api/v1` 200,
  `/health/ready` **200 `{db:true,redis:true,storage:true}`**, unknown → 404 ✓
- worker booted: pg-boss started, outbox drain loop running ✓
- Docker infra torn down after (volumes retained). Branch:
  `development/Jan/backend-scaffold`.

### Task board

Added the scaffold task (Phase 1 sheet, Stage 0, Cat OPS, `Code review`, started
2026-09-21, owner infinex, Order 24.5). **On this branch it was written as
`P0-OPS-06`, but that ID was already taken on `main_development` by the
domain-registration task — it was renumbered to `P0-OPS-07` during the merge
(below).** Appended rather than inserted so no existing row moved; extended the
autofilter, the Status data-validation, the three conditional-formatting ranges
and all **15 Dashboard formulas** to the new last row. Backups in the session
scratchpad. Google Sheet mirror remains the human end-of-day step.

## Merge — development/Jan/backend-scaffold → main_development

Pushed the branch, then merged into `main_development`. Three conflicts, resolved
per CLAUDE.md:

- **audit.ts** (rename/add): `main_development` added `src/server/audit.ts`
  (P2-BE-06) after this branch renamed `src/` → `frontend/src/`. Kept main's
  content, placed at `frontend/src/server/audit.ts`.
- **This file** (add/add): both sides' sections unioned.
- **Tracker xlsx** (binary): `main_development` was the richer, authoritative
  board (8 sheets incl. the new **Legal** sheet, P2-BE-05/06 closures, the
  board-repair rows). Took main's file and re-applied the scaffold row onto it
  with openpyxl. **ID collision caught here:** the branch used `P0-OPS-06`, but
  main already had a `P0-OPS-06` ("Register the SponsorX domain") — renumbered
  the scaffold task to **`P0-OPS-07`**. Appended at Phase-1 last row + 1 (203),
  extended the autofilter, Status validation, the three CF ranges and all 15
  Phase-1 Dashboard formulas 202 → 203. Verified: 199 Phase-1 rows, no duplicate
  IDs, Legal sheet preserved, formulas intact. Backups in the scratchpad.

## Roadmap reconciled with the repo split, then `P2-SEC-01`'s policy half

**The roadmap had gone stale in the way that matters most.** It is the document
the next task is chosen from, and it still described a single Next.js app with
a greenfield backend — every path in it pointed at `src/`, which no longer
exists. Addendum B reached `CLAUDE.md` and `stack-decision.md` but not here.
Fixed: §0 rewritten for the two workspaces and what is actually built, the §12
order's "route handler / server action" step becomes an Express route under
`backend/src/routes/v1`, B0's service list now names web / api / worker /
postgres plus Redis (cache and rate-limit only), and B0 states explicitly what
it has done and what it still owes. Fourteen links repointed; all nine
relative links in the file resolve.

The lesson is about *which* documents rot. A stale README is an annoyance; a
stale roadmap actively misdirects, because it is consulted precisely when
someone is deciding what to do next and is therefore trusted at exactly the
wrong moment.

**`P2-SEC-01`'s policy half** is `frontend/tests/authz.matrix.test.ts` — 19
tests, all passing, whole frontend suite 65/65. It asserts every role against
every resource (32 × 12 × 3 = 1,152 pairs), the §30 coverage requirement, with
no database at all. That is only possible because `P2-BE-04` made the matrix
pure data; had the policy been entangled with Prisma fragments, this suite
would have been blocked behind a database that does not exist yet.

Beyond the named invariants, the suite pins a **sha256 digest of the entire
grid**. Any policy change fails the build with the moved pairs in the message,
which is exactly the task's stated purpose: *"when someone widens a permission
to fix a bug, this tells them what else they just widened."* Accepting a
change means reading the failing pairs against the RBAC document and then
updating the constant — updating it without reading them defeats the test.

**The row stays In progress, and the reason is worth stating plainly.** The
acceptance also requires a seeded suite proving the scope *filters* return the
right rows. That needs a live Postgres, and **the repo has no `.github`
directory at all** — so B0's exit criterion, "authz matrix passes in CI", is
not merely unproven, it is unrunnable until `P2-OPS-07` creates a workflow
*with a Postgres service container*. Annotated on that row so whoever builds
it knows a plain node runner is not enough. The seeded half was deliberately
not faked: asserting `where` fragments against a mock would test the mock.
