# `P3-FE-05` — the public package catalogue, wired (HeckerCreatives)

*Code review. Fourth substitution of the day; the last Ready Stage 3 FE row.*

- **New public read: `GET /public/catalogue/packages`** — no actor (a visitor
  browses before they exist to us, the intake precedent), rate-limited
  120/hr, tenant pinned to `PUBLIC_INTAKE_TENANT_ID`. The decisive design
  point: it shares the sponsor read's `PACKAGE_SELECT`, so **athlete pay is
  absent by construction** — there is no second field list to get wrong.
  Registered in the OpenAPI registry (`auth: false`); 3 new tests pin the
  select (no baseLow/baseHigh), the tenant/active where, and JSON
  normalisation.
- **/packages prefers the truth**: real §7 packages render with price range
  (whole dollars), athlete count, duration/exclusivity, and the **job-code
  line items as chips** ("1× SX-01") — the §7 list itself, not a marketing
  paraphrase. The fixture grid survives only as the outage/empty fallback: a
  marketing page must not 500 on an API blip, and its footer already declares
  every price indicative. Also stripped §-refs from the page's visible copy
  (badge and two body lines) per the pass-3 rule; the one left lives in a
  disabled-control title, the allowed spot.
- **Verified live**: 6 real packages (TEST_DRIVE $750 … SEASON_PARTNER
  $15,000–$30,000) with their line items; response and rendered page both
  grep-clean of pay fields; fixture "Popular" badge absent in live mode.
  (Note: chip text in HTML is split by RSC comment markers — grep for the
  parts, not the phrase.)

Backend **1242/1242**, frontend 144/144, lint clean, root build exit 0.
Board: `P3-FE-05` → Code review (2026-09-25). Google Sheet mirror still by
hand at EOD. Stage 3's FE rows are now all wired — P3-QA-01 (the
application→approval→ACTIVE E2E) is the remaining gate work.
