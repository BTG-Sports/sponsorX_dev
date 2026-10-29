# SponsorX — Polish progress

What has been finished from the polish list ([polish.md](polish.md)), and how
each problem we ran into was solved. Newest first within each day.

| Item | Task | PR | Status |
|---|---|---|---|
| 4 · Orders cancelled for "not paying" while payment is off | `POL-BE-04` | #317 | Merged |
| 1 · Payouts kept going to the old guardian | `POL-BE-01` | #319 | Merged |
| 2 · A minor could make themselves an adult | `POL-BE-02` | #321 | Merged |
| 3 · A team could raise its share to 100% without asking | `POL-BE-03` | #322 | Merged |
| 5 · Sponsors agreed to the terms before seeing the total | `POL-BE-05` | #324 | Merged |
| 6 · A sponsor who paid twice got no refund | `POL-BE-06` | #325 | Merged |
| 7 · Anyone holding the fan's phone could use up their reward | `POL-BE-07` | #328 | Merged |
| 8 · Only the first fan could claim a shared QR code | `POL-BE-08` | #329 | Merged |
| 9 · A minor's invitations never reached the guardian | `POL-BE-09` | #331 | Merged |
| 10 · A guardian handoff could wait forever | `POL-BE-10` | #333 | Merged |
| 11 · Closing an account ignored live deals | `POL-BE-11` | #335 | Merged |
| 12 · Payouts held for review were silent | `POL-BE-12` | #336 | Merged |
| 14 · Held make-goods reached no one | `POL-BE-14` | — | In review |
| 36 · Payments on/off switch in BTG admin | `POL-BE-36` / `POL-FE-36` | #315 | Added to the list |

The frontend halves (`POL-FE-04`, `POL-FE-01`, `POL-FE-02`, `POL-FE-03`, `POL-FE-05`, `POL-FE-06`, `POL-FE-07`, `POL-FE-08`, `POL-FE-10`, `POL-FE-11`, `POL-FE-12`) are for
HeckerCreatives. Each item in `polish.md` says exactly what the screens can
rely on.

---

## 2026-10-28

### Setting up the polish list
- **Problem:** the testers found individual flaws (a blurry ID, no way to
  cancel a campaign), with no wider view of the experience.
- **Approach:**
  - Three reviewers walked SponsorX as each kind of user would. Every
    serious finding was checked in the code before it went on the list.
  - 35 items, grouped by harm: money, minors and consent first.
  - Saved as `polish.md`, plus a **Polish** sheet on the task board, with
    split BE/FE rows and a Dashboard count.
  - Made the top priority, ahead of other board work.

### Stripe live key: ready, but payments kept off
- **Problem:** Stripe was ready, but payments must stay off until the polish
  is done. The Stripe command-line tool is disabled on BTG's account.
- **Approach:**
  - Checked the live account with a **read-only key** instead of guessing:
    card payments and payouts are enabled.
  - Created a **restricted production key**. The first draft had 44
    permissions; it was trimmed to the ones the code uses.
  - Stripe bundles BTG's own payouts with a permission we need, so that
    can't be removed. It can only pay BTG's own verified bank.
  - Created the three live webhooks **through the API**, using a temporary
    key that was then deleted.
  - The first run lost two secrets (Stripe shows them only once). Those two
    webhooks were deleted and recreated, saving each secret immediately.
  - The payout-accounts webhook's secret can't be read through the API, so
    it was copied from the dashboard.
  - Installed on Railway production with `PAYMENT_PROVIDER=none`. Production
    restarted healthy.
  - Our own safety checks stopped us twice: once from reading production
    secrets, and once from trying a $1 payout. Both were respected; we used a
    read-only test instead.
  - Today the switch is the Railway setting. A BTG admin switch
    (`POL-BE-36`) was added to the list.
- **Corrected:** our 2026-10-23 log had BTG's live account down as a spare
  sandbox. It is fixed.

