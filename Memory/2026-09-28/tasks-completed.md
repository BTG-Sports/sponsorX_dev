# 2026-09-28 — frontend wiring run (HeckerCreatives)

Scope for the day: every Ready / In-progress **frontend** task in Phase 1
Stages 4–8, wired to the existing `/api/v1`. Not touched: the Code-review
queue (built already), `P2-FE-01` (rcfworks), and the NEXT screens (P1-ART-08
design gate, P9 wiring).

**Local stack note.** Docker was down at session start; `infra:up`, then
`prisma migrate deploy` (it had two unapplied NEXT migrations). Signed-in
walks use the one-shot Clerk sign-in-token technique from `P3-FE-02`
(`POST /v1/sign_in_tokens` → `/login?__clerk_ticket=`), as the QA users
already linked in the dev DB (`qa.p3fe03.athlete@…` is athlete
`seed_ath_adult`).

## `P4-FE-04` — the athlete invitation inbox, wired → Code review

- **Backend half** (thin read, same shape as P3-FE-02's): `GET /invitations`
  in `routes/v1/campaigns.ts`, scoped by `whereFor(actor, "invitation",
  "read")` — the athlete's own; BTG tenant-wide. Newest first, 100 cap.
  Returns the job code (`NilJob.id` *is* "SX-03"), job/campaign/sponsor
  names and ISO timestamps. `offered` is the athlete's own pay and belongs
  in their inbox; no sponsor role has an `invitation` read. Registry row
  added. `tests/invitations.list.test.ts` (2).
- **Frontend**: `lib/invitations-live.ts` — one `InboxRow` shape for fixtures
  *and* Postgres so the demo and the live inbox are the same island. Live rows
  carry **null** deliverable count / usage rights / exclusivity: those terms
  live on the Campaign Order BTG drafts after acceptance, and the card says
  so instead of inventing them. A lapsed-but-unswept invite shows "expired",
  not negative time. 11 tests.
- **The §21 asymmetry is the UI**: INVITED shows "Open offer" (records
  INVITED→VIEWED, stamps `viewedAt`) and "Decline without opening"; VIEWED
  shows Accept (arms → "Confirm — accept", ACCEPTED is terminal) and Decline.
  The backend refuses INVITED→ACCEPTED, and the card never offers it.
- `respondToInvite` server action (whitelists VIEWED/ACCEPTED/DECLINED,
  errors as values). Live answers live in their own map — no Undo.
- Accepting an **invitation** is not signing, so the counsel block (B4) on
  Campaign Order acceptance doesn't apply; the notice is demo-only now.
- `Button` gained an optional `onClick` (client callers only).
- **Walk, 24/24**: real campaign + sponsor render, fixture names absent, all
  five state badges, open→VIEWED and accept/decline/decline-unopened all
  land in Postgres with audit rows, reload shows the truth, `?demo=` still
  fixtures, 0px overflow at 390px, zero console errors.
- Dev DB: campaign `qa_p4fe04_cmp` with six `qa_inv_*` invites (now decided).

## `P4-FE-02` + `P4-FE-03` — Matching Studio on a real brief, and sending → Code review

- **Scope decision (user, 2026-09-28):** frontend tasks add the *thin read*
  they need, P3-FE-02-style — scoped by `whereFor`, select-limited, route-
  tested, registry row — and keep business rules in the domain.
- **Backend reads.** `GET /briefs` (scoped, newest first, `?state=`) and
  `GET /briefs/:id` (package, campaign, the package's lines resolved to the
  job catalogue — sell side only — and, for a caller who reads invitations,
  the campaign's invites; `offered` only where §7.1 allows
  `athleteRate.amount`). `eligibleAthletes` now also selects `city`, the
  latest §14 score, summed reach + provenance, and the *current* rate per job
  (highest version) — score and rates **absent, not null** for any role §7
  denies, decided once per call from `canReadField` + `can`. 10 route tests.
- **UNITS TRAP, worth knowing.** The NIL job catalogue (`NilJob` bands and
  floors) is **whole dollars** — `domain/nil-jobs.ts` says so and P4-FE-01
  renders it that way — while the schema comment on `NilJob` says "integer
  cents" (stale). Athlete rates and invitation `offered` are cents.
  `lib/matching-live.ts` converts catalogue ×100 once. Someone should fix the
  schema comment.
- **Frontend.** The Studio no longer reads module constants: `MatchData`
  (brief, jobs, roster, conflicts, live, sendBlocked) arrives by prop and
  context (`components/matching-data.tsx`), fixtures by default, so the demo
  and the live desk are one island. A §7 package becomes ONE job row with
  `athleteCountMax` slots; each pick becomes one invitation per package line
  (cost = rate × qty, sell = the tier's catalogue floor × qty).
  Honesty rules: unscored → dashed ring / "—", never 0 (`NoScoreRing` moved
  to `score-ring.tsx`, shared with the applications desk); unassessed
  factors → "not assessed"; a missing rate keeps the row visible but
  unpickable ("No rate on file", margin "—"); conflicted athletes never
  arrive (query-excluded, §26) and the footnote says so; an open invite
  blocks a re-send, EXPIRED/DECLINED don't. Tiers gain Anchor and Untiered.
- **Send (P4-FE-03).** `sendInvitations` server action: an APPROVED brief
  becomes its campaign on first send (`POST /briefs/:id/campaign`), then
  `POST /campaigns/:id/invitations` per line; per-athlete outcomes, no Undo,
  page refresh reads each athlete's invite state back ("Invited — awaiting").
  An unapproved brief shows why and disables Send. The margin-exception copy
  no longer claims an audit record in live mode — nothing records it; the
  Order's 1.4× check is what binds.
- **Walk, 30/30** as a seeded BTG_ADMIN at 1440 and 390: real brief, both
  exclusions, no-rate + unscored honesty, 9 slots for LOCAL_BLITZ (5–9),
  current rate version used ($100 not $90), ack gating, campaign created and
  brief → CAMPAIGN_CREATED, invites 10000/18000 cents in Postgres, roster
  reads the state back, qualified brief blocked, `?demo=` intact, 0px
  overflow, zero console errors. Frontend 184/184, lint + tsc clean.
- Dev DB: `qa_brf_match` (now CAMPAIGN_CREATED), `qa_brf_qualified`,
  athletes `qa_m_*`. Reseed: scratch `seed-match.sql` (idempotent).

## `P4-FE-05` — sponsor dashboard on real campaigns → Code review

- **Backend read.** `GET /campaigns` (scoped by `whereFor(campaign)`, newest
  first): state, window, package (via brief), distinct athletes and
  delivered/total deliverables over live orders (CANCELLED / REJECTED
  excluded). Money is column-gated and **absent** when denied: `contracted`
  (needs `campaign.value` + `campaignOrder.sellPrice`), `budget`
  (`campaign.budget`), `invoiced` / `paid` from the Zoho Books mirror (also
  needs `invoice` read; void excluded). 4 route tests incl. the athlete side
  getting no money keys and no invoice select.
- **Frontend.** `lib/sponsor-live.ts` (pure; 9 tests): pacing = delivery
  progress vs elapsed window, flagged only for ACTIVE campaigns with
  something to deliver (15% slack); window labels; totals that refuse to sum
  a column any row withheld. Live dashboard shows Active campaigns · Spend
  (contracted) · Invoiced + paid (Zoho Books) · Athletes, then the portfolio.
  **The fixture analytics (views hero, engagement, funnel, return, top
  athletes, trust meter) are not shown beside real campaigns** — a card
  points to each campaign's report, which is P7-FE-03's. Portfolio rows
  carry `views: null` and the list renders no views line for them.
- **Walk, 22/22** as a new Clerk dev user `qa.fe.sponsor@example.com`
  (User `qa_u_sponsor`, SPONSOR_ADMIN of `seed_spn_1`): 4 campaigns, 2 active,
  $560 contracted (cancelled order excluded), $560 invoiced (void excluded),
  $385 paid, 3 athletes, another sponsor's campaign absent, pacing-behind
  flagged, 0px overflow at 390, zero console errors.
- **Not mine, flagged:** every portal layout passes fixture identity to the
  shell (`sponsor.name` → "Welcome back Under Armour" for Bowie Auto Group).
  That is portal-wide chrome, P2-FE-01's (rcfworks) — left alone.

## `P5-FE-01` — the athlete reads and accepts the real Campaign Order → Code review

- **Where agreement text lives now.** `Agreement` only ever stored a version
  and a hash — no text anywhere. Templates are now files:
  `backend/agreements/<KIND>.v<n>.txt`, reviewed in git. `CAMPAIGN_ORDER.v1`
  is **DRAFT wording** (first line says so; G-05 / P0-LEG-02 still open) —
  per `agreement-hash.ts`, every acceptance of draft text is void and gets
  re-collected when counsel issues v2. Issue a version with
  `npm run agreement:register -w @sponsorx/backend -- <tenantId> <KIND> <n>`
  (hashes the file with the acceptance canonicalisation, writes the row,
  idempotent; refuses a changed file under an existing version — bump it).
  **Staging/prod need this run once per tenant before any order can be
  accepted.**
- **Reads.** `GET /orders/:id` (scoped): frozen terms, job, campaign +
  sponsor, guardian readiness (same `guardianReadiness` rule acceptOrder
  uses), latest effective CAMPAIGN_ORDER agreement **with body only if the
  file still hashes to the row** (`domain/agreement-text.ts`), and the
  acceptance record. `compensation` / `sellPrice` field-gated by §7.1.
  `GET /invitations` rows now carry `order: {id,state}|null` (non-DRAFT
  orders, caller's own scope). 7 + 2 route tests.
- **Frontend.** Live `/athlete/orders/[id]` renders the body verbatim in a
  `<pre>`; `acceptOrderAction` hashes the exact string rendered with the
  frontend copy of the canonicalisation — **pinned byte-for-byte to the
  backend's by `tests/order-live.test.ts`**, including the real v1 file.
  Read-then-accept; 409 (text changed / already answered) offers "Reload the
  current version". Guardian card for minors (D1: guardian reads, athlete
  signs). Inbox: accepted invite → "Campaign Order ready to sign →".
  A fixture id or someone else's order → "Order not found" for a live user.
- **Two backend defects found and fixed on the way:**
  1. `acceptAgreementIn` refused a second acceptance of the same version by
     the same signer — right for one-time terms, fatal for Campaign Orders:
     an athlete's 2nd order under v1 could never be accepted. New
     `opts.oncePerSigner` (default true); `acceptOrder` passes false, its
     SENT-only guard in the same transaction prevents double-accepting one
     order. Tests: `agreement.once.test.ts` + order.defects.
  2. Acceptance evidence recorded `req.ip` / `user-agent` — i.e. the Next
     server and Node, since the call is server-to-server. New
     `clientUserAgent()` beside `clientIp()`, both edge-key-trusted; the web
     side sends `x-sponsorx-client-ua` via `edgeHeadersFrom(headers(),
     {signer:true})`. Both acceptance routes (orders, agreements) use them.
     **`SPONSORX_EDGE_KEY` is not in either `.env.example`** and is unset
     locally — without it the API falls back to the socket (safe, but the
     evidence is the server's). Set it on both Railway services.
- **Walk, 21/21 + 2**: inbox links both accepted invites; $400 pay shown,
  $600 sponsor price never; draft body verbatim; accept gated on "I've read";
  ACCEPTED with the issued hash on the acceptance, deliverables + PENDING
  earning created in the same transaction; text changed mid-read → 409,
  nothing written, reload shows "can't be shown"; another athlete's order
  refused; `?demo=` intact; 0px at 390; then the athlete's **second** order
  under v1 accepted (two acceptances, one per order).

## `P5-FE-02` + `P5-FE-03` — deliverable calendar, and upload / proof → Code review

- **Reads** (`routes/v1/deliverables.ts`): `GET /deliverables` (scoped,
  soonest due first, `?state=A,B`, `?campaignId=`), `GET /deliverables/:id`
  (with creative versions — never keys), `GET /deliverables/:id/assets/
  :version/url` (short-lived signed read of the private bucket, audited by
  `presignPrivateDownload`, only for a caller who reads the asset). 9 tests.
  **Revisions are derived, not stored**: `requestRevision` sends a
  deliverable back to DRAFT_SUBMITTED (same as a first submission) with the
  reason on its audit row, so "open revision" = latest requestRevision audit
  newer than the latest upload, while still DRAFT_SUBMITTED. A new version
  answers it; no schema change.
- **P8-SEC-02 held**: `tenant-isolation.test.ts` sweeps every documented
  route as every tenant-B actor against a real DB — my new reads are all
  refused. It needed one `PARAM_FOR` entry (`assets: "1"`) for the
  `{version}` path param; nothing else.
- **P5-FE-02** — new `/athlete/deliverables` (nav: Deliverables): month grid
  (Monday-first, UTC day keys so a due date never slides a day west of UTC;
  dots = whose move / overdue / done) + agenda grouped by day, tabs To do /
  In review / Done / All, day pick narrows, all URL-synced. Appearances
  (SX-05) marked. Stat tiles: your move, overdue (only while it's yours),
  revisions, in review. Demo = fixture deliverables dated around today.
- **P5-FE-03** — `/athlete/deliverables/[id]`: §21-exact actions — upload
  while NOT_STARTED (also submits), upload a new version while a revision is
  open, "Mark as published" with the live URL once APPROVED, otherwise whose
  move it is. `DeliverableUpload`: presign → XHR PUT straight to R2 with real
  progress → record → submit, **each step retryable on its own**; a dropped
  connection keeps the file ("Retry upload", fresh presign); a PUT that
  landed but wasn't recorded is kept in sessionStorage so even a reload can
  "Finish recording it" instead of re-uploading. 2 GB cap, image/video/PDF.
- **Walk, 25/25** (one check's regex fixed after, behaviour verified): real
  rows, counts, revision text, appearance chip, overdue, tabs, day filter in
  the URL; **network cut mid-upload (Playwright abort) → nothing recorded →
  Retry → v1 recorded, NOT_STARTED→DRAFT_SUBMITTED, server-chosen key,
  grants audited**; revision answered by v2 (banner gone, state kept for
  BTG); bad publish link refused client-side, good one → PUBLISHED with URL;
  another athlete's deliverable → not-found; 0px overflow at 390; zero
  console errors. Frontend 216/216; backend 1370/1370.
- **Ops note:** R2 needs a CORS rule on the private bucket allowing PUT from
  the web origin (MinIO allows any origin, so local hides this).

## `P5-FE-04` — content approval workspace on the real pipeline → Code review

- `/admin/approvals` for a signed-in BTG desk (SUPER_ADMIN / BTG_ADMIN /
  CAMPAIGN_MGR): `GET /deliverables?state=` everything past NOT_STARTED,
  translated by `lib/approvals-live.ts` into the desk's existing item shape
  (one island, both modes). Honest sources for the two fields the fixtures
  invent: `assetKind` = **the job's format** (CreativeAsset stores no content
  type), `waitingHours` = since the latest upload, only while on a review
  desk. An open revision (API-derived) shows as the desk's REVISION state.
- The drawer's `LiveDecisionBar` offers exactly §21's moves
  (`liveMoves`, test-pinned against deliverable-state.ts): DRAFT_SUBMITTED →
  Start BTG review; BTG_REVIEW → Send to sponsor / Approve / Request
  revision; SPONSOR_REVIEW → Approve (sponsor signed off) / Request revision;
  PUBLISHED → Verify publication, next to the athlete's live link (the
  publication proof). Revision needs a reason — sent to the athlete
  verbatim. No Undo. `approvalAction` + `assetLink` server actions.
- "Open vN" → `GET /deliverables/:id/assets/:v/url` → audited, short-lived
  signed URL on the private bucket (window opened synchronously first so
  it isn't popup-blocked).
- Hero counts come from real rows; the fixture median turnaround and
  approval rate are hidden in live mode (no endpoint answers them, §22).
- **Walk, 21/22** (the miss was my probe: `?demo=1` isn't a demo state, so
  live is correct): full DRAFT→BTG→SPONSOR→APPROVED walk in Postgres; signed
  v1 URL with X-Amz-Expires on `sponsorx-private`, download grant audited;
  empty revision refused; revision reason on the audit row and shown to the
  athlete word for word; open revision shows its reason and no decision;
  PUBLISHED → VERIFIED from the link; 0px at 390; zero console errors.
- **Gap flagged on the board:** there is no sponsor-side content approval
  screen. BTG may approve SPONSOR_REVIEW items on the sponsor's behalf (the
  matrix allows it), but §21's "sponsor's final say" has no sponsor UI yet —
  probably a missing task, not something to build silently.

## `P5-FE-05` — campaign operations dashboard on real data → Code review

- **Read:** `GET /campaigns/:id/ops` (scoped; registry row): per athlete, the
  least-settled non-DRAFT order (or, before one exists, the latest invite
  with its job and — §7.1-gated — offer), delivered (PUBLISHED/VERIFIED) of
  planned, overdue (past due and not VERIFIED — delivery-health's rule),
  in-review, next due, VERIFIED views only. Campaign health is
  `assessDelivery` itself, so this board and `/operations/delivery-health`
  can't disagree. Invites are only selected for callers who read them:
  `whereFor` THROWS on a denied resource (it doesn't match-nothing), which
  first 403'd a sponsor's whole board. `GET /campaigns` now carries
  `briefId`. 7 tests; tenant-isolation still green.
- **`/admin/campaigns/[id]`** live: header, hero from real numbers (%
  verified, overdue, verified reach vs frozen projection with the 70% line,
  who needs attention) — the fixture views chart is not shown (daily reach is
  P7-FE-04's). `RosterOps` takes live rows (`lib/ops-live.ts`, 15 tests):
  order ACCEPTED/ACTIVE/COMPLETED → accepted; SENT → awaiting; REJECTED /
  CANCELLED → replacement needed; invite-only INVITED/VIEWED → awaiting,
  DECLINED/EXPIRED → replacement, ACCEPTED → **"Order not drafted"**; real
  overdue work outranks every flag.
- **Scope addition (noted on the board):** the live drawer's one write is
  **Draft & send Campaign Order** after an accepted invite — pay prefilled
  from the invite, sponsor price with the 1.4× floor hint, usage rights,
  exclusivity, due date → `POST /campaigns/:id/orders` then transition SENT
  (`draftAndSendOrder`; a draft that lands but fails to send is retried as a
  send, not a second draft). This step had an endpoint and **no screen** —
  without it no live order could ever reach P5-FE-01. Other rows link to
  where the work is (Matching Studio for replacements, the content desk for
  overdue/in-review work); **no demo reminder/nudge buttons on a live
  board** — nothing would send.
- **`/admin/campaigns`** live: groups Needs attention / Delivering /
  Staffing / Closed from `GET /campaigns` + `/operations/delivery-health`;
  staffing cards open `match?brief=<briefId>`, the rest their ops board.
  Fixed a 40px overflow at 390 (grid item needed `min-w-0` for a long name).
- **Walk, 24/24** as BTG_ADMIN: list groups + badges + staffing link; ops
  board rows and flags; cancelled → Matching link, no demo actions; accepted
  invite → "Order not drafted" → draft with $120 refused by the API's floor
  (nothing created) → $210 → order SENT with 10000/21000 cents on SX-02 →
  roster reads "Awaiting acceptance"; unknown id → not-found; `?demo=empty`
  intact; 0px at 390 on both pages. Frontend 244/244, backend 1377/1377.

## `P6-FE-01` — reward creator / desk on real rewards → **In progress** (+ raised `P6-BE-08`)

- **Reads** (`routes/v1/rewards.ts`): `GET /rewards` (scoped; four-event
  funnel per reward from `RewardEvent` grouped by token × type, **within the
  caller's own `rewardEvent` scope** — an athlete may read their own token's
  events, never another athlete's on the same reward; plus the central
  consent line), `GET /rewards/:id` (tokens with QR readiness; the token
  STRING — the fan's claim link — only for roles that write rewards),
  `GET /reward-tokens/:id/qr-url` (audited signed read of the worker's PNG;
  refused until it exists). 8 tests; tenant sweep got a `reward-tokens`
  mapping and is green.
  **Not mine, flagged:** the pre-existing `rewardFunnel()` behind
  `GET /rewards/:id/funnel` groups every token on a reward, so an athlete
  with `rewardEvent: own` would get other athletes' counts (aggregate only).
  Same one-line fix as above if the owner agrees.
- **Frontend:** `LiveRewardsDesk` (the fixture desk's idiom on real data):
  summary + per-card funnels, tabs/search, reward-state.ts moves (go live /
  pause / resume / end / archive), "QR codes" panel per reward — athlete,
  fan link `/r/<token>`, Download QR (signed PNG, popup-safe) — and a
  creator that persists **what the model holds**: campaign (with signed
  athletes), offer, terms, expiry (presets → instants, default = campaign
  end), single-use, one token per picked athlete, optional go-live. The fan
  consent line is shown read-only with its version — per-reward consent
  would break the version the claim records (P6-SEC-01).
- **Why still In progress:** acceptance asks for eligibility, limits and a
  landing page to be configurable and persist; `Reward` has no columns for
  them. Raised **`P6-BE-08`** (Order 128.5, Ready, unblocks P6-FE-01) rather
  than faking fields. Board: autofilter/CF/DV extended to row 254; Phase 1
  header now 250 tasks · 603 person-days.
- **Walk, 21/21** (one timing miss re-verified by probe): create → ACTIVE
  with two tokens (only signed athletes offered), expiry = campaign end,
  worker rendered both PNGs, signed PNG from `sponsorx-private` (grant
  audited), fan page shows the offer and its SCAN lands on the card,
  pause/resume/end in Postgres, 0px at 390, zero console errors.
- **ENV GOTCHA — the `worker` container is stale.** Its image was built
  2026-09-23 10:06 +08, before `generate-qr` landed (15:00 +08), so it never
  dispatched `reward.generateQr` (outbox rows sat with `dispatchedAt` null).
  I stopped it and ran `npm run dev:worker` from source. **Rebuild it:**
  `docker compose build worker && docker compose up -d worker`.
- `P6-ART-01` (printable QR artwork, "Where: Design tool") left alone — a
  design task, not frontend wiring; the QR panel's download is its input.

## `P6-FE-03` + `P7-FE-04` — the analytics story on real aggregates → Code review

- **Read:** `GET /operations/analytics?days=7|30|90`
  (`domain/reward-analytics.ts`, tenant-wide via `assertTenantWide`,
  recomputed from rows every time — the P7-DATA-02 rule): the four-event
  funnel in the window and the previous window; CLAIM/REDEEM per UTC day
  (empty days kept); SCAN locations (resolved city/region); offers ranked by
  redemption; per athlete — token SCAN/CLAIM/REDEEM, MetricDaily views and
  engagements **split by provenance** (verified / self-reported /
  estimated; ATTRIBUTED isn't reach), tracking-link clicks, reliability
  (due in window AND published by end of due day), revision rate (revision
  audits per deliverable with submitted work), latest §14 score or null.
  9 tests.
- **Frontend:** `lib/analytics-live.ts` (7 tests) maps each range into the
  story's dataset. The page fetches all three ranges up front so the pills
  stay instant. Honesty: deltas vs the previous window, `"new"` when there
  was none (and the Kpi no longer prints "+-12%" — negative is red, no
  forced plus); **no attributed-revenue source exists**, so live swaps that
  KPI for "Claimed, not yet used" (claims − redeemed); each athlete's reach
  uses ONE provenance (verified > self-reported > estimated) with its label
  and engagement computed inside it; unscored → dashed ring; chapter 5 gains
  Clicks / On time / Revisions columns in live. Every insight sentence now
  has a words-not-NaN branch for empty data (fixtures unaffected — P1-FE-14's
  30d spot checks still hold). The PDF/XLSX export (P1-FE-15) is **hidden in
  live mode**: its report model is fixture-built and would print numbers
  that aren't these.
- **Walk, 18/18** (the reach check re-verified after scrolling — CountUp only
  animates in view): 30d scans / funnel / unredeemed from Postgres,
  Laurel/Bowie from resolved scans, offer with sponsor, QUINN.PREM 7,300
  verified views (the 9,999 self-reported excluded), 12 clicks, JORDAN.REED
  1,800 labelled self-reported, 7d pill switches window + URL, no NaN,
  export hidden, 0px at 390, zero console errors.
- **Design question, not mine (flag to backend):** `reward_single_redeem` is a
  partial unique index on REDEEM **per token**, and tokens are **one per
  athlete** — so a single-use reward can be redeemed once per athlete in
  total, not once per fan. Probably wants a per-claim/per-fan key. Seeds
  hit it immediately.

## `P7-FE-01` + `P7-FE-02` — athlete earnings and the finance workspace → Code review

- **Read:** `GET /earnings` (scoped; newest payout first) — status only,
  and there is no bank or tax field in the shape to leak. Column rights
  decided once per call: amounts need `earning.amount` (denied to sponsors,
  CAMPAIGN_MGR, SALES); `sellPrice` + `commission` (sell − net) also need
  `campaignOrder.sellPrice`; the per-campaign **reconciliation** (contracted
  vs invoiced vs collected, beside earnings raised and paid out, with the
  Zoho invoice rows incl. issued/due dates) also needs `invoice` read.
  Invoices are scoped **through the campaign** (the invoice mirror has no
  scope builder — `whereFor(invoice)` throws ScopeNotImplemented; this is
  what `invoicesForCampaign` does too). 6 tests.
- **Matrix decision surfaced:** the RBAC matrix (`invoice`, 2026-09-24)
  denies **FINANCE** the invoice read on purpose. So the reconciliation and
  invoice panels render for BTG_ADMIN; for FINANCE they say why. P7-FE-02's
  acceptance names "Zoho invoice references" — flagged on the board for a
  decision, not coded around.
- **Not coded around either:** payout actions (approve / mark paid) stay
  **blocked** on the §37 payment policy; the live workspace is read-only and
  keeps the gate notice. (A `financeMoves` helper was drafted and removed.)
- **Pre-existing, flagged:** `GET /earnings/:id` (`readEarning`) returns a
  breakdown built on `order.sellPrice` to ANY earning reader, the athlete
  included — the commission leak §7.1 forbids. Not touched (not mine).
- **P7-FE-01 live:** career = what signed orders are worth minus disputes,
  "already paid" stated beside it; journey buckets and HELD strip from real
  states; trend = payouts by the month PAID; the fixture on-time rate and
  payout date have no source here → replaced by "N of M deliverables
  verified"; export hidden on live numbers.
- **P7-FE-02 live:** Invoiced / Collected (Zoho Books), owed to athletes,
  held+disputed; aging of what's still owed by days past due; Σ by state;
  reconciliation with "$X not invoiced" / "matches" / "over contract"; every
  earning with athlete net, sponsor price and commission.
- **Walk, 29/30** (the miss was my own arithmetic — owed is $1,990): athlete
  sees $1,800 career, only their rows, no sponsor price/commission, no
  bank/tax field; BTG admin sees commission $115, PAY-QA-001, "$2,700 not
  invoiced", a matching campaign, INV-QA-1 + a void invoice, 31–60 aging;
  a new Clerk dev user `qa.fe.finance@example.com` (FINANCE) sees earnings
  and commission but no invoices, with the reason. 0px at 390, no errors.

## `P7-FE-03` — the sponsor ROI report on the real report → Code review

- No backend change: `GET /campaigns/:id/report` (`assembleSponsorReport`)
  already answers screen 12. `lib/report-live.ts` (5 tests) keeps §22's
  layers apart: reach per provenance **side by side, never summed**
  (verified always shown, even at 0; self-reported / estimated only when
  non-zero), engagement rate within one layer; media value **ESTIMATED with
  its stated basis**; tracked clicks **ATTRIBUTED**; the fan funnel and
  redemption measured from our own events. Roster delivery, published posts
  (with links and clicks), observations, edition placements when present.
- Fixture composition charts (format / platform / geo splits, benchmarks,
  timeline) have no source in the report yet → not drawn in live; export
  hidden on live numbers. Another sponsor's campaign → not-found.
- **Walk, 16/16** as the sponsor QA user: 7,300 verified and 11,799
  self-reported as separate layers (never 19,099), media value estimated,
  12 clicks attributed, real funnel, no athlete pay, 0px at 390.

## `P7-FE-05` — admin network analytics → Code review

- New `/admin/network` (nav: Network), no backend change — three existing
  tenant-wide reads: `/operations/network-metrics` (active athletes,
  participation, utilisation, earnings raised/paid, average pay and sell →
  gross margin), `/operations/job-economics` (per job: orders, avg sell, avg
  athlete pay, margin, margin rate — **per job by the backend's own design**:
  a package's margin is the sum of its lines; rates under 1 − 1/1.4 are
  flagged red), and `/operations/delivery-health` as the
  **marketplace-learning** read: each live campaign's frozen reach
  projection (EST, P7-DATA-03) against verified reach, shown as-is with the
  70% line. Live-only (it was never a fixture screen); a refused role sees
  why.
- Walk 10/10 as BTG_ADMIN (one check was a no-op, not counted as evidence);
  0px at 390, zero console errors. Dev DB: `qa_ord_1.projectedImpressions`
  set to 20000 for the learning row.

## `P8-FE-01` + `P8-FE-02` — integration health and the audit log → Code review

- **`GET /operations/integration-health`** (`domain/integration-health.ts`,
  BTG only via `webhookDelivery` tenant-wide read): dependencies (the
  /health/ready checks), Zoho sync per record type (linked-to-Zoho counts +
  last `lastSyncAt`; **Athlete has no `lastSyncAt` column** — reported as
  "not tracked for contacts", not guessed), inbound webhook deliveries for 7
  days by source/status with recent failures — **payloads never returned**,
  and queue health: undispatched outbox by name with oldest age, pg-boss jobs
  by name × state and recent failures (message only, tenant-filtered via
  `data->>'tenantId'`; tolerates a DB without pg-boss). 7 tests.
- **`/admin/integrations`** (nav: Integrations): a verdict that names real
  problems only (dependency down, deliveries rejected, jobs failed, outbox
  waiting > 15 min) — a queued Zoho sync is healthy, per the Zoho boundary.
  Walk surfaced the real ones in dev: **21 failed `notify.email` jobs** (no
  email provider chosen — an open decision in CLAUDE.md) and the stale
  worker image's un-dispatched outbox rows.
- **`GET /audit-log`** (new `routes/v1/audit.ts`, read-only, `auditLog`
  read = BTG_ADMIN / SUPER_ADMIN): filters by entity, record id, actor
  (`system` = null actor) and action prefix; keyset paging (at, id); facets
  for the filter menus; actors resolved to email + roles. 6 tests.
- **`/admin/audit`** (nav: Audit log): `AuditExplorer` — filters apply the
  moment they change and live in the URL (a record's whole history, or one
  person's, is a link); each row opens to a field-level before → after;
  "Load more" walks the cursor. Clicking a row's record chip filters to that
  record. (Fixed an invalid nested `<button>` before it shipped.)
- Both screens are live-only (never fixture screens); FINANCE is refused and
  told why. Walk 20/20 (integrations overflow at 390 fixed with `min-w-0` on
  the grid cards). Test infra touched: `openapi.coverage.test.ts` file list
  gained `audit`; `tenant-scope.static` needed the literal `where: tenant` /
  `tenant-scope:` notes it greps for.

## P9-FE-03 · P9-FE-04 · P9-FE-05 — NEXT page map, inventory ledger, revenue splits on real data → Code review

Owner HeckerCreatives. Thin reads added under the "thin reads" scope rule
(scoped, select-limited, tested, registry rows); no business rule moved.

- **Backend (routes/v1/editions.ts):**
  - `GET /editions`: editions in `whereFor(edition)` scope, with inventory
    folded to counts, committed = sum of *sold* values (never rack), and the
    digital rights gap counted via `rightsGap` (only for `editionAsset`
    readers).
  - `GET /editions/:id/ledger`: `listSlots` plus the page parsed from the
    slot code (`P04-QTR` → 4). The buyer (campaign + sponsor) is included
    **only when `can(campaign, read)`**, so a student sees "taken", never who.
  - `GET /editions/:id/sale-candidates`: `adSlot` write only. Lists DRAFT
    campaigns whose brief package promises positions, each marked
    `unavailable` for kinds with no open slot left (and
    `holdsPlacements`). It is a menu only; the sale still re-checks
    everything in its own transaction.
  - 7 tests in `editions.read.test.ts`. Tenant-isolation and the
    coverage/static suites pass.
- **Frontend:**
  - `lib/editions-live.ts` (12 tests) translates the ledger into the
    existing flatplan and ledger shapes. The schema has **no RESERVED state
    and no page titles**, so live slots are SOLD/OPEN only, and pages with
    no position are drawn as editorial.
  - The flatplan takes the slot's own rack price (`rackCents`) and a
    nullable back cover.
  - The ledger widens to PRESENTING and "Map →" keeps `?edition=`.
- **Screens:**
  - `/admin/next/editions`, `/inventory` and `/splits` have live branches
    via `admin/next/live.ts` (`?edition=` switcher; `?demo=` keeps
    fixtures).
  - The page map has **Book a campaign** (`bookCampaignAction` →
    `POST /editions/:id/sales`). A package needing the sold back cover shows
    "No back cover left" and has no button, which meets the done-when.
  - The ledger has **Add a slot** (BTG only; `POST /editions/:id/slots`;
    a second back cover is refused with Postgres's reason).
  - Splits read RevenueSplit only. Before close the screen says "No split
    until the edition closes" rather than projecting one. A regional
    edition's SCHOOL share reads "School pools".
- **Walk:** 31/31 on seeded `qa_nx_*` data: booked the back cover, the rival
  package was blocked, the slot was added, the duplicate back cover was
  refused, the closed edition showed its four payees, no overflow at 390px,
  zero console errors. Seed SQL is in the session scratchpad (not
  committed).
- **Flagged — matrix gap, not coded around:**
  - **FINANCE** holds `revenueSplit` read but **no `edition` read** (§15.3),
    so it cannot list editions to reach the splits screen. It sees an
    "outside your role's scope" state.
  - **SALES** holds `adSlot` write but no `edition` read, so
    `listSlots` / `sellCampaignSlots` refuse SALES outright.
  - Both need a policy decision in the RBAC matrix.

## P9-FE-09 — rights ledger and clearance queue on ContentRight → Code review

- **`GET /editions/:id/rights-ledger`** (`routes/v1/rights.ts`): every asset
  (`whereFor(editionAsset)`) with its grants and evidence (nested
  `whereFor(contentRight)`, and only when `can(contentRight, read)`), plus
  `clearedDigital` / `clearedPrint` from **`rightsGap`**. That is the same
  query the production transition runs — digital on the publish target,
  print on the print date or today — so the screen and the gate cannot
  disagree. Covered by 4 tests.
- **`/admin/next/rights`** has a live branch (`LiveRights`):
  - Coverage and the queue are the gate's answer.
  - The ledger shows one row per grant, with its consent or licence
    evidence.
  - BTG writers get **Record a right** (consent grantors take a signed
    acceptance id, licence grantors a contract ref — the API refuses the
    wrong one) and **Add an asset**.
  - **Send to production** runs the real transition, so an uncleared item
    refuses it ("Missing: rightsCleared").
- **Page map (P9-FE-03)** gained **the edition's own moves**, via
  `EditionAdvance` (forward only; cancel is never one click) and
  **Mark content ready** (`POST /conditions`). The rights gate links to the
  ledger.
- An unknown acceptance id comes back from the domain as "Not permitted to
  read agreement." The action translates it to "No signed acceptance with
  that id".
- **Walk:** 14/14.
  - A licence cleared the third-party photo. The consent with a bogus
    acceptance was refused. Production was refused twice while an asset
    stayed uncleared. A new asset joined the queue. The page map counts the
    same gap. No overflow at 390px.
  - The walk also showed the gate is date-true: a right starting today does
    not cover a publish target in the past.
- **Not done here:** consent capture for a subject with no login
  (`POST /consents`) needs the agreement text and hash shown to the signer.
  That is a flow of its own, so the queue says who grants the right and
  takes the acceptance id once it exists.

## P9-FE-02 · P9-FE-01 · P9-FE-10 — advisor desk, student portal, points → Code review

- **Advisor desk (`/advisor`):**
  - Reads `GET /students`, scoped by the matrix to the advisor's school
    (`own-property`).
  - The decision bar comes from `reviewMoves(state)`: Start review →
    Approve / Request changes / Decline (note required) → Add to the
    masthead; Suspend / Reinstate.
  - Decisions go through `POST /students/:id/transition` via
    `reviewStudentAction`.
  - Walk 11/11:
    - The other school's student is absent from the desk, and the API
      returns **403** when the advisor's own token hits it.
    - A minor is refused ACTIVE with the guardian message.
    - Request changes saves the note.
  - `/advisor/review` has **no backend model** (no student-draft /
    editorial workflow), so a real advisor sees "Content review isn't
    connected yet" instead of the fixture queue.
- **Student portal (`/next/*`):** `/me` now returns `studentId` (the actor's
  own link, like `propertyId`). `next/live.ts` → `liveStudent(parts)` reads
  the student's own record, code, sales, prospects and points.
  - Home, My sales (plus **Add a prospect** → `POST /students/:id/prospects`,
    student-sellable categories only), My code, and Points (balance folded
    from `StudentPointAccrual`, nothing reads Earning) are all live.
  - The layout shows the signed-in student.
  - Assignments have no backend model, so they show an honest state.
  - BTG previews keep the fixtures.
- **`/s/[code]` public page (new):** resolves via `GET /public/s/:code` to
  the display name and school only; an unknown code renders not-found. It
  streams a 200 under `(public)/loading`, like the other public dynamic
  pages.
- **Walk:** 21/21 (student portal and resolver).
- **Seed:** `seed-students.sql` in the scratchpad.
  - Adds two QA schools, five students, and the QA advisor and student
    users (`qa_u_advisor`, `qa_u_student`).
  - It uses `session_replication_role=replica` **locally only**, to reset
    its own immutable attribution rows.
- **Flagged:**
  - STUDENT has no sponsor read, so the attribution ledger can't name the
    business the student sold to. That needs a policy decision.
  - The sponsor brief form doesn't carry a student code, so `/s/[code]`
    tells the owner to mention it.
  - The advisor and student editorial workflows (assignments, content
    review) have no backend rows at all.

## P9-FE-07 — digital edition reader on real editions → Code review

- **`GET /public/editions/:school/:id`** (editions.ts, public section,
  rate-limited `edition:read` 120/min):
  - **Only PUBLISHED_DIGITAL / PRINTED / DISTRIBUTED** answer. Any other
    state, a missing id, or the wrong school slug gets the same 404, so the
    route is no oracle. `school` is the publication's property slug, or
    `regional`.
  - Returns the masthead, contents that hold a **digital right in force
    today** (so a right that lapsed after publication drops the piece),
    bylines as display names only (P9-SEC-01), and sold positions' sponsor
    names. No prices or sale values.
  - Covered by 5 tests.
- **Reader** `(public)/next/[school]/[edition]` tries the API first;
  `generateMetadata` takes the title from the edition. The fixture showcase
  address stays.
- Article prose is **not in the model** (EditionAsset = title + r2Key), so
  the live reader lists the issue's contents rather than inventing text.
- **Walk:** 11/11.
  - The published edition renders, and the lapsed-right piece is hidden.
  - A SELLING edition and the wrong school are unreachable.
  - No overflow at 390px.
  - Seed is in `seed-reader.sql` (scratchpad).

## P1-FE-28 · P9-FE-08 — FEATURED profile + Claim this profile → Code review

- **Public `/athletes/[slug]`:**
  - It asks `GET /public/athletes/:slug` first. A **FEATURED** athlete
    renders `FeaturedProfile`: editorial label, dashed monogram, "Being
    featured is not being represented", and no Follow, Request Partnership,
    inventory or prices.
  - The only action is `ClaimProfile`. Its copy says "It does not sign you,
    and it does not mean anyone represents you", and it lists the three
    steps (you → your school → a guardian if under 18).
  - Any other slug keeps the **existing view unchanged**.
  - A failed lookup degrades to the existing view (this is a QR
    destination), and the visitor's IP is forwarded.
- **Claim action:** `claimProfileAction` sends
  `POST /public/athletes/:slug/claim` with edge headers, so the 5/hour limit
  counts the visitor. The roster result is never shown to the claimant.
- **`GET /claims`** now joins each claim to the claimed profile's **public
  fields only** (display name, slug, sport, state). An advisor holds no
  athlete read, and this is not one. Covered by 2 tests.
- **Advisor desk:** a "Profile claims" section with Verify / Reject
  (`decideClaimAction`). An off-roster claim has Verify disabled with the
  reason. Verify moves the profile to UNDER_REVIEW and never to ACTIVE.
- **Walk:** 16/16.
  - The claim was recorded with a roster match and the profile stayed
    FEATURED.
  - The advisor rejected the off-roster claim and verified the matched one.
  - Once under review, the public page is gone.
  - Seed is in `seed-claims.sql`. Redis `athlete:claim` keys were cleared
    between runs.
- **Flagged:** step 3, capturing the guardian's COMMERCIAL consent
  (`POST /consents`: the agreement text and hash shown, signed by the
  guardian), has no UI and the guardian has no account. The backend refuses
  activation without it.

## End of day — 2026-09-28 (HeckerCreatives)

- **Frontend is done wherever it can start.** Today moved 29 tasks to
  Code review:
  - P4-FE-02/03/04/05, P5-FE-01..05, P6-FE-03, P7-FE-01..05, P8-FE-01/02
  - P9-FE-01/02/03/04/05/07/08/09/10, P1-FE-28
- **Still open on the frontend:**
  - P6-FE-01 (In progress) waits on **P6-BE-08** (eligibility / cap /
    landing-copy columns).
  - P1-FE-24/25/26 and P9-FE-06 wait on the **P1-ART-08** design.
  - P2-FE-01 is rcfworks'.
- **Verified:**
  - frontend vitest 289/289, backend vitest 1430/1430 (with `.env`
    sourced), eslint clean
  - `npm run build` green, with the web dev server stopped first and
    restarted after
- **Stage Progress:** the snapshot row for 2026-09-28 is appended. Rows for
  09-26 and 09-27 were never added, so there is a gap.
- **Nothing committed.** Everything above is in the working tree.
- **Flags for the team (policy or backend, not coded around):**
  - Matrix §15.3: FINANCE can't list editions and SALES can't read one, so
    SALES can't sell slots.
  - STUDENT has no sponsor read.
  - No editorial workflow model exists for student assignments or advisor
    content review.
  - No guardian-consent capture UI (`POST /consents`).
  - The brief form doesn't carry a student code.
  - FINANCE is denied invoices (from 09-24).
  - `notify.email` jobs fail because no email provider has been picked.
  - R2 needs a CORS rule.
  - The worker image needs a rebuild.

## First-pass test sweep (HeckerCreatives)

- **Stack:** restarted Docker (PG, Redis, MinIO), the API, the worker from
  source, and web.
- **Unit and static checks:**
  - frontend vitest 289/289, backend vitest 1430/1430
  - eslint and tsc clean on both
- **Browser walks: 12 of 19 green** after triage.
  - Green: p6fe01 21/21, p6fe03 18/18, p7fe03, p7fe05, p8, and all seven
    NEXT walks (p9ed 31/31, rights 14/14, advisor 11/11, student 21/21,
    reader 11/11, claim 16/16).
- **Real bug found and fixed:** at 390px `/admin/next/rights` overflowed by
  56px once 5+ editions existed. The heading's right slot grew to the width
  of the edition switcher. Fixed with `min-w-0 max-w-full` in `NextHeading`
  and the rights heading.
- **Walk and seed fixes (not product bugs):**
  - The NEXT seed's QA campaigns moved to their own sponsor (`qa_nx_spn`).
    They had inflated `seed_spn_1`'s dashboard counts.
  - p9ed is pinned to `?edition=`, since a second SELLING edition changes
    the default.
  - The analytics walk scrolls first (CountUp animates only in view).
  - The rewards walk uses a unique offer text per run.
  - Two `?demo=` checks now wait for render.
- **Still red: 7 walks from Stages 4–7** (p4fe02, p4fe04, p4fe05, p5fe01,
  p5fe0203, p5fe04, p5fe05; p7fe0102 is 29/30).
  - All of them fail on **state consumed by their own earlier runs**. For
    example, the QA athlete's invites are all accepted, declined or
    expired: 0 open of 8, where the walk expects 3 of 6.
  - The finance "owed" figure is $1,990, which matches the DB exactly
    ($2,085 raised − $95 paid, disputed excluded).
  - That data was set up ad hoc and never saved as a seed. Next pass:
    write an idempotent Stage 4–7 baseline seed, then rerun.

## Second-pass test sweep (HeckerCreatives) — 19/19 walks green, 387 checks

- **One clean run:** every browser walk from Stage 4 to Stage 9 passes.
  - Stage 4–8 (chained): p4fe02 30, p4fe04 24, p4fe05 22, p5fe01 21,
    p5fe0203 25, p5fe04 22, p5fe05 24, p6fe01 21, p6fe03 18, p7fe0102 30,
    p7fe03 16, p7fe05 10, p8 20.
  - NEXT: p9ed 31, rights 14, advisor 11, student 21, reader 11, claim 16.
- **No product code changed this pass.** Every fix was to test data or walk
  scripts:
  - **Stage 4–8 walks are a chain.** p4fe05 reads the campaign p4fe02
    creates; p8 reads the approval p5fe04 makes. The runner
    (`run-chain.sh`):
    1. warms up the dev server (a cold `next dev` compile blew 30s waits)
    2. runs `seed-reset.sql` to clear all QA orders, deliverables,
       earnings, metrics and links, including walk-created ones
    3. runs each walk after only its own seed, in stage order
    - The NEXT walks get a full `reseed.sh` each.
  - **Seeds made idempotent:**
    - QA athletes and campaigns are upserted, not deleted (orders, invites
      and rewards hang off them).
    - Deliverable seeds clear dependent metrics, links and earnings first.
    - The analytics seed pins one token per athlete.
    - The campaign-ops ad-hoc step became `seed-ops.sql`.
  - **Walks made data-derived instead of snapshot-pinned:**
    - invitation total
    - "your move" count
    - career, pending, eligible, owed and not-invoiced figures, computed
      from Postgres with the page's own rules
    - the brief campaign id, read live
  - **p5fe01** now computes the real agreement hash from the template via
    `hashAgreementBody` and restores it first. A crashed earlier run had
    left the tampered hash, and the page correctly refused to show the body.
- **Checked, not bugs:**
  - Another athlete's deliverable returns API 403 and shows the not-found
    page. No content leaks.
  - `?demo=1` is correctly not a demo state; the walk now uses
    `?demo=empty`.
- **Minor finding (backend, not fixed):** that 403 body says
  `code: "bad_request"` instead of a forbidden code.
- **The harness lives in the session scratchpad.** It is not in the repo
  and will not survive the session unless committed.

## Tracker: 49 HeckerCreatives rows → Done

- Every HeckerCreatives row in Code review (work from 09-16 to 09-28) is now
  **Done**:
  - P1-FE-09..15, 18..23, 27..30
  - P3-FE-01..05
  - P4-FE-02..06
  - P5-FE-01..05
  - P6-FE-03
  - P7-FE-01..05
  - P8-FE-01/02
  - P9-FE-01..05, 07..10
  - P1-FE-28
- Rows that had no Date Done took their Date Started.
- **P6-FE-01 stays In progress** on purpose. Eligibility, redemption cap and
  landing copy have no columns until P6-BE-08.
- The Google Sheet and Slack update themselves from
  `.github/workflows/tracker-notify.yml`, but **only when the xlsx change
  reaches `main`**. A push to `main_development` alone doesn't post it.
