# 2026-11-18 · tasks completed

## 2S4-BE-16 — Deal Chat: the chat, the cards and the offers (rcfworks) → Code review

**Owner, 2026-11-18:** "an answer cannot be changed once both parties approved. also the
system should double check before the signature if all is green. as simple as that."

- **One chat per seller on an order** (`DealChat`). It opens when the order is placed, behind
  the new `DEAL_CHAT` switch (off), and both sides are emailed a link. The sponsor's admin and
  the seller (athlete, guardian for a minor, team manager) write in it. The sponsor's analyst
  reads it and may report a message. BTG admins read every chat and write in none.
- **Cards:** a card is agreed when both picks match, then it is locked for both sides.
- **Offers:** free text, answered with Reply / Accept / Decline. An offer is agreed when both
  sides accept its latest message, and a reply clears both accepts. An agreed offer goes into
  the agreement word for word (D4). The card it is about is still agreed by matching picks, so
  every D3 line keeps the approved wording.
- **The form posts itself** once everything is green: every card agreed, no offer open, nothing
  waiting for BTG. **`signDealAgreement` re-checks** that right before each signature
  (`deal-chat-check.ts`). For now the form carries the original amount; 2S4-BE-15 adds the
  final amount.
- **Monitoring:** a message is held for BTG if it contains an email address, a phone number, a
  social handle, an outside link, outside payment (Venmo, PayPal, a $cashtag…), or a word on
  BTG's restricted-words list. BTG releases it, or keeps it back with a reason the sender is
  emailed. Either side can report a message. Dollar figures in agreed offers raise the money
  nudge.
- **Minors:** only the guardian accepts an offer. The minor may talk, pick and make offers.
- **Email:** the chat opening; unread messages collected after 15 minutes; a reminder to
  whoever's turn it is after every 2 working days (Mon–Fri); BTG told of a held or reported
  message. The worker sweeps every 5 minutes and closes the chats of ended orders.
- **Never edited:** a database trigger refuses any change to a message's words, author or time.
- **Permissions:** new `dealChat` and `dealChatReview` resources (RBAC matrix §24.2); authz
  digest `c9b3108754a1eb22`; the tenant-isolation sweep covers all 13 new routes.
- **Tests:** `backend/tests/deal-chat.test.ts` (17).
- **Left to 2S4-BE-15:** calling the deal off, the final amount, the payment gate, the
  10-working-day cancellation and its last warning. Keep `DEAL_CHAT` off until then.

## Dependency audit — picomatch allowlisted (rcfworks)

- A new advisory, GHSA-fc5q-39xc-vjpf (high, ReDoS), hit `picomatch`, used only by
  vitest, Vite and ESLint. No patched version exists: every version up to 4.0.7 is in range,
  and npm's only "fix" is a major vitest downgrade. The production audit is clean.
