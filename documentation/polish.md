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
| F · Clean pass | 37–40 | Production shows outdated wording, developer notes and sample figures |
| G · Support and help desk | 41–43 | Support messages live only in Gmail, and admins can't see what is wrong with a held request |
| H · Found in walkthrough practice | 44–51, 101–104, 107 | Testers getting the feel of the app hit dead ends and silent waits |
| I · Whole-app review | 52–78 | The 2026-11-15 review: 7 blockers, then every major and minor finding, in eight waves |
| K · Upload audit | 110–113 | The 2026-11-19 audit: uploads that can break with nothing noticing, and no test that a real file gets through |
| L · Campaign builder | 116 | The owner's athlete campaign order template (2026-11-19): creating a campaign must build every athlete's order |

**Closed 2026-11-15.** Every item, 1 to 51, is Done on the Polish sheet (71
rows). The last two, #45 and #51, were walked live and closed on
`fix/POL-FE-51-close-polish`. One piece of #51 lives outside this repo and
was handed on rather than closed here: the Tester Facility seeding a
staffable network (see #51). A new flaw found from here on is a new
numbered item and a new row, not a reopened one.

**Group I opened 2026-11-15** from the whole-app review: items 52–78,
owned by rcfworks on both sides. Wave 1 (52–59) first.

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
    page, which the emails link to. **POL-78 (2026-11-16):** that wasn't
    true when written — the invitations page read only the guardian's own
    login and showed nothing for the ward. POL-55 fixed it: a guardian acting
    for a minor now sees and answers the ward's invitations.

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
- **Backend delivered (`POL-BE-15`, 2026-10-30):**
  - **One endpoint.** `GET /operations/board` now counts every queue that
    waits on BTG. Each new queue is `{ waiting, oldestSince }`:
    `oldestSince` is when the oldest item started waiting, or null when
    nothing waits.
  - **Each count is its page's own set.** It uses the filter of the page
    its card links to, so the card and the page always show one number.
  - **Who gets what.** A queue is null for a role that doesn't read it
    across the tenant. A sponsor or an athlete is refused the board, as
    before.
  - **Existing queues.** `applications` and `briefs` gain `oldestSince`.
    `approvals` and `finance` have none, because a deliverable and an
    earning record no time they started waiting.
  - **Not counted, and why:**
    - Support messages: they are answered in the mailbox, and there is no
      list to count.
    - Campaign requests: the page existed, but nothing behind it was built.
      **Since 2026-10-30 (`P8-BE-12`) they are counted** as
      `queues.campaignRequests`, linked to `/admin/campaign-requests`.
  - Tests: `backend/tests/pol-be-15-queue-counts.test.ts` checks:
    - each count, and its oldest date;
    - tenant B never sees tenant A's items;
    - each role gets only its own queues;
    - each count equals the list its card links to.
- **For screens (`POL-FE-15`):** one card per queue, from
  `queues.<key>.waiting`, sorted by `oldestSince`, oldest first. Skip a
  queue that is null. Draw a card only if the role can open its page
  (`lib/admin-access.ts`). For example, Finance gets the `dealDisputes`
  count, but the Deal disputes page is for BTG admins and campaign
  managers.

  | Key | Card | Links to |
  |---|---|---|
  | `signups` | New sign-ups to review | `/admin/new-signups?review=1` |
  | `organisations` | Organisations to review | `/admin/onboarding` |
  | `sponsorRequests` | Sponsor requests | `/admin/sponsor-requests` |
  | `guardianHandoffs` | Guardian handoffs | `/admin/guardian-handoffs?tab=waiting` |
  | `heldListings` | Listings to approve | `/admin/marketplace?queue=listings` |
  | `heldOrders` | Orders to approve | `/admin/marketplace?queue=orders` |
  | `deliveryIssues` | Delivery issues | `/admin/delivery-issues` |
  | `offers` | Offers needing BTG | `/admin/offers` |
  | `dealDisputes` | Deal disputes to decide | `/admin/deal-disputes?tab=documents` |
  | `refunds` | Refunds to send | `/admin/refunds` |
  | `heldClosures` | Account closures held | `/admin/closed-accounts?tab=closing` |
  | `reactivations` | Reactivation requests | `/admin/closed-accounts` |
  | `paymentDisputes` | Payment disputes | `/admin/payments/disputes` |
  | `paymentEvents` | Payment events for BTG | `/admin/payments/events` |
  | `profileChanges` | ID and name changes | `/admin/new-signups#sensitive-edits` |
  | `payouts` | Payouts to review (already drawn) | `/admin/payouts` |
  | `makeGoods` | Make-goods to decide | `/admin/intelligence/make-goods` |

  **Don't add the cards into one total.** Some items sit on two desks:
  - a held sponsor sign-up is also a sponsor request;
  - a waiting organisation is counted under both sign-ups and
    organisations.

**Delivered (`POL-FE-15`, 2026-11-03):** BTG's dashboard draws one card per queue that waits on BTG — all 22 from `GET /operations/board` (`lib/ops-board-live.ts`), oldest wait first, each with "oldest waiting since …" on the desk's clock and a link to the desk and tab where it is cleared, drawn only for roles that can open that desk (`deskPath` strips the query and hash before the `mayUse` check). The headline counts queues with work ("7 queues need BTG's hand") rather than adding the cards up, because an item can sit on two desks; the action ring is one equal arc per queue. Tests: `tests/ops-board-queues.test.ts`.

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

- **Backend delivered (`POL-BE-17`, 2026-10-30):**
  - **Withdraw wasn't missing.** A sponsor already withdraws their own
    request with `POST /briefs/:id/transition` `{ to: "CLOSED" }`. It works
    any time before a campaign exists, and a `reason` is optional. No
    second route was added.
  - **`youCan: { edit, withdraw }`** is now on `GET /briefs/:id` and on
    every row of `GET /briefs`, so a screen doesn't need to copy the rules:
    - `edit` is true while the request is a draft and the caller may change
      it;
    - `withdraw` is true for the sponsor's own people before a campaign
      exists;
    - a read-only sponsor gets neither;
    - BTG staff never get `withdraw`, because they close a request with a
      reason instead.
  - **BTG hears about a withdrawal.** When BTG had started on the request
    (qualified it, approved it, or had it held for review), the tenant's
    campaign managers get `brief.withdrawn` once. If there are no campaign
    managers, its BTG admins get it. The email includes the sponsor's
    note. A draft BTG never saw emails nobody.
  - Tests: `backend/tests/pol-be-17-brief-actions.test.ts` (9).
- **For screens (`POL-FE-17`):**
  - Make each sent request open to a detail page from `GET /briefs/:id`.
  - Show **Edit** when `youCan.edit` is true. Save with
    `PATCH /briefs/:id`; the fields are the ones the request form already
    sends. A 409 means BTG has moved it on, so reload the page.
  - Show **Withdraw** when `youCan.withdraw` is true. Ask "Are you sure?"
    with an optional note, then send
    `POST /briefs/:id/transition` `{ to: "CLOSED", reason?: note }`.
  - Afterwards, `status` reads as closed. The sponsor never sees BTG's
    internal close reasons.

**Delivered (`POL-FE-17`, 2026-11-03):** a sponsor's request has its own page (`/sponsor/requests/:id`, linked from every row of the list) showing what was asked for, where it stands and the campaign it became; while it is still a draft the sponsor edits it inline (only changed fields are sent, `lib/brief-actions.ts` `requestPatch`), and until it becomes a campaign they can withdraw it after an "Are you sure?" with an optional note. The buttons are exactly the API's `youCan` flags, so a read-only sponsor sees none; a 409 says BTG moved it on and refreshes; BTG's hold and close reasons never reach the page. Tests: `tests/brief-actions.test.ts`.

### 18. A sponsor can't resend the confirmation email or fix a mistyped address
`POL-BE-18` · `POL-FE-18` · *Dead end* · likely

The sponsor is stuck for the 14 days until the request lapses.
**Fix:** "Resend email" and "Change email" on the request status page, rate
limited.

- **Backend delivered (`POL-BE-18`, 2026-10-30):**
  - **Resend email.** `POST /public/sponsor-requests/:token/resend-confirmation`
    sends a fresh confirmation link to the address on file. It answers 202
    with `{ sent: true, email }`.
  - **Change email.** `POST /public/sponsor-requests/:token/email`
    `{ email }` corrects the address and sends the confirmation to the new
    one. It answers `{ sent: true, email }`. The audit log keeps both
    addresses.
  - **When they work.** Both use the status page's own token, and only
    while the request is open and the address is unconfirmed. They answer
    409 once the address is confirmed or the request is decided.
  - **Limits.** Each is limited to 3 an hour per request (429), counted
    however many browsers try. There is also a limit per network address.
  - **Old links stop working.** Confirmation links are now tied to the
    address they were sent to, as onboarding's already were. After a
    change, a link sent to the mistyped address confirms nothing. Links
    sent before this shipped still work if the address was never changed.
    The expired-link renewal follows the same rule.
  - **Not done here:** the Zoho lead keeps the address first typed, because
    the Zoho sync never updates a lead after creating it. SponsorX and the
    BTG desk show the corrected one. Updating Zoho as well would be its own
    change.
  - Tests: `backend/tests/pol-be-18-sponsor-email-fix.test.ts` (7).
- **For screens (`POL-FE-18`):** on the request status page
  (`GET /public/sponsor-requests/:token`), while `state` is `NEW` and
  `emailConfirmed` is false:
  - **Resend email** calls `resend-confirmation`. Show "Sent to {email}".
  - **Change email** opens a field for the address, then calls `/email`.
    Show "Sent to {email}" and update the address shown.
  - **Error messages to show:**
    - 422: "That is already the address on your request."
    - 429: "Too many tries. Try again in an hour."
    - 409: reload the status page, because something changed (for
      example, the address was just confirmed).

**Delivered (`POL-FE-18`, 2026-11-03):** the status page's "Check your email" section offers Resend email and Change email (`components/sponsor-email-fix.tsx`) against the two routes above, shows "Sent to {email}", updates the shown address at once and refreshes the server page. Refusals say why — same address (422), too many tries with the buttons held off (429), something changed with an automatic refresh (409), not an email address (400, also checked before the call) — and `canFixEmail`, `looksLikeEmail` and `emailFixRefusal` are pinned in `tests/sponsor-request-live.test.ts`.

### 19. A sponsor admin can't add teammates
`POL-BE-19` · `POL-FE-19` · *Dead end* · likely

There's no invite screen, and "Settings" and "Messages" are dead menu items.
**Fix:** a team screen to invite by email and set roles, with the API added if
missing. Hide the menu items that don't work yet.

- **Backend delivered (`POL-BE-19`, 2026-10-30).** All of these are for a
  sponsor admin of one sponsor; analysts, BTG staff and other roles get 403.
  - **`GET /sponsor/team`** returns `{ sponsorName, members }`. Each member
    has `{ id, email, role, status, addedAt, you }`:
    - `role` is `SPONSOR_ADMIN` (admin) or `SPONSOR_ANALYST` (viewer, read
      only);
    - `status` is `INVITED` (hasn't signed in yet), `ACTIVE` or `REMOVED`.
  - **`POST /sponsor/team` `{ email, role }`** invites a colleague and emails
    them (`sponsor.teamInvite`). Their first sign-in with that address
    joins the team in that role, the same way the first sponsor login is
    claimed.
    - An address that already has a SponsorX login is refused (409), since
      sign-in finds logins by address.
    - At most 20 invites an hour per sponsor (429).
  - **`PATCH /sponsor/team/:id` `{ role }`** switches someone between admin
    and viewer.
  - **`POST /sponsor/team/:id/resend`** sends an unused invite again, at
    most 3 an hour.
  - **`POST /sponsor/team/:id/remove`** cancels an unused invite, or
    switches a member's login off. A removed member can't sign in, and
    their history stays.
  - **No changing or removing yourself (422).** So a sponsor always keeps
    an admin.
  - Every invite, role change, resend and removal is audited.
  - **Not built:** re-adding a removed person. Their address still has a
    (switched-off) login, so it can't be invited again; BTG can switch it
    back on.
  - Tests: `backend/tests/pol-be-19-sponsor-team.test.ts` (10).
- **For screens (`POL-FE-19`):**
  - A **Team** page in the sponsor portal, for admins only. Hide it from
    viewers, who get 403.
  - List the members with a status chip: Invited, Active or Removed. Mark
    `you` and give that row no actions.
  - **Invite:** an email field and an Admin / Viewer choice. A 409 means
    "That address already has a SponsorX login."
  - **Each row:** change role, and remove (ask "are you sure?" first). On
    Invited rows, also "Resend invite". A 429 means "Too many tries. Try
    again in an hour."
  - **Hide "Settings" and "Messages"** until they work. There's no backend
    for either yet.

**Delivered (`POL-FE-19`, 2026-11-03):** `/sponsor/team` lists everyone on the account with an Invited / Active / Removed chip, role word and added date; a Sponsor Admin invites by email as Admin or Viewer, switches roles, resends an unused invite and removes (after an are-you-sure dialog), with the 409 / 422 / 429 wording above and no actions on their own row or a removed one, whose copy says re-adding is BTG's to do. Team appears under Account for admins only (`sponsorNavFor`; an analyst who types the URL gets the not-in-your-role panel), and the inert Messages and Settings menu items are gone. Tests: `tests/sponsor-team-live.test.ts`, `tests/nav-groups.test.ts`.

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

- **Backend delivered (`POL-BE-22`, 2026-10-30):**
  - **When a campaign is stalled:** before launch (draft or staffing),
    short of its package's minimum, and either:
    - automatic staffing stopped and handed it to BTG (out of athletes or
      out of budget). The date is the stop.
    - BTG staffs it by hand and nobody is being asked: every offer and
      invite has been declined or has expired. The ten-minute staffing
      check marks it (new `Campaign.staffingStalledAt`) and clears it as
      soon as someone is asked again or the minimum is reached. Reads stop
      showing it at once in that case.
  - **What the API shows:**
    - a sponsor's `staffing` gains `btgFinding: { since } | null`. It never
      says why, or who was asked;
    - BTG's staff get the same as `staffing.stalled`, beside the stop
      reason.
    - Both are on `GET /campaigns` and `GET /campaigns/:id`.
    - The sponsor's `nextStep` already reads "BTG is finding more athletes
      since Oct 28: 1 of 2–3 signed so far", with `who: "BTG"`. A screen
      that shows `nextStep` gets this without a change.
  - No email to the sponsor; the item asks only for the screen.
  - Tests: `backend/tests/pol-be-22-staffing-stalled.test.ts` (8).
- **For screens (`POL-FE-22`):** where the sponsor sees "1 of 3 athletes
  signed", show "BTG is finding more athletes · since {date}" whenever
  `staffing.btgFinding` is set. Keep the count beside it. Show nothing extra
  when it's null.

**Delivered (`POL-FE-22`, 2026-11-03):** the sponsor's campaign page says when BTG has stepped in: a stalled campaign (draft or staffing) shows the "x of y athletes signed" count and bar with a "BTG is finding more athletes · since Oct 28" chip beneath, from `staffing.btgFinding` (`lib/campaign-stage.ts` `btgFindingLine`, `showsStaffing`). When the API's own next step already says it, that sentence stays the headline and only the date is repeated, so the sponsor is never told twice. Nothing extra shows when it is null.

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

- **Backend delivered (`POL-BE-29`, 2026-10-30):** `GET /guardian-handoffs`
  orders requests like this:
  - **Tabs with requests still waiting** ("Waiting for BTG", "In progress",
    and the athlete and guardian "waiting" list): **oldest first**, by when
    the request was made.
  - **Tabs with finished requests** ("Switched", "Declined", "Cancelled",
    "past"): newest first.
  - **Unfiltered:** every waiting request first, oldest on top, then the
    finished ones, newest first.
  - Paging follows the same order, so the oldest is always on page 1.
  - No screen change is needed; the queue just arrives in the new order.
  - Tests: `backend/tests/pol-be-29-handoffs-oldest-first.test.ts` (5).

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
- **Backend delivered (`POL-BE-36`, 2026-10-30):**
  - **Endpoints.** `GET /payments/switch` returns `{ on, open, provider,
    canTurnOn, changed: { at, by, reason } | null, history }`.
    `PUT /payments/switch` `{ open, reason }` changes it at once, with no
    deploy.
  - **When payment is open:** only while Railway's `PAYMENT_PROVIDER` names a
    provider (it stays the master off) AND the switch is on. With nothing
    set, it's off in production and on elsewhere, so setting Railway to
    Stripe opens nothing by itself.
  - **Off means:**
    - no checkout: the card link answers 409 "isn't open yet", and `canPay`
      and the checkout's `paymentsOpen` are false;
    - no payout sent and no payout account set up (`canSetUp` false);
    - no order cancelled for non-payment: overdue orders are paused, and get
      three fresh days when it reopens (POL-BE-04).
  - **Webhooks still settle** what is already moving.
  - **Turning it back on** queues every approved payout that waited.
  - **Who:** BTG Admin and Finance of a top-level organisation, or a super
    admin; anyone else gets 403. A reason is required (at least 5
    characters). Every change is audited (`paymentSwitch.change`) and shown
    in `history`. Turning it on while `PAYMENT_PROVIDER` is `none` answers
    409.
  - **Matrix and Switches doc:** the RBAC matrix gains `paymentSwitch`, and
    `SponsorX-Switches.md` has the switch and the two steps to open
    payments in production.
  - **Tests:**
    - `backend/tests/pol-be-36-payments-switch.test.ts` (5, real database);
    - `backend/tests/pol-be-36-payments-off.test.ts` (7: off stops checkout,
      transfers and cancellation; reopening releases them; the production
      default).
- **For screens (`POL-FE-36`):**
  - **Payments panel in BTG admin**, for BTG Admin and Finance only:
    - show on or off, plus `open`;
    - show `changed` (who, when, why) and `history`;
    - when `canTurnOn` is false, say "Payment provider not set up in
      Railway yet" and disable "Turn on".
  - **Changing it:** ask for a reason (at least 5 characters) and confirm
    first.
  - **Everywhere money moves:** when `canPay`, `paymentsOpen` or
    `canSetUp` is false, the pay and payout buttons say "Payments open
    soon".
  - **Wording to update:** the payout detail pages (`admin/payouts/[id]`,
    `finance/payouts/[id]`) say an approved payout "waits here until the
    payment provider is connected". With the switch, it waits until payments
    open, so "until payments open" is right in both cases.

**Delivered (`POL-FE-36`, 2026-11-03):** BTG turns payments on or off from the app: a Payments desk in Mission Control (`/admin/payments`, Money group) and its Vault twin (`/finance/payments`) show the switch, whether payment is actually open, the Railway provider, who last changed it and why, and the history (`components/payment-switch.tsx`, `lib/payment-switch-live.ts`). A change asks for a reason and confirms what on and off mean; "Turn on" is disabled with "Payment provider not set up in Railway yet" while Railway names no provider. Everywhere a sponsor or payee would pay or set up payouts while payment is closed, the button says "Payments open soon", and the payout and refund desks say money waits "until payments open". Tests: `tests/payment-switch-live.test.ts`.

---

## F · Clean pass: outdated wording and developer notes (added 2026-11-11)

Found 2026-11-11, on the go-live check, by scanning the text people see on
screen in the code production runs (code comments excluded):
`node scripts/ui-copy-scan.cjs`. About 180 lines on 45 pages. Production
shows them exactly as development does. Four kinds:

- **Wrong now:** says something that is no longer true. Examples: payouts
  "blocked on the written Phase 1 payment policy"; "acceptance stays disabled
  until counsel approves"; "no self-service checkout until Phase 2".
- **Fake numbers:** a signed-in person whose role can't read a desk is shown
  sample figures ("Demo data — … every figure below is sample data").
- **Developer note:** blueprint sections (`§26`), task IDs (`P9-FE-04`) and
  internal words (Railway, fixture, stand-in, Stage 9, "this environment",
  "guide §08", the API address).
- **Unfinished label:** "Not built yet", "not wired", "in the prototype".

**What is true now (write to this):**
- Sponsors pay by card through Stripe, while BTG's Payments switch is on.
- **Shop and marketplace payouts** go to athletes and teams through Stripe;
  their payout account is set up in SponsorX, and Stripe collects W-9 and
  W-8 forms and files those 1099s.
- **Campaign earnings** (BTG's managed campaigns) are still paid by BTG
  Finance outside SponsorX, by bank transfer. SponsorX tracks their status,
  approves those under $2,000 automatically when they become eligible, and
  Finance marks each one paid. So "paid outside SponsorX" is true for them —
  only the "Phase 1" and "until the policy is written" framing is wrong.
  (Corrected 2026-11-11, on POL-FE-37.) **POL-78 (2026-11-16):** until
  POL-53 no screen could approve or mark an earning paid, so "Finance marks
  each one paid" wasn't true when written; since POL-53 Finance does it from
  the Treasury books (Approve, Mark paid with a reference, Hold).
- SponsorX never stores a tax ID or bank details.
- The agreements are approved and issued in the app (v2, 2026-10-22).
  Acceptance works.
- The marketplace and shop have checkout. Managed briefs still exist beside
  them.

**One owner per page,** so two people never edit the same file. Items 37–38
are frontend work done by rcfworks (an exception to "`POL-FE` = HeckerCreatives",
agreed 2026-11-11 to split the load). 39–40 are HeckerCreatives'.

**Done when (all four):**
- the scan finds no section sign, task ID or internal word on the item's pages;
- no sentence on them contradicts "What is true now";
- in production, a signed-in person never sees sample figures: they see
  "Your role can't see this. Ask a BTG admin." (Visitors' sample pages stay,
  clearly labelled, as before.);
- the page still builds and its tests pass.

### 37. Money and operations screens
`POL-FE-37` · *Money* · **rcfworks** · confirmed

- `/admin/finance` and `/finance` (books): the "Payout actions are blocked"
  banner, "SponsorX observes; it does not invoice or pay", §10/§18/§21/§26/§37,
  Addendum A6, "payout policy is still an open gate", sample books.
- `/finance/splits` and `/admin/next/splits`: shares `live-splits` copy (§15.3, spec §5.7, P9-PMO-01, "wired by P9-FE-05").
- `/admin/payments` (`payment-switch.tsx`): "while Railway names a provider",
  "the default for this environment", and the reason-box examples dated
  2026-11-03.
- `/admin/integrations`: P8-INT-04, 3S1-QA-01, "Emails are off in this environment".
- `/admin/intelligence/*` and `/property/intelligence` (`engine-pending.tsx`,
  `model-registry.tsx`, `models-live.ts`): the raw `/api/v1/…` address,
  "seeded simulated history (SponsorX-Backtest.md §4)".
- `/admin/network`: §15, P0-PMO-13.

- **Delivered (`POL-FE-37`, 2026-11-11, rcfworks):**
  - Finance (admin and Finance portal): the banner now says campaign
    earnings are paid by BTG Finance outside SponsorX, approved
    automatically under $2,000, marked paid by Finance, and that shop and
    marketplace payouts go through Stripe. Section notes are plain; no §,
    "Phase 1", "open gate" or Addendum.
  - Payments: no Railway wording ("Stripe isn't set up yet", "Not changed
    yet. This is the starting setting."); the reason box asks "Why are you
    turning payments on/off?".
  - Integrations, Network, Intelligence (8 admin pages and the property
    page): no task IDs, no API address, no "this environment"; the model page
    says "practice data".
  - Splits (admin and Finance portal): plain wording; the Finance-portal page
    now shows "not in your role" to signed-in staff instead of sample editions.
  - `node scripts/ui-copy-scan.cjs` finds nothing on these pages. Frontend build, lint and all 1,957 unit tests pass. Unit and
    e2e expectations updated (`payment-switch-live.test.ts`,
    `loop-p7-earnings-report.spec.ts`).

### 38. Athlete, campaign and agreement wording
`POL-FE-38` · *Money · Consent* · **rcfworks** · confirmed

- `/athlete/orders/[id]`: "Acceptance is not wired… until counsel approves",
  "payout happens outside the system in Phase 1", §4/§21/§26, "guide §08",
  "acceptOrder domain function (B4)".
- `/athlete/invitations` (`invitations-inbox.tsx`): "Acceptance stays disabled
  until counsel approves", "not wired in the fixture build", sample inbox.
- `/athlete/profile` (`athlete-profile-view.tsx`, `profile-sections.ts`) and
  `/athlete/profile/edit` (`profile-editor.tsx`, `live-profile-editor.tsx`):
  "the payment recipient record arrives in a later phase", "Payouts are sent
  by BTG Finance outside the platform", "Not collected in Phase 1",
  "Uploads… not wired in the prototype", §5/§6/§12/§22/§26/§30.
- `/athlete/earnings` (`activity-explorer.tsx`) and `/athlete/deliverables`.
- `/admin/campaigns` (`campaign-launcher.tsx`, `campaign-builder.tsx`) and
  `/admin/campaigns/[id]`: "nothing sends until counsel clears the template",
  "fixture data", §13/§14/§15/§26.
- `/portal` (no account yet): "a managed marketplace in Phase 1".
- `/join` form hints and status (`join-flow.ts`, `join-submitted.tsx`):
  "money moves outside SponsorX in Phase 1", §4/§13/§22, P3-FE-02.

- **Delivered (`POL-FE-38`, 2026-11-11, rcfworks):**
  - Order acceptance works for real athletes and guardians on the v2
    agreements. The "not wired / until counsel approves" text was only on the
    sample order and inbox; those now say "Sample order. Only the athlete, or
    their guardian, can accept a real one."
  - Earnings wording everywhere on these screens: SponsorX holds no bank
    details or tax ID; campaign earnings are paid by BTG Finance outside
    SponsorX; shop and marketplace payouts are set up with Stripe on the
    Payouts page. "Phase 1", "later phase" and "Not collected in Phase 1"
    are gone ("Not collected by SponsorX").
  - The sample campaign builder and launcher say they're a sample and send
    nothing; the no-account page points to Get started instead of "managed
    marketplace in Phase 1". The join form's "never asked" line (also shown
    on the public join and how-it-works pages) no longer says Phase 1.
  - Section signs, task IDs and "guide §" removed. The sample order's
    agreement terms are no longer read from `lib/fixtures.ts`'s stale
    `orderTerms` strings (that file is `POL-FE-40`'s).
  - ~~Still open, not wording: the join confirmation's "Resend email" and
    "Change guardian" stay disabled ("contact BTG")~~ **POL-78 (2026-11-16):**
    stale — both are wired now (`app/(public)/join/actions.ts`,
    `join-checklist.tsx`), using `POST /applications/intake/guardian/resend`.
  - `node scripts/ui-copy-scan.cjs` finds nothing on these screens. Frontend
    build, lint, typecheck and all 1,957 unit tests pass.

### 39. Public pages, menus and the route map
`POL-FE-39` · *Dead end* · **HeckerCreatives** · confirmed

- `/packages`, `/about`, `/how-it-works`, `/join`, `/next/about`
  (`packages-stage.tsx`): "no self-service checkout until Phase 2", "Phase 1
  is a managed marketplace".
- `/properties/[slug]`: "Phase 1 is managed — Select opens a brief, it does
  not check out (§17)", §4.
- `/brief` (`brief-flow.ts`), `/athletes/[slug]` (§22), §13/§26.
- `/map` ("Skeleton routes for Phase 1… Master Development Blueprint") and
  the admin menu's "route map" link: not reachable in production.
- Menus and header (`site-nav`, `mobile-nav`, `portal-nav`, `portal-shell`,
  `screen-stub`): "Not built yet" entries, "Notifications — not wired",
  "Help — not wired".

- **Delivered (`POL-FE-39`, 2026-11-12, HeckerCreatives):**
  - `/packages`, `/about`, `/how-it-works`, `/join`: no "Phase 1" or "no
    self-service checkout until Phase 2". They now say sponsors can send BTG
    a brief or buy listings in the marketplace and shop by card, that
    campaign earnings are paid by BTG Finance outside SponsorX, and that shop
    and marketplace payouts go through Stripe. The package filters say they
    aren't available yet, without the section sign.
  - Property page, brief flow, athlete profile: section signs removed;
    "Select opens a brief to BTG, who match and quote".
  - `/map` is a 404 in production (`lib/route-map.ts`, one flag), and the
    footer, portal sidebar and both mobile sheets hide the link there. The
    page's intro no longer cites the blueprint. The unused `ScreenStub` is
    deleted.
  - Menus: "Not built yet" tooltips read "Coming soon"; the two inert entries
    (advisor Roster, property Campaigns) are dropped, since neither screen
    exists. The portal header's inert Notifications and Help icons are gone.
  - `node scripts/ui-copy-scan.cjs` finds nothing on these pages. Frontend
    build, lint and all 1,957 unit tests pass.

### 40. Admin desks, sponsor and NEXT screens
`POL-FE-40` · *Silent* · **HeckerCreatives** · confirmed

- `/admin/applications` (`applications-desk.tsx`), `/admin/approvals` and
  `/advisor/review` (`approvals-desk.tsx`): sample queues, "platform
  verification comes in a later phase", "Open the signed asset URL — not
  wired", NEXT spec §5.2.
- `/admin/rewards` (`rewards-desk`, `live-rewards-desk`, `reward-creator`):
  §16/§26, "guide §06", sample rewards.
- `/admin/analytics` (`analytics-story.tsx`): §9/§15/§16/§22.
- `/admin/campaigns/match` (`matching-studio.tsx`, `matching.ts`): §14/§15/§26, sample athletes.
- `/admin/next/editions`, `inventory`, `rights`: "wired by P9-FE-04 (Stage 9)",
  "Repricing is wired in Stage 9", V3 §6, §15.3, sample editions
  (`server/next-editions.ts`, `lib/fixtures.ts`).
- Sponsor: `/sponsor/campaigns/[id]` and `/report`, `/sponsor/marketplace`
  ("waitlist not wired"), `/sponsor/marketplace/[jobId]`, `/sponsor/requests/[id]`,
  `/sponsor/shop`, and `campaign-change.tsx`: "fixture data", "Sample data".
- NEXT: `/next`, `/next/points`, `/next/code`, `/next/sales`,
  `/next/assignments`, `/advisor`: "nothing converts in Phase 1",
  "Messaging is not in Phase 1", "The QR shown here is a stand-in", "arrives
  with Stage 9 (P9-FE-01)", spec §5.1/§5.5/§14.

- **Delivered (`POL-FE-40`, 2026-11-12, HeckerCreatives):**
  - Admin desks (applications, approvals, matching, rewards, analytics) and
    the NEXT admin pages (editions, inventory, rights): no section signs,
    task IDs or "Stage 9". Disabled buttons say "isn't available here yet".
    The sample banners now read "Sample figures — sign in as a BTG admin or
    … to see the real …"; a signed-in staff role the desk isn't for already
    got "Not in your role", so in production the sample reaches only
    visitors. **POL-78 (2026-11-16):** one exception was left — signed-in
    BTG staff on `/sponsor/marketplace` still saw the sample packages. POL-72
    closed it: they now see "Not in your role".
  - Sponsor pages: the campaign, results, request and shop pages show
    "Not in your role. Your role can't see …. Ask a BTG admin." to a
    signed-in person whose role has no sponsor read, instead of the sample
    (`isSignedIn` / `RoleCannotSee` in `components/not-in-role.tsx`). The
    sample media-property listing tells a signed-in person "Not available
    yet" instead of sample prices. "Fixture data" and "Sample data" read "a
    sample campaign", "sample listings"; "waitlist not wired" is "Sold out".
  - NEXT student and advisor screens: "Messaging isn't available yet",
    "Points can't be redeemed yet", "Uploading a draft isn't available yet";
    the QR "is for illustration — share the code or the link"; no spec
    sections.
  - Shared wording: reward creator, rewards desks, analytics story and
    report, matching studio, fixtures, the guardian agreement's draft badge
    ("Draft — not the final wording"), and the athlete earnings notes (which
    still said "Phase 1 tracks earning status only").
  - `node scripts/ui-copy-scan.cjs` finds nothing on these pages. What it
    still lists (9 lines) is CSS class names, the intelligence pages'
    deliberate "(simulated)" labels and the development-only engine preview.
    Frontend build, lint and all 1,957 unit tests pass.

---

## G · Support and help desk (added 2026-11-12)

Found 2026-11-12. A tester on staging (following the Tester Guide) wrote "Need
full access to complete test run" through the Contact page. Her athlete sign-up
and sponsor brief had both been held by the document check: the ID didn't read
as a government ID, and the proof of business didn't name the business. Nobody
could see that from the message:
- the whole message went to Gmail (support@sponsorx.net forwards to
  infinex1@icarrefound.org), and the reply came from a personal address;
- the site has no support list, menu entry, reply box or "handled" state;
  `/admin/support/[id]` is reached only from an email with an attachment;
- nothing links a message to the sender's sign-ups, so the admin had to ask
  a developer what was wrong.

The case list for the form is
[SponsorX-Helpdesk-Cases.md](SponsorX-Helpdesk-Cases.md): 380 cases in 8
topics, each matched to the code that causes it.

**Order:** POL-BE-41 → POL-BE-42 → POL-BE-43, then POL-FE-41 → POL-FE-42 →
POL-FE-43. Each front-end task waits for its back-end one.

**Decided 2026-11-12 (the user):**
- people can tick more than one case;
- replies go by email only; there's no conversation page on the site;
- all six rows are rcfworks', front end included (an exception to
  "`POL-FE` = HeckerCreatives", as with items 37–38).

### 41. Support inbox
`POL-BE-41` / `POL-FE-41` · *Silent* · confirmed

- **Backend (`POL-BE-41`):**
  - each support message has a status (New, Answered, Closed);
  - BTG can list messages and filter them by status and case;
  - a reply is written in SponsorX, kept with the message and emailed to the
    sender from noreply@sponsorx.net;
  - the email to support@ becomes a notice only (who wrote, the topic and an
    "Open in SponsorX" link) and carries none of the message text, so nothing
    a guardian writes about a minor sits in Gmail;
  - each message finds what its sender has on SponsorX by email address
    (athlete, sponsor request, organisation, guardian, student) and shows
    which of those are held.
- **Frontend (`POL-FE-41`):**
  - a Support page in the admin menu, with a count of new messages;
  - on each message: the reply box, earlier replies, "Mark closed" and a
    "This person on SponsorX" card listing their records, each tagged with
    what is wrong and linked to its page.
- **Done when:** a contact-form message appears in the inbox as New; a reply
  sent from it reaches the sender from noreply@ and marks it Answered; the
  support@ email has no message text; a sender with held sign-ups shows them
  with their reasons; BTG admins only (cross-tenant and role tests pass).
- **Delivered (`POL-BE-41`, 2026-11-14, rcfworks):**
  - Each message has a status (New, Answered, Closed). Messages already
    received start as New. A message whose files are still uploading isn't
    in the inbox yet.
  - `GET /support-messages` is the inbox: one status at a time (New by
    default), newest first, with each status's count for the menu badge.
    It filters by status; the filter by case comes with `POL-BE-43`, which
    stores the cases.
  - `GET /support-messages/{id}` adds the status, BTG's replies and
    "This person on SponsorX": the sender's athlete sign-ups, sponsor
    requests, organisations, guardian account (with the athletes they look
    after) and student records, found by email address. Held ones come
    first, with their stored reasons and the link to their review page. A
    student has no BTG page yet, so it has no link.
  - `POST /support-messages/{id}/replies` keeps the reply and emails it to
    the sender from noreply@, in the same email thread as their message. The
    message becomes Answered (a closed one reopens). `POST
    /support-messages/{id}/close` is "Mark closed".
  - The support@ email is now a notice: who wrote, the topic, how many files
    and the "Open in SponsorX" link. It has no message text, no file names
    and no reply-to. The sender's copy has no reply-to either; it points
    them to the Contact page to add something.
  - BTG admins only. Finance, campaign managers and other tenants' admins
    are refused (tests in `backend/tests/support-inbox.test.ts`).
- **Delivered (`POL-FE-41`, 2026-11-14, rcfworks):**
  - **Support** in the admin menu (under Accounts, BTG admins only), with
    the number of New messages beside it.
  - `/admin/support` is the inbox: New, Answered and Closed tabs with their
    counts, 12 / 24 / 60 a page, and a filter by topic or case. Each row
    shows who wrote, the topic, the cases ticked, whether they were signed
    in, when, and how many files and replies.
  - The message page adds the status, the cases ticked, the account it
    came from, earlier replies, the reply box with Send, and "Mark closed".
    "This person on SponsorX" lists the sender's records, held ones first,
    each with its problem tags (shared with `POL-FE-42`) and a link to its
    review page.
  - The menu count is an optional `count` on a menu item, passed to the
    shared portal shell as `counts`; nothing else in the shared menu
    changed.

### 42. "What's wrong" at a glance
`POL-BE-42` / `POL-FE-42` · *Silent* · confirmed

- **Backend (`POL-BE-42`):** one shared summary of a held record's problems
  for athlete sign-ups, sponsor requests and organisations. Each problem has
  a plain label, a type (Upload doesn't match · Couldn't read · Missing ·
  Email not confirmed · Already registered) and the document or field it is
  about. The lists and pages read it.
- **Frontend (`POL-FE-42`):** a "What's wrong" panel at the top of each review
  page, one coloured tag per problem (red: upload doesn't match; amber: missing
  or unconfirmed; grey: couldn't read), each jumping to its document; the same
  tags on every row of New sign-ups, Sponsor requests and Onboarding.
- **Done when:** a held record shows each problem as a tag on its list row and
  at the top of its page; a record with no problems shows none; the tags match
  the stored reasons exactly (tests on each type).
- **Decided 2026-11-14 (the user):** a sixth type, **Technical Decision**, for
  BTG rules a person decides on rather than something the applicant got
  wrong. Every problem also carries a code, so each tag says exactly what is
  wrong.
- **Delivered (`POL-BE-42`, 2026-11-14, rcfworks):**
  - `backend/src/domain/hold-problems.ts` reads a held record's stored
    reasons as problems. Each has a type, a code, the reason word for word
    and the document or field it is about. Nothing new is stored.

    | Type | Codes |
    |---|---|
    | Upload doesn't match | `DOC_NAME_NOT_FOUND`, `DOC_WRONG_KIND`, `DOC_EXPIRED`, `DOC_BIRTH_DATE_NOT_FOUND` |
    | Couldn't read | `DOC_UNREADABLE` |
    | Missing | `MISSING_DOCUMENT`, `MISSING_ANSWERS` |
    | Email not confirmed | `EMAIL_NOT_CONFIRMED` |
    | Already registered | `EMAIL_HAS_LOGIN`, `NAME_TAKEN`, `LIKELY_DUPLICATE`, `SAME_NAME_SPONSOR` |
    | Technical Decision | `RESTRICTED_BUSINESS_TYPE`, `RESTRICTED_WORDS`, `STAFF_CONFIRM_MINORS`, `GUARDIAN_REJECTED`, `UNCLASSIFIED` |

  - `UNCLASSIFIED` is only for a reason with older wording already stored.
    A test runs every rule with every hold switched on and fails on any
    sentence without a code. It also counts the sentences in the rule files,
    so a new one can't be added without a code.
  - A "check couldn't run" code was considered and left out: no rule writes
    such a reason today. A document that can't be read is `DOC_UNREADABLE`.
  - `problems` is on every list row and review page BTG works from: New
    sign-ups (list, stream and athlete page), Sponsor requests (list and
    page), Onboarding (queue and page), and the support inbox's sender card.
    Only held records have problems; any other record has an empty list.
- **Delivered (`POL-FE-42`, 2026-11-14, rcfworks):**
  - A **What's wrong** panel at the top of the athlete sign-up, sponsor
    request and organisation pages: one coloured tag per problem, its type
    then the reason word for word. It replaces the plain list of reasons
    on those pages (an approved organisation's flags keep their list).
  - A tag about a document jumps to that document's row. The reasons name
    documents a little differently from the rows ("Athlete's government
    ID" / "Government ID"), so the longest row name that fits wins; with no
    match (a missing document) it jumps to the Documents section.
  - New sign-ups, Sponsor requests (New tab) and the Onboarding queue show
    the tags on each held row: the type, with the reason on hover and for
    screen readers. A record that isn't held shows none.
  - Colours: red, upload doesn't match; amber, missing or email not
    confirmed; grey, couldn't read; blue, already registered; accent,
    Technical Decision. The type is always written, so colour is never the
    only cue.

### 43. Help desk form (tick a case)
`POL-BE-43` / `POL-FE-43` · *Dead end* · confirmed

- **Backend (`POL-BE-43`):**
  - the topics and cases from SponsorX-Helpdesk-Cases.md, kept in SponsorX so
    their wording can change; each has a stable ID (e.g. `ACC-30`) and the
    roles that see it;
  - a message stores the ticked case IDs; text is required only with "Other";
  - a message sent while signed in is linked to that account;
  - the inbox filters by case.
- **Frontend (`POL-FE-43`):** the form on the public Contact page and behind
  the **?** in every portal: pick a topic, tick the cases that apply, Submit;
  "Other" opens the message box; attachments as today. A visitor sees only
  public cases; a signed-in person sees their role's.
- **Done when:** each topic shows only the person's cases; ticking cases with
  no text submits; "Other" without text is refused; the message reaches the
  inbox labelled with its cases; the existing contact-form tests still pass.
- **Delivered (`POL-BE-43`, 2026-11-14, rcfworks):**
  - `backend/src/domain/helpdesk-cases.ts` holds the 375 cases of
    SponsorX-Helpdesk-Cases.md: ID, topic, section, the words ticked and who
    sees them. A test fails when it and the document differ. A dropped case's
    ID goes on a retired list and is never reused.
  - Eight topics: Account, Payment, Guardianship, Campaigns, Shop, Rewards,
    NEXT, Other. The first four keep the contact form's keys and words, so
    stored messages are unchanged.
  - `GET /public/support/cases` gives the topics with the cases the person
    may tick: a visitor the public ones (and the fan's and booth staff's,
    who have no login); a signed-in person their role's and those for
    anyone; BTG staff all.
  - `POST /public/support/messages` takes the ticked case IDs. The text is
    needed only when nothing is ticked or "Something else" (`OTH-01`) is.
    A case that isn't on the topic, isn't the person's or doesn't exist is
    refused by name. Sent while signed in, the message is linked to the
    account; an expired session is asked to sign in again. Signed in
    without a SponsorX account, a person uses the desk as a visitor.
  - The inbox shows each message's cases in today's words and the account
    it came from, and filters by `?case=` or `?topic=`. The support
    mailbox's notice lists the case IDs; the sender's copy lists what they
    ticked.
  - The contact form's tests pass unchanged.
- **Delivered (`POL-FE-43`, 2026-11-14, rcfworks):**
  - The Contact page is the help desk. Step one: pick one of the eight
    topics and tick the cases that apply, grouped by section, with
    "Something else" last on every topic. Step two: name, email, message
    and attachments, as before.
  - The message box stays: optional once a case is ticked, needed when
    nothing is ticked or "Something else" is. Send says what is missing.
  - A visitor sees the public cases. Signed in, the page lists the cases
    for that account, fills in the name and email, and sends with the
    sign-in, so the message is linked to the account. An expired sign-in
    is asked to sign in again.
  - A **?** in every portal's header opens the help desk, with a link back
    to the portal. Old links that pick a topic (`?topic=guardianship`)
    still work. If the cases can't be read, the form works as it did.
  - The topic and tick boxes are a step above the message form, not inside
    it. Besides being clearer, this keeps the existing browser test (which
    fills in the form's Name, Email and Message) passing unchanged: three
    public guardianship cases mention "email".

### 44. Inventory item: after Save, say it's done and where to go
`POL-FE-44` · *Dead end* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** editing an inventory item and pressing **Save changes**
  showed "Saved…", but the button stayed bright as if there were still
  something to save, and nothing pointed onward. The tester thought the
  save had failed.
- **Frontend (`POL-FE-44`):** after a successful save the button is
  disabled and reads **Saved**, and an **All items** button appears beside
  it, back to the inventory. Changing any field arms **Save changes**
  again and hides **All items**. Athlete and team manager both use this form.
  The "Saved" message is now green (was the orange accent colour, which read as a warning).
- **Done when:** after saving, the button is disabled with **All items**
  beside it; editing a field re-enables Save; a refused save leaves Save
  enabled with the red message.
- **Delivered (`POL-FE-44`, 2026-11-15, infinex1):**
  `frontend/src/components/inventory-form.tsx` (`saved` state, `doneHref`)
  and `inventory-item.tsx` (passes the page's "All items" link). Not yet
  deployed.

### 45. "Categories you won't promote": the category list is cut off
`POL-FE-45` · *Dead end* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** on the athlete's Inventory page, the "Add a category…" menu in
  "Categories you won't promote" opens as a thin empty strip just under the
  button. The rest of the list is hidden by the panel around it, so the athlete
  can't pick a category and can't add a restriction at all.
- **Frontend (`POL-FE-45`):** let the menu show past the panel's edge, so the
  whole list shows and every category can be picked. Nothing else on the page
  changes.
- **Done when:** the menu shows all 25 categories (scrolling within itself);
  picking one and pressing Add adds the restriction; the panel looks as before
  when the menu is closed.
- **Delivered (2026-11-15, infinex1):**
  - The cause: every arena panel (`.sx-arena-plate`) hides whatever spills past
    its edge, and the menu opens below the button, past the panel's bottom.
  - `frontend/src/app/globals.css`: a new `.sx-arena-plate-open` modifier lets
    one panel show what spills past its edge; its pointer spotlight keeps the
    rounded corners. (A Tailwind `overflow-visible` class would not work: the
    panel rule sits outside Tailwind's layers, so it wins.)
  - `frontend/src/app/(app)/athlete/inventory/page.tsx`: the restrictions panel
    uses it. Other panels and the shared `Dropdown` are unchanged.
  - The team manager's inventory pages have no restrictions section, so
    nothing to change there.
- **Closed (2026-11-15, HeckerCreatives):**
  - Walked live on desktop and a phone (Pixel 7): pick a category, press
    Add, the row appears; Remove clears it.
  - The walk found one more dead end, on the phone. The form is the last
    thing on the page, so the menu opened downward ran past the screen's
    bottom edge. Its last categories sat under the bottom navigation bar at
    every scroll (menu bottom 841px, bar top 759px) and couldn't be tapped.
  - `frontend/src/components/inventory-restrictions.tsx`: the menu opens
    upward (`Dropdown` `placement="up"`, made for controls near the bottom
    of a page). Every category can now be reached and tapped on a phone.

### 46. Live listing: a button to see it in the marketplace
`POL-FE-46` · *Dead end* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** when a listing goes live, the page says "Live ✓ / Sponsors can
  find it on the marketplace now." but gives the seller no way to see it
  there. An athlete can't open the sponsor Shop, so they're left wondering what
  sponsors actually see.
- **Frontend (`POL-FE-46`):** a **Check in marketplace now** button in the
  Live banner, opening the listing as a sponsor sees it (the page's existing
  "Preview as a sponsor sees it" view). Shown only when the listing is live.
- **Done when:** the button shows in the "Live ✓" banner and opens that
  listing's preview; it doesn't show for a draft, a held, paused or ended
  listing, or one that goes live on a later day; build and tests pass.
- **Delivered (2026-11-15, infinex1):**
  - `frontend/src/lib/listing-outcome.ts`: `liveNow()` says whether a listing
    is live now (published, no later publish day); "Live ✓" uses it too.
  - `frontend/src/components/athlete-listing-form.tsx`: the button in the
    athlete's Live banner, to `/athlete/listings/<id>/preview`, in the page's
    secondary button style.
  - `frontend/src/components/property-listing-form.tsx`: the team manager's
    listing page shows the same banner, so it gets the button too, to
    `/property/listings/<id>/preview` (that route exists).
  - `frontend/tests/listing-outcome.test.ts`: a test for `liveNow()`.
  - The banner shows right after Submit or Resume, as before, so that is
    when the button appears.

### 47. Checkout: fill the billing contact from the signed-in user
`POL-FE-47` · *Friction* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** checkout fills in the billing contact from the sponsor
  company's primary contact. A sponsor made with the test-account tool has
  none, so Name and Email start empty and the page says "You have no contact
  on file, so add one here." The buyer has to type in details the app
  already knows.
- **Frontend (`POL-FE-47`):** when the company has no contact, fill in the
  signed-in person's name and email instead, still editable, with the line
  "Filled in from your account — change it if someone else handles
  billing." A company with a primary contact works as before. No name set →
  Name stays blank, Email is still filled.
- **Done when:** a sponsor with no contact sees their own name and email in
  the billing step with the "from your account" line; one with a contact
  still sees the contact; nothing new is stored; build and tests pass.
- **Delivered (2026-11-15, infinex1):**
  - Why the frontend and not the API: the person's name lives only in Clerk.
    The `User` row in Postgres has an email and no name, so an API fallback
    could only fill Email, or would have to call Clerk on the request.
  - `frontend/src/server/viewer.ts`: `viewerContact()` reads the signed-in
    person's name and sign-in email from Clerk (`currentUser()`), live.
  - `frontend/src/app/(app)/sponsor/checkout/page.tsx`: reads it only when
    the hold's checkout has no billing contact, and passes it to the gate.
  - `frontend/src/lib/checkout-gate.ts`: `billingPrefillSource()` (contact,
    account or none), `billingDraftFrom()` takes the viewer as a fallback,
    and `billingPrefillNote()` gives the line under the heading.
  - `frontend/src/components/shop-checkout.tsx`: uses them.
  - `frontend/tests/checkout-gate.test.ts`: a test for the fallback.
  - The API is unchanged: `billingPrefill` in `backend/src/domain/order-terms.ts`
    still sends the tenant-scoped primary contact, and the order keeps only
    what the sponsor confirms.

### 48. NEXT student home: a way to the student application
`POL-FE-48` · *Friction* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** a student signed in to the NEXT portal lands on Home (Closed
  sales, Points, My code). Nothing there leads to the public student
  application at `/next/apply`, so the presenter had to type the address.
- **Frontend (`POL-FE-48`):** a card under the three stat cards, "Know
  someone who should join?", with "Classmates apply here. Their application
  goes to your school's faculty advisor." and a button, **Open the student
  application**, to `/next/apply`.
- **Done when:** a signed-in student reaches the application from Home with
  one tap; the page opens signed in; build and tests pass.
- **Delivered (2026-11-15, infinex1):**
  - `frontend/src/app/(app)/next/live-views.tsx`: `StudentApplyCard`, shown
    on the live home (`LiveStudentHome`). Not on the "not linked to a student
    record" screen.
  - `frontend/src/app/(app)/next/page.tsx`: the same card on the fixture
    preview (`?demo=` and BTG previews).
  - `/next/apply` opens signed in: it sits in the `(public)` group, whose
    layout checks nothing, and `proxy.ts` only attaches Clerk and protects no
    route. Nothing to fix.
  - Public pages: `/next/about` already links to the application three times.
    A signed-out visitor to `/next` is sent to `/login`, which had no link to
    it, and neither did the site footer. Added **Student application** to the
    footer (`frontend/src/components/site-chrome.tsx`), which shows on every
    public page and on `/login`.
  - `frontend/tests/student-apply-link.test.ts`: pins the card, where it
    shows, and the footer link.

### 49. NEXT student: log a business from My sales
`POL-FE-49` · *Friction* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** the student portal felt view-only. On My sales the button
  was disabled with "Adding one yourself isn't available yet", although the
  API has taken a student's prospects since P9-BE-13
  (`POST /students/:id/prospects`, STUDENT `rwa("own", "own")` on
  `studentProspect`).
- **Frontend (`POL-FE-49`):** a **Log a business** form (business name and
  kind of business, the two fields `ProspectInput` takes). The API decides
  it straight away, so the form says where it landed:
  - accepted: "… is accepted. Go ahead and pitch them, and give them your
    code.";
  - refused: "… can't be accepted: another sponsor already has that kind of
    business. You keep the credit for bringing it in.";
  - held: "… is waiting for SponsorX to check it. You'll hear back either
    way." (never the internal reasons, which the API does not send).
  The list refreshes, back to page one with no filter, so the new business
  shows at the top.
- **The automatic rules (backend, unchanged — `submitProspect` in
  `backend/src/domain/student.ts`, `autoDecideProspectIn` in
  `student-auto.ts`, `prospectVerdict` in `student-auto-rules.ts`):**
  - refused at once (HTTP 422) for an unknown category or one the student
    programme never sells; refused (HTTP 409) unless the student is ACTIVE;
  - **refused** (`CATEGORY_EXCLUSIVE`, with the categories still open) when
    another sponsor holds that category at the student's school (a
    presenting ad slot with a campaign in a live edition of the school's
    publication);
  - **held** for SALES (or BTG admins when the tenant has no SALES user),
    with reasons, for a sensitive category, a school restriction, an athlete restriction
    at the school, the business is already a sponsor (or its name has no
    letters to match), or another student already has it open;
  - **accepted** when nothing is in the way. One business name is decided at
    a time, so two students cannot both be accepted for it.
- **Done when:** an ACTIVE student logs a business, sees the outcome, and
  finds it in their list; BTG sees it on Admin → NEXT → Prospects
  (`/admin/next/prospects`: held ones under "Waiting on you", decided ones
  under "Decided automatically", all under "All"); build and tests pass.
- **Delivered (2026-11-15, infinex1):**
  - `frontend/src/components/student-prospect.tsx`: "Log a business",
    plainer labels, the outcome in its tone, list reset and refresh.
  - `frontend/src/app/(app)/next/actions.ts`: reads `{ id, state }` from the
    API and returns the state with its message. The student id still comes
    from `/me`, never the form.
  - `frontend/src/lib/students-live.ts`: `prospectOutcome()`.
  - `frontend/src/app/(app)/next/sales/page.tsx`: the fixture screen uses
    the same form in place of the disabled button. A BTG preview is not a
    student, so sending there says "Only a signed-in student can log a
    business."
  - `frontend/src/app/(app)/next/live-views.tsx`: the not-yet-active wording.
  - `frontend/tests/student-log-business.test.ts`.
  - No backend change. Nothing on the backend blocks an ACTIVE student. A
    student who is not ACTIVE still sees the button disabled ("You can log a
    business once you're on the masthead"), as the API would refuse them.

### 50. Editions: the Content ready confirmation reads as a contradiction
`POL-FE-50` · *Friction* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** on BTG's Editions page (`/admin/next/editions`), after
  **Mark content ready** and then **Mark not ready**, the Content ready box
  said "not yet marked ready" with the link "Mark content ready", and under
  it, in green, the leftover note "Content marked not ready." A presenter
  read the green "success" line saying "not ready" as a contradiction, and
  it stayed there until the page was reloaded.
- **Frontend (`POL-FE-50`):** the note is toned by what it means and clears
  itself:
  - marking ready: "Content marked ready ✓", green;
  - marking not ready: "Undone: content is back to not ready.", muted (not
    green);
  - either confirmation clears after about four seconds, and any note
    clears when the link is clicked again. A refusal from the API stays, in
    red, until the next click.
- **The box itself was already right:** green border and a green ✓ with
  "marked ready by BTG" when ready, a grey ○ with "not yet marked ready"
  when not. Unchanged.
- **Done when:** BTG → NEXT → Editions → Mark content ready shows the green
  tick note, Mark not ready shows the muted "Undone: …" note, and neither
  lingers; build and tests pass.
- **Delivered (2026-11-15, infinex1):**
  - `frontend/src/lib/editions-live.ts`: `contentReadyNote()` (wording and
    tone) and `CONTENT_READY_NOTE_MS` (4000).
  - `frontend/src/app/(app)/admin/next/actions.ts`: `setContentReadyAction`
    returns that wording in place of "Content marked ready." / "Content
    marked not ready.".
  - `frontend/src/components/edition-controls.tsx`: `NoteLine` takes an
    optional `tone` ("muted" draws a success in the muted colour; errors are
    always red); `useAction` takes an opt-in `clearOkAfterMs` that clears
    only success notes. Only `ContentReadyToggle` passes it, so the other
    six users of the hook (advance, add asset, record a right, sales-open
    date, rate card, split lock) behave as before.
  - `frontend/tests/content-ready-note.test.ts`.
  - No backend change.

### 51. A campaign request from a random package can stall, and the sponsor isn't told why
`POL-FE-51` · *Silent* · *Dead end* · confirmed (found in walkthrough practice, 2026-11-15)

- **Problem:** the walkthrough lets a tester get the feel of the app by
  picking freely. A sponsor goes Marketplace → Packages → **Request this** →
  **Submit brief to BTG**. Whether that request ever becomes a staffed,
  running campaign depends on facts the sponsor can't see, so a package
  picked at random can end in a request that is held, or a campaign nobody
  can be offered. Nothing on screen says why: the sponsor's request pages
  never show BTG's hold reasons (`sponsor/requests/[id]/page.tsx`, by design
  of `sponsorBriefStatus`).
- **Why it matters:** a tester, and later a real sponsor, reads the silence
  as "the app is broken". It also hides that the network has no one for that
  package yet, which is the one thing a sponsor could act on (pick another
  package, widen the sport or area, raise the budget).
- **What gates it (checked in the code, 2026-11-15):**
  - **Automatic approval** (`backend/src/domain/brief-auto-rules.ts`,
    `autoApprovalHolds`) holds the brief for BTG unless all of these pass: a
    package still on sale; the budget at least the package's `priceLow`; at
    least the package's `athleteCountMin` athletes **fit**; no sensitive
    category; the sponsor in good standing.
  - **"Fit"** (`athleteFit` in `backend/src/domain/matching.ts`) means
    ACTIVE, in one of the brief's sports and states (an exact match on the
    words), and not restricted for the brief's or the sponsor's categories.
    So a sport or area no live athlete has gives a fit count of 0 and an
    `ATHLETES` hold ("No athletes fit yet; the package needs 5").
  - **Automatic staffing** (`backend/src/domain/auto-staffing.ts`) then
    walks that shortlist and, for each athlete, drafts and sends **one offer
    per package job line** (`offer-draft.ts`, `offer.ts`, the same rules as
    `invitation.ts`). An athlete who fails any line (a category restriction
    over the dates, a minor's guardian not verified, a pay floor) is skipped;
    the next athlete whose offers don't fit the budget left stops staffing;
    running out of athletes below the minimum stops it too. A stop is only
    shown to the sponsor as "BTG is finding more athletes" (#22).
  - **Correction (same day, walkthrough):** for BTG's *manual* path the rate
    card **is** a hard gate. The Matching Studio refuses to shortlist an
    athlete with no rate for a package job (`canShortlist` in
    `frontend/src/lib/matching.ts`; the row showed a dashed "Hold"), and no
    screen could write a rate (`POST /athletes/:id/rates` had no caller), so
    a held brief could not be staffed by hand at all. The paragraph below
    holds for *automatic* staffing only.
  - **The rate card is not a hard gate (automatic staffing).** The finding as first reported said
    an athlete needs a rate for every job in the package. The code does not
    require one: with no rate on file the offer's pay is the middle of the
    job's base range (`offer-draft.ts`, "No rate on file for …"), and the
    match score gives 0 rate points (`match-score.ts`), so those athletes
    rank lower but are still offered. A rate only matters as a floor the pay
    may not go under. Worth knowing when seeding test data: athletes need
    the right **sport, state, ACTIVE state and no conflicting restriction**,
    and rates make them rank and price well.
- **Related, found in the same walk:**
  - **Sport and Geography in the brief drawer come from fixtures, even on
    live.** `frontend/src/components/brief-request-drawer.tsx` (lines 56–60)
    builds `SPORT_OPTIONS` and `GEO_OPTIONS` from `athleteInv` in
    `@/lib/fixtures`, and `brief-request.ts` sends the pick as `sports` and
    `stateCodes`. A sport listed there that no live athlete plays is a
    guaranteed `ATHLETES` hold.
  - **There is no "launch now" for BTG on screen.** A campaign goes ACTIVE
    on its own at 00:00 UTC on its start date (`campaign-launch.ts`), and a
    blank start date in the drawer means **14 days from today**
    (`frontend/src/lib/brief-request.ts`, line 124). The API has
    `POST /campaigns/:id/launch` (BTG's manual launch, P5-BE-04) and the
    campaign page even says "BTG can still launch it sooner", but no screen
    calls it. So the sponsor's **See results** never appears during a test.
  - **The Start date showed today, and today is always held.** On staging
    (2026-11-15) the drawer's Start date showed **11/15/2026** already
    filled in, and a brief sent as it stood was held with "Dates: the start
    date (Nov 15, 2026) isn't in the future". So every untouched request
    went to BTG.
    - **Where the date comes from (checked):** not from our code. The field
      starts empty (`useState("")`, `brief-request-drawer.tsx` line 263) and
      is the browser's native `<input type="date">` with no `min` and no
      default. Only an empty value becomes today + 14 days
      (`brief-request.ts` line 124), and `origin/main` has the same code. So
      the date on screen came from the browser: some browsers (Safari, iOS)
      draw today's date in an empty date field, browser autofill can fill
      it, and a native picker opens on today, so one tap selects it. Once
      today is the value, it is sent as is.
    - **Why it is held:** the readiness rule
      (`backend/src/domain/brief-readiness-rules.ts`, line 92) needs the
      start strictly after now. Today at 00:00 UTC is already past, so
      today can never pass. Nothing in the drawer stops it: no `min`, no
      check before sending, and the sponsor never sees the hold.
    - **Also:** the owner rejects the native date input in portal UIs
      (`date-range-picker.tsx`, header comment, P1-ART-23). The brief
      drawer still uses one.
  - **NEXT magazine ad packages sit in the same Packages list** as the
    athlete campaign packages (`backend/src/domain/sponsor-packages.ts`
    seeds both), with nothing that tells a sponsor which is which. An
    ad-only package has no athlete job lines, so automatic staffing has
    nothing to do for it (`auto-staffing.ts`: "nothing to staff
    automatically").
- **Suggested fix (mostly frontend, `POL-FE-51`; the two reads marked API
  are small backend additions, to split out as `POL-BE-51` if rcfworks
  takes them):**
  - **Tell the sponsor plainly when a request can't be staffed yet.** On
    the request page, when the brief is held only for `ATHLETES`, say "We
    don't have enough athletes for this package in {sport / area} yet. Try
    another package, sport or area, or BTG will be in touch." (API: a
    sponsor-safe `waitingOn: "ATHLETES" | "BTG" | null` on the brief, never
    the full hold text, never athlete names.)
  - **Show which packages are staffable.** On Packages, and in the drawer
    once a sport and area are picked, a line such as "Ready to staff" or
    "Not enough athletes in your area yet". (API: a yes/no per package for
    the sponsor's targeting; a count or names never leave BTG.)
  - **Live Sport and Geography options**, from the API's own vocabulary or
    the live athlete pool, with the fixture lists kept for `?demo=` only.
  - **Tester Facility seeds a staffable network:** for every athlete package,
    at least `athleteCountMin` ACTIVE adult athletes in one sport and state,
    with no restrictions and a rate for each job line (rates are not
    required, but they keep test prices realistic). The facility's source is
    not in this repo; record the change there.
  - **A BTG "Launch now" button** on the admin campaign page for a campaign
    in APPROVAL, calling the existing `POST /campaigns/:id/launch`, with an
    "are you sure?". Or, for staging only, a test-mode start date of today.
  - **A start date that can't be held:** show the date that will be sent.
    Fill the field with today + 14 days (the rule a blank already follows)
    or with tomorrow, so it never looks empty and the value matches the
    screen. Set the earliest pick to tomorrow. Refuse today or a past date
    in the drawer, in words ("The start date must be after today"), before
    sending. Preferably use the house date picker (`DateRangePicker` in
    single-day use, with `min` set to tomorrow) instead of the native field.
  - **Tell the two kinds of package apart:** a "Magazine ad (NEXT)" label or
    its own tab on Packages, so a sponsor testing athlete campaigns doesn't
    pick an ad package by accident.
- **Built (2026-11-15, Code review):**
  - **Sponsor side, PR #420:** the start date opens at today + 14, can't be today
    or earlier, and today is refused in words; live Sport and Geography lists
    (`GET /catalogue/targeting`); `waitingOn` and "Waiting for athletes" on
    the sponsor's requests; "Ready for you" renamed "Approved — finding
    athletes"; "Ready to staff" / "Not enough athletes yet" on packages;
    "Magazine ad (NEXT)" label.
  - **BTG side, PR #421:** a rate card editor at `/admin/athletes/[id]/rates`
    (tier first, then a rate per NIL job; new read
    `GET /athletes/:id/rate-editor`, `POL-BE-51`); the Matching Studio's
    no-rate row reads "Needs a rate" with a **Set a rate** link; **Launch
    now** on a campaign in APPROVAL.
  - **Still open (at the time):** the Tester Facility seeding a staffable
    network (other repo); no admin athlete list leads to the rate editor yet
    (the Studio's link is the only way in).
- **Closed (2026-11-15, HeckerCreatives):**
  - **Launch now → See results, walked live:** a BTG admin launched a
    campaign waiting in APPROVAL ("Yes, launch today"), and the sponsor's
    page then showed **See results**.
  - **A second way to the rate card:** the athlete's profile
    (`/admin/new-signups/athletes/[id]`, the page BTG's emails link to) has
    a **Rate card** section with **Open the rate card**, for an approved
    athlete and only for the roles that set rates (BTG admin, network
    manager, SUPER_ADMIN). The editor leads back to the profile
    (`?from=profile`); from the Studio it still leads back to the Studio.
    (`profileRateCardHref`, `rateBackLink` in `lib/athlete-rates-live.ts`.)
  - **Found in the walk and fixed:** after an early launch the start date
    stays where it was, so the sponsor's campaign read "Running" and
    "starts in 10 days" at once. A running campaign now reads "ends in N
    days" (`windowLabel`, `lib/sponsor-live.ts`), on the campaign page and
    in the campaigns table.
  - **Moved out, not closed here:** the Tester Facility seeding a staffable
    network. The facility is its own Railway service (`tester`) and its
    source is not in this repo, so that change belongs to the facility's
    owner. The first clause of "Done when" below ("a tester who picks any
    athlete package from the Tester Facility's seeded network gets an
    approved, staffed request") is theirs. Every other clause is met here.
- **Done when:** a tester who picks any athlete package from the Tester
  Facility's seeded network gets an approved, staffed request; a package
  that can't be staffed says so before or right after submitting, in plain
  words, with no hold text or athlete details shown; Sport and Geography
  list live values on live; the Start date shows a date after today when
  the drawer opens, today and past days can't be picked, and an untouched
  brief is never held for `DATES`; BTG can launch an approved campaign on the spot
  and the sponsor then sees **See results** (**POL-78, 2026-11-16:** only
  once the campaign reached APPROVAL, which a partly staffed campaign
  couldn't until POL-52 added the stage buttons); NEXT ad packages are labelled
  apart from athlete packages; build and tests pass.

---

## I · Whole-app review (2026-11-15)

From `documentation/SponsorX-App-Review-2026-11-15.md` (the review's own IDs
in brackets: B1–B7 are its blockers, §2–§8 its sections). Logged 2026-11-15
by rcfworks, who owns both rows of every item here (programme owner's
decision: "do all the waves"). Waves 1–8 are the order of work; wave 1 is
the blockers and today's content review findings.

**Two decisions taken with the plan (rcfworks, 2026-11-15):**
- **Approving a student's piece never counts as consent.** A minor's
  consent is their verified guardian's, so the advisor's approval is never
  taken as it.
  - The plan first said approval would be *refused* without consent on file.
  - While building #59 it turned out no consent agreement (FEATURE, RELEASE
    or COMMERCIAL) exists in the system and no screen records one, so that
    rule would have refused every approval.
  - Approval now goes ahead. It records the usage right when a consent is in
    force, and otherwise says the piece can't go to print.
  - The edition's production gate keeps refusing an asset without a right, so
    nothing is published without consent.
  - **Open:** the media release text and the screen to accept it.
- **Approving and paying campaign earnings stays Finance's.** BTG_ADMIN
  gains no `earning.approve`.

### Wave 1 — blockers and content review (today)

### 52. A campaign can't leave Staffing short of the package maximum [B1]
`POL-FE-52` · *Dead end* · confirmed
- **Problem:** nothing on screen moves a campaign between DRAFT, STAFFING and
  APPROVAL; automatic staffing stops below the minimum and the automatic move
  needs the maximum, so a partly staffed campaign never launches.
- **Fix:** "Start staffing", "Move to approval" and "Back to staffing" on the
  admin campaign page, on the existing `POST /campaigns/:id/transition`.
- **Done when:** BTG moves a campaign DRAFT → STAFFING → APPROVAL (and back)
  from the campaign page, then launches it; a refused move shows the API's reason.
- **Delivered (2026-11-15, rcfworks):** `stageMoves` / `StageMoveButtons` on the admin campaign page (`moveCampaignStage` → `POST /campaigns/:id/transition`); `frontend/tests/campaign-stage-moves.test.ts`.

### 53. Campaign earnings can't be approved or paid [B2]
`POL-FE-53` · *Money* · confirmed
- **Problem:** no screen calls `POST /earnings/:id/transition` or
  `/adjustment`; earnings sit at Eligible or Approved for ever.
- **Fix:** Finance's earnings rows get Approve, Hold / Release, Mark paid
  (with a reference) and Adjust (with a reason). Finance-only, as the matrix has it.
- **Done when:** Finance takes an earning Eligible → Approved → Paid, holds and
  releases one, and adjusts one with a reason, from the Finance books.
- **Delivered (2026-11-15, rcfworks):** `EarningRowActions` in Finance's books (`moveEarningAction`, `adjustEarningAction`), Finance and SUPER_ADMIN only; `frontend/tests/earning-actions.test.ts`.

### 54. BTG and Finance can't find an ordinary marketplace order [B3]
`POL-BE-54` · `POL-FE-54` · *Dead end* · confirmed
- **Fix:** an "All orders" list (state filter, reference search) for BTG and
  Finance; the order page open to Finance for recording a payment; links to the
  order from payouts, refunds and delivery issues.
- **Done when:** BTG or Finance finds any order by state or reference and opens
  it; Finance records a bank transfer on it.
- **Delivered (2026-11-15, rcfworks):** API search widened (billing reference / name / email, sponsor name) and `sponsorName` on each row; `/admin/marketplace/orders` and `/finance/orders` (+ `/finance/orders/[id]`, the shared `MarketplaceOrderDetail`); order links from refunds, payouts and delivery issues; menus; `backend/tests/phase2-orders.test.ts`, `frontend/tests/all-orders-live.test.ts`.

### 55. A minor's invitation can't be answered; a guardian sees sample pages [B4, §3]
`POL-FE-55` · *Minors* · confirmed
- **Fix:** the athlete pages use `viewerIsAthlete(actor)` instead of
  `roles.includes("ATHLETE")`: Invitations, the dashboard's Finish profile,
  Profile and Profile edit.
- **Done when:** a guardian acting for a minor sees and answers the minor's real
  invitations and opens the real profile, never a sample.
- **Delivered (2026-11-15, rcfworks):** Invitations, Profile and Profile edit use `viewerIsAthlete`; `frontend/tests/guardian-acting-pages.test.ts`.

### 56. NEXT: BTG can't create or change a publication or an edition [B5]
`POL-BE-56` · `POL-FE-56` · *Dead end* · confirmed
- **Fix:** "New publication" and "New edition" forms on Admin → NEXT; a route
  and form to edit an edition's dates and threshold while PLANNING or SELLING;
  Cancel offered.
- **Done when:** BTG creates a publication for a school (it then appears on
  `/next/apply`), creates an edition, edits its dates, and cancels one.
- **Delivered (2026-11-15, rcfworks):** `GET /publications` (with the schools), `PATCH /editions/:id` (PLANNING or SELLING, dates in order, audited); a Set up panel on BTG's Editions page (new publication, new edition, edit, cancel); `backend/tests/pol-be-56-next-setup.test.ts`, `frontend/tests/next-setup-live.test.ts`.

### 57. NEXT: an under-18 student can never join the masthead [B6]
`POL-BE-57` · `POL-FE-57` · *Minors* · confirmed
- **Fix:** the student's guardian is emailed when the application comes in;
  BTG gets "Verify guardian" on the advisor desk's Approved group.
- **Done when:** a minor's application emails the guardian; BTG verifies the
  guardian from the desk; the advisor then adds the student to the masthead.
- **Delivered (2026-11-15, rcfworks):** `student.guardianNotice` emailed on a minor's application; reviewers read the guardian and its verified state; "Verify guardian" for BTG on the advisor desk (`POST /guardians/:id/verify` activates an approved student); `backend/tests/pol-be-57-student-guardian.test.ts`, `frontend/tests/student-guardian-live.test.ts`.

### 58. NEXT: no sale is ever credited to a student [B7]
`POL-FE-58` · *Money* · confirmed
- **Fix:** `/s/<code>` carries the code into the sponsor's request form as a
  "Student code" field, sent with the brief.
- **Done when:** a request filed with a student code credits the student's sale
  when its campaign is sold.
- **Delivered (2026-11-15, rcfworks):** "Student code (optional)" on the request drawer, filled from `?code=` or what `/s/<code>` kept in the browser; `/s/<code>` opens the form with it; a refused code shows the API's words; `frontend/tests/student-code-brief.test.ts`.

### 59. Content review: points, rights, the list badge, BTG's view [§6]
`POL-BE-59` · `POL-FE-59` · *Money* · *Consent* · confirmed
- **Fix:** approving a piece accrues its points and records its usage right
  from the student's consent (refused, with the reason, while no consent is on
  file); the student's list says "Changes requested" for a piece sent back;
  BTG staff see the live review desk, not the sample.
- **Done when:** approval adds the points and a right, so the piece doesn't
  block production; no consent → refused in words; the list badge matches the
  drawer; BTG opens Advisor → Content review live.
- **Delivered (2026-11-15, rcfworks):** Approval accrues the points (ARTICLE 50, INTERVIEW 25, PHOTO 25) and records the usage right from a consent in force; `usageRight` on each piece; the list badge and bucket follow the stage; BTG gets the live desk; `backend/tests/student-assignments.test.ts`, `frontend/tests/student-assignments-live.test.ts`.

### Wave 2 — the walkthrough loop

### 60. BTG can't open a campaign's sponsor report [§2]
`POL-FE-60` · *Dead end* · confirmed
- **Fix:** the report served for staff under `/admin/campaigns/[id]/report`.
- **Done when:** BTG's "Sponsor report" opens the report.
- **Delivered (2026-11-15, rcfworks):** `/admin/campaigns/[id]/report` serves the report page inside the admin portal; the campaign page links there with `?from=admin-campaign`.

### 61. A published post waits on no queue [§2]
`POL-BE-61` · `POL-FE-61` · *Silent* · confirmed
- **Fix:** a "To verify" tab and dashboard card; BTG emailed when an athlete
  marks a post published.
- **Done when:** a post marked published appears under To verify and BTG is
  emailed; verifying it moves it on.
- **Delivered (2026-11-15, rcfworks):** "To verify" tab (PUBLISHED) on the approvals desk, a "Posts to verify" dashboard card, and `deliverable.publishedForBtg` emailed to BTG admins and campaign managers when an athlete marks a post published.

### 62. Reach is always zero; no tracking links [§2]
`POL-FE-62` · *Dead end* · confirmed
- **Fix:** "Record views" on the deliverable and the Approvals drawer;
  "Create tracking link"; "Reach short" hidden until a metric exists.
- **Done when:** recorded views show in the report; a tracking link can be made
  and copied.
- **Delivered (2026-11-15, rcfworks):** "Record views" (VERIFIED_MANUAL) and "Create tracking link" in the approvals drawer for a published or verified post; backend `assessDelivery` no longer flags "Reach short" before any figures exist.

### Wave 3 — campaign pipeline

### 63. The BTG campaign desk sends people to the wrong place [§2]
`POL-BE-63` · `POL-FE-63` · *Dead end* · confirmed
- **Fix:** approving a held brief creates the campaign and starts staffing;
  the Campaigns list always opens the campaign page ("Open in Matching Studio"
  there); "Find a replacement" and the empty roster pass `?brief=`; a warning
  before hand-picked sends also start automatic offers; Send hidden for the
  network manager, saying who sends.
- **Done when:** each of the five behaves as described.
- **Delivered (2026-11-15, rcfworks):** Approving a held brief by hand creates its campaign and starts staffing (the Studio and `POST /briefs/:id/campaign` reuse it); the Campaigns list always opens the campaign page, which has "Open in Matching Studio" on its own brief; replacement and empty-roster links pass `?brief=`; the Studio warns that sending starts automatic offers; the network manager sees who sends instead of Send.

### 64. Nobody is told at three hand-offs [§2]
`POL-BE-64` · `POL-FE-64` · *Silent* · confirmed
- **Fix:** campaign managers emailed when an athlete accepts ("Orders to
  draft" card); the athlete (or guardian) emailed when an order is SENT
  ("Orders to sign" tile); the sponsor emailed, with a safe reason, when BTG
  closes a brief; approved-not-active athletes reworded and counted ("To activate").
- **Done when:** each email is queued at its step; each card or count shows.
- **Delivered (2026-11-15, rcfworks):** Emails `invitation.acceptedForBtg` (BTG admins and campaign managers), `order.readyToSign` (the athlete and the linked guardian) and `brief.closedForSponsor` (sponsor admins — BTG's reason stays internal); approved-not-active reworded; an "Athletes to activate" dashboard card.

### 65. The sponsor's request form promises and allows the wrong things [§2]
`POL-FE-65` · *Friction* · confirmed
- **Fix:** objective needs 8 words, in the drawer and the edit form; the edit
  form reuses the drawer's dates and live options and shows the new status;
  wording says a passing request is approved at once; a held request links to
  Requests; "See results" only once ACTIVE ("Open campaign" before).
- **Done when:** each is visible on the sponsor's screens.
- **Delivered (2026-11-15, rcfworks):** 8-word objective in the drawer and edit form; the edit form refuses a start not after today and a run under 7 days when the dates change; wording says a passing request is approved at once; a held request links to Requests; "Open campaign" until a campaign is live, then "See results".

### 66. A NEXT ad package request uses the athlete form [§2]
`POL-BE-66` · `POL-FE-66` · *Friction* · suspected in part
- **Fix:** a shorter ad request form, no athlete check, ad wording on the
  sponsor's campaign page.
- **Done when:** an ad package request asks only what an ad needs and never
  says "being staffed".
- **Delivered (2026-11-15, rcfworks):** Backend: a package that staffs nobody (no athlete lines, an athlete maximum of 0) is never held for athletes, and its approved line reads "Approved — your ad is booked into the edition". Frontend: the request drawer asks an ad package no athlete questions.

### 67. The sponsor can't see their fan reward or leads; loose links [§2]
`POL-FE-67` · *Dead end* · confirmed
- **Fix:** a "Fan reward" panel (QR, staff code) and a "Leads" tab on the
  sponsor's campaign; "Download PDF" of the report; an order picker for
  disputes; "Back to Campaign" uses the real id; campaign requests treat a 404
  as an error.
- **Done when:** each is on screen and works.
- **Delivered (2026-11-15, rcfworks):** A "Fan reward" panel (offer, state, staff code, each QR on a signed link) and the fans who agreed to be contacted, on the sponsor's campaign page; "Back to Campaign" from an athlete's profile uses the real campaign; the dispute form points to the roster's "Raise a concern"; a campaign-change 404 is an error. The report's PDF/Excel download already existed (P8-FE-09), so the server-render routes stay for scheduled renders.

### Wave 4 — athletes and guardians

### 68. A minor's and a guardian's screens mislead [§3]
`POL-FE-68` · *Minors* · confirmed
- **Fix:** coded 403s pass through and guardian-controlled buttons are hidden;
  the seat reads "Guardian"; the acting-for notice moves into the layout; a
  minor reaches their Guardian requests page; pending confirmations link to
  Confirmations.
- **Done when:** a minor's login shows no always-failing button; a guardian's
  seat is labelled plainly.
- **Delivered (2026-11-15, rcfworks):** A minor's coded refusals are shown as the API words them (offers, inventory, listings); a minor's own login sees that the guardian accepts the order; the guardian's seat reads "Guardian"; the guardian notice is in the layout; a minor reaches Guardian requests. **2026-11-16:** a missing confirmation on an offer or a new item says which one (school rules, or the Content Collaboration Agreement) and links to Confirmations, coming back afterwards.

### 69. Athlete orders, earnings and profile say untrue things [§3]
`POL-BE-69` · `POL-FE-69` · *Money* · confirmed
- **Fix:** Campaign orders lists offer-born orders and links deliverables;
  Earnings says campaign pay is by BTG Finance (Stripe for shop sales); the
  earnings drawer drops sample text; after accepting, Earnings says it starts
  when deliverables are verified; the empty Invitations page says BTG matches
  and invites; profile completion leaves rates out, links Agreements to
  Confirmations and counts a guardian's signature; deliverable versions open;
  one name per page and a Confirmations link.
- **Done when:** each screen reads true.
- **Delivered (2026-11-15, rcfworks):** Earnings say campaign pay is BTG Finance's and Stripe is for shop sales; after accepting, earnings say they start once deliverables are verified; the drawer drops the sample hold reason and the fixed year; Invitations and Profile say BTG matches and invites; Campaign orders points to Offers for offer-born orders; the rate card no longer counts in profile completion. **2026-11-16:** POL-BE-69 — agreements count by athlete (their logins, rows naming them, and what their guardian authorised), so a minor whose guardian signed is counted, and the Agreements section links to Confirmations; an athlete opens each version they uploaded (a signed link); the menu and pages use one name each (Sales, Payouts); Confirmations has a permanent place under Account.

### 70. An applicant asked for changes can't make them [§3]
`POL-BE-70` · `POL-FE-70` · *Dead end* · likely
- **Fix:** a token page, `/join/edit?token=`, on the existing intake routes;
  the email links to it.
- **Done when:** an applicant opens the link, edits and resubmits.
- **Delivered (2026-11-15, rcfworks):** Backend: the changes-requested email links to `/join/edit?token=`. Frontend: `/join/edit` shows BTG's note and lets the applicant change their name, sport and state and send it back (PATCH on the intake token, which resubmits).

### Wave 5 — sponsor portal

### 71. Sponsor dashboard, `/brief`, roles and teammates [§4]
`POL-BE-71` · `POL-FE-71` · *Dead end* · confirmed
- **Fix:** "Needs you" inside the empty dashboard; `/brief`'s timeline reworded;
  request buttons hidden for non-admins and one role name; a sponsor admin can
  re-invite a removed teammate.
- **Done when:** each holds on screen; a removed teammate is re-invited.
- **Delivered (2026-11-16, rcfworks):** The empty sponsor dashboard shows a Shop order to pay and requests with BTG above "No campaigns yet" (the overview now counts requests in review). `/brief` describes what really happens: an account check, then the first request in the portal. A Viewer sees the catalogue without "Request this". The role reads "Sponsor Viewer" everywhere. A sponsor admin adds back a removed teammate (`POST /sponsor/team/:id/restore`); a login BTG switched off stays off.

### 72. Sponsor portal loose ends [§4]
`POL-BE-72` · `POL-FE-72` · *Friction* · confirmed
- **Fix:** "Approved" while card payment is closed; the spending limit beside
  the total; a "More" on shop listings; "Order again" to Shop; availability
  filter and job names from `GET /catalogue/jobs`; one name for Intelligence;
  Billing points Shop-only sponsors to Orders; "Not in your role" for staff on
  `/sponsor/marketplace`; categories editable on the sponsor record.
- **Done when:** each holds on screen.
- **Delivered (2026-11-16, rcfworks):** While card payment is closed, approved orders read "Approved" on Orders and the dashboard (the API sends `paymentsOpen`). Checkout shows the spending limit beside the total, and whether this order is within it. Long Shop descriptions open with "More". "Order again" goes to the Shop. Package cards name jobs from `GET /catalogue/jobs`, the Availability filter is "Ready to staff", and the campaign report uses live job names. The page is called Intelligence. Billing points a Shop-only sponsor to Orders. Signed-in staff on Packages see "Not in your role". BTG changes a sponsor's business type on the approved request page.

### Wave 6 — BTG admin, Finance, property

### 73. Finance and payouts mislead [§5]
`POL-BE-73` · `POL-FE-73` · *Money* · confirmed
- **Fix:** payout emails open Finance's own payout page; an approved payout
  says why it is waiting when payments are off; the Treasury tile opens a tab
  with something in it; a "Sent back" tab; VOIDED reads "nothing owed"; refunds
  wording; Finance sees committed revenue on editions.
- **Done when:** each holds.
- **Delivered (2026-11-16, rcfworks):** Payout emails link to `/payouts/<id>`, which opens Admin or Finance's own payout page. An approved payout says why it waits (no provider yet, or payments switched off), and the API's provider is the active one. The Treasury tile opens the Failed tab when no new request waits. Payouts has a "Sent back" tab. VOIDED reads "Voided — nothing owed". The refund wording says when a card refund is automatic. Finance sees committed revenue on editions (a total only; still no slot read).

### 74. System health, intelligence and staff accounts [§5]
`POL-BE-74` · `POL-FE-74` · *Friction* · confirmed
- **Fix:** parked Zoho jobs left out of the queue health ("Zoho not
  connected"); Pricing and Forecasts say when they update; an attribution
  Partners panel; staff test accounts noted for the Tester Facility.
- **Done when:** each holds.
- **Delivered (2026-11-16, rcfworks):** Parked Zoho CRM jobs are marked `parked` and left out of the worker queue's health; the Zoho row says "Zoho not connected". Pricing and Forecasts say they update nightly from 19:00 UTC. Attribution has a Partners panel, and a BTG admin adds a partner (the token is shown once). `documentation/SponsorX-Testing-on-Staging.md` covers staff accounts (from the Tester Facility) and how to fill Disputes, Payment events and Failed payouts on staging.

### 75. Property, closures and email preferences [§5]
`POL-FE-75` · *Friction* · confirmed
- **Fix:** a team manager's dashboard buttons and Settings gated; a "Package
  rules" block on the item form; closure deals linked; a Notifications section
  in Settings.
- **Done when:** each holds.
- **Delivered (2026-11-16, rcfworks):** A team manager's empty dashboard offers "Add athlete →" and "Add an item →", and Settings shows no sample links to a real manager. The item form has a Package rules block: minimum and maximum per order, exclusive, and "I approve each order" (bundle-only is stored but not enforced, so it isn't offered). Each deal holding an account closure links to its campaign or marketplace order. Every portal's Settings has a Notifications section to turn each kind of email on or off.

### Wave 7 — NEXT

### 76. NEXT applicants are never told anything [§6]
`POL-BE-76` · `POL-FE-76` · *Silent* · confirmed
- **Fix:** emails for received, approved (with sign-in steps), changes asked
  and declined; the advisor sees whether a login was made.
- **Done when:** each decision emails the applicant; the desk shows the login outcome.
- **Delivered (2026-11-16, rcfworks):** The applicant is emailed when the application arrives, when it's approved (with sign-in steps, or a note that the advisor will sort out sign-in if their address is taken), when changes are asked (the note and a link to apply again) and when it's declined. It happens in the move itself, so the roster rule's decisions send too. Reviewers' student rows carry `login` (signed in, invited, no email, address in use); the desk shows it on each approved student and, after a decision, says who was emailed instead of "Saved.".

### 77. NEXT public pages, the QR and the student's edition [§6]
`POL-BE-77` · `POL-FE-77` · *Dead end* · confirmed
- **Fix:** a real QR of `/s/<code>`; the public edition shows approved text and
  records clicks; "View the public edition" after publishing and linked school
  list; a read-only "This edition" card for students and advisors; a roster
  paste box on the advisor desk.
- **Done when:** each holds.
- **Delivered (2026-11-16, rcfworks):** My code shows a real QR of `/s/<code>`, drawn on the server. The public edition shows each written piece's approved text under "Read", and the first open records a LINK_CLICK on the article. Sponsor cards stay plain because no sponsor web address is stored. BTG's edition card has "View the public edition →" once published, and `/next/schools` links each school. Students and advisors get a read-only "This edition" card (state, close date, positions sold, open positions with prices). The advisor desk has a roster paste box (`POST /properties/:id/roster`). BTG already saw the live content review (P9-FE-12).

### Wave 8 — records

### 78. `polish.md` says five things work that don't [§8]
`POL-FE-78` · *Docs* · confirmed
- **Fix:** correct items 9, 38, 40 and 51 and the Finance lines, once the
  fixes above land.
- **Done when:** this file matches the code.
- **Delivered (2026-11-16, rcfworks):** Corrected in place, each marked "POL-78": the Finance line (earnings are marked paid from the Treasury books since POL-53), item 9 (guardians answer the ward's invitations since POL-55), item 38 (the join screen's resend and change-guardian are wired), item 40 (the one exception, staff on Packages, closed by POL-72) and item 51 (launching needs APPROVAL, reachable since POL-52).

### Wave 9 — owner requests

### 79. Confirmations reads as two stacked forms [§4]
`POL-FE-79` · *Confusing* · confirmed (programme owner, 2026-11-16: "so confusing for a human")
- **Fix:** turn `/athlete/confirmations` into a step-by-step wizard: a numbered
  stepper (a rail on a wide screen, dots on a phone), one step per
  confirmation — read it, tick the box, confirm — a footer with "Step N of M",
  Previous and the one action, and an "all set" end with the way back.
- **Done when:** an athlete can finish both from the page without reading
  instructions; the wording is still shown word for word; a minor's own login,
  a guardian acting for them and an unavailable read each still say what they
  said before.
- **Delivered (2026-11-16, HeckerCreatives):** `components/confirmations-wizard.tsx` replaces `confirmations-form.tsx`; the page decides every word, the wizard walks them. The agreement reads section by section with a reading bar and section chips (`agreementSections`, tested word for word against `COLLAB.v2.txt`). A confirm plays a burst and moves to the next open step; reduced motion gets the still version. Walked live at 1440 and 320 (both steps, no console errors, no sideways scroll).

### 80. The athlete's public profile is nine plates and no path [§3]
`POL-FE-80` · *Confusing* · confirmed (programme owner, 2026-11-16: "make it a step by step wizard … easy to understand", keep the Arena theme; once the profile is complete, no "Open public page", the public page itself)
- **Fix:** while the profile is unfinished, `/athlete/profile` is a wizard:
  one step per section the athlete can answer (who you are, sport, socials,
  content, brands, what you won't promote, the agreement), each saying who
  sees it, with a friendly form, a live preview of the public page, and
  Save & continue. Once every step is done, the page shows the public page
  itself, owner-framed, with the private sections under it.
- **Done when:** an athlete can finish their profile from the page without
  reading instructions; a finished profile shows its public page with no
  "Open public page" link and no sponsor-side button; nothing private
  reaches the public frame.
- **Delivered (2026-11-16, HeckerCreatives):** `components/profile-wizard.tsx` (client island), steps and rules in `lib/profile-wizard.ts`, the public page in `components/profile-showcase.tsx` (built from `publicFace`, which carries only what `GET /public/athletes/:slug` sends; Invitations stands where "Request a proposal" would). Every save is the full editor's own write (`edit/actions.ts`); legal name, date of birth and guardian stay in the full editor. The agreement step opens Confirmations, which comes back here. A save plays a medal and moves on; finishing opens the finale, then the page; a profile finished elsewhere gets a one-time ribbon. The medal, confetti and glyphs moved to `components/wizard-kit.tsx`, shared with #79. Walked live at 1440, 1024, 390 and 320: sport → content → brands → off-limits → Confirmations → back to the public page; one change record per save under a double click, no console errors, no sideways scroll.

### 81. The athlete home is eleven blocks with no first move [§9]
`POL-FE-81` · *Confusing* · confirmed (programme owner, 2026-11-16: "make it a step by step wizard … easy to understand", with three dashboard references; keep the Arena theme)
- **Fix:** put a step-by-step wizard at the top of `/athlete`, the "game plan":
  the six steps from sign-up to paid (profile, agreements, payouts, answer,
  deliver, get paid), one at a time, each with one sentence and the one thing
  to do, opening on whatever is late, else the first step that needs the
  athlete. Below it, the numbers in the references' anatomy (KPI plates with
  ring gauges, the earnings as bars, payouts, the shop).
- **Done when:** an athlete landing on the home can tell what to do next
  without reading the whole page; every figure is still one of the page's own
  reads; a guardian, a minor's own login and staff preview each see only the
  steps they have.
- **Delivered (2026-11-16, HeckerCreatives):** `components/athlete-game-plan.tsx` (client island) with the words and states in `lib/athlete-game-plan.ts`; the step bodies are drawn by the server page and passed as ReactNode. The "coming up" plates, profile lane, payout banner, orders-waiting plate and confirmations banner moved into the step each belongs to. New `components/athlete-glance.tsx` (KPI plates with rings, earnings bars with tooltips and a table for screen readers) and `components/arena-ring.tsx`; styles in `app/(app)/athlete/home.css` (theme tokens, Frost and dark, reduced-motion still look). Same reads; nothing new fetched or estimated. Walked live at 1440, 1280 (Frost) and 390: no console errors from the home, no sideways scroll.

`POL-FE-82` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /athletes/[slug] … based on the images provided … animations + wow factor … easy to understand … showcase what they did inside the platform and the good things about the athlete"; three profile references; keep the theme. Then: "it should see on the /athlete/profile when the step by step wizard is complete")
- **Fix:** rebuild the public athlete page in the references' anatomy (a cover, an overlapping photo, the name with a verified badge, big numbers, sticker badges, tabs, work cards), reading as three plain questions: Track record, Reach and About. Add what the athlete has done on SponsorX, from real counts. The finished `/athlete/profile` shows this same page, owner-framed.
- **Done when:**
  - A sponsor can tell in one screen who the athlete is, what they've done and how to work with them.
  - Every number is a Postgres count or a social row with its provenance.
  - Nothing commercial or private is public: no sponsor or campaign names, no money, no rates, no age.
  - A minor's photo shows only after BTG approves it.
  - The owner's copy has no sponsor-side button.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **API:** `GET /public/athletes/:slug` now adds `photoUrl`, `memberSince` and `track`. `photoUrl` follows the home page's rule: an adult's photo shows; a minor's, or one with no age on file, only after BTG approves it. `memberSince` is the approval month. `track` (`publicTrackRecord` in `backend/src/domain/featured.ts`) has campaigns completed, distinct brands (a count only), live and verified posts, posts on time, fan redemptions, and the latest six posts (platform and month only). All three are null for a featured athlete.
  - **Shared page:** `components/athlete-public-page/` has a `public` mode and an `owner` mode. The words and badges live in `lib/public-athlete.ts`; every badge is earned from the data, and a newcomer gets an honest "New on SponsorX".
  - **Motion:** an island (`profile-fx.tsx`) handles scroll reveals, tilt with glare, cover parallax and sticky tabs that follow the scroll. The hero's entrance waits for the boot screen; reduced motion gets a still page.
  - **Owner view:** `/athlete/profile` reads the same public answer once the wizard is complete. Not live yet, it shows the public sections with no record. Owner mode drops "Request a proposal" for "How sponsors reach you" → Invitations, and adds a "Make your page stand out" card. The name is an h2 under the portal's "Public profile" h1. The private sections stay underneath.
  - **Checked:**
    - Backend: `public-track-record.test.ts` (5) and the key set in `next-rights.test.ts`.
    - Frontend: `public-athlete.test.ts` (14), and `profile-wizard.test.ts` gained a check that a failed public read shows an error page.
    - Walked live at 1440 and 390 on both routes: no console errors, no sideways scroll.

`POL-FE-83` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /athlete/inventory … with animations + wow factor … make sure its easy to understand because what you did before is so confusing for a human … not to remove the current theme"; three references: an inventory table, a product list under a statistics row, an app store of cards with Activate. Then, while it was built: "a button then a popup like any inventory system", "you would see the lists first and there's a button that will say add", the "How selling works" and "Categories you won't promote" blocks at the bottom "look like shit", and "instead of edit, it must be view … like in the public profile … the design must caught the attention of the sponsors")
- **Fix:** make `/athlete/inventory` read like an inventory system, list first, with one button to add. Opening an item shows it the way sponsors meet it, and editing is a button on that page.
- **Done when:**
  - The items come first, under a title with an add button. Adding happens in a popup.
  - Every count is the API's own.
  - An item page sells the item, keeps what sponsors never see in one marked panel, and shows no sponsor button that does nothing inside the portal.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **List:** the title row carries **Won't promote · n** and **+ Add an item**.
    - The tabs carry the API's whole-scope counts: All, Available, Paused, and Not listed yet (that one is `?unlisted=true`, which the API already filters on).
    - Search, then List (the default) or Cards. One line says how selling works.
    - Each item has an **Available / Paused** switch, the Activate of the reference. It flips at once and rolls back with the API's sentence if the save is refused.
    - Beside it, a badge says where the item stands on the marketplace, from its listing (`GET /listings`): "On the marketplace", "Listing in review", "Draft listing", "Listing paused", "Hidden while paused" or "Not listed".
      - The switch is not the shop. The first build labelled it "On sale", and the owner caught an "On sale" item under "Not listed yet".
      - A sponsor only finds an item through a published, public listing whose item is switched on (backend `marketplace-search.ts`). The badge follows the switch the moment it flips.
    - Words per item are in `lib/inventory-shop.ts`: "Only 2 left", "Sold out", "No limit", "Opens Dec 3", "Ended …".
  - **Add:** a popup (centred, a bottom sheet on a phone) with kind tiles over the same `InventoryForm`. The form takes the picked kind.
    - **Add item** creates the item Available. **Save as draft** (the owner: "when creating an item, where is the draft button?") creates it Paused (`active: false`, which `POST /inventory` already accepts), so no sponsor can buy it until it's switched on.
    - The buttons are pinned to the popup's bottom edge, so they stay in sight however long the form is.
    - `allowDraft` is the athlete's only; the team manager's form is unchanged.
  - **Edit popup** (the owner: "when I tried to edit a draft item, there's no options that I can undraft or submit it"):
    - A first line says Draft (Paused) or Available.
    - A draft offers **Save & make available** and **Save draft**. An available item offers **Save changes** and **Save & move to draft**. The switch rides along with the save as `active`.
    - Once made available and still unlisted, the answer offers **List it on the marketplace →**: the submit, through the existing `/athlete/listings/new?item=…`. The answer scrolls into view above the pinned buttons.
    - An empty inventory shows a hero with "Add your first item" and six idea tiles, each opening the popup on its kind.
  - **Item drafts removed, later the same day** (the owner, while POL-FE-84 was built: "why is there a draft in listing? … remove the draft options in the inventory"). A draft is a listing's; an item is only Available or Paused, by its switch.
    - The Add popup is back to **Add item** and the Edit popup to **Save changes**.
    - `InventoryForm` lost `allowDraft`, `nextStep`, the Draft/Available status line and the save intents. Its answer still scrolls into view.
  - **Won't promote:** the restrictions moved into a popup as chips.
    - The category menu opens downward from the top of the popup's body. That reverses POL-FE-45's "up", which was only about the page's bottom bar; the popup sits above that bar.
  - **Item page:** `/athlete/inventory/[id]` opens on a showcase (`components/athlete-inventory/item-showcase.tsx`, `lib/inventory-showcase.ts`).
    - **The stage:** a product stage in the kind's colour, with a price tag and "Offered by" the athlete.
    - **The pitch:** the title, the description and price, stock and dates, package rules, and what's in a package.
    - **The marketplace line** says live, under review, paused, or not listed. It offers "Open the listing" or "List it", or says the team lists it.
    - **More sections:** "A good fit for" (the item's categories), and "Who you're working with": reach and track record from `GET /public/athletes/:slug` once live, left out if that read fails.
    - **Private panel:** "Only you see this" holds the categories it won't be sold to, the version and the last change.
    - **Owner bar:** the Available switch and **Edit item** sit on top; Edit item opens the same edit form in a popup. Cards say **View**.
    - **Hidden while paused:** the marketplace line says when a live listing is hidden because the item is paused.
  - **API — a hold no longer buys what's off sale.** Placing an order converted the sponsor's 15-minute hold (`HOLD_MS`) without checking the listing again. A sponsor could still check out an item the seller had just switched off or whose listing was paused or ended.
    - `placeOrder` now re-checks every line after locking the items, using `listingOnSale` (`domain/availability.ts`). That is checkListing's "live" test (published, public, the seller can still sell, the publish date passed) plus the item switched on, without the stock count the hold already holds.
    - A line no longer on sale is refused with 409: "\"<title>\" is no longer on sale, so the order can't be placed. Remove it from the cart and check out again." Nothing is placed, no acceptance is recorded, and the hold is kept. Covered in `tests/phase2-orders.test.ts`.
  - **Unchanged:** the property portal's inventory (`InventoryManager`, `InventoryItemView`).
  - **e2e:** `marketplace-path.spec.ts` now opens the popup ("Add your first item" / "Add an item") before filling the form.
  - **Checked:**
    - `inventory-shop.test.ts` (new, 13) and `inventory-showcase.test.ts` (new, 8). The frontend suite is 2,216 tests and tsc and eslint are clean.
    - Walked live in Chrome at 1440 and 390 as the QA athlete: list, cards, tabs, both popups, the empty hero (on a throwaway route, deleted), and two item pages. No console errors, no sideways scroll.
    - `next build` was not run: the owner's `next dev` was live.


`POL-FE-84` · *Confusing* · confirmed (programme owner, 2026-11-16: "let's do the listing page /athlete/listings. The visual design is too much confusing, do like what we did in the inventory page /athlete/inventory"; then, seeing a listing draft beside the inventory's item draft: "why is there a draft in listing ? I think i know now, remove the draft options in the inventory")
- **Fix:** make `/athlete/listings` work like the inventory: listings first, one button to list an item, the listing's state in plain words. Drafts belong to listings only.
- **Done when:**
  - The listings come first, under a title with a list button. Listing an item happens in a popup.
  - Every count is the API's own.
  - Each listing says where it stands and what to do next, and a draft no longer reads "Not listed yet".
  - The inventory has no draft buttons.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Gone:** the KPI plates, the two tables (Your listings, Ready to list) and the trip to the separate compose page.
  - **Title row:** **+ List an item · n**, where n is the items with no listing yet. It opens a popup in three steps:
    - pick an item (the API's unlisted items, up to 60, with a link to Inventory for the rest; a paused item is marked);
    - say what the sponsor gets, beside the same "What's checked" list, worked out on the server per item;
    - **List it** (create, then submit, as before) or **Save as draft** (create only, the new `draftListingAction`). It ends on what happened: "Live ✓", "Goes live on …", BTG taking a look, or "Saved as a draft", with **Open the listing** and **List another item**.
  - **Tabs:** All, Live, In review, Drafts, Paused and Ended, from the API's `counts.byState`. They are the URL's `state`, the old filter's key, so old links still work. Then search, and List or Cards (the same remembered choice as Inventory). One line says how listing works.
  - **Each listing:** its kind, price and stock, and a status in plain words: "Live on the marketplace", "Goes live …", "In review by BTG", "Changes asked", "Draft", "Paused", "Paused by BTG", "Hidden while the item is paused", "Ended". Cards add one sentence on what it means.
    - On the seller's own live or paused listing, a **Live** switch: the old Pause and Resume, optimistic, rolled back with the API's sentence. A resume BTG holds comes back "In review".
    - Other listings show their next step instead: "Finish & submit", "Make the changes", or "Your team's".
  - **No listing yet:** a hero with the three steps and the items as tiles, each opening the popup on its own. With an empty inventory, it links to Inventory instead.
  - **Kept as they were:** the roster panel ("Your team lists your items"), the not-approved notice, and the listing page (`./[id]`). `./new?item=` still works for links from elsewhere.
  - **Shared code:**
    - `inventory-shop.tsx` exports its popup, tabs (now generic over their keys), switch (with its words as a prop), view toggle and tilt, for both pages.
    - The checklist's "Ready" rows are green instead of the accent orange, which read as a warning.
    - Words are in `lib/athlete-listings-shop.ts`. Styles are the inventory's `inventory.css` plus `athlete/listings/listings.css`.
  - **Popup focus:** when a step's button disappears, focus moves to the next step, so Escape and Tab keep working. The walk caught this.
  - **Inventory drafts removed:** see POL-FE-83.
  - **Checked:**
    - `athlete-listings-shop.test.ts` is new (11 tests). The frontend suite is 2,232 tests; tsc and eslint are clean.
    - Walked live in Chrome at 1440 and 390 as the QA athlete: the list, cards, tabs, the popup's pick and write steps, Escape, and the inventory's Add and Edit popups (no draft buttons). No console errors, no sideways scroll.
    - `next build` was not run: the owner's `next dev` was live.


`POL-FE-85` · *Confusing* · confirmed (programme owner, 2026-11-16, on /athlete/listings/[id]: "let's redesign this … more professional look + wow factor + awwwaaaard + easy to understand by human + not too cluttered + not to many informations at once"; then "maybe a step by step wizard too?"; then "after its live/submitted, you will hide the step by step wizard and will show the public page of the item plus a options on how to end this item")
- **Fix:** a draft listing becomes a short wizard, one question at a time. Once submitted, the page is the item's public page under a small status bar, with the ways off the marketplace under it.
- **Done when:**
  - A draft asks one thing per step, and shows the checks only where they decide anything.
  - A submitted, live, paused or ended listing shows what sponsors see, where it stands in one sentence, and how to pause or end it.
  - Nothing is lost between steps.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Draft: a three-step wizard.** The steps are 1 the item, 2 what the sponsor gets, 3 go live.
    - It opens on the first step with something to fix (`wizardStart`).
    - The stepper's track fills as you move, and each step slides in from the side you're heading. Focus moves to each new step's question.
    - Beside the steps, a "How sponsors will see it" card follows the typing. A link opens the exact shop card (`./preview`).
    - **Step 1:** the item and its own three checks, with a link to Inventory.
    - **Step 2:** a large textarea, a meter toward the 20-character minimum ("8 more characters to go") and three hints (what, when, where). Leaving the step saves the words (PATCH), so nothing typed is lost.
    - **Step 3:** a readiness ring ("5 of 6 checks pass"), only the rows to fix (each with "Fix it", which jumps to its step), the optional extras folded away, and **Submit & go live**. The button stays off while a required row fails.
    - BTG's "changes asked" note sits above the wizard. **Discard this draft** is at the foot, with a confirm.
  - **Submitted, live, paused or ended: the public page.** The wizard is gone, and the page is the item's sponsor-facing showcase: the inventory item page's `ItemShowcase` (POL-FE-83), with the listing's title and words, and without the private panel.
    - **The bar above it:** back, the status in one sentence, Written → Checked → Live, and the one control the state allows. That is the **Live** switch (live or paused), or **Edit what the sponsor gets** in a popup (paused: save, or save and go live; held for BTG: save and submit again). A **Shop card** link sits beside it.
    - **After a submit or a resume,** the page opens on what happened (`?done=1`): "Live ✓" with a burst, "Goes live on …", or BTG taking a look.
  - **The ways off sit in the bar, small** (the owner first saw them as a two-card "Taking it off the marketplace" section under the showcase: "maybe its better to put this at the top and reddesign this so that it won't take much space"):
    - the **Live** switch pauses (its tooltip says so);
    - a small red-outlined **End listing** ends it for good, and asks to confirm;
    - once ended, **List the item again** takes its place;
    - a team's listing shows no controls.
  - **Shared code:**
    - `ItemShowcase` takes an optional `bar`, `after`, `privatePanel` and `fitsEmpty`, and `market` may be null. The inventory item page is unchanged.
    - The showcase's seller builder moved to `lib/showcase-seller.ts`, for both pages.
    - Words are in `lib/athlete-listing-desk.ts`; styles in `athlete/listings/[id]/listing.css`.
  - **Same reads and writes as before** (`../actions.ts`). The page also reads `GET /inventory/:itemId` and the athlete's profile for the showcase, and falls back to the listing's own fields if the item can't be read.
  - **Checked:**
    - `athlete-listing-desk.test.ts` is new (7 tests). The frontend suite is 2,239 tests; tsc and eslint are clean.
    - Walked live in Chrome at 1440 and 390, with no console errors and no sideways scroll:
      - the owner's draft, "Testing social post", signed in as its owner on local dev, only viewed and not saved or submitted: it opened on step 2, and step 3 showed the one fix;
      - a live package listing with `?done=1`;
      - the inventory item page, unchanged.
    - `next build` was not run: the owner's `next dev` was live.


`POL-FE-86` · *Confusing* · confirmed (programme owner, 2026-11-16: "lets redesign this also athlete/listings/…/preview", after POL-FE-85)
- **Fix:** show the athlete their card where sponsors meet it, and say in one line whether sponsors can see it.
- **Done when:**
  - The card is the shop's own, unchanged.
  - The page says whether sponsors can see it now and, if not, why, in a few words.
  - It can be checked at phone size.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **The shop window:** the shop's own `ShopListingCard`, untouched, with "Add to cart" switched off as before. It sits in a shop window (`components/athlete-listings/preview-window.tsx`):
    - a browser frame with a "Shop" heading and search;
    - the card first, lifted and pinned "Your listing";
    - blank, shimmering placeholder cards beside it, never made-up listings.
  - **Desktop / Phone:** a switch springs the window between widths. The grid inside follows the window's own width (a container query).
  - **The bar above it:** back to the listing, then "Sponsors can see this now" (green) or "Sponsors will see this once it's live" (amber). Each reason (`previewNotes`, unchanged) is a short chip, as is any part that couldn't be read.
  - **Unchanged:** the property's preview keeps `ListingShopPreview`, which lost its athlete-only `arena` branch. The reads are the same, and there are still no writes.
  - **Checked:**
    - The frontend suite is 2,239 tests; tsc and eslint are clean.
    - Walked live in Chrome at 1440 and 390, in both the Desktop and Phone frames, with no console errors and no sideways scroll:
      - the owner's now-live listing (viewed only);
      - a QA draft (amber, three reasons).

### 87. Releasing a held earning skips verification; a held earning can't be voided [audit 2026-11-16, item 53]
`POL-BE-87` · `POL-FE-87` · *Money* · confirmed (audit of 52–83, 2026-11-16)
- **Problem:**
  - A PENDING earning (its work not yet verified) offers Hold, and a held earning's only move was Release, straight to ELIGIBLE. Approve and Mark paid then paid for work nobody had verified. The API allowed HELD → ELIGIBLE (and DISPUTED → ELIGIBLE) whatever the work's state.
  - An earning held by a campaign cancellation (`campaign-change.ts`, "Finance settles what was done") could not be voided from the screen when nothing was owed. The API allowed HELD → PENDING → VOIDED, but the screen didn't offer it.
- **Fix:**
  - The API makes an earning payable by hand only once every deliverable on its order is VERIFIED, the same test as the automatic rule (`maybeMakeEligible`). Otherwise it refuses with the count and points to pending.
  - Finance gets "Back to pending" on a held earning and "Void" (with a confirm) on a pending one.
- **Done when:** a held or disputed earning with unverified work can't be released to eligible, and the refusal says why; with all work verified it can; Finance can take a held earning back to pending and void a pending one.
- **Delivered (2026-11-16, rcfworks):**
  - **Backend:** `EarningWorkNotVerifiedError` (409) in `transitionEarning` (`backend/src/domain/earning.ts`) for any move to ELIGIBLE, after the paused-deal check. No schema change, so it also covers earnings held before today. Tests: `backend/tests/earning.test.ts` (POL-BE-87).
  - **Frontend:** `earningMoves` offers "Back to pending" on HELD and "Void" (`needsConfirm`) on PENDING; `EarningRowActions` asks "Void it?" first; the Finance action accepts PENDING and VOIDED. Tests: `frontend/tests/earning-actions.test.ts` (POL-FE-87).

### 88. A licence clears a minor's piece without their guardian [audit 2026-11-16, item 59]
`POL-BE-88` · *Minors* · confirmed (audit of 52–83, 2026-11-16)
- **Problem:** BTG's "Record a right" form takes a BTG or third-party licence (a contract reference) on any edition piece. The guardian checks in `grantRightIn` ran only for consent grants, so a licence cleared a piece a minor made for print and the web with no guardian ever asked.
- **Fix:** a licence on a piece whose maker (student or athlete) is a minor is refused. A minor's piece is cleared by their verified guardian's consent only. An adult maker's piece may still carry a licence (a contract signed with them), and sponsor artwork, which has no maker, is unaffected.
- **Done when:** a BTG or third-party licence on a minor's piece is refused with the reason, over HTTP too; an adult maker's piece still takes one.
- **Note:** until the student media consent text exists (the owner's open decision), a minor's piece can't be cleared at all, so an edition carrying one can't go to production. BTG can take the piece out of the edition to move it on.
- **Delivered (2026-11-16, rcfworks):** `grantRightIn` (`backend/src/domain/content-rights.ts`) reads the maker's birth date and age band (`requiresGuardian`, as the consent path) and refuses with `RightsError` 409, "A minor's piece is cleared by their verified guardian's consent, not a licence." It is the one path every right takes, so the automatic grants are held to it too. Test: `backend/tests/next-rights.test.ts` (POL-BE-88), shown to fail without the fix.

### 89. Every real student code is refused, and some students' `/s/` page is a 404 [audit 2026-11-16, item 58]
`POL-FE-89` · *Dead end* · confirmed (audit of 52–83, 2026-11-16)
- **Problem:**
  - Student codes are made as `randomBytes(9).toString("base64url")`: 12 characters, mixed case, and they can hold `-` and `_`. The API matches a code exactly.
  - The request form upper-cased the code from `?code=`, from the browser's kept copy and as it was typed, and its pattern refused `_`. So every real code was refused ("That student code is not active") and no sale was ever credited. Its test passed only because it used the made-up `NX-RILEY-42`.
  - The `/s/<code>` page refused `_`, so about one student in six had a landing page that was a 404.
- **Fix:** send the code exactly as given (trimmed), accept `_` on the form and on `/s/<code>`, and stop a phone capitalising the first letter.
- **Done when:** any code the API can issue passes the form and `/s/<code>` unchanged, and the request carries it as issued.
- **Delivered (2026-11-16, rcfworks):** `studentCodeOf` (`lib/brief-request.ts`) no longer changes case and uses `STUDENT_CODE_PATTERN` (`[A-Za-z0-9_-]{3,64}`); the drawer (`components/brief-request-drawer.tsx`) keeps `?code=`, the kept copy and the typed value as they are, with `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}` and a placeholder of the real shape; `/s/[code]` accepts `_`. Test: `frontend/tests/student-code-brief.test.ts` runs 200 freshly made codes through both patterns, and was shown to fail without the fix.

---

## Checked and fine

- marketplace order tracking;
- the 24-hour delivery deadline;
- the fan page on mobile;
- a paused or ended reward;
- every link sent in emails;
- sample data, which only shows to visitors or in demo mode, clearly labelled.

### 90. The sponsor dashboard is ten stacked panels with no reading order [§9, screen 3]
`POL-FE-90` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /sponsor, for the dashboard it must be the dashboard itself like in the image provided, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign"; three references: a crypto wallet dashboard with price cards and a donut, an analytics admin template with KPI cards, a bar chart and a gauge, and a dark data dashboard with ring KPIs, charts and a table)
- **Problem:** `/sponsor` stacked ten panels of equal weight (five bare tiles, a chart, "Needs you", a funnel, cost per 1,000, posts delivered, athletes, cities, the table). Most explained themselves only behind a "?", a zero to-do still showed as a row, and nothing said which period the numbers covered.
- **Fix:** a dashboard grid on the same Stadium Board: every card has an icon, a title and a one-line subtitle saying what it shows; the period is said in words under the title.
- **Done when:**
  - Each card says what it shows without opening a "?".
  - The page says which period it shows, and what waits on the sponsor is one card with a count.
  - The Stadium Board look is unchanged: dark, orange as light, scan-lines, glowing numbers, the ticker.
  - Every figure is still the overview API's; it works at phone size.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Top:** the ticker; "Dashboard" with the Updated pill, the period switch and + New request; one line such as "Showing the last 30 days, compared with the 30 days before. You have 3 campaigns running out of 4."
  - **Four number cards:** people reached, likes/comments/shares, link clicks, fans who redeemed. Each has an icon, a subtitle, a change pill (▲ green / ▼ red) and a filled mini chart; reactions get an LED ring with the reaction rate. Money moved out of the tiles into its own card.
  - **"How your campaigns are doing":** the trend chart (`StadiumTrend dash`). Its switch is three clickable totals for the period, with dates along the bottom.
  - **"Your to-do":** only rows with something in them; requests with BTG as grey information; "You're all caught up" otherwise; four shortcuts (Packages, Requests, Orders, Billing) with the sidebar's words.
  - **Three cards:** posts delivered as an LED ring with delivered / late / still to come and the next due date; Money as a paid / still-to-pay donut with the total agreed and cost per 1,000 (or a plain note when the login can't read money); the fan journey as upright LED bars, redeemed lit.
  - **Then:** top athletes and cities with share bars; the campaign list (unchanged table, filters and pager) in a card.
  - **No campaign yet:** a three-step "Start your first campaign" card beside the to-do list.
  - **Kit:** `components/stadium-dash.tsx` (server components, hand-drawn SVG). `StadiumRow` gains `plainLead`.
  - **Checked:** frontend 2,239/2,239; tsc and eslint clean; `npm run build` in a detached worktree. Walked live as the QA sponsor at 1440 (30 days and All time) and 390.

### 91. The sponsor shop is a wall of filters, and an item can't be looked at before buying [§7.8, 2S4-FE-01]
`POL-FE-91` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /sponsor/shop, let's do the whole thing we did in athlete inventory and listing, the items can be viewed before clicking add to cart and we can have a button on the item itself for add to cart, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign"; then "the view page must be a new page which shows what the athlete would show, we need to be consistent", with a screenshot of `/athlete/listings/[id]`; then "change Your public profile to View Athlete Profile" and "can we see it inside the dashboard of the logged-in account, not a new tab")
- **Problem:** `/sponsor/shop` opened on three KPI tiles, then a row of eight filter controls of equal weight. Each card's "Add to cart" unfolded raw number and date inputs inside the card. There was no page for an item, so a sponsor could only judge it from a small card, and the athlete's showcase ("the way sponsors meet it") was never what a sponsor actually met.
- **Fix:** the athlete Inventory/Listings pattern, on the Stadium Board.
  - The shop is a window: one search, a type rail, one Filters popup, Cards or List.
  - Every item has its own page and its own "Add to cart" button.
  - The item page is the athlete's own showcase.
- **Done when:**
  - A sponsor can open any item and see everything about it before buying.
  - Each item carries "Add to cart"; what's already in the cart says so.
  - The item page shows the same sections as the athlete's item page.
  - The athlete's profile opens inside the sponsor portal.
  - The Stadium look is unchanged (dark, orange as light, LED panels, lit numbers).
  - Every figure is still the API's; it works at phone size.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Shop (`/sponsor/shop`):**
    - The title, "Your orders", and a Cart button carrying its count and total.
    - A three-step strip (Look around → Add to cart → Check out) and "Nothing is charged until you check out".
    - **Toolbar:** a search; a type rail (Everything + one chip per kind); one Filters popup for the other six filters, each with a plain label, applied instantly ("Show n items" closes it); the filters in use as chips you can remove; Cards ↔ List (remembered per browser).
    - **Cards and rows:** the kind, title, athlete, a two-line blurb, dates ("Ends in 5 days", "Starts Dec 1", "Last day today"), stock ("Sold out" in red), the price lit, then View and Add to cart.
    - **Add to cart:** a popup that asks two numbered questions (how many, with − / +; which dates, on the house calendar inside the item's window) and shows the live total. Then "It's in your cart" with Keep shopping / Go to cart, and the cart count updates.
    - An item already in the cart says "In your cart" and offers "Change in cart": the API holds one line per listing.
  - **Item page (`/sponsor/shop/[id]`):** the athlete's `ItemShowcase` itself.
    - The same sections as the athlete's item page: the stage with its price tag and "Offered by", title, pitch, price and stock, Available / Stock / Status, what a package holds, "A good fit for", and "Who you're working with" with reach and track record.
    - Lit orange through the showcase's own tokens (`item-stadium.css`).
    - The sponsor's own bar on top: Shop, "On sale now" or "In your cart", Pick it → Cart → Check out, Add to cart or Change in cart, and the cart.
    - "View Athlete Profile" in place of the athlete's "Your public profile".
  - **Athlete profile (`/sponsor/athletes/[slug]`):** the public athlete page (`AthletePublicPage`, new `sponsor` mode) inside the sponsor portal.
    - "Request a proposal" starts a new brief; "Is this you?" is gone.
    - "Back to the item" returns to the item it came from.
  - **API:** `GET /marketplace/search/:id`, one listing of the sponsor's catalogue.
    - Exactly the search's visibility: anything the shop wouldn't list is a 403.
    - Adds what a package holds, and the athlete's public slug once their page is up.
    - In the OpenAPI registry, and tested in `phase2-independent-listing.test.ts`.
  - **Kit:** `components/sponsor-shop/shop-window.tsx`, `lib/shop-window.ts`, `lib/shop-showcase.ts`, `app/(app)/sponsor/shop/shop.css`. `ItemShowcase` gains `profileLink` and `viewer`. `shop-stadium-card.tsx` and `shop-add-to-cart.tsx` are gone.
  - **Checked:** frontend 2,263/2,263; backend `phase2-independent-listing` and `openapi.coverage` 22/22; tsc and eslint clean; `npm run build` in a detached worktree. Walked live as a Sponsor Admin at 1440 and 390 (add to cart end to end, item page, in-portal profile) and as a Sponsor Viewer (no add buttons, one line saying who adds).

### 92. The sponsor cart reads as a form, not a cart [§7.9, 2S4-FE-01]
`POL-FE-92` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for/sponsor/cart, the reference is the images that I sent, add animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign". Four references: a furniture cart with "Your cart total is $X" and Check out above the lines; a cart table with − / + steppers and an order summary; a cart with a progress bar and a Products / Price / Quantity / Total table; a slide-in cart drawer kit with mobile views.)
- **Problem:** every line on `/sponsor/cart` was three raw inputs (a number box and two date boxes) with a "Save changes" button that was easy to forget. The total sat in a small side panel. "Reserve & check out" was explained only in small print, and nothing said where the sponsor was in buying.
- **Fix:** a plain shop cart on the same Stadium Board.
  - The total is big at the top with one Check out.
  - Three stops say what happens next.
  - Each line has a picture, a − / + stepper and its dates as one button, and changes save by themselves.
  - An order summary sits beside the lines.
- **Done when:**
  - The total and the next step can be read at a glance.
  - A change can't be lost by forgetting to save.
  - Removing asks first.
  - A held cart says it's held and for how long.
  - It works at phone size beside the portal dock.
  - The Stadium look is unchanged.
  - Every figure is still the cart's own quote.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Board:** "Your cart total" in lit figures that count up and roll, items and sellers, one Check out (the 15-minute hold), "Nothing is charged until you place the order".
  - **Three stops:** Review your cart (You're here) → Check out, held 15 minutes → Place the order, nothing charged until here.
  - **Items:** Item / How many / Total. Each row has an LED tile with the item's kind, a title linking to the item, the seller and price each, a date button under the title (the shared calendar, inside the item's window), a − / + stepper capped at what the item has, and the line total.
    - Saving says "Saving…" then "✓ Saved"; a refusal reverts the row with the API's reasons.
    - × asks "Keep it / Remove", then the row slides out.
    - An item the shop no longer lists says so, and Check out waits until it's removed.
  - **Order summary** (sticky): subtotal, BTG fee, total, Check out, and three lines on what checking out does.
  - **Held:** locked rows, a countdown ring, Continue to checkout.
  - **Phone:** a floating Total + Check out bar that follows the portal dock and steps aside at the summary.
  - **Empty:** an LED board with Browse the shop and the three stops.
  - **Sample:** `?demo=sample` is a clickable sample cart that saves nothing.
  - **Kit:** `components/sponsor-cart/cart-board.tsx`, `lib/cart-board.ts`, `app/(app)/sponsor/cart/cart.css`. `components/shop-cart-line.tsx` is gone. No API change; the cart actions are unchanged. New read: `GET /marketplace/search/:id` per line.
  - **Checked:** tsc and eslint clean; frontend 2,262/2,263 at the time (the one failure was POL-FE-91's, fixed in e6916a3d). Walked live as the QA sponsor at 1440 and 390.

### 93. Checkout shows every section at once, so a buyer can't tell what to do next [§7.9, 2S4-FE-02]
`POL-FE-93` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /sponsor/checkout?reservation, make it a step by step wizard with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign". Four references: a Checkout → Payment → Order Confirm stepper with an order summary beside the form; a payment page with a summary card; a before/after of a cluttered payment page made simple; a billing form with a Shopping cart → Checkout → Finish bar.)
- **Problem:** `/sponsor/checkout` opened with the hold, the lines, the summary, the billing contact, the terms and Place order all on one long page. It had a step strip, but every step was already open below it, so nothing said "do this now". Place order sat greyed out at the bottom with a sentence about what was missing.
- **Fix:** a four-step wizard on the cart's Stadium Board, one question at a time: **Items → Invoice → Terms → Confirm.**
  - The total and the hold's clock stay on the board above.
  - The order summary sits beside the step, the same height.
- **Done when:**
  - Each screen asks one thing.
  - Continue says what's missing instead of sitting disabled.
  - The sponsor can go back to any step.
  - The time left on the hold is always in sight.
  - The last step shows everything once more and what happens after placing.
  - The contract gate is unchanged: the same terms body and fingerprint, billing contact, acceptance and total shown.
  - It works at phone size.
  - The Stadium look is unchanged.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Board:** "Secure checkout" and the total in lit figures that count up. A hold ring drains with the minutes left, red and blinking in the last two. A four-stop rail with a lit wire: done stops show ✓ and can be clicked back to, later ones only once the steps before are done.
  - **Stage:** each step slides in from the side it came from and powers on. Its heading takes focus, and it scrolls into view.
    - 1 · the items as LED tiles: kind, seller, quantity × price, dates, line total. "Locked while held", with Release hold to change items.
    - 2 · Name, Email and PO / reference with icons and a green ✓ when valid. A chip says where the values came from (POL-FE-47). Enter continues.
    - 3 · the terms in a scroll box with a reading bar ("Read to the end ✓"), and one big tick card (`acceptLabel`).
    - 4 · recap tiles (Items / Invoice to / Terms, each with Change), "Total you'll pay", a three-step "What happens next" from the spending limit and card-payment state (POL-FE-04/72), then **Place order**.
  - **Continue is never a dead grey button.** Pressed too early, it says what's missing, focuses the first bad field, or shakes the tick card.
  - **Placing:** a curtain ("Placing your order…") until the order page opens. A refusal comes back in the API's words; a 409 `total_changed` re-reads the quote.
  - **Summary:** lines, subtotal, BTG fee, total, the spending limit, "nothing charged / no card details", and Release hold (asks first). Side by side, the stage and the summary are always the same height.
  - **Phone:** board, stage, then summary. Back and Continue sit on one row.
  - **Ended holds:** expired, released, unavailable, no reservation and "became an order" each get a status board. An expired hold gets Hold again for 15 minutes. A Sponsor Viewer sees the held items read-only.
  - **Sample:** `?demo=sample` is a clickable sample checkout; nothing is held, released or placed.
  - **Kit:** `components/sponsor-checkout/checkout-wizard.tsx`, `lib/checkout-wizard.ts`, `app/(app)/sponsor/checkout/{page.tsx,checkout.css}`. The old gate (`ShopCheckoutGate`, `CHECKOUT_STEPS`, `ShopReserveButton`) and `stadium-hold-countdown.tsx` are gone; `shop-checkout.tsx` keeps only Cancel order. `checkout/actions.ts` is unchanged, and so is the API. New read: `GET /marketplace/search/:id` per line, for the item's kind.
  - **Checked:** tsc and eslint clean; frontend 2,273/2,273. Walked live on `?demo=sample` as the dev Sponsor Admin at 1440 and 390: all four steps, the too-early hint, the rail back, equal panel heights, no sideways scroll, no page errors. `e2e/marketplace-path.spec.ts` and `e2e/qa-phase2.spec.ts` now click through the wizard; they weren't run here.

### 94. The order page after checkout is a stack of boxes, so a buyer can't tell what happened or what to do [§7.9, 2S4-FE-02, 2S5-FE-05]
`POL-FE-94` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /sponsor/orders/, make it a summary for the payment wizard with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign". Two references: a checkout with a summary card beside the payment form; a "Payment Successful" page with an order tracker, billing and payment-method cards, and an order summary. Mid-build: "the right panel must be the same height as the combine 4 panels on the left", and the pay card "is ugly", twice.)
- **Problem:** `/sponsor/orders/<id>`, where checkout lands (`?placed=1`), stacked a head, mini steps, three tiles, an "Order placed ✓" box, a placed note, a status card and a payment banner. Under those came a column of side cards (totals, billing and terms, payment, cancel). Nothing said, in one place, what had happened and what to do next.
- **Fix:** the checkout wizard's last screen, on the same Stadium Board. It reads top to bottom: what is happening, what to do, then the order.
- **Done when:**
  - One headline says where the order stands.
  - The only action on the page (Pay by card) is in one card, with the amount and the pay-by date.
  - "What happens next" is always shown while the order is open.
  - The order summary is beside the order and the same height.
  - Every existing state, refusal and role rule is unchanged.
  - It works at phone size.
  - The Stadium look is unchanged.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Board:** a mark for the state.
    - Once placed or paid, a tick draws itself inside a ring and throws sparks.
    - A card breathes while payment is due; a lit arc chases round while the payment is confirming; a cross means it ended.
    - Beside the mark: the kicker ("Order placed ✓", "Payment due" …), one plain headline and lead, the order reference, the placed date, and the total counting up.
    - Placed → Approved → Paid → Delivered on a lit wire, with dates. The stop it waits on beats ("Due now", "Seller deciding", "1 of 3"). A cancelled order shows where it stopped.
  - **Next step:** one kicker and the status tag, then either:
    - the payment ticket: one strip as wide as the card (Amount due | Pay by, with a "in 3 days" pill | the one **Pay $X by card** button), split by dashed lines, with the Stripe note on a row under it; or
    - the status in words (sponsorStatus, or the payment's own banner).
    - Along the bottom, "What happens next": three numbered steps left to right on a lit wire; on a phone, a list with each number beside its words.
  - **The order:** What you bought, as lit tiles with each item's kind; Delivery (SponsorOrderDelivery, unchanged); and Invoice to · Payment · Order terms as three tiles.
  - **Summary:** lines, subtotal, BTG fee, total, payment status, refunds and extra payments going back, Cancel order, All orders and Keep shopping. Side by side, it is always as tall as the column beside it, with its foot on the bottom edge.
  - **Sample:** `?demo=sample&as=placed|seller|btg|due|held|confirming|failed|paid|delivered|cancelled` draws a sample order; nothing is paid or cancelled.
  - **Kit:**
    - `components/sponsor-order/order-summary.tsx`, `lib/order-summary.ts`, `app/(app)/sponsor/orders/[id]/{page.tsx,order.css}`.
    - `components/sponsor-order-status.tsx` is gone. `OrderPayButton` takes a `className` and `sample`, and now ignores a double click (a ref).
    - Checkout's `Roll` is exported for the counting figures.
    - No API change. New read: `GET /marketplace/search/:id` per item, for its kind.
  - **Checked:**
    - tsc and eslint clean; frontend vitest 2,285/2,285.
    - Walked live on every sample state as the dev Sponsor Admin at 1440 and 390: one pay button, the summary and the left column the same height at 1440, no sideways scroll, no page errors.
    - Not built in a worktree; e2e not run.

### 95. The athlete's Sales page doesn't say what to do next on a sale [§7.9, 2S4-FE-03, 2S4-FE-05]
`POL-FE-95` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /athlete/sales/, which is the the list, just do what we did in the listing and inventory, add with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign")
- **Problem:** `/athlete/sales` had four KPI plates with captions, a warn plate of approvals, and then a table led by the order ref. Each status pill said whose turn it was ("Waiting for Harbor Coffee") but not what to do. Nothing showed how a sale moves from bought to paid.
- **Fix:** the page is drawn like Inventory and Listings (POL-FE-83/84), on the same Arena. Each sale says what to do next in one sentence.
- **Done when:**
  - A sale's next step is one sentence ("Deliver it by Oct 17"), flagged "Your move" when it's the athlete's turn.
  - How a sale moves (not paid → to deliver → waiting to confirm → done) is on the page, with the API's counts, and opens each group.
  - A sponsor waiting for a yes or no is above the sales, with the deadline.
  - Tabs, search and List ↔ Cards work like Inventory and Listings.
  - Every count is the API's. The property portal's Sales is unchanged.
  - It works at phone size, and the Arena look is unchanged.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Title row:** Sales, the updated pill, and a Payouts button.
  - **How a sale moves:** four stations on a rail whose dashes flow toward Done. The stations are Not paid yet, To deliver, Waiting to confirm and Done. Each shows its tab's count from `GET /sales` `tabs`, counting up as it arrives. The station with sales to deliver pings. A click opens that tab, and a second click clears it. Problems and Cancelled sit "off the road" as chips, only when there are any.
  - **A sponsor wants to book you · n:** the approvals (`GET /seller-approvals`, its own `apage`/`asize` pager) as cards with the ask, the "Answer by" deadline (red and blinking in the last 24 hours), and Answer. Amber while one waits.
  - **The sales:** the inventory's sliding tabs, in the order a sale moves. "Awaiting payment", "Delivered" and "Confirmed" read "Not paid yet", "Waiting to confirm" and "Done". The tabs come with search and List ↔ Cards (the same remembered choice as Inventory and Listings).
    - A row: what was sold and to whom; What's next (a "Your move" flag or the status, plus the sentence and the line under it); a Paid → Delivering → Delivered → Confirmed track whose fill grows in and whose current step pulses; and your share.
    - A card: the same, plus the call to action ("Mark delivered", "Answer", "Open"). A your-move card breathes a glow. A cancelled sale is greyed, its track and share struck through.
  - **No sales yet:** a hero with the four steps a sale takes and "Check your listings".
  - **Kit:**
    - `lib/athlete-sales-shop.ts` (the words), `components/athlete-sales/{sales-shop,sales-board}.tsx`, `app/(app)/athlete/sales/{page.tsx,sales.css}`, `tests/athlete-sales-shop.test.ts`.
    - Five glyphs were added to `athlete-inventory/glyphs.tsx`.
    - `SellerOrdersList` stays, for `/property/sales`. No API change.
  - **Checked:**
    - tsc and eslint clean; frontend vitest 2,320/2,320.
    - Walked live as the QA athlete at 1440 and 390 (List, Cards, `?demo=empty`): road and siding clicks filter, no sideways scroll, no page errors.
    - Not built in a worktree; e2e not run; not committed. The approvals plate was not walked, because the dev data has no approval.
  - **Then (owner, 2026-11-16, done by sponsorx-dev-fa):** "same in the /athlete/sales" — "How a sale moves" now opens in a popup from a **How a sale moves** help button beside Payouts (with a count of sales to deliver), like Payouts' road (POL-FE-97). A tapped step still opens its sales and closes the popup; **Got it** closes it. Hidden while nothing is sold yet. `SalesRoadHelp` in `sales-shop.tsx`; `SalesRoad` is now internal; `lib/athlete-sales-shop.ts` unchanged.

### 96. An opened sale shows everything at once, so an athlete can't tell where it is or what to do [§7.9, 2S4-FE-03, 2S4-FE-04, 2S4-FE-05, 2S4-FE-06]
`POL-FE-96` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /athlete/sales/, make it a step by step wizard with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign", then: "not the list part but the open page of the item")
- **Problem:** `/athlete/sales/<id>` stacked a status pill, a banner, a card with a four-dot track, a Mark delivered button that opened a pop-up, and a sponsor side card. The step the sale was at, whose move it was, and what came next were spread across all of them.
- **Fix:** the opened sale is a step-by-step wizard in the confirmations wizard's style (POL-FE-79), on the same Arena.
- **Done when:**
  - One line at the top says whose move it is, in words.
  - The sale reads as four steps (the sponsor pays → you deliver it → the sponsor checks it → you get paid), and the page opens on the step the sale is at.
  - Mark delivered is done on the page, step by step, not in a pop-up.
  - The writes, refusals and role rules are unchanged, and the property portal's sale page is unchanged.
  - It works at phone size, and the Arena look is unchanged.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Ticket:** the order ref and date, the item, the sponsor, quantity and dates. Beside them, a stub cut off by a perforation, with your share counting up and a four-segment lane that lights up to the current step.
    - Under it, one callout says whose move it is: "Your move" (it pings), "Waiting on <sponsor>", "BTG is deciding", "All done" or "Cancelled".
    - An ended sale shows "Would have been your share", struck through.
  - **Rail:** the four steps, each with a date or what it waits on ("Paid Nov 14", "On Nov 18 and Nov 25", "24 hours to check"). Any step can be opened, and the current one keeps its ring.
    - After a sale ends, the steps it never reached are struck through and read "Won't happen".
    - On a phone, the rail becomes dots across the top.
  - **Panels:** one at a time. Each slides in, its pieces rise one after another, and a giant outlined step numeral sits behind the heading. The footer says "Step n of 4" and what to do here, with Previous and Next.
    1. **Pays:** the facts (what, when, how many, your share), the paid date, and the sponsor's contact (only once paid).
    2. **Deliver:** three numbered blocks: *What did you do?* (required) → *Add proof* (a drop zone for a photo or PDF, or a link) → *Send it* (what happens next, then **Mark delivered**).
       - Each block's number turns into a green tick when it's filled. Pressed with no note, the button shakes the note box and says why.
       - The sponsor's request to cancel, a redelivery, and "Can't deliver this line?" are here too.
    3. **Check:** the sponsor's 24 hours as a ring that drains, with the time left in the middle, plus your delivery note. If a problem is reported, the existing problem answer sits here.
    4. **Get paid:** a medal with confetti, then your share shimmering once, and **Go to Payouts**.
  - **Moving on:** after Mark delivered, the stage plays "Delivered!" with confetti, then slides to step 3. It does the same for any refresh that moves the sale forward.
  - **Sample:** `?demo=sample&as=unpaid|deliver|redeliver|cancel-ask|checking|problem|answered|confirmed|refunded|cancelled`. Its Mark delivered moves the sample on without writing anything.
  - **Kit:**
    - `lib/sale-journey.ts` (the steps, whose move, the clock, the sample), `components/sale-wizard/{sale-wizard,sale-page,deliver-steps,check-clock}.tsx`, `app/(app)/athlete/sales/[id]/{page.tsx,sale.css}` (it imports `confirmations.css`), and `tests/sale-journey.test.ts`.
    - `SellerOrderDetail` stays, for `/property/sales/<id>`. No API change.
    - In `e2e/marketplace-path.spec.ts`, the athlete now fills the on-page form named "Mark delivered" (`#mk-note` kept) instead of a dialog.
  - **Checked:**
    - tsc and eslint clean; frontend vitest 2,320/2,320.
    - Walked live as the QA athlete at 1440 and 390: all ten sample states, plus the two real sales in the dev data (cancelled, in delivery) and an unknown id. Also the whole Mark delivered flow: the empty-press nudge, the "Delivered!" burst, the slide to step 3 with focus on its heading, and rail navigation. No sideways scroll, no page errors.
    - Not built in a worktree; e2e not run; not committed.

### 97. The athlete's Payouts page is a ledger, so an athlete can't tell how much they can cash out or why not [§7.9, 2S5-FE-03, 2S5-FE-09]
`POL-FE-97` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /athlete/money, which is the the list, just do what we did in the listing and inventory, add with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign")
- **Problem:** `/athlete/money` opened with four KPI plates (Available, Held in reserve, On its way, Paid out), then the account panel, a checklist, an order table led by order refs (Your share / Available / Held / Order status) and a history table. Nothing said in one sentence how much could be cashed out now, why not, or how money moves from a sale to the bank.
- **Fix:** drawn like Inventory, Listings and Sales (POL-FE-83/84/95), on the same Arena. It reads top to bottom: how much you can cash out, what's left, how money moves, each sale, each payout.
- **Done when:**
  - One figure and one sentence say how much can be cashed out now, or why nothing can.
  - The Request button sits under that figure, and its popup lists what it covers and what happens next.
  - The payout account sits beside it, at the same height.
  - The way money moves from a sale to the bank is drawn, with the API's total at each stop.
  - Each sale says where its money is, as a sentence, with one way to act on it.
  - Every figure is the API's. The writes, refusals, minor/guardian rule, frozen and owed-back wording are unchanged.
  - It works at phone size, and the Arena look is unchanged.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Cash-out board:** "Ready to cash out" and the figure counting up to the cent, under a slow aura that turns green and breathes when it can be cashed out. One headline ("$542.58 is yours to cash out", "$72.40 is on its way in", "You're all paid up"), one line on what it means, and **Request payout · $X**.
    - Off, the button says why under it ("Waiting on: …") with **See what's left**.
    - The popup ("Cash out $X?") lists the orders it covers with a "You get" total, the reserve line, and Approved → Sent → In your bank. **Request $X** ignores a double click (a ref). On success the board says "Requested ✓".
  - **Payout account** beside it (`#payout-account` kept for the fix links): the bank mark with a tick when active, the status chip, the same `accountPanel` words and `StripeLinkButton`, and "Bank and tax details stay with Stripe". A minor's own login sees the guardian line, never the button.
  - **What's left:** a ring that fills to what's done ("2/4") and each check as a tick or a waiting mark, with the Stripe button on the account step. When money can already be cashed out, it reads "Some of your money is held back".
  - **How your money moves**, in a popup behind a **How money moves** help button beside Sales in the title row (owner, mid-build: "make this inside a popup panel which trigger by a help button"). It closes with **Got it**, and focus goes back to the button. It isn't shown while there's no money yet:
    - Sponsor pays → Unlocking → Ready → On its way → Paid. Each stop shows the API's total (`awaitingPaymentCents`, `notYetReleasableCents`, `requestableCents`, `inFlightCents`, `paidOutCents`), counting up. The dashes flow toward Paid, and Ready pings when it has money. The road runs down the page on a phone and across it wider.
    - Off the road, only when there is any: In reserve, Frozen (BTG's sentence) and Owed back.
  - **Your share of each sale** (List ↔ Cards, the remembered choice): the item, sponsor, order and its state, then where its money is as a sentence ("$250.00 unlocks Nov 20, 2026", "… unlocks once you deliver", "Frozen for now", "You owe $20.00 back from a refund").
    - The API's non-zero figures sit under it as labelled amounts (Ready, Unlocking, Awaiting payment, On its way, In reserve).
    - Each sale has one link where there's something to do: **Cash out**, **Deliver it** / **See your sales** (to the Sales tab), or **Follow it**.
  - **Your payouts:** tabs from the API's counts (All, then each state that has one; "In review" for Requested), then each payout on a timeline: the amount, the date, the orders, the status in the payee's words (`payoutStatus`), "Approved automatically" once paid, and Requested → Approved → Sent → Paid with dates. The step it's on pulses. A payout waiting on the account carries **Fix your payout account →**.
  - **One switch for the two lists** (owner, mid-build: "make this a tab version between the history and the cashout list"): **Money by sale | Payout history**, two big segments with counts and a lit plate that springs across. A green dot pings on Money by sale when money is ready. The panel slides in from its tab's side.
    - `?list=payouts` keeps the choice (written with `history.replaceState`, no round trip). The history's state tabs, its pager and `#your-payouts` all open it, and a sale's **Follow it** flips to it.
  - **No money yet:** a hero with the four steps money takes, then the account card.
  - **Sample:** `?demo=sample[&as=setup]` is a clickable sample. The popup plays and the Stripe button says it opened nothing; nothing is requested. `?demo=loading|empty|error` show the branded states.
  - **Kit:** `lib/athlete-money-shop.ts`, `components/athlete-money/{money-board,money-lists,money-hero,money-glyphs}.tsx`, `app/(app)/athlete/money/{page.tsx,money.css}` (on top of `../inventory/inventory.css`), `tests/athlete-money-shop.test.ts`.
    - `actions.ts` gains `moneySampleLinkAction` (the sample's Stripe button).
    - `ShopTabs` takes an optional `keys`, so the payout tabs reset only `?hpage`.
    - `ApiPayoutOrder` gains the optional `confirmedLines` / `problemLines` the API already sends.
    - `PayoutRequest` / `PayoutAccountPanel` stay for the property portal. No API change.
    - `e2e/payee-money.spec.ts` looks for "Your share of each sale" (or the hero) instead of "By order". `marketplace-path` still finds "Request payout…" and "Request $X" in a dialog.
  - **Checked:**
    - tsc and eslint clean; frontend vitest 2,337/2,337.
    - Walked live as the QA athlete at 1440 and 390, on `?demo=sample`, `?demo=sample&as=setup`, the real dev data and `?demo=empty`. Also the popup through to "Requested", Cards view, and the Paid tab. The board and account card are the same height at 1440, no sideways scroll, no page errors.
    - Not built in a worktree; e2e not run; not committed.

### 98. The sponsor's Orders list is a table of order numbers, so a sponsor can't tell where an order is or what to do [§7.10, §8.2, 2S4-FE-02]
`POL-FE-98` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /sponsor/orders, which is the the list, just do what we did in the listing and inventory inside the athlete dashboard, add with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign")
- **Problem:** `/sponsor/orders` opened on four KPI tiles, then a table led by the order number ("SX-7F3A9C21"), with the items in small grey text under it, a status chip, a date and a total. Nothing said what happens next, whose move it is, or how far along an order is, so an order waiting on the sponsor's payment looked like every other row.
- **Fix:** the athlete Inventory/Listings/Sales pattern, on the Stadium Board.
- **Done when:**
  - Each order leads with what was bought and from whom, not its number.
  - Each order says what happens next as a sentence, and flags it when it's the sponsor's move (pay).
  - Each order shows how far it has come: Placed → Approved → Paid → Delivered, the same four stops as its own page (POL-FE-94).
  - The Stadium look is unchanged (dark, blue as light, LED panels, lit numbers); it moves; it works at phone size.
  - Every figure is still the API's.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Head:** "Your orders", one line on what the page is, a **How orders work** help button and a Shop button.
  - **The scoreboard, "How an order moves", in the help popup** (owner, after the first look: "can you make this inside a popup panel which trigger by a help button?"), so the page opens on the orders. The popup rises from the bottom on a phone and powers on centred on a wider screen. Escape and the scrim close it, and focus returns to the button. Picking a step filters the list and closes it. Inside are four lit stations (Waiting → To pay → In progress → Delivered) on a wire a comet of light runs along, each with the summary's count ticking up, and "Spent so far". A station opens its tab. Cancelled sits "off the road" when there is one. While card payment is closed, To pay reads "Approved" (POL-FE-72).
  - **"Your move":** a strip with a light chasing round its border, only while orders wait to be paid, with "Show them".
  - **The orders:** tabs with the API's counts (To pay glows while due; Cancelled only when it holds one), search, Cards ↔ List (remembered per browser), the pager above and below.
    - Each card: a stage icon and pill (or the shining "Your move" flag), the first item and "+n more", the seller with initials, the dates, a "what's next" panel ("Pay $1,240.00 by Nov 18", "Coastal FC is deciding", "BTG is checking your order", "The seller declined this order") with a deadline chip ("Pay in 2 days", red under 24 hours), the four stops, the total lit (struck through once it ended), the order number and date, and a call to action ("Pay now", "Track it", "View order").
    - The card to pay has a light running round its border; every card powers on in turn and lights under the pointer.
  - **No orders yet:** a hero ("Your first order starts in the shop") with three steps and Browse the shop.
  - **Kit:** `lib/orders-board.ts`, `components/sponsor-orders/orders-board.tsx`, `app/(app)/sponsor/orders/{page.tsx,orders.css}`, `tests/orders-board.test.ts`. `tests/app-review-wave5.test.ts` now finds POL-FE-72's "Approved" rule in `lib/orders-board.ts`. No API change.
  - **Checked:** tsc and eslint clean; frontend vitest 2,352/2,352. Walked live as a Sponsor Admin at 1440 and 390 (cards and list; the help popup opened, closed with Escape with focus back on the button, and a step picked inside filtered the list and closed it): no sideways scroll, no page errors. Every other state (to pay, waiting for the seller, held for BTG, delivered, cancelled) checked on a static render of the real components and CSS at both widths, since the walk account had only an order in progress. Not built in a worktree; e2e not run; not committed.

### 99. The "?" on every dashboard only opens a contact form, so nobody can look up how to do something [§10, §23, POL-FE-43]
`POL-FE-99` · *Confusing* · confirmed (programme owner, 2026-11-16: "this button on all of the user dashboards, let's create a Help and FAQ that they can search and navigate — it must contain all of our flow that needed by the users and it must have a screenshots on every question … the flow when buying or ordering, cashing out, paying, etc" and "the visual design must have a wow factor + awwwaaaard + animations")
- **Problem:** the header "?" (POL-FE-43) went straight to the help desk form. A sponsor who couldn't find how to pay, or an athlete who didn't know why a payout was held, could only write to BTG and wait.
- **Fix:** a Help & FAQ center inside every portal, opened by the "?", with each answer as numbered steps and a real screenshot of each step with the thing to click ringed.
- **Done when:**
  - Every portal has its own help at `/<portal>/help` (sponsor, athlete with guardian and under-18 answers, property, NEXT student, NEXT advisor, Finance, Admin), inside its own shell and stage; nobody sees another role's answers.
  - It searches as you type and browses by topic; each question has its own page.
  - Every step has a screenshot of the live app with the thing to click marked, refreshable by one command after a redesign.
  - The help desk form is one click on from every help page, with the way back.
  - It moves (owner: "wow factor + awwwaaaard + animations"), honours reduced motion, and works at phone size.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Content:** 122 questions, 466 steps, written from the code with the on-screen labels in quotes: sponsor 24, athlete 27, property 20, NEXT student 12, NEXT advisor 7, Finance 12, Admin 20. Typed data in `lib/help/<portal>.ts`; search in `lib/help/search.ts` (every word must match the start of a word; the question outranks keywords, the short answer and the steps).
  - **Home (`/<portal>/help`):** the portal's colour on its own stage; an aurora and a running grid floor; "How can we help?" rising in letter by letter; a search bar whose border turns, with the portal's own questions typing themselves out as the placeholder, Ctrl+K or "/" from anywhere, ↑ ↓ Enter, matches highlighted, `?q=` kept; popular searches; topic cards that tilt toward the pointer with a light following it and draw their icons in; the top questions or the chosen topic's (`?topic=`); "Still stuck? Message BTG".
  - **A question (`/<portal>/help/<slug>`):** the short answer first, then a guided tour: a sticky step rail whose line fills as you scroll; each step's screenshot in a browser frame that eases toward the thing to click while the rest dims, with a pulsing ring; click to see it full size (it grows out of its frame; Esc closes); on-screen labels as chips; "Good to know", related questions, the way to a person.
  - **Screenshots:** `npm run help:shots [-- portal…]` (`frontend/scripts/help-shots/capture.mjs`) signs in as each QA account, walks every step (opening dialogs or tabs first where a step says so), and writes `public/help/<portal>/*.webp` plus the ring's box to `lib/help/shots/<portal>.json`. The ring is drawn by the page, so a re-capture moves it with the UI; steps on the same screen share one picture. A step with no record on the QA accounts shows a framed "screenshot on its way" until one exists.
  - **The "?":** `portal-shell.tsx` now links `${rootHref}/help` ("Help and FAQ"). `tests/helpdesk-live.test.ts` follows; `tests/help-center.test.ts` is new. A `cart` glyph joins `components/icons.ts`. No API change.
  - **Found on the way (not fixed here):** sponsor Billing "Pay →" only opens an email to BTG; "Request a proposal" on an in-portal athlete profile sends a signed-in sponsor to the public `/brief` form; the student credit line said "when a sponsor pays" (it is when the slot is sold — the help says so); an Invitations empty state says sponsors see the rate card, the profile says they never do; the dev Clerk instance was pruned to 13 users, so no guardian or team-manager identity is left to photograph.
  - **Checked:** 435 of 466 steps have a real screenshot (345 ringed); the rest show a framed "screenshot on its way" until a QA account has the record (no guardian or team-manager login; the QA school, student and advisor hold no listings, orders, assignments or claims). Every picture OCR-swept for rude seed text (one tester note swapped in the picture only; capture.mjs now neutralises such text before every shot). Walked live as sponsor at 1440, 375 and 320 (search with Ctrl+K and arrows, topic cards, a tour, the lightbox): no console errors, no sideways scroll. Frontend vitest 2,372/2,372; eslint clean; `npm run build` in a detached worktree.

### 100. The Contact page is a plain form with every case listed at once, so a person can't tell where to start or find their problem [§16, 2S1-FE-10, POL-FE-43]
`POL-FE-100` · *Confusing* · confirmed (programme owner, 2026-11-16: "big visual redesign for /contact … add with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign", then, mid-build: "picking the problem is too freakin long, too much information in one page" and "can you make this dropdown")
- **Problem:** /contact was a narrow themed column: eight topic chips, then every case for the topic as one long tick list (52 for a signed-in athlete's Account), then the form, with Send greyed out and the reason only in a tooltip. It looked unlike the other public pages and gave no sense of order.
- **Fix:** the public pages' stage (as /about, /packages), with the form as three numbered steps and one group of cases at a time.
- **Done when:**
  - The page stands on the fixed-dark stage: a hero, three ways to reach BTG, and one glass panel with the form.
  - The form reads as numbered steps (topic, what's wrong, your details) and says what is still missing before Send.
  - Picking the problem shows one group of cases at a time, chosen from a dropdown, with "Something else" always there.
  - Every selector the help desk tests and `e2e/qa-phase2.spec.ts` use still works; `?topic=`, `?back=` and `?demo=sent` behave as before.
  - It moves, honours reduced motion, and has no sideways scroll at 390.
- **Delivered (2026-11-16, HeckerCreatives):**
  - **Hero:** "Talk to a real person.", **Write to us** (jumps to the form, whose outline glows twice on arrival) and **Copy our email**; the animated envelope (the letter rises, the plane orbits, the bubble types) with the mailbox's real state from `GET /public/support` ("Inbox open" / "Inbox being set up"). `?back=` is a "Back to your portal" pill above the eyebrow.
  - **Three cards:** write here, email us (the address with Copy, and the "Being set up" badge while the mailbox isn't live), guardians and minors (`/contact?topic=guardianship#write`; the form is keyed by topic, so it starts there).
  - **The form:** topic tiles with an icon and what each covers; the cases behind a "Narrow it down" dropdown (button + listbox: arrows, Home/End, Enter, Esc, click outside; each group's case count and ticks, and "N ticked in other groups"); "Not listed? Something else" pinned under it; name, email, message with a counter, files by click or drop; "Before you send" ticks; Send's plane flies while sending; a ref stops a double click sending twice.
  - **Sent:** the ring and tick draw, sparks burst, what was sent, "Write another message". `?demo=sent` uses the same panel.
  - **Files:** `app/(public)/contact/{page.tsx,contact.css}`, `components/contact-form.tsx`, new `components/contact-stage.tsx` and `components/contact-fx.tsx`. No API change; `lib/helpdesk-live.ts` untouched.

### 101. A NEXT student has no page showing their own details [NEXT spec §8, P9-FE-01]
`POL-BE-101` · `POL-FE-101` · *Dead end* · confirmed (found in live staging practice, 2026-11-17)
- **Problem:**
  - A signed-in NEXT student's portal (`/next`) has Home, Assignments, My sales, My code and Points, and no page showing their own details: their legal name, school, class year, roles, where their account stands, or whether their guardian is confirmed. A wrong detail could only be noticed by chance, and nothing said who corrects it.
  - The NEXT spec never defined a profile page, and the API had no self-service student endpoint: only `/students/{id}` (and `/code`, `/sales`, `/points`), read by id.
- **Fix:**
  - **Backend (`POL-BE-101`):** `GET /students/me` answers the caller's own record; `PATCH /students/me` changes the display name, the one field a student edits. The record is the login's own (`User.studentId`), inside its tenant, never an id from the request; only a STUDENT login reaches either.
  - **Frontend (`POL-FE-101`):** a **Profile** page at `/next/profile`, in the student portal's menu, with the display name editable and every other field read-only, each saying to ask the faculty advisor, and the advisor's email when the school has one.
- **Done when:**
  - A signed-in student sees their legal name, display name, graduation year, school, roles, account state, sales code and, if under 18, whether a parent or guardian is linked and confirmed (status only: never the guardian's name or contact).
  - They can change their display name: trimmed, 2–60 characters, at least one letter or number, no hidden characters; it takes effect at once and is audited (`student.displayNameUpdate`, before and after). The same name again writes nothing.
  - Nothing else can be changed: not the legal name, school, roles, graduation year, date of birth or guardian. The API refuses any other key in the body (400).
  - Another student's record, another tenant's and every non-student role (advisor, guardian, BTG, sponsor) are refused (403). A student who has left (INACTIVE) or was not accepted (REJECTED) can read but not change (409).
  - Each read-only row says "Wrong? Ask your faculty advisor to correct it", and the page lists the school's active advisor emails as mailto links. No messaging is built.
  - No date of birth, no email and no guardian detail reaches the response; no tax ID or bank detail exists to show. A minor's data is no more visible to anyone else than before.
  - Build and tests pass.
- **Delivered (2026-11-17, infinex1):**
  - **Backend:** `backend/src/domain/student-profile.ts` (`getOwnStudentProfile`, `updateOwnDisplayName`, `StudentProfileLockedError`); `StudentDisplayNameInput` (strict) and `StudentProfile` in `backend/src/contracts/student.ts`; both routes in `backend/src/routes/v1/students.ts`, registered before `/students/:id`; both rows in `backend/src/contracts/registry.ts`, so OpenAPI stays complete. Tests: `backend/tests/pol-be-101-student-profile.test.ts` (the contract, and the HTTP path over a real database: own read, edit and audit, another student's record, cross-tenant, non-student roles, validation, the locked states) and `backend/tests/pol-be-101-student-profile.unit.test.ts` (the same rules with Prisma stubbed, so they run without a database).
  - **Frontend:** `frontend/src/app/(app)/next/profile/page.tsx`; `DisplayNameForm` in `frontend/src/components/student-display-name.tsx`; `updateDisplayNameAction` in `frontend/src/app/(app)/next/actions.ts`; `liveStudentProfile` in `frontend/src/app/(app)/next/live.ts`; `ApiStudentProfile`, `displayNameProblem` and `guardianStatusWords` in `frontend/src/lib/students-live.ts`; the menu entry in `frontend/src/app/(app)/next/layout.tsx` (not the phone tab bar, whose five tabs are full; phones reach it from the menu); the route map. Test: `frontend/tests/student-profile.test.ts`. BTG previewing the portal sees the fixture student with the edit switched off.
  - **The advisor contact:** the data model links an advisor to a school only through their login (`User`, role ADVISOR, `propertyId` = the school), which keeps an email and no name. So the page shows the active advisors' emails (up to five, disabled logins left out), not names. Showing a name needs a name on the advisor's account first.
  - **Not done:** the display name is not run past BTG's restricted-words list. The application's display name isn't either, and the list's rule is to route a match to review, never to refuse it, which needs a review step this item doesn't build.

### 102. A sponsor can't see or keep their company and their own details current [§8, §26]
`POL-BE-102` · `POL-FE-102` · *Dead end* · confirmed (found in live staging practice, 2026-11-17) · backend Done 2026-11-18 · frontend in Code review 2026-11-19
- **Problem:**
  - The sponsor portal's Account group has only Billing (`/sponsor/invoices`) and Team (`/sponsor/team`). There is no page for the company's details (company name, logo, website, industry and brand categories, address, billing contact) or for the signed-in person's own (name, job title, the email Clerk holds).
  - The API's `GET` / `PUT /me/notification-preferences` exists, but no sponsor page shows it: only the athlete's and the property's settings pages (`AccountSettings` in `frontend/src/components/account-settings.tsx`) use it. A sponsor can't mute or unmute anything.
- **Why it matters:** a sponsor whose address, billing contact or logo changed has to write to BTG, and BTG's records (and Zoho's) drift from the truth. The brand categories feed the conflict checks, so they can't simply be self-edited.
- **Done when:**
  - A sponsor admin sees the company's details and their own on one Account page reached from the Account group; a sponsor analyst sees them read-only.
  - Cosmetic and contact fields (logo, website, address, billing contact; the person's name and job title) save at once and are audit-logged.
  - Edits to the company name and the industry or brand categories go to BTG review before they take effect, because they change conflict checks and the Zoho account; the sponsor sees "waiting for BTG" until decided.
  - Email, password and MFA stay in Clerk: the page links to Clerk's account screen rather than storing them.
  - The page shows the sponsor's notification preferences (the existing `/me/notification-preferences`).
  - Tenant-scoped and own-organisation only, with role tests: another sponsor's organisation, a sponsor analyst's write and every non-sponsor role are refused (§30).
- **Delivered, backend (`POL-BE-102`, 2026-11-18, rcfworks):**
  - **Storage** (migration `20261118210000_sponsor_account`):
    - `Sponsor` gains `logoKey`, `website`, `address`, `billingContactName`, `billingContactEmail` and `billingContactPhone`.
    - `User` gains `fullName` and `jobTitle`.
    - New `SponsorAccountChange` holds a name or category change waiting for BTG. A partial unique index keeps it to one waiting change per sponsor.
  - **The page** (`backend/src/domain/sponsor-account.ts`), in one read, `GET /sponsor/account`:
    - the company's details;
    - the person's own name, job title and email (the email is Clerk's: `signIn: "CLERK"`);
    - `canEdit`;
    - the change waiting for BTG, and BTG's last answer with its reason;
    - the notification settings (changed through the existing `PUT /me/notification-preferences`).
  - **Saved at once, audited:**
    - `PATCH /sponsor/account/company` saves the logo, website (http or https only), address and billing contact (`sponsorAccount.company`, before and after).
    - `PATCH /sponsor/account/me` saves the name and job title (`sponsorAccount.me`).
    - The logo is uploaded straight to the public bucket under `sponsors/<tenant>/<sponsor>/` (`POST /sponsor/account/logo`, PNG or JPEG up to 1 MB); a key outside that prefix is refused.
  - **Waits for BTG:**
    - `POST /sponsor/account/change` sends a new name and/or categories. It is refused (409) while another change is waiting, and refused (422) when it matches what's on file.
    - BTG's desk is `GET /sponsor-account-changes` (BTG staff read; BTG_ADMIN and SALES decide).
    - Approving (`…/{id}/approve`) makes the change take effect. A new name is sent to the Zoho account once, through the worker (`zoho.pushSponsor` with `rename`), the one exception to Zoho owning `Account_Name`, recorded in the field mapping §7.1.
    - Rejecting (`…/{id}/reject`) needs a reason, which the sponsor reads on the page.
    - Two answers at once settle once (409 for the second).
  - **Industry:** the brand categories are the industry. There is no separate industry field, because the conflict checks read the categories.
  - **Who:** only the caller's own sponsor.
    - A SPONSOR_ANALYST reads the page, and every change is refused (403).
    - Every non-sponsor role is refused the page (403).
    - Sponsor admins can't reach BTG's desk.
  - **Tests:**
    - `backend/tests/pol-be-102-sponsor-account.test.ts` (8, real API and database).
    - A rename test in `backend/tests/zoho-sync.test.ts`.
    - The tenant-isolation sweep covers every new route.
  - **Automated since POL-BE-104 (owner, 2026-11-18: "as always we target automation"):** a name or category change takes effect at once when every safety check passes. It waits for BTG, with the reasons, if any of these is true:
    - another sponsor has the name;
    - the name contains a restricted word;
    - a sensitive category is added (always a person);
    - an exclusive deal is still running in a category being dropped.
- **Delivered, frontend (`POL-FE-102`, 2026-11-19, HeckerCreatives):**
  - **Where:** `/sponsor/account`, "Account details", first in the sponsor's Account group. A Sponsor Viewer sees the link and the page too.
  - **The page**, top to bottom:
    - the company as BTG knows it: logo (or two letters), name, brand categories, and one button, "Change name or categories";
    - one notice under it when there is something to say: a change waiting for BTG with why it waits, BTG's "no" with its reason, or (for two weeks) a change that took effect;
    - four cards of equal height, each with its own Edit in a pop-up: Company details (logo, website, address), Billing contact, Your details (name, job title, role), Sign-in;
    - Notifications.
  - **Saved at once:** website, address, billing contact, the logo (PNG or JPEG up to 1 MB, sent straight to storage), the person's name and job title. A website typed without `https://` gets it.
  - **Name and categories:** the pop-up says most changes take effect at once and when BTG checks first. Asking for exactly what is on file is caught before the API is asked. While a change waits, the button is hidden.
  - **Sign-in:** the page shows Clerk's email and whether it is confirmed, and "Manage sign-in" opens Clerk's own account screen. Nothing of it is stored or sent anywhere.
  - **A Sponsor Viewer** sees the whole page with no Edit button and a line saying it is read-only. The API refuses a viewer's write (403) as well.
  - **Notifications: nothing to turn off, said plainly.** `GET /me/notification-preferences` lists every kind anyone can mute, and all seven are an athlete's or a student's (invitations, posts due, a prospect's "no"). A sponsor is sent none of them, so the page does not list switches for emails that never arrive. `SPONSOR_EMAIL_EVENTS` in `frontend/src/lib/sponsor-account-live.ts` is the list to add to when the API starts sending sponsors an optional kind.
  - **Files:** `frontend/src/lib/sponsor-account-live.ts`, `frontend/src/app/(app)/sponsor/account/` (page, loader, actions), `frontend/src/components/sponsor-account.tsx`, `frontend/tests/sponsor-account-live.test.ts` (20 tests; every input a form lets through is parsed by the backend's own contract).
  - **Walked** on the local servers as a Sponsor Admin, a Sponsor Viewer and BTG (who rejected a change through the API): every field saved and shown, a logo uploaded and displayed, an ordinary category in effect at once, a sensitive one held with its reason, BTG's rejection and reason shown, Clerk's screen opening, the viewer's page with no Edit and a 403 on its write, and the page on a phone with no sideways scroll. The QA sponsor was put back as it was.
  - **Not built:** BTG's desk for these changes (`GET /sponsor-account-changes`; no task covers its screen), and a help-center article.

### 103. A school advisor has no page for their own or their school's details [NEXT spec §8, P9-BE-20]
`POL-BE-103` · `POL-FE-103` · *Dead end* · confirmed (found in live staging practice, 2026-11-17) · backend Done 2026-11-18 (`POL-FE-103` open)
- **Problem:**
  - `/advisor` has Applications (its home), Content review and Help. No page shows the advisor's own details (name, email, which school) or the school's (name, the email domain on file, the roster).
  - The home already carries the school's email-domain setting (`SchoolEmailDomain`) and the roster paste (`RosterPaste`) among the applications, so the settings exist but aren't presented as the school's profile, and nothing shows who the advisor is.
- **Why it matters:** the email domain decides which adult students are approved automatically from the roster, so a wrong one silently changes who gets in. And #101 sends students to their advisor by email, but the data model keeps no advisor name, so students see an address only.
- **Done when:**
  - An advisor opens a Profile page from the menu: their own name, email (from Clerk), title and phone, and their school's name, email domain and roster count, with the roster's last update.
  - The advisor can set their own name, title and phone (audit-logged); the name then shows to their students on #101's page in place of the bare email.
  - The email domain and roster stay editable as today, from this page too, with the existing public-provider refusal; changes are audit-logged.
  - The school's name and kind are BTG's to change; the page says so.
  - One school only (`own-property`), tenant-scoped, with role tests: another school's advisor, a student and a guardian are refused (§30).

- **Delivered, backend (`POL-BE-103`, 2026-11-18, rcfworks):**
  - **The page** (`backend/src/domain/advisor-profile.ts`), `GET /advisor/profile`:
    - the advisor's own name, job title, phone and email (the email is Clerk's: `signIn: "CLERK"`);
    - the school's name and kind, marked `managedBy: "BTG"`;
    - the school's email domain;
    - the roster's count and the time of its newest entry (`roster.lastUpdatedAt`).
  - **Saved at once, audited:** `PATCH /advisor/profile` saves the name, job title and phone. Null clears one, and the same values again write nothing (`advisor.profileUpdate`, before and after). Any other key is refused (400).
  - **Storage:** `User.phone` is new (migration `20261118220000_advisor_phone`). `User.fullName` and `jobTitle` came with POL-BE-102.
  - **Students see the name:** `GET /students/me` now lists each advisor as `{ email, name }`, where `name` is null until the advisor sets one.
  - **Unchanged:** the email domain and roster are still changed through `PUT /properties/{id}/email-domain` and `POST /properties/{id}/roster`, with the free-mail refusal; the page uses those routes.
  - **Who:** only an ADVISOR's own login, for the school it is linked to. A student, a guardian, a team manager and BTG staff are refused (403), and another school's advisor only ever sees their own.
  - **Tests:** `backend/tests/pol-be-103-advisor-profile.test.ts` (6). The POL-BE-101 tests now expect the advisor's name. The tenant sweep covers the new route.
  - **Left to `POL-FE-103`:** the Profile page in `/advisor`'s menu.
- **Delivered, frontend (`POL-FE-103`, 2026-11-20, HeckerCreatives):**
  - **Where:** `/advisor/profile`, "Profile" in the advisor's menu.
  - **The page:** two equal cards, Your details (name, title, phone, edited in a pop-up) and Sign-in (Clerk's email; "Manage sign-in" opens Clerk's own screen). Below them, Your school: name and type marked "kept by BTG" with a link to Help, then the email domain, roster count and last roster update. The advisor home's own email-domain and roster controls sit under it, with the same actions.
  - **Students see the name:** `/next/profile` shows the advisor's name before the email once it is set.
  - **Refused callers:** BTG staff opening the page are told it is not in their role; an advisor login with no school is told so, never shown a sample.
  - **Files:** `frontend/src/lib/advisor-profile-live.ts`, `frontend/src/app/(app)/advisor/profile/` (page, loader, actions), `frontend/src/components/advisor-profile.tsx`, `frontend/tests/advisor-profile-live.test.ts` (17).
  - **Walked** on the local servers as the QA advisor, the QA student and BTG: name, title and phone saved and shown; the student's profile then read "Dana Whitfield · qa.fe.advisor@example.com"; the audit log holds the change; BTG got "Not in your role"; desk and 390px with no sideways scroll. The QA advisor was put back as it was.
### 104. A school team can't see or keep its own details current (property portal) — partial today [§8, 2S1-BE-03]
`POL-BE-104` · `POL-FE-104` · *Dead end* · confirmed (found in live staging practice, 2026-11-17) · backend Done 2026-11-18 (`POL-FE-104` open)
- **What exists:**
  - `/property/settings`: the manager's sign-in email (from Clerk), the Stripe payout account, notification preferences and Close account.
  - `/property/branding`: display name, logo, colours and report footer, editable only when the tenant is an operated one; otherwise read-only, "BTG manages branding".
- **What's missing:** a page that shows the team its own details and lets it keep them current: school, sport, level, city and state, contact person and phone, public description; and the manager's own details (name, title, phone). Today only BTG sees the whole organisation record (`/admin/onboarding/[id]`).
- **Why it matters:** a team whose contact or description changed has to ask BTG, and the identity fields (school, sport, level, place) drive matching and conflict checks, so stale ones put the wrong athletes and sponsors together.
- **Done when:**
  - The property manager sees all of it on one page in the property portal.
  - Identity fields that matter for matching and conflicts (school, sport, level, city and state) go to BTG review before they take effect; the manager sees "waiting for BTG" until decided.
  - Cosmetic and contact fields (contact person and phone, public description; the manager's name, title and phone) save at once and are audit-logged.
  - Email, password and MFA stay in Clerk.
  - Tenant-scoped and own-property only, with role tests: another property's manager, an athlete, a sponsor and a student are refused (§30).
- **Reusing the athlete review queue:** `/admin/profile-changes` reviews `AthleteProfileChange` rows, a model keyed to an athlete (`athleteId`) with athlete-only rules (legal-name ID upload, date of birth and the guardian process). It can't take a property's change as it is. Either generalise it (a subject type and id on the change row, with per-subject rules) or add a `PropertyProfileChange` beside it shown on the same admin page; the first keeps one queue for BTG. Decide when this is built.

- **Decided (owner, 2026-11-18): automation.** "As always we target automation." An identity change takes effect at once when every safety check passes, and waits for BTG, with the reasons, when one fails. The open question on reusing the athlete review queue is settled the simple way: a `PropertyProfileChange` beside it, with BTG's own list of held changes. The admin page can show both lists.
- **Delivered, backend (`POL-BE-104`, 2026-11-18, rcfworks):**
  - **The page** (`backend/src/domain/property-profile.ts`), `GET /property/profile`:
    - the name, the type (`kindManagedBy: "BTG"`), city, state and the type's details (a team's legal entity name, league and sport; a school's district and sports…);
    - the description, and the main contact (name, email, phone);
    - the manager's own name, job title, phone and email (Clerk's);
    - the held change and the last decision;
    - the notification settings.
  - **Saved at once, audited:**
    - `PATCH /property/profile` saves the description and the main contact's name and phone (`property.profileUpdate`). The contact's email isn't changed here.
    - `PATCH /property/profile/me` saves the manager's own details (`property.managerUpdate`).
  - **Name, city, state and type details** (`POST /property/profile/change`, validated as at sign-up):
    - Held for BTG, with the reason, if any of these is true:
      - another organisation holds the name (the sign-up name rule);
      - a restricted word is in the name or details;
      - there's an open marketplace order or an offer out on the team's inventory;
      - the legal entity name or state registration number changes;
      - the business registration for the new state isn't on file;
      - the organisation is not in good standing (not approved, flagged, or payouts held).
    - Otherwise the change takes effect at once, on the property and its sign-up record (name key included).
    - A new name is written to the team's Zoho account once (`zoho.renameProperty`).
    - One change waits at a time (409).
    - The type stays BTG's.
  - **BTG's desk:**
    - `GET /property-profile-changes` lists held changes with their reasons (BTG staff read).
    - `…/{id}/approve` and `…/{id}/reject` (with a reason the team reads) are BTG_ADMIN's.
    - Two answers at once settle once.
  - **Live listings are not a hold.** A published listing alone doesn't stop a change, or every active team would wait on BTG. Only an order or an offer, where a sponsor is buying the team as it was described, holds it.
  - **Storage** (migration `20261118230000_property_profile`): `Property.description` and `PropertyProfileChange`.
  - **Who:** only the PROPERTY_MGR of that property. An athlete, a sponsor, an advisor, BTG staff and another team's manager are refused the page (403).
  - **Tests:** `backend/tests/pol-be-104-property-profile.test.ts` (7, each hold reason included), the Zoho rename in `zoho-sync.test.ts`, and the tenant sweep.
  - **Left to `POL-FE-104`:** the page in the property portal.
- **Delivered, frontend (`POL-FE-104`, 2026-11-20, HeckerCreatives):**
  - **Where:** `/property/profile`, "Profile" in the property menu before Branding.
  - **The page:** the organisation on top (name, type kept by BTG, city, state and the type's own details) with one button, "Change name, place or details". The form reuses the sign-up's fields and checks and sends only what differs. Under it, one notice when there is something to say: "Waiting for BTG" with the reasons and each before → after, BTG's "no" with its reason, or for 14 days a change that took effect. The button is hidden while a change waits. Then four equal cards: Main contact (name and phone; email read-only), Description, Your details (name, job title, phone), Sign-in. The first three save at once.
  - **BTG's desk:** a "Held organisation changes" section on `/admin/new-signups`, drawn only when one waits: what was asked, why it was held, Approve, and Reject with a reason the manager reads. `/admin/profile-changes` was already retired into New sign-ups, so the property changes join it there.
  - **Follows the backend, not the older wording:** the acceptance says identity fields "go to BTG review"; since the 2026-11-18 automation most take effect at once and only a failed check holds one. "School, sport, level" are whatever details the organisation's type has.
  - **Files:** `frontend/src/lib/property-profile-live.ts`, `frontend/src/app/(app)/property/profile/` (page, loader, actions), `frontend/src/components/{property-profile,property-change-decision,property-changes-section}.tsx`, `frontend/src/app/(app)/admin/new-signups/property-change-actions.ts`, `frontend/tests/property-profile-live.test.ts` (32).
  - **Walked** as the QA property manager and BTG: the manager's own details saved at once (audited); a move to Virginia took effect at once; a rename to "Westfield Hawks" waited for BTG with "Another organisation already holds the name", the change button hidden; BTG rejected it with a reason, which the manager's page then showed word for word. Desk and 390px clean. The QA school, its manager and the two change rows were put back as they were.
  - **Not built:** a link from a held change to the organisation's record (the desk API gives the property id, not the onboarding id `/admin/onboarding/[id]` needs), and BTG's screen for the sponsor's equivalent (`GET /sponsor-account-changes`, from `POL-BE-102`).
### 105. The admin home is a hero ring over twenty-two equal cards, so staff can't tell what needs them or how things are going [§10, §23, P7-FE-06]
`POL-FE-105` · *Confusing* · confirmed (programme owner, 2026-11-17: "big visual redesign for /admin, for the dashboard it must be the dashboard itself like in the image provided, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign"; three references: a dark analytics dashboard with ring KPI cards, bar and line charts and a data table, an admin template with a revenue card, an area chart, earnings bars and a segmented "completed" gauge, and a wallet dashboard with price cards, a line chart and donut cards)
- **Problem:** `/admin` opened on four header tiles (a queue ring, campaigns, systems, a legend), then up to 22 queue cards of equal weight, then three lists. There was no chart, no sense of how things were going, and the cards neither said what period they covered nor which needed attention first.
- **Fix:** a card-grid dashboard on the same Mission Control stage. Every card has an icon, a title and one plain line saying what it shows and for when; the fan numbers get a 7 / 30 / 90-day switch, everything else is "now".
- **Done when:**
  - Each card says what it shows and for when, without a "?".
  - What waits on BTG is one to-do card listing only desks with work, oldest first, each opening its desk.
  - The Mission Control look stays: fixed dark, steel and cyan, chamfered glass, corner brackets, the floor grid.
  - Every figure is a live read; a card the role can't read is left out and named in one line. Works at phone size.
- **Delivered (2026-11-17, HeckerCreatives):**
  - **Top:** "Dashboard" with a Live · updated pill and the 7 / 30 / 90 days switch (`?days=`); one line: "Fan numbers: Last 30 days (Oct 18 – Nov 17). Everything else is as of right now."
  - **Four number cards:** Waiting on you (desks with work, the queue-colour ring), Live campaigns (posts-done gauge, "N behind schedule"), Active athletes (booked-share gauge, how many are working now), Rewards used (change pill vs the period before, mini line).
  - **Fan activity:** a two-line chart (rewards claimed / used, day by day, week by week at 90 days) with axis labels, a legend with totals and a crosshair tooltip (hover, touch, ←/→). Beside it **Your to-do list**: only desks with work, oldest first, a colour bar, the oldest-wait line and a count; it scrolls inside the card on wide screens so the two stay level.
  - **Three cards:** Delivery progress (segmented gauge + done / overdue / campaigns behind), Fan journey (scanned → opened → claimed → used bars, share of scans ending in a used reward), Athlete network (working now / booked before / not booked yet donut, earnings paid of raised).
  - **Then:** Posts to review (each opens the post) beside System health (status lights), then Live campaigns as a table, behind schedule first; on a phone it folds to name, status line and posts done.
  - **Loading (owner, same day: "when fetching data, always have a loader", with Facebook's and Medium's skeleton screens as the kind):**
    - Arriving at `/admin` shows a skeleton of the dashboard itself. Every card is drawn as its own outline (icon, title and subtitle lines, then rows, a ring, bars, a chart or a table) under a thin progress line.
    - Switching 7 / 30 / 90 days navigates inside a transition. The card headers stay, and only what the period changes (the period line, Rewards used, the chart, the fan journey) swaps to its skeleton. A live region says "Loading the last 7 days…".
    - Files: `components/ops-skeleton.tsx` and `components/ops-pending.tsx`.
  - **Phones (owner, same day: the to-do list, posts to review and live campaigns ran "too long"):** below `lg` each of the three scrolls inside its card (about five, three and three rows), with a sticky fade that clears at the end, and "See all" sits outside the scroll. The table's column names are a plain row above its scroll box, so the rows scroll under it. A first version pinned a sticky `<thead>` inside the box, and the owner's screenshot showed a row painted above it. The real `<thead>` stays for screen readers at zero height, and both share a thin scrollbar gutter so the columns line up to the pixel. The page is about 400px shorter at 390 wide.
  - **Reads:** the board's four, plus `GET /operations/analytics?days=` and `GET /operations/network-metrics` (both 403 → card left out). No API change.
  - **Kit:** new `components/ops-dash.tsx` (server), `components/ops-activity-chart.tsx` (the one client island), `lib/ops-dash.ts` (pure, tested in `tests/ops-dash.test.ts`), `app/(app)/admin/(board)/dash.css`; `ActionRing` gains `bare`. Series colours blue `#2a8ee0` / orange `#e06816`, checked with the dataviz palette validator on the dark surface.
  - **Checked:** frontend unit suite green; tsc and eslint clean; `npm run build` in a detached worktree. Walked live as the QA BTG admin at 1440 (30 and 90 days, chart hover) and 390: no sideways scroll.

### 106. The applications desk is a wall of player cards under four tiles and pill tabs that repeat the same counts, so a reviewer can't tell what to do first [§10, §23, P3-FE-02, P1-ART-16]
`POL-FE-106` · *Confusing* · confirmed (programme owner, 2026-11-17: "let's visual redesign /admin/applications, just do what we did in listing and inventory inside the athlete's dashboard, add with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign")
- **Problem:** `/admin/applications` opened on four KPI tiles (Waiting, Past 48 hours, On file, Decided), then four pill tabs that counted the same applications again, then a grid of player cards. Nothing said what the steps were (start review, decide, activate), and the drawer put what to do at the very bottom, after the score and the checks.
- **Fix:** the athlete Inventory's pattern on the Mission Control stage: the list first, with tabs that carry the counts, a List ↔ Cards switch and one line on how it works.
- **Done when:**
  - Every count appears once, and each says in words what it holds.
  - The flow (open → start review → decide → activate) is spelled out on the page.
  - Each application says where it stands and what happens next, without opening it.
  - The drawer leads with where the application is and the reviewer's next step.
  - The Mission Control look stays (fixed dark, steel and cyan, chamfered glass). Works at phone size.
- **Delivered (2026-11-17, HeckerCreatives):**
  - **Header:** the title, a Live · Postgres · read pill and one line: "People who want to join BTG as athletes. Open one to check it, then approve it, ask for more information, or turn it down." The four KPI tiles are gone.
  - **Four status cards, numbers only:** Needs review / Approved / Rejected / All, each with an icon, the count (counting up) and a line ("Waiting for a decision", "Approved or already live", "Turned down, athlete told", "Every application on file"). Needs review turns orange and says "n waited over 2 days" when any have. A slow beam crosses each card in turn. They were first built as the tabs. The owner then said "don't make this a filter", so they don't respond to clicks, and the status filter is a **tab bar in the toolbar** (Needs review / Approved / Rejected / All) with a sliding marker and ←/→. It sits beside List ↔ Cards. `?tab=` is unchanged.
  - **Toolbar on a phone (owner: "in mobile view its ugly"):** one grid with two layouts, so no row holds a lone control. Wide: the tabs and List ↔ Cards, then search and the three filters. Phone: the tabs full width; search with an icon-only List ↔ Cards beside it; the three filters on one row, each sized to its label and truncating rather than wrapping.
  - **How it works:** a "? How it works" button in the header (owner, same day: "make a button for how this works and put this on the panel") opens a panel: four numbered steps (Open one, Start review, Decide, Activate) on a rail with a light running down it, then "Reading the list" (a pulsing dot is your move; orange means over 2 days; what the fit score is). Escape, the scrim, Close and Got it close it; focus returns to the button. The demo, which has no claim or activation, shows two steps.
  - **Hotfix after the merge (owner's error report):** Cards crashed with "Cannot read properties of undefined (reading 'tone')" on the API's ninth athlete state, `FEATURED` (P9-BE-11: an editorial profile nobody applied for; All tab only), which `LiveApplicationState` never listed. It is now in every map ("Featured", a Featured → Claimed → In review → Active tracker, "Nothing yet…", "added" not "applied"), and `stateLook()` plus `default:` branches fall back for any future state.
  - **Fix found on the walk:** a row's hover light was pushed a full row width sideways. The corner cut hid it but the page still scrolled sideways about 1,100px at 1440 whenever the mouse sat on a row. The row now clips its own overflow.
  - **The list (default):** Athlete (initials avatar coloured by status, name, sport · region · followers, Minor + guardian, flags) · Fit score (ring + "Strong fit" / "Not scored yet") · Waiting ("3 days" + a 48-hour bar, orange "over 48h"; "55 days ago · applied" once decided) · Status · next step (a pill, plus "Start the review", "Make a decision", "Waiting on the athlete", "Activate them next", "Closed"…; the dot pulses when the desk is the next mover) · Review →. Rows slide in, a light scans across on hover, and a late row has an orange edge. On a phone a row folds to the name on top, then score and waiting, then status.
  - **Cards:** the Scouting Board's player cards, kept as the other view with the same status pill. The choice is remembered per browser.
  - **Loading:** arriving shows a skeleton of the page itself (title, four cards, the toolbar, list rows). A tab, filter, search or page change shows (owner: "add a loader too"):
    - a spinner on the selected tab;
    - a placeholder for the pager, whose old "Showing x–y of N" would be wrong;
    - a glowing running bar;
    - "Loading applications…" with a spinner (a status line for screen readers);
    - a skeleton of the rows (or cards).

    It stays up at least 0.5 s, so a fast answer doesn't flicker. The review popup's Start review / decision / Activate buttons show a spinner while saving.
  - **Review panel, redrawn (owner, same day, with a screenshot: "this pop up is too ugly at the same time the UX are too confusing"):** it answers two questions in order.
    - **Where is it?** A header with a large status-coloured avatar, the name, a status pill, Minor, "applied 47 days ago" (orange "waiting over 2 days" when late) and the legal name. Under it, the tracker (Applied → In review → Approved → Active; a rejection stops red at step 3) with the state's sentence as its caption.
    - **What do I do?** A "Your next step" box with a **Go to it** button that scrolls to the decision and makes it glow. When there is nothing to do it turns green and says "Nothing for you to do".
    - **At a glance:** four tiles (Fit score, Guardian, Conflicts, Audience), each with an icon, the answer and a caption, coloured green / amber / red / grey. They replace the score section and the "Safeguards" list, which used an orange tick for "fine". "What the score is made of" lists the parts in two columns.
    - **The decision is its own numbered step.** 2 · Start the review (one button). 3 · Your decision: three choice cards (Approve, "They join the network. You activate them after."; Ask for more info, "Send it back with a note…"; Reject, "A final no…"). The note box then asks only what that choice needs: optional for Approve, "What should they add or fix?" or "Why is it a no?" (required, in orange) for the others. It is focused when a note is needed. One button says exactly what it does (Approve / Send back for more info / Reject application, coloured to match). If it can't be pressed it says why ("Write the note above first"), and Reject adds "This is final". 4 · Activate.
    - **Gone:** the pinned bottom bar that left a dead gap mid-panel, the always-visible greyed Request info / Reject buttons, and the two-click reject arm.
    - **A centred popup, not a slide-over (owner, same day: "instead of slide, can you change it"):** 46rem wide in the middle of the screen, the How it works panel's sibling. It scales in and out, has a lit top edge and corner brackets, and only its body scrolls. On a desktop the four facts sit in one row and the three choices side by side. Escape, a click outside and ✕ close it. Go to it scrolls the body itself, because scrollIntoView also scrolled the clipped popup frame and pushed the header out; the frame is `overflow: clip` now.
    - Same server action, transitions and refusals. The e2e strings are unchanged ("Start review", "Approve" exactly, "Activate athlete", the guardian sentences, "<name> approved", "<name> is active").
  - **Files:** `components/applications-desk.tsx`, `components/scout-stage.tsx`, `lib/applications-ui.ts` (`waitShort`, `STATE_NEXT`, `trackSteps`, `nextMove`, tested in `tests/applications-board.test.ts`), `app/(app)/admin/applications/(queue)/{page.tsx,loading.tsx,applications.css}`. No API change.
  - **Checked:** 2,392 / 2,392 frontend tests; tsc and eslint clean. Walked live as the QA BTG admin at 1440 and 390 (All and Needs review, the drawer for an active and an info-requested application, List ↔ Cards, the How it works panel opened and closed by Escape and Got it, the review panel for an under-review and an active athlete with Go to it and each choice tried, nothing submitted): no sideways scroll, no console errors. `npm run build` not run (the owner's `next dev` is live).

### 107. "+ New request" sends a sponsor to pre-made packages, so they can't create a campaign of their own [§9 screen 4, §13, P4-FE-01]
`POL-BE-107` · `POL-FE-107` · *Dead end* · confirmed (programme owner on staging, 2026-11-17: "creating a campaign leads to a dead end. it brings me to pre made campaigns. do not do that. create a campaign lets the user create a new campaign, not use a current pre-laid out campaign"; then: "on the campaign forms, add 1 more field... Country") · recorded only, not built
- **Problem:**
  - All three "+ New request" buttons in the sponsor portal go to `/sponsor/marketplace` (Packages): the Dashboard (`app/(app)/sponsor/page.tsx`), Campaigns (`sponsor/campaigns/page.tsx`) and Requests (`sponsor/requests/page.tsx`). So does the Campaigns empty state ("Browse packages to start one").
  - Packages only offers pre-made packages and job types. A signed-in sponsor has no way to describe a campaign of their own.
  - Checked live on staging as a test sponsor: the button opens Packages (12 packages, 7 job types), and every way forward there is "Request this" on a pre-made item.
- **What already exists:** `POST /briefs` (`CampaignBriefInput`) treats `packageId` as optional. It takes the goal, budget, dates, sports, states, the sponsor's category and categories to avoid, channels, audience tiers and a minimum audience. Automatic brief approval (P4-BE-11) already handles a brief without a package: the budget is checked against the lowest NIL job floor.
- **What's missing:** a country. The brief has `stateCodes` (US states) and no country. Athletes have `countryCode` (default `US`).
- **Fix:**
  - **Backend (`POL-BE-107`):** a country on the brief.
    - `countryCode` on `CampaignBrief`, ISO 3166-1 alpha-2, default `US`. It is in `CampaignBriefInput` and the brief edit input, and it is returned on reads, in OpenAPI.
    - States are only accepted with `US`. Outside the US the brief targets the whole country.
    - Matching, the staffing check and automatic approval count only athletes whose `countryCode` matches.
  - **Frontend (`POL-FE-107`):** a **Create a campaign** page at `/sponsor/campaigns/new`, a step-by-step form that submits `POST /briefs` with no package:
    1. **Goal:** what the campaign should achieve.
    2. **Budget and dates:** budget, start date and end date.
    3. **Who to reach:**
       - **Country** (default United States). States are shown only for the United States.
       - Sports.
       - Audience size (tiers, and a minimum number of followers).
       - Channels.
    4. **Brand safety:** the sponsor's own category, and categories to avoid.
    5. **Review and submit.**
  - **Buttons:** the three "+ New request" buttons become **"+ Create a campaign"** and open `/sponsor/campaigns/new`. The Campaigns empty state's main button does the same, with "or start from a ready-made package" as a secondary link to Packages.
  - **Packages stays** in the Marketplace menu, for sponsors who want a ready-made bundle. It is no longer where "create" leads.
- **Done when:**
  - From the Dashboard, Campaigns and Requests, "+ Create a campaign" opens a blank campaign form, never the package list.
  - A sponsor admin can fill in goal, budget, dates, country, states (United States only), sports, audience, channels and categories, and submit.
  - The brief is saved with no package and with the country, and appears under Requests. It is approved automatically or held for BTG with the reason, as a package request is.
  - Only athletes in the chosen country are matched, staffed or counted towards approval. States outside the United States are refused (400).
  - A sponsor analyst sees the form read-only, or is told they can't create one. Another sponsor's and non-sponsor roles are refused (§30).
  - Works at phone width. Build and tests pass.
- **Delivered, backend (`POL-BE-107`, 2026-11-17, rcfworks):**
  - **The brief:**
    - `CampaignBrief.countryCode` (migration `20261117180000_brief_country`, default `US`, so every existing brief reads as US and no match changes).
    - The country is in `CampaignBriefInput` (default `US`), `CampaignBriefPatch` and the brief read (`GET /briefs`, `/briefs/{id}`), with `CountryCode` in OpenAPI.
  - **The rules:** in `backend/src/domain/brief-country.ts`.
    - The code is upper-cased.
    - An unassigned code is refused (400), as are ZZ and the groupings EU and UN.
    - States are refused unless the country is US (400): on create, and on an edit judged by the country and states as they will stand after it, so moving a brief abroad needs its states cleared in the same edit.
  - **Matching by country:**
    - `athleteFit` and `eligibilityWhere` take the country, so the shortlist (both reads), automatic approval and the readiness counts see only that country's athletes.
    - The match engine (`gatherCandidates`) leaves out athletes abroad and the items they own, and the make-good engine passes the brief's country through.
  - **The catalogue:**
    - `GET /catalogue/targeting` now also returns `countryCodes` (the countries of ACTIVE athletes), and its `stateCodes` are US athletes' only.
    - `GET /catalogue/staffing` takes `?country=`.
  - **For `POL-FE-107`:**
    - The Country list is `GET /catalogue/targeting` → `countryCodes`; show states only for `US`.
    - Send `countryCode` in `POST /briefs` with no `packageId`.
    - A 400 says why (states outside the US, or an unknown country).
  - **Tests:** `backend/tests/pol-be-107-brief-country.test.ts`, the pure rules plus a real database through the API: no package and no country is US; "ca" is stored as CA; states abroad, ZZ and USA are refused with nothing written; five US athletes approve a US brief, while three in Canada hold a Canadian one for athletes, the other tenant's six not counting; the shortlist; the edit rules; the analyst and another tenant refused; targeting and staffing; the match engine. Removing the country filter fails five of them. `pol-fe-51-sponsor-staffing.test.ts` gains `countryCodes`.
  - **Checked:** backend suite 3,886 / 3,887 against a local Postgres. The one failure was this test's server binding, fixed and re-run green. Backend and frontend build, and lint, are clean.
- **Delivered, frontend (`POL-FE-107`, 2026-11-20, HeckerCreatives, with `POL-FE-116`):**
  - **"+ Create a campaign"** on the Dashboard, Campaigns and Requests (one component, `create-campaign-link.tsx`) opens `/sponsor/campaigns/new`, never packages. The empty states of Campaigns, Requests and Insights carry it too, with "or start from a ready-made package" as a second link. Packages stays in the Marketplace menu, and the help article names the new button.
  - **The page** is the campaign builder of item 116: a full-screen, step-by-step page in the same style as the `/brief` wizard (`POL-FE-114`), outside the portal's sidebar. Its first four steps are this item's: campaign name and goal; budget and dates; who to reach (country from `GET /catalogue/targeting`, United States first; states only for the US, from the states athletes are in; sports, audience size, smallest audience, channels); brand safety (own category, categories to avoid). It sends `POST /briefs` with no package and the country.
  - **Who:** a Sponsor Admin builds. A Sponsor Viewer or a BTG preview is told who can, and sees no form; the action checks the role again. The draft is kept on the device between visits.
  - **Campaign name:** the brief has no name field, so the name goes on the goal's second line ("Campaign name: …").
  - **Left to the backend, not repeated here:** matching only athletes in the chosen country, the 400 for states outside the US, and refusing other sponsors (`POL-BE-107`).
  - **Walked** as a Sponsor Admin at 1280 and 390 wide: the three buttons, all nine steps, Maryland picked and saved (`stateCodes {MD}`, country US, no package), the sent screen, and the request under Requests as "Being matched by BTG" (held for BTG with "No package — BTG prices custom requests", as a package request would be). A Sponsor Viewer got "Only a sponsor admin can create a campaign". The walk found the review reading "United States: MD"; it now names the state.

### 108. One organization's page and one sign-up's page show everything at once, so a reviewer can't find what matters or what to do [§10, §23, 2S1-FE-02, 2S1-FE-05, 2S1-FE-07]
`POL-FE-108` · *Confusing* · confirmed (programme owner, 2026-11-17: "redesign the visual of /admin/onboarding/seed_onb_hawks and /admin/new-signups/guardians/seed_grd_1 the pages are too confusing for a human, we need to redesign this in order for a human to understand, having many information at once can haywire a human's brain and pushing them away to our platform")
- **Problem:**
  - `/admin/onboarding/:id` stacked nine panels down the page and four more beside them. The same facts appeared up to three times ("Organisation", "At a glance" and the business details). The header had two status badges.
  - "Passed", "Approved" and "Clear" were drawn in the brand's orange, which reads as a warning.
  - The decision was a row of grey pills, a note box and a disabled "Pick a decision" button, all on screen before anything was chosen.
  - `/admin/new-signups/guardians/:id` (and the athlete's, the same component) stacked up to nine panels beside a box of buttons. Reject and Reinstate were always drawn, one of them greyed out with the reason in a tooltip and again in small print.
- **Fix:** one calm shape for all three pages, on the Mission Control stage: who it is and where it stands, the few answers a reviewer looks for first, then one topic at a time. Deciding is behind one button.
- **Done when:**
  - The page opens on the name, one status and one button. Nothing about deciding is on the page until that button is pressed.
  - A fact appears once.
  - Only one topic is on screen at a time, and a topic with something to look at is marked.
  - No button is drawn that can't be used; a choice that is locked says why.
  - Green means fine, orange means yours to look at, red means stopped.
  - Links into the page (the documents, one document) still land on the right thing.
  - The Mission Control look stays. Works at phone size.
- **Delivered (2026-11-17, HeckerCreatives):**
  - **Header:** a back link, a mark tinted by kind (organization, athlete, guardian), the name with ONE status pill beside it, one line of context ("Team · MD · submitted Sep 29, 2026 · waiting 48 days") and ONE button at the end of the row.
  - **The one button:** "Make a decision" (filled) when something waits on BTG. When only one thing can be done it names it: "Reject Dana", "Reinstate Dana", "Reinstate". On an approved organization it is a quiet outlined "Suspend or reject". A record with nothing to decide has no button.
  - **The decision popup** (the applications review's and How it works's sibling, portaled to the body):
    - It opens on where the record stands ("Waiting for your decision. Read what's wrong and open the documents…", "Nothing for you to do. BTG approved it. Step in only if something is wrong.").
    - The choices sit side by side, each with its icon, its colour and what it does. One that can't be taken yet is greyed with a lock and says why ("Locked until they finish: …").
    - Once one is picked: what to know first (a guardian's rejection names the athletes it takes with it; a takeover lists what changes), then the note, marked required or optional.
    - Cancel, and one button named for the action ("Approve", "Reject and email reason", "Confirm takeover"). The line beside it says what is missing while it can't be pressed. Nothing is saved before that button.
    - It replaces the organization's decision panel and the sign-up's "Actions" box, Reject dialog and Confirm takeover dialog. The words, server actions and refusals are unchanged.
  - **Owner follow-ups, same day:**
    - The first cut kept the decision form open inside a "Your next step" card beside the page: "showing this immediately is ugly". The form moved into a popup.
    - The card itself, now a sentence and a button: "you're still showing this?". The card is gone; the sentence is the popup's first line.
  - **Four tiles:** for an organization, checks passed ("4 of 6"), required documents ("0 of 2 · Missing: Government ID…"), primary contact, listing access. For a sign-up, who they look after (or their guardian), checks passed (or "Held for 2 reasons"), documents, signed up. A gap is orange only when the record is waiting on BTG or flagged; on one BTG already approved it is grey, a fact and not a task.
  - **Tabs, one topic at a time** (sliding marker, ←/→):
    - Organization: Overview (what's wrong, what's missing, the checks) · Organization (its details, payout and terms) · People (contacts, logins) · Documents · History (last decision, activity).
    - Sign-up: Overview (what's wrong, a held takeover, flags, who they look after, the checks) · Details · Documents · Content & rates (an approved athlete only: content review, home page, rate card) · History.
    - A tab with something to look at carries an orange dot; People and Documents say how many they hold.
    - A link to "#documents" or to one document (a "What's wrong" tag, BTG's emails) opens the tab that holds it and scrolls to it.
  - **Removed as repeats:** the organization's "Organisation" card and "At a glance" list (both repeated the details and the tiles), and the second status badge.
  - **Colour:** inside these pages "Passed", "Clear" and "Approved" are green. The brand accent is overridden to green for the page (`.sx-rec`), so embedded badges follow.
  - **Loaders:** each page has its own loading screen in its shape (the name and its button, four tiles, the tabs, rows).
  - **Bug found by probing, fixed before it shipped:** a tab panel's entrance animation was held after it finished (`fill-mode: both`), which made the panel the containing block for fixed dialogs: Send back and the home-page controls would have opened trapped inside the tab. It fills `backwards` now, and the section's chamfered glass is a layer behind its content, not a clip-path on the block.
  - **Help:** "check-new-signups" and "verify-a-property" describe the tabs and the button, and their pictures were re-captured.
  - **Files:** new `components/record-stage.tsx` (header, tiles, sections, skeleton), `components/record-kit.tsx` (tabs), `components/record-decide.tsx` (the button and popup), `lib/record-ui.ts` (pill, next-step sentence, tiles; tested in `tests/record-ui.test.ts`), `app/(app)/admin/record.css`, and a `loading.tsx` for each of the three routes. Rewritten: `app/(app)/admin/onboarding/[id]/page.tsx`, `components/live-signup-profile.tsx`, `components/live-signup-review.tsx`, `components/onboarding-decision.tsx`. `components/desk-kit.tsx` tabs can carry a count. No API change.
  - **Checked:** 2,422 / 2,422 frontend tests; tsc and eslint clean. Walked live as the QA BTG admin at 1440, 768 and 390: an approved and a waiting organization, a guardian, an athlete; every tab; the popup opened, a choice picked, the note typed, closed by Escape with focus back on the button, nothing submitted; "#documents" opening its tab; a fixed overlay opened from inside a tab covering the screen. No sideways scroll, no console errors. `npm run build` not run (the owner's `next dev` is live); e2e not run (no spec touches these pages).

### 109. New sign-ups is four tiles over kind chips that repeat the same counts, so staff can't tell that only the held ones need them [§10, §23, 2S1-FE-07, P1-ART-15]
`POL-FE-109` · *Confusing* · confirmed (programme owner, 2026-11-17: "let's visual redesign /admin/new-signups, just do what we did in listing and inventory inside the athlete's dashboard, add with animations + wow factor + awwwaaaard, make sure its easy to understand because what you did before is so confusing for a human but make sure not to remove the current theme of the visual redesign, also while you're at it add a loaders and how it works")
- **Renumbered 2026-11-19:** logged on 2026-11-17 as item 107 / `POL-FE-107`, before the pull showed rcfworks had already taken 107 for "+ New request". It is item 109 / `POL-FE-109` everywhere now.
- **Problem:** `/admin/new-signups` opened on four KPI tiles (Needs review, Approved automatically, On the desk, By kind), then five kind chips that counted the same sign-ups again, an orange "Needs review" toggle with a third copy of that count, and one dense table with a two-letter code (OR / AT / GU / SP) for the kind. Nothing said that sign-ups are approved without staff, or what to do with a held one. A filter change only dimmed the table.
- **Fix:** the athlete Inventory's pattern on the Mission Control stage, the way `/admin/applications` was redrawn the same day (item 106): the list first, numbers on cards, a button that explains the flow, and a loader for every fetch.
- **Done when:**
  - Every count appears once, and each says in words what it holds.
  - The page says that sign-ups are approved automatically and that only "Needs review" is staff's work.
  - The flow, from someone joining to staff's decision, is spelled out behind "How it works".
  - Each sign-up says its kind in words, where it stands and why, without opening it.
  - Arriving, and every tab, kind, search or page change, shows a loader in the list's own shape.
  - The Mission Control look stays (fixed dark, steel and cyan, chamfered glass). Works at phone size.
- **Delivered (2026-11-17, HeckerCreatives):**
  - **Header:** the title, a Live · Postgres · read pill, "? How it works" and "Sign-up rules →", then one line: "Everyone who joins is checked and approved automatically. You only step in for the few held under Needs review."
  - **Four status cards, numbers only (not a filter, item 106's rule):**
    - **Needs review**: the count, orange with "Held for you. Open each one to decide." when anything is held, a green tick and "Nothing is waiting on you." when not.
    - **Approved automatically**: the count, a bar for its share and "n% passed every check on their own". The percent never rounds a part up to 100 or down to 0.
    - **All sign-ups**: the total.
    - **Who signed up**: one bar per kind, measured against the largest, with "· n to review" beside a kind that has any held. One hue, since the label already names the kind.
    - Numbers count up, bars grow in, and a slow beam crosses each card in turn. Below four-across, "Needs review" takes the full width and the other two numbers share a row.
  - **Toolbar:** two tabs, **All sign-ups** and **Needs review** (an orange pulsing dot on it when anything is held), with a sliding marker and ←/→; List ↔ Cards, remembered per browser; search; and the kind as an **All kinds** menu instead of five chips. A search or kind shows as a removable chip with "Clear all". The URL is unchanged (`kind`, `review=1`, `q`, `page`, `size`), and the old `?tab=` links land on the same view. The first change from one writes the explicit filter, so "All kinds" really clears `?tab=ath`.
  - **The list (default):** Who (a tinted mark with an icon per kind, the name, one line) · Kind in words · Signed up · Status and why (a pill: Needs review, Approved automatically, Approved by BTG, Approved · flagged, Rejected; the dot pulses when it is staff's move; under it the reason, or the problem tags) · **Review** (orange, on a held or flagged row, which also has an orange edge) or **Open**. A click anywhere on the row opens the sign-up. Rows slide in and a light scans across on hover. On a phone a row folds to the name and the button, then kind and day, then status and why.
  - **Cards:** the same sign-up as a glass card with corner brackets; a held one has an orange top edge.
  - **How it works:** a header button opening a panel. Five numbered steps on a rail with a running light (Someone signs up, SponsorX checks it, Most are approved automatically, A few are held for you, You decide), then "Reading the list": the pulsing dot, the orange edge, green, and what the sensitive profile edits under the list are.
  - **Loaders:** arriving shows a skeleton of the page itself (title, buttons, four cards, the toolbar, rows). A tab, kind, search, size or page change shows a spinner on the selected tab, a placeholder for the pager, a glowing running bar, "Loading sign-ups…" and a skeleton of the rows or cards, held at least 0.5 s so a fast answer doesn't flicker. The sensitive-edits list has the same loader for its own paging.
  - **Sensitive profile edits:** a heading in plain words and one glass card per edit, with an orange edge on the ones waiting for Apply / Decline. It now sits in its own `<ServerList>`, so paging the sign-ups never blanks the edits or unmounts a note being typed there, and the other way round.
  - **Empty lists** say why: "Nothing needs review", "No sponsors need review", "No guardians have signed up yet", "No sign-ups match “…”".
  - **Shared kit:** the tab bar, List ↔ Cards, the status pill, the loaders and the "How it works" panel moved out of `applications-desk.tsx` into `components/desk-kit.tsx`, unchanged, so both desks use one copy.
  - **Help:** the "check-new-signups" article says "tab" and "All kinds" where it said toggle and chips, and its five pictures were re-captured (`HELP_ONLY=check-new-signups npm run help:shots -- admin`).
  - **Files:** new `components/desk-kit.tsx`, `components/signups-desk.tsx` (client island), `components/signup-stage.tsx` (header, cards), `app/(app)/admin/new-signups/(stream)/signups.css`. Changed `(stream)/{page.tsx,loading.tsx}`, `components/sensitive-edits-section.tsx`, `components/applications-desk.tsx`, `applications/(queue)/applications.css` (the tab's dot), `lib/new-signups-live.ts` (`streamStats`, `kindBars`, `streamPatch`, `streamEmpty`, the row's `pill`; tested in `tests/new-signups-live.test.ts`), `lib/help/admin.ts`. Removed `components/intake-stage.tsx` and `intake-fx.tsx`. No API change.
  - **Checked:** 2,402 / 2,402 frontend tests; tsc and eslint clean. Walked live as the QA BTG admin at 1440, 768 and 390: both tabs with the response held (loader, then the list), the kind menu, search, Clear all, List ↔ Cards, How it works opened and closed by Escape with focus back on the button, `?tab=review`, `?demo=loading` and `?demo=empty`, a click on a row's name opening that sign-up. No sideways scroll at any width, also with the mouse on a row. `/admin/applications` walked again on the shared kit (tabs, Cards, How it works). The only console message was a React list-key warning on the athlete sign-up's own page, which this change does not touch. `npm run build` not run (the owner's `next dev` is live).

### 110. A team, school or sponsor logo is saved even when its file never arrived [§8, upload audit §3]
`POL-BE-110` · *Silent* · confirmed · **Done 2026-11-19** (#490) (upload audit, 2026-11-19)
- **Problem:** the property's branding form (`POST /branding/logo`, then save) and the sponsor's Account page (`POST /sponsor/account/logo`, then `PATCH /sponsor/account/company`) save the logo's key after checking only that it sits in their own folder. If the upload failed, the record still points at nothing, and every page and report shows a broken image. The athlete's profile photo already checks that its file exists.
- **Done when:**
  - A logo is saved only once its file has arrived, is the declared type (PNG or JPEG) and fits 1 MB.
  - Otherwise the save is refused with "upload it again", and the old logo stays.
  - The real-upload test covers both logos.
- **Delivered (2026-11-19, rcfworks; Done, deployed to staging and production the same day):**
  - **The check:** `checkPublicUpload` in `backend/src/lib/storage.ts`. Before a record points at a public file, the file must exist, be one of the types asked for, and fit the size. A wrong file is deleted at once, because the public bucket serves it to anyone.
  - **Where it runs:** `updateBranding` (team or school logo), `updateCompany` (sponsor logo) and `setAthletePhoto` (profile photo). The photo used to check only that its file existed.
  - **What a person sees:** a missing file is refused (409, "hasn't arrived yet"). A wrong type or size is refused (422, "so it was removed"). The old logo or photo stays.
  - Saving the same key again isn't re-checked.

### 111. Five uploads are never tested with a real file [§30, upload audit §4]
`POL-BE-111` · *Silent* · confirmed · **Done 2026-11-19** (#490) (upload audit, 2026-11-19)
- **Problem:** `backend/tests/private-upload-pins.test.ts` puts a real file into a test storage for 11 flows. Five are tested only against fake storage:
  - dispute documents;
  - student drafts;
  - the athlete's profile photo;
  - the team or school logo;
  - the sponsor logo.

  Its completeness check only asks that every private upload is signed for one type and size, so a new upload can be added without a real test.
- **Done when:**
  - All five run through the real-upload test: a wrong type or size refused, the right file accepted.
  - The completeness check fails when any upload in `backend/src` is missing from the test, public uploads included.
- **Delivered (2026-11-19, rcfworks; Done, deployed to staging and production the same day):**
  - **Private:** `backend/tests/private-upload-pins.test.ts` gains dispute documents. Student drafts were added by P9-BE-25, along with edition content.
  - **Public:** new `backend/tests/public-upload-pins.test.ts` covers the team or school logo, the sponsor logo and the profile photo, each run as a browser runs it against a store that checks signatures:
    - the URL is signed for one type and size, and the bucket refuses anything else;
    - a missing file is refused, and nothing is saved;
    - a wrong type or size that got in anyway is refused on save and deleted;
    - the right file is saved.
  - **Completeness:** new `backend/tests/upload-coverage.static.test.ts` fails if any `backend/src/domain` file that presigns an upload, private or public, isn't driven by a real-store test. It currently counts 18 files.
  - **Older tests:** three tests that saved logos without a bucket (home-featured, pol-be-102, phase2-marketplace) now stand in the arrival check. The real check is driven above.
  - **Checked:** full backend suite 285 files, 4,026 tests; lint clean.

### 112. CI's browser tests never really upload a file [§30, upload audit §4]
`POL-BE-112` · *Silent* · confirmed · **Done 2026-11-19** (#492) (upload audit, 2026-11-19)
- **Problem:** four flows have a browser test that uploads a file: the athlete's content, a sign-up ID, onboarding documents and a support attachment. CI's browser job has no storage, so the test itself answers the step where the browser sends the file (`e2e/support/object-store.ts`). A broken browser upload passes CI.
- **Done when:**
  - CI's browser job runs a real test storage, with the same upload rule as staging.
  - The four tests upload for real in CI, and fail if the storage refuses.
  - The stand-in stays only for a laptop with no storage running.
- **Delivered (2026-11-19, rcfworks; Done, deployed to staging and production the same day):**
  - **First attempt:** real MinIO in CI. It failed because MinIO's server image is no longer published (`pull access denied for minio/minio`).
  - **What CI uses instead:** the e2e object store (`e2e/support/object-store-standin.mjs`) in a new **strict** mode (`E2E_STORE_STRICT=1`), held to what R2 enforces:
    - **The upload rule:** only `E2E_STORE_ALLOW_ORIGIN` (the test site, `http://127.0.0.1:3100`, as staging allows only its web origin) gets a preflight and an allow-origin. Another site's browser upload fails, as it did on 2026-11-16.
    - **Signed links:** every signed PUT and GET is re-signed with the API's keys and compared, so a wrong type, length, key, download setting or an expired link is refused.
    - Requests the API makes itself, signed in a header, pass as they do on R2.
  - **The check before the suite:** CI's e2e job confirms the store allows the test site, refuses another site, and refuses a forged signed upload. It stops if not.
  - **No faking in CI:** under `CI`, `e2e/support/object-store.ts` never answers the browser's PUT itself, and no store is a failure. Laptops keep the relaxed mode.
  - **Checked here:**
    - the strict store, run locally: test site preflight 204, another site 403, signed PUT 200, wrong type 403, tampered 403, signed GET 200 with its download setting, forged GET 403;
    - the CI check step, run locally;
    - the workflow parses.
  - The e2e suite's run on the pull request is the end-to-end test.

### 113. Nothing checks that the live storage accepts uploads [§26, upload audit §4]
`POL-BE-113` · *Silent* · confirmed · **Done 2026-11-19** (#493) (upload audit, 2026-11-19; it already broke once, 2026-11-16)
- **Problem:** on 2026-11-16, the public storage on both staging and production had no rule letting the website upload to it. Every profile photo and logo upload failed, and nobody knew until someone tried. The health check only asks whether the public storage exists. It doesn't check the private storage, and it never tries an upload from the website's address.
- **Done when:**
  - Every day, and after every deploy, staging and production each check both storage areas: ask permission to upload as the website would, put a small test file through a signed link, read it back, and delete it.
  - Any step failing turns the deploy check red and tells BTG what failed.
  - The health check covers the private storage too.
  - The check leaves nothing behind in storage.
- **Delivered (2026-11-19, rcfworks; Done, deployed to staging and production the same day):**
  - **The check** (`probeBucket` in `backend/src/lib/storage.ts`, `runStorageCheck` in `backend/src/domain/storage-check.ts`) runs on both storage areas:
    - a preflight as the website (the origin of `APP_URL`, which is `https://web-staging-904a.up.railway.app` on staging and `https://sponsorx.net` on production, each matching its upload rule);
    - a signed upload as the website;
    - the server reading it back;
    - a delete, then a check it's gone. A failure part-way still deletes the test file.
  - **When it runs:** the worker runs it when it starts (so after every deploy) and every 24 hours. Each result is recorded in `StorageCheck` (migration `20261119220000_storage_check`), with 30 days kept.
  - **Health:**
    - `/health/full` gains `checks.storageUploads` (`{ ok, checkedAt, problem }`).
    - On Railway, a failure, a check older than 26 hours or no check at all is degraded. Off Railway nothing is required.
    - `storageReachable` now checks the private bucket too.
  - **Alerts:** the 15-minute uptime monitor alerts BTG on Slack, and `scripts/health/monitor.py` names the failure in words, for example "storage uploads (public storage (photos, logos): a browser on the website can't upload …)".
  - **The deploy check:** `deploy-daily.yml` waits, after moving `release`, for a storage check newer than the deploy on staging and production (up to 30 minutes). It goes red if either failed or never came.
  - **Tests:**
    - `backend/tests/pol-be-113-storage-check.test.ts` (6): the test store now answers preflights by an upload rule. It covers a pass with nothing left behind, a refused origin failing at the preflight, a refused upload, and the health verdicts;
    - a new `test_storage_upload_failure_says_what_cannot_upload` in the monitor's tests;
    - the health-full, tenant-scope and authz-coverage tests are updated.
  - **Checked:** full backend suite 286 files, 4,033 tests; monitor tests 23; lint and build clean.

### 114. The sponsor brief is a small card beside a marketing panel, with unrelated questions on each step, so a sponsor can't tell what is being asked or what happens next [§9, §13, P1-FE-10, P2-FE-01, 2S1-FE-11]
`POL-FE-114` · *Confusing* · confirmed (programme owner, 2026-11-19: "big visual redesign for /brief, don't make it look like a ordinary landing page, make this a step by step process wizard that had its own page add an animation + wow factor + awwwaaaard, the current design right now is full of confusing parts, we don't need it, it must be understandable by a human")
- **Renumbered 2026-11-19:** logged that morning as item 110 / `POL-FE-110`, before a fetch showed rcfworks had taken 110 to 113 for the upload audit. It is item 114 / `POL-FE-114` everywhere now.
- **Problem:** `/brief` was a 430px card next to a headline and three trust bullets, under the site's header and above its footer, so it read as one more landing page. Each of its four steps asked two or three unrelated things: the goal with a 26-item business-type dropdown and "what success looks like"; the budget with a "Starting package" dropdown and timing. The words were ours, not a sponsor's ("Bands, not invoices", "One goal per brief keeps the match sharp"). A missing answer said only "Required". After sending, the same two to-dos appeared twice, once as a list and once as a timeline.
- **Fix:** the brief is its own full-screen page, outside the site's header and footer, that asks one thing at a time and shows the whole brief before it is sent.
- **Done when:**
  - Nothing is on the page but the wizard. The address stays `/brief`, with `?package=`, `?new=1` and `?demo=submitted` working as before.
  - Each screen has one question that must be answered, in plain words, and at most one optional follow-up.
  - The sponsor can always see which step they are on, how many there are, and what they have answered.
  - Before anything is sent, the sponsor sees every answer on one screen and can change any of them.
  - A missing answer says what to do, and the form goes to it.
  - The sent screen says each remaining to-do once.
  - What is collected and what is sent to BTG does not change.
  - It moves: the step change, the choices, the progress, the sent moment. Reduced motion shows it still. Works at phone size and by keyboard alone.
- **Delivered (2026-11-19, HeckerCreatives):**
  - **Its own page:** the route moved from `app/(public)/brief` to `app/brief`, like `/login`, so the site's header and footer are gone. The top bar has the logo (home) and **Save and exit** (back to the packages; the answers stay on the device). The boot screen and the page transition ("Your Brief") still play.
  - **Six screens, one question each:**
    1. **Goal**: "What should this campaign do for you?" Four cards, each with an icon and one plain line ("More people come through your door."). Once one is picked, "What would a good result look like?" opens under it, marked Optional.
    2. **Business**: "Tell us about your business." The name, then the kind as choices: nine everyday kinds first (Restaurant, Local retail, Fitness and so on), the other sixteen behind **More types**, and **Something else**, which opens a line to say it in words.
    3. **Budget**: "How much do you want to spend?" Five cards with a small meter. Then "When do you want to start?", Optional. A package picked on the packages page shows here as "Package you picked", with Remove. The "Starting package" dropdown is gone.
    4. **Where**: "Where are your customers?" The city or region, then "Who do you want to reach?", Optional.
    5. **Contact**: "Who should we reply to?" Name, work email, phone (Optional).
    6. **Review and send**: the brief on one card with **Edit** on every part. An Edit goes to that screen, and its button reads **Back to review**. Beside the card, "After you send it" lists the three things that follow. **Send to BTG** is only here.
  - **Always in view:** from 1024px the steps run down the left, each with its answer under its name; a finished step can be clicked to change it. Below that, a progress line and "Step 2 of 6 · Business".
  - **Messages say what to do:** "Pick a goal", "Add business name", "Enter a valid email, like you@company.com". The form moves to the first gap. An email now needs a dot after the @ (`jordan@cafe` was accepted before).
  - **Opening a saved brief:** it opens where it was left, but never past a screen with something missing. A brief saved by the four-step form lands on its first gap.
  - **Sent:** "Brief sent.", then the two things left as two cards (confirm the email; upload proof of business, the same upload as before), then the third as a plain line, "Then: your first request". The buttons are See where your request stands, Read what you sent, Back to packages. The duplicate timeline is gone.
  - **Motion:**
    - two slow lights that move to a new place on every step, a light under the pointer, and the step's number, outlined and very large, rolling to the next like a counter;
    - a step leaves upward and the next rises in, its heading a word at a time;
    - a choice's border lights toward the pointer, neighbours included, and rings once when picked;
    - a typed answer sits on a line that fills when focused;
    - the review card leans a little toward the pointer;
    - on sending, the tick draws itself inside two halos and one burst of confetti in the brand colours plays (only for a brief sent in that visit).
    - Reduced motion: all of it is still.
  - **Keyboard:** 1 to 5 picks a choice, arrows move between choices, Enter continues. A new screen puts the focus on its question.
  - **Not changed:** the answers and their keys, the saved draft's shape and key, what `POST /public/inquiries` receives, the proof upload and the status page.
  - **Files:** `app/brief/{page.tsx,actions.ts,brief.css}` (moved and new), `components/brief-wizard.tsx` (rewritten), new `components/brief-fx.tsx`, `lib/brief-flow.ts` (six steps, `GOAL_HINTS`, `TIMINGS`, `COMMON_BUSINESS_TYPES` / `MORE_BUSINESS_TYPES`, `firstOpenStep`, `resumeStep`, `stepAnswer`), `tests/brief-flow.test.ts`. The 2026-09-21 spec in `docs/superpowers/specs` describes the old card.
  - **Shared frame (later the same day, item 115):** the page around the questions (the ground, the top bar, the progress line, the list of steps, the typed-answer line) moved out of `brief-wizard.tsx` into `components/focus-wizard.tsx`, which the athlete application also uses. `brief.css` takes the wizard's colour from one variable, so the same stylesheet is orange here and blue there. The brief was walked again afterwards at all four sizes with the same results.
  - **Checked:** 2,513 / 2,513 frontend tests (22 in `brief-flow.test.ts`); eslint clean. Walked on the running dev server at 1440×900, 1180×720 and 390×844, and at 1440 with reduced motion: every screen, every message, More types, Something else, a number key and Enter, Edit and Back to review, a reload (resumes on the review with the answers kept), `?package=pk4`, arriving from the packages page by a link, Save and exit, and the sample sent screen with Read what you sent. No console errors and no sideways scroll at any size.
  - **Not checked:** a real send. The walk stopped at the review so no inquiry or Zoho Lead was created; the send path's logic is the one that was there, plus a guard against a double click. `npm run build` not run (the owner's `next dev` is live), so `tsc` still shows two errors in the generated `.next/types/validator.ts`, which names the old route's path; nothing in `src` has an error.
  - **Found, not fixed:** the packages page links here with the live catalogue's keys (`TEST_DRIVE`, `COMMUNITY_CAMPAIGN`, `NEXT-AD-FULL` …), but the brief only knows the fixture ids `pk1`…`pk6`. So a package picked there has been dropped since the catalogue went live: the brief BTG receives says "Package: Not sure yet", and the new "Package you picked" line never shows for a real visitor. The fix is for `/brief` to resolve the key against `GET /public/catalogue/packages` and keep the name in the draft; it changes what is sent, so it is left for a decision.

### 115. The athlete application runs inside a narrow panel on the /join landing, so the form and the sales page fight for the same screen [§9, §11, P1-ART-07, P3-FE-01]
`POL-FE-115` · *Confusing* · confirmed (programme owner, 2026-11-19, after seeing the new `/brief`: "same redesign for /join atheletes the landing page part is good but maybe add a button wherein it would go to the next page for the sign up")
- **Problem:** `/join` was a landing page with the whole ten-section application inside a 460px glass panel beside the hero. The form sat under the site's header, with the job-types band, the path, the promises and the footer below it. Its start button was a screen down, under the list of sections. A missing answer said only "Required". An email without a dot after the @ (`maya@school`) was accepted on step 1 and refused by the API on the last step.
- **Fix:** keep the landing as it is and give it a button; move the application to its own full-screen page drawn like the new sponsor brief (item 114), in athlete blue.
- **Done when:**
  - The landing looks as it did, and has one clear button at the top of its panel that opens the application.
  - The application is on its own page with nothing else on it, and works by keyboard and at phone size.
  - The athlete can see which step they are on and how many there are, and can go back to a finished step.
  - Leaving and coming back, on either page, keeps every answer.
  - A missing answer says what to do.
  - The sections, their fields, the under-18 guardian step, the agreement and rules ticks and what is sent do not change.
- **Delivered (2026-11-19, HeckerCreatives):**
  - **The landing, `/join`:** unchanged but for the glass panel, which now holds a start panel instead of the form: the same heading and list of the ten sections ("What it asks"), with the button moved to the top. The button reads **Start application**, or **Resume — section 4 of 9** with **Start over** under it when this device has a draft, or **See your application** once one was sent from it. The closing panel's button ("Start the application") goes to the same place; it used to jump up the page.
  - **The application, `/join/apply`:** its own page outside the site's header and footer, like `/brief`. One section per screen, as before:
    - the top bar has the logo and **Save and finish later**, which goes back to the landing;
    - from 1024px the steps run down the left with a tick on the finished ones; any finished step can be opened from there, and going forward that way checks the step being left first;
    - below 1024px, a progress line and "Step 3 of 9 · Location";
    - answers are typed on a line; the buttons are **Back** and **Save and continue**, then **Submit application** on the agreement, which stays off until the box (both boxes, for an adult) is ticked, with a line saying so;
    - the restrictions step and the agreement step are the same components as before, on the wider page.
  - **Answers are kept as they are typed,** not only on "Save and continue", so leaving by any door loses nothing.
  - **Messages say what to do:** "Add legal first name", "Add date of birth", "Enter a valid email, like you@example.com". The form moves to the first gap. An email now needs a dot after the @, on the athlete's step and the guardian's.
  - **Submitted:** the tick draws itself inside two halos, "Application submitted." rises a word at a time, and one burst of confetti plays for an application sent in that visit. The checklist (confirm your email, upload your ID), "Review your answers" and "Update restrictions" are the same as before.
  - **While it loads** (the page reads the agreement and the rules wording first): a skeleton in the page's own shape.
  - **Old links:** `/join?demo=minor` and `/join?demo=submitted` are sent on to `/join/apply` with the same `demo`.
  - **Motion:** the brief's (item 114): the lights that move per step, the rolling step number, word-by-word headings, the answer line that fills. Reduced motion shows it still.
  - **Help:** the "How do I apply" article says where the button is and that the form opens on its own page; its steps 2 and 3 point at `/join/apply`. Its pictures were re-captured. The capture script had been photographing the boot screen on public pages, so the article's one picture had been the loading screen since 2026-11-16; the script now waits for the boot screen to go (`scripts/help-shots/capture.mjs`).
  - **Not changed:** the ten sections and their fields, the guardian branch, the saved draft's shape and key, the agreement and rules ticks and their versions, what the submit action sends, the confirm and edit pages.
  - **Files:** new `app/join/apply/{layout.tsx,page.tsx,loading.tsx}`, `components/join-start.tsx`, `components/focus-wizard.tsx`, `tests/join-apply.test.ts`. Rewritten `components/join-wizard.tsx`. Changed `app/(public)/join/page.tsx`, `components/join-stage.tsx` (the closing button), `components/join-submitted.tsx` (the heading), `lib/join-flow.ts` (the messages, the email check), `components/brief-wizard.tsx` and `app/brief/brief.css` (the shared frame and its colour), `lib/help/athlete.ts`, `scripts/help-shots/capture.mjs`.
  - **Checked:** 2,524 / 2,524 frontend tests (11 new in `join-apply.test.ts`); tsc and eslint clean. Walked on the running dev server at 1440×900, 1180×720 and 390×844, and at 1440 with reduced motion: the landing and its button, every section with an empty Continue and then filled, a bad email, a state that is not two letters, no social handle, Enter inside the "add a deal" box (stays on the step), both ticks arming Submit, back and forward from the list of steps (forward refused while the step had a gap), Save and finish later, Resume from the landing, the under-18 sample (10 steps) and the submitted sample with Review your answers. No console errors and no sideways scroll at any size. `/brief` walked again at the same four sizes.
  - **Not checked:** a real submission. The walk stopped with Submit armed, so no application was filed; the submit path is the one that was there, plus a guard against a double click. `npm run build` not run (the owner's `next dev` is live).

### 116. Creating a campaign doesn't build the athlete's order, so most of the order template has nowhere to go [§13, §21, Athlete Campaign Order template]
`POL-BE-116` · `POL-FE-116` · *Dead end* · confirmed · **`POL-BE-116` Done 2026-11-19** (#497) (programme owner, 2026-11-19)
- **The owner's words:**
  - "Make sure it follows this": `documentation/AthleteCampaignReference/BTG_SponsorX_Athlete_Campaign_Order.docx`.
  - "That form is only for a video campaign. Use that form as a base when the campaign is on other media."
  - "Whenever a create campaign is called, we have a page to build it right, include the details of that form as well."
  - Payment timing is set per campaign ("yes"). There is no countersignature by a person: "we focus on automation rules".
- **Problem:** the review of 2026-11-19 found that the legal terms (`CAMPAIGN_ORDER.v2`) match the template, but most of an order's details are never stored:
  - an order number (`SX-…-2026-…`);
  - the prompt, on orders sent from an invitation;
  - the deliverable's format and length;
  - the publish window;
  - usage rights split into channels, period, territory and restrictions (today one line of text);
  - paid media (platforms, duration, territory, extra pay);
  - exclusivity split into category, period and area;
  - disclosure, on orders sent from an invitation;
  - sponsor approval as a yes or no;
  - payment timing, set per campaign;
  - product or non-cash consideration.

  Automatic staffing fills offers with defaults: one standard usage-rights sentence, "#ad", and the package's exclusivity.
- **The shape:** the template is the base for every order.
  - **The same on every order:** the order fields, the terms and the acceptance.
  - **What changes:** the deliverable section, by the job's medium:
    - SX-03 Athlete Reel (the template): videos, length, vertical format, platform;
    - SX-01 Story Drop: frames, platform, link or sticker, how long it stays up;
    - SX-02 Sponsored Post: photo or carousel and how many images, caption, platform, how long it stays up;
    - SX-04 Product Experience: the product, the content format, whether the product is kept;
    - SX-05 Local Appearance: event, date and time, place, hours on site, activities, who films;
    - SX-06 Content Day: shoot date and place, hours, how many finished pieces, who films, whether raw footage is included;
    - SX-07 Monthly Ambassador: months, and the monthly mix of the jobs above.
- **Backend (`POL-BE-116`, rcfworks):**
  - **Storage:** the campaign keeps its order details, filled in when it's created: the prompt, each job with its media details, the publish window, usage, paid media, exclusivity, disclosures, sponsor approval, payment timing and non-cash consideration. A campaign made from a brief carries the brief's.
  - **Carried through:** each offer and Campaign Order copies them, fixed when sent, whether made by automatic staffing or sent from an invitation. Each order gets a number, `SX-<campaign code>-<year>-<sequence>`.
  - **The builder's API:** the job catalogue with each job's media details and defaults, checks on every field, and the campaign's order details in one save.
  - **Automation rules:** an order is issued automatically when every check passes. It is held for BTG, with the reason, when:
    - paid media or exclusivity applies to a minor;
    - the category is sensitive;
    - paid media has no extra pay;
    - exclusivity has no category;
    - a usage period runs past what the athlete's tier allows.
  - **Payment timing:** sets when the athlete's earning is due.
  - **Wording:** new `CAMPAIGN_ORDER.v3` text points to the order's own payment timing, paid media and exclusivity area. New wording is a new file; v2 stays for orders already accepted.
  - **Tests:** every new route and rule, the isolation sweep, and both ways an order is made.
- **Frontend (`POL-FE-116`, HeckerCreatives, waits for `POL-BE-116`):**
  - **The builder:** "Create a campaign" opens a page that builds the whole campaign, step by step. The deliverable section changes with each chosen job's medium, and a summary of every detail appears before saving.
  - **The athlete's order:** shows every detail, laid out like the template, before the athlete or their guardian accepts.
  - **BTG's desk:** shows a held order's reasons.
- **Done when:**
  - Every field in the template, and each medium's own details, is set when a campaign is created and reaches each athlete's order unchanged.
  - Each order has a number.
  - An order is issued automatically, or held with a reason in words.
  - The earning follows the campaign's payment timing.
  - The athlete sees the whole order before accepting.
- **Delivered, backend (`POL-BE-116`, 2026-11-19, rcfworks; Done, deployed to staging and production the same day):**
  - **The details** (`backend/src/domain/order-details-rules.ts`) follow the template, checked in full and refused in words:
    - prompt, publish window, usage (channels, period, territory, restrictions), paid media (kinds, platforms, duration, territory, extra pay), exclusivity (category, days, area), disclosures, sponsor approval, payment timing (days after verified) and non-cash consideration;
    - each job's medium, keyed by the NIL job, SX-01 to SX-07.
  - **On the brief:** `POST /briefs` and `PATCH /briefs/{id}` take `orderDetails` and `orderCode`. The publish window must sit inside the campaign's dates.
  - **On the campaign:** created from the brief (`prepareCampaignDetailsIn`, for all three ways a campaign is made), or BTG's standard terms over the campaign's dates.
    - The code is three letters from the name, the next free one if taken, unique in the tenant for the year.
    - `GET /campaigns/{id}/order-details` gives the details, the code, whether they are the standard terms, and whether they are locked.
    - `PUT /campaigns/{id}/order-details` is BTG's, until the first offer or order goes out (409 after).
  - **The builder:**
    - `GET /campaign-builder/catalogue` lists each job's medium fields, limits and defaults; the channels, platforms and paid-media kinds; and the defaults.
    - `GET /campaign-builder/order-code?name=` suggests a code.
  - **Every order:**
    - The offer draft fills the prompt, deliverables, usage, exclusivity and disclosures from the details. A reel owes one deliverable per video, and each title says what it asks for.
    - An offer carries the details for its job, in its hash only when present, so older offers hash as before.
    - The accepted order and an order sent from an invitation both get `orderNumber` (`SX-<code>-<year>-<n>`, counted in the order's own transaction) and `orderDetails`.
    - `GET /orders/{id}` shows both. Paid media's extra pay rides only where the athlete's compensation does.
  - **Automation rules:**
    - Paid media with no extra pay stops the campaign's automatic staffing, with the reason.
    - A minor, with paid media or exclusivity, is skipped with the reason, and BTG can still offer by hand.
    - A sensitive category is not held again: its brief already waited for a person.
  - **Approval:**
    - "Sponsor approval: yes" stops BTG approving a draft alone; it goes to the sponsor.
    - "No" means BTG's review is the only one and is never skipped.
    - An invited order's drafts are now checked for its disclosures.
  - **Payment timing:** sets `Earning.payBy` when the earning becomes eligible. `readEarning` shows it.
  - **Wording:** `backend/agreements/CAMPAIGN_ORDER.v3.txt`, effective 2026-11-19. It covers the details above, the athlete keeping ownership, paid media's kinds and extra pay, exclusivity's area, and the order's own payment timing (30 days where none is stated). v2 stays for orders already accepted.
  - **Storage:** migration `20261119230000_campaign_order_details`: the new columns, `OrderNumberCounter`, and the checks.
  - **Tests:**
    - `backend/tests/order-details.unit.test.ts` (9);
    - `backend/tests/pol-be-116-campaign-order-details.test.ts` (9, the real API and database);
    - the isolation sweep, and five older tests updated for the new calls and fields.
  - **Checked:** full backend suite 288 files, 4,052 tests; lint and build clean.
  - **Left to `POL-FE-116`:** the builder page, the athlete's order page laid out like the template, and BTG's held reasons. The routes are above.
- **Delivered, frontend (`POL-FE-116`, 2026-11-20, HeckerCreatives):**
  - **The builder** (`/sponsor/campaigns/new`, steps 5 to 9 after item 107's four): the prompt and the jobs from `GET /campaign-builder/catalogue`; a deliverables section per chosen job that changes with its medium, plus the publish window; usage and paid media (kinds, platforms, length, area, extra pay); exclusivity, sponsor approval, payment timing, anything else the athlete receives, and the order code from `GET /campaign-builder/order-code`; then the whole order as a summary with Edit on each part, and "Send to BTG". `orderDetails` and `orderCode` go on the brief.
  - **The athlete's offer and order pages** show the whole order laid out like the template (`components/order-sheet.tsx`, rules in `lib/order-details.ts`): who, the job, the prompt, then the five numbered sections. The order number sits beside an order's title. Offers and orders made before `POL-BE-116` keep the old short terms.
  - **BTG's campaign page** has "The athlete's order": the numbering, whether it is BTG's standard terms and whether it is fixed, the whole order, and a warning when paid media has no extra pay. An order-rules hold reads as a titled list of reasons, for the campaign and for each athlete it skipped.
  - **Files:** `frontend/src/app/(focus)/sponsor/campaigns/new/` (page, loader, actions, `builder.css`), `frontend/src/components/{sponsor-campaign-builder,order-sheet,create-campaign-link}.tsx`, `frontend/src/lib/{campaign-builder,order-details}.ts`, `frontend/tests/campaign-builder.test.ts` (50); the sponsor Dashboard, Campaigns, Requests and Insights pages, the athlete's offer and order pages, BTG's campaign page, `brief-fx.tsx`, `focus-wizard.tsx`, `lib/{order-live,offer-live}.ts`, `lib/help/sponsor.ts`.
  - **Walked** end to end on the local servers: a Sponsor Admin built and sent a campaign (two jobs, Story Drop and Sponsored Post); the brief held every template field (each job's medium details, usage, paid media, `#ad`, publish window, payment timing, order code `WPP`). BTG approved it and made its campaign through the API, the campaign page showed "The athlete's order" numbered `SX-WPP-2026-…`, and an offer was sent to the QA athlete, whose offer page showed the whole order before Accept, at 1280 and 390 wide with no sideways scroll. The walk's briefs, campaign and offer were removed afterwards.
  - **Not built:** BTG can't edit a campaign's order (`PUT /campaigns/{id}/order-details` has no screen); the panel is read-only and the hold text sends BTG to offering by hand in the Matching Studio. A held order-rules campaign was not walked live; its reasons are covered by tests that read the backend's own hold functions.

### 117. Where someone is from is typed, US only, so a Tanzanian athlete can't say where they live and a typo becomes a place [§11, §13, §26, 2S1-BE-12, POL-BE-107]
`POL-BE-117` · `POL-FE-117` · *Confusing* · confirmed · **Done 2026-11-20** (programme owner, 2026-11-20)
- **The owner's words:**
  - "For the countries: East Africa, USA, Tanzania, Uganda — we need this, then add their city and region. We need the updated 2026 list."
  - "Its better if its dropdown that can be selected instead of free text."
  - "Also add a search on the dropdowns."
  - Asked how far: East Africa as a **group of countries**; **every incorporated place** in the US; on **the athlete profile, the sample editor, the team profile and the sponsor's campaign targeting**.
- **Problem:** the athlete wizard and full editor asked for a city as free text and a state as "two letters, like TX"; the team profile's city was free text; the sponsor's request took states as comma-separated codes. Only the US was possible, so an East African athlete had nowhere to say where they live, and a typo ("Austn", "TXX") was stored as a place.
- **The catalogue** (`scripts/places/build-places.mjs` writes it; never edited by hand):
  - **United States:** 50 states + DC; every incorporated place in the US Census Bureau's 2025 gazetteer (19,472). Hawaii has no incorporated places (Honolulu is a city-county), so it lists its 161 Census-designated communities.
  - **East Africa:** Tanzania (31 regions), Uganda (4 regions), Kenya (47 counties), Rwanda (5 provinces), Burundi (the 5 provinces of the 2025 reform), South Sudan (10 states + 3 administrative areas), Ethiopia (14, after the 2023 split), Somalia (18 regions), DR Congo (26 provinces) — 1,365 cities and towns, researched 2026-11 with the sources and doubts for each country in `scripts/places/east-africa.json` (`sources`, `notes`).
  - Codes are ISO 3166-2 where ISO has the unit; where it doesn't yet (Burundi's new provinces, Ethiopia's Central and South Ethiopia, South Sudan's three areas) a two-letter code is made up and marked `"iso": false`.
- **Backend (`POL-BE-117`):**
  - `backend/src/domain/places.ts` reads `backend/places/places.json` and checks **only what a write changes** — a city typed before the list existed never blocks an unrelated edit.
  - **Athlete profile changes** carry `countryCode`. A new country is a move like a new state: the age of majority is worked out again, and a move that would make a minor an adult is held for BTG (POL-BE-02) **with its country and city**, so the record never files a city of one region under another. `GET /athletes/me` returns `countryCode`.
  - **Team profile:** a changed city must be one of its state's places; a state move names its new city. Still US only — see "Not built".
  - **Briefs:** an East African brief may narrow to that country's regions, each checked against the list; elsewhere outside the US the brief still covers the whole country (POL-BE-107). Region codes are 1–3 letters or digits (`RegionCode`).
  - Refusals are 400 `unknown_place`, in words: "Choose your city from the list for Texas, United States."
- **Frontend (`POL-FE-117`):**
  - `SearchSelect` (`components/filter-kit.tsx`): a dropdown with a search box, group headings, ↑ ↓ Home End Enter Esc, and "Showing 200 of 1,221 — type to narrow" on long lists. Nothing can be typed that isn't a choice.
  - `PlacePicker` (`components/place-picker.tsx`): Country (United States · East Africa) → the country's own word for its regions (State, Region, County, Province) → the region's cities, fetched when the region is picked (`/places/CC-RC.json`; the bundle carries only countries and regions, 20 KB). A city on file that isn't on the list is kept and marked "not on the list" until the person picks another.
  - Used on: the athlete profile wizard, the full profile editor, the sample profile editor, the team profile (State → City), the campaign builder (a searchable Country listing every East African country, "no athletes yet" where none is; each country's own regions as chips) and a sponsor's request edit (regions picked as chips, not typed codes).
  - **The public brief (`/brief`), added the same day** (owner: "the /brief page still in free text"): the Where step's "City or region" box is now Country → State or region → City (optional). The three picks are kept as answers and `market` is written from them ("Takoma Park, MD", "Maryland", "Kampala, Uganda"), so the body sent to `POST /public/inquiries` keeps its shape. A draft saved with a typed market reopens on the Where step to pick it. Walked at 1280 and 390 (Uganda → Central → Kampala), not sent.
- **Tests:** `backend/tests/pol-be-117-places.test.ts` (13: the catalogue, `checkPlace`, East African brief regions, and through the API an unrelated edit past a legacy city, refusals in words, an adult's move to Dar es Salaam, a minor's held move applied whole) and `frontend/tests/pol-fe-117-places.test.ts` (front and back are one list, every city file there, the dropdowns, the wizard and request rules). Updated where behaviour deliberately changed: `phase2-profile-edits`, `pol-be-104-property-profile`, `profile-wizard`, `brief-actions`, `campaign-builder`.
- **Walked** on the local servers as the QA athlete, desktop 1280 and phone 390: grouped countries, "tan" → Tanzania, Region → Dar es Salaam, "kig" → Kigamboni, the live preview reading "Dar es Salaam, Tanzania", Texas's 1,221 places with the narrow note, Esc closes only the list; no horizontal scroll, no page errors. Nothing saved.
- **Not built / for BTG:**
  - **A team outside the US.** A team's state decides its US legal documents (`requiredDocuments`), so a Tanzanian team needs BTG to say what it files first. The team profile stays US: State → City.
  - **Ages of majority for East Africa.** None of the nine countries is in the age table, so an athlete there counts as 18 and is flagged for BTG (`majorityKnown` false), as designed for any place not in the table. BTG adds the countries' ages on the sign-up rules page.
  - **Silver Spring, Bethesda, Columbia (MD), Arlington (VA)** and other large unincorporated communities aren't incorporated places, so they aren't on the US list. Adding the Census-designated places (~12,500 more) is a one-line change to the generator if wanted.
  - Other typed places remain: the athlete application at /join (US two-letter state), a reward's venue, the NEXT apply flow. Out of this item's scope.
- **Follow-up, same day — two screens still on the old lists** (owner: "why the hell is this still using the old dropdown"; "we need to make the age of majority page align with the countries, regions, and city that we listed earlier"):
  - **The sponsor shop’s filter** (`components/sponsor-shop/shop-window.tsx`) was the US-only State list. It is now `PlacePicker` in a new `filter` mode ("Any country / Any state / Any city" first in each list), one chip in words ("In Takoma Park, MD", "In Tanzania"). `GET /marketplace/search` takes `countryCode` and `city`, and `stateCode` is 1–3 characters (some East African region codes are one letter). A team’s listing is where the team is (US); an independent athlete’s is where the athlete lives. An old `?stateCode=MD` link is a US state.
  - **The age-of-majority board** (`/admin/new-signups/rules`: `lib/age-table.ts`, `rules-board.tsx`, `place-dialog.tsx`) listed only places with a row, from a list of every country in the world. Its rail is now the place list (United States · East Africa, the pickers’ order); every region has a card — its own row, or a dashed card for the age it follows — with its city count (a city has no age of its own, it follows its region); a country nobody has set says **No age set** and offers "Set …’s age"; "Add a place" offers only places on the list, under each country’s own word for its regions. The API refuses a *new* row off the list (`setAgeRow`, 422 in words); rows from before the list (Canada, Puerto Rico, …) still apply to anyone who signed up there, so they are gathered under one **Not on the place list** entry, where they can be changed or removed. The East African ages themselves are still BTG’s to set.

### 118. A sponsor who sends a brief and signs in is bounced to the landing page, then told to apply [§9.2, §26, 2S1-BE-17, P2-INT-01]
`POL-BE-118` · `POL-FE-118` · *Dead end* · confirmed · **Done 2026-11-20** (programme owner, 2026-11-20)
- **The owner's words:** "this is super misleading, after I register in brief, I tried to login the first time then it kick me back to the landing page this is a bug, then for the second time i go to login page its show that now" — the page: "Your account isn't set up yet … this address doesn't have a SponsorX account yet. Athletes, sponsors and teams or venues get one by applying on Get started."
- **Problem, two parts:**
  - **The bounce.** The sign-in widget sent sign-*ins* to `/portal` (`forceRedirectUrl`) but nothing set where a sign-*up* goes. Someone new — a sponsor fresh from the brief, most likely through "Continue with Google", which Clerk turns into a sign-up for an unknown address — landed on Clerk's default, `/`: the landing page, as if nothing had happened.
  - **The page.** A sponsor's login is opened only when the request is approved (2S1-BE-17: email confirmed, proof uploaded, checks pass). Before that, `/portal` said the address has no account and told them to apply — about a request they had just sent. An athlete applicant signing in early read the same.
- **Backend (`POL-BE-118`):**
  - `resolveActor` (auth/actor.ts), finding no login for the verified address, asks `pendingApplicationFor` (domain/pending-application.ts) what it applied for.
  - **A sponsor request:** signing in with the request's own address proves the mailbox exactly as the emailed confirmation link does, so it confirms the email (audited `sponsorRequest.emailConfirmed`, `via: signIn`) and runs the automatic checks. A request that is otherwise complete is approved there and then, and this same sign-in claims the new login — straight into the sponsor portal.
  - Otherwise the 403 `unprovisioned` carries `pending`: the business, its state, what is still missing in words, whether BTG is reviewing it, and the request's status page (`/sponsor-request/<token>`, a fresh token, as the confirmation link gives).
  - **An athlete application** (DRAFT, SUBMITTED, UNDER_REVIEW, CHANGES_REQUESTED, REJECTED) is reported with its state.
- **Frontend (`POL-FE-118`):**
  - `/login`: `signUpForceRedirectUrl="/portal"` on the widget, and `signInFallbackRedirectUrl` / `signUpFallbackRedirectUrl` on the provider, so no sign-in or sign-up ends on `/`.
  - `/portal` (words in `lib/pending-words.ts`): "Your sponsor request is almost ready — your request for <business> is in, and signing in has confirmed your email. Your account opens as soon as you: • Upload your proof of business." with that button; "BTG is checking your sponsor request" when it's all in; declined and closed said plainly; an athlete told where the application stands with a link to it. Only an address that applied for nothing reads the old refusal, now ending "Applied with a different address? Sign out and sign in with that one."
- **Tests:** `backend/tests/pol-be-118-sign-in-before-approval.test.ts` (a brief without proof: sign-in confirms the email and the refusal says what's left; its status link takes the proof and the next sign-in is the sponsor; a complete brief opens and is claimed by the sign-in itself; an athlete applicant; an address with nothing) and `frontend/tests/pol-fe-118-pending-words.test.ts`.
- **Walked** on the local servers with a throwaway Clerk user: brief sent through the API, first sign-in → `/portal` "Your sponsor request is almost ready" with the upload button, which opens the request page; phone width without overflow. The Google sign-up path can't be scripted; the redirect is set for it. The walk's Clerk user, brief and queued jobs were deleted.
- **Not built:** a login BTG switched off (`account_disabled`) still shows the generic page on `/portal`; its API message is right, the page doesn't read it yet.

### 119. Nobody is told the transaction fee, who pays it or the processing cost before accepting a campaign or order [§13, §19, §21, partnership agreement "Platform access and service orders"]
`POL-BE-119` · `POL-BE-120` · `POL-FE-119` · *Trust* · confirmed · **`POL-BE-119`, `POL-BE-120` Done 2026-11-21** (#511, #512; promoted #513; deployed, release a85b4935) (programme owner, 2026-11-21)
- **The agreement (Rodney, raised by the programme owner 2026-11-21):** "SponsorX onboarding and Partnership access carry no upfront or monthly access fee. Before campaign acceptance, disclose the applicable transaction fee, fee payer and processing costs in writing. If a fee applies, identify it in the signed campaign order. Any change requires written acceptance before it applies to that order." The owner's emphasis: "BEFORE CAMPAIGN ACCEPTANCE, DISCLOSE THE APPLICABLE TRANSACTION FEE, FEE PAYER AND PROCESSING COST IN WRITING."
- **Problem:**
  - **Athletes** (Campaign Order, Offer) read only "your compensation is not reduced by BTG's fee": no fee, payer or processing named.
  - **Sellers** (marketplace order, Deal Chat) are told nothing on the order; the property terms they signed at sign-up fix 15% / 5% / 2.9% + 30¢ / 2% / 10%, while the app charges whatever the Commission page says.
  - **Sponsors** see a buyer fee when placing a marketplace order, not processing or who pays it. On a managed campaign they never accept a price inside SponsorX at all.
  - **Rates move after acceptance:** a marketplace order's rates are looked up when BTG approves it, after the seller accepted, so a rate changed in between reaches the seller unseen.
- **Owner decisions (2026-11-21):**
  - The athlete's statement on a managed campaign reads: transaction fee none deducted from you; fee payer the sponsor, included in the sponsor's price; processing none to you.
  - The sponsor gets a step to confirm a managed campaign's price, with its fee statement, before launch: once it is fully staffed (APPROVAL) and the price is known. At creation only the brief's budget exists.
- **Backend (`POL-BE-119`), built:**
  - **The statement** (`domain/fee-statement-rules.ts`, pure; `domain/fee-statement.ts`): each fee's name, rate, fixed amount, amount and payer; processing's rate, fixed amount, amount and payer; for a seller, the reserve held and what they receive; for a sponsor, what they pay; and the same in plain sentences (`text`). Fees that come to nothing are left out, and the words say no other applies. Its hash is `sha256:` over the statement with sorted keys.
  - **Rates frozen at placement:** the commission rates an order carries are resolved when the sponsor places it and kept on `MarketplaceOrder.feeTerms` (write-once, `marketplace_order_immutable.sql`). Every statement about the order and the ledger's booking use them. An order placed before this has its rates frozen the first time a statement is shown (audited `marketplaceOrder.feeTermsFrozen`).
  - **The six acceptances:**
    - The athlete's **Campaign Order** (`POST /orders/{id}/accept`) and **Offer** (`POST /offers/{id}/respond`, ACCEPT): no fee deducted, the sponsor pays it in the sponsor's price, no processing. Kept on `CampaignOrder.feeStatement` and the offer's terms snapshot.
    - The seller **submitting or resuming a listing** (`POST /listings/{id}/submit`, `/transition` to PUBLISHED), or **accepting a live listing's fees** without pausing it (`POST /listings/{id}/accept-fees`, for a listing submitted before statements or whose rates changed): an order of one at the listing's price, at today's rates. Kept on `Listing.feeAcceptance` with the rates.
    - The seller **accepting an order** (`POST /seller-approvals/{id}/decision`): their lines under the order's frozen rates. Kept on `OrderSellerApproval.feeStatement`.
    - The sponsor **placing a marketplace order** (`POST /marketplace-orders`): the buyer fee is theirs; the other fees and processing are the seller's, out of the sale. Kept in `feeTerms.sponsor`.
    - The **Deal Chat agreement**: both sides' statements on the agreed amount, written into the text (DEAL v2 `{{fees}}`), so the existing body hash covers them. Kept on `DealAgreement.feeStatements`. The buyer fee after signing uses the frozen rate, not today's setting.
    - The sponsor **confirming a managed campaign's price** (`GET /campaigns/{id}/price`, `POST /campaigns/{id}/price/confirm`): the signed orders' sell prices; no fee added (BTG's fee is in the price); no processing; BTG invoices it. Sponsor admins only, in APPROVAL. Kept on `Campaign.priceConfirmation`, audited `campaign.priceConfirm`.
  - **A change needs written acceptance:** an order whose frozen rates differ from those its seller accepted for the listing (a rule changed since, a rule for this sponsor, a listing submitted before statements) asks that seller to accept it with its own statement first. A campaign whose price changed after the sponsor confirmed it waits for a new confirmation.
  - **Sellers told when rates change** (owner, 2026-11-21):
    - **When:** each time a commission rule is created or revised (`notify.feeRatesChanged`), and daily from the worker.
    - **What:** every live listing is priced at the moment the change takes effect and compared with the rates its seller accepted.
    - **Who:** each seller with listings that differ gets one `listing.feeRatesChanged` email naming them, and is never emailed twice for the same set.
    - **Why it matters:** until the seller accepts again (`POST /listings/{id}/accept-fees`), each order on those listings asks them first.
  - **The switch `FEE_STATEMENT_REQUIRED`** (documentation/SponsorX-Switches.md), off until the screens show the statement. On: every acceptance must echo the hash (409 `fee_statement_required`). An out-of-date one is always refused (409 `fee_statement_changed`, with the current `feeStatement` and `feeStatementHash` in the error). A managed campaign can't launch until its price is confirmed: the automatic launch waits, and BTG's is refused (409 `price_not_confirmed`). The sponsor's admins are emailed when the campaign reaches APPROVAL (`campaign.confirmPrice`). Off: acceptances record the statement with `shown: false`; the confirm step itself always requires the hash.
- **Existing sellers accept the new seller terms (`POL-BE-120`; owner, 2026-11-21: "yes, ask them"):**
  - Seller terms were only ever accepted at onboarding, so `PROPERTY_TERMS.v3` would never have reached a team already selling.
  - `GET /seller-terms` gives a team's manager the version in force, with its text and hash, and whether the team has accepted it.
  - `POST /seller-terms/accept` records the acceptance on the team's onboarding, with the IP and browser, and audits it.
  - With the switch on, a team on an older version can't list, resume, accept a listing's fees, accept an order or sign a Deal agreement as the seller (409 `seller_terms_required`).
  - An athlete selling their own items signs no seller terms today.
- **Agreements (`POL-BE-120`), built:** `CAMPAIGN_ORDER.v4`, `DEAL.v2`, `MARKETPLACE_ORDER.v3`, `PROPERTY_TERMS.v3` in `backend/agreements/`. Each says access is free (no upfront or monthly access fee), makes the fee statement shown before acceptance part of the order, and requires written acceptance for any change to a fee, its payer or the processing cost. `PROPERTY_TERMS.v3` drops the fixed 15% / 5% / 2.9% + 30¢ / 2% / 10% and the rate change on 30 days' notice; the fees are those disclosed on each order. Orders already accepted keep their version.
- **Tests:**
  - `backend/tests/pol-be-119-fee-statement.test.ts`: the words and figures for each side; the seller's sums equal what the ledger books; the hash; the check.
  - `backend/tests/pol-be-119-fee-disclosure.test.ts`, over the API and database:
    - checkout's statement; placing with another hash, or none once required, is refused;
    - a rule revised after placement never reaches the order: the seller is shown, accepts, and is booked at 15%, not 20%;
    - the frozen terms can't be rewritten;
    - a listing submitted with its statement isn't asked again.
  - `backend/tests/auto-staffing-launch.test.ts` (POL-BE-119 block):
    - the athlete's Offer and a BTG-sent Campaign Order, each accepted by its hash;
    - the unconfirmed campaign holds on its start date, and BTG's launch is refused;
    - the sponsor confirms, and nobody else can;
    - a price changed after confirming waits for a new confirmation, then launches.
  - `deal-agreement.test.ts`: DEAL v2 and its fee section.
  - `tenant-isolation.test.ts`: the confirm route, for every other tenant and role.
- **Frontend (`POL-FE-119`, HeckerCreatives):**
  - **Where:** a fee box above Accept or Sign on every acceptance screen, from the read the screen already makes: `GET /orders/{id}`, `GET /offers/{id}`, `GET /listings/{id}` (the seller), `GET /seller-approvals/{id}`, `GET /reservations/{id}` → `checkout`, and the Deal Chat agreement's text.
  - **What to show:** `feeStatement.text`, one line each, or the figures in `fees` / `processing`.
  - **Accepting:** send back `feeStatementHash` with the accept. On 409 `fee_statement_changed`, show the `feeStatement` in the error and ask again.
  - **The sponsor's confirm screen** on their campaign page, while `GET /campaigns/{id}/price` says `canConfirm`. If `confirmed.current` is false, the price changed: confirm again.
  - **A team's "new seller terms" screen:** when `GET /seller-terms` says `upToDate: false`, show the text with a tick box, then `POST /seller-terms/accept` with `agreement.id` and `agreement.bodyHash`. Show it again on 409 `seller_terms_required`.
  - **A seller's live listing:** an "Accept the fees" action (`POST /listings/{id}/accept-fees`) when `GET /listings/{id}` shows `feeAccepted` empty, or its hash differs from `feeStatementHash` (the rates changed). Without it, each order on that listing asks the seller first.
  - **The PDF:** the same box in the signed order's PDF.
  - **Then:** turn `FEE_STATEMENT_REQUIRED` on, staging first.
