# SponsorX Payments and Personal Data Review — October 2026

**Task:** 2S0-SEC-01 · Payments and PII security review
**Date:** 2026-10-06 · **Reference:** Spec §3, §38; blueprint §26; Addendum A6; the architecture rules in `CLAUDE.md`
**Done when:** the review is complete, with every finding closed or accepted in writing.

## What this covers

Four checks, plus anything else about payments or personal data found on the way:

1. Card data never touches our servers.
2. Payout account data stays at the payment provider.
3. Verification documents are kept in private storage.
4. Personal data is masked in logs.

It builds on the October OWASP review, [SponsorX-Security-Review-2026-10.md](SponsorX-Security-Review-2026-10.md) (2S8-SEC-02, with the 2S8-SEC-03/04/05 follow-ups). Where that review already settled a point, this one points to it rather than repeating it.

**How it was done.**
- Code reading across `backend/src`, `backend/worker`, `backend/prisma` and `frontend/src`, following Stripe from the "Pay by card" button to the stored event, and every document from upload to deletion.
- What a real Stripe event carries at rest was checked by sending events full of a sponsor's and a payee's details through the real webhook, then reading every row they touched.
- One new test file, `backend/tests/payments-pii.test.ts` (18 tests), runs the real API and database. It pins each verdict below. Every **Fixed** item was shown to fail with the fix taken out.

**Result key** (as in the OWASP review):
- **Pass:** checked, and nothing to fix.
- **Fixed:** a real finding, fixed here, with a test.
- **Open:** not fixed here. It has a recommendation and a severity, and waits for the owner's decision at the end of this document.

## Summary

| Check | Verdict |
|---|---|
| 1. Card data | **Pass**, plus one **Fixed** (Medium): refused webhook deliveries kept the whole Stripe event |
| 2. Payout account data | **Pass** |
| 3. Verification documents | **Pass**, plus one **Fixed** (Low): a boot guard so the two buckets can't be crossed. **Open**: support attachments (O1, O2) |
| 4. Personal data in logs | **Fixed** (Medium): error logs could carry emails, names and dates of birth. **Open**: O3 |
| 5. Other | **Pass** on access, emails and Zoho. **Open**: O4–O6 |

The fixes are in commit `094f6b5` (`fix(2S0-SEC-01): …`).

---

## 1 · Card data never touches our servers

### Pass: no card field exists anywhere

- No card number, CVC or expiry field appears in the API, the worker, the web app or the Prisma schema.
- There are only two card-shaped words in the code, and both are guards that *refuse* a card number:
  - `looksLikeCardNumber` (`backend/src/domain/marketplace-order-rules.ts:176`) runs a Luhn check;
  - its frontend copy (`frontend/src/lib/checkout-gate.ts:36`) does the same.
  - They stop a card number being typed into the PO, payment-reference or refund-reference boxes.
- **Test:** `payments-pii.test.ts`, "no card-number, CVC or expiry field exists in the API, the worker, the web app or the schema". It scans more than 300 source files and the schema.

### Pass: checkout is hosted by Stripe

- `openCheckout` (`backend/src/lib/payment-provider.ts:292`) creates a Stripe Checkout Session, and the sponsor is sent to `checkout.stripe.com`.
- SponsorX sends Stripe only the amount, the order reference, its own ids in `metadata` and the return URLs. It sends no customer email and no card fields.
- **Test:** `stripe-payments.test.ts`, "Pay by card answers with Stripe's page; … card data never touches SponsorX". It checks every parameter sent to Stripe and finds nothing card-shaped.

### Pass: the stand-in's test pages take no card details

- `frontend/src/app/test-provider/checkout/page.tsx` shows a fixed label, "Test card •••• 4242".
- Its only input is the signed token, kept in a hidden field; the two buttons only choose the test outcome.
- It has no `cc-*` autocomplete.
- **Test:** `payments-pii.test.ts`, "the stand-in's checkout page takes no card details".