- Allowlisted as dev-only, review by 2027-01-05 (`scripts/audit-allowlist.json` and the
  security review's Dependency scan table). Without this, every PR's CI would have failed.

## 2S4-BE-16 to Done (rcfworks)

- PR #459 merged into main_development. Every Done-when clause is covered by
  `backend/tests/deal-chat.test.ts` and the authz and tenant-isolation sweeps, so the row is Done
  in the tracker. The phase plan shows 2S4-BE-14 and 2S4-BE-16 as ✅ Done.
- The Done PR goes to both main_development and main. The main PR also syncs main_development
  into main; the daily deploy follows once main is green.

## Daily deploy (rcfworks)

- #461 merged; main's CI green on 80ee77e8; `deploy-daily.yml` ran and `release` = main
  (80ee77e8). Deal Chat (2S4-BE-16) is live with `DEAL_CHAT` off.

## 2S4-BE-15 and 2S4-BE-17 — Deal Chat in the order flow, and its tests (rcfworks)

- **The chat stage:** new order state `IN_CHAT`. With `DEAL_CHAT` on, every placed order goes
  there instead of asking its seller.
- **The final amount** is agreed like a card and locked when both match, so the form never
  changes once it is out (feature spec decision 14). One step simpler than the spec's
  "amount on the form", in line with the owner's lock-then-check rule.
- **Both signed** (`afterDealsSigned`):
  - each seller's amount is spread across their lines in proportion, and the fee worked out again;
  - below the listed price or above the limit → BTG with the reason;
  - otherwise approved and the 3-day window starts.
- **The database lock on an order's figures** now also opens while the order is `IN_CHAT`,
  for the figures and the line prices only. A cancel-reason check in the same migration now
  also allows `CALLED_OFF` and `NOT_SIGNED`.
- **Call-off:** with a reason, by either side, before payment; it cancels the whole order.
  One email per person.
- **Payment gate:** `assertDealsSigned`, on card start and on any pay.
- **Signing limit:** `DEAL_CHAT_SIGNING_WORKING_DAYS` (10), with a last warning 2 working days before.
- **Lock order:** order row, then the chat or agreement. Signing now locks the order first, so
  two sellers' last signatures settle once.
- **Fixed on the way:** the money nudge listed figures in random order (no `orderBy`).
- **Tests:** `tests/deal-chat-order.test.ts` (9); `deal-chat.test.ts` updated for the amount
  step; the tenant sweep covers the two new routes. Full suite 273 files / 3,942 tests;
  frontend build and 2,400 tests; lint, audit and secret scan clean.
- **Tracker:** 2S4-BE-15 and 2S4-BE-17 at Code review. POL-BE-101 (infinex1's, merged and
  deployed) to Done; it reaches main with the next Done PR.
- `DEAL_CHAT` stays off until HeckerCreatives' screens (2S4-FE-07/08/09) are live; staging first.

## 2S4-BE-15 and 2S4-BE-17 to Done (rcfworks)

- PR #462 merged into main_development with CI green, e2e included. Every Done-when clause is
  covered by `backend/tests/deal-chat-order.test.ts`. Both rows are Done in the tracker and ✅ in
  the phase plan. The Done PR goes to main_development and main; on main it also carries
  POL-BE-101's Done row. `DEAL_CHAT` stays off.

## Deploy after #463/#464 (rcfworks)

- Main's CI passed on 70d8cc96, then `deploy-daily.yml` ran and succeeded; release = main = 70d8cc96.
  2S4-BE-15/17 are on staging (`DEAL_CHAT` still off).

## POL-BE-102 — a sponsor's Account page, backend (rcfworks)

- `GET /sponsor/account`: one read with the company's details, the person's own name, title and
  email (Clerk's), `canEdit`, the change waiting for BTG, BTG's last answer and the notification
  settings. Analysts read only; every non-sponsor role 403.
- Saved at once and audited:
  - the logo (public bucket under `sponsors/<tenant>/<sponsor>/`), website, address and billing
    contact (`PATCH /sponsor/account/company`);
  - the name and job title (`PATCH /sponsor/account/me`).
- The company name and categories wait for BTG (owner approved the plan as written):
  - `POST /sponsor/account/change`, one at a time;
  - the desk is `GET /sponsor-account-changes`, with approve and reject (with a reason) by
    BTG_ADMIN, SALES or SUPER_ADMIN, never the service account.
- An approved new name goes to Zoho once, through `zoho.pushSponsor` with `rename`, the one
  exception to Zoho owning `Account_Name` (field mapping §7.1 updated).
- Migration `20261118210000_sponsor_account`. Tests: `pol-be-102-sponsor-account.test.ts` (9), a
  rename test in `zoho-sync.test.ts`, and the tenant sweep. Full backend suite green locally.
- Tracker: POL-BE-102 at Code review. POL-FE-102 (the page) is HeckerCreatives'.

## POL-BE-102 to Done (rcfworks)

- PR #465 merged into main_development with CI green, e2e included. Every Done-when clause is
  covered by `backend/tests/pol-be-102-sponsor-account.test.ts`, except the page itself and its
  Clerk link, which are POL-FE-102. Tracker row Done. The Done PR goes to main_development and main.
- New standing rule: test folders (the local Postgres, its download, the venv and backups) are
  deleted once a task's tests pass. Today's left-overs (about 850 MB) were cleared.

## POL-BE-103 — a school advisor's Profile page, backend (rcfworks)

- `GET /advisor/profile` returns the advisor's own name, job title, phone and email (Clerk's), and
  the school's name and kind (`managedBy: "BTG"`), email domain, and roster count and last update.
- `PATCH /advisor/profile` saves the name, job title and phone at once. It is audited
  (`advisor.profileUpdate`), and the same values again write nothing.
- `GET /students/me` now lists each advisor as `{ email, name }`.
- The email domain and roster keep their existing routes. Only an ADVISOR's own login reaches
  the page; students, guardians, team managers and BTG get 403.
- Migration `20261118220000_advisor_phone` (`User.phone`). Tests: `pol-be-103-advisor-profile`
  (6), the POL-BE-101 tests updated, and the tenant sweep. Full backend suite 275 files / 3,959
  tests green locally.
- The test database and toolkit were deleted after testing.
- Tracker: POL-BE-103 at Code review. POL-FE-103 (the page) is HeckerCreatives'.

## POL-BE-102 deployed; POL-BE-103 to Done (rcfworks)

- After #466/#467, main's CI passed and `deploy-daily.yml` succeeded: release = main = c8e25144.
- PR #468 (POL-BE-103) merged into main_development with CI green, e2e included. Every Done-when
  clause is covered by `pol-be-103-advisor-profile.test.ts`, except the page itself, which is
  POL-FE-103. Tracker row Done. The Done PR goes to main_development and main.

## POL-BE-104 — a team's own details page, backend, automated; POL-BE-102 automated too (rcfworks)

- Owner, 2026-11-18: "as always we target automation". Identity changes go through at once when
  every safety check passes, and are held for BTG with the reasons when one fails.
- `GET /property/profile`: the team's name, type (BTG's), city, state, the type's details,
  description, main contact, the manager's own details, the held change and the last decision.
