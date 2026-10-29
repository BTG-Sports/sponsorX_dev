# 2026-10-29 — tasks completed

### `POL-BE-03` Code review (rcfworks), on `feature/POL-BE-03-share-raise-needs-consent`

- **Problem (polish.md item 3, confirmed in the code):**
  - A team could raise its share of any athlete it added directly, minors included, with one click and without telling them.
  - Only invited athletes (`2S2-BE-05`) were protected.
- **Decision** (the user, with Rodney's authority): the share typed at "Add athlete" needs the athlete's yes too. Until then BTG's standard team share applies.
- **Built:**
  - New table `TeamShareChange` (migration `20261029120000_team_share_change`), with one open request per athlete. The code is in `backend/src/domain/team-share.ts`.
  - **Needs a yes:**
    - a raise;
    - a clear back to BTG's standard share;
    - the share typed at "Add athlete".
  - **Lowering** applies at once and ends the open request.
  - **Who accepts:**
    - a minor's guardian accepts for them (`assertMayCommit("accept")`);
    - the minor's own login is refused;
    - nobody accepts during the coming-of-age pause.
  - **Stale requests:** a yes applies only while the athlete is still on that team at the old share. Leaving or removal lapses the request.
  - **Emails:**
    - `team.shareChangeAsked` and `team.shareLowered` go to the athlete, and to the guardian while the guardian acts for them;
    - `team.shareChangeAnswered` goes to the team.
  - **Routes:**
    - `POST /team/roster/:id/share-change/withdraw`;
    - `POST /me/team/share-changes/:id/respond`;
    - `shareChange` is added to the roster reads and to `/me/team`.
- **Tests:**
  - New file `tests/phase2-team-share.test.ts` (9 tests).
  - The invited case is updated in `phase2-team-invites`.
  - The money suites that add an athlete at 20% now record the athlete's yes first (`tests/support/team-share.ts`).
  - The tenant sweep and the matrix test cover the new route and table.
  - Locally: 3,612 backend and 1,729 frontend tests, both builds, lint, security scripts, secrets scan and audit all pass.
- **For HeckerCreatives:** `POL-FE-03`, as spelled out in `polish.md` item 3.
- **Not yet done:** the tracker row and `polish-progress.md`. Both are changed on PR #321 (`POL-BE-02`), and the xlsx can't be merged, so they are updated once #321 merges.
