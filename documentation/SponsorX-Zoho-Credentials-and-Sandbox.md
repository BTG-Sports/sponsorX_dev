# SponsorX ↔ Zoho — API credentials and sandbox

**Task `P0-OPS-04`** · Blueprint reference **§18**, Addendum **A9**

| | |
|---|---|
| **Version** | 0.1 |
| **Date** | 2026-09-11 |
| **Author** | rcfworks |
| **Status** | Specification complete. The two provisioning steps are console click-work and are marked **YOU** below. |
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

1. Go to **https://api-console.zoho.com** and sign in as the Zoho admin
   (`rcarr@icarrefound.org`).
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

6. Put all three secrets into Railway's environment variables. Done.

---

## 5 · YOU · Create the sandbox

**Setup (⚙) → Developer Space → Sandbox → New Sandbox.**

Two things to tell me once you are on that page, because they depend on the
edition and I cannot read them through the connector:

- **Which sandbox types are offered.** Zoho distinguishes a configuration-only
  sandbox from a full-data one, and availability varies by edition. Either is
  enough for `P0-OPS-04`'s acceptance ("a sandbox or test org available"), but
  which one we get changes `P8-INT-07`'s plan: a configuration-only sandbox
  cannot rehearse a backfill against realistic data volumes.
- **How long it says provisioning will take.** A sandbox is a copy of
  production and is not instant.

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
| Self Client created | ☐ | | | |
| Scopes granted per §2.1 | ☐ | | | Record any scope Zoho rejected |
| Refresh token issued | ☐ | | | **Record who authorised it** — the token is bound to that user |
| Secrets in Railway | ☐ | | | |
| Sandbox created | ☐ | | | Record the type offered and the sandbox domain |
| Sandbox token strategy confirmed | ☐ | | | How the worker authenticates against the sandbox |

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
