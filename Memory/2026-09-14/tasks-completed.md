# 2026-09-14 — tasks completed

## Task — `P0-OPS-04` continued · authorising account decided, runbooks made executable

**Trigger:** user asked to continue `P0-OPS-04`, the only `In progress` row on
the board (carried from 2026-09-11). Plan was presented and approved before any
edit, per the standing rule.

### The decision taken
**The credentials will be authorised under `rcfworks@gmail.com` as an interim**,
to be reissued under an `@icarrefound.org` account later. The user accepted the
single-point-of-failure risk knowingly, on the understanding that the swap is
cheap until the worker is live.

Why it had to be settled before any clicking: a Zoho refresh token is bound
permanently to whoever is signed into the API console at the moment the grant
token is generated. There is no owner change. It is decided by the first click
of the runbook and is invisible at the time.

### Corrected an assumption in the process
The user asked whether moving to an org account later is "easy to transfer".
**It is not a transfer — it is a reissue.** A Self Client lives in the API
console of the account that created it, so all three secrets change, not just
the refresh token. Written up as new §9 of the credentials document, including
the two things the swap does not recover: audit attribution on records already
synced, and possibly the sandbox if the edition ties it to its creator.

### Live org facts verified through the CRM connector
- `zgid 749122837` matches `ZOHO_ORG_ID` in the env contract; `country_code US`
  confirms the `.com` accounts/API domains are right.
- **`paid_expiry 2026-09-18T08:00:00+08:00`** — three days out. Still the real
  blocker on issuing long-lived tokens. Rodney's call as super admin.
- Org `time_zone` is still `PST` — Stage A step 3 remains undone.
- **Only four active Administrators**: Rodney Carr (`rcarr@icarrefound.org`,
  CEO), Bob (`rcfworks@gmail.com`), Jan Bien (`daniel.janbiengabrielle@gmail.com`)
  and `chiro.collabhealing@gmail.com` — the outside party from Stage A step 4,
  still holding a full Administrator profile. Every other admin account is
  deleted or disabled.

### A probe that failed, and is recorded as failed
An attempt to answer §5's open "which sandbox types does this edition offer"
through the connector **did not work**. `getModules` with `feature_name=sandbox`
returns `FEATURE_NOT_SUPPORTED` — but so does `feature_name=custommodule`, which
this org demonstrably has. The response is an artifact of the endpoint, not a
statement about the edition. Running the control test is what stopped a false
"sandbox unavailable" being reported. The question still needs eyes on the Setup
page.

### Shipped — `documentation/SponsorX-Zoho-Credentials-and-Sandbox.md` v0.1 → v0.2
- **§2.1a** — the scope list flattened to one paste-ready line. Generated from
  §2.1 programmatically rather than retyped, and asserted: 24 scopes, 662 chars,
  no whitespace, no `.DELETE`, no `modules.ALL`.
- **§4 step 1** — now says to check which account the browser is signed into
  *before* anything else, and names the interim account.
- **§4 step 6** — records that Railway does not exist yet (`P0-OPS-01`
  unstarted), so the secrets go to a password manager, not a repo or a chat.
- **§4 step 7 (new)** — the acceptance proof as a runnable pair of `curl`s:
  mint an access token from the refresh token, then
  `GET /crm/v8/settings/modules`. Includes what `INVALID_TOKEN` and
  `OAUTH_SCOPE_MISMATCH` each mean, and an instruction not to paste the output
  back, since the command line carries all three secrets.
- **§5** — the one-line menu path expanded into eight literal click-by-click
  steps, with a hard stop at step 6 to report the sandbox type before the form
  is filled in, because the type cannot be changed after creation.
- **§7** — provisioning log gained `Authorising account chosen` (ticked) and
  `Reissued under org account` (open).
- **§9 (new)** — the reissue procedure, its cost now versus after
  `P8-INT-01`, and what it cannot recover.

