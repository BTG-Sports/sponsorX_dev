# 2026-10-27

## Phase 5 is now Certified Recruiting; the INFINEX game is Phase 6

- **Trigger:** the user received a partnership plan for Certified Recruiting (certified-recruiting.com, a GoDaddy site the user had already built) with BTG Sports Group and SponsorX. It has four steps: (1) a main landing page on BTG's website, (2) links to it from BTG's menu, homepage, Athletes page and inquiry form, (3) a partner card on SponsorX, (4) one shared inquiry form. The user chose step 1 first.
- **Decision (user):** move every Phase 5 task to Phase 6 and put the new tasks in Phase 5. IDs renumbered `5S…` → `6S…` with the same sprint, category and number, following the 2026-10-16 precedent (4S… → 5S…). Each Phase 6 row notes "Formerly 5S…". Old `Memory/` logs and signed records (the Phase 4 sign-off) keep the old IDs.
- **New Phase 5** (`documentation/SponsorX-Phase5-Certified-Recruiting.md`, sheet `Phase 5`), both Ready:
  - `5S1-PMO-01` · Get Certified Recruiting's inputs: logo, approved services (free / paid / application), who answers inquiries. Blocks publishing only.
  - `5S1-FE-01` · Certified Recruiting page on BTG site: WordPress page `btgsportsgroup.com/certified-recruiting`, with a hero, six services, the disclaimer and the review button. Preview first. The full brief (also sent to Slack) is in the phase doc.
- **Facts found:** btgsportsgroup.com is WordPress. Its menu already has a "Recruiting" link that goes to certified-recruiting.com.
- **Also changed:**
  - Phase 5 doc renamed to `SponsorX-Phase6-INFINEX-Game.md`, and every plan's phase table updated.
  - IDs in the INFINEX specs, the Virtual Registry and Taxonomy docs, the Go/No-Go review and two backend comments.
  - The CI skip list for phase plans, and `CLAUDE.md`.
  - Tracker: Dashboard and Roadmap now have six phases; 15 formulas added, none lost.
- **Verified:** backend build, lint, secret scan and scanner self-tests pass. The CI skip pattern skips the two new plan names.
