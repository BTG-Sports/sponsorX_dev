/* --------------------------------------------------------------------------
   Fixture data for screen build-out.

   TEMPORARY. Every shape here mirrors the Prisma models in guide V2 §03, so
   swapping these for real queries is a substitution, not a rewrite. Amounts
   are in cents, matching AthleteRate.amount / CampaignOrder.compensation.

   Delete this file once src/server/domain exists.
   -------------------------------------------------------------------------- */

export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export type InviteState = "INVITED" | "VIEWED" | "ACCEPTED" | "DECLINED" | "EXPIRED";
export type DeliverableState =
  | "NOT_STARTED"
  | "DRAFT_SUBMITTED"
  | "BTG_REVIEW"
  | "SPONSOR_REVIEW"
  | "APPROVED"
  | "PUBLISHED"
  | "VERIFIED";
export type EarningState =
  | "PENDING"
  | "ELIGIBLE"
  | "APPROVED_FOR_PAYOUT"
  | "PAID"
  | "HELD"
  | "DISPUTED";

export const athlete = {
  id: "ath_demo",
  slug: "shammah-kwizera",
  displayName: "Shammah Kwizera",
  firstName: "Shammah",
  sport: "Basketball",
  position: "Forward",
  school: "NCAA Eligible 2026",
  region: "East Africa · DMV",
  tier: "Creator", // §6 — manual multiplier in Phase 1
  tierMultiplier: "1.25x",
  isMinor: false,
  guardian: null as null | { legalName: string; verifiedAt: string | null },
  profileCompletion: 72,
  onTimeRate: 94,
};

/** §11 — the onboarding sections, and whether each is done. */
export const profileChecklist = [
  { label: "Identity", done: true },
  { label: "Sport & team", done: true },
  { label: "Social accounts", done: true },
  { label: "Content capabilities", done: true },
  { label: "Brand interests", done: true },
  { label: "Restrictions & conflicts", done: false },
  { label: "Rate card confirmed", done: true },
  { label: "Payment recipient", done: false },
  { label: "Agreements signed", done: false },
];

/** §11 / §22 — audience, with the source label every figure must carry. */
export const socials = [
  { platform: "Instagram", handle: "@shammah", followers: 128_000, avgViews: 41_000, source: "SELF_REPORTED" as const },
  { platform: "TikTok", handle: "@shammahk", followers: 64_500, avgViews: 88_000, source: "SELF_REPORTED" as const },
  { platform: "YouTube", handle: "@shammahkwizera", followers: 9_200, avgViews: 6_400, source: "VERIFIED_API" as const },
];

/** §5 / §6 — SX job catalogue at this athlete's confirmed rates. */
export const rates = [
  { jobId: "SX-01", name: "Story Drop", amount: 4_000 },
  { jobId: "SX-02", name: "Sponsored Post", amount: 9_000 },
  { jobId: "SX-03", name: "Athlete Reel", amount: 14_000 },
  { jobId: "SX-04", name: "Product Experience", amount: 22_000 },
  { jobId: "SX-05", name: "Local Appearance", amount: 28_000 },
  { jobId: "SX-06", name: "Content Day", amount: 32_000 },
  { jobId: "SX-07", name: "Monthly Ambassador", amount: 65_000 },
];

/** §21 — INVITED → VIEWED → ACCEPTED / DECLINED / EXPIRED */
export const invitations = [
  {
    id: "inv_1",
    sponsor: "Under Armour",
    campaign: "Player of the Week",
    jobId: "SX-03",
    jobName: "Athlete Reel",
    offered: 15_000,
    state: "INVITED" as InviteState,
    expiresIn: "2 days",
    deliverableCount: 1,
    usageRights: "Campaign channels, 90 days",
    exclusivity: "Category — athletic apparel, 26 weeks",
  },
  {
    id: "inv_2",
    sponsor: "Silver Spring Grill",
    campaign: "Local Blitz — Spring",
    jobId: "SX-01",
    jobName: "Story Drop",
    offered: 4_500,
    state: "VIEWED" as InviteState,
    expiresIn: "5 days",
    deliverableCount: 1,
    usageRights: "Organic only, 30 days",
    exclusivity: null,
  },
  {
    id: "inv_3",
    sponsor: "Kigali Sports Co.",
    campaign: "Community Campaign",
    jobId: "SX-05",
    jobName: "Local Appearance",
    offered: 30_000,
    state: "INVITED" as InviteState,
    expiresIn: "9 hours",
    deliverableCount: 2,
    usageRights: "Campaign channels + event recap, 90 days",
    exclusivity: null,
  },
];

