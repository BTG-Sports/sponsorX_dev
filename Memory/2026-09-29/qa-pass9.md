# QA pass 9 — static review, official e2e, scale and a11y probes (HeckerCreatives, 2026-09-29)

Passes [7](qa-pass7.md) and [8](qa-pass8.md) were black-box. This pass added
three angles:
1. a **static code review** of the whole working-tree diff;
2. the **team's official e2e suites** as regression;
3. **dynamic probes** nobody had run: paging at 1,000 rows, cursor tampering,
   GET /campaigns/:id by role, two-tab concurrent save, unicode and huge
   input, back/forward URL state, and a **real axe WCAG 2.1 AA scan** (axe-core
   4.10.2 injected from jsDelivr; it isn't a project dependency).

The static review reported 10 candidate issues, and each was verified before
action. 5 were real and fixed, 1 was fixed as a refinement, 2 were declined
with reasons, and 2 are recorded as notes.

## Findings, verified

| # | Sev | Origin | Finding → action |
|---|---|---|---|
| F-16 | **High** | new | **The public school page named minors.** `publicProperty` listed anyone `requiresGuardian` called adult, and that function treats unknown age as adult (correct for a gate that checks the band upstream). FEATURED athletes are created with no birth date or age band, and QA Northside High's public page named both of its featured high-schoolers. **Fixed:** name only *confirmed* adults (a birth date 18+ years ago, or the `18_PLUS` band); everyone else is counted in `notListed` (renamed from `minorsNotListed`) with neutral copy. The live page now names 0 and says "2 athletes … named here only once they're confirmed as adults". |
| F-17 | **High** | new | **Raw NUL bytes in three source files.** Pass 7's F-1 fix put a literal 0x00, not the `\0` escape, into `featured.ts`, `property.ts` and `student.ts` (a heredoc turned the escape into the byte). git treated two of the files as **binary**: diffs hidden in review, and no textual merge. **Fixed:** replaced with the escape. `featured.ts` and `student.ts` now diff as +2 lines each, and a sweep of every changed file finds no other NUL. |
| F-18 | Medium | old, reachable via new UI | **An athlete's socials save erased BTG's checked numbers.** `recordSocials` replaces the whole set as `SELF_REPORTED` with `avgViews` null, so editing one account downgraded a `VERIFIED_MANUAL` row on another. **Fixed:** a row sent back unchanged (platform, handle and followers, with no new avgViews) keeps its source, avgViews and capturedAt; a changed row takes the caller's own label, so an athlete still can't mint a verified label. 3 new tests. The two-tab re-test kept the verified Instagram row at 3,400 avgViews. |
| F-19 | Medium | new | **The row-id cursor truncated silently and was a cross-tenant existence oracle.** A deleted cursor row returned `[]` with `hasMore=false`. A cursor set to another tenant's campaign id was honoured as a position, so rows vs no rows revealed whether a foreign id existed. **Fixed:** an opaque keyset cursor, `base64url(startDate\|id)`, applied as a WHERE; no row is ever looked up. A tampered cursor is a 400 `bad_cursor`. Re-test: 1,000 rows (300 with the same start date) in 10 pages, all unique, with the cursor row deleted mid-paging; a foreign and a fake cursor return identical results. |
| F-20 | Medium | new | **A brief timeout said "nothing was sent"**, but the API may already have committed the Inquiry and the Lead, so the retry the copy invited filed a duplicate. **Fixed:** the timeout went from 8s to 15s. A timeout now says "we can't confirm your brief arrived — it may have; wait before sending again". Only a refused connection says "nothing was sent". |
| F-21 | Low | new | **The public roster read was unbounded** (every FEATURED/ACTIVE athlete, per anonymous hit) and truncated at 60 silently. **Fixed:** `take: 500` plus a `_count`, and a `rosterTruncated` flag. |
| F-22 | Low | new | **`saveSocials` could still throw on a `null` element** (`s.followers`). **Fixed** with `s?.followers`. |
| F-23 | Low | new | **The sponsor campaign detail made its two independent reads in series.** **Fixed** with `Promise.all`. |
| — | declined | — | *"Serve suspended properties?"*: `listingAccessAt` is the **Phase 2** onboarding field and is null on every Phase 1 property. Requiring it would 404 them all. Revisit when Phase 2 suspension lands. |
| — | declined | — | *"One param middleware for NUL"*: that is what pass 7's first attempt did, and it overrode the reward routes' stable `unknown_token` code (`qa6.fixes` P6-BE-03). Per-lookup guards plus the `22021` → 400 safety net keep every route's code. |
| — | note | new | **Last write wins on concurrent socials saves.** Two tabs saving at once both say "Saved." and the later one wins; the earlier edit is gone. Rare for one athlete; a version check would fix it. |
| — | note | new | **999 campaigns render in about 4.4s** on the dev server: 10 sequential API pages plus rendering. Fine for Phase 1 volumes. An aggregate endpoint is the fix if portfolios grow. |

## Not defects (verified)

- **axe colour-contrast (43–48 "serious" nodes on four live screens).** The
  pairs were 1.05–1.9:1, text almost the colour of the background. They were
  elements caught mid fade-in (`sx-animate`). With reduced motion and a 2.5s
  settle, every screen scanned has **0 violations**: live and fixture athlete
  home, live and fixture sponsor detail, the admin board, the property portal,
  the brief (steps 1 and received), the public property page, the profile
  editor, the sponsor Campaigns list, and the untouched earnings and dashboard.
- **An athlete gets 403 on `GET /campaigns/:id` for a campaign they're on.**
  This is consistent: the matrix gives ATHLETE no campaign read (`GET /campaigns`
  returns 200 with 0 rows), and no athlete screen calls it.

## Regression

- **Official e2e** (`npx playwright test`, all specs: the P3–P7 loops, public,
  redeem): **15 passed / 7 skipped / 0 failed**, both before and after this
  pass's fixes. That matches the team's recorded baseline.
- Backend vitest **1720/1720**, including new tests for keyset paging, tampered
  cursors, confirmed-adult rostering and socials preservation.
- Frontend vitest **391/391**, eslint clean, `npm run build` green.
- Back/forward: returning from a campaign detail keeps `?status=COMPLETED` and
  its filtered list.
- Unicode round-trips through brief → Inquiry: "Zoë 李", "O'Brien-Nuñez",
  "São Paulo / القاهرة", emoji. A 3,000-character category is cut to fit, and
  an emoji social handle saves.