### Tracker
`P0-OPS-04` stays **In progress** — the two console halves are still outstanding.
Row 34 `Notes` updated in the consolidated xlsx with the account decision, the
Railway gap, the unread sandbox type and the licence blocker. Workbook saved
with `data_only=False`; Dashboard formulas verified intact (75) afterwards.
Google Sheet still to be mirrored by hand at end of day.

### Still outstanding on this task
1. Licence renewal confirmation before long-lived tokens are issued (Rodney).
2. §4 — Self Client, scopes, grant token, refresh token, verification.
3. §5 — sandbox, with the type reported back at step 6.
4. Reissue under an org account before `P8-INT-01`.

### Noticed, not acted on
`documentation/SponsorX-Provisioning-Sequence.xlsx` is stale against the board —
it reads "2 of 17 complete" with steps 6, 7 and 8 `Not started`, when
`P0-OPS-05` is Done, `P0-PMO-08` is in Code review and `P0-OPS-04` is In
progress. It also names the admin as `rcfworks@gmail.com` where the credentials
document says `rcarr@icarrefound.org`. Offered; not yet approved.

### Update — the account plan changed, for the better (same day)

The user proposed, and it is right: **Rodney creates his own Self Client for
production** rather than the development key being "transferred" to him later.

Two keys coexist against the same org — there is no conflict, and no migration.
The development key stays with `rcfworks@gmail.com`; the production key is
created by `rcarr@icarrefound.org`. This is better than the reissue procedure
originally written, for two reasons: the production credential belongs to an
account the organisation owns and that survives a contractor leaving, and
development stops sharing a credential with production, which is ordinary
practice rather than something to migrate towards.

`documentation/SponsorX-Zoho-Credentials-and-Sandbox.md` §9 rewritten from
*Reissuing under a different account* to **Two keys, by purpose** — the split
table, §9.1 what Rodney does (six literal steps; he must do it himself, since a
Self Client is created inside the console of whoever is signed in), §9.2 what
holds for both keys (each administered only by its creator, each acts as its
creator in Zoho's non-rewritable record history, each dies with its user's org
access), and §9.3 the single rule: the dev key must never be what production
runs on. The header row and the §7 log row were updated to match; the log now
carries an open `Production key created by Rodney` item so its absence stays
visible. Tracker row 34 Notes updated; Dashboard formulas verified intact.

**Handoff for Rodney:** he needs §2.1a of the credentials document — the
paste-ready scope line — and nothing else from it.

### Explaining, not just doing

The user twice steered the explanation: *"lets take this slowly"*, then *"explain
in simple terms... do not mention anything that does not exist yet, you are
adding confusion in doing this."* Explanations that reached forward to
components not yet built made a concrete answer harder to follow. Recorded as a
persistent Claude memory (`explain-simply-without-forward-references`).

A misconception worth noting for whoever picks this up: the Self Client is
easily confused with user login. It is not. The hardcoded list in
`src/lib/mock-auth.ts` is people signing into SponsorX and is replaced by Clerk;
the Self Client key is SponsorX letting itself into Zoho, with no person
involved. Two different doors.

### Credentials half of `P0-OPS-04` completed and verified

Walked the §4 runbook with the user at the console, one step at a time.

- **Self Client created** under `rcfworks@gmail.com` (avatar confirmed before
  the client was made), portal CRM → Production → iCARRe Foundation.
- **All 24 scopes granted, none trimmed or rejected** — confirmed in the token
  response's `scope` field. The paste had gone in whole; the user said so and
  was right.
- **Refresh token issued** and stored, along with the client ID and secret, in
  the macOS Keychain as `sponsorx-zoho-client-id`, `-client-secret`,
  `-refresh-token`.
- **Verified against the live API**: minted an access token from the refresh
  token, then `GET /crm/v8/settings/modules` → **HTTP 200, 56 modules**, all
  five §18 stock modules present plus the `Content_Partners` custom module.
  **Acceptance criterion 2 is met**, and it independently confirms Friday's
  `P0-OPS-05` work exists in the org.

