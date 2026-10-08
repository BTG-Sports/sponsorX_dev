# The marketplace desk (P1-ART-20)

**Date:** 2026-10-07 · **Raised by:** programme owner ("same in
/admin/marketplace, the structure looks shit") · **Scope:**
`/admin/marketplace` (2S7-FE-02) — structure and visuals; the reads, the
inline listing actions and the retry are unchanged.

## What was wrong

Six stat tiles across the top, then six full-width cards stacked down the
page — property applications, listings (with its three tabs), orders,
failed payments, payout problems, disputes — each a heading, a two-line
hint and "nothing here". The same number said twice. Two screens to learn
that four queues are empty, and the one row that needed a person sat
between them.

## The desk

1. **The queue strip.** Five tiles in one row (3 across on a tablet, 2 on a
   phone), one per queue, in the order BTG works them: property
   applications, listings, orders awaiting approval, failed payments,
   payout problems. Each shows its count, one line of context ("oldest
   waiting 7 days", "0 held · 1 live", "latest failed 2 h ago", "none
   stuck") and a tone — blue for work waiting, orange when something is
   past 48 hours or money failed, quiet when clear. **A tile is the
   navigation**: pressing it shows that queue's rows under the strip. The
   desk opens on the first queue with work in it.
2. **One panel.** The picked queue's rows, as a stage table (P1-FE-31) for
   applications, orders, failed payments and payout problems — each with
   its waiting time, its reason and its action in the last column (Review,
   Decide, Open, Retry). The listings queue keeps its inline-action rows
   (approve, request changes, reject; pause, end, put back live) under its
   three tabs, which switch in place too; the live listings' own 25-a-page
   pager stays (the API's `LiveListingsQuery`).
3. **Disputes** are one line under the strip, not a card: they arrive with
   2S5-BE-03 and aren't counted yet.

The pick lives in the URL (`?queue=`, written in place with no scroll
jump), so a queue is a link. The listing emails' `?listings=held#listing-…`
and `?listings=auto#listing-…` links still land on the listings queue, on
the right tab, at the right row.

## Reads

Unchanged in substance: every queue is read in one parallel pass by the
server page, so switching queues reads nothing. Two reads now use the
house pager so the tile's count is the API's, not the length of a capped
list: `/onboarding?state=PENDING_REVIEW&page=1&size=12` and
`/payouts?state=FAILED&waitingOn=BTG&page=1&size=12` (the panel shows the
oldest / first 12 and links to the full desk for the rest). Orders held
for approval and failed payments are whole, small exception lists, as
before.

## Verified

tsc, eslint, unit tests (`queueKey`, `firstBusyQueue`); a Playwright pass
as BTG_ADMIN at 1440 and 390 — the five tiles, a tile switching the panel
and writing `?queue=`, the listings tabs, an old `?listings=auto` link
landing on the right tab, no console error, no overflow.

## 2S7-FE-02 follow-up (2026-10-08) — the exceptions on other desks

rcfworks' review of the console listed what it still lacked: disputes
(and the payout money they freeze), payment events held or failed for BTG,
refunds to send, delivery issues, payouts awaiting approval. A second row
of five **link tiles** under the queue strip now carries each one — the
API's own count (`GET /disputes`, `/payment-events`, `/refunds`,
`/delivery-issues`, `/payouts`, one row each, counts only) and a link to
the desk that actions it — and the stale "disputes aren't counted yet"
line is gone. `linkTiles(counts)` in `lib/marketplace-ops-live.ts` is pure
and unit-tested; the walk reads the same five endpoints as the signed-in
admin and asserts each tile's number and link.
