# SponsorX — Help desk cases

**What this is.** Every situation where a SponsorX user can get stuck, written as the
tick-box case they would pick on the help desk form, and matched to the code that
causes it. It is the content for the help desk (`POL-BE-43` / `POL-FE-43`) and the
support inbox (`POL-BE-41` / `POL-FE-41`). Items 41–43 in [polish.md](polish.md)
have the plan.

**How the form uses it.**
1. The person picks a topic: Account, Payments, Guardians, Campaigns, Shop,
   Rewards, NEXT or Other.
2. They see only the cases for their role. A visitor who isn't signed in sees the
   cases marked *public*.
3. They tick what applies and press Submit. Only **Other** asks them to type.
4. The message reaches the admin **Support** inbox labelled with the case IDs,
   beside what that person has on SponsorX and what is wrong with it
   (`POL-BE-42` / `POL-FE-42`).

**How it was made.** A sweep of the code on main_development at `db34ceb7`
(2026-11-12): every error, hold reason, check finding and state a user can reach.
A case is listed only if the code produces it. Near-duplicates were merged.

**Columns**
- **ID:** the case key the form stores, e.g. `ACC-07`. Never reuse a retired ID.
- **The user ticks:** the wording on the form (first person, short).
- **Who:** athlete, minor, guardian, sponsor, teammate (a sponsor's
  non-admin login), org (team / league / agency, called *property* in the code),
  seller (athlete or org selling in the shop), fan, student, advisor, any.
  *public* = shown before sign-in.
- **Cause:** the state, error or finding in SponsorX.
- **User can already:** self-service that exists today, or *none*.
- **BTG fixes it at:** the admin page, relative to `frontend/src/app/(app)/`, or
  **none** (a gap; see the end).
- **Code:** `B/` = `backend/src/`, `F/` = `frontend/src/`, `W/` = `backend/worker/`.

---

## 1. Account

### 1.1 Signing up

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-01 | My application is locked and I can't edit it | athlete | `ApplicationClosedError` (only DRAFT / CHANGES_REQUESTED edit) | none | admin/applications (request changes) | B/domain/application-intake.ts:59-66 |
| ACC-02 | I need to add my date of birth but can't | athlete | "add your date of birth"; editing closed after submit | none | admin/applications (request changes) | B/domain/signup-rules.ts:72-73 |
| ACC-03 | BTG asked for changes but the link won't let me in | athlete | CHANGES_REQUESTED email links to /athlete; applicant has no login yet | /join in the same browser, or the receipt's /join/confirm link | admin/applications | B/domain/application-review.ts:172 |
| ACC-04 | My application is "with BTG" and I don't know why | athlete, public | held; reasons withheld from applicant | none | admin/new-signups/athletes/[id] | B/domain/athlete-signup.ts:488-489 |
| ACC-05 | I was flagged as a possible duplicate | athlete | "Likely duplicate athlete" | none | admin/new-signups/athletes/[id] | B/domain/signup-rules.ts:94 |
| ACC-06 | My application was rejected | athlete, public | REJECTED (final) | /reactivate → ask BTG (30 days), or apply again | admin/closed-accounts/[id] (decline only) | B/domain/application-review.ts:146-160 |
| ACC-07 | I was approved, then my account was rejected | athlete | `signupRejectedAt`; logins off; listings archived | /reactivate → ask BTG | admin/new-signups/athletes/[id] (Reinstate) | B/domain/signups-desk.ts:483-511 |
| ACC-08 | My account is suspended and won't activate | athlete | `reinstatement_required` | none | admin/new-signups/athletes/[id] (reject-caused only) | B/domain/athlete.ts:227-281 |
| ACC-09 | I'm approved but not active yet | athlete | APPROVED waiting for Activate; `profile_incomplete` | none | admin/applications (Activate) | B/domain/athlete.ts:241-293 |
| ACC-10 | I'm approved but have no login | athlete, student, guardian | login not made: address already used, or no email | none | **none** | B/domain/athlete-login.ts:51-81 |
| ACC-11 | It says too many attempts from my network | public | rate limit (5 sign-ups / hour per network) | wait an hour | none needed | B/routes/v1/applications.ts:86 |
| ACC-12 | My team added me but I never got an email | athlete | team adds athlete and login; no email sent | sign in at /login with that address | **none** | B/domain/team.ts:191-224 |
| ACC-13 | My company already has an account; I need access | sponsor, public | request linked to a sponsor with logins is refused | company admin invites me at /sponsor/team | admin/sponsor-requests/[id] | B/domain/sponsor-requests.ts:264 |
| ACC-14 | I forgot to give my business type | sponsor | optional at submit; no way to add it later | none | admin/sponsor-requests/[id] (set categories) | B/domain/sponsor-request-rules.ts:54 |
| ACC-15 | My sponsor request is waiting on BTG | sponsor, public | review reasons: restricted business type or words | none | admin/sponsor-requests/[id] | B/domain/sponsor-request-rules.ts:62-69 |
| ACC-16 | A sponsor with our name already exists | sponsor, public | same-name sponsor review | none | admin/sponsor-requests/[id] | B/domain/sponsor-request-rules.ts:71 |
| ACC-17 | Our sponsor request was declined | sponsor, public | DECLINED (final) | /reactivate → ask BTG; new request | admin/closed-accounts/[id] (decline only) | B/domain/sponsor-requests.ts:573-590 |
| ACC-18 | BTG closed our sponsor account | sponsor | REJECTED after approval; logins off | /reactivate → ask BTG | admin/sponsor-requests/[id] (Reinstate) | B/domain/sponsor-requests.ts:610-644 |
| ACC-19 | My request link says not valid or gone | sponsor, public | `SponsorRequestError` 400/404 | send the form again | admin/sponsor-requests | B/domain/sponsor-requests.ts:371,380 |
| ACC-20 | Our organisation name is already registered | org, public | `OnboardingNameTakenError` | rename (add your town) while editable | admin/onboarding/[id] (request changes) | B/domain/onboarding.ts:210-216 |
| ACC-21 | Review says fix it, but I can't edit after submitting | org | PENDING_REVIEW locked, yet reasons ask for a rename / new contact | documents only | admin/onboarding/[id] (request changes) | B/domain/onboarding-rules.ts:265-266 |
| ACC-22 | It says our application isn't complete | org | 422 listing the missing answers | finish the wizard | none needed | B/domain/onboarding-rules.ts:113-138 |
| ACC-23 | We're not in the US / state not accepted | org | "SponsorX operates in the United States" | none | **none** | B/domain/onboarding.ts:544 |
| ACC-24 | Our contact already has a SponsorX login | org | `emailHasLogin` review; approval refused | none while in review | admin/onboarding/[id] (request changes → new contact) | B/domain/onboarding.ts:722-729 |
| ACC-25 | BTG asked for changes to our application | org | CHANGES_REQUESTED | edit and resubmit at /onboarding/[token] | admin/onboarding/[id] | B/domain/onboarding.ts:170-199 |
| ACC-26 | Our application was rejected | org, public | REJECTED at review (final) | /reactivate → ask BTG; apply again | admin/closed-accounts/[id] (decline only) | B/domain/onboarding.ts:763-821 |
| ACC-27 | We were approved, then rejected | org | logins off, listings ended, payouts held | /reactivate → ask BTG | admin/onboarding/[id] (Reinstate) | B/domain/onboarding.ts:773-806 |
| ACC-28 | We're suspended and can't create listings | org | SUSPENDED; listing access off | none | admin/onboarding/[id] (Reinstate) | B/domain/onboarding.ts:902-907 |
| ACC-29 | There are no terms for us to accept | org | "No property terms are published yet" | none | **none** | B/domain/onboarding.ts:582 |

### 1.2 Emails and links

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-30 | I didn't get the confirmation email | athlete, sponsor, org, public | "confirm your email" missing | Resend (athlete /join, sponsor request page, org wizard) | **none** (no admin resend) | B/domain/athlete-signup.ts:514-528; B/domain/sponsor-requests.ts:519-529; B/domain/onboarding.ts:395-426 |
| ACC-31 | Resend says it's been sent too many times | athlete, sponsor, org, public | 429 (athlete 5, sponsor 3/hour, org 5) | check spam | **none** | B/domain/athlete-signup.ts:522; B/domain/sponsor-requests.ts:504-516; B/domain/onboarding.ts:435 |
| ACC-32 | I typed my email wrong | athlete, public | email can't change after submit; approval needs it confirmed | none (sponsors: Change email until confirmed) | **none** for athletes | B/domain/application-intake.ts:243; B/domain/sponsor-requests.ts:531-549 |
| ACC-33 | I applied on another device and lost my application | athlete, public | intake token only in that browser | receipt email's /join/confirm link | **none** | F/components/join-wizard.tsx:208-214 |
| ACC-34 | My confirmation link says not valid | any, public | link invalid, or bound to an old address | Resend | none needed | B/domain/athlete-signup.ts:497; B/domain/onboarding.ts:404-406 |
| ACC-35 | My link has expired | any, public | `link_expired` (14 days) | "Email me a fresh link" (one per hour) | none needed | B/lib/signed-link.ts:58-86; F/components/link-expired.tsx |
| ACC-36 | I didn't get my reactivation link | any, public | only within 30 days of closing; one per hour | /reactivate | none | B/domain/account-closure.ts:672-692 |

