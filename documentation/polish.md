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
- **Frontend delivered (`POL-FE-01`, 2026-10-29, HeckerCreatives):**
  `payouts-live.ts` `accountPanel` takes the waiting count (from
  `byState.APPROVED.count`, else the listed payouts) and shows "Set up your
  own payout account — payouts are waiting for it" with the setup button;
  `handoffCarryOver` reworded as above. Tests updated.
  - QA 2026-10-29: BTG's own handoff page ("What changes when you confirm",
    `guardian-handoffs-desk-live.ts` `confirmPoints`) still carried the old
    rule; it now says the same as the guardian's card.

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
- **Frontend delivered (`POL-FE-02`, 2026-10-29, HeckerCreatives):** the
  profile editor shows a held change as "Waiting for BTG" with Withdraw;
  BTG's sensitive-edits list applies or declines (with a note) a pending
  change that has no ID (`legal-name-decision.tsx` generalised to
  `SensitiveEditDecision`); the coming-of-age page and the portal reminder
  read "ID received — BTG is checking it" when `checking` is true; BTG's
  athlete page shows the hold's reasons and **Confirm takeover** behind a
  confirm dialog. Walked on the local stack: a minor's DOB change held, BTG's
  Decline with a note, the held takeover and its button.

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
- **Frontend delivered (`POL-FE-03`, 2026-10-29, HeckerCreatives):** the
  roster says "Waiting for {athlete}'s answer" after a raise, a first share
  or a clearing, with Withdraw, and that lowering applied at once; the Add
  form says a typed share waits for the athlete's yes. The athlete's team
  page shows the change from → to with Accept (behind a confirm naming the
  share) and Decline; a minor reads "Your guardian accepts this", and the
  guardian accepts for the ward. Walked: a raise to 25% waited, the athlete
  accepted, the share applied.

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
- **Frontend delivered (`POL-FE-04`, 2026-10-29, HeckerCreatives):**
  `order-payment-live.ts` has a `held` payment kind (`canPay: false`, nothing
  processing or failed): no CTA, no poll, no deadline chip, badge "Confirmed
  · held for you"; the order page and the just-placed card say the line
  above. Checkout (`checkout-gate.ts`, `shop-checkout.tsx`) shows a held
  notice under Place order when the reservation's `checkout.paymentsOpen`
  is false.
  - **Gap for the backend:** nothing tells the frontend payment is closed
    *before* an order exists. One line in `backend/src/domain/reservation.ts`
    (around line 127), `paymentsOpen: paymentsOpen()` on the `checkout`
    object, makes the checkout notice live; until then checkout states the
    rule for both cases.

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
- **Frontend delivered (`POL-FE-05`, 2026-10-29, HeckerCreatives):** cart
  and checkout read the quote and show Subtotal, Fees and **Total** beside
  Place order; the two old lines are gone; the order carries
  `totalCentsShown`, and a 409 `total_changed` shows the message and
  refreshes the figures. Walked with a 3% fee: $500 + $15 = $515 at the cart
  and at checkout.

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
- **Frontend delivered (`POL-FE-06`, 2026-10-29, HeckerCreatives):** the
  sponsor's order reads "You paid twice: $X is being refunded" and BTG's
  "Paid twice: refund on its way / sent on …", apart from the order's own
  refunds; Refunds to send labels "Paid twice" and "Paid after it was
  refunded". Walked on a seeded duplicate.

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
- **Decided (2026-10-29):** the code requirement goes live behind a switch,
  `REWARD_STAFF_CODE_REQUIRED`, off until the fan page asks for the code. So
  no event is left unable to redeem in between. Every switch is listed in
  [SponsorX-Switches.md](SponsorX-Switches.md).
