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
