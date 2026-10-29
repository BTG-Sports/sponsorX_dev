import { describe, expect, it } from "vitest";

import { CERTIFIED_RECRUITING, PARTNER_LINK } from "@/lib/certified-recruiting";

/* 5S1-FE-01 — the Certified Recruiting partner card's fixed content: the
   task's exact words, the partner's own site and logo, a new tab that can't
   reach back. */

describe("the Certified Recruiting card (5S1-FE-01)", () => {
  it("carries the task's words", () => {
    expect(CERTIFIED_RECRUITING.heading).toBe("Preparing for your next athletic opportunity?");
    expect(CERTIFIED_RECRUITING.line).toBe("Explore recruiting guidance through Certified Recruiting, a BTG partner.");
    expect(CERTIFIED_RECRUITING.button).toBe("Explore Recruiting Support");
  });
  it("sends athletes to certified-recruiting.com, and takes the logo from there", () => {
    expect(CERTIFIED_RECRUITING.url).toBe("https://www.certified-recruiting.com/");
    expect(new URL(CERTIFIED_RECRUITING.logoUrl).host).toBe("www.certified-recruiting.com");
  });
  it("opens in a new tab that can't reach back", () => {
    expect(PARTNER_LINK).toEqual({ target: "_blank", rel: "noopener noreferrer" });
  });
});
