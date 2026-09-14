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
