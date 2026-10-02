# 2026-10-02 — tasks completed

## BTG admin review item 7: approving new sponsors
Already handled. Sponsors are approved automatically (2S1-BE-17), and exceptions go to BTG's Sponsor requests queue (2S1-BE-05). The "BTG Admin Interventions" doc in Drive still says "Keep" for item 7; offered the user new wording.

## BTG admin review item 8: listings publish automatically (2S3-BE-06, 2S3-FE-04, both Done)

The owner's rule: automate. Every listing that passes the checks goes live, the first one included. There is no price check, left out on purpose.

**Backend** (`backend/src/domain/listing.ts`):
- **Submit:** `submitListing` runs `goLive` → `listingChecks`. That covers governance and seller problems (a failure is refused 422, as before), the restricted-words check on the title and description, and standing reasons.
  - Clean: `publishAutomatically` publishes it (`publishedAutomatically`, audit `listing.autoPublish`, seller emailed `listing.live`).
  - Flagged: `holdForBtg` moves it to PENDING_APPROVAL with `reviewReasons` and `heldWords`. The seller and BTG are emailed.
- **The same checks run on every other way back to live:**
  - the seller resuming a paused listing;
  - BTG's "Put back live" (holds it if restricted words were edited in);
  - account reactivation (`relistAfterReactivation`).
- **Refused outright** (unchanged): a seller who is closed, rejected, ended, unapproved or has no listing access, and a minor's own login.
- **Held for BTG** (standing): an organisation flagged for a missing document, payouts on hold, an athlete in the coming-of-age pause, or a minor's unverified guardian.
- **What the seller is told:** restricted words in full, so they can fix them. Standing problems only as "BTG is checking your account".
- **BTG's controls:**
  - `POST /listings/:id/btg-action` PAUSE, END or RESUME, with a reason that is emailed. A listing BTG paused goes back live only through BTG.
  - `GET /listings/auto-published` covers the last 30 days; `GET /listings/live` lists all live listings, paged.
  - Decisions on a held listing: APPROVE, REQUEST_CHANGES or REJECT.
- **Daily summary:** `sendListingDigests`, run hourly by the worker from 13:00 UTC, sends one email per BTG tenant per day, idempotent through the `ListingDigest` table.
- **What sponsors see:** none of BTG's notes or holds.

**Migration:** `20261003100000_listing_auto_publish`.

**Frontend:**
- Both seller editors say "This goes live as soon as the checks pass", then show Live or "BTG is taking a look".
- The marketplace console has tabs Held for BTG, Published automatically and Live listings, with Pause and End.
- The restricted-words page now says listings are checked.
- Removed every line saying BTG approves each listing.

**Plan:**
- `2S3-BE-06` and `2S3-FE-04` were added to the Phase 2 document, which now has 108 tasks.
- The `2S3-BE-06` definition was corrected: closed and rejected sellers are refused outright, not queued for BTG.
- `SponsorX-Phase2-State-Machines.md` §2 was updated.
- Tracker rows 110 and 111 were added, with every range extended.

