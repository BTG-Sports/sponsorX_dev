# 2026-10-02 — tasks completed

## BTG admin review item 7: approving new sponsors
Already handled. Sponsors are approved automatically (2S1-BE-17), and exceptions go to BTG's Sponsor requests queue (2S1-BE-05). The "BTG Admin Interventions" doc in Drive still says "Keep" for item 7; offered the user new wording.

## BTG admin review item 8: listings publish automatically (2S3-BE-06, 2S3-FE-04, both Done)

The owner's rule: automate. Every listing that passes the checks goes live, the first one included. There is no price check, left out on purpose.

**Backend** (`backend/src/domain/listing.ts`):
- **Submit:** `submitListing` runs `goLive` → `listingChecks`. That covers governance and seller problems (a failure is refused 422, as before), the restricted-words check on the title and description, and standing reasons.
  - Clean: `publishAutomatically` publishes it (`publishedAutomatically`, audit `listing.autoPublish`, seller emailed `listing.live`).
  - Flagged: `holdForBtg` moves it to PENDING_APPROVAL with `reviewReasons` and `heldWords`. The seller and BTG are emailed.
- **The same checks run on every other way back to live:**
  - the seller resuming a paused listing;
  - BTG's "Put back live" (holds it if restricted words were edited in);
  - account reactivation (`relistAfterReactivation`).
- **Refused outright** (unchanged): a seller who is closed, rejected, ended, unapproved or has no listing access, and a minor's own login.
- **Held for BTG** (standing): an organisation flagged for a missing document, payouts on hold, an athlete in the coming-of-age pause, or a minor's unverified guardian.
- **What the seller is told:** restricted words in full, so they can fix them. Standing problems only as "BTG is checking your account".
- **BTG's controls:**
  - `POST /listings/:id/btg-action` PAUSE, END or RESUME, with a reason that is emailed. A listing BTG paused goes back live only through BTG.
  - `GET /listings/auto-published` covers the last 30 days; `GET /listings/live` lists all live listings, paged.
  - Decisions on a held listing: APPROVE, REQUEST_CHANGES or REJECT.
- **Daily summary:** `sendListingDigests`, run hourly by the worker from 13:00 UTC, sends one email per BTG tenant per day, idempotent through the `ListingDigest` table.
- **What sponsors see:** none of BTG's notes or holds.

**Migration:** `20261003100000_listing_auto_publish`.

**Frontend:**
- Both seller editors say "This goes live as soon as the checks pass", then show Live or "BTG is taking a look".
- The marketplace console has tabs Held for BTG, Published automatically and Live listings, with Pause and End.
- The restricted-words page now says listings are checked.
- Removed every line saying BTG approves each listing.

**Plan:**
- `2S3-BE-06` and `2S3-FE-04` were added to the Phase 2 document, which now has 108 tasks.
- The `2S3-BE-06` definition was corrected: closed and rejected sellers are refused outright, not queued for BTG.
- `SponsorX-Phase2-State-Machines.md` §2 was updated.
- Tracker rows 110 and 111 were added, with every range extended.

