# SponsorX ↔ Zoho — API credentials and sandbox

**Task `P0-OPS-04`** · Blueprint reference **§18**, Addendum **A9**

| | |
|---|---|
| **Version** | 0.2 |
| **Date** | 2026-09-14 |
| **Author** | rcfworks |
| **Status** | Specification complete. The two provisioning steps are console click-work and are marked **YOU** below. |
| **Authorising account** | Development key: **`rcfworks@gmail.com`** (decided 2026-09-14). Production key: **`rcarr@icarrefound.org`**, created separately by Rodney — two keys, not a transfer. See §9. |
| **Scope** | **Zoho CRM only.** Zoho Books credentials are deliberately out of scope — see §6. |
| **Unblocks** | `P7-BE-04` · `P8-INT-01` · `P8-INT-02` · `P8-INT-03` · `P8-INT-05` · `P8-INT-07` |

---

## 1 · What this task is actually for

Two things, and they serve different purposes:

- **Credentials** let the worker talk to Zoho at all. Without them `P8-INT-*`
  cannot start.
- **A sandbox** lets that code be *wrong* without consequence. The org is
  production and holds real sales data; `P8-INT-07`'s backfill importer walks
  every record, and the first version of any importer is wrong.

Neither step has a public API. Zoho's API Console and its Sandbox page are both
UI-only, so the provisioning itself is click-work — but the scope list, the
environment contract and the token-handling rules below are the part that
decides whether this is done *well*, and they are specified here rather than
improvised at the console.

**Do not paste any of these secrets into a chat, a ticket, or a commit.** They
travel from the Zoho console to Railway's environment variables and nowhere
else.

---

## 2 · The OAuth scopes — and why not `ZohoCRM.modules.ALL`

The obvious move is to request `ZohoCRM.modules.ALL` and stop thinking. The
reason not to is one line in §6.3 of the mapping document:

> If a record already exists from a prior approval, it is set to `Suspended`,
> **never deleted** — deletion would destroy the CRM's history of the
> relationship.

`ALL` includes `DELETE`. SponsorX never deletes a Zoho record, in any object, by
design — so a token that *can* delete one is a token that can only ever be used
to violate the mapping. The scope list below grants `READ`, `CREATE` and
`UPDATE` and no `DELETE` anywhere.

### 2.1 · Request exactly these

```
ZohoCRM.modules.accounts.READ,ZohoCRM.modules.accounts.CREATE,ZohoCRM.modules.accounts.UPDATE,
ZohoCRM.modules.contacts.READ,ZohoCRM.modules.contacts.CREATE,ZohoCRM.modules.contacts.UPDATE,
ZohoCRM.modules.leads.READ,ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.UPDATE,
ZohoCRM.modules.deals.READ,ZohoCRM.modules.deals.CREATE,ZohoCRM.modules.deals.UPDATE,
ZohoCRM.modules.tasks.READ,ZohoCRM.modules.tasks.CREATE,ZohoCRM.modules.tasks.UPDATE,
ZohoCRM.modules.custom.READ,ZohoCRM.modules.custom.CREATE,ZohoCRM.modules.custom.UPDATE,
ZohoCRM.settings.fields.READ,
ZohoCRM.settings.modules.READ,
ZohoCRM.coql.READ,
ZohoCRM.org.READ,
ZohoCRM.bulk.READ,
ZohoCRM.bulk.CREATE
```

### 2.1a · The same list, paste-ready

The Generate Code field takes one line with no spaces and no newlines. This is
§2.1 flattened — 24 scopes, 662 characters. Paste this, not the block above.

```
ZohoCRM.modules.accounts.READ,ZohoCRM.modules.accounts.CREATE,ZohoCRM.modules.accounts.UPDATE,ZohoCRM.modules.contacts.READ,ZohoCRM.modules.contacts.CREATE,ZohoCRM.modules.contacts.UPDATE,ZohoCRM.modules.leads.READ,ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.UPDATE,ZohoCRM.modules.deals.READ,ZohoCRM.modules.deals.CREATE,ZohoCRM.modules.deals.UPDATE,ZohoCRM.modules.tasks.READ,ZohoCRM.modules.tasks.CREATE,ZohoCRM.modules.tasks.UPDATE,ZohoCRM.modules.custom.READ,ZohoCRM.modules.custom.CREATE,ZohoCRM.modules.custom.UPDATE,ZohoCRM.settings.fields.READ,ZohoCRM.settings.modules.READ,ZohoCRM.coql.READ,ZohoCRM.org.READ,ZohoCRM.bulk.READ,ZohoCRM.bulk.CREATE
```

### 2.2 · What each one is for