### How the secrets were kept out of the transcript
The user asked whether the exchange could be run for them. It could not be run
*in the transcript* — the response contains the refresh token. The resolution
was a script in the session scratchpad (`zoho-exchange.sh`) that prompts for the
three values, performs the exchange, writes all three into the Keychain, and
prints only non-secret diagnostics: `api_domain`, `token_type`, and the granted
scope list. Verification afterwards read the secrets out of the Keychain inside
a single command and printed only HTTP status and module names.

Worth reusing: **the granted-scope list is the useful non-secret output** of an
OAuth exchange, and printing it is what turned "did the long paste truncate?"
from a guess into a fact.

### There is no password manager on this project
Searched the graph and the docs: the only mentions of "password manager" were
sentences written earlier the same day. Nothing is established. The credentials
now sit in the macOS Keychain, which is a local stopgap, not a team answer.
**Zoho Vault is the obvious candidate** — Zoho One Enterprise already includes
it, so it costs nothing new, it is organisation-owned, and Rodney can grant and
revoke access. Raise it with him alongside the licence renewal and his
production key: one conversation, not three.

### Console labels corrected in §4
Zoho's actual field names are **"Code expiry duration"** (defaults to 3 minutes,
must be changed to 10) and **"Description"** — not "Time Duration" and "Scope
Description" as the runbook had it. The *Select Portal* step is also a second
screen with its own Create button, which the runbook did not mention. Both fixed
and marked as verified against the console.

### Tracker
`P0-OPS-04` remains **In progress**. The sandbox (§5) is now the only thing
between this task and Done. Row 34 Notes updated; Dashboard formulas intact.

### Sandbox requested — and the two Friday questions are now answered

`SponsorX-Dev`, type **Sample Data**, requested 2026-09-14. Provisioning; Zoho
offers **no ETA** — the form carries no estimate and the confirmation screen says
only "ready soon". That is itself the answer to Friday's second open question.

**The edition offers all three sandbox types** — Configuration, Sample Data and
Partial Data. Friday's document recorded this as unreadable through the
connector, and a probe earlier today confirmed it genuinely was. Answered by
looking at the form.

**Partial Data was rejected on privacy grounds, not technical ones.** It copies
real contacts and real deals out of the live CRM into an environment that exists
to be broken and that contractors can reach. Nothing being built now needs
realistic data volumes, so there is no case for it. Sample Data gives fabricated
records that exercise the same round trip, and inherits `Content_Partners` from
production like any type. Written into the document as new §5.1, including the
point that if a later task does need production-scale data, that call belongs to
whoever owns the data rather than to the developer who finds it convenient.

### Two more runbook corrections, both found by walking it
- The Sandbox page is under **Data Administration**, not Developer Space — which
  is where Zoho's own documentation points. Direct URL recorded.
- The sandbox web address is **`crmsandbox.zoho.com`**, not `sandbox.zohoapis.com`
  as §5 assumed. The latter may still be the API domain; that is unconfirmed and
  is part of the outstanding token-strategy question, so the document no longer
  asserts it.

**Pattern worth noting:** every single field label and menu path in this runbook
was slightly wrong, and the errors only surfaced by having someone walk it at the
console. A runbook written from documentation is a draft until somebody follows it.

### What is left on `P0-OPS-04`
Acceptance criterion 3 is *"a sandbox exists, its type is recorded, and the
question of how the worker authenticates against it has an answer rather than an
assumption."* Two of those three now hold. The token strategy needs the sandbox
to finish provisioning before it can be established. Task stays **In progress**.

### `P0-OPS-04` closed — Done 2026-09-14

**Sandbox live.** `SponsorX-Dev`, Sample Data, at
`crmsandbox.zoho.com/crm/sponsorxdev`. Sample data populated successfully.

**The token strategy answered by observation, not assumption.** Back in the API
console's *Select Portal* screen, the sandbox now appears under its own
`Sandbox` heading beside `Production`. So **one Self Client serves both orgs** —
choosing the portal at code-generation time yields a separate refresh token per
org. No second client, no separate credential set to manage. This was the last
clause of acceptance criterion 3.