### 1.3 Documents and automatic checks

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-40 | My upload was refused (file type, size or empty) | any, public | upload checks (PDF / JPEG / PNG; 10 MB ID, 20 MB org) | re-upload | none needed | B/domain/signup-rules.ts:151-155; B/domain/onboarding-documents.ts:53-63 |
| ACC-41 | It says my photo is too dark, blurry or small | any, public | `too_dark` / `blurry` / `too_small` / `washed_out` / `blank` | retake and re-upload | none needed | B/domain/document-check-rules.ts:81-118 |
| ACC-42 | It says my PDF is locked or damaged | any, public | `locked` / `damaged` / `no_pages` / `not_its_type` | re-upload | none needed | B/domain/document-check-rules.ts:99-108 |
| ACC-43 | It says my document hasn't arrived | any | upload not confirmed, or removed for wrong type/size | upload again | none needed | B/lib/storage.ts:424-432 |
| ACC-44 | I can't upload any more documents | athlete, sponsor, org | limit (athlete 8, sponsor request 6, org 12 / 100) | none | **none** | B/domain/account-documents.ts:79; B/domain/sponsor-requests.ts:414 |
| ACC-45 | My document couldn't be read | any | `NO_TEXT`, held for BTG | upload a clearer copy (clears the hold, but the user isn't told) | admin/new-signups, admin/sponsor-requests/[id], admin/onboarding/[id] | B/domain/document-check-rules.ts:288-290 |
| ACC-46 | It says my name isn't on my document | any | `NAME_NOT_FOUND` (legal name, business name, org or contact name) | upload a matching copy | same pages | B/domain/document-check-rules.ts:292-294 |
| ACC-47 | It says I uploaded the wrong kind of document | any | `KIND_NOT_FOUND` ("doesn't read like a government ID / business registration") | upload the right one | same pages | B/domain/document-check-rules.ts:295-297 |
| ACC-48 | It says my ID has expired | athlete, org signer | `EXPIRED` | upload a current ID | same pages | B/domain/document-check-rules.ts:298-302 |
| ACC-49 | It says my date of birth isn't on my ID | athlete | `BIRTH_DATE_NOT_FOUND` | upload the right ID | admin/new-signups/athletes/[id] | B/domain/document-check-rules.ts:303-307 |
| ACC-50 | It won't take my school ID | athlete (adult) | "An adult uploads a government ID" | upload a government ID | none needed | B/domain/athlete-signup.ts:534 |
| ACC-51 | BTG sent my document back | athlete, sponsor, org | sent back, with reason and upload link | re-upload from the email or the page | admin/new-signups, admin/sponsor-requests/[id], admin/onboarding/[id] | B/domain/document-send-back.ts:51-64 |
| ACC-52 | A required document is missing | org | "Missing document: X" (per type and state) | upload in the wizard | admin/onboarding/[id] | B/domain/onboarding-rules.ts:170-185 |
| ACC-53 | We were flagged after removing a document | org | organisation flagged | upload a replacement at /property/documents | admin/onboarding (flagged) | B/domain/organization-documents.ts:20-24 |
| ACC-54 | I can't change our documents here | org | approved: use the portal / didn't join by the wizard | /property/documents (approved only) | **none** | B/domain/onboarding-documents.ts:111-118 |

### 1.4 Signing in

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-60 | I signed in but it says my account isn't set up | any | `unprovisioned` 403 | sign in with the address I applied with | **none** | B/auth/actor.ts:155-163 |
| ACC-61 | I signed in with a different email than I applied with | any | accounts match the primary Clerk email only | make that address primary | **none** | B/auth/clerk.ts:79-84 |
| ACC-62 | I applied but can't sign in yet | any, public | no login until approved | check the status page | none needed | B/domain/athlete-login.ts:1-19 |
| ACC-63 | My account was closed and I can't sign in | any | `account_disabled`, shown as "isn't set up" | /reactivate (not linked) | admin/closed-accounts | B/auth/actor.ts:140,166; F/server/api.ts:93 |
| ACC-64 | I was removed from my company's team | teammate | login off; message wrongly says "closed by BTG" | none | **none** | B/domain/sponsor-team.ts:224-235 |
| ACC-65 | I forgot my password or code | any, public | Clerk sign-in | "Forgot password?" on /login | none needed | F/app/login/page.tsx:63-65 |
| ACC-66 | We're approved: which email do I sign in with? | sponsor, org | the request's / primary contact's address | sponsor status page shows it | none needed | B/domain/sponsor-requests.ts:390-392 |

### 1.5 Profile changes

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-70 | I can't edit my profile yet | athlete | `profile_not_editable` (before approval, or featured) | edit the application, or claim the profile | none | B/domain/athlete-profile-change.ts:88-99 |
| ACC-71 | My legal name change needs an ID | athlete | `id_required` | attach an ID | admin/profile-changes | B/domain/athlete-profile-change.ts:257 |
| ACC-72 | My new legal name isn't showing yet | athlete | PENDING / `id_not_arrived` | confirm the upload, or withdraw | admin/profile-changes | B/domain/athlete-profile-change.ts:490-511 |
| ACC-73 | The ID for my name change was refused | athlete | `id_unreadable` / `id_wrong_type` / `id_too_large` | re-upload | none needed | B/domain/athlete-profile-change.ts:510 |
| ACC-74 | My name change is held by the ID check | athlete | `legalNameHeld` | withdraw | admin/profile-changes | B/domain/athlete-profile-change.ts:527-538 |
| ACC-75 | BTG declined or sent back my name change | athlete | DECLINE with note / ID returned | send a new change | admin/profile-changes | B/domain/athlete-profile-change.ts:601-668 |
| ACC-76 | I need to change my email or phone | any | not an editable field for any role | none | **none** | B/domain/athlete-profile-change.ts:69-75 |
| ACC-77 | We need to change our name or main contact | org | no way after approval; one manager login | none | **none** | B/domain/onboarding.ts:740-747 |
| ACC-78 | I want to choose which emails I get | any | preferences exist in the API; no page | none | **none** | B/routes/v1/me.ts:54-60 |

### 1.6 Sponsor team and organisation roster

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-80 | My teammate never got the invite | teammate, sponsor | `sponsor.teamInvite` | admin presses Resend (3 / hour) | none | B/domain/sponsor-team.ts:196-210 |
| ACC-81 | My invite is refused: that address has a login | sponsor | `SponsorTeamError` | invite another address | none | B/domain/sponsor-team.ts:147-155 |
| ACC-82 | I can't re-invite someone we removed | sponsor | removed login row blocks the invite | none | **none** | B/domain/sponsor-team.ts:150-155 |
| ACC-83 | Our only admin has left the company | sponsor, teammate | no self-removal; no admin page for logins | none | **none** | B/domain/sponsor-team.ts:19-20,96 |
| ACC-84 | The invite went to the wrong address | sponsor | invite claimed only by that exact email | remove and re-invite | none | B/domain/sponsor-team.ts:10-13 |
| ACC-85 | I'm read-only and can't do anything | teammate | SPONSOR_ANALYST | my admin changes my role | none | B/domain/sponsor-team.ts:4-6 |
| ACC-86 | Invites or resends are rate-limited | sponsor | 20 invites / 3 resends per hour | wait | none | B/domain/sponsor-team.ts:37-38 |
| ACC-87 | I can't accept a team invitation | athlete | already on a team / not approved to sell / team can't take athletes | leave my team at /athlete/team | none | B/domain/team-invitations.ts:270-278 |
| ACC-88 | We can't add or invite athletes | org | not a team or agency / not approved / athlete has an account | Invite existing athletes | admin/onboarding/[id] | B/domain/team-invitations.ts:91-92 |

### 1.7 Closing or reopening an account

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-90 | I want to close my account but can't | sponsor, teammate, student | closing exists only for athletes, guardians, organisations | none | **none** | B/domain/account-closure.ts:137-168 |
| ACC-91 | My request to close is waiting for BTG | athlete, org | HELD: live deals / money owed with no payout account / still a guardian | Withdraw | admin/closed-accounts/requests/[id] | B/domain/account-closure-impact.ts:132-138 |
| ACC-92 | BTG declined my request to close | athlete, org | `account.closeDeclined` | none | admin/closed-accounts/requests/[id] | B/domain/account-closure.ts:473-495 |
| ACC-93 | I want my account back | any, public | closed by me, within 30 days | Reactivate at /reactivate | admin/closed-accounts/[id] | B/domain/account-closure.ts:699-740 |
| ACC-94 | Reactivate is refused: BTG closed it | any, public | CLOSED_BY_BTG | ask BTG | admin/closed-accounts/[id], then Reinstate | B/domain/account-closure.ts:706 |
| ACC-95 | The 30 days to come back have passed | any, public | EXPIRED | sign up again | none | B/domain/account-closure.ts:705,813 |
| ACC-96 | I'm back, but my listings are still paused | athlete, org | re-check notes after reactivation | fix the listing / upload documents | admin/onboarding/[id] | B/domain/account-closure.ts:747-800 |
| ACC-97 | I asked BTG to look again and nothing happened | sponsor, org, public | declined request / rejected at review are final | ask BTG | admin/closed-accounts/[id] (decline only) | B/domain/sponsor-requests.ts:578-581 |
| ACC-98 | I want my data deleted or a copy of it | any, public | no request flow; only the 30-day purge after closing | close the account | **none** | B/domain/account-closure.ts:1127 |

