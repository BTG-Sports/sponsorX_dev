import { afterEach, describe, expect, it, vi } from "vitest";

import { agreementBody, versionInForce } from "./support/agreements";

/* --------------------------------------------------------------------------
   The approved legal wording, issued 2026-10-22 — P0-LEG-01…05, 2S0-LEG-01,
   3S0-LEG-01 (the SponsorX Legal folder, documents 1–6).

   What people accept is fingerprinted, so the text in force must be the
   final wording: no counsel brackets, no draft banner, nothing the guardian
   page would show as a missing term. The fan page's notice, footer and
   privacy notice say only what the product does, and the sponsor report
   carries the approved title and foot note.
   -------------------------------------------------------------------------- */

const env = { SUPPORT_EMAIL: "support@sponsorx.net", BTG_POSTAL_ADDRESS: "" };
vi.mock("../src/config/env", () => ({ env }));

const { fanPrivacyNotice } = await import("../src/domain/fan-privacy-notice");
const { FAN_EMAIL_RETENTION_DAYS } = await import("../src/domain/fan-data-retention");
const { CONSENT_TEXT, CURRENT_CONSENT_VERSION, ELIGIBILITY_CHECK_NOTE, KNOWN_CONSENT_VERSIONS, rewardNotice } = await import("../src/domain/fan-consent");
const { fanFooter } = await import("../worker/jobs/send-email.mts");
const { RESULTS_NOTE, renderReportHtml } = await import("../src/domain/report-render");

const KINDS = ["COLLAB", "CAMPAIGN_ORDER", "GUARDIAN", "PROPERTY_TERMS", "MARKETPLACE_ORDER"] as const;

describe("the agreements in force are the approved wording", () => {
  it.each(KINDS)("%s: version 2 or later, with no draft banner, counsel note or blank", (kind) => {
    expect(versionInForce(kind)).toBeGreaterThanOrEqual(2);
    const body = agreementBody(kind);
    /* "each draft" is the content an athlete submits; the banner is the uppercase DRAFT. */
    expect(body).not.toMatch(/FOR COUNSEL|NOT COUNSEL-APPROVED|DRAFT/);
    expect(body).not.toMatch(/placeholder|not final/i);
    /* A bracket is an unfilled blank — and the guardian page shows it as a missing term. */
    expect(body).not.toMatch(/[[\]]/);
    expect(body).toMatch(/BTG Sports Group LLC/);
  });

  it("the guardian agreement reads as one term per line, headed by a title the page does not mark pending", () => {
    const lines = agreementBody("GUARDIAN").split("\n").filter((l) => l.trim());
    expect(lines[0]).toMatch(/^SponsorX Guardian Agreement — version \d+/);
    expect(lines[0]).not.toMatch(/placeholder|draft|not final/i);
    expect(lines.filter((l) => /^\d+\. /.test(l))).toHaveLength(10);
  });

  it("the earlier versions stay on disk — an acceptance of v1 still resolves to the words shown", () => {
    for (const kind of KINDS) expect(agreementBody(kind, 1).length).toBeGreaterThan(0);
  });
});

describe("the fan page wording (P0-LEG-04)", () => {
  afterEach(() => { env.BTG_POSTAL_ADDRESS = ""; });

  it("box 1 no longer says the address is never shared — the optional second box shares it", () => {
    expect(CONSENT_TEXT[CURRENT_CONSENT_VERSION]).toMatch(/not given to the sponsor unless you tick the next box/);
    expect(KNOWN_CONSENT_VERSIONS).toEqual(expect.arrayContaining(["2026-09-01", CURRENT_CONSENT_VERSION]));
  });

  it("the notice under the button: one reward per code only where that is true; never a purchase", () => {
    expect(rewardNotice({ singleUse: true, sponsorName: "Rosa's Tacos" })).toBe(
      "One reward per code. No purchase needed to claim. Reward offered by Rosa's Tacos; SponsorX is run by BTG Sports Group.",
    );
    expect(rewardNotice({ singleUse: false, sponsorName: null })).toBe("No purchase needed to claim. SponsorX is run by BTG Sports Group.");
    expect(ELIGIBILITY_CHECK_NOTE).toBe("Age and ticket are checked at the booth when you redeem.");
  });

  it("every fan email's footer: why it came, the one-tap unsubscribe, and BTG's address once it is set", () => {
    const url = "https://sponsorx.example/u/tok";
    expect(fanFooter(url)).toBe(`You got this email because you claimed a reward on SponsorX. Unsubscribe — one tap, no login: ${url}\n\nBTG Sports Group.`);
    vi.stubEnv("BTG_POSTAL_ADDRESS", "1 Main St, Baltimore, MD 21201");
    expect(fanFooter(url)).toMatch(/\n\nBTG Sports Group, 1 Main St, Baltimore, MD 21201\.$/);
    vi.unstubAllEnvs();
  });

  it("the privacy notice says what the product does: 90-day deletion, the support address, US storage", () => {
    const n = fanPrivacyNotice();
    const text = n.sections.map((s) => `${s.heading}: ${s.text}`).join("\n");
    expect(n.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text).toContain(`We delete your email ${FAN_EMAIL_RETENTION_DAYS} days after you claim the reward.`);
    expect(text).toContain("Contact: support@sponsorx.net.");
    expect(text).toContain("Your data is stored in the United States.");
    expect(text).not.toMatch(/[[\]]|FOR COUNSEL/);
    expect(text).toMatch(/^Who we are: SponsorX is run by BTG Sports Group LLC\. Contact/);
    env.BTG_POSTAL_ADDRESS = "1 Main St, Baltimore, MD 21201";
    expect(fanPrivacyNotice().sections[0]!.text).toBe("SponsorX is run by BTG Sports Group LLC, 1 Main St, Baltimore, MD 21201. Contact: support@sponsorx.net.");
  });
});

describe("the sponsor report wording (3S0-LEG-01)", () => {
  it("is titled Campaign Results Report, names the cost per 1,000 checked views, and carries the standard note", () => {
    const report = {
      campaign: { name: "Fall Push", startDate: "2026-10-01", endDate: "2026-11-30", state: "ACTIVE" },
      objective: null,
      performance: { verifiedViews: 0, verifiedEngagements: 0, views: { SELF_REPORTED: 0, ESTIMATED: 0 }, engagements: { SELF_REPORTED: 0, ESTIMATED: 0 } },
      mediaValue: { amount: 0, basis: "none", source: "ESTIMATED" },
      roster: [], deliveredAssets: [], adPlacements: [], editionEngagement: null, virtualPlacements: [],
      funnel: { SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 },
      redemption: { redeemed: 0, issued: 0, rate: 0 },
      observations: [],
    } as unknown as Parameters<typeof renderReportHtml>[0];
    const html = renderReportHtml(report, new Date("2026-10-22T00:00:00Z"));
    expect(html).toContain("<h1>Campaign Results Report</h1>");
    expect(html).not.toMatch(/\bROI\b/);
    expect(html).toContain("Cost per 1,000 checked views");
    expect(html).not.toMatch(/>Media value /);
    expect(RESULTS_NOTE).toMatch(/^Checked figures are counted by SponsorX or taken from the platform\./);
    expect(html).toContain(RESULTS_NOTE.replace(/'/g, "&#39;"));
  });
});