**A sandbox token was deliberately not minted.** Having confirmed the mechanism,
I proposed generating the sandbox token as well, and the user stopped it:
*"you already confirmed the sandbox is good. what is this extra step about?"*
They were right — the acceptance asks that the question have an answer, which it
now does. Nothing consumes a sandbox token yet, and whoever builds the sync will
issue it as their first step. Consequence: the sandbox **API domain is still
unconfirmed** — the exchange response's `api_domain` field reports it, and the
document says so rather than guessing between `crmsandbox.zoho.com` and
`sandbox.zohoapis.com`. Recorded as a persistent Claude memory
(`stop-at-the-acceptance-criteria`).

**Judgement call on closing.** The board's criterion — *"Client ID, secret and
refresh token issued; a sandbox or test org available for sync development"* —
is fully met. The credentials document's §8 additionally said "three secrets
present in Railway", which cannot hold because Railway does not exist. That
belongs to `P2-OPS-04` (configure the environment variable set), not here, so the
task was closed **Done** with the Keychain-not-Railway gap recorded explicitly in
§7 and §8 rather than quietly satisfied.

### Both trackers updated
- **Task board**: `P0-OPS-04` → Done, `Date Done` 2026-09-14. Board now 10 Done,
  27 Ready, 307 Blocked, 1 Code review, 0 In progress. Dashboard formulas intact.
- **Provisioning sequence** (approved by the user this session): step 6
  `P0-PMO-08` → In progress, step 7 `P0-OPS-05` → Done 2026-09-11, step 8
  `P0-OPS-04` → Done 2026-09-14, all with owner. Step 14's dependency list now
  reads `8 ✓, 9, 10, 13`, matching the sheet's own convention.

**Two things about that workbook worth knowing before editing it again.** Its
progress line `C29` is a **formula** — `=COUNTIF(J7:J26,"Done")&" of 17 steps
complete…"` — so it recomputes itself and must never be hardcoded; it now reads
*4 of 17*. And column J carries a **data validation list** whose only permitted
values are `Not started, In progress, Done, N/A`. There is no `Code review`,
which is why `P0-PMO-08` shows as In progress here while the board says Code
review. Anything written outside that list breaks the dropdown.

Also worth correcting an earlier misreading of mine: the workbook header naming
`rcfworks@gmail.com` as holding Administrator is **accurate**, not a conflict
with the credentials document. Both `rcfworks@gmail.com` and
`rcarr@icarrefound.org` hold the Administrator profile — confirmed against the
live user list. Nothing needed changing there.

### Deliverable — `documentation/SponsorX-Zoho-API-Access.md`

A plain-English summary of what `P0-OPS-04` produced and why it matters, written
for a reader without technical background — in practice, for Rodney.

It is deliberately **not** a second copy of
`SponsorX-Zoho-Credentials-and-Sandbox.md`, and its header says so: that document
is the specification (scope list, environment contract, console runbooks,
provisioning log) and is what you read if you are doing the work. This one
explains what exists, why the choices were made, and what is still needed. The
two are cross-referenced by purpose so they do not drift into duplicates.

Its three substantive points, all of which needed saying to a non-technical
reader: the key cannot delete anything and that was deliberate; the practice
environment holds fabricated data because copying real contacts into a
break-it environment is a privacy decision; and **this key is for development
only** — it is bound to a personal Google account, so production needs its own
key created by Rodney, which takes fifteen minutes and cannot be done for him.

## Task — `P0-PMO-07` · RBAC matrix drafted (Code review)

**Trigger:** user picked it as the next task after `P0-OPS-04` closed. Chosen
over `P0-OPS-01` (Railway) because Railway unblocks more — 115 tasks — but
signing up starts its 30-day trial clock, and Stage C of the provisioning
sequence warns against burning that before there is anything to deploy.