/** §21 — deliverable pipeline, ordered by due date. */
export const deliverables = [
  {
    id: "del_1",
    campaign: "Player of the Week",
    sponsor: "Under Armour",
    title: "Highlight reel — week 5",
    dueDate: "May 15",
    state: "BTG_REVIEW" as DeliverableState,
    revisionRequested: false,
  },
  {
    id: "del_2",
    campaign: "Player of the Week",
    sponsor: "Under Armour",
    title: "Interview clip — week 4",
    dueDate: "May 18",
    state: "SPONSOR_REVIEW" as DeliverableState,
    revisionRequested: false,
  },
  {
    id: "del_3",
    campaign: "Local Blitz — Spring",
    sponsor: "Silver Spring Grill",
    title: "Story drop + CTA",
    dueDate: "May 21",
    state: "NOT_STARTED" as DeliverableState,
    revisionRequested: false,
  },
  {
    id: "del_4",
    campaign: "Player of the Week",
    sponsor: "Under Armour",
    title: "Game winner recap",
    dueDate: "May 9",
    state: "PUBLISHED" as DeliverableState,
    revisionRequested: false,
  },
  {
    id: "del_5",
    campaign: "Road to College",
    sponsor: "BTG Sports Talk",
    title: "Skills lab feature",
    dueDate: "May 6",
    state: "VERIFIED" as DeliverableState,
    revisionRequested: false,
  },
];

/** §21 earnings state machine. Status only — no tax ID, no bank details (§26). */
export const earnings = [
  { state: "PENDING" as EarningState, label: "Pending", amount: 19_000, count: 2 },
  { state: "ELIGIBLE" as EarningState, label: "Eligible", amount: 15_000, count: 1 },
  { state: "APPROVED_FOR_PAYOUT" as EarningState, label: "Approved for payout", amount: 32_000, count: 2 },
  { state: "PAID" as EarningState, label: "Paid", amount: 78_500, count: 6 },
];

/** §12 — agreement metadata and signature references, not the text itself. */
export const agreements = [
  { kind: "Content Collaboration Agreement", version: 3, acceptedAt: "2026-03-02", current: true },
  { kind: "Media Release", version: 1, acceptedAt: "2026-03-02", current: true },
  { kind: "Campaign Order — Player of the Week", version: 1, acceptedAt: "2026-05-01", current: true },
];

export const DELIVERABLE_COPY: Record<DeliverableState, string> = {
  NOT_STARTED: "Not started",
  DRAFT_SUBMITTED: "Draft submitted",
  BTG_REVIEW: "BTG review",
  SPONSOR_REVIEW: "Sponsor review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  VERIFIED: "Verified",
};

/* ==========================================================================
   Sponsor fixtures — mockup screen 3
   ========================================================================== */

export const sponsor = {
  name: "Under Armour",
  contactName: "John Smith",
  role: "Sponsor Admin",
  /** The mockup reads "May 1 - May 31, 2024"; dated forward to this build. */
  dateRange: "May 1 – May 31, 2026",
};

export const sponsorStats = [
  { label: "Active Campaigns", value: "5" },
  { label: "Views Delivered", value: "823,400", delta: "12.5%", dir: "up" as const },
  { label: "Engagements", value: "42,815", delta: "8.7%", dir: "up" as const },
  { label: "Rewards Redeemed", value: "1,870", delta: "15.2%", dir: "up" as const },
];