**Review:** the first review found two ways a listing could go live unchecked (reactivating an account, and BTG's "Put back live"), plus BTG notes visible to sponsors. All are fixed (`cdfac6a`) and rechecked.

**Checks:** backend 2164 of 2165 pass (only QA-02 fails), frontend 957, and the build is clean.

**Housekeeping:** the scratchpad was cleared overnight, so the local Postgres was reinstalled (v18 embedded), along with the venv and `q.cjs`.

## Phase 1 close-out: 236 → 243 of 261 Done (93.1%) — HeckerCreatives, via Claude

The owner asked to finish the remaining Phase 1 tasks. Every open row was checked against its acceptance criteria with the code, and every Code review row closed yesterday was re-audited the same way. Work was done on branch `development/P1-closeout` in a separate worktree, because the owner's `next dev` was live on the main checkout.

**Closed (7):**
- **P1-ART-09…12** (the landing's 3D city, fly-through, loader, page transition).
  - The city's Playwright smoke had failed on every run since the fly-through. It looked for an "I'm a Sponsor" link and a `-z-10` wrapper, neither of which exists any more. Fixed; it passes on desktop and mobile.
  - The kit size budget is now a test. The kit pipeline only printed "OVER" and exited 0.
  - **P1-ART-12 had three real bugs:**
    - A link followed while the boot screen was up locked scrolling for good.
    - A cancelled animation left the transition stuck, and every later link stopped working.
    - Pressing back during the cover sent the visitor forward again.
- **P9-OPS-01**: met by P3-FE-07.
- **P2-OPS-01**: the work was finished on 09-18; the row was held only to show ownership.
- **P2-OPS-10**: `npm run deploy` now ships `api` before `web` and stops if `api` fails. The ordering doc is rewritten for the api+worker / web-without-database topology.

**Defects found in rows closed yesterday, now fixed (rows stay Done; each has a note):**
- **P9-FE-06**: a request with no birthDate and no ageBand skipped the guardian. Also, the 5-an-hour limit was ONE bucket for the whole site, because the applicant's address wasn't forwarded.
- **P3-BE-15**: two concurrent approvals could make two logins for one address. A per-address advisory lock fixes it, and a test forces the race.
- **P1-FE-25**: the API's minor rule worked in local time. Now UTC, with a parity test against both wizard copies.
- **P1-FE-26**: printing the schools page kept the site chrome and printed pale text on white. Now light, without the chrome.
- **P6-ART-01**: dark-brand QR art printed light-on-white.
- **P4-FE-07**: the waiting-briefs banner opened an empty tab.

**Moved, still open:**
- **P8-PMO-05 → Code review.** `documentation/SponsorX-Developer-Handoff.md`, plus `npm run db:test`, which builds the CI test database in one command.
  - Verified in a fresh clone: install, migrate, run, all tests, lint and build.
  - Following it found two faults, both fixed: `prisma:deploy` ignored the root `.env`, and `frontend/.env.example` named variables nothing reads.
- **P8-QA-03 → In progress.** Backend 2,155/2,155 and frontend 958/958 are green; I fixed two parallel-run collisions. Browser suite: 17 pass, 1 still red (below).
- **P9-QA-01 → In progress.** `next-edition-e2e.test.ts` passes 7/7 on every clause but one. Raised **P9-BE-16** (Ready, 3d): edition ad artwork has no path onto the approval board. It is added to the Phase 1 plan, and P9-QA-01 waits on it.

**For rcfworks:**
- `loop-p3-application.spec.ts`, "a minor cannot go ACTIVE…", still expects the manual-review receipt that 2S1-FE-06 replaced with the live checklist yesterday. It needs rewriting to the automatic-approval flow.
- Separately, the "Instagram" selector also matched the new footer icon. I fixed that, and the adult loop passes.

**For the owner — the Clerk DEVELOPMENT instance is at its 100-user cap.** Creating a user fails with "user quota exceeded". So no new developer can sign up, and any browser test or walkthrough that needs a login it hasn't created before will fail. Clear stale test users in the Clerk dashboard. (Logged on P0-OPS-03.)

**Still open (18):**
- **Codeable, after a design call:** P9-BE-16 (how an ad's artwork joins the approval board).
- **Money:** Clerk Pro for MFA (P0-OPS-03, P2-INT-02); GitHub Pro for required checks (P2-OPS-07).
- **Consoles:** Cloudflare registrar lock and auto-renew (P0-OPS-06); production variables (P2-OPS-04); PR environments (P2-OPS-08); a paging destination (P2-OPS-11); a backup restore, alert drill and rollback (P8-OPS-01).
- **A person:** checking the Resend test landed in an inbox (P0-OPS-08); UAT with pilot users (P8-QA-02); go/no-go sign-off (P8-PMO-06).
- **Real-world sales:** edition one selling (P9-DATA-01, P9-PMO-03).
- **Waiting on others:** P8-QA-01; P8-QA-03; P9-QA-01 (waits on P9-BE-16); P8-PMO-05 at Code review.

**Tracker:** 17 Phase 1 rows updated and P9-BE-16 appended at row 268. The autofilter, conditional formats and Status list now run to row 268; the Dashboard and Stage Progress formulas already reached row 400. Stage Progress snapshot: 2026-10-02 · 243 Done · 50 days left. The upstream board was merged first, and the teammate's cells are untouched.
