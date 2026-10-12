# 2026-10-12

## HeckerCreatives — P1-ART-25: Finance on "the Vault" (Code review)

**The ask.** The owner wrote: "visual redesign the finance dashboard pages, all of its pages, make it the same as the admin, athlete, and sponsor but … a distinction between those 3 … the table … pagination based on our rules and memory … this is a dashboard so statistics is what they want to see … wow factor."

**Branch and documents.**
- Branch: `feature/P1-ART-25-finance-vault`, stacked on `feature/P1-ART-24-mobile-dock`.
- Spec: `docs/superpowers/specs/2026-10-12-finance-vault-design.md`.
- Plan: `docs/superpowers/plans/2026-10-12-finance-vault.md`.

### Decisions (taken in the visual companion)
- **Finance is a role, not a portal.** FINANCE is a role inside `/admin`; the RBAC Matrix gives it earnings, payouts, the ledger, refunds, disputes and payment events, but no invoices.
  - Before this work, a Finance user landed on the admin board with the parts they can't use removed.
  - The owner chose option 1: Finance gets its own home, like athlete and sponsor, with all URLs still under `/admin/…`.
- **Look: A · The Vault,** chosen over the Ledger and Money Flow.
  - Always dark. The ground is bank green (`#06100c`), with brushed-gold hairlines (`#d4b062` / `#f1dfa6`).
  - Banknote guilloché rosettes sit behind the page.
  - Panels have square, double-rule frames.
  - Numbers are engraved gold serif (Source Serif 4).
  - A dial gauge shows the share settled.
  - The "needs you" items are shown as deposit boxes.
- **Layout approved:**
  1. A title with a live pill and the 7 / 30 / 90 days / All time switch.
  2. Five money tiles.
  3. Four "needs you" boxes.
  4. Money in vs. money out, with the Settled dial.
  5. Where the money went, and athlete pay step by step.
  6. A tabbed, server-paged books table.

### Identity: four looks, never mixed
| Look | Portal |
|---|---|
| Mission Control | admin |
| the Arena | athlete |
| the Stadium Board | sponsor |
| **the Vault** | Finance's money desks inside admin |

Never put chamfers, brackets, scan-lines, lanes or speed bars on a Vault screen. Never put gold, guilloché or the dial anywhere else.

### How the switch works
- **Root class:** `components/stage-root.tsx` is a client island. On a money route it adds `sx-vault` and `data-vault` to the admin shell's root and to `<body>`. The money routes come from `lib/vault-routes.ts` `isVaultPath`: finance, payouts, refunds, payments and commission. The shell keeps `sx-ops`, and `app/(app)/admin/vault.css` re-tints it by re-setting the `--sx-*` tokens.
- **Dialogs:** dialogs portalled to `<body>` (the commission rule dialog, the order dialogs) pick up the look too.
- **Why on the client:** a layout does not re-render when you move between sibling routes.
- **Finance-only viewers:** `lib/admin-nav.ts` (`navFor` / `rootFor` / `dockFor`) handles anyone whose only admin role is FINANCE (`isFinanceOnly`). Their sidebar starts with Treasury instead of Dashboard. Their dock is Treasury, Payouts, Refunds and Disputes. `/admin` redirects them to `/admin/finance`, and their "not in your role" page links back to the Treasury.
- **For everyone else,** the Money group item is relabelled "Treasury".

### The kit
- **Components:** `components/vault-stage.tsx` mirrors the stadium kit. It has `VaultGround`, `VaultHead`, `VaultTiles` / `VaultTile`, `VaultBox`, `VaultPanel` / `VaultSection`, `VaultDial`, `VaultFlow` (client island, `vault-flow.tsx`), `VaultSplit`, `VaultSteps`, `VaultChip`, `VaultBadge`, `VaultRange` and `VaultGhost`.
- **Shared helpers:**
  - The curve and number helpers (`monotonePath`, `flowPaths`, `compact`) are pure functions in `lib/monotone-path.ts`, not in a `"use client"` file.
  - The sponsor chart's curve is pinned by a test to its output before the change.
  - `compact` pins `minimumFractionDigits: 0`. Without it, Node and the browser printed the axis labels differently ("$690.0" against "$690").
  - The pager, filters and date picker gained a `"vault"` tone.
  - `StadiumHint` gained `skin="vault"`.

