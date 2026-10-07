# Phase 2 — the nine remaining frontend screens

**Date:** 2026-10-07 · **Raised by:** programme owner ("let's do all of this
in one go") · **Scope:** the nine Phase 2 frontend tasks still open whose
API is built: 2S5-FE-07, 2S5-FE-08, 2S5-FE-09, 2S5-FE-10, 2S5-FE-11,
2S5-FE-12, 2S1-FE-14, 2S8-FE-01, 2S8-FE-02. Branch `feature/P2-FE-screens`,
cut from `main_development` after today's merge.

The house rules apply throughout: an admin desk is a dashboard on the
Mission Control stage (small title, tiles, work first — no hero); lists
that grow are **server-paged** with the house pager (`lib/paging.ts` on the
API, `PagedTable` / `PagerRow` on the page); counts come from the API,
never from the rows in view; actions open a **dialog** with named choices,
never an always-open form; nothing is typed that could be a choice; every
screen says the API's own words on refusal; role rules are the API's,
mirrored by `lib/admin-access`.

## Stream A — BTG's money desks and the support page

### 2S5-FE-07 · `/admin/payments/events` — Payment events
BTG admin and Finance read (`paymentEvent`); only BTG admin resolves.
- Header: title "Payment events", one-line dek. Four KPI tiles from the
  API's `counts` / `waitingOnBtg`: Needs BTG, Held, Failed, Deferred.
- Tabs (TabStrip, counts from the API): **Needs BTG** (default: HELD and
  FAILED, unresolved — the API's default read), **Deferred**
  (`?status=DEFERRED`), **Resolved** (`?status=HELD,FAILED` narrowed to
  `resolvedAt` set — the API has no resolved flag, so the desk asks for
  `?resolved=true` once the pager lands, see below), **All**.
- The API is capped at 200 with no pager: Stream A adds the house pager to
  `GET /payment-events` (`readPage`, `?page&size`, `page:{…}`, a
  `tenant-scope:` note on each read, `?resolved=true|false` as a filter)
  and keeps the unpaged shape when `?page` is absent. The page tolerates a
  response without `page` (one page of what came back).
- Table (StageTable): Event (type, provider event id under it) · Order
  (`subjectRef`) · Status (badge: HELD warn, FAILED danger, DEFERRED
  neutral, APPLIED accent) · Why (`outcome`) · Received (ago) · Action.
  Resolved rows show who and when and the note.
- Action: **Resolve…** opens a dialog (OrderDialog shape) with the event's
  words, a required note (NoteField), and the API's refusals in its own
  words (409 already resolved / wrong state, 422 card number). Finance
  sees the row without the button and one line saying BTG admin resolves.
- Nav: Money group, "Payment events" (A → Z inside the group). Access map:
  SUPER_ADMIN, BTG_ADMIN, FINANCE.

### 2S5-FE-08 · `/admin/payments/disputes` and `/[id]` — Disputes
BTG admin and Finance read and review; only BTG admin resolves.
- List: title "Disputes", KPI tiles Open / Under review / Won / Lost
  (`counts`). Tabs by state (default Open). Stream A adds the house pager
  to `GET /disputes` (same recipe; order `openedAt` desc inside a state).
  Table: Order (ref, sponsor under it) · Amount · Reason · Opened (ago) ·
  State (badge) · Provider (outcome and when, or "waiting") · Action
  (Open →).
- Detail: header (order ref, sponsor, amount, state badge, provider
  dispute ref), a facts grid (opened, provider outcome and closed-at,
  review started / by / note, resolved / by / note, owed back, ledger
  reversed, frozen), the order's lines (title, total) and the payouts it
  freezes (state, payee, amount).
- Actions, as dialogs: **Take for review** (state OPEN; note required) and
  **Resolve as the provider's outcome** (state UNDER_REVIEW and the
  provider has decided — the API's `canResolve`; note required; when the
  dispute amount is below the order total the dialog lists the lines with
  checkboxes and requires at least one — a partial loss). Refusals in the
  API's words (409 take-for-review-first / already resolved / provider
  undecided, 422 lines). Finance: no buttons, one line saying BTG admin
  resolves.
- Nav: Money group, "Disputes". Access map: SUPER_ADMIN, BTG_ADMIN,
  FINANCE. The dispute emails link to the detail page.

### 2S5-FE-12 · provider-made refunds on `/admin/refunds`
`cause: "PROVIDER_REFUNDED"` rows arrive SENT with `sent.by: "SYSTEM"`,
`method: "CARD"`, `reference` the provider's. `causeLabel` → "Provider
refund"; the Sent cell reads "Refunded by the payment provider · ref …";
no Mark refunded (the row is in the Sent tab). Unit-tested.

