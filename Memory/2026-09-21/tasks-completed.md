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
