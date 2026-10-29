# SponsorX — Polish (fix before launch)

**Urgent. Do these before cleaning up any other task on the board.**

Raised 2026-10-28 from a review of SponsorX as each kind of user would meet it: a
sponsor, an athlete and their guardian, a team, BTG staff, and a fan. Each item
was found by walking the flow and checked in the code. These are not code bugs.
Each is a place where a real person loses money, loses a minor's protection, or
is left waiting or stuck. The testers' blurry-ID report (fixed in `P8-BE-09/10/11`)
and Rodney's "how do I cancel or change a campaign" (`P8-BE-12` / `P8-FE-12`)
are the same kind of problem, so they are not repeated here.

**Tracker:** the **Polish** sheet in
`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`. Every item has a
`POL-BE-nn` row (backend, rcfworks) and/or a `POL-FE-nn` row (frontend,
HeckerCreatives). `nn` is the item's number below. A front-end row whose item
also has a back-end row waits for it.

**Tags:**
- **Money**: someone pays, is paid wrongly, or loses money.
- **Minors**: a minor's safety or a guardian's control is at risk.
- **Consent**: something happens to a person that they didn't agree to.
- **Silent**: someone is waiting and nobody is told.
- **Dead end**: the user is stuck with no way forward.

**Confirmed** means we checked it in the code. **Likely** means a reviewer reported it but we haven't checked it in the code.

| Group | Items | Why first |
|---|---|---|
| A · Money, minors, consent | 1–8 | Real money or a minor's safety |
| B · Waiting or stuck | 9–15 | People wait with no message |
| C · Confusing or extra work | 16–30 | Users find a workaround, or give up |
| D · Polish | 31–35 | Wording and links |
| E · Payments switch | 36 | Turn live payments on when polish is done |

**Do number 4 first.** It is hurting sponsors now, while Stripe is paused.

---

## A · Money, minors, consent

### 1. Payouts keep going to the old guardian
`POL-BE-01` · `POL-FE-01` · *Money · Minors* · likely

After a guardian handoff, or when a minor turns 18, the payout account is still the one
the previous guardian set up. The new guardian is told to "set up payouts", but the
button opens the old guardian's Stripe account, so every future payout goes to the
wrong person.

- **Why:** a payout account is unique per payee (the athlete), not per guardian
  (`PayoutAccount @@unique([payeeType, payeeId])`, `backend/prisma/schema.prisma`).
  The handoff (`backend/src/domain/guardian-handoff.ts`) says the new guardian
  sets up their own account, but nothing retires the old one.
- **Fix:** when a handoff completes, or an athlete comes of age, the old payout
  account stops receiving money. Payouts wait until the new account holder sets
  up their own account, and both people are told. The screen asks the new holder
  to set up their account.
- **Done when:** after a handoff or coming of age, no payout reaches the old
  account; the new holder is asked to set up; tests cover both cases.
- **The rule (decided 2026-10-28, rcfworks with Rodney's authority):**
  everything not yet paid out follows the athlete to the new holder's account.
  This replaces 2026-10-01's "money already earned stays with the account it
  was earned under". Payouts already sent stay sent.
- **Backend delivered (`POL-BE-01`, 2026-10-28):**
  - At the switch, `backend/src/domain/payout-account-holder.ts`
    *detaches* the athlete's payout account (status `NOT_SET_UP`, no
    provider account, `changedAt` set; audited `payoutAccount.detached`).
    It runs in the same transaction as the handoff or coming-of-age switch.
  - Nothing is deleted at Stripe.
  - An approved payout waits (never sent to a non-ready account).
  - "Set up payouts" (`POST /payouts/account/link`) opens a new account in
    the new holder's name. When it's READY, the waiting payouts are queued
    to it.
  - The first payouts to it go to BTG for a check (the change-review
    window; opening the new account no longer forgets that it changed).
  - Stripe's news about the old account is ignored, not retried forever.
  - The handoff and coming-of-age emails were reworded to match.
  - A guardian's other children keep their accounts.
  - Tests are in `phase2-guardian-handoff.test.ts` and
    `phase2-guardian-acts.test.ts`.
