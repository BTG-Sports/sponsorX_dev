# Finance — "the Vault" (P1-ART-25): design and build contract

**Date:** 2026-10-12 · **Branch:** `feature/P1-ART-25-finance-vault` (stacked on `feature/P1-ART-24-mobile-dock`)
**Owner's ask:** "visual redesign the finance dashboard pages, all of its pages, make it the same as the
admin, athlete, and sponsor but … a distinction between those … the table … pagination based on our
rules and memory … this is a dashboard so statistics is what they want to see … wow factor."
**Decisions taken in the visual companion:**
- **Option 1:** Finance gets its own home, as athlete and sponsor do. URLs stay under `/admin/…`.
- **Direction A, "The Vault":** chosen over the Ledger and Money Flow.
- **The Treasury layout:** approved as shown, with parts ① to ⑥.

## 1. Identity: four looks

Finance is a *role* inside the admin portal (RBAC Matrix: `FINANCE`), not a separate portal. Today a
Finance user lands on the admin dashboard with some parts missing, and nothing on it is about money. The
Vault gives Finance its own home and look, while the routes and the access rules stay exactly as they are.

| | Admin (`.sx-ops`) | Athlete (`.sx-arena`) | Sponsor (`.sx-stadium`) | **Finance (`.sx-vault`)** |
|---|---|---|---|---|
| Theme | fixed dark | theme-aware | fixed dark | **fixed dark.** The theme toggle is hidden, as it already is on admin |
| Hue | steel and cyan | blue and orange | orange LED | **brushed gold (`#d4b062`, light gold `#f1dfa6`) on a deep bank green (`#06100c`).** Green `#3ddc97` means good and red `#e36a5a` means late |
| Shape | chamfers, corner brackets | 18px plates, speed bar | 6px LED panels, scan-lines | **square corners with a double-rule frame,** like the border of a banknote: a 1px gold border, a second 1px gold outline 3px outside it, and a faint dashed rule 4px inside |
| Numerals | upright mono | bold italic "jersey" | glowing sans | **engraved serif** (Source Serif 4, already loaded as `--font-source-serif`), bold, tabular, filled with a gold gradient |
| Signature | floor grid, scan sweep | floodlights, lanes | ticker, dot-matrix band | **guilloché rosettes,** the engraving on a banknote: faint gold line-work behind the page. Plus the **vault dial,** a ring gauge whose ticked outer bezel turns |
| Entrance | rise | slide from left | power on | **unlock:** the frame's gold hairline draws in, the content fades up, and the numbers count up. Staggered. |
| Needs you | cyan | orange flare | filled pulsing orange | **a solid gold count badge with a slow pulse** |

Rules:
- Never put chamfers, brackets, speed bars, lanes, scan-lines or the ticker on a Vault screen.
- Never put guilloché, double-rule frames or the dial on the other three looks.
- With reduced motion: no turning bezel, no hairline draw-in, and count-ups show their final value at once.

## 2. Where the Vault applies

**Vault routes** (`lib/vault-routes.ts` → `isVaultPath(path)`, longest-prefix match):
- `/admin/finance`
- `/admin/payouts` and `/admin/payouts/*`
- `/admin/refunds`
- `/admin/payments/*` (Payment events, Disputes, one dispute)
- `/admin/commission`

**A whole screen switches, never part of one.**
- `PortalShell` gains a `vault?: boolean` prop. The admin layout passes it.
- A client island, `StageRoot` (`components/stage-root.tsx`), reads `usePathname()`. On a Vault route it adds `sx-vault` to the shell root and sets `data-vault` on it.
- The shell root keeps `sx-ops`, so the admin chrome's structure is unchanged.
- Both grounds are rendered, `OpsGround` and `VaultGround`, and CSS shows one: `.sx-vault .sx-ops-ground{display:none}` and the reverse.
- This has to happen on the client, because a layout does not re-render when you move between sibling routes.
- Under `.sx-ops.sx-vault`, `vault.css` re-tints:
  - the sidebar (the accent bloom, the active item, the edge line);
  - the header;
  - the phone dock and menu (`mobile-nav.css`, using `[data-vault]`).

