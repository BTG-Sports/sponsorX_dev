# 2026-10-21

## rcfworks: housekeeping from 2026-10-20

- **Stage Progress:** appended the 2026-10-20 snapshot row (294 done, 21 days left; stage 8 +2 from P8-BE-02/03, and the 4 new frontend tasks).
- **CLAUDE.md open decisions:**
  - Tax is now "waiting for BTG's accountant" (Stripe files the 1099s).
  - Added the decided rule on local rules and rewards: the athlete's and the sponsor's responsibility.
- **Fan data, two documents corrected to match the app:**
  - The Legal Work Brief said fans give their name, phone and postcode. The only detail is an optional email.
  - "Who can see what" said fan emails go to nobody. They go to the sponsor only if the fan opts in, and athletes never see them.
- **The codebase map** was refreshed with `graphify update .` (code only, no LLM): 17,430 nodes, 613 communities. `.graphify_python` holds the teammate's Windows path, so the CLI was used directly.
- **monitor-trigger "crash" on staging (08:01):** GitHub's API answered one workflow dispatch with a 500. The health check ran anyway, and all runs since have been fine. No action taken.