### 2S1-FE-14 · `/admin/support/[id]` — a support message
BTG admin only (`supportMessage`). The support email links here when a
message has attachments. Page: the sender (name, email), topic label,
state, when it arrived, the message text, and the attachments as a stage
table: File · Type · Size · Arrived · **Open** — a client button that
calls a server action for `GET /support-messages/:id/attachments/:aid`
(JSON `{ url, expiresInSeconds }`) and opens the signed link in a new tab;
a file that never finished uploading says so (409). A missing message is
403 from the API → "No support message matches this link." Access map:
SUPER_ADMIN, BTG_ADMIN. No nav entry (reached from the email).

## Stream B — the payee's and the sponsor's money

### 2S5-FE-09 · frozen money on the payee's pages
`GET /payouts/me` marks an order `frozen: true` and adds the check
`{ key: "dispute", ok: false, label }` when any order is frozen.
- Athlete `/athlete/money`: a frozen order in the per-order list carries a
  "Frozen" badge and exactly this line: "BTG is reviewing a problem with
  the sponsor's payment". Its money is not in the requestable balance (the
  API already leaves it out) — the row says so instead of showing it as
  available.
- Property `/property/earnings` has no per-order list: a notice above the
  request panel names the frozen order(s) and amount with the same
  sentence. The `dispute` check renders in the checks list as the API
  sends it.
- Types in `lib/payouts-live.ts` gain `frozen`; a pure helper
  (`frozenOrders(me)`) is unit-tested.

### 2S5-FE-10 · payout send attempts and bank returns
Payouts carry `sendAttempts: number`, `returnedAt: string | null`,
`returnCount: number` (integers, not arrays).
- BTG's `/admin/payouts/[id]`: in the aside, under the state, "Handed to
  the provider N time(s)"; a returned payout shows a danger line
  "Returned by the bank on <date> (N time(s))" and the existing failure
  copy; the audit trail lists the return.
- Payee history (`payout-history.tsx`): a payout with `returnedAt` reads
  **"Returned by your bank: fix your payout account"** with the fix link.
- Types and a pure `returnWords(p)` helper, unit-tested.

### 2S5-FE-11 · checkout says "busy, try again"
`POST /marketplace-orders/:id/pay` answers 503 `{ error: { code: "busy" } }`
when the provider is down, nothing recorded. In
`sponsor/orders/[id]/payment-actions.ts` a 503 with code `busy` becomes
**"The payment service is busy. Try again in a minute."**; the pay button
stays enabled so the sponsor can retry. `refusalFrom` is shared with the
cart and stays untouched. Unit-tested.

## Stream C — public links and the profile claim