**Review:** the first review found two ways a listing could go live unchecked (reactivating an account, and BTG's "Put back live"), plus BTG notes visible to sponsors. All are fixed (`cdfac6a`) and rechecked.

**Checks:** backend 2164 of 2165 pass (only QA-02 fails), frontend 957, and the build is clean.

**Housekeeping:** the scratchpad was cleared overnight, so the local Postgres was reinstalled (v18 embedded), along with the venv and `q.cjs`.

## Phase 1 close-out: 236 → 243 of 261 Done (93.1%) — HeckerCreatives, via Claude

The owner asked to finish the remaining Phase 1 tasks. Every open row was checked against its acceptance criteria with the code, and every Code review row closed yesterday was re-audited the same way. Work was done on branch `development/P1-closeout` in a separate worktree, because the owner's `next dev` was live on the main checkout.

**Closed (7):**
- **P1-ART-09…12** (the landing's 3D city, fly-through, loader, page transition).
  - The city's Playwright smoke had failed on every run since the fly-through. It looked for an "I'm a Sponsor" link and a `-z-10` wrapper, neither of which exists any more. Fixed; it passes on desktop and mobile.
  - The kit size budget is now a test. The kit pipeline only printed "OVER" and exited 0.
  - **P1-ART-12 had three real bugs:**
    - A link followed while the boot screen was up locked scrolling for good.
    - A cancelled animation left the transition stuck, and every later link stopped working.
    - Pressing back during the cover sent the visitor forward again.
- **P9-OPS-01**: met by P3-FE-07.
- **P2-OPS-01**: the work was finished on 09-18; the row was held only to show ownership.
- **P2-OPS-10**: `npm run deploy` now ships `api` before `web` and stops if `api` fails. The ordering doc is rewritten for the api+worker / web-without-database topology.

**Defects found in rows closed yesterday, now fixed (rows stay Done; each has a note):**
- **P9-FE-06**: a request with no birthDate and no ageBand skipped the guardian. Also, the 5-an-hour limit was ONE bucket for the whole site, because the applicant's address wasn't forwarded.
- **P3-BE-15**: two concurrent approvals could make two logins for one address. A per-address advisory lock fixes it, and a test forces the race.
- **P1-FE-25**: the API's minor rule worked in local time. Now UTC, with a parity test against both wizard copies.
- **P1-FE-26**: printing the schools page kept the site chrome and printed pale text on white. Now light, without the chrome.
- **P6-ART-01**: dark-brand QR art printed light-on-white.
- **P4-FE-07**: the waiting-briefs banner opened an empty tab.

**Moved, still open:**
- **P8-PMO-05 → Code review.** `documentation/SponsorX-Developer-Handoff.md`, plus `npm run db:test`, which builds the CI test database in one command.
  - Verified in a fresh clone: install, migrate, run, all tests, lint and build.
  - Following it found two faults, both fixed: `prisma:deploy` ignored the root `.env`, and `frontend/.env.example` named variables nothing reads.
- **P8-QA-03 → In progress.** Backend 2,155/2,155 and frontend 958/958 are green; I fixed two parallel-run collisions. Browser suite: 17 pass, 1 still red (below).
- **P9-QA-01 → In progress.** `next-edition-e2e.test.ts` passes 7/7 on every clause but one. Raised **P9-BE-16** (Ready, 3d): edition ad artwork has no path onto the approval board. It is added to the Phase 1 plan, and P9-QA-01 waits on it.

**For rcfworks:**
- `loop-p3-application.spec.ts`, "a minor cannot go ACTIVE…", still expects the manual-review receipt that 2S1-FE-06 replaced with the live checklist yesterday. It needs rewriting to the automatic-approval flow.
- Separately, the "Instagram" selector also matched the new footer icon. I fixed that, and the adult loop passes.

**For the owner — the Clerk DEVELOPMENT instance is at its 100-user cap.** Creating a user fails with "user quota exceeded". So no new developer can sign up, and any browser test or walkthrough that needs a login it hasn't created before will fail. Clear stale test users in the Clerk dashboard. (Logged on P0-OPS-03.)

**Still open (18):**
- **Codeable, after a design call:** P9-BE-16 (how an ad's artwork joins the approval board).
- **Money:** Clerk Pro for MFA (P0-OPS-03, P2-INT-02); GitHub Pro for required checks (P2-OPS-07).
- **Consoles:** Cloudflare registrar lock and auto-renew (P0-OPS-06); production variables (P2-OPS-04); PR environments (P2-OPS-08); a paging destination (P2-OPS-11); a backup restore, alert drill and rollback (P8-OPS-01).
- **A person:** checking the Resend test landed in an inbox (P0-OPS-08); UAT with pilot users (P8-QA-02); go/no-go sign-off (P8-PMO-06).
- **Real-world sales:** edition one selling (P9-DATA-01, P9-PMO-03).
- **Waiting on others:** P8-QA-01; P8-QA-03; P9-QA-01 (waits on P9-BE-16); P8-PMO-05 at Code review.

**Tracker:** 17 Phase 1 rows updated and P9-BE-16 appended at row 268. The autofilter, conditional formats and Status list now run to row 268; the Dashboard and Stage Progress formulas already reached row 400. Stage Progress snapshot: 2026-10-02 · 243 Done · 50 days left. The upstream board was merged first, and the teammate's cells are untouched.

## BTG admin review items 9 to 11: order approval, payment and delivery, automated (2S4-BE-09, -10, -11 and 2S4-FE-05, all Done)

**The owner's decisions:**
- the spending limit starts at $5,000 and is capped at $25,000;
- a listing that asks for approval is decided by its seller;
- an unpaid order is cancelled after 3 days;
- each side gets 72 hours to answer a delivery problem.

### 2S4-BE-09: approval
- **The spending limit is never stored.** It is replayed from the sponsor's own records (`backend/src/domain/spending-limit.ts`, `spendingLimit()`):
  - it starts at $5,000 and rises to max($5,000, 2 × the largest completed order), capped at $25,000;
  - the first refund or upheld problem freezes it, whether BTG decided it or the two sides agreed a line refund.
- **Within the limit:** the order is approved automatically, the first one included.
- **Above it:** the order waits for BTG, with the reason, and BTG is emailed.
- **A listing that asks for approval:**
  - the order goes to `PENDING_SELLER`, with an `OrderSellerApproval` row per seller;
  - the seller has 48 hours, and silence declines (worker);
  - one decline cancels the order;
  - seller first, then BTG if the order is also above the limit.
- **Daily summary:** BTG gets one per day of orders approved automatically.
- **New policy resource** `orderSellerApproval`. The RBAC Matrix gains §24.

### 2S4-BE-10: payment
- **Awaiting payment** is set automatically when the order is approved.
- **Zoho Books:** a paid invoice moves the order to PAID through the queued `zoho.ingestInvoice` and the new `MarketplaceOrderInvoice` mirror. A short invoice, the wrong currency, or an order that isn't waiting is audited as unmatched and never pays.
  - BTG's Zoho Books is not connected. The MCP reaches only "The Coffee Stage" Books org, which is not BTG's. Books credentials are deferred (credentials doc §6, O-1). This part is tested against a simulated Zoho.
- **Unpaid orders:** reminders at 1 and 2 days, cancelled at 3 (`cancelReason` UNPAID). Never cancelled while a card payment is in progress.
- **Manual "Mark paid":** BTG_ADMIN or FINANCE only, with a method, a reference and the date received.
- **One way to PAID:** card, Zoho and manual all go through `payOrderIn`.

### 2S4-BE-11: delivery problems
- New `DeliveryIssue` table, one row per problem round.
- **The seller has 72 hours** to deliver again (the sponsor's 24 hours restart after the new delivery), refund the line, or disagree.
- **The sponsor then has 72 hours** to accept or reject. An accepted answer settles without BTG.
- **BTG steps in** only when the sponsor rejects or either side is silent.
- **Late sellers:** a second reminder at 3 days, then BTG at 7.

### Race fixes (c678ed5, from review)
- Every order state move is conditional on the state it was read in, and the order row is locked (`lockOrder`). Without this, a cancel could have been overwritten by a payment.
- Two sellers accepting at once no longer leave the order stuck, and the sweep acts as a backstop.
- A payment can't start for an order that isn't waiting for one. A payment confirmed after a cancel is flagged to BTG for a refund (`payment.refundNeeded`).
- A cancel while a card payment is processing gets 409.

### 2S4-FE-05: the screens, from Claude Design
- **Sellers:** approvals at `/athlete/sales/approvals/[id]` and `/property/sales/approvals/[id]`, plus the problem answer on the sale page.
- **Sponsor order page:** a status card with the pay-by deadline, and the answer to the seller's reply.
- **BTG Delivery issues:** Needs BTG, Settled and Overdue.
- **BTG order page:** the spending-limit card with the held order, and the Mark paid dialog.
- **Review fix:** a coded 403 (for example `guardian_must_act`) now shows the API's reason instead of "not your line".

### Plan and tests
- **Plan:** 2S4-BE-09, -10, -11 and 2S4-FE-05 added (Phase 2 now has 113 tasks). `SponsorX-Phase2-State-Machines.md` §4 updated.
- **2S8-QA-04 raised** for intermittent cross-suite test failures: next-public-apply (the advisor's login answers 403), notification-preferences and pilot-school.
- **Test fix:** the listing-hold email test now finds the emails by template (`9be8c92`).

### Checks
- Backend: 2235 of 2236 on two runs; only QA-02 fails.
- Frontend: 988 tests pass.
- The build is clean.

### Owner steps
- Connect BTG's Zoho Books, and switch on the invoice webhook there.
- Choose Stripe. Real card payments, and refunds actually returned to the card, wait for it.

## Afternoon batch: P9-BE-16, 2S3-FE-03, 2S2-FE-01, 2S8-QA-03, 2S8-QA-04 and QA-02 (all Done after independent review)

### P9-BE-16: edition ad artwork through the approval board (option B, chosen by the owner)
- **Design:** the board learns a second subject, edition artwork. The alternative, making each ad a Deliverable on a fake Campaign Order, was rejected because it would need a made-up athlete and job.
- **Data:** `EditionAsset` gains `adSlotId`, a `reviewState` that reuses `DeliverableState`, `artworkVersion`, `submittedAt` and `revisionNote`. Migration `20261003150000`. A trigger refuses artwork on an unsold slot.
- **Transitions:** checked by `canTransitionDeliverable` / `canRequestRevision`, so there is no second state machine.
- **Sponsor sign-off is mandatory.** The policy resource `editionArtwork` gives approve to SPONSOR_ADMIN on their own campaign only. No staff role can approve. RBAC §15.3; digest `549a562e5fbbb0a6`.
- **Production gate:** every sold slot needs APPROVED artwork, alongside the rights check.
- **Review fix (`232b4a9`):** every production gate now asks about the edition's own tenant, not the caller's. A cross-tenant SUPER_ADMIN could otherwise skip the gates.
- **Screens:**
  - "Edition ad artwork" on `/admin/approvals`;
  - "Your ad artwork" on the sponsor's campaign page;
  - the artwork gate and card on the BTG edition page.

### FOR JAN: `next-edition-e2e.test.ts`, P9-QA-01 clause 4
Clause 4 now fails at the IN_PRODUCTION step, and clause 5 fails with it, because the artwork is never approved. Two changes make it pass; verified 7/7 on a copy.
1. Replace the `POST /editions/${editionId}/assets` AD_CREATIVE call with:
   ```ts
   const signed = await call("POST", `/ad-slots/${backSlotId}/artwork/uploads`, SPONSOR_USER, { contentType: "image/png" });
   const art = await call("POST", `/ad-slots/${backSlotId}/artwork`, SPONSOR_USER, { r2Key: signed.json.key, title: "Rosa's back cover artwork" });
   artworkId = art.json.id;
   ```
2. Before the final IN_PRODUCTION transition:
   ```ts
   expect((await call("POST", `/edition-artwork/${artworkId}/btg-review`, STAFF)).json.state).toBe("BTG_REVIEW");
   expect((await call("POST", `/edition-artwork/${artworkId}/sponsor-review`, STAFF)).json.state).toBe("SPONSOR_REVIEW");
   expect((await call("POST", `/edition-artwork/${artworkId}/approve`, SPONSOR_USER)).json.state).toBe("APPROVED");
   ```

### 2S3-FE-03 and 2S2-FE-01
- **2S3-FE-03:** an independent athlete is named as the seller in the cart, checkout, the sponsor's order page and BTG's order page. Order lines carry `seller {type,id,name}`.
- **2S2-FE-01:** the Phase 2 athlete home.
  - New `GET /sales/summary`, own scope only, for inventory performance and upcoming sales.
  - `GET /payouts/me` gains `byState`. This also fixed `paidOutCents`, which only counted the 50 payouts listed.
  - Offers and invitations waiting, deliverables due and overdue.

### 2S8-QA-03, 2S8-QA-04 and QA-02
- **QA-02:** the test was wrong, not the code. It wrote `expiresAt` with `now()` in the session's time zone (Manila), but the column is UTC. Fixed in `ed67f6f`.
- **2S8-QA-04:** four causes, each isolated:
  - a test tenant id shared by two files (`np_tenant`);
  - the slug `riley-carter`, shared with the walkthrough seed;
  - `sweepComingOfAge` and `expireReservations` running platform-wide from tests; they now take `opts.tenantIds`, and the worker is unchanged;
  - test servers bound to every address on macOS; they now bind 127.0.0.1 and wait for `listening`.

  The new guard is `tests/suite-isolation.static.test.ts`.
- **2S8-QA-03:** `tests/phase2-reconciliation.test.ts` runs a full cycle through the API, with a tolerance of exactly 0 cents. It found no money bug.

### Newly raised
- **2S8-OPS-02:** pin the database time zone to UTC. `expire-invitations.mts` and the editions migration compare `now()` with UTC columns.
- **2S8-QA-05:**
  - a race between two applicants with the same name;
  - the walkthrough seed failing on a non-empty database;
  - a negative payee balance not shown on the payout page.

### Checks
- Backend: 2279 of 2281 on two runs. The only failures are Jan's clauses 4 and 5, above. QA-02 is green.
- Frontend: 1025 pass.
- The build is clean.

## P1-ART-13 (Done): /login redesigned to the landing's stage language
The owner's ask: make sign-in as lively as the landing, /packages, /join and /next/about.
- **New:** `frontend/src/components/login-stage.tsx` (server) and `login-fx.tsx` (client islands). `app/login/page.tsx` is rewritten around them, and the `sx-login-*` block in `globals.css` is replaced.
- **Ground:** the fixed-dark `.sx-stage` with the floor grid, the old Stadium Night floodlights (kept), rising motes, an outlined "SPONSORX" in pointer parallax, and a light that follows the cursor.
- **From lg:** a HUD column with a scrambled eyebrow, a masked "Welcome Back. / Your Network. / Is Live." headline, a "Where you'll land" card that cycles the five workspaces, and the network figures (fixtures, labelled as samples). Next to it is the sign-in in a chamfered glass panel with brackets, a scan line and an outline spotlight (no tilt on a form).
- **Below lg:** a compact hero, the panel, then the figures. One viewport down to 1366×700; the HUD drops parts as the screen gets shorter.
- **Clerk:** behaviour unchanged (hash routing, `/portal`). Clerk's inner card, shadow and footer tint are flattened with two-class CSS, because the Tailwind appearance classes lose to Clerk's runtime styles.
- `LoginStage` sets `html[data-sx-loaded]` itself, because /login has neither the boot screen nor the page transition.
- **Verified:** eslint, tsc, vitest 972/972, and Playwright screenshots on the live dev server (1600, 1366×700, 390 phone, Frost theme), with no horizontal overflow.
- **`next build` NOT verified:** in the shared install `node_modules/rimraf` is an empty folder (mtime 2026-10-02 14:01), so every production build fails resolving it through exceljs → fstream. This is unrelated to this change, and `npm ci` (or reinstalling rimraf 2.7.1) fixes it.
- **Follow-up: /login now uses both loading screens.** `lib/page-transition.ts` lists `/login` with the site paths (label "Login"), so moving between it and the site plays the X transition both ways. Signing in (→ /portal) is still a plain navigation. The login page mounts `LandingLoader city={false}`, so a hard load or refresh of /login shows the boot screen. `LoginStage` now only arms the entrance, and the loader or the transition releases it. `page-transition.test.ts` was updated to match. Verified in Playwright: hard load shows the loader then the entrance; /login → / and /packages → /login play the transition ("Now entering · Login").
- **Follow-up: /login closes with the landing's footer.** `SiteFooter compact` now sits at the bottom of the stage and rises in with the entrance. It replaces the "BTG Sports Group · SponsorX" fine print. The ground's outlined "SPONSORX" word was removed, because the footer carries the same wordmark. On desktop the footer sits just below the fold (the page is about 1165px tall at 1600×960), as it does on the other public pages.
- **Follow-up: the transition title is "Login" (not "Sign In"), and descenders are no longer cut.** Each letter of the title is painted with `background-clip: text`, but its box was only the 0.95 line tall, so the bottom of the "g" painted transparent. `.char` and the `.word` mask in `page-transition.module.css` now pad below the line and cancel it with a negative margin. This fixes every label with a g, p or y ("For Sponsors", "SponsorX NEXT", ...).
- **Tracker:** P1-ART-13 was raised and closed. It is appended at row 269 of Phase 1 (Order 32.95, Done, HeckerCreatives). The autofilter, conditional formats and Status list now run to row 269; the Dashboard formulas already reached row 400. The entry was also added to the Phase 1 plan after P1-ART-12. The upstream board was fast-forwarded first. The Stage Progress snapshot for 2026-10-02 was already written today and was left as it is.

## rcfworks — afternoon: staging deploy, Zoho Books, item 13 (cancellations and refunds)

- **Staging deployed** at main `51c84de` (everything through #147 plus P1-ART-13), using `npm run deploy staging`.
  - The API's pre-deploy step (`prisma migrate deploy`) applied 15 migrations. The `prisma/sql` files are applied by the migrations themselves, so nothing extra needs re-applying.
  - Checks passed: web `/` 200, `/login` 200, the API `/health` ok, and the OpenAPI spec has 326 paths including `/seller-approvals`.
  - **Production is not deployed.** Last night's CI failed on 4 Playwright specs on main: the landing city scene, and the duplicate "Instagram" label in the loop-p3 application tests. Jan's `next-edition-e2e` clauses 4–5 also still need the artwork-review step (the patch is in #147). Tonight's 8 pm run must be green before the daily deploy moves `release`.
- **Zoho Books.** The code needs no Books API credentials. It only receives `/webhooks/zoho/invoice`, which must be our own signed shape (`invoiceId`, `dealId`, cents, `balance`), so Books needs a Deluge workflow function to send it.
  - The Books connector sees only "The Coffee Stage" (org 763851111). In it, rcfworks is an admin but only a *User* of the iCARRe Foundation Zoho One. Zoho One therefore sends "+ New Organization" to a separate paid sign-up; **don't use it**.
  - The Zoho One admin (Rodney) has to create **BTG SponsorX (test)** inside Zoho One and invite infinex1@icarrefound.org as Admin. The request letter is in Drive: "Zoho Books test organization request.docx".
  - Next steps (mine): add a CRM Deal ID custom field on invoices, write the Deluge workflow, then test on staging.
- **Item 13 of the BTG admin review → 2S4-BE-12, 2S4-BE-13 (Done) and 2S4-FE-06 (Blocked on the design).** Item 12 needed nothing: 2S4-BE-08 already closes an order 30 days after its last confirmed line and releases the reserve.
  - **Owner decisions:** a sponsor cancels free until **3 days** before a line's first date, and after that the seller must agree. **2 seller cancellations in 90 days** remove good standing.
  - **2S4-BE-12:**
    - `GET /deliveries/:id/cancellation`, `POST /deliveries/:id/cancel`, `POST /sales/:id/cancel`, `POST /sales/:id/cancellation-answer`.
    - The delivery-issues desk takes CANCELLATION issues, resolved with REFUND or KEEP.
    - Cancellation refunds don't freeze the spending limit (`MarketplaceOrder.refundCause`).
    - Listings are held at 2 seller cancellations in 90 days (`seller-standing.ts`).
  - **2S4-BE-13:**
    - A new `RefundDue` table gets one row per refund of money received, across seven causes, one of them `PAID_AFTER_CANCELLATION`, which gets one row per card attempt.
    - `GET /refunds` and `POST /refunds/:id/sent` (BTG admin, Finance).
    - `refundCard` on the provider adapter: the stand-in refunds at once; `none` leaves the row open.
    - The sponsor sees "Refund on its way" / "Refund sent", never a method or a reference.
  - **Migrations:** 20261003160000, 20261003170000, 20261003180000.
  - **Authz:** new `refundDue` resource; matrix digest `168f5303543b3776`; RBAC Matrix §25.
  - **Also changed:** `phase2-order-concurrency.test.ts`. A card confirmed after cancellation now expects the refund row instead of the BTG email.
  - **Checks:** backend 2311 of 2313 on two runs (only Jan's 2 known clauses fail); tsc and eslint clean.
  - The design brief for OrderCancellations.dc.html (states CX-1…CX-14) was given to the user for Claude Design.
- **Tracker:** Phase 2 rows 119–121 added (Order 36.8, 36.9, 38.6). Autofilter, conditional formats, the Status list and the 15 Dashboard `'Phase 2'!` formulas now run to row 121. The plan now has 118 tasks.

## rcfworks — evening: cancellation screens, automatic payouts (items 14, 15, 17)

- **2S4-FE-06 Done.** Built from OrderCancellations.dc.html (CX-1…CX-14).
  - **Sponsor:** cancel or ask on `/sponsor/orders/[id]`.
  - **Seller:** can't deliver, and agree or keep, on `/athlete|property/sales/[id]`.
  - **BTG:** decides escalated cancellations on the delivery-issues desk.
  - **Finance:** the new `/admin/refunds` (Refunds to send, Mark refunded).
  - **Copy:** the screens say "line", as the existing order screens do. The sponsor never sees a refund's method or reference.
- **Follow-up fixes (`b771fd7`):**
  - `POST /deliveries/:id/cancel` takes `expect: FREE|ASK`, and a stale dialog gets 409 `cancel_terms_changed`.
  - The `refund.sent` email carries no method.
  - The seller's sale has `cancellation.refundCents`, which includes the buyer fee on the order's last live line.
- **Owner decisions for items 14, 15 and 17:** a $2,000 automatic limit; a first payout is fine if the provider account is ready; both safeguards (an account changed in the last 7 days goes to BTG; $5,000 of automatic approvals in 7 days goes to BTG); Phase 1 earnings move to approved for payout automatically now.
- **2S5-BE-06 Done:**
  - `requestPayout` approves automatically, as the system, when the rule passes. Otherwise the payout stays REQUESTED with `reviewReasons`.
  - `PayoutAccount.changedAt` records a real change.
  - A per-payee advisory lock (`lockPayee`) covers requests, earning approvals and account changes.
  - The 7-day total is counted across every tenant. A reason that includes another tenant's approvals shows no figure (`f6a63eb`).
  - Env knobs: `PAYOUT_AUTO_APPROVE_*` and `PAYOUT_ACCOUNT_CHANGE_REVIEW_DAYS`.
- **2S5-BE-07 Done:**
  - Each failure has a kind: TEMPORARY, ACCOUNT or OTHER.
  - TEMPORARY retries at about 1, 6 and 24 hours (`sweepPayoutRetries`, every 10 minutes), then goes to BTG.
  - ACCOUNT emails the payee (`payout.accountNeedsFix`) and retries once when the account is next READY.
  - A FAILED payout awaiting a resend still claims its money (`claimsMoney`).
  - `sendPayout`, `confirmPayoutPaid` and `decidePayout` are now state-guarded.
- **2S5-BE-08 Done:**
  - `maybeMakeEligible` moves an earning on to APPROVED_FOR_PAYOUT by the same rule, with no account check.
  - Otherwise it stays ELIGIBLE with `reviewReasons`, which only Finance and BTG admin can read.
  - PAID stays manual.
- **2S5-FE-06 Done:**
  - `admin/payouts`: an "Approved automatically" badge, "Waiting because", and the retry status; it opens on a Needs BTG filter by default.
  - Payee money pages: "BTG is reviewing this payout" and "fix your payout account".
  - `admin/finance`: the earnings reasons.
- **Migrations:** 20261003190000_payout_automation (plus 20261003160000/170000/180000 from the afternoon).
- **Checks on the combined branch:** backend 2348/2350 on two runs (only Jan's next-edition-e2e clauses 4–5); frontend 1068/1068; tsc and eslint clean on both.
- **Tracker:** Phase 2 rows 122–125 added (Order 44.1, 44.2, 44.3, 47.6). Ranges and the Dashboard formulas now run to row 125. The plan has 122 tasks.