**Finance users land on Treasury.** A *Finance-only* viewer is one whose admin-portal roles are exactly `FINANCE`
(`lib/admin-access.ts` → `isFinanceOnly(roles)`). For them:
- `/admin` (the board page) does `redirect("/admin/finance")`;
- the sidebar's top item is **Treasury → `/admin/finance`**, replacing Dashboard;
- the Money group's Finance item is dropped, so Treasury doesn't appear twice;
- the dock is `["/admin/finance", "/admin/payouts", "/admin/refunds", "/admin/payments/disputes"]`.

**For everyone else:**
- The Money group item `/admin/finance` is relabelled **Treasury**.
- BTG admins keep Mission Control as their home and see the Vault when they open a money desk.

**Follow-up (2026-10-12): Finance is its own portal everywhere.** The owner found that a Finance user who
opened Campaigns, Briefs, Network, NEXT, Analytics, the Audit log or Integrations dropped back into Mission
Control, under an "ADMIN" label, and that some of those desks only said "outside your role". So:
- **The Vault on every page for a Finance-only viewer.** `vaultOn(path, mode)` (`lib/vault-routes.ts`) decides,
  and `StageRoot` uses it. The mode is `"all"` for a Finance-only viewer (the admin layout passes
  `vault="all"` when `isFinanceOnly`), `"money"` for everyone else (the Vault on the routes above only), and
  `"off"` on every other portal. `<body>` carries `sx-vault` / `data-vault` whenever the root does.
- **The label and watermark follow the look.** The sidebar's portal label and its vertical watermark read
  "FINANCE PORTAL" / "FINANCE" whenever the Vault is on, "ADMIN PORTAL" / "ADMIN" otherwise. Both words are
  rendered and `vault.css` shows one (`.sx-when-vault` / `.sx-when-ops`), because the switch is made on the
  client. The phone menu names itself by the same rule (`vaultOn` in `StageMenu`). The header's greeting is
  unchanged.
- **Desks Finance can't use are hidden, by explicit access entries.** Briefs, Network, Analytics, the Audit
  log, Integrations and NEXT Editions / Inventory / Rights now have `ADMIN_ACCESS` entries listing the roles
  the API actually serves (each cites its policy row), so the nav hides them and the page shows "Not in your
  role". NEXT Splits is mapped to BTG admins and Finance. A Finance-only viewer's nav is: Treasury,
  Campaigns, Disputes, Payment events, Payouts, Refunds to send, Splits. No role lost a desk its reads allow.
- **What's left is re-cut in `vault.css`,** scoped under `.sx-ops.sx-vault`: the stage column's own ground,
  `<body>`, NEXT's violet, the shared stat and card figures (gold serif), the Mission Control kit (panels,
  cards, brackets, KPI bars and numbers, cyan words) and the Splits payee fills (`data-payee`).

## 3. Page anatomy (memory `admin-desks-are-dashboards`)

