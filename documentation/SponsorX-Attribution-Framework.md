# SponsorX Attribution Framework

**Task `3S6-BE-01` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 6**

Partner stores and platforms send SponsorX their sales so a sponsor can see
"sales matched to you". Attribution is pluggable, never universal: each
partner format is an **adapter**, and the engine knows only the adapter's
interface. **Adding a partner format means registering an adapter, never
changing the engine.** What the results may be called is
`SponsorX-Attribution-Claims.md` (3S0-PMO-01).

## 1 · An adapter declares

| | Rule |
|---|---|
| `key`, `name` | e.g. `generic-webhook-v1`, "Generic partner webhook" |
| `methods` | how it may attribute, in order. **Deterministic always first.** Probabilistic only if it says so, and then never labelled verified. |
| `lookbackDays` | 1–365: a sale this long after the campaign's last exposure isn't credited |
| `matchKeys` | the exact keys it carries: SponsorX reward `token`, partner `order_id`, SponsorX `click_id`. At least one. |
| `intake` | how data arrives (`webhook` today) |
| `parse(payload)` | a delivery → partner events. Invalid events are left out, each with its reason. |

`registerAdapter` refuses an adapter that breaks any rule (`attribution-adapters.ts`).

**A partner event:**
- the partner's own id;
- sale or refund;
- when it happened;
- the amount and currency;
- the exact keys.

Matching keys to campaigns is `3S6-BE-03`. The normalised event table is `3S6-BE-02`.

## 2 · The first adapter: `generic-webhook-v1`

**The delivery:**
```
{ "events": [ { "id": "o-1", "type": "sale", "occurred_at": "2026-11-05T12:00:00Z",
                "amount_cents": 4500, "currency": "USD", "reward_token": "…", "order_id": "…", "click_id": "…" } ] }
```
- **Deterministic only,** with a 30-day lookback.
- **1 to 500 events** per delivery.
- **An event with no token, order id or click id is left out:** it can't be matched exactly.

## 3 · Partners and deliveries

- **Adding a partner:** a BTG admin adds one with a name and an adapter
  (`POST /intelligence/attribution/partners`).
  - SponsorX makes a **secret token, shown once** and kept only as its SHA-256, with the endpoint.
  - It is audited (`attribution.partnerAdd`).
- **Delivering:** the partner posts to `POST /api/v1/attribution/partners/{partnerId}/events` with `Authorization: Bearer <token>`.
  - **Public by necessity**, and rate-limited (120 a minute).
  - **The token** is checked in constant time. An unknown partner and a wrong token get the same 401.
  - **A partner or feature switched off** gets 403.
- **Every delivery is kept as received** (`AttributionDelivery`), with the events its adapter made and every problem. **One with no valid event is kept too, as rejected**, so nothing a partner sends disappears silently.
- **The partner desk** (`GET /intelligence/attribution/partners`) shows the adapters available and each partner's deliveries, rejections, events and last delivery.

**Who** (`attribution`, RBAC matrix §36): BTG admins for their tenant, super
admins for any. **The feature is switched per tenant** as `attribution` (3S8-OPS-01).

## 4 · Where it lives

- `backend/src/domain/attribution-adapters.ts`: the interface, the registry, `generic-webhook-v1`.
- `backend/src/domain/attribution-intake.ts`: partners, the token, deliveries.
- `backend/src/routes/v1/attribution.ts`: the public endpoint.
- **Migration:** `20261016100000_attribution_framework`.
- **Proof:** `backend/tests/attribution-framework.test.ts`. A second adapter with a different shape is registered and used in the test itself, with no engine change.
