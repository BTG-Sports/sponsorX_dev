# 2026-10-26

## www.sponsorx.net now redirects to https://sponsorx.net

- **Cause:** when production went live (2026-09-28), only the apex `sponsorx.net` was added in Cloudflare and Railway. `www` had no DNS record, so it didn't resolve at all.
- **New Cloudflare key:** the old `CLOUDFLARE_API_TOKEN` in `.env` was dead ("Invalid API Token"). The user created **"SponsorX DNS"** in Rcarr@icarrefound.org's account: sponsorx.net only, Zone Read + DNS Edit + Single Redirect Edit, expires **2027-10-26**. It's in `.env` (not committed).
- **Added through the API:**
  - DNS: `CNAME www → sponsorx.net`, proxied (orange cloud).
  - Single Redirect rule "www to sponsorx.net": host `www.sponsorx.net` → `concat("https://sponsorx.net", path)`, 301, query string kept.
- **Checked** against 1.1.1.1: `https://www.sponsorx.net/` and `http://www.sponsorx.net/` both 301 → `https://sponsorx.net/`; `/join?ref=test` keeps its path and query. The app isn't served on `www`, because production sign-in (Clerk) only works on `sponsorx.net`.

## Zoho Books org renamed to SponsorX

- **Why:** the P8-OPS-04 test invoice was emailed as "Bill for The Coffee Stage". Books names the issuer after the organisation, and the org used (`763851111`) was still called The Coffee Stage.
- **The org:** the only Books org on the rcfworks account (Zoho One, created Feb 2022, user is admin). Its Getting Started page showed it effectively unused; the only invoice in it is the P8-OPS-04 test.
- **Decision (user, 2026-10-26):** rename rather than move. The user renamed it **SponsorX** and set Industry to "Agency or Sales House". The org ID is unchanged, so the "Send to SponsorX" rule and `sponsorx_send_invoice` keep working; nothing was redone. P8-OPS-04 stays Done.
- **Supersedes** the 2026-10-02 note that this org "is not BTG's" and that Rodney must create a separate Books org.
- **Still to confirm:** the org address (Baltimore, 21239) prints on every invoice; replace it if it isn't BTG's. Use `https://sponsorx.net` as the website (no `www` before today's redirect).
- **Test records** (customer "Test Sponsor (SponsorX test)", INV-000001, its $10 payment) are still in the org.

## Tester guide: dry run on staging, guide corrected

- **Guide:** "SponsorX Tester Guide.docx" in the user's Drive folder "Sponsor X Tester" (written through Google Drive for desktop). The older, uncorrected Google Doc was deleted at the user's request. Testers report through the staging Contact BTG page (`/contact`, which forwards to support@sponsorx.net); the Google Form was dropped.
- **Dry run** as real sign-ups on staging (run tag `DRY 2610260300`, left in place):
  - Athlete and sponsor sign-ups opened automatically.
  - Item → listing went live; Shop → cart → checkout → paid with card 0077 (order PAID).
  - The "SponsorX Test Drive" request became a campaign automatically; admin sent an offer from the Matching Studio; athlete accepted; draft → revision → v2 → approved → published.
  - Reward + QR → fan claim → redeem → no second redeem; the redemption shows in the sponsor's results.
  - Athlete earnings (pay only); audit log; the under-18 application waits for the guardian.
- **Guide corrections:** two required ticks on the application's last page; no rate fields; listings start in Inventory; Shop, not the marketplace, for athletes' listings; request a ready-made package (a job type is a custom request, held for BTG); offers are under Offers; deliverables are a draft upload with #ad; "Send to sponsor", not "Approve", for sponsor review; card 0077, not 4242.
- **Not run, left to the testers (user's decision):** the athlete's Stripe payout setup (Connect onboarding still shows an hCaptcha to scripts), and what follows it (sponsor confirms delivery, payout request); the guardian's own confirmation; the sponsor approving a post.
- **Frontend problems found** (list sent to the user for HeckerCreatives): no PDF export on real campaigns (`{sample && <ExportReport/>}` in the report page); placeholder brands on the homepage; "POSTGRES · READ" label on athlete pages; the offer title repeats the sponsor; image drafts labelled "Video"; a duplicated sentence on the listing form; "BTG verifying" vs "Complete" after publishing.
- **Stripe:** hosted Checkout now accepts a headless browser; Connect onboarding still doesn't.