- **For `POL-FE-01` (screens):**
  - After a switch, `GET /payouts/account` reads `NOT_SET_UP` for the
    athlete. The payouts screen should say "Set up your own payout account —
    payouts are waiting for it", with the setup button.
  - Also fix the handoff card's wording in
    `frontend/src/lib/guardian-live.ts` (`handoffCarryOver`). It still says
    "Money … already earned is paid as before, to your payout account". It
    should say "Payouts already sent stay sent; anything not yet paid out
    goes to [new guardian]'s own payout account once they set it up."

### 2. A minor can make themselves an adult
`POL-BE-02` · `POL-FE-02` · *Minors* · confirmed

A minor can change their date of birth in profile edit, and it takes effect at
once with no guardian or BTG check. That starts "coming of age". The minor
uploads an ID and takes control of the account, and the guardian is removed.
`P8-BE-09/11` now refuse junk files and read the ID, but the takeover still
isn't held for a person to check.

- **Where:** `backend/src/domain/athlete-profile-change.ts`.
- **Fix:** while an athlete is a minor, a date-of-birth change is held for the
  guardian and BTG to approve. A coming-of-age takeover is always held for BTG,
  even when the ID reads clear. The screen shows "waiting for approval".
- **Done when:** a minor's DOB change doesn't apply until approved; coming of
  age never removes a guardian without BTG; tests.
- **Decided 2026-10-28 (rcfworks, with Rodney's authority):**
  - BTG alone approves a change that would make a minor an adult. The guardian
    is told.
  - A takeover is automatic only when the ID reads clear. Otherwise BTG
    decides. This replaces "always held for BTG" above.
- **Backend delivered (`POL-BE-02`, 2026-10-28):**
  - **Edits:** a new date of birth, or a move, that would make a minor an
    adult is not applied by the edit, whoever makes it (athlete or guardian).
    - Those fields become a `PENDING` profile change: `fields` holds
      `birthDate` and/or `stateCode`, and there's no ID upload. The rest of
      the edit applies.
    - BTG is emailed (`athlete.sensitiveEdit`, now saying it waits), and so
      is the guardian (`athlete.adulthoodChangeHeld`). Audited
      `athlete.adulthoodChangeHeld`.
    - BTG answers on the existing `POST /profile-changes/:id/decision`:
      `APPLY` applies it and starts coming of age; `DECLINE` needs a note,
      which the athlete reads.
    - A minor asking to be an adult can't also name a guardian.
    - A change that makes someone a minor still applies at once.
  - **Takeover:** the coming-of-age ID completes it only when it reads clear.
    - A flagged or unread ID holds it (`Athlete.comingOfAgeHeldAt`, with
      reasons). The guardian keeps control, the 90-day sweep neither ends
      nor reminds it, and BTG is emailed (`comingOfAge.heldForBtg`).
    - BTG confirms (`POST /signups/athletes/:id/coming-of-age/confirm`) or
      sends the ID back (the existing send-back, which now also ends the
      hold).
  - Migration: `20261028150000_coming_of_age_held`.
  - Tests: `phase2-profile-edits.test.ts` and `phase2-guardian-acts.test.ts`.
- **For `POL-FE-02` (screens):**
  - **Profile edit:** a held change comes back as a `PENDING` change, with
    `checkNotes` "BTG checks this change before it applies…". Show
    "Waiting for BTG", and let the athlete withdraw it (the existing
    withdraw).
  - **BTG's sensitive-edits list:** show **Apply** and **Decline (with a
    reason)** for a pending change that has no ID.
  - **Coming-of-age page** (`GET /public/coming-of-age/:token`) and the
    portal reminder (`GET /coming-of-age/mine`): `checking: true` means "ID
    received — BTG is checking it".
  - **BTG's athlete page** (`GET /signups/athletes/:id`): `comingOfAgeHeld`
    gives the reasons, and `can.confirmComingOfAge` shows a **Confirm
    takeover** button. Sending the ID back uses the existing document
    send-back.

### 3. A team can raise its cut of an athlete's earnings to 100%
`POL-BE-03` · `POL-FE-03` · *Money · Minors · Consent* · confirmed

