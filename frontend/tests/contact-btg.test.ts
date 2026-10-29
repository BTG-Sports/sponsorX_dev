import { describe, expect, it } from "vitest";

import { contactBtgAction } from "../src/lib/contact-btg";

/* POL-FE-35 — "Contact BTG" on the team's Documents and Roster pages is a
   mailto to the support address, with the subject filled in. */

describe("contactBtgAction", () => {
  it("names the address in the label and links to it with a subject", () => {
    const a = contactBtgAction("support@sponsorx.net", "Our organization's documents on SponsorX");
    expect(a.label).toBe("Email BTG at support@sponsorx.net");
    expect(a.href).toBe("mailto:support@sponsorx.net?subject=Our%20organization's%20documents%20on%20SponsorX");
  });
  it("trims a padded address", () => {
    expect(contactBtgAction("  help@btg.example ", "Hi").href).toBe("mailto:help@btg.example?subject=Hi");
  });
});
