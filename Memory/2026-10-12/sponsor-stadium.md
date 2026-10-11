# 2026-10-12 (work started 2026-10-11)

## HeckerCreatives — P1-ART-23: the sponsor portal on "the Stadium Board" (Code review)

The owner asked: "visual redesign the sponsor dashboard pages, all of its pages, make it the same as the admin and athlete but … a distinction between those 3 … the table … pagination based on our rules and memory … this is a dashboard so statistics is what they want to see … wow factor", and then added "make sure to design it user friendly and non tech friendly".
- Direction: the owner picked **A · Stadium Board** in the visual companion, over Portfolio and Brand Studio.
- Branch: `feature/P1-ART-23-sponsor-stadium`, stacked on `feature/P1-ART-22-athlete-arena`.
- Spec: `docs/superpowers/specs/2026-10-11-sponsor-stadium-design.md`.
- Plan: `docs/superpowers/plans/2026-10-11-sponsor-stadium.md`.

### Identity: three portals, three looks
- **Admin** = Mission Control (steel, cyan, chamfered corners).
- **Athlete** = the Arena (blue, speed bars, lanes).
- **Sponsor** = the **Stadium Board**: the LED boards around a stadium, where a sponsor's logo appears.
  - Always dark, so the theme toggle is hidden, as on admin.
  - Sponsor orange used as light. Panels have 6px corners, a hairline border and faint scan-lines. Numbers glow.
  - A scrolling ticker of live facts on the dashboard; it has a pause button and stops when the user prefers reduced motion.
  - A dot-matrix band along the bottom edge. Panels "power on" (flick on) as they enter.
  - Anything that needs the sponsor's action gets a filled, pulsing badge. Orange already means "the brand", so colour alone can't signal it.
- Never put chamfers or corner brackets on the sponsor side, and never put speed bars or lanes on it.

### Plain words for non-technical sponsors
- `lib/sponsor-words.ts` turns every status into plain words, and pages never print a raw status name. Examples: "Needs your OK", "Being matched by BTG", "Ready to pay", "Checked with Instagram", "Reported by the athlete".
- A new request is DRAFT in the backend, but the sponsor sees "Being matched by BTG", because "Draft" read as "not sent".
- Every unclear number has a "?" that explains it in one sentence. The "Updated" time is shown in the viewer's own time zone.
- Empty states say what to do next.
- Section numbers (§), CPM, Phase 1, Blueprint and field names have been removed from everything a sponsor can see.

### Kit
- CSS: `app/(app)/sponsor/stadium.css`, imported by the sponsor layout. It is deliberately not in `globals.css`, which had other work in flight.
- Stage components: `components/stadium-stage.tsx`, `stadium-hint.tsx`, `stadium-trend.tsx` (a smooth curve that never overshoots), `stadium-ticker.tsx`, `stadium-time.tsx` and `stadium-hold-countdown.tsx`.
  - `stadium-time.tsx` provides `StadiumUpdated` and `StadiumDate`. Pass `utc` to `StadiumDate` for date-only values, so the day never moves.
- Extracted from `activity-explorer.tsx`: `components/date-range-picker.tsx` and `lib/day-range.ts`, the house calendar range popover. It is now reusable with a `tone` prop.
- `components/sponsor-campaign-table.tsx` is shared by the dashboard and the Campaigns page.
- Number formatting: `lib/format-count.ts` (`usd0` added for whole dollars; commerce figures keep their cents).
- Other helpers: `lib/amount.ts` and `lib/sponsor-nav.ts`.
- The sponsor layout now passes `stage="stadium"` to `PortalShell`.

### Pages
- The dashboard has, in order:
  - the ticker;
  - five numbers, each compared with the previous period;
  - the trend chart (7, 30 or 90 days, or all time);
  - "Needs you";
  - the fan journey, cost per 1,000 people reached, and posts delivered;
  - top athletes and the cities where fans redeemed;
  - a server-paged campaigns table.
