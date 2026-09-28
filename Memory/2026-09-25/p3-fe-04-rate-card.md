# `P3-FE-04` — the athlete rate card, wired (HeckerCreatives)

*Code review. The one-day follow-on to P3-FE-03: the profile page's private
"Rate card" section now renders the athlete's real card from
`GET /athletes/{id}/rates` instead of a bare count.*

- **`readRateCard` now carries the job NAME** — "Story Drop $400" is
  readable, a cuid is not. Only the name rides along: the job's
  `sponsorPrice` is §7.1-denied to the athlete side and stays unselected.
  Version > 1 renders a small `vN` marker (rates are new versions, never
  updates).
- **Amounts are cents** — rendered through the house `money()`. The section's
  footnote states the boundary out loud: your pay per deliverable; sponsors
  see catalogue prices, never these.
- **"No other athlete's rates are reachable"** is the API's own-scope
  (P3-BE-09/P8-SEC-02: reachability refused before answering, own scope on
  rows) — already pinned by the backend's athlete-rate and tenant-isolation
  suites, which ran green (1239/1239, DB suites included this time).
- **Live proof:** set one real rate through `setAthleteRate` as BTG
  (Story Drop, $400, CREATOR tier — implied minimum sell price came back
  $56 too), and the signed-in athlete walk rendered it: 13/13, and the §24
  meter honestly moved 13% → 25% because the rates section became done.

Frontend 144/144, lint clean, root build exit 0. Board: `P3-FE-04` → Code
review (2026-09-25). Google Sheet mirror still by hand at EOD.
