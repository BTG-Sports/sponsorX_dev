# 2026-10-27

## Phase 5 is now Certified Recruiting; the INFINEX game is Phase 6

- **Trigger:** the user received a partnership plan for Certified Recruiting, BTG Sports Group and SponsorX. Certified Recruiting's site, [certified-recruiting.com](https://www.certified-recruiting.com/), is already built by the user on GoDaddy (GoDaddy Airo) and is the partnership's main page. BTG's website already links to it: the "Recruiting" menu item. What's missing is a link from SponsorX.
- **Decision (user):** move every Phase 5 task to Phase 6 and put the new task in Phase 5. IDs renumbered `5S…` → `6S…` with the same sprint, category and number, following the 2026-10-16 precedent (4S… → 5S…). Each Phase 6 row notes "Formerly 5S…". Old `Memory/` logs and signed records (the Phase 4 sign-off) keep the old IDs.
- **New Phase 5** (`documentation/SponsorX-Phase5-Certified-Recruiting.md`, sheet `Phase 5`):
  - `5S1-FE-01` · Certified Recruiting card on SponsorX. A partner card linking to certified-recruiting.com, on the home page's "For athletes" section and the athlete dashboard. Status Ready, for the frontend.
- **Corrected the same day:** I first wrote `5S1-FE-01` as a new landing page on BTG's WordPress site, plus `5S1-PMO-01` to collect the inputs for it. That duplicated the GoDaddy site the user had already built. Both were replaced by the card task above before merging.
  - `5S1-FE-02` · Fix footer links on certified-recruiting.com (GoDaddy editor), the three problems below. Status Ready.
- **Found on certified-recruiting.com:**
  - the footer's SponsorX link goes to `sponsorx.com`, a different company; it should be `https://sponsorx.net`;
  - "SponsorX Next" goes to `next.sponsorx.com`, which doesn't exist; it should be `https://sponsorx.net/next/about`;
  - the Instagram and X icons point to the bare instagram.com and x.com.
- **Also changed:**
  - The Phase 5 doc is renamed `SponsorX-Phase6-INFINEX-Game.md`, and every plan's phase table is updated.
  - IDs updated in the INFINEX specs, the Virtual Registry and Taxonomy docs, the Go/No-Go review and two backend comments.
  - The CI skip list for phase plans, and `CLAUDE.md`.
  - Tracker: the Dashboard and Roadmap now show six phases; 15 formulas added, none lost.
- **Verified:** backend build, lint, secret scan and the scanner self-tests pass. The CI skip pattern skips the two new plan names.