### Blueprint §8 is not empty — the conversion lost it
The task cites §8 as its source. The converted copy in `graphify-out/` shows
`# 8. User Roles & Permissions` with nothing under it. Reading the original
through the Drive connector shows a **twelve-row table**, and those twelve roles
map **1:1** onto the `Role` enum already in `SponsorX-Implementation-Guide-V2.md`.
No conflict between the two sources, which was the main risk.

**The conversion dropped every table in the blueprint** — not just §8, but §7
packages, §5 job codes, §6 rate tiers, §18 Zoho objects, §20 database tables,
§21 state machines, §19 API endpoints. Prose survived; tables did not. This is
why an early graphify query for "the twelve roles" returned UI components: the
graph was built on a copy with the substance removed. **Worth re-running
ingestion with a converter that keeps tables** — raised as its own task, not
folded into this one.

Also recorded: v1 of the blueprint had a **Fan** role; v2 dropped it and added
**Athlete Network Manager**. Dropping Fan is consistent with the fan QR page
having no login, and the matrix says so explicitly so nobody re-adds it.

### The task definition was wrong, and was amended by PR
The original read *"12 roles down one side, every resource across the top,
allow/deny in each cell."* That shape cannot carry the rules it needs to: a
`PROPERTY_MGR` may read an athlete on their own roster and must not read one on
another property's — same role, same resource, opposite answers. Ownership is
the missing axis, and it was already present in §09's twenty starter rows,
merely encoded inside a resource string.

Amended in `documentation/SponsorX-Phase1-Managed-Marketplace.md` to four axes:
**role × resource(+field) × action × ownership**. Per the project rule this was
a change to the Markdown with the reasoning recorded inline, not a quiet
reinterpretation in the tracker. Left uncommitted on `A0-A2-Roadmap`.

### Two rounds of user correction, both right
**"make sure you are not over engineering please"** — the audit was worth doing
honestly. The roles, resources and test cases are what the task literally asks
for. But I had flagged **eight** open decisions when four were already answered
by §8. Trimmed to four and the settled ones recorded as settled, so they are
visible without being in anyone's queue.

**"make sure the gating is solid"** — this one found real holes, and the draft
was genuinely incomplete before it:
- **`campaignOrder.compensation`** — the worst. §12 puts compensation *inside*
  the Campaign Order, which sponsors could read. Denying `athleteRate.amount`
  while leaving that open achieved nothing.
- **`campaign.guarantee`** — §20 lists budget *and* guarantee; only one was
  protected.
- **`athlete.email` / `athlete.phone`** — privacy, but mainly
  disintermediation: a sponsor with the athlete's mobile does not need BTG next
  time.
- **`athlete.restrictions`** — "already works with Nike" is competitive
  intelligence. Sponsors now get a conflict yes/no, never the list.
- **`rewardClaim.fanContact`** — the only personal data belonging to people who
  never logged in. Denied to everyone, including the sponsor who funded it.

Plus three rules that stop the field table being walked around: derived values
inherit the restriction; exports and reports are reads; audit-log access must be
at least as restricted as the most sensitive field it records.

**A limitation stated rather than papered over:** package prices are published
in §7 of the blueprint, so an athlete can already divide $750 by 3 athletes.
The rules stop SponsorX *showing* the sponsor price; they cannot make it
unknowable. That belongs in the D2 decision rather than hidden.

### Shipped
- `documentation/SponsorX-RBAC-Matrix.md` v0.1 — 12 roles, ~26 resources, the
  sensitive-field tables, five open decisions, and **85 active test cases plus 3
  deferred** in §09's `CASES` format, ready to lift into `authz.matrix.test.ts`.
- `documentation/SponsorX-Who-Can-See-What.md` — the plain-English companion.
  I offered to delete it as duplication; **the user chose to keep it for
  reference.**
- Phase 1 markdown task definition amended.