### 2S8-FE-01 · expired emailed links
The API answers `410 { error: { code: "link_expired", kind, renew } }` on
every public token route; `POST /public/links/renew { kind, token }`
answers 202 `{ sent: true }` always (10/hour/IP → 429).
- One shared client component `components/link-expired.tsx`
  (`LinkExpired({ kind, token, what })`): the plain message ("This link
  has expired. Links last 14 days."), a **Send me a fresh link** button
  calling a server action (`renewLinkAction(kind, token)` →
  `/public/links/renew`), then "Sent — check your email" (or the 429
  words). Styled like the pages' existing `Plain` notices.
- Each of the nine pages renders it on a 410, taking `kind` from the error
  body (falling back to the page's own kind): `/join` (the checklist's
  client error path), `/join/confirm`, `/guardian/setup`,
  `/coming-of-age/[token]`, `/onboarding/[token]`, `/onboarding/confirm`,
  `/sponsor-request/[token]`, `/sponsor-request/confirm`,
  `/guardian/handoff`. Other errors keep their current branches.
- Unit tests for the helper that classifies a response (410 → expired with
  kind).

### 2S8-FE-02 · profile claim: confirm your email
- After "Claim this profile" the API answers `201 { state: "PENDING_EMAIL" }`:
  the form's success state says **"Check your email"** and that the claim
  moves on once the link is confirmed.
- New page `/athletes/claim/confirm?t=` (public): a card with one button
  **Confirm my email**, which POSTs the token through a server action to
  `/public/athlete-claims/confirm-email`; success redirects to
  `/athletes/{slug}?claim=confirmed` (REJECTED → `closed`); 410 renders
  `LinkExpired` (kind `claim-email`); 400 / 404 → `invalid`. A mail
  scanner's GET confirms nothing.
- `/athletes/[slug]` reads `?claim=` (`confirmed`, `expired-resent`,
  `closed`, `invalid`) and shows one banner per value.
- The backend's `claimConfirmUrl` (`domain/featured.ts`) now points the
  email at `/athletes/claim/confirm?t=`; the API's own `GET
  /public/athlete-claims/confirm` redirect stays for old emails. The
  `next.config.ts` rewrite for the old path is reviewed so the new page is
  not rewritten away.

## Verification (every stream)
tsc, eslint, the frontend unit suite, and a Playwright walk per stream
against the running dev servers (`E2E_BASE_URL=http://localhost:3000`),
seeding what it needs through the API or `e2e/support/loop-db.ts`; screens
at 1440 and 390; no console errors, no horizontal overflow. The owner's
own check-list is in the hand-over message.

## The owner's check-list (2026-10-07)

Sign in with the QA accounts (password `SponsorX-Dev-2026!`, code
`424242`): `qa.p3fe02.admin+clerk_test@example.com` (BTG admin),
`qa.fe.finance+clerk_test@example.com` (Finance),
`qa.p3fe03.athlete+clerk_test@example.com` (athlete),
`qa.fe.sponsor+clerk_test@example.com` (sponsor). Use
`http://localhost:3000`, not 127.0.0.1. The local API uses the stand-in
payment provider, so every money event can be raised by hand with
`POST /api/v1/payment-events/test-provider` as the BTG admin (body
`{ type, orderId | payoutId, outcome?, kind?, amountCents? }`; types
`payment.processing|succeeded|failed|refunded`, `dispute.opened|closed`,
`payout.paid|failed|returned`). The quickest way to get a paid order and a
payout to point them at is `npx playwright test e2e/marketplace-path.spec.ts`.

1. **Payment events** — `/admin/payments/events`: tiles, tabs, the table.
   Raise one: `payment.refunded` on a paid order with nothing owed back →
   a HELD event. Resolve… → note → the row moves to Resolved. As Finance:
   no button, the line "BTG admin resolves these".
2. **Disputes** — raise `dispute.opened` on a paid order → `/admin/payments/disputes`
   Open tab; open it: Take for review → note. Raise `dispute.closed` with
   `outcome: "LOST"` (and `amountCents` below the order total for a partial
   loss) → Resolve as the provider's outcome → pick the lines → note.
   As Finance: no buttons.
3. **Provider refund** — after the `payment.refunded` above,
   `/admin/refunds?tab=sent` shows "Provider refund · Refunded by the
   payment provider · ref" with no Mark refunded.
4. **Support message** — `/contact`, attach a file, send; the id is in
   the worker's email log (or `support_messages`); `/admin/support/<id>`
   as BTG admin: the message and Open on each file (a five-minute link).
   Finance gets "Outside your role".
5. **Frozen money** — with the dispute OPEN, the athlete's `/athlete/money`
   per-order row shows Frozen and "BTG is reviewing a problem with the
   sponsor's payment"; the requestable balance leaves it out; the checks
   list shows the dispute check. Property: `/property/earnings` notice.
6. **Payout attempts and returns** — raise `payout.returned` on a payout:
   `/admin/payouts/<id>` shows "Handed to the provider N time(s)" and the
   red "Returned by the bank on …"; the payee's history reads "Returned by
   your bank: fix your payout account".
7. **Busy checkout** — restart the API with `PAYMENT_PROVIDER_TIMEOUT_MS=10`
   and press Pay by card on an unpaid sponsor order: "The payment service
   is busy. Try again in a minute."; the button stays usable.
8. **Expired links** — `/join/confirm?t=anything` shows the invalid notice;
   `npx playwright test e2e/public-links.spec.ts` mints a 15-day-old token
   and shows the expired notice, presses Send me a fresh link, gets
   "Sent — check your email".
9. **Profile claim** — a FEATURED athlete's `/athletes/<slug>`: Claim this
   profile → "Check your email"; the email's link is now
   `/athletes/claim/confirm?t=…`: one button, Confirm my email → the
   profile with the green banner. `?claim=expired-resent|closed|invalid`
   each show their banner.

Everything at once: `set -a; . ./.env; set +a; E2E_BASE_URL=http://localhost:3000
E2E_API_URL=http://localhost:4000 npx playwright test e2e/admin-payments-desks.spec.ts
e2e/payee-money.spec.ts e2e/public-links.spec.ts --project=chromium --workers=1`.
