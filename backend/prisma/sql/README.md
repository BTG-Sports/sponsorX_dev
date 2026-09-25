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
| `reward_single_redeem.sql` | A single-use reward can be redeemed exactly once |
| `outbox_pending.sql` | The outbox drain only ever scans undispatched rows |
| `invite_one_open.sql` | One *open* invitation per athlete per job |
| `adslot_inventory.sql` | A NEXT ad slot sells once, never after its edition closes, and each edition has one back cover and one presenting sponsor (P9-BE-03) |
| `sales_attribution_immutable.sql` | A student's sale attribution is never updated or deleted (P9-BE-13) |
| `next_rights_checks.sql` | A consent has exactly one subject; a content right is consent or a licence, matching its grantor (P9-BE-10, -11) |
