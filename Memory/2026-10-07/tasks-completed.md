# 2026-10-07

- **The SponsorX repository moved to the BTG-Sports organization** (GitHub Team plan, owner `rcarr-crypto`; `infinex1` is also an owner). It is now `github.com/BTG-Sports/sponsorX_dev`, and the old `infinex1/sponsorX_dev` links redirect.
  - Issues, pull requests, Actions secrets and variables, and collaborators moved with it. CI runs on the new repository.
  - **Railway:** the Railway GitHub app is installed on BTG-Sports (only this repository). All four services (staging and production, api and web) now point at `BTG-Sports/sponsorX_dev` on the `release` branch. Railway's API refuses repository changes from the CLI (NotAuthorized), so they were made in the dashboard by the owner.
  - **Deploys:** staging was redeployed from `main` (acbb23a). Production rebuilt the same commit (499e0b5).
  - This Mac's `origin` and `documentation/SponsorX-Developer-Handoff.md` now use the new address.
  - **Still to update by hand:** the Vercel test deployment's GitHub connection (HeckerCreatives).
- **The "SponsorX received this from the payment provider" emails** were noise from the 2026-10-06 Stripe sandbox tests. Sandbox events for test accounts and payments created from this Mac reached staging, failed after 7 tries and emailed BTG admins: 59 events.
  - The fix that ignores foreign accounts (7105256) is now on staging (PRs #160 → #166, deployed).
  - The 59 FAILED rows are still on staging's exceptions list; clearing them is offered, not yet done.
- **Slack tracker broadcast (owner's decision):**
  - each merge to `main` that changes tasks now posts one Slack message listing them (`tracker-notify.yml`; `--no-slack` removed);
  - the 8 pm digest posts only on days with none (`tracker_sync.py digest --skip-if-announced`);
  - the Stage Progress row is still appended every day.
  - Tests: 23/23 (`DigestOnlyOnQuietDays`).
- **PR #167** (the release of 2S8-PMO-02 to `main`) is open. #165 merged into main_development just after #166 went to `main`.
