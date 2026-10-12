# 2026-10-13

## HeckerCreatives — P1-ART-25: admin restored; the Vault lives only in `/finance` (Code review)

The restructure the owner asked for on 2026-10-12 ("btg admin still have the finance without the redesign") is finished. The `/finance` half landed yesterday. Today the admin half went back to `feature/P1-ART-24-mobile-dock`. The full story is in `Memory/2026-10-12/finance-vault.md` (section "Restructure"), and in spec §11 / §11.1.

- **Back to base:**
  - `admin/finance` (the old Finance workspace; `books.tsx`, `demo.ts`, `pieces.tsx` and `loading.tsx` deleted);
  - payouts (+ `[id]`), refunds, payment events, disputes (+ `[id]`), commission and NEXT splits, with every `loading.tsx` this branch added deleted;
  - `admin/(board)/page.tsx` (no Finance redirect), `not-in-role.tsx`, the commission components, `place-dialog.tsx` and `lib/commission-live.ts`.
- **Nav.** It stays in `lib/admin-nav.ts`, and `ADMIN_NAV` is byte-identical to base's array: "Finance", not "Treasury". `navFor` is the old role filter plus `stampGroupIcons`. The layout passes `rootHref="/admin"` and `dock={ADMIN_DOCK}`, with no `vault`.
- **Removed:** `isFinanceOnly`, `rootFor`, `dockFor`, `FINANCE_DOCK`, `mayUseVault`, `lib/vault-routes.ts`, and their tests, including `vault-routes.test.ts` and `not-in-role.test.ts`.
- **Kept:**
  - the `ADMIN_ACCESS` desk gating (briefs, analytics, audit, integrations, network and NEXT);
  - network's partial view for network managers;
  - the `next/live.ts` and `live-editions.tsx` re-export shims.
- **e2e.** The admin assertions in `admin-payments-desks` (base's four tiles) and `loop-p7-earnings-report` (the "Finance" heading, one page) are back to base. The `/finance` halves are kept.
- **Verified:**
  - tsc fully clean, eslint clean, vitest 127 files / 1346 tests;
  - browser walk (`admin-restored-walk.cjs`): QA admin's six money desks are `sx-ops` only, with no `sx-vault`, "ADMIN PORTAL", zero Vault gold, and cyan + chamfers like `/admin/campaigns`;
  - QA Finance: `/admin…` forwards to `/finance`, and the Treasury is on the Vault.