### 1.8 Agreements and confirmations

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| ACC-100 | It says I must confirm my local rules first | athlete | `rules_attestation_required` | /athlete/confirmations | none | B/domain/rules-attestation.ts:118-122 |
| ACC-101 | It says the rules wording was updated | athlete | `rules_attestation_stale` | re-confirm | none | B/domain/rules-attestation.ts:89-91 |
| ACC-102 | It says I must accept the collaboration agreement | athlete | `collab_agreement_required` | /athlete/confirmations | none | B/domain/collab-agreement.ts:41-59 |
| ACC-103 | The agreement changed while I was reading it | any | `AgreementTextChangedError` | reload and accept | none | B/domain/agreement.ts:23-33 |
| ACC-104 | The terms I saw aren't the current ones | org | stale terms | reload and accept | none | B/domain/onboarding.ts:584 |

---

## 2. Payments

### 2.1 Paying (checkout)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-01 | The Pay button is greyed out | sponsor | payments switch off, or no provider | order shows "Not paid · held"; emailed when it opens | admin/payments | B/domain/payment-switch.ts:61-64 |
| PAY-02 | My order has no pay-by date | sponsor | payment window paused while payments are off | same | admin/payments | B/domain/order-payment.ts:226-237 |
| PAY-03 | Payments reopened and now I only have 3 days | sponsor | `order.paymentOpen` | countdown on the order | admin/marketplace/orders/[id] | B/domain/order-payment.ts:242-256 |
| PAY-04 | I can't pay until my order is approved | sponsor | PENDING_APPROVAL / PENDING_SELLER | note on the order | admin/marketplace/orders/[id] | B/domain/payouts.ts:369-374 |
| PAY-05 | The payment page wouldn't open | sponsor | provider busy or timed out (503) | try again; nothing charged | none needed | B/lib/payment-provider.ts:178-193 |
| PAY-06 | It said "BTG has the details" and wouldn't open | sponsor | `provider_refused` (only logged) | none | **none** | B/lib/payment-provider.ts:203-216 |
| PAY-07 | My card was declined | sponsor | attempt FAILED | Pay again | admin/marketplace (failed payments) | B/domain/payment-events.ts:310-323 |
| PAY-08 | The payment page expired before I finished | sponsor | session expired (1 hour) | Pay again | admin/marketplace | B/lib/stripe.ts:290-292 |
| PAY-09 | My bank's extra security check failed | sponsor | 3D Secure retried on Stripe; abandoned → expired | retry / Pay again | admin/marketplace | B/lib/stripe.ts:373-377 |
| PAY-10 | I paid but it still says "confirming" | sponsor | PROCESSING, or event waiting to match | page refreshes itself | admin/payments/events | B/domain/payment-events.ts:93-101 |
| PAY-11 | I was charged but it says the payment failed | sponsor | PaymentEvent HELD; BTG emailed | none | admin/payments/events | B/domain/payment-events.ts:293-295 |
| PAY-12 | I was charged a different amount | sponsor | HELD: amount mismatch | none | admin/payments/events | B/domain/payment-events.ts:296-298 |
| PAY-13 | I paid twice for the same order | sponsor | refund due PAID_TWICE | order shows "being refunded" | admin/refunds | B/domain/payouts.ts:444-465 |
| PAY-14 | I paid after my order was cancelled | sponsor | refund due PAID_AFTER_CANCELLATION | same | admin/refunds | B/domain/payouts.ts:450-465 |
| PAY-15 | The total changed when I placed the order | sponsor | `total_changed` | new total shown; place again | none needed | B/domain/marketplace-order.ts:130-136 |
| PAY-16 | My billing details were refused | sponsor | 422 billing problems (e.g. a card number in the PO field) | fix the form | none needed | B/domain/marketplace-order-rules.ts:243-247 |
| PAY-17 | Why is there a fee on top of my order? | sponsor | buyer fee | shown at checkout | none needed | B/domain/cart.ts:60 |
| PAY-18 | I never got my receipt | sponsor | `payment.received` email only; no receipt link | none | **none** | B/domain/order-mail.ts:138-165 |
| PAY-19 | I paid by bank transfer or cheque; it isn't showing | sponsor | AWAITING_PAYMENT until BTG records it | none | admin/marketplace/orders/[id] (mark paid) | B/domain/marketplace-order.ts:547-590 |
| PAY-20 | I paid the invoice but the order is still unpaid | sponsor | invoice not paid, or balance left | none | admin/marketplace/orders/[id] (mark paid) | B/domain/order-payment.ts:30-49 |
| PAY-21 | I paid less than the invoice, or in another currency | sponsor | audit only (`invoicePaidShort` / `invoicePaidUnmatched`) | none | **none** (audit log only) | B/domain/order-payment.ts:146-158 |
| PAY-22 | I paid the invoice after the order was cancelled | sponsor | audit only; no refund row made | none | **none** | B/domain/order-payment.ts:139-145 |
| PAY-23 | What is my spending limit? | sponsor | $5k start, doubles with completed orders, $25k cap, frozen after a refund | none (not shown) | admin/marketplace/orders/[id] | B/domain/spending-limit.ts:1-27 |

### 2.2 Refunds

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-30 | Where is my refund? | sponsor | refund due OPEN (sent by hand) | refunds list on the order | admin/refunds (mark sent) | B/domain/refunds.ts:22-40 |
| PAY-31 | My refund went to my card; when will I see it? | sponsor | SENT, method CARD | order says "gone back to the card" | admin/refunds | B/domain/refunds.ts:280-304 |
| PAY-32 | Stripe couldn't refund my card | sponsor | provider refused / HELD | none | admin/refunds, admin/payments/events | B/domain/refunds.ts:340-356 |
| PAY-33 | My refund is delayed | sponsor | provider down / partly refunded already | none | admin/refunds | B/domain/refunds.ts:256-279 |
| PAY-34 | My refund is refused because I disputed the charge | sponsor | open or lost dispute | none | admin/payments/disputes/[id] | B/domain/payment-exceptions.ts:114-123 |
| PAY-35 | My refund is blocked by a payout in progress | sponsor | payout covering the order is sending | none | admin/payouts/[id] | B/domain/marketplace-order.ts:706-715 |
| PAY-36 | I need a credit note for a refunded invoice | sponsor | Zoho credit note due | none | admin/refunds | B/domain/refunds.ts:36-38 |
| PAY-37 | The NEXT edition I bought ads in was cancelled | sponsor | refund due EDITION_CANCELLED | none | admin/refunds, admin/next/editions | B/domain/refunds.ts:398-450 |
| PAY-38 | My spending limit stopped rising after a refund | sponsor | refund freezes the limit | none | admin/marketplace/orders/[id] | B/domain/spending-limit.ts:7-27 |