### The pages
- **Treasury (`/admin/finance`):** the layout above.
  - **Tiles:** Money in, Paid out, Owed to payees, BTG kept (fees for the chosen period; lifetime campaign commission is shown separately), and Needs you.
  - **Needs-you boxes:** Payouts waiting on BTG, Refunds to send, Disputes unresolved and Payment events held.
  - **Admin-only:** the Collected dial and the invoice ageing appear only for BTG admins. Finance never sees invoices; that was the 2026-09-24 decision.
  - **Books tabs:** `?tab=earnings | campaigns | invoices`. Only the active tab's list is fetched, and each keeps its own page keys.
  - **Files:** split into `books.tsx`, `demo.ts` and `pieces.tsx`.
- **Money desks:** Payouts and one payout, Refunds, Payment events, Disputes and one dispute, and Commission.
  - Every desk keeps its reads, actions, tabs and URL keys.
  - Each now has Vault tiles built from its own counts, and every tile shows the same number as its tab.
  - The paragraph under each title moved into an "About this desk" "?" hint.
  - Each route has a `loading.tsx` that shows `VaultGhost`.

### API: `GET /api/v1/finance/overview?range=7d|30d|90d|all`
- **Code:** `domain/finance-overview.ts`. It is open to SUPER_ADMIN, BTG_ADMIN and FINANCE, and needs tenant-wide `ledgerEntry` and `earning` read.
- **Shared rules:** they moved into `domain/earning-books.ts` (`rightsOf`, `reconciliationTotals`, `earningTotalsByState`, `campaignSell`) and `domain/overview-window.ts`, and the existing routes now import them. It also reuses `waitingOnWhere("BTG")`, `WAITING_ON_BTG` and `OPEN_DISPUTE`.
- **What the figures mean:**
  - **Money in:** marketplace orders paid, less the refunds the card provider made. Refunds BTG sends by hand are not subtracted yet; that is a follow-up decision.
  - **Owed:** athlete earnings not yet paid, plus each payee's own positive payable balance.
    - The balance is worked out per payee, over all statuses. Otherwise payouts' PAID debits were missed, and one payee's claw-back reduced what everyone else was owed.
    - Claw-backs are reported separately as `owedBack`.
  - **Split:** counts sales journals only (bookings and their reversals).
  - **Invoices:** the `invoices` figures are present only for invoice readers. A hidden figure is left out, never sent as 0.
- **Tests:** `tests/finance-overview.test.ts` (18 tests) runs against a seeded database with two tenants, ledger journals shaped as `ledger.ts` posts them, and the route over HTTP.

### Verified
- **Frontend:** tsc and eslint are clean, and vitest passes 126 files / 1344 tests.
- **Backend:** tsc and eslint are clean. The overview, earnings, disputes, payment-events, ledger and payouts suites pass.
  - In the full backend run, under parallel load, some files timed out. Run on their own, they pass.
  - What's left are the three known Windows-only static checks (backslash paths and CRLF) in `payments-pii` and `security-hardening`.
- **Production build:** `npm run build` passes, run in a detached worktree at `aa5f8a1` (that is, before the last two fix commits; those passed tsc, eslint and the tests).
  - Teardown emptied `node_modules/rimraf` again, and it was restored (see the auto-memory note on worktree builds).
- **Browser walks:** run on the live dev servers as the QA admin and the QA Finance user, at 1440 and 390, for each page.
  - The final walk was at `880d68f`, after restarting the :4000 API.
  - **Finance:** `/admin` redirects to the Treasury, and Treasury leads the sidebar. There is one books tab, with no invoices dial or ageing. No hydration error. `/admin/audit` stays on Mission Control.
  - **Admin:** moving client-side from `/admin` to Payouts switches the Vault on, and coming back switches it off. All three books tabs appear, with the invoice band. The commission dialog and the phone menu sheet show gold on green.
  - **Layout and motion:** no horizontal scroll at 390. With reduced motion, the final values show at once.
  - **The only console message:** React dev-mode timing noise ("OperationsBoardPage cannot have a negative time stamp") on the instant `/admin` redirects. It is not a hydration error.
  - **Count-ups:** a tile read while its number is still counting up shows a smaller value than the API. Compare after the count-up finishes.
- **Reviews:** every task got a spec review and a code-quality review, and the whole branch got a final review. All findings are fixed.

### Follow-ups (not in this branch)
- Decide whether refunds sent by hand should come off "Money in".
- Analytics, the Audit log, Integrations and NEXT stay on Mission Control, even for Finance users.
- The repo has no jsdom, so the `<body>` class switch has no DOM test; the browser walks cover it.