### Pass: what is stored for a processed Stripe event

- Each Stripe event is mapped by `mapStripeEvent` (`backend/src/lib/stripe.ts:273`) onto SponsorX's own provider-neutral event.
- That event is then parsed by its type's Zod schema (`PAYMENT_EVENT_DATA`, `backend/src/contracts/payment-events.ts:63`). The schema drops every key it does not name.
- So `PaymentEvent.payload` holds only ids, an amount, and a reason or outcome. For example:
  - a paid Checkout Session keeps `attemptId`, `paymentRef` and `amountCents`;
  - a dispute keeps `paymentRef`, `disputeRef`, `amountCents` and `reason`.
- None of these is ever stored: `customer_details` (name, email, phone, billing address), `payment_method_details` (brand, last 4, expiry, fingerprint), `billing_details`, or a dispute's `evidence`.
- No migration was needed for `PaymentEvent`: its payload has been the neutral event since 2S5-INT-02.
- The unique `(provider, providerEventId)` is unchanged, so a redelivery is still a no-op.
- **Test:** `payments-pii.test.ts`:
  - "a paid Checkout Session full of the sponsor's details is kept as ids and an amount". The order still goes to PAID. The event row, the audit rows and the queued jobs (including the receipt email's) are all searched for every personal detail, and none is found. A second delivery is still the same event.
  - "a dispute's evidence … is not kept".

### Fixed (Medium): refused deliveries kept the whole Stripe event

**Finding.**
- A payment webhook that SponsorX refuses is recorded in `WebhookDelivery` as REJECTED, with the reason. Three things can cause it:
  - a bad or old signature;
  - a body that isn't an event;
  - no provider of that name connected.
- The body used to be stored whole, up to 4,000 characters, or else its first 4,000 characters.
- A genuine Stripe event refused this way is the full event. A Checkout Session is refused, for example, when a webhook secret is set wrong during rotation, or when Stripe's live endpoint is switched on while production still has `PAYMENT_PROVIDER` off, which is the state today. That event's body carries the sponsor's name, email, phone and billing address, and card details if the payment intent is expanded.
- Those rows are never read back by the app (`integration-health.ts` reads only status and error), but they were kept indefinitely.

**Fix.**
- `rejectedDeliveryRecord` (`backend/src/domain/payment-events.ts:112`) now keeps only which event the delivery claimed to be:
  - its `id`, `object`, `type`, `created`, `account` and `livemode`;
  - the subject object's type and id;
  - the body's size.
- That is enough to find the event in Stripe's dashboard and see why it was refused. A body that isn't JSON is kept as its size only.
- The migration `20261006043000_minimise_refused_payment_webhooks` brings rows already recorded to the same shape. It touches only `source LIKE 'payments:%'`, so Zoho's rows are unchanged.
- The rows themselves, with their status, error and signature verdict, are kept, so the audit of refused deliveries is unchanged.
- The migration was checked on a seeded row: a full Checkout event was reduced to its ids, a truncated one to `{unparseable: true}`, and a Zoho row was left alone.

**Test:** `payments-pii.test.ts`:
- "a REFUSED delivery of that same event keeps which event it was, not what it carried". It covers both a wrong secret and Stripe not connected.
- "a refused body that isn't JSON is kept as its size only".

---

## 2 · Payout account data stays at the provider

### Pass: only the account id and its status are stored

- `PayoutAccount` (`backend/prisma/schema.prisma:2970`) has exactly these columns: `id`, `tenantId`, `payeeType`, `payeeId`, `provider`, `providerAccountId`, `status`, `changedAt`, `createdAt` and `updatedAt`. The existing test `stripe-payments.test.ts` pins that list.
- Stripe's hosted onboarding collects the bank account, identity and tax details. SponsorX never asks for them, and the account is opened with only:
  - a contact email (Stripe requires one);
  - a display name;
  - the country;
  - SponsorX's ids in `metadata`.

  See `createPayoutAccount`, `payment-provider.ts:333`.
- **Schema-wide check:** no column in any of the more than 1,000 schema fields is named like a bank, routing, IBAN, sort code, SWIFT, SSN, tax id, EIN, VAT, passport, licence number or card number. The check matches whole camelCase words, so `listingId` is not mistaken for a "tin". Test: `payments-pii.test.ts`, "no column anywhere in the schema is shaped like a bank, card, tax or identity number". A self-check confirms that five such names would be caught.
- `Earning` still holds no tax id and no bank details (§26, Addendum A6). `PayoutAccount`'s own comment says the same.

### Pass: the account event keeps readiness only

- `account.updated` keeps the account id, READY or NEEDS_INFO, and Stripe's reason.
- The reason names only the requirement still due (for example `individual.verification.document`), never a value.
- **Test:** `payments-pii.test.ts`, "an account.updated carrying the payee's identity and bank details keeps the account id and its readiness only". The event carries a date of birth, the last 4 of an SSN, a phone number, an address, a routing number and a bank account's last 4. None of them is stored.

### Pass: the API answers status only

- `GET /payouts/account` (`accountView`, `backend/src/domain/payouts.ts:150`) answers with `status`, `provider`, `canSetUp`, `testProvider` and `updatedAt`.
- It never returns the provider's account id, nor anything from Stripe's account object.
- Payout views name the payout, never the account.
- **Test:** `payments-pii.test.ts`, "GET /payouts/account answers status only …". It checks both a Stripe payee and a stand-in payee.

### Pass: onboarding and login links are neither logged nor stored

- `payoutAccountLinkUrl` (`payment-provider.ts:382`) returns the single-use link to the caller.
- The audit row says only `{ provider: "stripe" }`.
- **Test:** the same test searches the audit trail and the job queue for the link's token, and does not find it.

### Pass: no tax id is collected

No tax id is collected anywhere (Addendum A6). Stripe collects any tax details it needs on its own hosted pages.

---

## 3 · Verification documents are in private storage

The documents in scope:
- athlete and guardian ID (`AccountDocument`);
- guardianship proof (`GuardianHandoffDocument`, `AccountDocument`);
- property onboarding and organisation documents (`OnboardingDocument`);
- a sponsor's proof of business (`InquiryDocument`);
- a profile change's ID (`AthleteProfileChange.idDocumentKey`);
- delivery proof;
- support attachments (`SupportAttachment`).

### Pass: private bucket only, with pinned uploads

- Every one of these is uploaded straight to the **private** bucket, through `presignPrivateUpload`. Each grant is audited, and the upload is pinned to one type and one exact size (2S8-SEC-03, `private-upload-pins.test.ts`).
- The public bucket is reached from **one** place only: the branding logo (`branding.ts`), plus the storage helper itself.
- **Tests:**
  - `payments-pii.test.ts`, "the public bucket is reached from one place only: the branding logo";
  - `property-onboarding.test.ts`, "are never publicly reachable".

### Pass: read only through short-lived, authorised links

- Documents are read only through `presignPrivateDownload` (`backend/src/lib/storage.ts:172`). It writes an audit row **before** it returns the link and never records the link itself (`storage.grants.test.ts`).
- ID, guardianship, organisation, proof-of-business and delivery-proof links live **five minutes** (`SENSITIVE_DOCUMENT_TTL_SECONDS`). Every other private link lives at most 15 minutes.
- Each read first passes the caller's authorisation: `assertAllowed` / `whereFor` on the owning record (OWASP review §A01).
- The upload-only flows hand out no download link at all: account documents (read only through BTG's sign-ups desk), organisation documents and support attachments.
- **Test:** `payments-pii.test.ts`, "every identity, guardianship, organisation and proof document is read through a five-minute signed link".

### Pass: never logged

- No log line prints a document key or link.
- The audit row of a grant records the bucket, key and TTL, never the signed URL.

### Pass: retention and deletion

These are the current rules, documented here.

| What | Kept until | Deleted by |
|---|---|---|
| Documents of a closed or rejected account (`AccountDocument`, the profile-change ID, `OnboardingDocument`, `InquiryDocument`, `GuardianHandoffDocument`) | 30 days after the closure (`retainUntil`) | The worker's hourly retention sweep, `purgeExpiredClosures` (`backend/src/domain/account-closure.ts:851`). Objects are deleted first, then their rows; logins are released and the closure is marked PURGED and audited. |
| Documents of a guardianship hand-off that was declined or cancelled | 30 days after the answer | The same sweep |
| Documents of a live account | As long as the account is open | Replaced through the portal; deleted 30 days after closure |
| Support attachments | **Indefinitely** | Nothing. See **O2**. |
| Refused uploads (wrong type or size) | Not kept | Deleted on confirm (2S8-SEC-03) |

### Fixed (Low): a boot guard so the two buckets cannot be crossed

**Finding.**
- The separation between the world-readable bucket and the private one is two plain environment variables.
- `S3_BUCKET_PRIVATE` copied into `S3_BUCKET_PUBLIC`, or `R2_PUBLIC_BASE_URL` pointed at the private bucket, would publish every ID document at an unsigned URL.
- Nothing stopped either mistake.

**Fix.** `backend/src/config/env.ts` refuses to boot, in every environment, when:
- the two bucket names are the same (ignoring case and spaces); or
- `R2_PUBLIC_BASE_URL` serves the private bucket, in either path style (MinIO) or host style.

**Test:** `payments-pii.test.ts`, block "3 · … the API refuses to boot with the buckets crossed". It checks both refusals, and that the real shapes still boot: MinIO locally, an `r2.dev` address, or a custom domain.

### Open: support attachments (O1, O2)

- **O1 (Medium).** A support message's attachments are read from the private bucket by the worker and **emailed as attachments** to `SUPPORT_EMAIL`, BTG's support desk (2S1-BE-16 by design: "nobody is ever handed a link").
  - The support form exists for disputed guardianships first, so an attachment is likely to be a birth certificate or a court order.
  - Once mailed, it lives in the desk's mailbox (Zoho Desk or a shared inbox), outside SponsorX's five-minute links, its audit and its retention.
  - **Recommendation:** email BTG a link to a signed-in admin page that serves the file through `presignPrivateDownload`, instead of the file itself. Or accept it, and set retention on the desk side.
- **O2 (Low).** `SupportAttachment` is not one of the retention sweep's sources, so its objects are never deleted.
  - **Recommendation:** add it to `RETAINED_DOCUMENT_SOURCES`, or give it its own window, for example 90 days after the message is queued.

---

## 4 · Personal data is masked in logs

The OWASP review's §A09 (2S8-SEC-05) masked emails in the worker's *info* lines, on the reasoning that "console.error is left for errors, whose messages are our own". That premise was checked and is not true.

### Fixed (Medium): error logs could carry emails, names and dates of birth

**Finding.** Several kinds of error repeat the data they refused:
- **A Prisma validation error prints the whole call it refused, arguments and all.** It was reproduced on this codebase: a `user.create` missing one field printed the email in full. On an application or athlete write, that is a legal name, a date of birth or a guardian's details.
- **A Postgres unique violation names the value:** `Key (email)=(…) already exists`.
- **A Stripe refusal can quote the parameter it refused:** "Invalid email address: …".

All of these reached the logs:
- the API's 5xx handler logged the whole error (`app.ts`);
- the worker's sweeps and the domain modules logged errors through 57 raw `console.error` calls.

The Stripe message was also kept on the payout or refund that failed (`providerMessage`) and emailed to BTG. It was scrubbed of keys, but not of addresses.

**Fix.**
- **One helper for errors.** `logError` / `redactForLog` (`backend/src/lib/redact.ts`):
  - every part of the line is redacted, and every email address in it (including deep in an error object) is masked to its domain;
  - a `PrismaClientValidationError` keeps its first line, its verdict ("Argument `clerkId` is missing") and its stack, but **not** the arguments it echoed.
- **Every `console.error` in `src/` and `worker/` now goes through it.** That covers the API's 5xx handler, all of the domain sweeps, the worker and `combined.mts`.
- **`scrub()`** (`backend/src/lib/stripe.ts:62`) now masks email addresses as well as keys. So Stripe's words are clean in the log, in `Payout.failureReason`, on Finance's refund note, and in the `payout.failedForBtg` / `refund.providerRefused` emails.

**Test:** `payments-pii.test.ts`, block "4":
- "logError masks every address, in a message or deep in an error object".
- "a Stripe refusal is scrubbed of addresses as well as keys".
- "a 500 caused by a Prisma validation error logs the verdict and the stack, not the arguments it echoed". This test uses a real Prisma error from the test database.
- A static guard: "no console.error / warn / info / debug in the API or the worker outside the redacting helper; console.log only on known lines". It extends the SEC-05 guard (`security-hardening.test.ts`, block 4) from the worker's info lines to every log call in `src/` and `worker/`.

### Pass: no stack traces in error responses

- An error response never carries the detail: a 5xx answers with a reference id only (`error-body.ts`, OWASP §A05).
- Stripe's words never reach the caller: `ProviderRefusedError` gives the caller a plain sentence, and Stripe's message is for the record.

### Pass: no request logging

- The API has no request logging middleware, so request bodies, query strings and headers are never logged.

### Pass: no secrets in logs

- Nothing regressed with Stripe.
- `stripeCall` logs only the classified, scrubbed message, never the key, the request or the SDK's raw error.
- The secret scan is clean (see the suite figures below).

### Pass: fans

Fan addresses stay out of logs and out of the job table (P6-SEC-02/03, `fan-pii.test.ts`, `worker.geo.test.ts`).

### Open: other personal data in error messages (O3)

- **O3 (Low).** Masking by pattern catches email addresses and Prisma's echoed arguments. It cannot reliably catch a name, a phone number or a street address that some other library writes into an error message.
- **Recommendation:** when the log shipper is chosen (2S8-OPS monitoring), move to structured logging with field-level redaction. For example, pino's `redact` over `email`, `name`, `legalName`, `phone`, `address` and `birthDate`. Until then, this static guard keeps every error going through one place.

---

## 5 · Other payments and personal-data points

### Pass: who can read payment events, disputes and refunds

- `paymentEvent`, `paymentDispute` and `refundDue` (`backend/src/auth/policy.ts`, matrix §25/§26) are readable by BTG admin and Finance in BTG's own tenant only, and by the super admin.
- Sponsors and payees never reach them. A sponsor sees each refund's state on their own order, never a method or a reference.
- `listPaymentEvents` is `assertTenantWide` + `whereFor`.
- Cross-tenant and same-tenant sweeps cover payouts and orders (`tenant-isolation`, 2S8-QA-07).

### Pass: money-owed-back records hold no personal or bank data

- A lost dispute records `owedBackCents` per payee, plus BTG's note.
- A `RefundDue` records the method (`BANK_TRANSFER | CHEQUE | CARD | OTHER`) and a reference that is refused if it is a card number.
- Neither holds bank details.

### Pass: payment emails are short

- The receipt (`payment.received`) states the amount and the order.
- It says that SponsorX never sees the card and that the email never includes card details.
- The `refund.sent` email names neither the method nor the reference.
- BTG's emails carry the provider's payment id, which is not personal data.

### Pass: Zoho sync sends only contacts

- Zoho receives sponsor and property contacts (name, email, phone, title) and fan leads with consent (2S6-INT-03).
- No athlete, minor, date of birth or guardian data goes to Zoho (`zoho-mapping.ts`).

### Open: O4, O5 and O6

- **O4 (Low): Zoho webhook payloads are kept for ever.**
  - `WebhookDelivery` keeps every Zoho delivery's body, RECEIVED or REJECTED. That includes invoice customer names and emails, and CRM contact payloads.
  - This is deliberate: a payload not yet applied must still be on disk (`zoho-webhooks.ts`). But nothing ever prunes it.
  - **Recommendation:** a sweep that replaces the payload of an APPLIED or REJECTED delivery older than 90 days with the same id-only record now used for payments.
- **O5 (Low): free-text notes have no card-number guard.**
  - Several notes are plain text: BTG's resolution note on a payment event (`resolutionNote`), a dispute's review and resolution notes, and a payout's send-back note.
  - The reference boxes refuse a card number; these notes do not.
  - **Recommendation:** run a "contains a Luhn-valid 13–19 digit run" check on those notes (a variant of `looksLikeCardNumber`).
- **O6 (Info): dates of birth are stored, for the age rules.**
  - `Athlete.birthDate`, `AthleteClaim.birthDate` and `Student.birthDate` are kept. They decide who is a minor and when they come of age: 2S1-BE-10/-12, guardian consent, and the coming-of-age sweep.
  - They are not payout data and are not sent to Stripe, Zoho or any email.
  - This is recorded so the owner accepts it in writing, because the brief's rule says "no DOB in any table".
  - **Recommendation:** keep it (§11 needs a date, or at least a band). Consider reducing it to the age band once the athlete is 18 and the guardian link has ended.

---

## Frontend follow-ups

None. No frontend file exposes card or personal data. The stand-in pages, the checkout gate and the payout screens were read, and no frontend code changed.

## Suite figures

All were run on the branch with the fixes:
- **Backend:** `tsc` clean, `eslint src tests worker` clean. The full suite was run twice on `sponsorx_test_a`: 180 files and 2,903 tests passed, then 180 and 2,903 again.
- **Frontend:** `tsc` clean (apart from the known phantom `LayoutProps` / `PageProps`), `eslint src tests` clean, `vitest` 105 files and 1,155 tests passed.
- **Root:** `npm run secrets:scan` found no secrets in 2,272 tracked files. `npm run audit:check` is clean: 0 in production, and the 5 dev-only highs are the one allowlisted `braces` advisory.

## Accepted in writing by the owner

The owner records a decision against each open item: **Accept** (leave as is, risk understood), **Fix** (raise a task), or **Reject** (the finding is wrong). Nothing below has been decided yet.

| # | Finding | Severity | Recommendation | Decision | By / date |
|---|---|---|---|---|---|
| O1 | Support attachments, likely guardianship proof such as a birth certificate, are emailed as file attachments to the support desk. There they sit outside SponsorX's private storage and its deletion rules. | Medium | Email a link to a signed-in admin page instead of the file, or accept it and set retention on the desk. | ____________ | ____________ |
| O2 | Support attachments are never deleted from the private bucket. | Low | Add them to the retention sweep, for example 90 days after sending. | ____________ | ____________ |
| O3 | Names, phones or addresses that another library puts in an error message are not masked; only emails and Prisma's echoed arguments are. | Low | Structured logging with field-level redaction when the log shipper is chosen. | ____________ | ____________ |
| O4 | Zoho webhook bodies, which carry contact names and emails, are kept for ever. | Low | Reduce applied or refused deliveries older than 90 days to their ids. | ____________ | ____________ |
| O5 | BTG's free-text payment notes (event resolution, dispute, payout send-back) don't refuse a card number. | Low | Refuse any note containing a Luhn-valid card-length number. | ____________ | ____________ |
| O6 | Athletes' and students' dates of birth are stored, for the minor and coming-of-age rules. The brief says "no DOB in any table". | Info | Keep, as §11 needs it. Optionally reduce it to the age band after 18. | ____________ | ____________ |
