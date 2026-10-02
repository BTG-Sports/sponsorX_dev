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
