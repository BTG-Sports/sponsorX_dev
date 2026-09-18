# Mock Data

What the SponsorX front end is running on until the database has rows in it, and
what replaces each piece.

| Document | Use it when |
|---|---|
| [SponsorX-Mock-Data-Register.md](SponsorX-Mock-Data-Register.md) | Cutting a screen over from fixtures to real queries, or checking whether a number on a screen is real yet |

**One thing to know before reading anything here.** Every figure on every screen
today is mock, including the ones that look authoritative — ROI percentages,
redemption funnels, athlete reach. The database has 29 tables and no rows, and
nothing under `src/app` opens a connection. Nobody should show a stakeholder a
SponsorX dashboard and describe a number on it as measured.

The register goes stale as soon as someone adds a fixture, so it carries the
script that regenerates its own consumer counts. Re-run that before trusting the
numbers rather than assuming the document kept up.
