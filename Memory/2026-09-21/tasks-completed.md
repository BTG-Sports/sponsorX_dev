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