/** Cumulative across the month, ending on the totals in sponsorStats. */
export const performanceSeries = [
  { label: "May 1", a: 42_000, b: 2_100 },
  { label: "May 4", a: 121_000, b: 6_300 },
  { label: "May 8", a: 214_000, b: 11_200 },
  { label: "May 11", a: 305_000, b: 15_900 },
  { label: "May 15", a: 402_000, b: 20_800 },
  { label: "May 18", a: 498_000, b: 25_600 },
  { label: "May 22", a: 598_000, b: 30_900 },
  { label: "May 25", a: 681_000, b: 35_400 },
  { label: "May 29", a: 771_000, b: 40_100 },
  { label: "May 31", a: 823_400, b: 42_815 },
];

export const topCampaign = {
  name: "Player of the Week",
  presentedBy: "Under Armour",
  views: 312_540,
  engagement: 18_745,
};

/** §9.3 wants package status, athlete count, deliverables and spend too. */
export const sponsorCampaigns = [
  { id: "c1", name: "Player of the Week", pkg: "Season Partner", athletes: 12, deliverables: [18, 24] as const, spend: 1_920_000, state: "ACTIVE" as const },
  { id: "c2", name: "Local Blitz — Spring", pkg: "Local Blitz", athletes: 8, deliverables: [8, 8] as const, spend: 280_000, state: "REPORTING" as const },
  { id: "c3", name: "Community Campaign", pkg: "Community Campaign", athletes: 14, deliverables: [11, 22] as const, spend: 500_000, state: "ACTIVE" as const },
  { id: "c4", name: "Skills Lab Series", pkg: "10-Athlete Blitz", athletes: 10, deliverables: [10, 10] as const, spend: 250_000, state: "COMPLETED" as const },
  { id: "c5", name: "Road to College", pkg: "Test Drive", athletes: 3, deliverables: [1, 3] as const, spend: 75_000, state: "STAFFING" as const },
];

/** §16 requires these four as separate events, so the funnel is real. */
export const rewardFunnel = [
  { stage: "Scans", value: 8_200 },
  { stage: "Landing", value: 6_410 },
  { stage: "Claims", value: 4_300 },
  { stage: "Redeemed", value: 1_870 },
];

/* ==========================================================================
   Marketplace fixtures — mockup screen 4

   Three kinds of inventory sit behind one catalogue:

   - packages       §7's six standardized packages. Phase 1's primary product
                    and what §9.4 says this screen must display.
   - athleteInv     Curated athlete inventory — the micro-NIL model v2.0 §1
                    launches on.
   - mediaInv       BTG's own media properties, priced on CPM. These are the
                    six cards the mockup actually draws; v2.0 keeps them as
                    inventory but no longer leads with them.

   Sponsor prices only. Sponsors must never see AthleteRate.amount — that is
   the field-level rule in guide §04.
   ========================================================================== */

export type InventoryState = "ACTIVE" | "LIMITED" | "BOOKED" | "SOLD_OUT";

export const marketplacePackages = [
  { id: "pk1", name: "SponsorX Test Drive", price: "$750", athletes: "3", includes: "One activation each, basic report", note: "Low-friction first purchase", state: "ACTIVE" as InventoryState },
  { id: "pk2", name: "Local Blitz", price: "$1,500–$3,000", athletes: "5–10", includes: "Short-form content + stories", note: "Local awareness and traffic", state: "ACTIVE" as InventoryState },
  { id: "pk3", name: "10-Athlete Blitz", price: "~$2,500", athletes: "10", includes: "Coordinated activations + QR reward", note: "Distributed athlete media", state: "ACTIVE" as InventoryState },
  { id: "pk4", name: "Community Campaign", price: "~$5,000", athletes: "10–15", includes: "Premium content + BTG feature + reward", note: "Mid-level campaign", state: "ACTIVE" as InventoryState, featured: true },
  { id: "pk5", name: "Athlete Takeover", price: "~$10,000", athletes: "15–25", includes: "Multi-week + media and event components", note: "Major activation", state: "LIMITED" as InventoryState },
  { id: "pk6", name: "Season Partner", price: "$15K–$30K+", athletes: "Recurring", includes: "Content, events, rewards, exclusivity", note: "Category ownership", state: "LIMITED" as InventoryState },
];

