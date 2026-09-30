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

## Raised: payout screens (2S5-FE-03, 2S5-FE-04) — rcfworks, via Claude

The walkthrough's steps 5, 14 and 15 had no screens. Agreed with the user:
- `2S5-FE-03` · Athlete and team payout screens (FE, 4d, Blocked on 2S5-BE-04 and
  the designs) — payout-account set-up first: the page says a Stripe account is
  needed and links out to Stripe; then available / held / paid out, Request payout,
  and a history to "Paid, confirmed by the payment provider" plus an email.
  Stripe is named only for the account set-up; transactions stay hidden.
- `2S5-FE-04` · BTG payout approval screen (FE, 3d, Blocked on 2S5-BE-05).
- `2S5-BE-04` corrected to Ready (its prerequisite 2S5-BE-02 is Done).
- The backend (2S5-BE-04/05) will use a stand-in payment provider on staging only
  (the user agreed); production moves no money until Stripe is connected.
- Claude Design prompt for all the payout screens (A–D plus 0a–0c account set-up)
  given to the user.

Phase 2 now 71 tasks · 282 person-days (Sprint 5: 13 · 56). Tracker rows 73–74,
ranges extended to row 74.
