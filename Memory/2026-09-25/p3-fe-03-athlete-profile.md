# `P3-FE-03` — the athlete profile and its honest meter (HeckerCreatives)

*Code review. Third Block B substitution, same shape as the review queue:
fixture demo for visitors, the truth for the signed-in owner.*

## Backend: `GET /athletes/me` (new router, routes/v1/athletes.ts)

The profile data existed (P3-BE-04 socials with provenance, capabilities,
interests, restrictions, tier) but nothing served it to its owner. One
endpoint, deliberately not a collection — sponsors meet athletes through the
marketplace, never by listing the network (§15). Refuses an actor with no
`athleteId` before touching the DB (a BTG admin has no "me" here), pins the
query to `actor.athleteId` on top of `whereFor`, and answers section COUNTS
(`ratesConfirmed`, `agreementsSigned`) rather than contents — the rate card
is P3-FE-04's screen. Registered in the OpenAPI registry and added to the
coverage test's file list (it hardcodes route filenames — remember that when
adding a router). **The lead's tenant-scope static scan caught my first cut:**
`agreementAcceptance.count` keyed on userId alone — now tenant-scoped. The
scan earns its keep.

## The meter must not flatter (§24, §11)

`lib/profile-live.ts` derives each §11 section's state from data, pure and
pinned by 9 tests: identity needs a location, not just names; "no
restrictions" is an ANSWER (notes) while an empty list with no notes is an
unasked question; **"payment recipient" has no Phase 1 model and is
`not-collected` — excluded from the percentage entirely**, because counting
it done inflates the meter and counting it missing nags the athlete about
something they cannot fix. The page says so in plain words. A test also pins
the section list to `profile-sections.ts`'s SECTIONS so the two cannot drift.

## What live mode refuses to show

The fixture `AthleteProfileView` (inventory/media/performance tabs), the
"Open public page" link and the "Edit profile" button are all demo-only: the
public page and the editor still render fixtures, and pointing a real athlete
at fixture content presented as theirs is the marketplace-precedent lie.
Live mode renders the §11 sections as cards — real values, public/private
scope badges, per-section Complete/Missing state — and names the real change
path (your BTG network manager), which is the managed-marketplace truth.

**Portal chrome fixed too:** the athlete layout greeted every real athlete as
the fixture ("Shammah Kwizera") — the walk caught it. The shell now greets
the signed-in user from Clerk (identity is Clerk's job); the fixture name
survives only for identities with no name set. Other portals' layouts have
the same pattern — worth fixing as their wiring lands.

## Proof

Signed-in athlete walk (sign-in-token trick from P3-FE-02): **12/12** —
real name renders, fixture athlete absent portal-wide, meter derived (13% for
the sparse seeded athlete — 1 of 8 answerable sections, which is the point:
the meter tells a thin profile the truth), payment honestly not-collected,
scope badges, no fixture buttons, 0px overflow at 390/1280, no console
errors. Seed-script lesson: a walk user's Postgres row is CLAIMED at first
sign-in (clerkId overwritten), so re-seeding must match by email, not by the
`seed:` placeholder.

## State

Backend: athletes.me route tests 4/4, OpenAPI coverage + static scans green.
Frontend **144/144** (9 new), lint clean, root build exit 0 (bare, dev
servers stopped). Board: `P3-FE-03` → Code review (2026-09-25). Google Sheet
mirror still by hand at EOD.
