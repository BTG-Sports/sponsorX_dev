# 2026-10-28 — tasks completed

### Six tasks raised (rcfworks), on `docs/P8-FE-12-campaign-cancel-change`

Each is defined in the Phase 1 doc (Stage 8) and is a row in the tracker.

- **Document checks.** Found today: a government ID arrived as an almost black, blurred photo. The upload checked only the type, the size and that the file arrived. The user: "do 1 and 2", then "do A and B", across all documents.
  - **`P8-BE-09` (In progress, rcfworks).** Every document upload is opened at its confirm step. One that is renamed, damaged, password-locked, too small, too dark, blank, washed out or blurred is refused with the reason, deleted and audited.
  - **`P8-BE-10` (In progress, rcfworks).** BTG can send any document it reviews back with a reason. The person is emailed and uploads a new one.
  - **`P8-BE-11` (In progress, rcfworks).** The server reads each document with OCR on our own server, sends nothing out and keeps none of the text. It compares the name, the kind, the expiry and the athlete's date of birth. A flagged or unread document holds the automatic approval it belongs to for BTG, with the findings as reasons.
  - **`P8-FE-11` (Blocked, for HeckerCreatives).** Refusal reasons on the upload screens; each document's result and a Send back button on BTG's review screens.
- **Campaign cancel and change**, from Rodney's questions ("How do you cancel a campaign?", "How do you update a campaign?").
  - **Today:** the API can cancel (BTG only), but there's no button, cancelling doesn't settle the athlete orders under the campaign, and nothing can change a campaign once it is set up. "Edit campaign" on BTG's campaign page saves nothing.
  - **The user:** add the buttons; automate cancel and change as far as possible, emailing BTG admins when it won't go through; and show a modal of what will be affected before confirming. Sponsors' admins and BTG both get the buttons.
  - **`P8-BE-12` (Ready, rcfworks).** Impact reads, automatic cancel and change, held requests for BTG.
  - **`P8-FE-12` (Ready, HeckerCreatives).** The two buttons, the impact modal, and BTG's Campaign requests list, built against `P8-BE-12`'s contract in the Phase 1 doc.

### `P8-BE-09`, `P8-BE-10` and `P8-BE-11` Done (rcfworks), on `feature/P8-BE-09-document-checks`

- **`P8-BE-09`.** Every document confirm step opens the file through `storage.checkPrivateUpload` `document: true` and `lib/document-inspect.ts`. A file is refused in plain words when it is renamed, damaged, password-locked, too small, too dark, washed out, blank or blurred; it is then deleted and audited.
  - **Limits:** calibrated on a drawn ID card and on the real near-black upload (mean brightness 12, edge score 6, both refused).
  - **New libraries, pinned:** `pdfjs-dist` 6.4.299, `@napi-rs/canvas` 1.0.11, `tesseract.js` 7.0.0, `@tesseract.js-data/eng` 1.0.0.
- **`P8-BE-11`.**
  - **Reading:** a PDF's own words, or OCR on our own server. The English data ships in node_modules, nothing is sent out, and none of the text is stored.
  - **Comparing:** the name, the kind of document, the expiry and the athlete's date of birth.
  - **Holding:** a flagged or unread document holds the sign-up, organisation, sponsor request, handoff or legal name for BTG, with reasons. BTG answers a held legal name with `POST /profile-changes/{id}/decision`.
  - **Where results sit:** on each document's row (migration `20261028120000_document_checks`, nullable columns only), and in BTG's views as `check`.
- **`P8-BE-10`.** BTG sends a document back with a reason in five flows: sign-ups, organisations, sponsor requests, handoffs and legal names. The document stops counting, its file is deleted, the person is emailed the reason and their upload link (`document.sentBack`), and the flow goes back to waiting.
  - **Bug found and fixed in testing (by a test-writing helper):** a guardian's sent-back document left the held minor's old reasons in place. It now clears them.
- **`P8-FE-11`** is now Ready for HeckerCreatives. Every route and field is in the Phase 1 doc.
- **Checked locally on portable Postgres 17:**
  - build, lint, security scripts, the secret scan and the dependency audit all pass;
  - **3,592 / 3,592** backend tests pass, including the new `document-checks` (27) and `document-flows` (24) tests and the updated `private-upload-pins` and `tenant-isolation` tests.
- **The user's question, "send back the photo via email?":** no. The email carries the reason and the upload link only. An ID is never emailed, and the sent-back file is deleted.

## Polish list — UX review of every user's flow (2026-10-28)

