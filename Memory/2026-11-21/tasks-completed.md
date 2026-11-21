# 2026-11-21 · tasks completed

## POL-FE-116 · The rules wording on Confirmations gets its closing quotation mark (infinex1) — Code review

- **What:** step 1 of `/athlete/confirmations` ("Your own rules") showed a large opening quotation mark and no closing one, so on a PC the box looked cut off and testers tried to scroll it. The box is not meant to scroll: it grows to fit the whole statement. It now ends with a matching closing mark, bottom-right, and the bottom padding is wider so the mark sits under the last line instead of on it.
- **Where:** `frontend/src/app/(app)/athlete/confirmations/confirmations.css`, `.sx-cw-quote` and the new `.sx-cw-quote::after`. CSS only.
- **Step 2 (Content Collaboration Agreement) was checked and already scrolls:** its reader is capped at `min(28rem, 55vh)` and scrolls inside. In Chrome a mouse wheel scrolled a mock of it 600px at 1280px wide, and a touch swipe scrolled it 500px on an iPhone 13 viewport.
- **Checked:** rendered the box at 1280px and on an iPhone 13; the closing mark clears the last line on both. `npm run build` (frontend) passes. Frontend tests: 2,522 pass, 2 fail in `tests/deal-chat.test.ts`. Those two fail the same way on `main_development` without this change (the live-socket work of 2026-11-19), so they are not caused by it.
- **Not done:** the tracker row for `POL-FE-116`. This machine has no Python, so the xlsx could not be edited safely; add the row (Polish sheet, Code review, infinex1, 2026-11-21) and extend the ranges by hand.
