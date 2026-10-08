# 2026-10-08

- **P2-OPS-07 · Done in the tracker, committed** (`8d38c2c`, pushed to `development/bob/be_batch_0924`). main_development had nothing new to pull.
- **P2-OPS-11 is live on staging, not yet on production.** Staging's `/api/v1/public/health` shows `checks.queue` and `traffic`; `sponsorx.net` doesn't. The row stays in Code review until a production release.
- **Staging test noise:**
  - Failed `notify.email` jobs: none left. The health check reports 0 failed jobs in 24 h; the 196 from 2026-10-06 have aged out.
  - Failed payment events: **56** open (not 59), all Stripe sandbox events from 2026-10-06 that matched nothing: 39 `account.updated`, 9 `payment.refunded`, 3 `payment.failed`, 3 `dispute.opened`, 2 `payout.paid`. **All 56 resolved** over `railway ssh --environment staging`, in one transaction, the same way `resolvePaymentEvent` does it: `resolvedAt`, `resolvedBy` = "rcfworks (staging cleanup)", a note naming the sandbox tests and fix 7105256, and one `paymentEvent.resolve` audit row each (56). No refund was held for these, so the refund-dismiss step had nothing to do. Afterwards no HELD or FAILED event is open on staging, and none has arrived since the fix went out on 2026-10-07.
  - Permissions: the owner added the allow rule `Bash(railway ssh --environment staging:*)` in local settings. It is limited to staging; production commands still ask.