### 2.3 Payouts (shop and marketplace sales, through Stripe)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-40 | I can't set up payouts yet | seller | payout set-up closed (payments switch) | button explains | admin/payments | B/domain/payouts.ts:191-193 |
| PAY-41 | The Stripe set-up page won't open | seller | provider refused / busy | try again | **none** | B/lib/payment-provider.ts:211-215 |
| PAY-42 | Payout set-up says my login has no email | seller | 409 | none | **none** | B/domain/payouts.ts:227-228 |
| PAY-43 | My payout account isn't set up | seller | NOT_SET_UP | "Set up payouts with Stripe" | none needed | B/domain/payouts.ts:168-175 |
| PAY-44 | Stripe says it needs more information | seller | NEEDS_INFO (Stripe's reason not kept) | "Continue on Stripe" | admin/payments/events | B/lib/stripe.ts:183-199 |
| PAY-45 | Stripe rejected or closed my payout account | seller | HELD; payee only sees NEEDS_INFO | none | admin/payments/events | B/domain/payouts.ts:1639-1641 |
| PAY-46 | It says nothing is ready to pay out | seller | unpaid, not confirmed, held, account, or frozen | checklist on the money page | none needed | B/domain/payouts.ts:980-989 |
| PAY-47 | My money is waiting for the sponsor to pay | seller | payable still PENDING | money page | admin/marketplace/orders/[id] | B/domain/payouts.ts:716,809 |
| PAY-48 | My money is held: the sponsor reported a problem | seller | problem lines | answer it under Sales | admin/delivery-issues | B/domain/payouts.ts:815-816 |
| PAY-49 | My money is held while BTG reviews a payment | seller | frozen: dispute or held refund | none | admin/payments/disputes/[id] | B/domain/payment-exceptions.ts:90-106 |
| PAY-50 | My payout is being reviewed by BTG | seller | REQUESTED with review reasons (over $2,000, new account, weekly cap) | status shown | admin/payouts/[id] | B/domain/payout-auto.ts:118-130 |
| PAY-51 | BTG sent my payout back | seller | REJECTED with note | read the note; request again | admin/payouts/[id] | B/domain/payouts.ts:1136-1171 |
| PAY-52 | My payout was cancelled because the sponsor was refunded | seller | REJECTED by the system | request again for other money | admin/payouts/[id] | B/domain/payouts.ts:1239-1259 |
| PAY-53 | My payout is approved but hasn't been sent | seller | APPROVED waiting (payments off, hold, account not ready) | none | admin/payments, admin/payouts/[id] | B/domain/payouts.ts:1291-1309 |
| PAY-54 | My payout failed and will be retried | seller | FAILED, retried after 1, 6, 24 hours | wait | admin/payouts | B/domain/payout-auto.ts:222-250 |
| PAY-55 | It says fix my payout account | seller | FAILED, waiting on the payee's account | fix on Stripe; resent automatically | admin/payouts/[id] | B/domain/payout-auto.ts:252-254 |
| PAY-56 | My bank returned my payout | seller | `payout.returned` | fix the account; resent automatically | admin/payouts/[id] | B/domain/payouts.ts:1593-1606 |
| PAY-57 | My payout failed and BTG is looking into it | seller | FAILED, waiting on BTG | none | admin/payouts/[id] | B/domain/payout-auto.ts:243-256 |
| PAY-58 | It says paid, but nothing reached my bank | seller | money in the Stripe balance | "Manage payouts on Stripe" | admin/payments/events | B/lib/stripe.ts:363-370 |
| PAY-59 | Part of my payout was taken back | seller | partial transfer reversal | none | admin/payments/events | B/lib/stripe.ts:348-351 |
| PAY-60 | It says I owe money back | seller | owed back after a refund or lost chargeback | none | **none** (no way to repay or collect) | B/domain/payouts.ts:640-645 |
| PAY-61 | My payouts are on hold since my account was closed or rejected | seller | payouts held | none | admin/new-signups or admin/onboarding (Reinstate) | B/domain/payout-holds.ts:21-41 |
| PAY-62 | I closed my account and I'm still owed money | seller | closure held: owed, no payout account | none | admin/closed-accounts/[id] | B/domain/account-closure-impact.ts:134-135 |

### 2.4 Tax forms

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-70 | Where do I give my W-9 / W-8? | seller | Stripe collects them during set-up | Continue on Stripe | none needed | B/lib/payment-provider.ts:328-338 |
| PAY-71 | Stripe wants tax information before paying me | seller | NEEDS_INFO (requirement not shown) | Continue on Stripe | admin/payments/events | B/lib/stripe.ts:187,195 |
| PAY-72 | My payout failed: tax ID doesn't match | seller | `incorrect_account_holder_tax_id` | fix the payout account | admin/payouts/[id] | B/lib/stripe.ts:121-136 |
| PAY-73 | Why doesn't SponsorX ask for my tax ID on campaign earnings? | athlete | not collected by design | page explains | none needed | B/domain/earning.ts:8-16 |
| PAY-74 | Where is my 1099? | seller | Stripe files them; nothing in SponsorX | none | **none** | — |

### 2.5 Campaign earnings (paid by BTG Finance outside SponsorX)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-80 | My earning is still in review | athlete | PENDING | /athlete/earnings | admin/finance (view only) | B/domain/earning-state.ts:4 |
| PAY-81 | My earning cleared but isn't approved | athlete | ELIGIBLE, auto-approval held | none | **none** (admin/finance is view only) | B/domain/earning.ts:337-415 |
| PAY-82 | My earning is approved: when am I paid? | athlete | APPROVED_FOR_PAYOUT; paid by bank outside SponsorX | none | **none** | B/domain/earning-state.ts:7-13 |
| PAY-83 | It says paid, but I haven't received it | athlete | PAID with a reference | reference shown | **none** | B/domain/earning.ts:15-16 |
| PAY-84 | My earning is on hold or disputed | athlete | HELD / DISPUTED | none | **none** | B/domain/earning-state.ts:22-58 |
| PAY-85 | My earning is held because of a complaint about my deal | athlete | deal dispute open | send documents (athlete/orders/[id]) | admin/deal-disputes/[id] | B/domain/deal-disputes.ts:13-24 |
| PAY-86 | My deal was cancelled midway: what am I owed? | athlete | HELD "Finance settles what was done" | none | **none** | B/domain/campaign-change.ts:184-191 |
| PAY-87 | My earning disappeared | athlete | VOIDED (screens can't show it) | none | **none** | B/domain/earning-state.ts:29-31 |
| PAY-88 | My earning amount changed | athlete | adjusted (audited) | none | admin/finance (view only) | B/domain/earning.ts:244-280 |
| PAY-89 | My share or commission looks wrong | athlete, org | rates fixed when the order was contracted | share shown per order | admin/commission | B/domain/commission.ts:13-21 |

### 2.6 Invoices (Zoho)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-90 | How do I pay this invoice? | sponsor | no pay link in SponsorX; Pay writes to support | Zoho's emailed link | none | F/app/(app)/sponsor/invoices/page.tsx:40-43 |
| PAY-91 | My invoice shows overdue | sponsor | due date passed | invoices page | admin/finance | F/lib/sponsor-invoices-live.ts:40-47 |
| PAY-92 | I paid but the invoice still shows unpaid | sponsor | Zoho copy behind | none | admin/integrations | B/domain/invoice-status-rules.ts:50-61 |
| PAY-93 | An invoice is missing from my list | sponsor | Zoho deal not linked | none | admin/integrations | B/domain/invoice.ts:33-44 |
| PAY-94 | My invoice says withdrawn or partly paid | sponsor | `void` / `partially_paid` | none | admin/finance | B/domain/invoice-status-rules.ts:33-36 |
| PAY-95 | I can't see our invoices | teammate | not allowed / not linked to the company | ask my sponsor admin | none | F/app/(app)/sponsor/invoices/page.tsx:59-67 |

### 2.7 Card disputes (chargebacks)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| PAY-97 | I disputed a charge with my bank | sponsor | dispute OPEN; order money frozen | none | admin/payments/disputes/[id] | B/domain/payment-exceptions.ts:293-299 |
| PAY-98 | My bank decided, but it still shows open | sponsor | stays open until BTG resolves it | none | admin/payments/disputes/[id] | B/domain/payment-exceptions.ts:429-444 |
| PAY-99 | The sponsor won a chargeback and now I owe money | seller | LOST, owed back | none | admin/payments/disputes/[id] (record only) | B/domain/payment-exceptions.ts:487-492 |

---

## 3. Guardians and minors

### 3.1 The guardian's email and link

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| GRD-01 | My guardian never got the set-up email | minor, public | guardian not confirmed | Resend on /join | admin/new-signups/athletes/[id] | B/domain/athlete-signup.ts:561-571 |
| GRD-02 | I resent it many times; now it says contact BTG | minor, public | 429 after 5 sends | none | **none** | B/domain/athlete-signup.ts:568 |
| GRD-03 | I typed my guardian's email wrong | minor, public | change allowed until the guardian is approved | change guardian on /join | none | B/domain/athlete-signup.ts:551-558 |
| GRD-04 | I need to change my guardian, but they're approved | minor | "already approved… contact BTG" | none | **none** (API only; see gaps) | B/domain/athlete-signup.ts:555 |
| GRD-05 | It won't accept my guardian's email | minor, public | must be the guardian's own, not mine | enter theirs | none | B/domain/athlete-signup.ts:409 |
| GRD-06 | My set-up link has expired | guardian, public | link expired (14 days) | renew from the expired page | none | B/domain/link-renewal.ts:77-90 |
| GRD-07 | My link says I'm no longer this athlete's guardian | guardian, public | the minor named someone else | none | **none** | B/domain/guardian-setup.ts:55 |
| GRD-08 | The page shows another child's or old details | guardian | existing guardian record reused | edit until verified | admin/new-signups/guardians/[id] (view) | B/domain/athlete-signup.ts:410-417 |
| GRD-09 | A second child named me; it only asks for proof | guardian | short page for a verified guardian | /guardian/setup | none | B/domain/guardian-setup.ts:86-93 |
| GRD-10 | I'm approved but can't sign in as a guardian | guardian | no login: address already used | none | **none** | B/domain/athlete-login.ts:52,81 |
| GRD-11 | I need to add a guardian after approval | minor | none on file | name one at /athlete/profile/edit | admin/new-signups#sensitive-edits | B/domain/athlete-profile-change.ts:305-386 |

### 3.2 Guardian verification

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| GRD-20 | Everything is in but we're still waiting | minor, guardian | "BTG confirms minors" setting on | none | admin/new-signups/athletes/[id] | B/domain/signup-rules.ts:62,97 |
| GRD-21 | My ID or proof was flagged | guardian | document check held it | none until sent back | admin/new-signups/guardians/[id] (send back) | B/domain/document-check-rules.ts:287-308 |
| GRD-22 | BTG sent my document back | guardian | returned, with upload link | re-upload on /guardian/setup | admin/new-signups/guardians/[id] | B/domain/signups-desk.ts:395-460 |
| GRD-23 | My proof must name my child; upload refused | guardian | proof missing or not for this athlete | /guardian/setup | none | B/domain/account-documents.ts:66-69 |
| GRD-24 | I can't edit my details now I'm approved | guardian | "already approved… contact BTG" | none | **none** | B/domain/guardian-setup.ts:152 |
| GRD-25 | My guardian account was closed by BTG | guardian | guardian rejected; children rejected too | contact (guardianship) | admin/new-signups/guardians/[id] (Reinstate) | B/domain/signups-desk.ts:613-660 |
| GRD-26 | My account was rejected because of my guardian | minor | rejected via guardian | none | admin/new-signups/guardians/[id] (Reinstate) | B/domain/signups-desk.ts:605 |
| GRD-27 | I'm verified for one child; the other is still pending | guardian | proof and agreement per child | short page on /guardian/setup | none | B/domain/guardian-acts.ts:124-126 |
| GRD-28 | My details were held and nothing happens | guardian (named late) | held; the guardian page can't approve | none | **none** | B/domain/athlete-signup.ts:239-268 |
| GRD-29 | I'm signed in but don't see my child | guardian | pending children never shown | none | **none** | B/domain/guardian-acts.ts:215-220 |
| GRD-30 | My state isn't recognised, so I'm treated as 18 | athlete | majority age unknown | none | admin/new-signups/rules | B/domain/age-of-majority-rules.ts:66-78 |

### 3.3 Consent and agreements

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| GRD-40 | The agreement won't accept: "text has changed" | guardian | `AgreementTextChangedError` | reload and accept | none | B/domain/agreement.ts:23-33 |
| GRD-41 | It says my child is an adult, no agreement needed | guardian | 422 | none | admin/new-signups/rules | B/domain/guardian-setup.ts:195 |
| GRD-42 | I can't accept agreements or confirm rules myself | minor | `guardian_must_act` | my guardian does it | none | B/domain/agreement.ts:130 |
| GRD-43 | Deals are blocked until rules or agreements are confirmed | minor, guardian | rules / collaboration agreement required | guardian confirms | none | B/domain/guardian-acts.ts:155-159 |
| GRD-44 | Acceptance refused: my guardian must authorise | minor | `GuardianAuthorisationRequiredError` | guardian finishes verification | admin/new-signups/athletes/[id] | B/domain/agreement.ts:164-172 |
| GRD-45 | My child can't be featured: consent not recorded | guardian | minor's consent needs a verified guardian | none | admin/next/rights | B/domain/content-rights.ts:130-133 |
| GRD-46 | I want to withdraw consent for my child | guardian | no withdraw route; only closing the account | close the child's account | **none** | B/domain/guardian-acts.ts:110-111 |
| GRD-47 | I can't close my own account | minor | guardian must act | my guardian closes it | none | B/domain/account-closure.ts:149 |

### 3.4 Changing guardian (handoff)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| GRD-50 | I can't find my child on the handoff page | guardian (new), public | not found (no athlete email, or not a minor) | none | **none** | B/domain/guardian-handoff.ts:191-196 |
| GRD-51 | My child is 18 but a minor in our state; not found | guardian (new), public | lookup ignores state majority age | none | **none** | B/domain/guardian-handoff.ts:189-195 |
| GRD-52 | It says my email belongs to someone else on SponsorX | guardian (new) | current guardian's, athlete's, or another login | use another email | none | B/domain/guardian-handoff.ts:237-243 |
| GRD-53 | I never got the confirm email and can't restart | guardian (new) | no resend; open request blocks a new one | renew with the old link only | admin/guardian-handoffs/[id] (view) | B/domain/guardian-handoff.ts:249-266 |
| GRD-54 | My handoff link has expired | guardian (new) | confirm 7 days / request 30 days | renew from the expired page | none | B/domain/guardian-handoff.ts:208-213 |
| GRD-55 | My upload was refused | guardian (new) | type, size, proof kind, 6-file limit | retry | admin/guardian-handoffs/[id] | B/domain/guardian-handoff.ts:322-326 |
| GRD-56 | BTG sent my handoff document back | guardian (new) | returned | re-upload | admin/guardian-handoffs/[id] | B/domain/guardian-handoff.ts:640-670 |
| GRD-57 | The current guardian isn't answering | guardian (new) | WAITING; reminder day 3, BTG day 7 | wait | admin/guardian-handoffs/[id] | B/domain/guardian-handoff.ts:920-990 |
| GRD-58 | My request was declined | guardian (new) | declined by the current guardian or BTG | contact (guardianship) | admin/guardian-handoffs/[id] | B/domain/guardian-handoff.ts:293-304,756-793 |
| GRD-59 | I handed off but nothing changed | guardian (current) | HANDED_OFF waiting for BTG | none | admin/guardian-handoffs/[id] (confirm) | B/domain/guardian-handoff.ts:697-737 |
| GRD-60 | The switch failed: the new guardian's login is in use | guardian | handoff error; current guardian stays | none | **none** | B/domain/guardian-handoff.ts:813-856 |
| GRD-61 | There's a guardian request I can't answer | minor | only the guardian sees the action | none | none | F/app/(app)/athlete/layout.tsx:69-70 |
| GRD-62 | Our guardian can't be reached; BTG must replace them | guardian, minor | API exists, no page uses it | none | **none** | B/domain/guardian.ts:133-144 |
| GRD-63 | Payouts stopped after the guardian changed | guardian | payout account detached | new guardian sets up Stripe | admin/payouts | B/domain/payout-account-holder.ts:56-75 |

### 3.5 Coming of age

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| GRD-70 | I turned 18 (or my state's age): what now? | athlete | 90-day takeover window | /coming-of-age/[token] | admin/new-signups/athletes/[id] | B/domain/coming-of-age.ts:96-109 |
| GRD-71 | I never got the coming-of-age email | athlete | athlete email missing | guardian sends the link | **none** | B/domain/coming-of-age.ts:81-86 |
| GRD-72 | "Send link" fails: no email, or sent too many | guardian | 422 / 429 at 10 sends | none | **none** | B/domain/coming-of-age.ts:473-477 |
| GRD-73 | New deals and listings are paused | athlete, guardian | `coming_of_age_paused` | upload my ID | none | B/domain/guardian-acts.ts:88-98 |
| GRD-74 | I uploaded my ID but it's still checking | athlete | held by the ID check | none | admin/new-signups/athletes/[id] | B/domain/coming-of-age.ts:384-418 |
| GRD-75 | BTG sent my ID back and my account is ending | athlete | sent back after the due date; ended at next sweep | re-upload within 30 days | admin/new-signups/athletes/[id] | B/domain/signups-desk.ts:438-443 |
| GRD-76 | My account was ended after 90 days | athlete | ended: logins off, listings archived | upload ID within 30 days | admin/closed-accounts | B/domain/coming-of-age.ts:116-199 |
| GRD-77 | It's too late to come back | athlete | over 30 days after ending | sign up again | none | B/domain/coming-of-age.ts:345-381 |
| GRD-78 | My guardian login stopped when my child turned 18 | guardian | guardian logins off | none | admin/closed-accounts | B/domain/coming-of-age.ts:140-160 |
| GRD-79 | I took over, but payouts stopped | athlete | payout account detached | set up my own Stripe | admin/payouts | B/domain/coming-of-age.ts:315-316 |
| GRD-80 | My date of birth or state change is waiting for BTG | minor | held: would make me an adult | withdraw | admin/new-signups#sensitive-edits | B/domain/athlete-profile-change.ts:392-428 |
| GRD-81 | I'm 18 but treated as a minor | athlete (AL, NE, MS, PR) | state majority age 19 / 21 | none | admin/new-signups/rules | B/domain/age-of-majority-rules.ts:40-53 |

### 3.6 What a minor can't do while waiting

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| GRD-90 | I can't accept offers or invitations myself | minor | `guardian_must_act` | guardian acts | none | B/domain/guardian-acts.ts:61-72 |
| GRD-91 | I can't list items myself | minor | `guardian_must_act` | guardian acts | none | B/domain/listing.ts:288 |
| GRD-92 | I can't set up or request payouts myself | minor | `guardian_must_act` | guardian on Stripe | none | B/domain/payouts.ts:190,934 |
| GRD-93 | It says "once your guardian set-up is finished" | guardian | `guardian_not_verified` | finish /guardian/setup | admin/new-signups/guardians/[id] | B/domain/guardian-acts.ts:74-86 |
| GRD-94 | I'm not getting any offers | minor | guardian not verified → not matched | guardian finishes | admin/new-signups/athletes/[id] | B/domain/auto-staffing.ts:269-282 |
| GRD-95 | My content always waits for BTG review | minor | minors always reviewed | none (by design) | admin/approvals | B/domain/content-trust-rules.ts:79-80 |
| GRD-96 | I picked one child and it shows another | guardian (several children) | stale choice cleared | child switcher | none | F/app/(app)/athlete/ward-actions.ts:16-28 |

---

## 4. Campaigns

### 4.1 Briefs and requests

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| CMP-01 | I haven't heard back about my brief | sponsor | held (any reason); sponsor sees "BTG is reviewing" | none | admin/briefs (held) | B/domain/brief-auto.ts:200-227 |
| CMP-02 | My brief is waiting because no athletes fit yet | sponsor | hold ATHLETES, re-checked daily | none | admin/briefs | B/domain/brief-auto-rules.ts:92-101 |
| CMP-03 | My budget is below the package price | sponsor | hold BUDGET | edit while a draft | admin/briefs | B/domain/brief-readiness-rules.ts:103-121 |
| CMP-04 | My campaign dates weren't accepted | sponsor | hold DATES | edit while a draft | admin/briefs | B/domain/brief-readiness-rules.ts:91-100 |
| CMP-05 | My objective is too short | sponsor | hold OBJECTIVE | edit while a draft | admin/briefs | B/domain/brief-readiness-rules.ts:80-89 |
| CMP-06 | My custom request needs pricing | sponsor | hold NO_PACKAGE | edit while a draft | admin/briefs | B/domain/brief-auto-rules.ts:82-85 |
| CMP-07 | My brand category needs extra review | sponsor | hold SENSITIVE | none | admin/briefs | B/domain/brief-auto-rules.ts:104-110 |
| CMP-08 | My account standing is holding my brief | sponsor | hold SPONSOR | none | admin/briefs | B/domain/brief-auto-rules.ts:112-113 |
| CMP-09 | I can't edit my request any more | sponsor | not a draft | Withdraw (before a campaign exists) | admin/briefs | B/domain/brief.ts:81-88 |
| CMP-10 | My request was closed and I don't know why | sponsor | CLOSED; reason never shown | none | admin/briefs | B/domain/brief.ts:312-347 |
| CMP-11 | I want to reopen a closed request | sponsor | CLOSED is final | file a new brief | none | B/domain/brief-state.ts:30-38 |
| CMP-12 | The student code on my brief isn't accepted | sponsor | `UnknownStudentCodeError` | re-enter it | **none** | B/domain/brief.ts:56-61 |

### 4.2 Staffing, offers and invitations

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| CMP-20 | My campaign still says "being set up" | sponsor | campaign DRAFT | none | admin/campaigns/[id] | B/domain/campaign-stage-rules.ts:152 |
| CMP-21 | Not enough athletes have signed | sponsor | staffing stalled | none | admin/campaigns/[id], admin/campaigns/match | B/domain/auto-staffing-rules.ts:187-209 |
| CMP-22 | Staffing stopped: my budget ran out | sponsor | stop "budget" | raise the budget | admin/campaigns/[id] | B/domain/auto-staffing-rules.ts:190-191 |
| CMP-23 | I'm still waiting for athletes to accept | sponsor | orders sent | none | admin/campaigns/[id] | B/domain/campaign-stage-rules.ts:173-175 |
| CMP-24 | My campaign hasn't launched | sponsor | waiting for the start date | none | admin/campaigns/[id] (view only) | B/domain/campaign-launch.ts:1-16 |
| CMP-25 | My invitation expired before I answered | athlete | EXPIRED | none | admin/campaigns/[id] (re-invite) | B/domain/invite-state.ts:12-16 |
| CMP-26 | My offer expired before I accepted | athlete | past `expiresAt` | none | admin/offers/[id] | B/domain/offer.ts:687 |
| CMP-27 | I asked for changes to an offer and heard nothing | athlete | change request open | can still accept or decline | admin/offers/[id] | B/domain/offer.ts:799-860 |
| CMP-28 | I was told a revised offer is coming; nothing yet | athlete | old offer withdrawn, new one not sent | none | admin/offers/[id]/edit | B/domain/offer.ts:29-33,587 |
| CMP-29 | I can't answer: the offer was withdrawn | athlete | 409 "cannot be answered" | none | admin/offers/[id] | B/domain/offer.ts:685 |
| CMP-30 | Accept failed: the terms changed | athlete | terms mismatch | reload and accept | none | B/domain/offer.ts:712-714 |
| CMP-31 | A brand restriction blocks this offer | athlete | `CategoryRestrictedError` | remove a manual restriction | admin/offers/[id] | B/domain/offer.ts:718-725 |
| CMP-32 | My item is no longer available for this offer | athlete | dates overlap / quantity | edit the item | admin/offers/[id] | B/domain/availability.ts:72-94 |
| CMP-33 | It says I already have this order | athlete | duplicate | none | admin/campaigns/[id] | B/domain/offer.ts:747 |
| CMP-34 | I can't accept my campaign order | athlete | order not sent | none | admin/campaigns/[id] | B/domain/campaign-order.ts:67-75 |
| CMP-35 | My order was cancelled with the campaign | athlete | campaign cancelled | none | admin/campaign-requests | B/domain/campaign-change-rules.ts:128-133 |

### 4.3 Content (deliverables)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| CMP-40 | The automatic check sent my draft back | athlete | checks failed (file, type, disclosure) | fix and resubmit | admin/approvals | B/domain/content-check-rules.ts:89-115 |
| CMP-41 | It says my caption needs #ad | athlete | disclosure check | fix the caption | admin/approvals | B/domain/content-check-rules.ts:105-115 |
| CMP-42 | My file type isn't accepted | athlete | JPG / PNG / WebP / MP4 / MOV only | re-upload | none | B/domain/content-check-rules.ts:31-41 |
| CMP-43 | My caption is too long | athlete | over 2,200 characters | shorten it | none | B/domain/deliverable.ts:167-170 |
| CMP-44 | It says my upload wasn't for this deliverable | athlete | wrong upload key | restart the upload | none | B/domain/deliverable.ts:124-128 |
| CMP-45 | I can't resubmit while it's being reviewed | athlete | already submitted / in review | wait | admin/approvals | B/domain/deliverable.ts:93-115 |
| CMP-46 | My draft has waited days for BTG | athlete | BTG queue over 48 hours | none | admin/approvals | B/domain/review-reminders.ts:1-12 |
| CMP-47 | The sponsor hasn't reviewed my draft | athlete | sponsor review over 48 hours | none | admin/approvals (BTG can approve) | B/domain/deliverable.ts:684-700 |
| CMP-48 | A revision was asked for: what do I change? | athlete | revision with reason | resubmit | admin/approvals | B/domain/deliverable.ts:636-675 |
| CMP-49 | I can't approve: BTG is still reviewing | sponsor | `BtgReviewFirstError` | wait | admin/approvals | B/domain/deliverable.ts:148-153 |
| CMP-50 | I want to reject this content outright | sponsor | only a revision exists | request a revision | admin/deal-disputes | B/domain/deliverable-state.ts:51-56 |
| CMP-51 | It wants a link to mark my post published | athlete | URL required | add the URL | none | B/domain/deliverable.ts:57-64 |
| CMP-52 | My post is live but not verified | athlete, sponsor | waiting for BTG to verify | none | admin/approvals | B/domain/deliverable.ts:730-745 |
| CMP-53 | My athletes' content is late | sponsor | past due, not verified | none | admin/campaigns/[id] | B/domain/delivery-health.ts:11-14 |
| CMP-54 | It says the deliverable changed; reload | athlete, sponsor | moved on | reload | none | B/domain/deliverable.ts:159-163 |

### 4.4 Results and reports

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| CMP-60 | My campaign is delivering less than promised | sponsor | make-good shortfall (sponsor never told) | none | admin/intelligence/make-goods | B/domain/makegood-engine.ts:266-279 |
| CMP-61 | My final report is "still being prepared" | sponsor | REPORTING until the final render | export on the page | **none** (nothing starts the render) | B/domain/campaign-stage-rules.ts:221-229 |
| CMP-62 | My results show no data | sponsor | posts not verified | none | admin/approvals | B/domain/sponsor-report.ts:213-231 |

### 4.5 Changes, cancellations and disputes

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| CMP-70 | My change or cancel request is waiting for BTG | sponsor | change request HELD | impact view | admin/campaign-requests | B/domain/campaign-change-rules.ts:118-124 |
| CMP-71 | I can't cancel or change a campaign in reporting | sponsor | refused for everyone | none | **none** | B/domain/campaign-change-rules.ts:107,155-156 |
| CMP-72 | I can't lower the budget below what's committed | sponsor | refused | none | admin/campaigns/[id] | B/domain/campaign-change-rules.ts:161 |
| CMP-73 | A request is already with BTG | sponsor | one at a time | none | admin/campaign-requests | B/domain/campaign-change-rules.ts:109 |
| CMP-74 | BTG declined my change request | sponsor | DECLINE with note | submit a new one | admin/campaign-requests | B/domain/campaign-change.ts:384-404 |
| CMP-75 | Only my admin can change or cancel the campaign | teammate | sponsor admin only | ask my admin | none | B/domain/campaign-change.ts:19-22 |
| CMP-76 | My deal is paused for documents | athlete | `deal_paused` | upload documents (athlete/orders/[id]) | admin/deal-disputes/[id] | B/domain/deal-pause.ts:12-21 |
| CMP-77 | I sent documents; it's still paused | athlete | DOCUMENTS_IN | none | admin/deal-disputes/[id] | B/domain/deal-disputes.ts:11-13 |
| CMP-78 | My dispute document was refused | athlete | type / size / limit of 10 | retry | admin/deal-disputes/[id] | B/domain/deal-disputes.ts:215-253 |
| CMP-79 | My deal was cancelled after a review | athlete | dispute → CANCELLED | none | admin/deal-disputes/[id] | B/domain/deal-disputes.ts:20-23 |
| CMP-80 | My campaign content is frozen with no reason | sponsor | deal paused (sponsor never shown) | none | admin/deal-disputes/[id] | B/domain/deal-pause.ts:15-19 |
| CMP-81 | I want to raise a concern about a deal | sponsor, guardian, public | only BTG opens disputes | this form | admin/deal-disputes | B/domain/deal-disputes.ts:57-58 |

---

## 5. Shop and marketplace

### 5.1 Listings (selling)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| SHP-01 | My listing is waiting for BTG approval | seller | PENDING_APPROVAL | edit (back to draft) | admin/marketplace | B/domain/listing-rules.ts:251-267 |
| SHP-02 | My listing was held for restricted words | seller | held words (shown) | edit and resubmit | admin/marketplace | B/domain/listing-rules.ts:171-174 |
| SHP-03 | It says BTG is checking my account | seller | standing reasons | none | admin/marketplace | B/domain/listing-rules.ts:231-243 |
| SHP-04 | It's held because I cancelled sold sessions | seller | 2+ seller cancellations in 90 days | none | admin/marketplace | B/domain/listing-rules.ts:192-198 |
| SHP-05 | BTG paused my listing | seller | paused by BTG; resume goes to BTG | resume | admin/marketplace | B/domain/listing.ts:705-722 |
| SHP-06 | BTG sent back or rejected my listing | seller | request changes / reject with note | edit and resubmit | admin/marketplace | B/domain/listing.ts:659-680 |
| SHP-07 | Submit refused: "not publishable yet" | seller | governance problems listed | fix the item or listing | admin/marketplace | B/domain/listing-rules.ts:150-165 |
| SHP-08 | I can't change the price while it's live | seller | pause first | pause, edit, resume | none | B/domain/inventory.ts:262 |
| SHP-09 | My item was rejected | seller | price under $1, or category clash | fix the item | none | B/domain/inventory.ts:79-96 |
| SHP-10 | I can't list: not approved or on a team | athlete | `ListingError` | none | admin/new-signups | B/domain/listing.ts:295-298 |
| SHP-11 | We can't create listings yet | org | not approved | none | admin/onboarding/[id] | B/domain/listing.ts:251 |
| SHP-12 | My athlete's own listing blocks our team listing | org | conflict | the athlete archives theirs | none | B/domain/listing.ts:275-278 |
| SHP-13 | This item already has a live listing | seller | duplicate | archive the old one | none | B/domain/listing.ts:342 |
| SHP-14 | Our listing won't go live: the athlete left our team | org | governance | none | admin/marketplace | B/domain/listing-rules.ts:154 |

### 5.2 Buying (cart and orders)

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| SHP-20 | My order is stuck waiting for the seller | sponsor | PENDING_SELLER (48 hours) | cancel the order | admin/marketplace/orders/[id] | B/domain/order-approval.ts:19-24 |
| SHP-21 | My order is waiting for BTG (over my limit) | sponsor | PENDING_APPROVAL | cancel | admin/marketplace | B/domain/marketplace-order-rules.ts:158-160 |
| SHP-22 | The seller declined my order | sponsor | SELLER_DECLINED (with reason) | order again | admin/marketplace/orders/[id] | B/domain/order-approval.ts:287,326 |
| SHP-23 | My order was cancelled: the seller never answered | sponsor | SELLER_NO_ANSWER | order again | admin/marketplace/orders/[id] | B/domain/order-approval.ts:356 |
| SHP-24 | BTG rejected my order | sponsor | BTG_REJECTED (with note) | none | admin/marketplace/orders/[id] | B/domain/marketplace-order.ts:534-542 |
| SHP-25 | My order was cancelled because I didn't pay | sponsor | UNPAID after 3 days | order again | admin/marketplace/orders/[id] (can't reopen) | B/domain/order-payment.ts:258-302 |
| SHP-26 | I can't cancel after paying | sponsor | PAID can't be cancelled | cancel a line before the cut-off | admin/marketplace/orders/[id] | B/domain/marketplace-order-rules.ts:24-44 |
| SHP-27 | Cancel is blocked while my card payment confirms | sponsor | payment confirming | wait | admin/payments/events | B/domain/marketplace-order.ts:573-585 |
| SHP-28 | My 48 hours to accept the order ran out | seller | `SellerApprovalError` | none | admin/marketplace/orders/[id] | B/domain/order-approval.ts:298-305 |
| SHP-29 | My sale was cancelled: the sponsor never paid | seller | `sale.cancelled` | Sales page | admin/marketplace/orders/[id] | B/domain/order-payment.ts:273-285 |
| SHP-30 | My checkout hold expired | sponsor | reservation expired (15 min) | reserve again | none | B/domain/reservation.ts:190 |
| SHP-31 | My cart expired or is locked | sponsor | `CartError` | new cart, or release the hold | none | B/domain/cart.ts:123,128 |
| SHP-32 | An item in my cart isn't available any more | sponsor | not listed / dates / quantity / package rule | change the cart | none | B/domain/availability.ts:72-89 |
| SHP-33 | I can't buy: my brand category isn't set | sponsor | NO_CATEGORY | none | **none** (no page sets it after approval) | B/domain/availability.ts:73 |
| SHP-34 | This item is restricted for my category | sponsor | CATEGORY_CONFLICT | pick another item or dates | none | B/domain/availability.ts:92 |
| SHP-35 | The price is below the owner's price | sponsor | SUB_FLOOR | refresh the cart | none | B/domain/availability.ts:94 |
| SHP-36 | I can't place the order: terms unavailable | sponsor | order terms not published | try later | **none** | B/domain/marketplace-order.ts:416 |
| SHP-37 | The terms changed during checkout | sponsor | `AgreementTextChangedError` | reload | none | B/domain/marketplace-order.ts:49-58 |
| SHP-38 | My order won't complete: a line is open | sponsor, seller | unsettled line (closes 30 days after the last confirm) | none | admin/marketplace/orders/[id] | B/domain/delivery.ts:482,491 |

### 5.3 Delivery problems and cancelling lines

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| SHP-40 | The seller marked it delivered, but it's wrong | sponsor | within 24 hours → problem | Report a problem | admin/delivery-issues/[id] | B/domain/delivery.ts:1324-1331 |
| SHP-41 | I missed the 24 hours to report a problem | sponsor | counts as confirmed | none | admin/marketplace/orders/[id] (order level only) | B/domain/delivery.ts:1331 |
| SHP-42 | The seller hasn't delivered and the date has passed | sponsor | overdue; seller reminded day 1 and 3, BTG day 7 | none | admin/delivery-issues/[id] | B/domain/delivery.ts:132-136 |
| SHP-43 | A sponsor reported a problem: I have 72 hours | seller | SELLER_TO_ANSWER | deliver again / refund / disagree | admin/delivery-issues/[id] | B/domain/delivery.ts:1400-1423 |
| SHP-44 | I missed my 72 hours; it went to BTG | seller | escalated | none | admin/delivery-issues/[id] | B/domain/delivery.ts:1423 |
| SHP-45 | I disagree with the seller's answer | sponsor | SPONSOR_TO_ANSWER → reject → BTG | accept / reject | admin/delivery-issues/[id] | B/domain/delivery.ts:1457-1465 |
| SHP-46 | I didn't answer the seller in time | sponsor | SPONSOR_NO_ANSWER | none | admin/delivery-issues/[id] | B/domain/delivery.ts:1465 |
| SHP-47 | When will BTG decide my problem? | sponsor, seller | ESCALATED | none | admin/delivery-issues/[id] | B/domain/delivery.ts:50-52 |
| SHP-48 | Can I cancel a line for free? | sponsor | free before the cut-off | Cancel line | admin/delivery-issues | B/domain/delivery.ts:271-301 |
| SHP-49 | Cancelling needs the seller's agreement now | sponsor | free window passed | ask the seller | admin/delivery-issues/[id] | B/domain/delivery.ts:1740-1748 |
| SHP-50 | Too late to cancel: the first date started | sponsor | blocked | report a problem after delivery | admin/delivery-issues/[id] | B/domain/delivery.ts:296-298 |
| SHP-51 | The seller declined or ignored my cancel request | sponsor | seller declined / didn't answer | none | admin/delivery-issues/[id] | B/domain/delivery.ts:1806-1815 |
| SHP-52 | Only my admin can cancel a line | teammate | sponsor admin only | ask my admin | **none** | B/domain/delivery.ts:1162,1679 |
| SHP-53 | I can't mark it delivered | seller | not paid, or a cancel request is open | answer the cancel request | admin/delivery-issues/[id] | B/domain/delivery.ts:1064-1071 |
| SHP-54 | My proof photo won't upload | seller | type / 10 MB / link | retry, or mark without proof | none | B/domain/delivery.ts:986-1034 |
| SHP-55 | I can't deliver a sold line | seller | seller cancel (counts against standing) | cancel the line | admin/delivery-issues/[id] | B/domain/delivery.ts:1858-1876 |

---

## 6. Rewards and fans

### 6.1 The QR page and the booth

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| RWD-01 | It says this code isn't valid | fan, public | unknown token | rescan | **none** | B/domain/reward.ts:69-76 |
| RWD-02 | The reward isn't active right now | fan, public | reward draft or paused | none | admin/rewards | B/domain/reward.ts:81-90 |
| RWD-03 | The reward has expired | fan, public | expired | none | admin/rewards (new reward) | B/domain/reward.ts:93-97 |
| RWD-04 | It says my code was already used | fan, public | `already_redeemed` | none | **none** | B/domain/reward.ts:102-106 |
| RWD-05 | The reward has run out | fan, public | exhausted | none | admin/rewards | B/domain/reward.ts:267-274 |
| RWD-06 | My hold ran out before I got to the booth | fan, public | hold lapsed | redeem while any are left | **none** | B/domain/reward-state.ts:116 |
| RWD-07 | It asks me to tick a box to get my code by email | fan, public | consent needed for email | claim without an email | none | B/domain/fan-consent.ts:169-178 |
| RWD-08 | The booth says claim first | fan, public | fan codes on | claim on the page | none | B/domain/reward.ts:850-855 |
| RWD-09 | It asks for a staff code | booth staff, public | staff code on | enter the code | admin/rewards | B/domain/reward.ts:124-129 |
| RWD-10 | Wrong staff code; now it's locked | booth staff, public | 5 tries, 15-minute lock | wait 15 minutes | admin/rewards | B/domain/reward.ts:133-147 |
| RWD-11 | We lost the booth staff code | sponsor | sponsor admin allowed in the API; no page | none | admin/rewards | B/domain/reward.ts:239-250 |
| RWD-12 | We redeemed by mistake and can't undo it | booth staff | undo only within 5 minutes | undo within 5 minutes | **none** | B/domain/reward.ts:151-165 |
| RWD-13 | It says someone just redeemed or it sold out | fan, public | race on the last items | retry | none | F/server/fan-page.ts:458-464 |
| RWD-14 | The reward service is busy | fan, public | 503 | retry | none | B/domain/reward.ts:329-335 |
| RWD-15 | The merchant ran out: please pause our reward | sponsor | pause is BTG only | none | admin/rewards | B/domain/reward-state.ts:5-10 |
| RWD-16 | Our reward expired and can't be relaunched | sponsor | `RewardExpiredCannotGoLiveError` | none | admin/rewards/new | B/domain/reward.ts:315-320 |
| RWD-17 | I don't have my fan reward QR code | athlete | issued by BTG; no athlete page | none | admin/rewards (print) | B/domain/reward.ts:525-551 |
| RWD-18 | Fans scan but nobody redeems | sponsor | report observation | none | admin/rewards | B/domain/sponsor-report.ts:233-238 |

### 6.2 Fan emails

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| RWD-20 | I claimed but never got my code email | fan, public | sent only with consent | reopen the QR page (same email gives the same code) | **none** | B/domain/reward.ts:887-972 |
| RWD-21 | I want to stop reward emails | fan, public | withdraw consent | one-tap unsubscribe at /u/[token] | none | B/domain/reward.ts:979-1040 |
| RWD-22 | The unsubscribe link didn't work | fan, public | falls back to an email to support | this form | **none** | F/app/u/[token]/route.ts:57-78 |
| RWD-23 | The sponsor still contacts me after I unsubscribed | fan, public | lead may already be in Zoho | unsubscribe | **none** | B/domain/reward.ts:935-941 |
| RWD-24 | My old email link no longer finds my claim | fan, public | email deleted after 90 days | none | none (by design) | B/domain/fan-data-retention.ts:2-7 |

---

## 7. SponsorX NEXT

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| NXT-01 | I applied and heard nothing | student, public | no decision email or status page | none | advisor/review (school, not BTG) | B/domain/student-auto-rules.ts:21-31 |
| NXT-02 | My application is held: roster problem | student | NO_ROSTER / NOT_ON_ROSTER / TWO_ENTRIES / GRAD_YEAR | none | advisor/review | B/domain/student-auto-rules.ts:83-88 |
| NXT-03 | It's held: no school email, or age unknown | student | ADULT_NO_DOMAIN / ADULT_OFF_DOMAIN / AGE_UNKNOWN | none | advisor/review | B/domain/student-auto-rules.ts:91-94 |
| NXT-04 | My school asked for changes but I can't edit | student | no login until approved | none | **none** | B/domain/student-moves.ts:111-112 |
| NXT-05 | I'm under 18 and my application is refused | student, public | guardian missing | add a guardian on /next/apply | none | B/domain/student.ts:193-199 |
| NXT-06 | My school isn't found | student, public | `NotASchoolError` | none | **none** | B/domain/student.ts:57-63 |
| NXT-07 | I'm approved but can't do anything | student | not active (guardian not verified) | none | **none** (verify is API only) | B/domain/student-moves.ts:41-46 |
| NXT-08 | I'm approved but have no login | student | address already used / no email | none | **none** | B/domain/athlete-login.ts:130-150 |
| NXT-09 | I've been suspended or marked as left | student | SUSPENDED / INACTIVE | none | advisor/ | B/domain/student-state.ts:33-35 |
| NXT-10 | My child's NEXT application was never sent to me | guardian | student guardian gets no set-up email | none | **none** | B/domain/student.ts:159-180 |
| NXT-11 | I claimed my profile and heard nothing | athlete (featured) | claim decided by the advisor; no decision email | none | advisor/ | B/domain/featured.ts:122-230 |
| NXT-12 | The school says it can't verify me | athlete (featured) | not on the roster; advisor can only reject | none | advisor/ (school adds a roster entry) | B/domain/featured.ts:139,329 |
| NXT-13 | My claim was rejected and nobody told me | athlete (featured) | rejected, no email | none | **none** | B/domain/featured.ts:345-368 |
| NXT-14 | My ad artwork failed the automatic checks | sponsor | type / size (PDF, PNG, JPG; 50 MB) | re-upload | admin/approvals | B/domain/artwork-checks-rules.ts:71-86 |
| NXT-15 | My artwork title has restricted words | sponsor | words check | re-upload | admin/approvals | B/domain/artwork-checks-rules.ts:97-102 |
| NXT-16 | I can't replace my artwork | sponsor | approved or in review | none | admin/approvals | B/domain/edition-artwork.ts:305-310 |
| NXT-17 | My artwork is locked: the edition is in production | sponsor | `ArtworkLockedError` | none | admin/next/editions | B/domain/edition-artwork.ts:138-145 |

---

## 8. Other

| ID | The user ticks | Who | Cause | User can already | BTG fixes it at | Code |
|---|---|---|---|---|---|---|
| OTH-01 | Something else | any, public | — opens the message box; text required | — | admin/support | — |

---

## Gaps: cases with nowhere to fix them

Each row marked **none** under *BTG fixes it at* means BTG has no page to act on it.
The help desk will at least make these visible, but they still need fixing. They
are **not** part of tasks 41–43. Raise them separately when you choose.

**Can't be fixed today (no page, API only, or refused for everyone)**

| Area | Cases | What's missing |
|---|---|---|
| Logins | ACC-10, GRD-10, NXT-08, GRD-60 | No page to give someone a login or change the email it uses |
| Email changes | ACC-32, ACC-76, ACC-77 | No email change for any role; no org contact handover |
| Closed accounts | ACC-63, ACC-64 | Closed or removed users are told "isn't set up"; no link to /reactivate |
| Sponsor team | ACC-82, ACC-83, SHP-52 | Removed teammate can't be re-invited; company whose only admin left has no way back |
| Guardian | GRD-04, GRD-24, GRD-28, GRD-29, GRD-46, GRD-62 | Replace guardian (API exists, no page), edit guardian, approve a late guardian, show a pending child, withdraw consent |
| Handoff | GRD-50, GRD-51, GRD-53 | Lookup ignores state majority age; no resend of the confirm email |
| Campaign earnings | PAY-81 – PAY-87 | admin/finance is view only; VOIDED earnings can't be shown |
| Money owed back | PAY-60, PAY-99 | Shown, but nothing to repay or collect |
| Payments | PAY-06, PAY-18, PAY-21, PAY-22 | Refused checkout only logged; no receipt resend; Zoho short or late payments only in the audit log |
| Shop | SHP-33, SHP-36 | Brand category can't be set after approval; order terms not published |
| Reports | CMP-61, CMP-71 | Nothing starts the final report; reporting campaigns can't be changed |
| Rewards | RWD-01, RWD-04, RWD-06, RWD-12, RWD-20, RWD-22, RWD-23 | No fan lookup and no redeem undo after 5 minutes |
| NEXT | NXT-04, NXT-07, NXT-10, NXT-13 | Students can't answer changes; guardian verify is API only; no emails |
| Privacy | ACC-78, ACC-98 | No email preferences page; no data export or deletion request |
| Org onboarding | ACC-23, ACC-29 | Outside the US refused; terms not published blocks onboarding |

**Users aren't told what is wrong** (the cause exists, the person never sees it)
- Athletes and sponsors held by a document check (ACC-04, ACC-45 – ACC-49): uploading a clearer copy would clear it.
- Sponsor brief closed (CMP-10), deal paused (CMP-80) and make-good shortfall (CMP-60).
- Stripe's reason for "needs more information" isn't kept (PAY-44, PAY-71).

## Decided, and still open

**Decided 2026-11-12 (the user):**
- People can tick more than one case.
- Replies go by email only. Signed-in people don't get a conversation page.

**Still open:** should a few cases answer themselves before sending? For
example, ACC-30 ("I didn't get the confirmation email") could show the Resend
button instead of opening a ticket.
