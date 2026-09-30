# Indexes Prisma cannot express

Prisma has no syntax for a **partial** index — one with a `WHERE` clause — or
for a trigger. The files below are not optimisations; each enforces a rule the application cannot
enforce correctly on its own, and each is applied by a migration under
`prisma/migrations/`.

They live here as well so they can be read without digging through migration
SQL, and so the reasoning survives. **This directory is the explanation; the
migration is the source of truth.** If you change one, change it in a new
migration and update the copy here.

| File | Enforces |
|---|---|
| `reward_single_redeem.sql` | A single-use reward's token can be redeemed exactly once (multi-use rewards are free of it, QA-04). The redeem / claim decision itself — the cap, the claim's reservation, state and expiry under one row lock — is the `reward_redeem()` / `reward_reserve()` functions and the `redemptionCount` trigger in migration `20260928200000_reward_merge_holds_atomic_redeem` |
| `outbox_pending.sql` | The outbox drain only ever scans undispatched rows |
| `invite_one_open.sql` | One *open* invitation per athlete per job |
| `adslot_inventory.sql` | A NEXT ad slot sells once, never after its edition closes, and each edition has one back cover and one presenting sponsor (P9-BE-03) |
| `sales_attribution_immutable.sql` | A student's sale attribution is never updated or deleted (P9-BE-13) |
| `next_rights_checks.sql` | A consent has exactly one subject; a content right is consent or a licence, matching its grantor (P9-BE-10, -11) |
| `fan_sponsor_contact_check.sql` | Sponsor-contact consent needs an address and the delivery consent (2S6-BE-03) |
| `marketplace_checks.sql` | An inventory item has one owner, a price and a sane window; one live listing per item; a listing and its order lines have exactly one seller — a property or an independent athlete (2S2-BE-01, 2S3-BE-01, 2S3-BE-05) |
| `offer_terms_immutable.sql` | A sent offer's terms, and an accepted offer's snapshot, never change (2S2-BE-03) |
| `restrictions_carts_checks.sql` | A restriction has one owner and a sane window; one ACTIVE cart per sponsor (2S2-BE-02, 2S4-BE-01) |
| `marketplace_order_immutable.sql` | A package part is never the package; one HELD reservation per cart; an order's figures are fixed from APPROVED (2S3-BE-02, 2S4-BE-02/-03) |
| `reward_cap_check.sql` | A reward's redemption count never passes its cap (P6-BE-08) |
| `ledger_immutable.sql` | Commission rules are versioned, never rewritten; a frozen breakdown and a ledger entry never change (status only forward); **the audit log is append-only** (2S5-BE-01/-02, 2S4-BE-04, 2S5-SEC-01) |

**Test databases must be marked purgeable.** The audit log refuses every
`DELETE`, except in a database explicitly marked as a test database. Test
suites clean up their own rows, so they need that mark. Run it once against
your local test database:

```sql
ALTER DATABASE sponsorx_test SET sponsorx.audit_purge = 'on';
```

CI does this for its two databases (`.github/workflows/ci.yml`). Never set it
on staging or production.
| `fan_sponsor_contact_check.sql` | A sponsor-contact consent only ever extends an address held with the delivery consent (2S6-BE-03) |