- **Backend delivered (`POL-BE-07`, 2026-10-29):**
  - Each reward has a **six-digit staff code**, made when it is created
    (existing rewards were given one). Only the reward's managers see it:
    BTG, and the sponsor's admins.
  - **Redeem** checks the code: required once the switch is on, and checked
    whenever one is sent, even while it is off.
  - **Five wrong codes** lock that fan's code for 15 minutes, on top of the
    limit of 20 tries a minute per device.
  - **Undo:** the booth can undo the code's latest redeem within 5 minutes,
    with the staff code. The redeem is removed, so every count is right, and
    on a reward with a limit the unit goes back to the pool. Each undo is
    audited and counted on the code.
  - Tests: `backend/tests/reward.staff-code.test.ts`, and
    `rewards.read.test.ts` for who sees the code.
- **For `POL-FE-07` (screens):**
  - **Fan page** (`GET /public/rewards/:token` now carries
    `staffCodeRequired` and `undoUntil`):
    - "Staff: redeem now" asks for the staff code and confirms, then sends
      `POST /public/rewards/:token/redeem` with `{ staffCode }`. Send it even
      while `staffCodeRequired` is false.
    - Refusals by `error.code`:
      - `staff_code_required`;
      - `wrong_staff_code` (the message says how many tries are left);
      - `staff_code_locked` (429).
    - While `undoUntil` is in the future, show **Undo**, which asks for the
      code and sends `POST /public/rewards/:token/redeem/undo` with
      `{ staffCode }`. Refused: `nothing_to_undo`, `undo_window_closed`.
  - **Reward page** (BTG and the sponsor's admins): `GET /rewards/:id`
    carries `staffCode`. Show it, with **New code**
    (`POST /rewards/:id/staff-code`), which replaces it at once.
  - Each token carries `undoneRedeems` and `lastUndoneRedeemAt`, beside
    `refusedRedeems`.
  - **When the fan page ships:** tell rcfworks, who turns
    `REWARD_STAFF_CODE_REQUIRED` on, staging first.
- **Frontend delivered (`POL-FE-07`, 2026-10-29, HeckerCreatives):** "Staff:
  redeem now" is a no-script `<details>` panel asking for the six-digit code
  and confirming; refusals read in plain words (tries left, locked for 15
  minutes); **Undo that redeem** while `undoUntil` is open; BTG's reward QR
  panel shows the staff code with a two-click **New code** and each token's
  refused / undone counts. The page is still 0 scripts, 0 fonts. Walked with
  the switch on: wrong code, right code, undo, new code.
  **rcfworks:** the fan page has shipped — turn `REWARD_STAFF_CODE_REQUIRED`
  on in staging, then production.

### 8. Only the first fan can claim a shared QR code
`POL-BE-08` · `POL-FE-08` · *Silent · Dead end* · likely

An athlete's code is shown to many fans. After the first fan claims it,
everyone else sees "Your reward is ready… held for you". That is someone else's
hold, and their email is never collected.

- **Where:** `backend/src/domain/reward.ts` (around lines 651–656 and 893).
- **Fix:** each fan who scans a shared code gets their own claim, up to the
  reward's limit. The page shows the fan's own claim, or "all claimed".
- **Done when:** two fans on one code each get their own claim; tests.
- **Decided (2026-10-29):** behind a switch, `REWARD_FAN_CODES`, off until the
  fan page sends the fan on to their own code (as with item 7). Listed in
  [SponsorX-Switches.md](SponsorX-Switches.md).
- **Backend delivered (`POL-BE-08`, 2026-10-29):**
  - A code issued from the desk is a **shared code** (an athlete's QR). A fan
    claiming through it gets a **code of their own** (`parentTokenId`), with
    the shared code's athlete. The claim, the hold on a reward with a limit,
    the voucher email and the redeem are all on the fan's code; it is never
    printed.
  - **An address already used** on the reward gets its own code back, not a
    second one. A fan who gave no address can't be recognised by the API.
  - **The shared code's page** is the offer: never another fan's claim or
    hold. "All claimed" (`state: EXHAUSTED`) once the limit is held or used.
    Redeeming the shared code itself is refused (`claim_first`).
  - **The desk** lists the printed codes only; each one's funnel, refused and
    undone redeems include its fans' codes. Reports count through the reward
    and the athlete, so they include fans' codes unchanged.
  - Existing codes are treated as shared codes; claims already made on them
    stay as they were.
  - Tests: `backend/tests/reward.fan-codes.test.ts`, and
    `rewards.read.test.ts` for the desk's totals.
- **For `POL-FE-08` (screens):**
  - `GET /public/rewards/:token` carries `kind`: `SHARED` (an athlete's QR),
    `FAN` (one fan's own code) or `CODE` (switch off: as before).
  - On a `SHARED` page, "Claim" posts as today. The answer carries `code`:
    the fan's own code. Redirect to `/r/{code}`, and remember it in the
    browser for this shared code, so a fan who scans again goes straight to
    their code instead of making another.
  - The staff redeem and undo belong on the `FAN` page, never the `SHARED`
    one. A redeem on a shared code answers `claim_first`.
  - `state: EXHAUSTED` on a shared page: show "All claimed".
  - **When it ships:** tell rcfworks, who turns `REWARD_FAN_CODES` on,
    staging first.
- **Frontend delivered (`POL-FE-08`, 2026-10-29, HeckerCreatives):** a claim
  on a shared code follows the answer's own code to `/r/{code}`, remembered
  per shared code in an httpOnly cookie so a second scan lands straight on
  it; the shared page shows only the offer and "All claimed" when exhausted;
  staff redeem and undo live on the fan's page. Walked with the switch on:
  two scans, one own code. **rcfworks:** turn `REWARD_FAN_CODES` on in
  staging, then production.

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
- **Backend delivered (`POL-BE-09`, 2026-10-29):**
  - The new-invitation email, the 3-day reminder and the expiry warning go
    to the **guardian while the guardian acts for the athlete**: the same
    rule as accepting, so through the coming-of-age period until the ID
    check too. Worded for them: "Mia has a new campaign invitation… As
    Mia's guardian, you accept or decline it."
  - The minor gets a **copy** saying their guardian decides, when they have
    an address. An adult's emails are unchanged.
  - One once-only key per recipient (`…:guardian` for the guardian's), so
    the hourly sweep sends each person one.
  - Tests: `backend/tests/invitation-guardian-mail.test.ts` (the real jobs),
    `b2b4.test.ts` (who is emailed, and the wording).
  - No screen work: the guardian already answers on the ward's invitations
    page, which the emails link to.

### 10. A guardian handoff can wait forever
`POL-BE-10` · `POL-FE-10` · *Minors · Silent* · likely

There is no reminder and no expiry. BTG can't step in until the current guardian
answers, so an unreachable guardian leaves the minor stuck.

- **Fix:** remind the current guardian after 3 days. After 7 days, escalate to
  BTG, who can decide with the documents. BTG's handoff desk shows how old each
  handoff is and has a decide button.
- **Done when:** reminders and escalation run on schedule; BTG can decide an
  escalated handoff; tests.
- **Backend delivered (`POL-BE-10`, 2026-10-29):**
  - **Hourly check:**
    - 3 days after a request reaches the current guardian, they get one
      reminder (`handoff.reminder`).
    - At 7 days with no answer it is **escalated** (`escalatedAt`). BTG's
      admins, the requester and the current guardian are told.
  - **BTG decides an escalated request** on the existing staff decision
    (`POST /guardian-handoffs/:id/staff-decision`): `CONFIRM` runs the
    switch, `DECLINE` needs a reason the requester reads. Before 7 days it is
    refused: still with the current guardian.
  - **The current guardian can still answer** after escalation. The first
    answer decides: the request's row is locked while either is saved.
  - When BTG confirms a request the guardian never answered, the emails say
    so (`byBtg`), never "you handed off".
  - Tests: `backend/tests/phase2-guardian-handoff-escalation.test.ts`.
- **For `POL-FE-10` (screens):**
  - Each request now carries `sentAt`, `waitingDays` (while with the current
    guardian), `remindedAt`, `escalatedAt` and `btgMayDecide`.
  - **Desk:** "Waiting for BTG" (`?group=WAITING_FOR_BTG`) now also holds
    escalated requests, and its count includes them. Show the age ("waiting
    9 days"), and "No answer from the current guardian" when `escalatedAt`
    is set. Show Confirm and Decline whenever `btgMayDecide` is true.
  - **Current guardian's card:** still shows Hand off and Decline after
    escalation. Add "BTG will review this if you don't answer" once
    `escalatedAt` is set.
- **Frontend delivered (`POL-FE-10`, 2026-10-29, HeckerCreatives):** the desk
  shows each request's age ("waiting 9 days"), "No answer from the current
  guardian" once escalated, the reminded / escalated dates, and Confirm and
  Decline whenever `btgMayDecide`; the guardian's card keeps Hand off and
  Decline and adds "BTG will review this if you don't answer". Walked on a
  seeded escalated request.

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
- **Decided (2026-10-29):**
  - Money earned with no payout account holds the closure for BTG, as a
    live deal does.
  - A guardian who still acts for a minor is held for BTG too, who arranges
    a new guardian (or closes the minor's account) first.
- **Backend delivered (`POL-BE-11`, 2026-10-29):**
  - **Held for BTG** (`ClosureRequest`, filed in BTG's tenant) when closing
    would leave something behind:
    - a **live deal**: a campaign order sent, accepted or under way, or a
      marketplace sale unpaid, in delivery, delivered but not confirmed, or
      with a problem;
    - money earned with no payout account;
    - a guardian still acting for a minor.
  - While held, the account stays open and nothing is switched off. The
    owner, BTG's admins and the sponsor on each live deal are emailed.
  - **BTG** settles each deal with the existing tools, then **closes it**
    (refused, listing what is still open, until nothing is), or
    **declines** it with a reason. The owner can **withdraw** it.
  - **A minor's account is closed by their guardian**, never the minor's
    own login (`guardian_must_act`), by the same rule as accepting.
  - Closing **declines the account's open invitations**, and **requests its
    earned money** as the system to the payout account on file: at once,
    and hourly while it is closed, for money whose holding period ends later.
  - Tests: `backend/tests/phase2-closure-live-deals.test.ts`.
- **For `POL-FE-11` (screens):**
  - **Before confirming,** call `GET /me/close/preview` (`?account=` when
    the login has more than one). Show `liveDeals` (title, sponsor, state,
    and for a guardian the minor's name), `openInvitations`, `money`
    (`owedCents`, `accountReady`) and `wards`. When `wouldHold` is true, say
    BTG will settle these first, with `holdReasons`.
  - `POST /me/close` answers **202 `state: HELD`** (with `requestId`,
    `holdReasons`, `liveDeals`) instead of 200 when held. Show "Waiting for
    BTG", with **Withdraw** (`POST /me/close/withdraw`). The preview's
    `heldRequest` shows it on a later visit.
  - A minor's own login gets 403 `guardian_must_act`: say "Your guardian
    closes your account". The guardian closes it while acting for the
    minor, with `account: "athlete"`.
  - **BTG desk:** `GET /account-closure-requests` (held, oldest first) and
    `GET /account-closure-requests/:id`, which carries `now` (what is still
    live) and `canClose`. Buttons: **Close now**
    (`POST …/:id/close`, 409 with what is open until `canClose`) and
    **Decline** (`POST …/:id/decline`, `{ note }`).
- **Frontend delivered (`POL-FE-11`, 2026-10-29, HeckerCreatives):** the
  closing dialog lists live deals, open invitations, money and wards before
  confirming and says BTG settles these first; a held closure reads "Waiting
  for BTG" with Withdraw, now and on a later visit; a minor's own login reads
  "Your guardian closes your account" and the guardian closes it for the
  ward; BTG's Closed accounts desk gains a **Waiting to close** tab with each
  request's detail, Close now (a 409 lists what is still open) and Decline
  with a note. Walked: five live deals held the closure, the desk refused
  Close now with the list, the athlete withdrew. One fix from the walk: the
  close dialog was trapped inside the settings card by the card's entrance
  animation — the `sx-fade-up` keyframe now ends on `transform: none`, which
  frees every fixed dialog on the site, and the dialog is portaled too.

### 12. Payouts held for review are silent
`POL-BE-12` · `POL-FE-12` · *Money · Silent* · confirmed

The payee sees "BTG reviews it next". BTG gets no email, and the dashboard
doesn't count it (`backend/src/domain/payouts.ts`, around lines 942–962).

- **Fix:** a held payout emails BTG Finance with the reason and is counted on
  the BTG dashboard.
- **Done when:** every held payout emails and is counted; tests.
- **Backend delivered (`POL-BE-12`, 2026-10-29):**
  - **Email when held.** A payout the automatic approval holds for BTG emails
    the books' Finance team and BTG admins, once each
    (`payout.heldForReview`). It gives the payee, the amount, the reasons and
    a link to the payout. This includes payouts SponsorX requests for a
    closed account.
  - **Failed payouts** handed to BTG (`payout.failedForBtg`) now reach
    Finance too, not only the admins.
  - **Counted on BTG's board.** `GET /operations/board` carries
    `payouts: { waiting, oldestSince }`: held at request, or failed and
    handed to BTG. It is null for roles that don't read every payout.
  - Tests: `backend/tests/phase2-payout-automation.test.ts` (who is emailed
    or not, and the count going down once decided), and
    `operations-board.test.ts` (the count, the oldest, the tenants kept
    apart).
- **For `POL-FE-12` (screens):** add a "Payouts to review" card to BTG's
  board from `queues.payouts.waiting`, with "oldest waiting since"
  `oldestSince`, linked to `/admin/payouts` (waiting on BTG).
- **Frontend delivered (`POL-FE-12`, 2026-10-30, HeckerCreatives):** a fifth
  "Needs BTG action" card on `/admin`, **Payouts to review**, from
  `queues.payouts` (`ops-board-live.ts`). It counts in the board's total and
  the action ring with its own arc, carries "oldest waiting since Oct 7" on
  the desk's clock (America/New_York) when something waits, and opens
  `/admin/payouts`. A role the API gives `null` to, or an API without the
  field, gets no card; the deck goes five across at desktop width. Walked
  locally at 0 and at 1 waiting (the failed payout flipped to BTG, then put
  back). The make-goods card (`queues.makeGoods`) stays with `POL-FE-15`.

### 13. Sponsors can't see or pay BTG's invoices
`POL-FE-13` · *Money · Dead end* · confirmed

"Invoices to pay" shows a count but isn't clickable (`href: undefined`,
`frontend/src/app/(app)/sponsor/page.tsx`). "Billing" in the menu is greyed out.
The API already has `GET /campaigns/{id}/invoices`.

- **Fix:** an invoices screen listing each invoice, its status and a pay link,
  reached from the count and from Billing.
- **Done when:** a sponsor can open, see and pay every invoice.
- **Frontend delivered (`POL-FE-13`, 2026-10-29, HeckerCreatives):**
  `/sponsor/invoices` (`sponsor-invoices-live.ts`, `server/sponsor-invoices.ts`)
  lists one server page of the sponsor's campaigns and reads each
  `GET /campaigns/:id/invoices` in parallel; tiles for to pay, overdue and
  paid (summing the page, and saying so); void invoices hidden; `sent` past
  `dueAt` reads as overdue. "Invoices to pay" on the dashboard and Billing in
  the menu both open it.
  - **Gaps for the backend:** `GET /earnings/invoices` is gated on `earning`
    read, which sponsors don't have, so there is no single sponsor list; and
    the Zoho mirror (`CampaignInvoice`) carries **no pay URL**, so "Pay →" is
    a `mailto:` to support naming the invoice, with a note that the secure
    link is in the invoice email. A `payUrl` field on the invoice row would
    make it a real pay link.

### 14. Held make-goods reach no one
`POL-BE-14` · *Silent* · likely

When a campaign under-delivers, its replacement inventory (the make-good) is
held for BTG, with no email and no count. The campaign keeps under-delivering.

- **Fix:** a held make-good emails BTG and is counted on the dashboard (see 15).
- **Done when:** every held make-good emails and is counted; tests.
- **Backend delivered (`POL-BE-14`, 2026-10-29):**
  - **Email when held.** Each night a make-good is held for a person, its
    approvers (BTG admins and campaign managers) get `makegood.held`, once
    per make-good each, however many nights it is refreshed. It gives:
    - the campaign and sponsor;
    - how far short it is projected to fall;
    - why it wasn't approved automatically;
    - the best substitute;
    - a link to it in the make-good centre.
  - **Counted on BTG's board.** `GET /operations/board` carries
    `makeGoods: { waiting, oldestSince }` (open make-goods). It is null for
    roles that don't see make-goods.
  - Make-goods already waiting are emailed on the first night after this
    ships.
  - Tests: `backend/tests/makegood.test.ts` (who is emailed, once; the
    automatic one emails nobody; the count; Finance doesn't see it).
- **For screens:** the board card is part of `POL-FE-15`. Show "Make-goods
  to decide" from `queues.makeGoods.waiting`, linked to
  `/admin/intelligence/make-goods`.

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
**Delivered (`POL-FE-16`, 2026-10-29):** `join-checklist.tsx` offers "Change
guardian email", which reopens the guardian form pre-filled (email blank) and
posts through the existing `POST /applications/intake/guardian`, allowed until
BTG approves the guardian.

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
**Delivered (`POL-FE-20`, 2026-10-29):** campaign state `APPROVAL` means fully
staffed and launching by itself, so it now reads "Ready to start". The only
sponsor-side action the API signals is a post in `SPONSOR_REVIEW`
(`GET /campaigns?review=true`), so "Needs your OK" shows only when that count
is above zero, links to the review filter, and the campaign table's chip
links "Approve posts →" to the campaign.

### 21. The request progress steps say things that haven't happened
`POL-FE-21` · likely

The steps say "Price agreed" and "Campaign live" before either has happened.
**Fix:** the steps follow the request's real state.
**Delivered (`POL-FE-21`, 2026-10-29):** steps are now Sent · BTG review ·
Athletes signed · Campaign live, driven by the brief's state and its
campaign's state (`brief-status.ts` `requestStepNow`).

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
**Delivered (`POL-FE-23`, 2026-10-29):** each card on the content desk shows
"review by …" (warn colour once overdue) and the drawer has a Review by row;
`/admin/approvals?open=<id>` opens a post directly, and the BTG board lists
posts to review, soonest first, each opening its post.
- **Gap for the backend:** the API returns no review deadline. The screen
  computes it as `waitingSince` + 48 h (the reminder policy in
  `review-reminders.ts`), falling back to the latest upload time, never later
  than the post's `dueDate`. A `reviewBy` field on the deliverable row would
  replace `reviewBy()` in `approvals-live.ts` in one place. The BTG reminder
  email could also deep-link to `/admin/approvals?open=<id>`.

### 24. Athletes can't decline a Campaign Order, and there's no list of orders
`POL-FE-24` · *Dead end* · likely

The API allows declining. "Orders" in the menu goes to marketplace sales.
**Fix:** a Campaign Orders list with Accept and Decline, and the menu labelled
to match.
**Delivered (`POL-FE-24`, 2026-10-29):** `/athlete/orders` lists Campaign
Orders with Review & accept and a confirmed Decline (`POST
/orders/:id/transition { to: "REJECTED" }`); the menu has "Campaign orders"
under Campaigns and the marketplace item is "Sales". There is no `GET /orders`
list in the API, so the page is built from `GET /invitations?state=accepted`,
whose rows carry the order each accepted invitation became.

### 25. Earnings and Payouts contradict each other
`POL-FE-25` · confirmed

Earnings says "BTG handles payouts outside the platform", while Payouts asks the
athlete to set up Stripe.
**Fix:** one consistent message.
**Delivered (`POL-FE-25`, 2026-10-29):** both pages use one sentence
(`PAYOUT_ROUTE_LINE`) and Earnings links to Payouts; "outside the platform" is
gone.

### 26. Minors see a Stripe button that always fails
`POL-FE-26` · *Minors* · likely

Only the guardian can set up payouts, but the screen doesn't know the athlete
is a minor.
**Fix:** a minor sees "your guardian sets this up", and the guardian sees the
button.
**Delivered (`POL-FE-26`, 2026-10-29):** a minor is `guardianControl` without
`actingFor`; the payout panel, the money checklist, the home banner and
Settings show "your guardian sets this up from their own login" instead of
the Stripe button. A guardian acting for the ward still sees the button.

### 27. Declining an invitation is one tap with no "are you sure?"
`POL-FE-27` · likely

Offers already ask.
**Fix:** a confirmation, as offers have.
**Delivered (`POL-FE-27`, 2026-10-29):** both Decline paths in the inbox open
the same "Yes, decline / Keep it open" confirmation as offers.

### 28. "Confirm delivered" releases payment in one click
`POL-FE-28` · *Money* · likely

**Fix:** a confirmation that says the seller is paid.
**Delivered (`POL-FE-28`, 2026-10-29):** a confirm dialog names the seller and
the amount released and says a problem can't be reported afterwards; focus
lands on "Not yet".

### 29. The guardian-handoff queue lists newest first
`POL-BE-29` · *Minors* · likely

The oldest requests involving minors slip down the list.
**Fix:** oldest first.

### 30. "Reply to the email" to unsubscribe goes nowhere
`POL-FE-30` · likely

Fan emails come from a no-reply address.
**Fix:** point the fallback at the support address.
**Delivered (`POL-FE-30`, 2026-10-29):** the wording lives only in the
frontend unsubscribe page (`app/u/[token]/route.ts`); it now says "email us
and we will remove you by hand" with a `mailto:` to the configured support
address. No backend template says "reply".

---

## D · Polish

| # | Row | What | Fix |
|---|---|---|---|
| 31 | `POL-FE-31` | A failed card payment shows a raw Stripe code (`ref: pi_…`) | Plain message: what to do next and how to contact support |
| 32 | `POL-FE-32` | A sponsor approved minutes ago is greeted "Welcome back" | "Welcome" on first sign-in |
| 33 | `POL-FE-33` | Real athletes' Settings link to "sample screens" for a made-up athlete, Riley | Remove it for real users |
| 34 | `POL-FE-34` | "You're approved" at /join has no sign-in button | Add a Sign in button |
| 35 | `POL-FE-35` | "Contact BTG" on the team's Documents and Roster pages has no link or address | Link to the support address |

**All five delivered 2026-10-29 (HeckerCreatives):** 31 maps Stripe decline
codes to plain words with what to do and the support address, the reference
in small text; 32 says "Welcome" when the session's sign-in is within 24 h of
the Clerk account's creation (the API's actor carries no dates); 33 passes the
sample screens only in demo mode or to a BTG preview; 34 adds a Sign in
button to the approved state on /join; 35 emails support with a pre-filled
subject from the Documents and Roster empty states.

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