- Saved at once and audited:
  - the description and the main contact's name and phone (`PATCH /property/profile`);
  - the manager's name, title and phone (`PATCH /property/profile/me`).
- `POST /property/profile/change` covers name, city, state and type details. It is held when:
  - the name is taken;
  - a restricted word is in the name or details;
  - there's an open order or an offer out on the team's inventory;
  - the legal entity name or registration number changes;
  - the new state's business registration is missing;
  - the organisation is not in good standing.
  A published listing alone isn't a hold.
- BTG's desk is `/property-profile-changes` (approve and reject: BTG_ADMIN). A new name goes to
  the team's Zoho account once (new job `zoho.renameProperty`).
- POL-BE-102 brought in line. Sponsor name and category changes are now automatic, held when:
  - another sponsor has the name;
  - the name contains a restricted word;
  - a sensitive category is added;
  - an exclusive deal is running in a category being dropped.
  A new change is refused while one is held.
- Migration `20261118230000_property_profile`. Tests: `pol-be-104-property-profile` (7),
  `pol-be-102-sponsor-account` rewritten (11), the Zoho rename, and the tenant sweep. Full backend
  suite 276 files / 3,970 tests green locally. The test database and toolkit were deleted after use.
- Tracker: POL-BE-104 at Code review; POL-BE-102's note records the automation.

## POL-BE-104 to Done (rcfworks)

- PR #471 merged into main_development with CI green, e2e included. Every Done-when clause is
  covered by `pol-be-104-property-profile.test.ts` (BTG review now automated, per the owner),
  except the page itself, which is POL-FE-104. Tracker row Done. The Done PR goes to
  main_development and main; the deploy follows once main is green.
