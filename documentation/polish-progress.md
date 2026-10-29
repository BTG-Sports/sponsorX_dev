# SponsorX — Polish progress

What has been finished from the polish list ([polish.md](polish.md)), and how
each problem we ran into was solved. Newest first within each day.

| Item | Task | PR | Status |
|---|---|---|---|
| 4 · Orders cancelled for "not paying" while payment is off | `POL-BE-04` | #317 | Merged |
| 1 · Payouts kept going to the old guardian | `POL-BE-01` | #319 | Merged |
| 2 · A minor could make themselves an adult | `POL-BE-02` | #321 | In review |
| 3 · A team could raise its share to 100% without asking | `POL-BE-03` | #322 | Merged |
| 36 · Payments on/off switch in BTG admin | `POL-BE-36` / `POL-FE-36` | #315 | Added to the list |

The frontend halves (`POL-FE-04`, `POL-FE-01`, `POL-FE-02`, `POL-FE-03`) are for
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

### How each task was run
- A plan was agreed first, with the open decisions put as questions.
- One branch per task.
- Every CI step was run locally before pushing.
- The PR went to `main_development`, then a sync PR to `main`, keeping the
  two level.
- Each task ended with the tracker row, `polish.md` notes for the frontend,
  and the `Memory/` log.
