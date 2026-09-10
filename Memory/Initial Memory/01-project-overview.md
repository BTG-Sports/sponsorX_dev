# Project Overview — BTG SponsorX

## What it is (plain English)
SponsorX is a **real B2B web platform** (a website you log into — NOT a game, NOT collectible cards) where **real local businesses pay real money to have real local athletes advertise them on social media**, and **BTG staff run and measure those campaigns**. It's comparable to a mix of LinkedIn, Fiverr, an Instagram Ads Manager, and a CRM.

Owner: BTG Sports Group / iCARRe Solutions.

## The core loop (the engine)
```
BUSINESS wants customers → BTG matches athletes → ATHLETE posts real content
→ FAN scans QR reward & buys → BTG measures → SPONSOR gets ROI report → renews
```

## Three user types (three portals)
- **Sponsor** — a business buying campaigns (dashboard, marketplace, analytics, rewards/leads, billing).
- **Athlete / Content Partner** — a real athlete who builds a profile, accepts jobs, posts content, gets paid.
- **Admin (BTG staff)** — runs everything: athlete approvals, matching, content approval, rewards, finance, reports.

## Business mechanics
- **NIL jobs SX-01 → SX-07** (Story Drop → Monthly Ambassador): each has an athlete base pay and a sponsor sell price; the gap is BTG's margin.
- **Sponsor packages:** $750 Test Drive (cheap on purpose, low-friction first buy) → Local Blitz → Community → Takeover → Season Partner ($15K–30K+).
- **Athlete tiers** (Emerging 1.0× → Creator 1.25× → Premium 1.5× → Anchor custom) + a **Content Value Score** (engagement, quality, reliability, geography, fit — NOT primarily follower count).
- **CPM pricing formula:** Base CPM × engagement × audience quality × geography × format × exclusivity × demand × confidence. Fixed-price jobs still compute an "implied CPM" for learning.
- **QR reward funnel:** scan → landing → claim → redemption, each tracked as a **separate** event; claims become opted-in fan leads handed to the sponsor. (Privacy-sensitive — consent required, often youth sports.)
- **Zoho CRM integration:** Zoho = system-of-record for sales/pipeline/invoices; SponsorX = system-of-record for athletes, campaigns, deliverables, performance. Sync via external IDs + retry queue to avoid drift/duplicates.

## Roadmap
- **Phase 1 (current):** managed micro-NIL marketplace — real campaigns run partly by hand, software records everything.
- Phase 2: transactional marketplace, payments, payouts, Wallet.
- Phase 3: intelligence — dynamic pricing, matching, forecasting, attribution.
- Phase 4: INFINEX — virtual sponsorship inventory.

## Agreed build scope
Marketing landing page **+ full Phase 1 app (all 3 dashboards) + real backend & database**. UI/UX mockups v1.0 (12 screens, dark + light themes) are **visual reference only, not binding source of truth** — we can design our own while referencing them.

## Source documents
Under `Documentation/`: `Master/` (blueprints, dev specs, "My View"), `Design/` (mockup PNGs), `Prelaunch/` (ops binder, campaign series, agreements), `Schools/` (partner school plan, media academy workbook).

Notable: pilot campaign is **"What's Your Pregame Meal?"** (food/restaurant sponsors); a 24-document prelaunch operations binder; a $5,000/yr Partner School program feeding youth athletes into the network.
