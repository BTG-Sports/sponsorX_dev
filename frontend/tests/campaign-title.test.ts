import { describe, expect, it } from "vitest";

import { campaignAfterSponsor, campaignNamesSponsor, campaignWithSponsor } from "../src/lib/campaign-title";

describe("campaignAfterSponsor", () => {
  it("drops the sponsor from a sub-line under the sponsor's own title", () => {
    expect(campaignAfterSponsor("Harbor Coffee · SponsorX Test Drive", "Harbor Coffee")).toBe("SponsorX Test Drive");
    expect(campaignAfterSponsor("Harbor Coffee — Fall Push", "harbor coffee")).toBe("Fall Push");
    expect(campaignAfterSponsor("Harbor Coffee: Fall", "Harbor Coffee")).toBe("Fall");
    expect(campaignAfterSponsor("Harbor - view Fall", "Harbor")).toBe("view Fall");
  });
  it("leaves the name alone when it doesn't start with the sponsor, or nothing would be left", () => {
    expect(campaignAfterSponsor("Winter Check", "Bowie Auto Care")).toBe("Winter Check");
    expect(campaignAfterSponsor("Harbor Coffee", "Harbor Coffee")).toBe("Harbor Coffee");
    expect(campaignAfterSponsor("Harborview Fall", "Harbor")).toBe("Harborview Fall");
  });
  it("keeps names where the sponsor runs on into punctuation (second QA review)", () => {
    expect(campaignAfterSponsor("Harbor Coffee's Fall Push", "Harbor Coffee")).toBe("Harbor Coffee's Fall Push");
    expect(campaignAfterSponsor("Harbor Coffee & Friends", "Harbor Coffee")).toBe("Harbor Coffee & Friends");
    expect(campaignAfterSponsor("Harbor-view Fall", "Harbor")).toBe("Harbor-view Fall");
  });
});

describe("campaignWithSponsor", () => {
  it("says the sponsor once when the campaign is named after it (staging dry run, 2026-10-26)", () => {
    expect(campaignWithSponsor("Harbor Coffee · SponsorX Test Drive", "Harbor Coffee")).toBe("Harbor Coffee · SponsorX Test Drive");
    expect(campaignWithSponsor("Harbor Coffee · SponsorX Test Drive", "Harbor Coffee", { campaignFirst: true })).toBe(
      "Harbor Coffee · SponsorX Test Drive",
    );
  });

  it("joins the two when the campaign doesn't name the sponsor", () => {
    expect(campaignWithSponsor("Winter Check", "Bowie Auto Care")).toBe("Bowie Auto Care · Winter Check");
    expect(campaignWithSponsor("Winter Check", "Bowie Auto Care", { campaignFirst: true })).toBe("Winter Check · Bowie Auto Care");
  });
});

describe("campaignNamesSponsor", () => {
  it("matches whole words only, ignoring case and spaces", () => {
    expect(campaignNamesSponsor("harbor coffee fall push", " Harbor Coffee ")).toBe(true);
    expect(campaignNamesSponsor("Harbor Coffee", "Harbor Coffee")).toBe(true);
    expect(campaignNamesSponsor("Harborview Fall", "Harbor")).toBe(false);
    expect(campaignNamesSponsor("Fall push", "")).toBe(false);
  });
});