### Status — deliberately not Done
Acceptance reads *"…in a table, **agreed**"*. Five decisions (D1–D5) need human
answers, so the task sits at **Code review** — the same place `P0-PMO-08` sits
for the same reason. "Code review" is an awkward label for a document task, but
it is the closest value the board's status list offers and it matches precedent.
Board: 10 Done · 26 Ready · 2 Code review · 307 Blocked.

**The five:** D1 guardian accepting for a minor (§8 explicitly defers, and it
ties to the open e-signature question) · D2 athlete seeing sponsor price ·
D3 property manager seeing roster earnings (legal) · D4 sales seeing athlete
rates · D5 athlete seeing their own Content Value Score.

### `P0-PMO-07` closed — Done 2026-09-14

The user adopted all five defaults. Matrix promoted to **v1.0, agreed**, §12
rewritten from *Open decisions* to *Decisions taken*, and the three deferred test
rows activated — **91 active cases, none deferred**.

**Every decision was adopted at its restrictive option**, and that framing is
what made the sign-off quick: each one can later be loosened by a deliberate,
recorded decision, and none can leak anything by accident meanwhile. Being wrong
in that direction costs a conversation; being wrong in the other costs a
disclosure that cannot be withdrawn. Worth reusing when putting a set of
access-control choices to a non-specialist.

- **D1** — guardian authorises **and** athlete accepts; both required for a
  minor. Modelled as `campaignOrder.authorize` (guardian, ward) distinct from
  `campaignOrder.accept` (athlete, own), so neither substitutes for the other.
- **D2** — athlete does not see sponsor price.
- **D3** — property manager does not see individual earnings.
- **D4** — sales cannot see athlete rates.
- **D5** — athlete sees tier, not factor scores.

**D1 and D3 stay subject to legal confirmation** — D1 to the open guardian
e-signature question, D3 to whatever the school and club agreements actually
say. Neither blocks, because confirmation can only ratify or tighten them.

### A correction from the user that improved the document
The user pushed back on sponsors seeing athlete pay — *"its selfish and it has
no connection ethic wise."* That rule was already in place, but had been
justified in the draft purely as protecting BTG's margin. Their argument is
better and is now what the document says: **a sponsor is buying an outcome, not
an hour of someone's labour, and what the athlete is paid is not their
business.** The margin protection follows from that rather than the reverse.
This matters practically — a rule defended only as commercial self-interest is
the kind that gets traded away in a negotiation.

They also caught a genuine communication failure: I had been asking them to
adopt "the five defaults" without ever stating what those defaults were, since
they existed only inside a document I had written. Recorded as a persistent
Claude memory. **Writing something to a file does not communicate it.**

### Trackers
Task board: `P0-PMO-07` → Done, `Date Done` 2026-09-14. Board now **11 Done ·
26 Ready · 1 Code review · 307 Blocked** — the remaining Code review is
`P0-PMO-08` from Friday. Dashboard formulas intact (75). The provisioning
sequence does not list `P0-PMO-07` (it covers vendor steps only), so no change
there. Google Sheet still to be mirrored by hand at end of day.

## Task — `P0-OPS-03` Clerk · development instance only (In progress)

Clerk account created; development instance **`SponsorXDev`** exists on the free
tier. No Pro purchased — MFA is Pro-only and is a launch cost (provisioning
sequence step 16), not a today cost.

**Production instance deferred at the user's explicit direction.** A Clerk
production instance needs a domain BTG does not have yet, and there is nothing
to deploy. The task stays **In progress** rather than Done, because its
criterion is *"both instances exist"* — closing it on half the criterion would
be false.

**No Clerk SDK was installed.** The console's onboarding screen pushes straight
into adding the package to the codebase; that is code work and sits behind the
standing no-new-dependencies-until-B0 rule. Skipped deliberately.

### A process note for whoever picks this up
The user had to say "development only" three times. Each time I acknowledged it
and then appended one more thing to do in the console — a production instance, a
sign-in-method check. **When they narrow scope, the narrowing is immediate and
total.** Recorded as a persistent Claude memory.

Remaining for this task, whenever a domain exists: create the production
instance, then enable MFA for admin and finance at launch.