export const athleteInv = [
  { id: "ai1", athlete: "Shammah Kwizera", slug: "shammah-kwizera", sport: "Basketball", tier: "Creator", geo: "DMV", jobId: "SX-03", jobName: "Athlete Reel", sellPrice: 60_000, reach: 128_000, source: "SELF_REPORTED" as const, state: "ACTIVE" as InventoryState },
  { id: "ai2", athlete: "Amara Okafor", slug: "amara-okafor", sport: "Track & Field", tier: "Emerging", geo: "Silver Spring, MD", jobId: "SX-02", jobName: "Sponsored Post", sellPrice: 25_000, reach: 21_400, source: "SELF_REPORTED" as const, state: "ACTIVE" as InventoryState },
  { id: "ai3", athlete: "Jalen Brooks", slug: "jalen-brooks", sport: "Football", tier: "Premium", geo: "Baltimore, MD", jobId: "SX-05", jobName: "Local Appearance", sellPrice: 75_000, reach: 44_800, source: "VERIFIED_API" as const, state: "LIMITED" as InventoryState },
  { id: "ai4", athlete: "Nia Mutesi", slug: "nia-mutesi", sport: "Volleyball", tier: "Emerging", geo: "Kigali, RW", jobId: "SX-01", jobName: "Story Drop", sellPrice: 12_500, reach: 8_900, source: "SELF_REPORTED" as const, state: "ACTIVE" as InventoryState },
  { id: "ai5", athlete: "Marcus Reed", slug: "marcus-reed", sport: "Basketball", tier: "Premium", geo: "Washington, DC", jobId: "SX-07", jobName: "Monthly Ambassador", sellPrice: 200_000, reach: 96_200, source: "VERIFIED_MANUAL" as const, state: "ACTIVE" as InventoryState },
  { id: "ai6", athlete: "Leila Haddad", slug: "leila-haddad", sport: "Soccer", tier: "Creator", geo: "Rockville, MD", jobId: "SX-04", jobName: "Product Experience", sellPrice: 65_000, reach: 33_100, source: "SELF_REPORTED" as const, state: "SOLD_OUT" as InventoryState },
];

/** The six cards the mockup draws. Prices and CPMs are its figures. */
export const mediaInv = [
  { id: "mi1", name: "Player of the Week", property: "BTG Sports", estViews: "1.2M", cpm: 16, price: 1_920_000, state: "ACTIVE" as InventoryState, platforms: ["Social", "Video"] },
  { id: "mi2", name: "BTG Sports Talk", property: "iMC Network", estViews: "2.5M", cpm: 14, price: 3_500_000, state: "BOOKED" as InventoryState, platforms: ["Podcast", "Video"], slug: "btg-sports-talk" },
  { id: "mi3", name: "Africa Showcase", property: "BTG Africa", estViews: "750K", cpm: 18, price: 2_500_000, state: "ACTIVE" as InventoryState, platforms: ["Video", "Social"] },
  { id: "mi4", name: "Showcase MVP", property: "BTG Events", estViews: "500K", cpm: 20, price: 2_000_000, state: "ACTIVE" as InventoryState, platforms: ["Event", "Social"] },
  { id: "mi5", name: "Road to College", property: "Athlete Content", estViews: "800K", cpm: 17, price: 1_360_000, state: "ACTIVE" as InventoryState, platforms: ["Video"] },
  { id: "mi6", name: "Skills Lab Series", property: "BTG Training", estViews: "600K", cpm: 15, price: 900_000, state: "ACTIVE" as InventoryState, platforms: ["Video", "Social"] },
];

