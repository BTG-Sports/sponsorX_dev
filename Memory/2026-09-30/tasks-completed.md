# 2026-09-30 — tasks completed

## Raised: independent athletes can't sell (2S3-BE-05, 2S3-FE-02) — rcfworks, via Claude

Found while reviewing the walkthrough: only a property manager can put an item on
sale, so an athlete with no team can create inventory items that can never reach
the marketplace, and nothing tells them. The user called this dangerous — not all
athletes have a team — and chose **Option A**: independent athletes list their own
items, approved by BTG under the same rules, keeping the whole share.

- `2S3-BE-05` · Independent athletes list their own items (BE, 5d, Ready) —
  listings stop assuming a property; search, cart, orders, availability and the
  ledger split handle an athlete-owned listing; roster athletes still go through
  their team.
- `2S3-FE-02` · Listing screen for independent athletes (FE, 3d, Blocked on BE-05).

Added to `documentation/SponsorX-Phase2-Marketplace-Commerce.md` (Sprint 3 now
8 tasks · 34 person-days; Phase 2 69 · 275) and to the committed tracker (Phase 2
rows 71–72, Orders 27.5 / 28.5; Dashboard, autofilter, conditional formatting and
the Status list extended to row 72). Not built yet — the build plan goes to the
user first. The walkthrough presentation is left as-is for now, at the user's
request.

## Also today
- Branch brought level with main_development (the landing-page P1-ART-09/10/11 work).
- Staging and production redeployed on `faceeb5` (main had not auto-deployed).
- Presenter's guide `SponsorX-Presenter-Guide.xlsx` (run of show, script, the
  money split with live formulas, gaps, Q&A, logins) — in the user's Downloads;
  the Google Drive connector was disconnected, so the user uploads it.
- Walkthrough presentation: step 2 as the athlete's step-by-step application,
  step 6 as how Riley creates his clinic (6a–6c), step 7 split into 7a–7c.
