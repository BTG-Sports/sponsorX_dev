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