### `POL-BE-04` — orders held, not cancelled, while payment is off
- **Problem:** with payments off, approved orders still got "pay by"
  reminders and were cancelled on day 3, even though the pay button was
  greyed out.
- **Approach:**
  - One function, `paymentsOpen()`, decides whether payment is open. The
    admin switch will plug into it later.
  - While closed:
    - orders wait with no deadline;
    - the approval email says the order is held;
    - the sweep neither reminds nor cancels;
    - a countdown already running is paused.
  - When payment opens, every held order gets a **fresh three days** and one
    "payment is open" email.
  - Reminders count from when the window opened, so orders approved while
    payment is open behave exactly as before.
- **Snags:**
  - A test's sweep also opened another test's order. Fixed by setting that
    order's state directly.
  - The end-to-end suite can't run on this Mac (it needs Redis and the
    Clerk test secrets), so it is verified in CI.
  - A CI run failed on Google Fonts. It was the known flake, and a re-run
    passed.

### `POL-BE-01` — the payout account follows whoever is responsible
- **Problem:** an athlete's payout account is the Stripe account of the
  person who set it up. After a handoff or coming of age, payouts still went
  to the old guardian, and SponsorX had **no way** to switch accounts.
- **Conflict found:** a 2026-10-01 rule said "money already earned stays
  with the account it was earned under". The code couldn't honour that,
  because there is only one account per athlete.
