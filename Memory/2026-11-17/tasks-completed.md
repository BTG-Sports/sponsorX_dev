# 2026-11-17 · tasks completed

## Staging kept level with main (rcfworks)

- **#446 deployed** (`fb8f0ea`, late on 2026-11-16): Jan's POL-FE-90…98 — sponsor shop, cart,
  checkout and orders; athlete sales, sale and payouts redesigns; Log out in the portal nav.
- **#448 deployed** (`486eefd`): Jan's POL-FE-99 Help & FAQ center (one per portal, under
  `/<portal>/help` — there is no top-level `/help`) and the POL-FE-100 `/contact` redesign.
- Both via `npm run deploy staging` after main's CI was green; api and web reported success.
  Smoke: `/`, `/next/schools`, `/contact`, `/login`, `/s/<code>` → 200; portal pages and
  `/<portal>/help` → 307 to `/login` when signed out. (`/sign-in` is a 404 — the app's sign-in
  page is `/login`.)
- `main_development` and `main` carry the same code; no other PRs were open.

## #449 (POL-101) — the lint failure fixed (rcfworks)

- **Cause:** CI's "typecheck · lint · unit · authz matrix" job failed at lint —
  `backend/src/contracts/student.ts:116`, `HIDDEN_CHARS`, held the invisible characters
  themselves (zero-width space, LRM/RLM, bidi embeddings/overrides/isolates, BOM), which
  `no-irregular-whitespace` rejects. Typecheck and unit tests never ran.
- **Fix (`7e7cbe71`):** the same class written as `\u` escapes. Checked the old and new
  pattern against U+200B, 200E, 200F, 202A–202E, 2060, 2066–2069, FEFF and a control
  character (all match), and `A` and the emoji joiner U+200D (neither matches).
- **Checked locally:** security scripts, secret scan, dependency audit, lint, both builds;
  backend 269 files / 3,874 tests, frontend 204 files / 2,380 tests. CI on `7e7cbe71`: all
  four checks green, e2e included. Ready to merge.

## Tracker

- No change needed from rcfworks: POL-BE-88 and POL-FE-89 were already moved to Done (and the
  2026-11-16 Stage Progress row appended) in Jan's tracker copy carried by #447 / #449.

## Next (rcfworks)

- Audit fix queue, item 5: the advisor desk (`/advisor`, `/advisor/review`) has no link in
  the admin menu (`frontend/src/lib/admin-nav.ts`). Plan first.
- Raise Jan's athlete-portal rows from the 2026-11-16 audit (guardian deliverable upload,
  a minor's always-failing buttons, the wizard's held message, offer → order back link and
  Stripe wording, "List it"). New polish numbers start at 105.
