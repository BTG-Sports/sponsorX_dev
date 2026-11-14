# 2026-11-14

## POL-BE-41: support inbox backend (rcfworks)

- **Checked first.** On main_development only the group G plan existed (PRs #386, #387). None of POL-BE/FE-41 to 43 had been built.
- **Built** on `feat/POL-BE-41-support-inbox`:
  - migration `20261114120000_support_inbox`: a status on each support message (New, Answered, Closed) and a `SupportReply` table;
  - inbox list, the message page's replies and "This person on SponsorX" records, reply and "Mark closed" endpoints;
  - the support@ email is a notice only (no message text, no file names, no reply-to); a new `support.reply` email goes out from noreply@ in the sender's thread;
  - BTG admins get write on `supportMessage` (policy, RBAC Matrix §27, matrix digest updated).
- **Decided with the user:** the inbox filters by status now; the filter by case is added in POL-BE-43, where the cases are stored.
- **Checks:** backend build, lint, security scripts, secret scan, audit and the full backend suite pass on a local Postgres.
- **Tracker:** POL-BE-41 is in Code review.
- **Next:** POL-BE-42 ("what's wrong" tags), then POL-BE-43, then the three front-end rows.