Every Vault page has the same anatomy:
- a small title (`sx-page-title`, set in the serif) with a live pill (`Live · updated 12:04` in the viewer's time zone);
- actions on the right;
- a row of tiles;
- then the work.

There is no hero headline, no explanatory paragraph and no outlined background word. Words are plain and
there are no § numbers in the UI. Status names come from each desk's existing `*-live.ts` wording helpers.

## 4. Pagination (memory `pagination-pattern`, verbatim)

Every list is server-paged through the existing kit (`PagedTable` / `ServerList` / `PagerRow` /
`ListSearch` / `ListFilter`):
- 12 / 24 / 60 per page, using the designed dropdown;
- the controls appear both above and below the list;
- the range ("Showing X–Y of Z") goes in the top row only, and only when the list is filtered or longer than one page;
- the pager is `alwaysShow`;
- the bottom dropdown opens upwards;
- the URL drives it, and any filter change resets to page 1.

A second list on the same page keeps its own keys. Add a **`"vault"` tone** to `FilterTone` (filter-kit), and give it a style in:
- `pagination.tsx`: the active page is gold-filled, `bg-[#d4b062] text-[#06100c]`;
- the filter-kit `Dropdown` and `SearchInput`;
- `stage-table.tsx`;
- `date-range-picker.tsx`, if it is used.

Every Vault page passes `tone="vault"`.

## 5. The Vault kit: `components/vault-stage.tsx` and `app/(app)/admin/vault.css`

Its API mirrors the Stadium kit, so the pages read the same way.

| Export | What |
|---|---|
| `VaultGround` | The green and gold glows, two SVG guilloché rosettes (top right, bottom left, about 14% opacity) and the pointer light (`data-spot`, as in the other grounds) |
| `VaultHead({title, pill, actions, children})` | The title row; the tiles go in as children |
| `VaultTiles({cols})` / `VaultTile({label, value, format, caption, delta, deltaLabel, href, hint, tone, delay})` | A double-rule tile with an `ArenaCount` count-up in `.sx-vault-num` (gold gradient serif). `delta` is a fraction (▲/▼ %, "vs the 30 days before"). `tone="you"` gives a gold border; `badge` adds the pulsing count; `"late"` gives red. `href` makes the whole tile a link. `hint` adds a "?" through the existing `StadiumHint`, which gains a `skin?: "stadium" | "vault"` prop picking `sx-<skin>-q` / `sx-<skin>-tip` (default `stadium`, so the sponsor side is unchanged) |
| `VaultBox({label, count, cents, sub, href, open, delay})` | A Needs-you "deposit box": count · amount, the oldest wait, and "Open …". The whole box is a link. A key-ring glyph sits top right |
| `VaultPanel({children, flush, delay, tone})` / `VaultSection({title, hint, action})` | A panel and a section's title row (serif heading) |
| `VaultDial({value, label, caption})` | The ring gauge (`value` 0..1): an SVG ring with a gradient stroke that sweeps to the value, and a ticked bezel that turns slowly (stopped with reduced motion), with the % in the centre in the serif |
| `VaultFlow({series, bucket})` | A client island (`vault-flow.tsx`) for the money-in vs money-out chart. "In" is a gold area with a line; "out" is a dashed green line. A hover read-out shows the date, in and out. It reuses `stadium-trend.tsx`'s monotone curve, which never overshoots, adapted. Accessible: an `aria-label` summary plus a visually hidden table |
| `VaultSplit({rows})` | Horizontal gold share bars with the amount and % |
| `VaultSteps({steps, label})` | The athlete-pay steps (Pending → Approved → Ready → Paid, with Held/Disputed set apart in red), each with an amount and a count |
| `VaultChip({tone, children})` / `VaultBadge({count})` | A status word, and the pulsing gold count |
| `VaultRange({current, path, params})` | The 7 / 30 / 90 days / All time switch: links, a segmented control, gold for the active one. Reuses `RangeKey` |
| `VaultGhost` | The loading screen, used by `loading.tsx` on each Vault route |

**CSS** goes in `app/(app)/admin/vault.css`, imported by the admin layout. It is not in `globals.css`, which has other work in flight. It holds:
- the tokens (`--vault-gold`, `--vault-gold-hi`, `--vault-ink`, `--vault-ground`);
- `.sx-vault-frame` (the double rule);
- `.sx-vault-num`, `.sx-vault-in` (the unlock entrance, using `--sx-reveal-delay`) and `.sx-vault-pill`;
- the sidebar, header, dock and menu re-tint under `.sx-ops.sx-vault`;
- table rows (`.sx-vault table` hairlines in gold at 13%);
- `prefers-reduced-motion` overrides.

## 6. Pages

### 6.1 Treasury: `/admin/finance` (a rewrite of `finance/page.tsx`)

Access is unchanged: `staffWithoutAccess` with SUPER_ADMIN, BTG_ADMIN and FINANCE. The live / demo branching
is kept: a signed-in staff role reads live, an outage is the error page, and fixtures are used only in the
existing demo case, laid out the same way and marked "Sample".

1. **Head:** "Treasury", the live pill and `VaultRange` (`?range=`, default 30d).
2. **Five tiles,** from `GET /finance/overview`:
   - **Money in** — marketplace orders paid in the period (by card or invoice), less refunds the
     card provider made — with a delta;
   - **Paid out**, with a delta;
   - **Owed to payees**;
   - **BTG kept**, with a delta. Its caption says "marketplace fees only" when `kept.campaignCommission` is absent;
   - **Needs you**: the total of ③, with `tone="you"` and the badge.
3. **Needs you:** four `VaultBox`es, each linking to its desk:
   - Payouts to approve (count · $ · oldest wait), linking to `/admin/payouts`;
   - Refunds to send, linking to `/admin/refunds`;
   - Disputes open ($ frozen), linking to `/admin/payments/disputes`;
   - Payment events held, linking to `/admin/payments/events`.

   A box with a count of 0 shows "All clear" in green, and stays visible.
4. **Money in vs. money out** (`VaultFlow`, about 2/3 width), with **`VaultDial` "Settled"** beside it:
   - The dial shows `settled.rate`, captioned "Of what athletes and properties earned, how much has been paid".
   - **BTG admins only** (when `invoices` is present) also get a second dial, "Collected" (the Zoho invoice rate), and the unpaid-invoice ageing by days past due, using `/earnings/reconciliation`'s own cut: not yet due / 1–30 / 31–60 / over 60 days, with over 60 in red.
   - Finance never sees either; that's the 2026-09-24 rule. Nothing is shown as 0 in their place: the panel is simply absent.
5. **Where the money went** (`VaultSplit`, from the ledger, captioned "Marketplace sales") beside **Athlete pay, step by step** (`VaultSteps`, from `earningsByState`).
6. **The books:** one panel with a `TabStrip` driven by `?tab=`:
   - `earnings` (the default): Athlete earnings, with search and a step filter. Keys `page`/`size`, plus `q` and `state` as today.
   - `campaigns`: By campaign, the reconciliation. Keys `rpage`/`rsize`.
   - `invoices`: Sponsor invoices. Keys `ipage`/`isize`.

   Only the active tab's list is fetched. The `campaigns` and `invoices` tabs exist only when the role can read them (BTG admin); for Finance the strip has a single tab. A tab's count is the list's `page.total`, or the overview's figure where one exists.

   The existing table columns and wording are kept, restyled in the Vault kit with `tone="vault"`.

### 6.2 The money desks: same behaviour, Vault presentation

Each keeps every read, write, server action, tab, URL key and test hook it has today. Only the presentation
changes:
- `PageHeader` / `OpsHeader` → `VaultHead`;
- cards → `VaultPanel`;
- the existing count tiles → `VaultTile`;
- tables → `PagedTable tone="vault"`;
- badges → `VaultChip`.

Tiles use only the counts the desk's API already returns (no new reads):

| Page | Tiles (from the existing read) |
|---|---|
| Payouts `/admin/payouts` | Waiting on BTG (count, `tone="you"`), Approved, Sending, Paid, Failed: `counts` from `GET /payouts` |
| A payout `/admin/payouts/[id]` | A summary strip (amount, payee, state, requested/decided dates), the rule checks as a checklist panel, the order lines as a table, and the Approve / Send back form in a gold-framed panel |
| Refunds `/admin/refunds` | To send (count + `openCents`, `tone="you"`) and Sent |
| Payment events `/admin/payments/events` | Waiting on BTG (`waitingOnBtg`, `tone="you"`), Applied, Held, Failed, Ignored/Deferred (`counts`) |
| Disputes `/admin/payments/disputes` | Open (`tone="you"`), Under review, Won, Lost (`counts`) |
| A dispute `/admin/payments/disputes/[id]` | A summary strip, the provider's decision panel, and the resolve form in a gold-framed panel |
| Commission `/admin/commission` (BTG admin only, as today) | Rules in force (count), Kinds covered: from the rules list. The rule editor is restyled |

Each Vault route gets a `loading.tsx` that renders `VaultGhost`, replacing or adding one where a route lacks it.

## 7. Backend: `GET /api/v1/finance/overview?range=7d|30d|90d|all` (default 30d)

**Files:**
- `domain/finance-overview.ts`, holding all the logic;
- `routes/v1/finance-overview.ts`, thin like `sponsor-overview.ts` and mounted in `routes/v1/index.ts`;
- a contract row in `contracts/registry.ts`;
- tests in `finance-overview.test.ts`.

**It reuses `windowFor` / `zeroFill`'s approach** from `sponsor-overview.ts`, exported or copied into a small shared helper, `domain/overview-window.ts`. It does not import across domains in a way that creates a cycle.

**Who may call it:**
- **It refuses** unless `scopeOf(actor,"ledgerEntry","read")` and `scopeOf(actor,"earning","read")` are both tenant-wide (`own-tenant`/`any`). That admits SUPER_ADMIN, BTG_ADMIN and FINANCE, and refuses everyone else with 403.
- **Every read is filtered by `whereFor(actor, <resource>, "read")`** for its own resource (`marketplaceOrder`, `ledgerEntry`, `earning`, `payout`, `refundDue`, `paymentDispute`, `paymentEvent`), as the first AND term, with the `tenant-scope:` comment the repo uses.

```ts
type FinanceOverview = {
  readAt: string;
  range: { key; from; to; days; bucket: "day" | "week" };
  moneyIn:  { cents: number; prev: number | null };   // marketplace orders paidAt in window, however paidVia (CARD or ZOHO_INVOICE): Σ totalCents − Σ PaymentRefund.amountCents created in window (PaymentRefund is the card provider's own refund; a RefundDue BTG sends by hand is not subtracted here — §9)
  paidOut:  { cents: number; prev: number | null };   // Σ Payout.amountCents state PAID, paidAt in window + Σ earning net amount, state PAID, paidAt in window
  owed:     { cents: number };                        // now, not windowed; athlete and property pay only: earnings PENDING|ELIGIBLE|APPROVED_FOR_PAYOUT (net) + Σ over each payee (partyTenantId, partyType, partyId) of max(0, its PROPERTY_PAYABLE|ATHLETE_PAYABLE credit − debit) over EVERY status, as payouts.ts balanceOf nets a payee's balance — PENDING (earned, sponsor not yet paid) and AVAILABLE credits count, a paid payout's PAID debit takes it off, a returned payout's AVAILABLE credit puts it back, and a reversed booking with its REVERSAL mirror (both REVERSED) nets to zero. Per payee, never tenant-wide: a refund after a payout leaves one payee below zero, which must not cut what others are owed. REFERRAL_PAYABLE (no payee balance; not settled by a payout) and RESERVE_HELD (nobody's until released into a payable) are left out on purpose
  owedBack: { cents: number };                        // now, not windowed; informational: Σ over each payee of |min(0, payable balance)| — what payees owe BACK after a refund that followed a payout; never netted into owed
  kept:     { cents: number; prev: number | null; campaignCommission?: number }; // ledger PLATFORM_REVENUE + MANAGEMENT_REVENUE (credit − debit) created in window; campaignCommission is LIFETIME (Σ sell price − every earning raised, earning-books campaignCommission), only when canReadField allows the sell price (same gate /earnings/summary uses for `sell`; FINANCE has it)
  series:   { day: string; inCents: number; outCents: number }[]; // zero-filled, the same definitions as moneyIn / paidOut, by bucket
  split:    { athletes; properties; platform; management; processing; referral; reserve: number }; // the window's SALES only: ledger credit − debit by account over BOOKING journals and BOOKING reversals (REVERSAL with journalId ending `:booking:reversal`) created in window. PAYOUT and RESERVE_RELEASE journals move money after the sale and are left out — and so is a release's reversal (`…:release:reversal`), which reverseOrder also posts as REVERSAL
  settled:  { paidCents: number; owedCents: number; rate: number | null }; // rate is a 0..1 FRACTION = windowed paidOut / (windowed paidOut + owed now), clamped to 0..1; null when both are 0
  earningsByState: Record<EarningState, { count: number; amount: number }>; // earning-books earningTotalsByState — the same call /earnings/summary makes; the route refuses (403) a caller without earning.amount rather than send amounts as 0
  needsYou: {
    payouts:  { count: number; cents: number; oldestAt: string | null }; // waiting on BTG: the rule GET /payouts uses for its waiting tab + Failed with waitingOn BTG
    refunds:  { count: number; cents: number; oldestAt: string | null }; // RefundDue OPEN
    disputes: { count: number; cents: number };                          // payment-exceptions OPEN_DISPUTE (OPEN | UNDER_REVIEW)
    events:   { count: number };                                         // payment-events WAITING_ON_BTG — the same filter GET /payment-events counts as waitingOnBtg
  };
  invoices?: { invoicedCents: number; collectedCents: number; rate: number | null; aging: number[] }; // ONLY when rightsOf(actor).seeInvoices; exactly reconciliationTotals() — rate is a WHOLE PERCENT (0..100, unlike settled.rate), aging = [not yet due, 1–30, 31–60, >60 days late]
};
```

**Rules:**
- **The earnings net amount and the needs-you rules are imported from the domain modules that already compute them.** They are not re-derived, so the Treasury and each desk cannot disagree: `earningTotalsByState`, `campaignSell` and `campaignCommission` (earning-books.ts, also behind `/earnings/summary`), `waitingOnWhere("BTG")` (payout-auto.ts), `OPEN_DISPUTE` (payment-exceptions.ts), `WAITING_ON_BTG` (payment-events.ts).
- **Provider refunds** (`PaymentRefund`, no policy resource of its own) are read at the `marketplaceOrder` read scope on their own `tenantId`: `any` → every tenant, `own-tenant` → the actor's, anything else → nothing.
- **"All time" starts** at the earliest money row in scope: a paid order, payout or earning, a provider refund, or a ledger entry (a BOOKING is written at contract time, before payment).
- `prev` is the previous equal window, and is `null` for `all`.
- **Weekly buckets past 120 days,** as on the sponsor overview.
- **A hidden figure is omitted, never sent as 0.**
- **The read is audited** if `financial-audit-coverage.test.ts` requires it: add it to that test's read-only list.

**Tests,** with backend fixture ids prefixed per file (memory `backend-test-ids-unique`). The file needs a database, so it runs on the embedded-postgres setup (memory `test-db-without-docker`). It covers:
- 403 for SALES, CAMPAIGN_MGR, NETWORK_MGR, an athlete and a sponsor admin;
- FINANCE gets the payload with no `invoices`; BTG_ADMIN gets `invoices`;
- the tenant scope: another tenant's orders, ledger and payouts are never counted;
- the money-in, paid-out, owed and kept arithmetic on seeded rows;
- `prev` for 30d and `null` for `all`;
- the series is zero-filled and sums to the totals;
- the needs-you counts match what the desks' own reads count;
- the ledger seeded as ledger.ts posts it (balanced journals in its id format and statuses: a reserve release, a reversed pair, a booked-released-reversed line, the PAYOUT journal behind a paid payout, a payout return): `owed` drops by the paid payout and rises on its return, `split` stays sales-only (a release's reversal included);
- a refund after one payee's payout does not cut what others are owed; it shows as `owedBack`;
- 7d / 90d, and an `all` window over 120 days (weekly) opened by a booking or a refund;
- SUPER_ADMIN counting both tenants; FINANCE's `campaignCommission`;
- over HTTP: the default 30d, range parsing, 403 for SALES.

**Frontend helper:** `lib/finance-overview-live.ts`, with the type, `RANGES` and the formatting helpers, plus a unit test.

## 8. Verification

- **Frontend:** `tsc`, `eslint` and `vitest` clean. Unit tests for:
  - `isVaultPath`;
  - `isFinanceOnly` and the Finance-only nav and dock;
  - `finance-overview-live` helpers;
  - the pagination `vault` tone.
- **Backend:** `tsc` and `eslint` clean; the new test file and the touched suites pass on the embedded-postgres setup.
- **`npm run build`** in a detached worktree (memory `build-in-detached-worktree`), never into the live `next dev`.
- **Browser walk** on the live dev servers, at 1440 and 390:
  - as the QA finance user: lands on Treasury; every Vault route; no console errors; no horizontal scroll; the tiles match `/finance/overview`; the pager works top and bottom;
  - as the QA admin: Mission Control on `/admin`, and the Vault on the money desks;
  - with reduced motion on.

## 9. Out of scope

- Restyling Analytics, the Audit log or Integrations for BTG admins: they stay on Mission Control. (Finance
  no longer sees them — see §2's follow-up — and Splits and Campaigns are on the Vault for a Finance-only
  viewer.)
- A separate `/finance` URL space.
- New write actions.
- Zoho changes.
- Showing invoices to Finance.
- Netting `RefundDue` (refunds BTG sends by hand, e.g. a bank transfer or cheque order) out
  of **Money in**: today only `PaymentRefund` (the card provider's own refund) is subtracted.
  A hand-sent refund of a card-paid order still reduces what the sponsor is owed, but not yet
  what the Treasury counts as having come in this period — a follow-up decision, not a bug.

## 10. Bookkeeping

- **Tracker:** add a row for P1-ART-25 in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (a fractional `Order` after P1-ART-24), and extend the Dashboard ranges by hand. See CLAUDE.md.
- **Team log:** `Memory/2026-10-12/finance-vault.md`.
- **Auto-memory:** update `portal-stage-identities` with the Vault (the fourth look).

## 11. Restructure (2026-10-12, owner): a real `/finance` portal; admin untouched

**What changed.** The owner rejected the Vault living inside `/admin`. Their words: "why are the routes in admin? … if you do this, the admin visual design would change also", and "btg admin still have the finance without the redesign". This supersedes §2.

- **New portal `/finance`.** `app/(app)/finance/`, `PortalShell portal="finance" stage="vault"`, the label "Finance Portal", and `vault.css` imported by the finance layout.
  - `server/portal.ts` admits **FINANCE only**. FINANCE is removed from the admin portal's list, so a Finance user signing in lands on `/finance`, and an `/admin/…` link sends them to their own portal.
  - BTG admins do not use `/finance`.
- **Routes:**

  | Route | Was |
  |---|---|
  | `/finance` | Treasury |
  | `/finance/payouts`, `/finance/payouts/[id]` | |
  | `/finance/refunds` | |
  | `/finance/payment-events` | |
  | `/finance/disputes`, `/finance/disputes/[id]` | |
  | `/finance/splits` | NEXT revenue splits |

  They are the Vault pages built in this branch, moved, with every internal link and `revalidatePath` pointing into `/finance`.
  - The nav lives in `lib/finance-nav.ts` (with its dock), grouped: Treasury; Money (Payouts, Refunds, Payment events, Disputes); NEXT (Splits).
  - Commission stays BTG-admin only, in admin.
  - Campaigns is not in the Finance portal for now.
- **Admin is exactly as before this branch.** The money desks, the old Finance workspace page, Commission and its components, NEXT Splits, `not-in-role` and the admin nav labels are restored to their `feature/P1-ART-24-mobile-dock` versions.
  - The Vault switch inside admin is removed: `StageRoot` toggling, `vaultOn`, the `.sx-when-*` words and the Finance-only nav/redirect.
- **Kept from this branch:**
  - `GET /finance/overview` and the backend refactors;
  - the `ADMIN_ACCESS` entries that hide desks a role's API refuses;
  - the Network page showing network managers what they can read;
  - the `vault` pager tone, the kit and the shared helpers.

  None of these changes how admin looks.

### 11.1 As built (the `/finance` portal half)
- **Access.** `server/portal.ts` has a `finance` portal admitting `FINANCE` only, placed right after `admin`, so a FINANCE + BTG_ADMIN (or + Sales, campaign or network manager) account still lands on `/admin`. A Finance-only user signing in lands on `/finance`; `/admin/…` and `/portal` forward them there. `proxy.ts` protects no prefixes (the layouts do), so nothing changed there. `tests/portal-routing.test.ts` pins this.
- **Shell.** `PortalShell` gains `portal="finance"` (label "Finance Portal", watermark FINANCE, the admin-toned accent that the Vault re-pins to gold) and `stage="vault"`: the root carries `sx-ops sx-vault`, the column is the ops `sx-stage` with `VaultGround` only, no theme toggle, and the dock and phone menu are the ops ones (`data-stage="ops"`), re-skinned through `<body>`. `StagePortals` splits its class string, so `<body>` gets both `sx-ops` and `sx-vault`.
  - Removed: `StageRoot` (`stage-root.tsx`), the `vault` prop and `StageWord` / `.sx-when-*`, the Vault props on the dock and menu, and `ops-stage.tsx`'s `sx-ops-ground` class. The shell's diff against `feature/P1-ART-24-mobile-dock` is only the finance additions.
  - `lib/vault-routes.ts` stays for now, only because `lib/admin-nav.ts` (`mayUseVault`) still imports it; it goes with that file in the admin restore.
- **`vault.css`** moved to `app/(app)/finance/vault.css`, imported by the finance layout only. `[data-vault]` selectors became `.sx-vault`; the `.sx-when-*` words and the ops-ground hiding are gone; the re-skin of the shared ops kit stays.
- **Layout.** `app/(app)/finance/layout.tsx`, nav and dock from `lib/finance-nav.ts`: Treasury on top; Money (Disputes, Payment events, Payouts, Refunds to send, A to Z); NEXT (Splits). Dock: Treasury, Payouts, Refunds, Disputes. A portal `error.tsx` (a Vault panel) and `loading.tsx` (`VaultGhost`).
- **Pages.** The Treasury is `finance/(treasury)/` (a route group, so its own five-tile loading screen does not stand in for the other desks'). The desks are `finance/payouts` (+ `[id]`), `finance/refunds`, `finance/payment-events`, `finance/disputes` (+ `[id]`) and `finance/splits`, each with its own `actions.ts` revalidating `/finance/…`, against the same endpoints.
  - No `staffWithoutAccess` / `NotInRole` in the copies: the portal admits FINANCE only. A 403 from the API shows `finance/refused.tsx` ("Not in your role", back to the Treasury).
  - The one `/admin` string left is `revalidatePath("/admin/marketplace")` after a payout retry: a cache key for BTG admin's console, not a link.
- **Shared pieces.** `server/next-editions.ts` (was `admin/next/live.ts`, which now re-exports it) and `components/next-heading.tsx` (`NextHeading`, `EditionSwitcher`; `admin/next/editions/live-editions.tsx` re-exports them). The desk components take their server action as a prop, defaulting to admin's: `MarkRefunded send`, `ResolveEvent resolve`, `TakeForReview review`, `ResolveDispute resolve`, `SplitLockControl save`. `PayoutDecision` / `PayoutRetry` already took theirs.