A team can raise its share for any athlete it added directly, with one click,
without asking or telling the athlete or guardian. Minors are included. Only
invited athletes are protected.

- **Where:** `backend/src/domain/team.ts` (the share change, around lines 219–245).
- **Fix:** raising a share always needs the athlete's agreement, or the
  guardian's for a minor, however the athlete joined. Lowering it applies at
  once. Both are emailed. The athlete or guardian gets an accept or decline
  screen.
- **Done when:** no share goes up without the athlete's or guardian's yes;
  tests cover directly added athletes, invited athletes and minors.
- **Decided (2026-10-29, with Rodney's authority):** the share typed at "Add
  athlete" needs the athlete's yes too. Until they answer, BTG's standard
  team share applies.
- **Backend delivered (`POL-BE-03`, 2026-10-29):**
  - Anything that can raise the share is a **request** (`TeamShareChange`):
    - a higher share;
    - clearing it back to BTG's standard share;
    - the share typed at "Add athlete" (zero needs no answer).
  - The share stays where it was until the athlete accepts. One request is
    open per athlete, and a newer one replaces it.
  - **Lowering applies at once**, ends any open request, and is emailed
    (`team.shareLowered`).
  - **Who answers:**
    - an adult answers for themselves;
    - for a minor, only the guardian accepts (their login acting for the
      ward), the same rule as joining a team. The minor's own "accept" is
      refused with `guardian_must_act`;
    - nobody accepts during the coming-of-age pause.
  - A yes applies only while the athlete is still on that team at the share
    the request was made from. Otherwise it is refused as out of date.
  - **Emails:**
    - `team.shareChangeAsked` goes to the athlete, and to the guardian while
      the guardian acts for them;
    - `team.shareChangeAnswered` goes to the team's managers.
  - Leaving or being removed from the team lapses an open request.
  - Tests:
    - `backend/tests/phase2-team-share.test.ts`: an athlete added directly, a
      minor, the guardian, lowering, withdrawing, and a stale or lapsed
      request;
    - `phase2-team-invites.test.ts`: an invited athlete.
- **For `POL-FE-03` (screens):**
  - **Team side:**
    - `PATCH /team/roster/:id` now answers `{ id, displayName, teamShareBps,
      shareChange }`.
    - `shareChange` (`{ id, fromBps, toBps, askedAt }`, `toBps: null` =
      BTG's standard share) means it is waiting for the athlete's answer.
      Show "Waiting for {athlete}'s answer", not "Saved".
    - `POST /team/roster` answers the same way.
    - `GET /team/roster` and `GET /team/athletes` carry `shareChange` on each
      athlete.
    - `POST /team/roster/:id/share-change/withdraw` takes a request back.
  - **Athlete side** (the guardian's view of the ward too):
    - `GET /me/team` carries `membership.shareChange`.
    - Show the change from → to with Accept and Decline, calling
      `POST /me/team/share-changes/:id/respond` with
      `{ decision: "ACCEPT" | "DECLINE" }`.
    - A minor sees it but can't accept; say "Your guardian accepts this".

### 4. With Stripe paused, sponsors' orders are cancelled for "not paying"
`POL-BE-04` · `POL-FE-04` · *Money · Dead end* · confirmed · **hurting now**

The pay button is greyed out ("opens once our payment provider is connected").
Reminder emails still go out, and after 3 days the order is cancelled as unpaid.
Checkout never says payment is switched off.

- **Where:** `sweepUnpaidOrders` in `backend/src/domain/order-payment.ts` doesn't
  check whether payment is switched on.
- **Fix:** while payment is off, send no reminders and cancel nothing. Orders
  wait, and the countdown starts when payment opens. Checkout says
  plainly that payment opens later and the order is held.
- **Done when:** with payment off, no reminder and no cancellation; with it
  on, unchanged; checkout says so; tests.
- **Backend delivered (`POL-BE-04`, 2026-10-28):**
  - `paymentsOpen()` in `backend/src/lib/payment-provider.ts` is the single
    test of whether payment is open. Today it reads `PAYMENT_PROVIDER`;
    `POL-BE-36` will plug into it.
  - **While closed:**
    - An order approved now waits with **no pay-by date** (`paymentDueAt`
      null).
    - The approval email says it's held and that payment opens soon.
    - The sweep never reminds or cancels it.
    - A window already running is paused (audited
      `marketplaceOrder.paymentWindowPaused`).
  - **When payment opens:**
    - Each held order gets a fresh three days from that moment (audited
      `marketplaceOrder.paymentWindowOpened`).
    - The sponsor gets `order.paymentOpen` once ("Payment is open — please
      pay by …").
    - Reminders on days 1 and 2 and the cancel on day 3 then count from
      that moment.
  - Payment by Zoho invoice or by hand still works while closed.
  - Tests are in `backend/tests/phase2-order-automation.test.ts` (POL-BE-04
    block).
- **For `POL-FE-04` (screens), nothing new to call:**
  - `GET /marketplace-orders/:id/payment` returns `canPay: false` while
    payment is closed.
  - `GET /marketplace-orders/:id` returns `waitingOn: "PAYMENT"` with
    `deadlineAt: null` (and `paymentDueAt: null`) while the order is held.
  - Show "Held for you — card payment opens soon; we'll email your pay-by
    date", not a countdown, and say the same at checkout.

### 5. Sponsors agree to the order terms before seeing the total
`POL-BE-05` · `POL-FE-05` · *Money · Consent* · confirmed

Checkout shows "Fees: added when the order is placed" and a "Total so far" that
leaves the fees out. The real total appears only after the sponsor has committed.

- **Where:** `frontend/src/app/(app)/sponsor/checkout/page.tsx`, `…/cart/page.tsx`.
- **Fix:** the API returns a quote with fees before the order is placed, and
  checkout shows the full total next to the button that commits. If the API
  already has the quote, this needs front-end work only.
- **Done when:** the total shown before placing equals the total charged; tests.
- **Backend delivered (`POL-BE-05`, 2026-10-29):**
  - **What was missing:** the API had no quote. The buyer fee
    (`MARKETPLACE_BUYER_FEE_BPS`) was added only at the moment of placing.
  - **One quote:** `orderQuote` (in `marketplace-order-rules.ts`) gives the
    subtotal, BTG's buyer fee and the total. The cart, checkout and placing
    all use it, so the total shown is the total charged. The card charge is
    the order's `totalCents`.
  - **The guard:** placing can carry `totalCentsShown`. If it differs from
    the server's total, the order is refused with 409 `total_changed`
    ("now $X"). Nothing is placed or accepted, and the hold is kept. It is
    optional, so today's checkout keeps working.
  - Tests: `backend/tests/phase2-orders.test.ts` (POL-BE-05 block, with a 3%
    fee switched on).
- **For `POL-FE-05` (screens):**
  - **Where to read the quote:**
    - `GET /cart` → `cart.quote`;
    - `GET /reservations/:id` → `checkout.quote`.
    - Both are `{ currency, subtotalCents, feesCents, totalCents }`.
  - On checkout, show subtotal, fees and **Total** next to Place order.
  - Remove "Fees: added when the order is placed" and "Total so far".
  - The cart's own `totalCents` is still the lines' sum, so use `quote` for
    the total.
  - Send `totalCentsShown: checkout.quote.totalCents` with
    `POST /marketplace-orders`.
  - On a 409 `total_changed`, show the message and reload the quote.

### 6. A sponsor who pays twice gets no refund
`POL-BE-06` · `POL-FE-06` · *Money · Silent* · likely

BTG gets an email that a refund is needed. The order page shows no duplicate
payment and has no refund button, and nothing is added to "Refunds to send".

- **Where:** `backend/src/domain/payouts.ts` (duplicate payment, around lines 446–455).
- **Fix:** a duplicate payment creates a refund to send and flags the order.
  The order page shows it, and BTG can mark it refunded.
- **Done when:** a duplicate shows on the order and in "Refunds to send"; tests.
- **Backend delivered (`POL-BE-06`, 2026-10-29):**
  - A card payment confirmed for an order that no longer needs it is a
    **refund row of its own**, one per card payment, with a new cause:
    - `PAID_TWICE`: the order was already paid;
    - `PAID_AFTER_REFUND`: the order was already refunded;
    - `PAID_AFTER_CANCELLATION`: unchanged, the order was cancelled.
  - It is refunded to the card where the provider can: Stripe queues it, the
    test provider on staging sends it at once. With payments off it stays
    open on "Refunds to send" for Finance, who marks it sent as any other.
  - BTG's admins get the "refund needed" email only when Finance must send
    it by hand. The email now links to "Refunds to send". The sponsor gets
    the usual "refund sent" email once it is sent.
  - **The order's own refunds are unaffected.** A later refund of the order
    (a line cancelled, a delivery problem, BTG's refund, a refund made at
    Stripe) still returns its whole total: refunds of extra payments are
    never counted against it.
  - Tests: `backend/tests/phase2-line-cancellation.test.ts` (paid twice by
    card and with no provider; paid after a refund; the order's own refund
    still whole), `payment-disputes.test.ts` (a Stripe refund of the real
    payment still applies).
- **For `POL-FE-06` (screens):**
  - The order view (`GET /marketplace-orders/:id`, sponsor's and BTG's)
    already carries `refunds[]`. A row with `cause: "PAID_TWICE"` or
    `"PAID_AFTER_REFUND"` and `lineId: null` is the extra payment. Show it
    as "You paid twice: {amount} is being refunded" (sponsor) or "Paid
    twice: refund {on its way | sent on …}" (BTG).
  - "Refunds to send" (`GET /refunds`) lists it with `causeWords`. Add the
    two causes to `causeLabel` in `frontend/src/lib/refunds-live.ts`, e.g.
    "Paid twice" and "Paid after it was refunded". Until then they show as
    "Refund".
  - Marking it refunded is the existing "Mark sent" (`POST /refunds/:id/sent`).

### 7. Anyone holding the fan's phone can use up their reward
`POL-BE-07` · `POL-FE-07` · *Consent* · confirmed

The fan page has a "Staff: redeem now" button with no PIN and no confirmation.
One tap marks the reward used, whether at home or by a child, and it can't be
undone.

- **Where:** `frontend/src/server/fan-page.ts`, `frontend/src/app/r/[token]/redeem/route.ts`.
- **Fix:** staff redeem needs a code only the venue has, such as a staff PIN
  per reward or event. A redeem can be undone within a few minutes.
- **Done when:** no redeem without the venue code; an accidental redeem can be
  undone; tests.

### 8. Only the first fan can claim a shared QR code
`POL-BE-08` · `POL-FE-08` · *Silent · Dead end* · likely

An athlete's code is shown to many fans. After the first fan claims it,
everyone else sees "Your reward is ready… held for you". That is someone else's
hold, and their email is never collected.

- **Where:** `backend/src/domain/reward.ts` (around lines 651–656 and 893).
- **Fix:** each fan who scans a shared code gets their own claim, up to the
  reward's limit. The page shows the fan's own claim, or "all claimed".
- **Done when:** two fans on one code each get their own claim; tests.

---

## B · Waiting or stuck

### 9. A minor's campaign invitations never reach the guardian
`POL-BE-09` · *Minors · Silent* · confirmed

Only the guardian can accept a minor's invitation, but every email goes to the
minor (`backend/worker/jobs/notify-invitation.mts`, `to: row.email`). The deal
quietly expires.

- **Fix:** for a minor, invitation, reminder and expiry emails go to the
  guardian, with a copy to the minor.
- **Done when:** the guardian gets every email for a minor's invitation; tests.

### 10. A guardian handoff can wait forever
`POL-BE-10` · `POL-FE-10` · *Minors · Silent* · likely

There is no reminder and no expiry. BTG can't step in until the current guardian
answers, so an unreachable guardian leaves the minor stuck.

- **Fix:** remind the current guardian after 3 days. After 7 days, escalate to
  BTG, who can decide with the documents. BTG's handoff desk shows how old each
  handoff is and has a decide button.
- **Done when:** reminders and escalation run on schedule; BTG can decide an
  escalated handoff; tests.

### 11. Closing an account ignores live deals
`POL-BE-11` · `POL-FE-11` · *Money · Minors* · likely

Signed orders and due work stay open, and nobody is told: not BTG, not the
sponsor, not the guardian. A minor can close their own account. The promise
"earned money is still paid out" is wrong, because payouts need a login that has
just been switched off.

- **Where:** `backend/src/domain/account-closure.ts`, `account-closure-rules.ts`.
- **Fix:** with live deals, closing is held for BTG, which settles each deal and
  tells the sponsor. A minor's closure needs the guardian. Earned money is paid
  to the payout account on file without a login. The closing screen lists the
  live deals before confirming.
- **Done when:** no closure leaves a live deal unsettled or unannounced; a
  minor can't close alone; earned money still pays; tests.

### 12. Payouts held for review are silent
`POL-BE-12` · `POL-FE-12` · *Money · Silent* · confirmed

The payee sees "BTG reviews it next". BTG gets no email, and the dashboard
doesn't count it (`backend/src/domain/payouts.ts`, around lines 942–962).

- **Fix:** a held payout emails BTG Finance with the reason and is counted on
  the BTG dashboard.
- **Done when:** every held payout emails and is counted; tests.

### 13. Sponsors can't see or pay BTG's invoices
`POL-FE-13` · *Money · Dead end* · confirmed

"Invoices to pay" shows a count but isn't clickable (`href: undefined`,
`frontend/src/app/(app)/sponsor/page.tsx`). "Billing" in the menu is greyed out.
The API already has `GET /campaigns/{id}/invoices`.

- **Fix:** an invoices screen listing each invoice, its status and a pay link,
  reached from the count and from Billing.
- **Done when:** a sponsor can open, see and pay every invoice.

### 14. Held make-goods reach no one
`POL-BE-14` · *Silent* · likely

When a campaign under-delivers, its replacement inventory (the make-good) is
held for BTG, with no email and no count. The campaign keeps under-delivering.

- **Fix:** a held make-good emails BTG and is counted on the dashboard (see 15).
- **Done when:** every held make-good emails and is counted; tests.

### 15. BTG's dashboard counts only 4 of about 15 queues
`POL-BE-15` · `POL-FE-15` · *Silent* · confirmed

These queues have no count, so staff have to click every menu item to find work:
- new sign-ups;
- organisations;
- sponsor requests;
- handoffs;
- held listings and held orders;
- delivery issues;
- payouts;
- make-goods.

- **Fix:** one counts endpoint covering every queue that waits on BTG. The
  dashboard shows each count, linked to its queue, oldest first.
- **Done when:** every BTG queue has a count on the dashboard; tests.

---

## C · Confusing or extra work

### 16. A mistyped guardian email can't be fixed at /join
`POL-FE-16` · *Minors · Dead end* · likely

The resend button sends to the same wrong address. The API already allows
changing it.
**Fix:** a "Change guardian email" option on the /join status page.

### 17. A sponsor can't open, edit or withdraw a sent request
`POL-BE-17` · `POL-FE-17` · *Dead end* · likely

`PATCH /briefs` exists for drafts but nothing on screen uses it, and there is no
withdraw.
**Fix:** the request opens to a detail page with Edit (while still editable)
and Withdraw. The API adds withdraw if it's missing.

### 18. A sponsor can't resend the confirmation email or fix a mistyped address
`POL-BE-18` · `POL-FE-18` · *Dead end* · likely

The sponsor is stuck for the 14 days until the request lapses.
**Fix:** "Resend email" and "Change email" on the request status page, rate
limited.

### 19. A sponsor admin can't add teammates
`POL-BE-19` · `POL-FE-19` · *Dead end* · likely

There's no invite screen, and "Settings" and "Messages" are dead menu items.
**Fix:** a team screen to invite by email and set roles, with the API added if
missing. Hide the menu items that don't work yet.

### 20. "Needs your OK" points at nothing to approve
`POL-FE-20` · confirmed

It tells sponsors a campaign is waiting on them, but there is no action for
them to take.
**Fix:** show it only when there is a sponsor action, and link straight to it.

### 21. The request progress steps say things that haven't happened
`POL-FE-21` · likely

The steps say "Price agreed" and "Campaign live" before either has happened.
**Fix:** the steps follow the request's real state.

### 22. A sponsor isn't told when staffing stalls
`POL-BE-22` · `POL-FE-22` · *Silent* · likely

The sponsor keeps seeing "1 of 3 athletes signed", with no sign BTG is stepping in.
**Fix:** the API marks a stalled campaign, and the sponsor sees "BTG is finding
more athletes" with a date.

### 23. Content review has no "review by" date
`POL-FE-23` · likely

The dashboard link also lands on the campaigns list, not the post.
**Fix:** show the due date and link straight to the post. The back end adds
the date if it isn't returned.

### 24. Athletes can't decline a Campaign Order, and there's no list of orders
`POL-FE-24` · *Dead end* · likely

The API allows declining. "Orders" in the menu goes to marketplace sales.
**Fix:** a Campaign Orders list with Accept and Decline, and the menu labelled
to match.

### 25. Earnings and Payouts contradict each other
`POL-FE-25` · confirmed

Earnings says "BTG handles payouts outside the platform", while Payouts asks the
athlete to set up Stripe.
**Fix:** one consistent message.

### 26. Minors see a Stripe button that always fails
`POL-FE-26` · *Minors* · likely

Only the guardian can set up payouts, but the screen doesn't know the athlete
is a minor.
**Fix:** a minor sees "your guardian sets this up", and the guardian sees the
button.

### 27. Declining an invitation is one tap with no "are you sure?"
`POL-FE-27` · likely

Offers already ask.
**Fix:** a confirmation, as offers have.

### 28. "Confirm delivered" releases payment in one click
`POL-FE-28` · *Money* · likely

**Fix:** a confirmation that says the seller is paid.

### 29. The guardian-handoff queue lists newest first
`POL-BE-29` · *Minors* · likely

The oldest requests involving minors slip down the list.
**Fix:** oldest first.

### 30. "Reply to the email" to unsubscribe goes nowhere
`POL-FE-30` · likely

Fan emails come from a no-reply address.
**Fix:** point the fallback at the support address.

---

## D · Polish

| # | Row | What | Fix |
|---|---|---|---|
| 31 | `POL-FE-31` | A failed card payment shows a raw Stripe code (`ref: pi_…`) | Plain message: what to do next and how to contact support |
| 32 | `POL-FE-32` | A sponsor approved minutes ago is greeted "Welcome back" | "Welcome" on first sign-in |
| 33 | `POL-FE-33` | Real athletes' Settings link to "sample screens" for a made-up athlete, Riley | Remove it for real users |
| 34 | `POL-FE-34` | "You're approved" at /join has no sign-in button | Add a Sign in button |
| 35 | `POL-FE-35` | "Contact BTG" on the team's Documents and Roster pages has no link or address | Link to the support address |

---

## E · Payments switch (added 2026-10-28)

### 36. Payments on/off switch in BTG admin
`POL-BE-36` · `POL-FE-36` · *Money* · requested by the user

Stripe's live account is enabled (2026-10-28), and the live key is installed in
production with payment still **off**. Today the only switch is the Railway
setting `PAYMENT_PROVIDER` (`none` / `stripe`): changing it restarts
production, and only someone with Railway access can do it.

- **Fix:** a Payments switch on BTG's admin screen, for BTG Admin and Finance.
  It goes on or off at once, with no deploy. It needs a reason, is audited, and
  shows who changed it and when. It only works when production has a live key
  and webhook secrets, so it can never turn on a half-set-up provider; the
  Railway setting stays as the master off. While it's off, every pay and
  payout button says payments open soon, and the unpaid-order sweep waits
  (`POL-BE-04`).
- **Done when:** BTG can switch payments on and off from the admin screen; each
  change is audited with a reason; no other role can change it; off means no
  checkout, no transfer and no cancellation for non-payment; tests.

---

## Checked and fine

- marketplace order tracking;
- the 24-hour delivery deadline;
- the fan page on mobile;
- a paused or ended reward;
- every link sent in emails;
- sample data, which only shows to visitors or in demo mode, clearly labelled.