| Scope | Why the sync needs it | Source |
|---|---|---|
| `modules.accounts.*` | Sponsor ↔ `Accounts`, bi-directional | §4 row 1, §7.1 |
| `modules.contacts.*` | Sponsor Contact ↔ `Contacts`, bi-directional | §4 row 2, §7.2 |
| `modules.leads.*` | Lead → `Leads`. `UPDATE` is included even though §7.3 is one-way, because an upsert retry after a timeout resolves to an update on the existing record | §4 row 3, §7.3 |
| `modules.deals.*` | Opportunity / Campaign / Renewal ↔ `Deals` | §4 rows 4, 5, 9, §7.4 |
| `modules.tasks.*` | Task ↔ `Tasks`, bi-directional | §4 row 7, §7.5 |
| `modules.custom.*` | `Content_Partners`. Zoho has no per-custom-module scope; `custom` covers all custom modules, and this org has exactly one | §4 row 6, §6 |
| `settings.fields.READ` | Reading field metadata — specifically keeping the `Sport` picklist in step, since a value Zoho lacks is rejected for the whole record | §6.2 |
| `settings.modules.READ` | Resolving module API names at startup rather than hardcoding them | §6.2.1 |
| `coql.READ` | `P8-INT-05`'s nightly reconciliation compares SponsorX rows against Zoho by `SponsorX_ID` | §8.3 |
| `org.READ` | Health check, and reading the org timezone — §2 requires every datetime to carry an explicit offset | §2 |
| `bulk.READ` | `P8-INT-07`'s backfill, and reconciliation at a volume where per-record reads would exhaust the rate limit | §8.3 |
| `bulk.CREATE` | The backfill importer's initial load | `P8-INT-07` |

### 2.3 · Deliberately not requested

| Scope | Why not |
|---|---|
| Any `.DELETE` | SponsorX never deletes a Zoho record. §6.3 suspends instead. |
| `ZohoCRM.users.READ` | Record ownership is Zoho-only and never mirrored (§7.1), so the sync has no reason to enumerate users. |
| `ZohoCRM.settings.ALL` | Would permit writing field and module definitions. Schema changes are deliberate click-work (`P0-OPS-05`, `P0-OPS-06`), not something a sync job should be able to do at 3am. |
| `ZohoCRM.notifications.ALL` | Only needed if webhook subscriptions are **registered by API**. Addendum A9's inbound webhooks can equally be configured by hand in the CRM. Add it later if `P8-INT-03` chooses programmatic registration — deciding that is that task's job, not this one's. |
| Anything `ZohoBooks.*` | Out of scope — §6. |

---

## 3 · Environment contract

`.env*` is gitignored in its entirety, so this table — not a sample file — is
the contract. The values live in **Railway environment variables**; nothing
below is ever committed.

| Variable | Value / source | Secret |
|---|---|---|
| `ZOHO_CLIENT_ID` | From the Self Client, §4 | yes |
| `ZOHO_CLIENT_SECRET` | From the Self Client, §4 | **yes** |
| `ZOHO_REFRESH_TOKEN` | From the token exchange, §4 step 5 | **yes** |
| `ZOHO_ACCOUNTS_DOMAIN` | `https://accounts.zoho.com` | no |
| `ZOHO_API_DOMAIN` | `https://www.zohoapis.com` | no |
| `ZOHO_ORG_ID` | `749122837` | no |

**The `.com` domains are not incidental.** Zoho partitions by data centre and
each has its own domains (`.eu`, `.in`, `.com.au`, …). This org is on the US
data centre, which is what the likely US-only residency direction requires —
see the open data-residency decision in `CLAUDE.md`. A token issued in one DC
is not valid in another, so these two variables are part of the residency
answer, not boilerplate.

### 3.1 · Token handling rules for whoever writes the client

- **The access token lasts one hour; the refresh token does not expire** unless
  revoked. Cache the access token in memory and refresh on expiry — do **not**
  call the refresh endpoint per request. Zoho caps refresh-token issuance per
  client, and a worker that refreshes on every job will hit that ceiling and
  lock itself out.
- **Never log a token, a secret, or a full request body** containing either.
- The refresh token is bound to the user who authorised it. If that person
  leaves, the sync stops — record who authorised it in the runbook log at §7.

---

## 4 · YOU · Issue the credentials

**Use a Self Client, not a Server-based Application.** The sync is a headless
worker: no user ever logs in, and there is no redirect URI to receive a code.
Self Client is the grant type built for exactly that.

1. Go to **https://api-console.zoho.com**. **Check which account the browser
   is already signed into before you do anything else** — the grant token is
   issued as whoever is signed in, and the refresh token inherits that identity
   permanently. Sign in as **`rcfworks@gmail.com`** — this is the development
   key (§9). Production gets its own, created by Rodney.
