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