export const INVENTORY_COPY: Record<InventoryState, string> = {
  ACTIVE: "Active",
  LIMITED: "Limited",
  BOOKED: "Booked",
  SOLD_OUT: "Sold out",
};

/* ==========================================================================
   Property profile — mockup screen 5 (BTG Sports Talk)
   ========================================================================== */

export const property = {
  slug: "btg-sports-talk",
  name: "BTG Sports Talk",
  subtitle: "iMC Network Show",
  kind: "MEDIA",
  formats: ["Video", "Podcast", "Social"],
  about:
    "Weekly show covering basketball culture, athlete stories, and training. Distributed across iMC Network, YouTube, and all social platforms.",
  stats: [
    { label: "Est. Views / Season", value: "2.5M", source: "ESTIMATED" as const },
    { label: "Avg. Engagement", value: "15K", source: "VERIFIED_MANUAL" as const },
    { label: "Episodes / Year", value: "52", source: "VERIFIED_MANUAL" as const },
    { label: "Primary Age", value: "18-34", source: "ESTIMATED" as const },
  ],
  opportunities: [
    { id: "op1", name: "Presenting Sponsor (Exclusive)", detail: "Category ownership, all episodes", price: 3_500_000, state: "ACTIVE" as InventoryState },
    { id: "op2", name: "Episode Sponsor (Monthly)", detail: "4 episodes per month", price: 400_000, state: "ACTIVE" as InventoryState },
    { id: "op3", name: "Segment Sponsor", detail: "Per episode segment", price: 150_000, state: "LIMITED" as InventoryState },
  ],
  roster: [
    { name: "Shammah Kwizera", slug: "shammah-kwizera", sport: "Basketball" },
    { name: "Marcus Reed", slug: "marcus-reed", sport: "Basketball" },
    { name: "Jalen Brooks", slug: "jalen-brooks", sport: "Football" },
  ],
};

/* ==========================================================================
   Athlete profile, sponsor-facing — mockup screen 6

   This is §9 screen 5, NOT the Athlete Portal. Prices here are SPONSOR
   prices. AthleteRate.amount never appears on this page (guide §04).
   ========================================================================== */

export const athletePublic = {
  slug: "shammah-kwizera",
  name: "Shammah Kwizera",
  verified: true,
  sport: "Basketball",
  position: "Forward",
  meta: "East Africa • DMV • NCAA Eligible 2026",
  about:
    "Shammah is a rising forward with elite athleticism and a high motor. Competing across the U.S. and Africa, inspiring the next generation.",
  interests: ["Training", "Sneakers", "Faith", "Leadership"],
  stats: [
    { label: "Followers", value: "128K", source: "SELF_REPORTED" as const },
    { label: "Engagement", value: "8.7%", source: "SELF_REPORTED" as const },
    { label: "Monthly Reach", value: "1.2M", source: "ESTIMATED" as const },
    { label: "Core Age", value: "18-24", source: "ESTIMATED" as const },
  ],
  /** Sponsor prices against the SX catalogue. */
  inventory: [
    { jobId: "SX-02", label: "Instagram Post", icon: "post" as const, price: "$350", state: "ACTIVE" as InventoryState },
    { jobId: "SX-03", label: "Instagram Reel", icon: "reel" as const, price: "$600", state: "ACTIVE" as InventoryState },
    { jobId: "SX-01", label: "Story Series (3 frames)", icon: "story" as const, price: "$250", state: "ACTIVE" as InventoryState },
    { jobId: "SX-05", label: "Appearances", icon: "event" as const, price: "$1,000+", state: "LIMITED" as InventoryState },
    { jobId: "SX-07", label: "Brand Ambassador (3 mo.)", icon: "star" as const, price: "$4,500", state: "ACTIVE" as InventoryState },
  ],
};

