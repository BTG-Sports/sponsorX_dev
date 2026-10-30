/* --------------------------------------------------------------------------
   5S1-FE-01 — the Certified Recruiting partner card (Phase 5, the
   Certified Recruiting partnership, 2026-10-27). Fixed content, no API, no
   route of its own: a card on the home page's "For athletes" stop and on
   the athlete dashboard that sends athletes to certified-recruiting.com in
   a new tab.

   The logo is the site's own, linked from certified-recruiting.com as the
   task asks. It is the only logo file the site serves (a square JPEG at
   `/airo-assets/images/logo/horizontal`, checked 2026-10-29): a black
   mark on a white ground with no transparency, so the card shows it on a
   white plate. If GoDaddy moves the file the plate shows the alt text, and
   the card still reads.
   -------------------------------------------------------------------------- */

export const CERTIFIED_RECRUITING = {
  name: "Certified Recruiting",
  url: "https://www.certified-recruiting.com/",
  logoUrl: "https://www.certified-recruiting.com/airo-assets/images/logo/horizontal",
  heading: "Preparing for your next athletic opportunity?",
  line: "Explore recruiting guidance through Certified Recruiting, a BTG partner.",
  button: "Explore Recruiting Support",
  eyebrow: "BTG partner",
} as const;

/** The attributes every link to the partner carries: a new tab that can't reach back. */
export const PARTNER_LINK = { target: "_blank", rel: "noopener noreferrer" } as const;
