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

### 5. Sponsors agree to the order terms before seeing the total
`POL-BE-05` · `POL-FE-05` · *Money · Consent* · confirmed

Checkout shows "Fees: added when the order is placed" and a "Total so far" that
leaves the fees out. The real total appears only after the sponsor has committed.

- **Where:** `frontend/src/app/(app)/sponsor/checkout/page.tsx`, `…/cart/page.tsx`.
- **Fix:** the API returns a quote with fees before the order is placed, and
  checkout shows the full total next to the button that commits. If the API
  already has the quote, this needs front-end work only.
- **Done when:** the total shown before placing equals the total charged; tests.

### 6. A sponsor who pays twice gets no refund
`POL-BE-06` · `POL-FE-06` · *Money · Silent* · likely

BTG gets an email that a refund is needed. The order page shows no duplicate
payment and has no refund button, and nothing is added to "Refunds to send".

- **Where:** `backend/src/domain/payouts.ts` (duplicate payment, around lines 446–455).
- **Fix:** a duplicate payment creates a refund to send and flags the order.
  The order page shows it, and BTG can mark it refunded.
- **Done when:** a duplicate shows on the order and in "Refunds to send"; tests.

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

## Checked and fine

- marketplace order tracking;
- the 24-hour delivery deadline;
- the fan page on mobile;
- a paused or ended reward;
- every link sent in emails;
- sample data, which only shows to visitors or in demo mode, clearly labelled.