- **Decision** (with Rodney's authority): everything not yet paid out
  follows the athlete to the new holder. The Phase 2 doc, the module
  comments and the emails were updated.
- **Approach:**
  - At the switch, inside the same transaction, the account is
    **detached**. Nothing is deleted at Stripe.
  - Waiting payouts hold. The new holder's "Set up payouts" opens a new
    account in their own name, and the waiting payouts go to it.
- **Hidden problems found and fixed:**
  - Opening a new Stripe account reset the "account just changed" marker.
    That would have skipped BTG's check on a new account's first payouts.
    The marker is now kept.
  - News from Stripe about the old account would have been retried
    forever. It is now recognised, from the audit trail, and ignored.
- **Left for HeckerCreatives:** the setup prompt, and handoff-card wording
  that still states the old rule.

### `POL-BE-02` — a minor can't make themselves an adult
- **Problem:**
  - A minor's own edit to their date of birth, or a move, applied at once
    and started coming of age.
  - The takeover then happened whatever the ID check found.
- **Decisions** (with Rodney's authority):
  - BTG alone approves a change that would make a minor an adult, and the
    guardian is told.
  - The takeover is automatic only when the ID reads clear.
- **Approach:**
  - The age-changing fields are split off into a **held** profile change.
    BTG decides it on the existing decision button built for held legal
    names. The rest of the edit applies.
  - A takeover with an unclear ID is held:
    - the guardian keeps control;
    - the 90-day deadline can't expire;
    - BTG confirms (a new button) or sends the ID back, which ends the hold.
- **Snags caught:**
  - A minor asking to be an adult could have named a guardian in the same
    edit. The guardian rule now checks the age asked for.
  - A new legal-name request would have withdrawn a held date-of-birth
    change. It now only replaces earlier legal names.
  - BTG's email said "It is live now", even for held changes, held legal
    names included. It now says when a change is waiting.
  - An older test still expected the old "starts at once" behaviour. It was
    updated to the new rule.

## 2026-10-29

### `POL-BE-03` — a team's share goes up only with the athlete's yes
- **Problem:** a team could raise its share of any athlete it added
  directly, minors included, with one click and without telling them. Only
  invited athletes were protected.
- **Loophole found while planning:** the share typed at "Add athlete" was
  never agreed either, so a team could add a minor at 100% from the start.
- **Decision** (with Rodney's authority): that first share needs a yes too.
  Until then BTG's standard team share applies.
- **Approach:**
  - Anything that can raise the share becomes a **request** the athlete
    answers, stored in a new small table: a raise, a clear back to BTG's
    standard share, and the first share. It was modelled on the team
    invitation, which already asked an athlete to accept a share.
  - Lowering applies at once.
  - For a minor, only the guardian can accept, using the same check as
    joining a team. The minor's own "accept" is refused.
  - A yes counts only while the athlete is still on that team, at the share
    the request was made from. Leaving the team ends the request.
- **Snags:**
  - About ten older money tests had added an athlete at 20% and expected
    that split at once. They now record the athlete's yes first, through a
    small test helper, so they still test the money, not the asking.
  - One payout test passed in the first full run and then failed alone. It
    turned out to depend on the 20% split too, and was fixed the same way.
  - The temporary folders were cleared overnight, so the portable test
    database was downloaded and set up again.

### `POL-BE-05` — the sponsor sees the total, fees included, before placing
- **Problem:** checkout showed "Fees: added when the order is placed". The
  real total appeared only after the sponsor had committed.
- **Approach:**
  - The cart, the held checkout and placing the order all work out the
    total the same way, so the quote is exactly what is charged.
  - Each now carries a quote: subtotal, fees and total.
  - The screen can send the total it showed. If it has changed, the order
    is not placed and the sponsor is told the new total.
- **Snag:** a test read the cart in the wrong shape, and carts left by
  earlier tests got in the way. Both fixed in the test.

### `POL-BE-06` — a sponsor who pays twice is refunded
- **Problem:** a card payment for an order already paid, or already
  refunded, only emailed BTG. Nothing showed on the order or on "Refunds to
  send".
- **Approach:**
  - Each such payment is a refund row of its own ("paid twice", "paid after
    the order was refunded"), the same way a payment after a cancellation
    already worked.
  - Stripe refunds it automatically. With payments off it waits for
    Finance, and BTG is emailed with a link to the list.
- **Trap found while planning:** the code that works out what is still owed
  on an order added up every refund on it. An extra payment's refund would
  have made a later refund of the order come out short. Those sums now count
  only refunds of the order's own money. One more such place was found while
  building: a refund made in Stripe would have been held for BTG.
- **Dropped from the plan:** changing the "refunds sent" report figure. It
  records money actually sent back, so these refunds belong in it.
- **Snags:** a step that put back a test change also undid real edits, and
  they were restored. Another PR's log entry clashed with this one; both
  were kept.

### `POL-BE-07` — staff redeem needs the booth's code, and can be undone
- **Problem:** "Staff: redeem now" used a fan's reward up with one tap, by
  anyone holding the phone, and it couldn't be undone.
- **Decision** (the user): the code requirement goes live behind a switch,
  off until the fan page asks for the code, so no event is ever left unable
  to redeem.
- **Approach:**
  - Each reward has a six-digit staff code, seen and replaced only by BTG and
    the sponsor's admins.
  - Five wrong codes lock that fan's code for 15 minutes.
  - Undo within 5 minutes removes the redeem, so every count stays right, and
    is recorded.
- **Also asked for:** one document listing every switch,
  `SponsorX-Switches.md`, now linked from `CLAUDE.md`.
- **Snags:** a read test mocked the database, so the code is read with the
  reward rather than separately. Another PR's log entry clashed; both kept.

### `POL-BE-08` — each fan who scans a shared code gets their own claim
- **Problem:** an athlete's QR is shown to many fans, but it was treated as
  one fan's code. Later fans saw the first fan's hold, and on a one-use
  reward the QR worked once for everyone.
- **Approach:**
  - Claiming through a shared QR makes the fan a code of their own, where the
    claim, hold, email and redeem happen. Everything already built for one
    code (holds, limits, the staff code, undo) works on it unchanged.
  - The same address gets its code back.
  - The shared QR can't be redeemed itself.
  - Reports already counted through the reward and the athlete, so they
    needed no change. The desk adds each fan's code to its QR's counts.
  - Behind a switch, `REWARD_FAN_CODES`, as with `POL-BE-07`.
- **Snag:** a test used an address with a trailing space, which the API
  rightly refuses.

### `POL-BE-09` — a minor's invitations reach the guardian
- **Problem:** only the guardian can accept a minor's invitation, but all
  three emails (new, reminder, expiring) went to the minor alone. The deal
  quietly expired.
- **Approach:**
  - One rule decides who is emailed, the same one that decides who may
    accept. The guardian gets each email, worded as the person who decides,
    and the minor gets a copy saying so.
  - The hourly sweep used to write the reminder and warning in one SQL
    statement. It now picks the invitations in SQL and applies the rule to
    each, so the new email and the sweep can't drift apart.
- **Snag:** the new test loaded the app's settings without the placeholder
  login keys the other database tests set; added.

### `POL-BE-10` — a guardian handoff never waits forever
- **Problem:** a request to change a minor's guardian waited for the current
  guardian with no reminder and no end, and BTG couldn't step in.
- **Approach:**
  - An hourly check reminds the current guardian at 3 days and hands the
    request to BTG at 7, telling everyone.
  - BTG decides with the existing confirm and decline buttons, which now
    also accept an escalated request.
  - The current guardian keeps the right to answer. The request is locked
    while an answer is saved, so the first answer wins and a second is
    refused.
  - The switch emails say "BTG confirmed it" when the guardian never
    answered.
- **Snag:** a test expected a blank reason to be refused by the decline
  rule (422), but the request check already refuses it (400). The test was
  corrected.

### `POL-BE-11` — closing an account leaves no live deal behind
- **Problem:**
  - Closing switched an account off whatever was open: signed deals and due
    work stayed open, and nobody was told.
  - A minor could close their own account.
  - The money it had earned waited on a login that no longer worked.
- **Decisions** (the user): money with no payout account holds the
  closure, and so does a guardian still acting for a minor.
- **Approach:**
  - One read works out what closing would affect: live deals, open
    invitations, money and minors in the person's care. The closing screen
    can show it first.
  - Anything left behind holds the closure for BTG. The account stays open,
    and the sponsors on the deals are told. BTG closes it once nothing is
    left, or declines.
  - A minor's account is closed by the guardian.
  - Closing declines open invitations and requests the earned money as the
    system, at once and hourly after.
- **Snags:**
  - A roster athlete's account lives in the team's tenant, but BTG works
    from the tenant above it. The first test run showed BTG wasn't told and
    couldn't see the request. The request is now filed with BTG, and the
    closing happens in the account's own tenant.
  - A guardian's login acts for their one child by default, so their own
    closure must name the guardian account.

### `POL-BE-12` — a payout held for review reaches BTG
- **Problem:** a payout the automatic approval didn't pass told the payee
  "BTG reviews it next", but BTG got no email and the board didn't count it.
- **Approach:**
  - Every held payout emails Finance and BTG's admins with the reasons.
    Failed payouts handed to BTG now reach Finance too, so both routes reach
    the same people.
  - BTG's board counts payouts waiting for BTG, with the oldest.
- **Snags:**
  - The payout code had been moved into its own function for `POL-BE-11`,
    so the first edit didn't match its new indentation. Nothing was written,
    and it was redone.
  - The board test expected exactly the old four queues. It now seeds
    payouts in one tenant and checks the other never sees them.

### `POL-BE-14` — a held make-good reaches its approvers
- **Problem:** when a campaign under-delivered, its replacement inventory
  (the make-good) was held for BTG with no email and no count, so the
  campaign kept under-delivering.
- **Approach:**
  - The nightly run emails the make-good's approvers when it holds one. The
    email's key is the make-good and the person, so the nightly refresh
    never sends a second.
  - BTG's board counts open make-goods, as it does held payouts
    (`POL-BE-12`).
- **Snag:** a first draft of the test used a helper that doesn't exist, and
  a check that proved nothing. Both were replaced with checks against each
  make-good's own id.

### How each task was run
- A plan was agreed first, with the open decisions put as questions.
- One branch per task.
- Every CI step was run locally before pushing.
- The PR went to `main_development`, then a sync PR to `main`, keeping the
  two level.
- Each task ended with the tracker row, `polish.md` notes for the frontend,
  and the `Memory/` log.