/* ==========================================================================
   Screens 7-12 fixtures
   ========================================================================== */

/* ---- 7. Inventory Listing (mockup screen 7) ---- */
export const inventoryItem = {
  jobId: "SX-03",
  name: "Player of the Week",
  property: "BTG Sports",
  formats: ["Social", "Video", "All Platforms"],
  about:
    "Weekly highlight of top-performing athletes. Includes graphics, video, and interview clip distributed across all BTG platforms.",
  estViews: 1_200_000,
  cpm: 16,
  estPrice: 1_920_000,
  exclusive: true,
  durationWeeks: 26,
  includes: [
    "Instagram Post + Reel",
    "YouTube Short",
    "Website Feature",
    "iMC Sports Channel",
    "BTG Newsletter",
  ],
  usageRights: "Campaign channels, 90 days from publication",
  approval: "Sponsor approval required before publication",
};

/* ---- 8. Campaign Builder (mockup screen 8) ---- */
export const builderSteps = [
  "Select Inventory",
  "Campaign Details",
  "Rewards (Optional)",
  "Review & Launch",
];

export const builderDraft = {
  name: "Player of the Week - Under Armour",
  dates: "Jun 1, 2026 \u2013 Nov 30, 2026",
  budget: 1_920_000,
  cpm: 16,
  estViews: 1_200_000,
  platforms: [
    { label: "Instagram", on: true },
    { label: "YouTube", on: true },
    { label: "TikTok", on: true },
    { label: "Facebook", on: false },
    { label: "iMC", on: true },
    { label: "Website", on: true },
  ],
};

/** §13 step 3 - eligibility filtering, which the mockup's builder omits. */
export const eligibleAthletes = [
  { slug: "shammah-kwizera", name: "Shammah Kwizera", sport: "Basketball", geo: "DMV", tier: "Creator", score: 78, conflict: null as string | null, selected: true },
  { slug: "marcus-reed", name: "Marcus Reed", sport: "Basketball", geo: "Washington, DC", tier: "Premium", score: 84, conflict: null, selected: true },
  { slug: "jalen-brooks", name: "Jalen Brooks", sport: "Football", geo: "Baltimore, MD", tier: "Premium", score: 71, conflict: null, selected: false },
  { slug: "amara-okafor", name: "Amara Okafor", sport: "Track & Field", geo: "Silver Spring, MD", tier: "Emerging", score: 65, conflict: null, selected: false },
  { slug: "leila-haddad", name: "Leila Haddad", sport: "Soccer", geo: "Rockville, MD", tier: "Creator", score: 69, conflict: "Competing apparel deal", selected: false },
];

/* ---- 9. Campaign Operations Dashboard (mockup screen 9) ---- */
export const campaign = {
  id: "c1",
  name: "Player of the Week",
  presentedBy: "Under Armour",
  state: "ACTIVE" as const,
  daysRemaining: 45,
  viewsDelivered: 823_400,
  viewsTarget: 1_200_000,
  engagements: 42_815,
  rewardsRedeemed: 1_870,
  tabs: ["Overview", "Content Calendar", "Performance", "Rewards", "Leads"],
};

export const campaignSeries = [
  { label: "Jun 1", a: 0, b: 0 },
  { label: "Jun 15", a: 148_000, b: 7_600 },
  { label: "Jul 1", a: 312_000, b: 16_100 },
  { label: "Jul 15", a: 486_000, b: 25_300 },
  { label: "Aug 1", a: 658_000, b: 34_200 },
  { label: "Aug 15", a: 823_400, b: 42_815 },
];

export const topContent = [
  { title: "Week 5 - Highlight Reel", athlete: "Shammah Kwizera", views: 185_000 },
  { title: "Week 4 - Interview", athlete: "Marcus Reed", views: 162_000 },
  { title: "Week 3 - Game Winner", athlete: "Jalen Brooks", views: 149_000 },
];