- **What:** a review of SponsorX as each kind of user would meet it — sponsor, athlete and guardian, team, BTG staff, fan — looking for flaws in the experience, not the code (the same kind as the blurry ID and Rodney's cancel/change question). 35 found and checked against the code.
- **The user's call:** this is **urgent, before cleaning up any other task on the board.**
- **Plan:** [documentation/polish.md](../../documentation/polish.md) — four groups: A money, minors, consent (1–8); B waiting or stuck (9–15); C confusing (16–30); D wording and links (31–35).
- **Tracker:** new **Polish** sheet (placed before Phase 1), 51 rows: 19 `POL-BE-nn` (rcfworks), 32 `POL-FE-nn` (HeckerCreatives), all Ready, about 43 days. `nn` = the item number in polish.md; an FE row waits on its BE row. Dashboard rows 23–25 count it, kept apart from the phase totals.
- **Do first:** `POL-BE-04` — while Stripe is paused, the unpaid-order sweep still cancels sponsors' orders.
- **Also:** PR #314 had merged, so `main_development` was fast-forwarded to `main` (ed3b9639).

## Stripe live account — checked with a read-only key (2026-10-28)

- **Read-only live key made by the user:** `SponsorX read-only check (Claude)` (Read on Core, Accounts v2 and Connect, own account only). It is kept outside the repo at `~/.config/sponsorx/stripe-live-readonly.key`. Delete it at go-live.
- **Correction to 2026-10-23:** `acct_1UNCupGfl3hcz7a8` is **BTG's live account ("BTG Sports Group")**, not a spare sandbox. The secret key rolled there on 10-23 was this account's own test-mode key.
- **What Stripe reports:**
  - card payments are on (`charges_enabled`), and so are payouts (`payouts_enabled`);
  - details submitted; `card_payments` and `transfers` are active;
  - balance $0; no charges and no payouts yet;
  - Rodney is listed as owner and representative.
- **What the key can't see:** the identity-check status, outstanding requirements and the bank account all come back blank. The dashboard's setup guide still shows "Verify your identity" unticked, so Stripe may ask Rodney for his ID later; a dashboard banner and email would say so.
- **So:** Stripe is not what's blocking go-live any more. Switching payment on (a new live key for production, the live webhook, `PAYMENT_PROVIDER=stripe`, with Zoho production at the same time) is the owner's call.

## Stripe live key and webhooks installed, payments still off (2026-10-28)

- **The owner's decision:** have the live key ready today, but keep payments **off** until the polish list is done. Today the switch is `PAYMENT_PROVIDER` on Railway; later a BTG admin switch takes over (`POL-BE-36` / `POL-FE-36`, added to the Polish sheet).
- **Live key `SponsorX production (restricted)`** (made by the user):
  - grants Checkout Sessions W, Payment Intents R, Charges and Refunds W, Transfers W, Login Links W, Accounts v2, and Recipient Configuration W;
  - the user chose to leave several unused permissions on; Payouts, the bank vaults, and Customer/Merchant Configuration are off;
  - Stripe still allows payouts with it (bundled, as with the sandbox key on 10-26), but a payout can only reach BTG's own verified bank.
  - Tested: every call SponsorX makes answers 200.
- **Live webhooks**, created through the API with a temporary key `SponsorX webhook setup (temporary)`:
  - `SponsorX payments` (13 events; Stripe added `transfer.canceled`);
  - `SponsorX connected accounts` (3, Connect);
  - `SponsorX payout accounts` (thin, 5 events, Your account);
  - all at `https://sponsorx.net/api/v1/webhooks/payments/stripe`, API version `2026-09-30.endive` (stripe-node 23.0.0's version).
  - The thin destination's secret can't be read through the API, so the user copied it from the dashboard.
- **Railway production `api`:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_THIN_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` set; `PAYMENT_PROVIDER=none` unchanged.
  - Deployment `5d5fe387` SUCCESS; `/api/v1/public/health` is ok on every check.
  - The webhook path answers "No payment provider of that name is connected here" (expected while off).
- **Local copies** live in `~/.config/sponsorx/` (mode 600, outside the repo): `stripe-production.env`, `stripe-live-readonly.key`, and `stripe-webhook-setup.key`, which goes once its key is deleted.
- **Go/no-go doc** Payments row updated.
- **To switch on:** set `PAYMENT_PROVIDER=stripe`, then do the $1 payment and refund (Stripe doc §6.4).

## POL-BE-04 — orders are held, not cancelled, while card payment is closed (2026-10-28)

- **The problem:** with payments off in production, an approved order still got "pay by" reminders on days 1 and 2 and was cancelled as unpaid on day 3, while its pay button was greyed out.
- **The fix:**
  - `paymentsOpen()` in `lib/payment-provider.ts` is now the one test of whether payment is open. It reads `PAYMENT_PROVIDER` today; `POL-BE-36` will hook BTG's switch in there.
  - **Approval while closed:** `paymentDueAt` is left null (no deadline). The `order.approved` email says the order is held and that payment opens soon.
  - **`sweepUnpaidOrders` while closed:** no reminders and no cancelling. A running window is paused (deadline and reminders cleared, audited `marketplaceOrder.paymentWindowPaused`).
  - **`sweepUnpaidOrders` once open:** each held order gets a fresh three days (`marketplaceOrder.paymentWindowOpened`), and the sponsor gets the new `order.paymentOpen` email once.
  - Reminders now count from `paymentWindowStart(paymentDueAt)`, not from approval. For an order approved while open, nothing changes.
  - `GET /marketplace-orders/:id/payment` `canPay` now reads `paymentsOpen()`.
- **No migration.** `paymentDueAt` was already nullable; only the schema comment changed.
- **Tests:** 6 new in `phase2-order-automation.test.ts`, covering:
  - held while closed;
  - never reminded or cancelled;
  - pause;
  - open with a fresh window, and one email;
  - reminders and cancel after opening;
  - paid by hand and by Zoho invoice while closed.
- **`POL-FE-04`:** what the screens can rely on is written into `documentation/polish.md` #4.

## POL-BE-01 — the payout account follows whoever is responsible for the athlete (2026-10-28)

- **The problem:** an athlete has one payout account, and it is the Stripe account of the person who set it up. After a guardian handoff or coming of age, it still pointed at the old guardian, so every payout went to them, and the new holder's "Set up payouts" button reopened the old guardian's account. SponsorX had no way to switch it.
- **The user's decision (with Rodney's authority):** everything not yet paid out follows the athlete to the new holder's account. This replaces the 2026-10-01 rule "money already earned stays with the account it was earned under". Updated in the Phase 2 doc, the handoff and coming-of-age module headers, and the emails.
- **The fix:**
  - New `domain/payout-account-holder.ts` `detachAthletePayoutAccountIn`, called inside the switch transaction in `guardian-handoff.ts` `handOff` and `coming-of-age.ts` `completeIn`. It sets status `NOT_SET_UP`, clears the provider account, sets `changedAt`, and audits `payoutAccount.detached` with the old account id. Nothing is deleted at Stripe.
  - Approved payouts wait (the existing readiness check), then go to the new account once READY.
  - `stripeAccountLink` now keeps `changedAt` when an account was detached, so the change-review window applies to the new holder's first payouts. Before, it reset `changedAt` to null.
  - `onAccountUpdated` ignores Stripe news about a detached account (`wasDetached`, read from the audit trail) instead of deferring it forever.
- **Tests:**
  - handoff: detach, payout waits, emails, the new guardian's own account is created and READY, the waiting payout is queued and sent, the sibling's account is untouched, `wasDetached`;
  - coming of age: detach and both emails;
  - the existing "money and work untouched" check was narrowed to earnings, orders, payouts and the sibling's account.
- **For HeckerCreatives (`POL-FE-01`):** the setup prompt, plus wording in `frontend/src/lib/guardian-live.ts` `handoffCarryOver` that still states the old rule. Noted in `documentation/polish.md` #1.

## POL-BE-02 — a minor can no longer make themselves an adult (2026-10-28)

- **The problem:** a minor (or anyone editing their profile) could change their date of birth, or move to a place with a lower age of majority. It applied at once, started coming of age, and an ID upload then removed the guardian, whatever the ID check said.
- **The user's decisions (with Rodney's authority):**
  - BTG alone approves a change that would make a minor an adult, and the guardian is told;
  - a takeover is automatic only when the ID reads clear, otherwise BTG decides.
- **Edits** (`athlete-profile-change.ts`):
  - `submitProfileChange` splits off `birthDate`/`stateCode` that would turn a minor into an adult into a `PENDING` change with no ID upload. The rest of the edit applies.
  - It emails BTG (`athlete.sensitiveEdit`, now with a `held` flag; the template says it waits, which also fixes held legal names) and the guardian (new `athlete.adulthoodChangeHeld`).
  - `decideHeldLegalName` (the existing `POST /profile-changes/:id/decision`) now also answers these. `APPLY` runs `applyAdulthoodIn`: date of birth/state, majority, band, then `rerunComingOfAgeIn`.
  - A new legal-name request no longer withdraws a held adulthood change.
  - The guardian rule checks the age asked for.
- **Takeover** (`coming-of-age.ts`):
  - `confirmComingOfAgeUpload` reads the document's check: clear → `completeIn`; flagged or unread → `holdIn` (new `Athlete.comingOfAgeHeldAt`/`comingOfAgeHeldReasons`, migration `20261028150000_coming_of_age_held`), and BTG is emailed `comingOfAge.heldForBtg`.
  - The sweep skips held takeovers (no termination, no reminders).
  - New `POST /signups/athletes/:id/coming-of-age/confirm` (BTG; the `athleteProfileChange.approve` cell).
  - The document send-back clears the hold.
  - The page, the portal reminder and BTG's athlete view expose `checking` / `comingOfAgeHeld` / `can.confirmComingOfAge`.
- **Tests:**
  - 4 new in `phase2-profile-edits.test.ts`: the minor's own edit is held, the guardian's is too, BTG declines and applies, a move is held;
  - 1 in `phase2-guardian-acts.test.ts`: a flagged ID holds the takeover, send-back clears it, the 90 days don't end it, only BTG confirms.
- **For HeckerCreatives (`POL-FE-02`):** the screens are listed in `documentation/polish.md` #2.
