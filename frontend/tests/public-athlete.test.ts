import { createElement } from "react";
import { describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   POL-FE-82 — the redesigned public athlete page.

   The helpers (lib/public-athlete.ts): reach, on-time share, the badges a
   track record earns and the plain one-line story; nothing is shown that
   the data doesn't earn. Then the page, rendered: the three tabs, one
   action, numbers labelled with their source, and nothing private.
   -------------------------------------------------------------------------- */

const lib = await import("@/lib/public-athlete");
type PublicAthlete = import("@/app/(public)/athletes/[slug]/featured-profile").PublicAthlete;

const base: PublicAthlete = {
  slug: "elijah-wallace-w9fs",
  displayName: "Elijah Wallace",
  sport: "Basketball",
  position: "Guard",
  school: "Northside High",
  city: "Baltimore",
  stateCode: "MD",
  level: "HIGH_SCHOOL",
  achievements: "All-state 2025",
  contentCapabilities: ["SHORT_FORM_VIDEO"],
  brandInterests: ["APPAREL"],
  socials: [
    { platform: "INSTAGRAM", handle: "@eli", followers: 9000, source: "VERIFIED_API" },
    { platform: "TIKTOK", handle: "eli.hoops", followers: 3000, source: "SELF_REPORTED" },
  ],
  photoUrl: null,
  memberSince: "2026-09",
  track: {
    campaignsCompleted: 4,
    brands: 3,
    postsLive: 10,
    postsVerified: 6,
    onTime: { onTime: 9, of: 10 },
    fanRedemptions: 1250,
    recent: [{ platform: "INSTAGRAM", month: "2026-11", verified: true }],
  },
  featured: false,
  claimable: false,
};

const fresh: PublicAthlete = {
  ...base,
  socials: [],
  track: { campaignsCompleted: 0, brands: 0, postsLive: 0, postsVerified: 0, onTime: { onTime: 0, of: 0 }, fanRedemptions: 0, recent: [] },
};

describe("POL-FE-82 · the words and numbers (pure)", () => {
  it("months, names and compact counts", () => {
    expect(lib.monthLabel("2026-09")).toBe("Sep 2026");
    expect(lib.monthLabel("2026-13")).toBeNull();
    expect(lib.monthLabel(null)).toBeNull();
    expect(lib.firstName("  Elijah Wallace ")).toBe("Elijah");
    expect(lib.platformName("TIKTOK")).toBe("TikTok");
    expect(lib.platformName(null)).toBe("Social post");
    expect([999, 1000, 1250, 12_400, 2_450_000].map(lib.compact)).toEqual(["999", "1K", "1.2K", "12K", "2.4M"]);
  });

  it("reach sums the counts, strips the @, and is 'verified' only when every counted number is", () => {
    const r = lib.reach(base.socials);
    expect(r.total).toBe(12_000);
    expect(r.allVerified).toBe(false);
    expect(r.rows.map((x) => [x.handle, x.share])).toEqual([["eli", 0.75], ["eli.hoops", 0.25]]);
    expect(lib.reach([base.socials[0]!]).allVerified).toBe(true);
    expect(lib.reach([]).total).toBe(0);
    expect(lib.reach([]).allVerified).toBe(false);
  });

  it("on-time share is a whole percent, and absent before the first dated post", () => {
    expect(lib.onTimePercent(base.track)).toBe(90);
    expect(lib.onTimePercent(fresh.track)).toBeNull();
    expect(lib.onTimePercent(null)).toBeNull();
  });

  it("badges are earned from the data, most impressive first", () => {
    expect(lib.earnedBadges(base).map((b) => b.id)).toEqual(["on-time", "campaigns", "brands", "verified", "fans"]);
    expect(lib.earnedBadges(base)[0]!.why).toBe("90% of Elijah's posts went up by their due date.");
    /* 2 of 2 on time is not a record yet: three posts first. */
    const two = { ...base, track: { ...base.track!, onTime: { onTime: 2, of: 2 } } };
    expect(lib.earnedBadges(two).map((b) => b.id)).not.toContain("on-time");
    /* A newcomer gets one honest badge, never none and never a made-up one. */
    expect(lib.earnedBadges(fresh).map((b) => b.id)).toEqual(["new"]);
  });

  it("the story line says only what the counts say", () => {
    expect(lib.storyLine(base)).toBe("Elijah has completed 4 campaigns, worked with 3 brands and put 10 sponsored posts live, 90% of them on time.");
    expect(lib.storyLine(fresh)).toBe("Elijah is new on SponsorX: approved, ready, and looking for a first campaign.");
    const one = { ...fresh, track: { ...fresh.track!, campaignsCompleted: 1, brands: 1 } };
    expect(lib.storyLine(one)).toBe("Elijah has completed 1 campaign and worked with 1 brand.");
  });
});

describe("POL-FE-82 · the page, rendered", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AthletePublicPage, pageBoosts } = await import("@/components/athlete-public-page/athlete-public-page");
  const render = (a: PublicAthlete, openedFromPortal = false) => renderToStaticMarkup(createElement(AthletePublicPage, { a, openedFromPortal }));
  const renderOwner = (a: PublicAthlete, live = true) => renderToStaticMarkup(createElement(AthletePublicPage, { a, mode: "owner", live }));

  it("public mode: the name is the page's h1", () => {
    expect(render(base)).toMatch(/<h1 id="pp-name"/);
  });

  it("owner mode: same page, no sponsor-side action, the name an h2 under the portal's h1", () => {
    const html = renderOwner(base);
    expect(html).toContain("What Elijah has done on SponsorX");
    expect(html).not.toMatch(/<h1/);
    expect(html).toMatch(/<h2 id="pp-name"/);
    expect(html).not.toContain('href="/brief"');
    expect(html).not.toContain("Request a proposal</");
    expect(html).not.toContain("Is this you?");
    expect(html).toContain("How sponsors reach you");
    expect(html).toContain('href="/athlete/invitations"');
  });

  it("owner mode, not live yet: no live dot, no verified badge, no share button", () => {
    const html = renderOwner({ ...base, track: null, memberSince: null }, false);
    expect(html).toContain("Not live yet");
    expect(html).not.toContain("Verified athlete");
    expect(html).not.toContain("pp-live-dot");
    expect(html).not.toContain("Share your page");
  });

  it("owner mode says what would make the page stand out, and nothing once it has it all", () => {
    expect(pageBoosts({ ...base, achievements: null })).toEqual(["Add a photo: pages with a face get noticed first.", "Add highlights: titles, records, awards."]);
    expect(pageBoosts({ ...base, photoUrl: "https://cdn.invalid/p.jpg" })).toEqual([]);
    expect(renderOwner({ ...base, photoUrl: "https://cdn.invalid/p.jpg" })).not.toContain("Make your page stand out");
  });

  it("reads as three questions with one action", () => {
    const html = render(base);
    for (const tab of ['href="#track"', 'href="#reach"', 'href="#about"']) expect(html).toContain(tab);
    expect(html).toContain("What Elijah has done on SponsorX");
    expect(html).toContain("Who sees Elijah");
    expect(html).toContain("Get to know Elijah");
    expect(html.match(/href="\/brief"/g)).toHaveLength(2); // hero + the three-step card: the same one action
    expect(html).toContain("Sponsor Elijah in three steps");
  });

  it("labels where numbers come from, and keeps brands and prices private", () => {
    const html = render(base);
    expect(html).toContain("Counted by SponsorX from finished work");
    expect(html).toContain("self-reported");
    expect(html).toContain("verified · platform");
    expect(html).toContain("never appear on a public page");
    expect(html).not.toMatch(/\$\d/);
  });

  it("no photo → the monogram; a photo → the image with a describing alt", () => {
    expect(render(base)).toContain(">EW</span>");
    expect(render({ ...base, photoUrl: "https://cdn.invalid/p.jpg" })).toContain('alt="Elijah Wallace, Basketball athlete"');
  });

  it("a newcomer's page is encouraging, not empty", () => {
    const html = render(fresh);
    expect(html).toContain("New on SponsorX");
    expect(html).toContain("first campaign shows up here");
    expect(html).toContain("No accounts listed yet.");
  });

  it("opened from the athlete portal, it says this is what others see", () => {
    expect(render(base, true)).toContain("This is exactly what sponsors and fans see.");
    expect(renderOwner(base)).not.toContain("Opened from the athlete portal");
    expect(render(base)).not.toContain("exactly what sponsors and fans see");
  });
});