/** §9.9 - per-athlete acceptance, orders, due dates, under-delivery flags. */
export const campaignRoster = [
  { name: "Shammah Kwizera", slug: "shammah-kwizera", order: "ACCEPTED", delivered: 5, planned: 6, views: 312_540, flag: null as string | null },
  { name: "Marcus Reed", slug: "marcus-reed", order: "ACCEPTED", delivered: 6, planned: 6, views: 268_100, flag: null },
  { name: "Jalen Brooks", slug: "jalen-brooks", order: "ACCEPTED", delivered: 3, planned: 6, views: 149_000, flag: "Under-delivering" },
  { name: "Amara Okafor", slug: "amara-okafor", order: "SENT", delivered: 0, planned: 4, views: 0, flag: "Awaiting acceptance" },
];

/* ---- 10. QR / Reward Creator (mockup screen 10) ---- */
export const rewardSteps = ["Reward Details", "Design", "Distribution"];

export const rewardDraft = {
  sponsor: "Under Armour",
  offer: "20% Off",
  redemptionType: "One-time use",
  expiration: "60 Days",
  terms: "",
  headline: "20% OFF",
  subhead: "YOUR NEXT PURCHASE",
  footer: "BTG WIN REWARD",
};

/* ---- 11. Fan / Reward Analytics (mockup screen 11) ---- */
export const rewardStats = [
  { label: "QR Scans", value: "8,200", delta: "18.2%" },
  { label: "Offers Claimed", value: "4,300", delta: "15.7%" },
  { label: "Rewards Redeemed", value: "1,250", delta: "12.4%" },
  { label: "Revenue Attributed", value: "$52,500", delta: "20.6%", source: "ATTRIBUTED" as const },
];

export const redemptionSeries = [
  { label: "May 1", a: 40, b: 95 },
  { label: "May 8", a: 210, b: 520 },
  { label: "May 15", a: 520, b: 1_390 },
  { label: "May 22", a: 880, b: 2_760 },
  { label: "May 31", a: 1_250, b: 4_300 },
];

export const topLocations = [
  { place: "Washington, DC", pct: 24 },
  { place: "Baltimore, MD", pct: 18 },
  { place: "Silver Spring, MD", pct: 12 },
  { place: "Atlanta, GA", pct: 9 },
  { place: "Kigali, RW", pct: 7 },
];

export const topOffers = [
  { offer: "20% Off Under Armour", count: 1_250 },
  { offer: "$5 Off Any Meal", count: 980 },
  { offer: "Free Drink", count: 620 },
];

/* ---- 12. Sponsor ROI Report (mockup screen 12) ---- */
export const roiReport = {
  campaign: "Player of the Week",
  presentedBy: "Under Armour",
  period: "May 1 \u2013 May 31, 2026",
  roi: "2.73X",
  left: [
    { label: "Investment", value: "$19,200", source: "VERIFIED_MANUAL" as const },
    { label: "Total Views", value: "823,400", source: "VERIFIED_MANUAL" as const },
    { label: "Engagements", value: "42,815", source: "VERIFIED_MANUAL" as const },
    { label: "Leads Generated", value: "4,300", source: "VERIFIED_API" as const },
    { label: "Rewards Redeemed", value: "1,870", source: "VERIFIED_API" as const },
    { label: "Revenue Attributed", value: "$52,500", source: "ATTRIBUTED" as const },
  ],
  right: [
    { label: "Media Value", value: "$32,936", source: "ESTIMATED" as const },
    { label: "Cost per View (CPV)", value: "$0.023", source: "VERIFIED_MANUAL" as const },
    { label: "Cost per Engagement", value: "$0.45", source: "VERIFIED_MANUAL" as const },
  ],
};

export const roiSeries = [
  { label: "May 1", a: 0.4 },
  { label: "May 8", a: 0.9 },
  { label: "May 15", a: 1.5 },
  { label: "May 22", a: 2.1 },
  { label: "May 31", a: 2.73 },
];