- Campaigns has a "Posts to review" tab (`?review=1`). Requests is a new route, `/sponsor/requests`.
- The one-campaign page shows a status bar, then the posts waiting for the sponsor's OK, then a paged list of posts (`ppage`/`psize`).
- Results has the trend chart, a "How sure are we?" panel (each source shown separately, never added together), the fan journey and the athletes.
- Packages (the price list is a fixed set, so it is paged in the browser with the house pager) and the job page.
- The Shop has instant filters and the calendar range picker, is server-paged, and adds to the cart without leaving the page.
- Cart and checkout show a step bar and a countdown on the hold.
- Orders has tabs with counts, server paging and a step bar.
- Sidebar: Dashboard, then Campaigns, Marketplace and Account. Analytics, Rewards and Leads were removed; they never had pages.

### API
In every case, a request without `?page` gets exactly the same response as before.
- New `GET /sponsor/overview?range=&campaignId=` (`domain/sponsor-overview.ts`):
  - **Who can call it:** sponsors and tenant-wide BTG staff only. Athletes and property managers get 403.
  - **Money:** shown only to roles that can read it, using the same two-step check as `/campaigns/summary`. A hidden figure is left out, never sent as 0.
  - **Reach:** "people reached" counts only VERIFIED_API and VERIFIED_MANUAL views. Other sources are reported next to it and never added in.
  - **Cost per 1,000:** uses the spend rule shared with the report, `sponsorSpendCents`: live orders plus NEXT ad slots.
- `GET /marketplace-orders`: paged, with plain-word tabs and their counts, plus a new `/summary`.
- `GET /marketplace/search`: paged in the database. The sponsor's brand restrictions are now part of the query (`restrictionHiddenWhere`).
- `GET /campaigns?review=true`.
- Test files: `sponsor-overview.test.ts`, `sponsor-lists.paged.test.ts` and `desk-lists.paged.test.ts` (review).
- `financial-audit-coverage.test.ts`: the two new order reads are on its read-only list.

### Verified
- **Frontend:** tsc and eslint are clean, and vitest passes 1294 tests.
- **Backend:** tsc and eslint are clean. All tests that don't need a database pass; 88 files need a database and couldn't run here.
- **Production build:** `npm run build` passes, run twice in a detached worktree; the last run was at `3792d3c`. The rimraf trap from the worktree teardown happened both times and was repaired.
- **Browser walk** on the live dev servers, signed in as the QA sponsor:
  - 14 routes at 1440 and 390, then a re-walk at 3792d3c;
  - no console errors, no horizontal scroll, no raw status names;
  - the tile numbers match `/sponsor/overview` and `/marketplace-orders/summary`;
  - with reduced motion on, the ticker stands still;
  - the shop's date picker is a calendar popover.
- **Review:** every task had its own spec and code-quality review, and the whole branch had a final review. All findings are fixed.

### Gotchas for whoever picks this up
- **Restart the API after backend changes.** The API on :4000 doesn't reload code. A process started as a background job in an agent session dies when that session ends, so start it through a detached `cmd.exe`.
- **Sign in on `localhost`, not `127.0.0.1`.** On `127.0.0.1` the sign-in loops, because the API only accepts session tokens from its allowed web origins.
- **The tsc trap.** A server page that imports a helper from a `"use client"` module passes tsc but fails at runtime ("Attempted to call … from the server"). The fix was `lib/amount.ts` and `lib/format-count.ts`.
- **Agents working in parallel share one git index.** Commit with `git commit -- <paths>`, never stash, and don't sweep in someone else's staged files.
- **Follow-up:** `ShopAddToCart` still uses native date inputs for its Starts/Ends fields. `e2e/marketplace-path.spec.ts` `.fill()`s them, so replacing them has to happen together with that spec.

### Tracker
- P1-ART-23 is Phase 1 row 300: Order 32.9999375, Code review, owner HeckerCreatives, 3 days.
- The autofilter, conditional formatting and Status validation now reach row 300. The Dashboard formulas already read up to row 400.
- Stage Progress has a new 2026-10-12 snapshot row: 278 done, 42 days left.
- The Google Sheet is updated by hand at the end of the day.