2. **Add Client** → choose **Self Client** → Create. Confirm.
3. The **Client ID** and **Client Secret** are now on the *Client Secret* tab.
   Copy them straight into Railway. Do not put them anywhere else.
4. Open the **Generate Code** tab:
   - **Scope** — paste the whole comma-separated list from §2.1, as one line
     with no spaces or newlines.
   - **Time Duration** — 10 minutes is plenty.
   - **Scope Description** — `SponsorX sync worker`.
   - Choose the portal/org when prompted, then **Create**. Copy the
     **grant token**. It is single-use and dies in 10 minutes.
5. Exchange it for a refresh token. Run this **in your own terminal**, with the
   three values substituted in — not in a chat, and not in a file that gets
   committed:

   ```bash
   curl -s -X POST "https://accounts.zoho.com/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=YOUR_GRANT_TOKEN"
   ```

   The response contains `refresh_token` (keep — this is `ZOHO_REFRESH_TOKEN`)
   and `access_token` (ignore — it expires in an hour and the worker will mint
   its own).

   If it returns `invalid_code`, the grant token has already been used or has
   expired. Generate a new one at step 4; nothing else needs redoing.

6. Put all three secrets into Railway's environment variables.

   **Railway does not exist yet** — `P0-OPS-01` is unstarted, and Stage C warns
   against starting its 30-day trial early. Until it does, hold the three
   values in a password manager. They do not go in this repo, a chat, or a
   ticket. Moving them into Railway is step 14 of the provisioning sequence.

7. **Prove it works** — this is acceptance criterion 2. Mint an access token
   from the refresh token, then make one real call:

   ```bash
   ACCESS=$(curl -s -X POST "https://accounts.zoho.com/oauth/v2/token" \
     -d "grant_type=refresh_token" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "refresh_token=YOUR_REFRESH_TOKEN" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

   curl -s "https://www.zohoapis.com/crm/v8/settings/modules" \
     -H "Authorization: Zoho-oauthtoken $ACCESS" | head -c 400
   ```

   A JSON body listing modules is a pass: it proves the refresh token works and
   exercises `settings.modules.READ`. `INVALID_TOKEN` means the refresh token
   or client pair is wrong; `OAUTH_SCOPE_MISMATCH` means the scope list did not
   go through in full — regenerate at step 4 with the §2.1a line.

   Tell me it passed. **Do not paste the output** — it is unremarkable, and the
   command line above contains all three secrets.

---

## 5 · YOU · Create the sandbox

Click by click. Zoho moves Setup items between releases, so if a label differs
from what is written here, tell me rather than guessing at the nearest match.

1. Go to **https://crm.zoho.com** and sign in as **`rcfworks@gmail.com`**.
2. Click the **⚙ gear icon** in the top-right of the CRM header bar. This opens
   Setup.
3. In the left-hand Setup menu, scroll down to the **Developer Space** group
   (it sits below *Automation* and *Data Administration*).
4. Click **Sandbox**.
5. Click **New Sandbox**, top right of the panel.
6. **Stop here.** Do not fill the form in yet — read the two questions below
   off the page and tell me the answers first. They change `P8-INT-07`'s plan,
   and the sandbox type cannot be changed after creation.
7. Once we have agreed the type: name it **`SponsorX-Dev`**, leave the default
   user set unless it forces a choice, and create it.
8. Note the **sandbox domain** Zoho gives you — it will be under
   `sandbox.zohoapis.com`, and it is not the production domain. Record it in §7.

Two things to tell me at step 6, because they depend on the
edition and I cannot read them through the connector:

- **Which sandbox types are offered.** Zoho distinguishes a configuration-only
  sandbox from a full-data one, and availability varies by edition. Either is
  enough for `P0-OPS-04`'s acceptance ("a sandbox or test org available"), but
  which one we get changes `P8-INT-07`'s plan: a configuration-only sandbox
  cannot rehearse a backfill against realistic data volumes.
- **How long it says provisioning will take.** A sandbox is a copy of
  production and is not instant.

*Checked 2026-09-14 and confirmed unreadable.* The CRM connector's module
metadata was tried as a way to answer the first question without you. It
returns `FEATURE_NOT_SUPPORTED` for `sandbox` — but it returns the same for
`custommodule`, which this org demonstrably has, so the response says nothing
about the edition. The question genuinely needs eyes on the Setup page.

Two facts already established that matter here:

- **The sandbox will inherit `Content_Partners` and the five `SponsorX_ID`
  fields**, because Zoho clones a sandbox *from* production and that work is
  already done. This is why building `P0-OPS-05` and `P0-OPS-06` in production
  first was the right order, not a compromise.
- **I will have no API access to the sandbox.** The connector's token is scoped
  to the production org, and a sandbox is a separate org with its own domain
  (`https://sandbox.zohoapis.com`). Any metadata work in the sandbox will be
  manual, and the worker needs its own credential set pointed at the sandbox
  domains — verify how tokens are issued for it when it exists, and record the
  answer in §7.

---

## 6 · Zoho Books — deliberately deferred

The stack uses Zoho Books for invoices and payment status, and Addendum A9
makes Invoice / Payment Reference an **inbound** flow. No Books credentials are
specified here, because §7.7 of the mapping document marks that mapping
**OPEN (O-1)** — which Books objects are read, and which fields, is undecided.

Specifying a Books scope list now would mean guessing, and an OAuth client
provisioned against a guess is one that gets reissued. **Resolve O-1 first.**
Books credentials are then a small, separate task against a known field map.

This is recorded so it is not mistaken for an oversight.

---

## 7 · Provisioning log

Fill in as each step completes. No secrets here — names and dates only.

| Item | Status | Date | Who | Notes |
|---|---|---|---|---|
| Dev key — authorising account chosen | ☑ | 2026-09-14 | rcfworks | **`rcfworks@gmail.com`** — development key (§9) |
| Self Client created | ☐ | | | |
| Scopes granted per §2.1 | ☐ | | | Record any scope Zoho rejected |
| Refresh token issued | ☐ | | | **Record who authorised it** — the token is bound to that user |
| Secrets in Railway | ☐ | | | |
| Sandbox created | ☐ | | | Record the type offered and the sandbox domain |
| Sandbox token strategy confirmed | ☐ | | | How the worker authenticates against the sandbox |
| Production key created by Rodney | ☐ | | | §9 — `rcarr@icarrefound.org`, before real records move |

---

## 8 · Acceptance

`P0-OPS-04` is done when the task's own criterion is met — *"Client ID, secret
and refresh token issued; a sandbox or test org available for sync
development"* — which means, concretely:

1. Three secrets present in Railway, none of them in git, a chat or a ticket.
2. A live call succeeds against `ZOHO_API_DOMAIN` using a token minted from the
   refresh token — the simplest proof is a `GET /crm/v8/settings/modules`,
   which also exercises `settings.modules.READ`.
3. A sandbox exists, its type is recorded in §7, and the question of how the
   worker authenticates against it has an answer rather than an assumption.

---

## 9 · Two keys, by purpose

Not one key that moves. **Two keys that coexist**, each created by the account
that should own it:

| Key | Created by | Used for |
|---|---|---|
| Development | `rcfworks@gmail.com` | Building and testing the sync |
| Production | `rcarr@icarrefound.org` | The live sync, once it runs for real |

This supersedes the earlier plan of issuing under a personal account and later
"transferring" it. There is no transfer in Zoho — but there does not need to be
one, because nothing stops both keys existing at the same time against the same
org. They do not conflict.

The arrangement is better on two counts. The production credential belongs to an
account the organisation owns and that does not leave when a contractor does.
And development stops sharing a credential with production, which is ordinary
practice and worth having by default rather than by migration.

### 9.1 · What Rodney does

**He has to do this himself.** A Self Client is created inside the API console
of whoever is signed in, so it cannot be made on his behalf. Roughly fifteen
minutes.

1. Sign into **https://api-console.zoho.com** as `rcarr@icarrefound.org`.
2. **Add Client → Self Client → Create.**
3. Copy the **Client ID** and **Client Secret** from the *Client Secret* tab.
4. On the **Generate Code** tab, paste the scope line from **§2.1a** of this
   document — send him that section; it is the only part he needs.
   Time Duration 10 minutes, description `SponsorX sync worker`.
5. Exchange the grant token for a refresh token using **§4 step 5**, and verify
   with **§4 step 7**.
6. Record it in the §7 log.

### 9.2 · What stays true of both keys

- **A key can only be managed by the account that created it.** Rodney cannot
  rotate or revoke the development key from his own console, and the reverse is
  equally true. Each is administered by its owner alone.
- **Each key acts as its creator.** Records the sync writes are attributed in
  Zoho's history to whoever authorised the key that wrote them. That history is
  not rewritable, which is the concrete reason production should be on Rodney's
  key before real sponsor records start moving — not after.
- **A key dies with its user's access.** If either account is removed from the
  org, unlicensed, or deleted, that key stops working. For the development key
  that is an inconvenience; for the production key it would be an outage, which
  is exactly why production belongs on an organisation-owned account.

### 9.3 · The one rule

**The development key must never be what production runs on.** That is the
whole point of the split, and it is the easiest thing to let slide — the dev key
will already work, so nothing fails to remind anyone. Production is not
correctly set up until Rodney's key is the one in use, and the §7 log has a row
for it precisely so its absence stays visible.
