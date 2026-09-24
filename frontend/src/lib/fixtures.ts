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

/** §4 — the same athlete rendered as a minor whose guardian is not yet
 *  verified. Selected by ?demo=minor on athlete-portal pages; the base
 *  `athlete` object is untouched and remains the default. */
export const athleteMinor = {
  ...athlete,
  isMinor: true,
  guardian: {
    legalName: "Immaculée Kwizera",
    verifiedAt: null as string | null,
  },
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
    declineReason: null as string | null,
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
    declineReason: null as string | null,
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
    declineReason: null as string | null,
  },
  {
    id: "inv_4",
    sponsor: "BTG Sports Talk",
    campaign: "Road to College",
    jobId: "SX-06",
    jobName: "Content Day",
    offered: 32_000,
    state: "ACCEPTED" as InviteState,
    expiresIn: "—",
    deliverableCount: 3,
    usageRights: "Campaign channels, 90 days",
    exclusivity: null,
    declineReason: null as string | null,
  },
  {
    id: "inv_5",
    sponsor: "Rockville Athletic",
    campaign: "Spring Open House",
    jobId: "SX-02",
    jobName: "Sponsored Post",
    offered: 9_000,
    state: "DECLINED" as InviteState,
    expiresIn: "—",
    deliverableCount: 1,
    usageRights: "Organic only, 30 days",
    exclusivity: null,
    declineReason:
      "Declined May 4 — scheduling conflict with the state playoff window.",
  },
  {
    id: "inv_6",
    sponsor: "Metro Gear",
    campaign: "Winter Warmup",
    jobId: "SX-01",
    jobName: "Story Drop",
    offered: 4_000,
    state: "EXPIRED" as InviteState,
    expiresIn: "expired 3 days ago",
    deliverableCount: 1,
    usageRights: "Organic only, 30 days",
    exclusivity: null,
    declineReason: null as string | null,
  },
];

/** Copy + relative timing for the invite lifecycle (§21). */
export const INVITE_COPY: Record<InviteState, string> = {
  INVITED: "New invitation",
  VIEWED: "Viewed",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

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
  { state: "HELD" as EarningState, label: "Held", amount: 12_000, count: 1 },
];

/** §21 — why the held order is held; shown beside the state list. One held
 *  order (ern_7), so one note. */
export const heldNote =
  "Skills Lab Series — the published proof failed verification; BTG Finance is re-checking the post URL before this earning can move again (§21).";

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
  { id: "ai1", athlete: "Shammah Kwizera", slug: "shammah-kwizera", sport: "Basketball", tier: "Creator", geo: "DMV", jobId: "SX-03", jobName: "Athlete Reel", sellPrice: 60_000, reach: 128_000, source: "SELF_REPORTED" as const, state: "ACTIVE" as InventoryState, engagementRate: 8.7, onTimeRate: 94, verified: true },
  { id: "ai2", athlete: "Amara Okafor", slug: "amara-okafor", sport: "Track & Field", tier: "Emerging", geo: "Silver Spring, MD", jobId: "SX-02", jobName: "Sponsored Post", sellPrice: 25_000, reach: 21_400, source: "SELF_REPORTED" as const, state: "ACTIVE" as InventoryState, engagementRate: 6.1, onTimeRate: 100, verified: false },
  { id: "ai3", athlete: "Jalen Brooks", slug: "jalen-brooks", sport: "Football", tier: "Premium", geo: "Baltimore, MD", jobId: "SX-05", jobName: "Local Appearance", sellPrice: 75_000, reach: 44_800, source: "VERIFIED_API" as const, state: "LIMITED" as InventoryState, engagementRate: 4.9, onTimeRate: 88, verified: true },
  { id: "ai4", athlete: "Nia Mutesi", slug: "nia-mutesi", sport: "Volleyball", tier: "Emerging", geo: "Kigali, RW", jobId: "SX-01", jobName: "Story Drop", sellPrice: 12_500, reach: 8_900, source: "SELF_REPORTED" as const, state: "ACTIVE" as InventoryState, engagementRate: 7.4, onTimeRate: 100, verified: false },
  { id: "ai5", athlete: "Marcus Reed", slug: "marcus-reed", sport: "Basketball", tier: "Premium", geo: "Washington, DC", jobId: "SX-07", jobName: "Monthly Ambassador", sellPrice: 200_000, reach: 96_200, source: "VERIFIED_MANUAL" as const, state: "ACTIVE" as InventoryState, engagementRate: 5.6, onTimeRate: 96, verified: true },
  { id: "ai6", athlete: "Leila Haddad", slug: "leila-haddad", sport: "Soccer", tier: "Creator", geo: "Rockville, MD", jobId: "SX-04", jobName: "Product Experience", sellPrice: 65_000, reach: 33_100, source: "SELF_REPORTED" as const, state: "SOLD_OUT" as InventoryState, engagementRate: 6.2, onTimeRate: 100, verified: false },
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
    // No age band here: audience demographics are out of scope for Phase 1 —
    // there is no retrieval path for them, so they must not appear even as
    // demo garnish. Taxonomy §8.4.
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
    // No age band — see the note on the property stats above. Taxonomy §8.4.
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
  "Inventory",
  "Details",
  "Athletes",
  "Rewards",
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

/** §9.9 keyed by campaign id. c1 stays the canonical healthy campaign and
 *  reuses the existing exports untouched. c3 "Community Campaign" is THE
 *  under-delivering campaign (sponsorCampaignsX.c3 is pacing BEHIND):
 *  views here (96,200) equal sponsorCampaignsX.c3.views; roster
 *  delivered/planned sums to 11/22 = sponsorCampaigns c3 deliverables;
 *  per-athlete views sum to the campaign total. One declined order on the
 *  roster is part of why it under-delivers. */
export const campaignDetailX: Record<
  "c1" | "c3",
  {
    campaign: typeof campaign;
    series: typeof campaignSeries;
    topContent: typeof topContent;
    roster: typeof campaignRoster;
    notice: string | null;
  }
> = {
  c1: {
    campaign,
    series: campaignSeries,
    topContent,
    roster: campaignRoster,
    notice: null,
  },
  c3: {
    campaign: {
      id: "c3",
      name: "Community Campaign",
      presentedBy: "Under Armour",
      state: "ACTIVE",
      daysRemaining: 45,
      viewsDelivered: 96_200,
      viewsTarget: 400_000,
      engagements: 4_910,
      rewardsRedeemed: 214,
      tabs: campaign.tabs,
    },
    series: [
      { label: "Jul 1", a: 0, b: 0 },
      { label: "Jul 15", a: 18_400, b: 940 },
      { label: "Aug 1", a: 44_100, b: 2_260 },
      { label: "Aug 15", a: 71_800, b: 3_680 },
      { label: "Sep 1", a: 96_200, b: 4_910 },
    ],
    topContent: [
      { title: "Community Day — Recap Reel", athlete: "Marcus Reed", views: 38_900 },
      { title: "Coach's Corner — Ep. 2", athlete: "Jalen Brooks", views: 24_300 },
      { title: "Neighborhood Clinic — Story", athlete: "Marcus Reed", views: 18_100 },
    ],
    roster: [
      { name: "Marcus Reed", slug: "marcus-reed", order: "ACCEPTED", delivered: 8, planned: 8, views: 57_000, flag: null },
      { name: "Jalen Brooks", slug: "jalen-brooks", order: "ACCEPTED", delivered: 3, planned: 8, views: 39_200, flag: "Under-delivering" },
      { name: "Amara Okafor", slug: "amara-okafor", order: "DECLINED", delivered: 0, planned: 6, views: 0, flag: "Replacement needed" },
    ],
    notice:
      "11 of 22 deliverables landed and views are pacing behind target — one Campaign Order was declined and one athlete is under-delivering. Re-match the declined slot or adjust the order (§9.9).",
  },
};

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

export type RewardState =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "EXPIRED"
  | "PENDING_LEGAL";

export const REWARD_COPY: Record<RewardState, string> = {
  DRAFT: "Being written — fans can't see it and no tokens exist yet.",
  SCHEDULED: "Ready to go; tokens generate when the start date hits.",
  ACTIVE: "Live — athletes are distributing tokens and fans can redeem.",
  EXPIRED: "Past its end date. Tokens stopped resolving; history is kept.",
  PENDING_LEGAL: "Sweepstakes-style rewards need legal approval before launch (§16).",
};

/** Fan reward types — §16's redemption models, one line each for the creator. */
export const REWARD_TYPES = [
  { value: "One-time use", blurb: "Each token redeems once — enforced by a partial unique index on RewardEvent, not an app check (guide §03)." },
  { value: "Campaign code", blurb: "A shared code fans can reuse until the reward expires. Good for online checkouts." },
  { value: "Event check-in", blurb: "Redeems only at the venue on event day — staff scan the fan's screen." },
  { value: "Lead capture", blurb: "Fan trades contact details for the reward. §26 consent copy is mandatory." },
  { value: "Sweepstakes entry", blurb: "Entry into a prize draw. Blocked until counsel approves the rules (§16).", blocked: true },
] as const;

/* Reward list — §16 event counts (scans/claims/redeemed) roll up exactly to
   rewardFunnel's 8,200 / 4,300 / 1,870, so the desk's header math and the
   analytics screen agree. Rows with zero traffic (drafts, scheduled, blocked)
   contribute nothing, which is why the sums close. */
export const rewards = [
  { id: "rw1", offer: "20% Off", sponsor: "Under Armour", type: "One-time use", state: "ACTIVE" as RewardState, expires: "Jun 30, 2026", created: "May 1, 2026", athletes: 6, scans: 3_120, claims: 1_650, redeemed: 720 },
  { id: "rw2", offer: "$5 Off Any Meal", sponsor: "Silver Spring Grill", type: "One-time use", state: "ACTIVE" as RewardState, expires: "Jul 15, 2026", created: "May 4, 2026", athletes: 4, scans: 2_240, claims: 1_180, redeemed: 540 },
  { id: "rw3", offer: "Free Drink", sponsor: "Silver Spring Grill", type: "Event check-in", state: "ACTIVE" as RewardState, expires: "End of campaign", created: "May 9, 2026", athletes: 3, scans: 1_410, claims: 760, redeemed: 310 },
  { id: "rw4", offer: "BOGO Training Tee", sponsor: "Under Armour", type: "Campaign code", state: "EXPIRED" as RewardState, expires: "May 31, 2026", created: "Apr 18, 2026", athletes: 2, scans: 690, claims: 340, redeemed: 120 },
  { id: "rw5", offer: "Free Shipping Weekend", sponsor: "Kigali Sports Co.", type: "Campaign code", state: "EXPIRED" as RewardState, expires: "May 24, 2026", created: "Apr 30, 2026", athletes: 3, scans: 460, claims: 250, redeemed: 110 },
  { id: "rw6", offer: "Game-Day Poster", sponsor: "BTG Events", type: "Lead capture", state: "ACTIVE" as RewardState, expires: "Aug 1, 2026", created: "May 20, 2026", athletes: 2, scans: 280, claims: 120, redeemed: 70 },
  { id: "rw7", offer: "VIP Meet & Greet", sponsor: "BTG Events", type: "Sweepstakes entry", state: "PENDING_LEGAL" as RewardState, expires: "—", created: "May 22, 2026", athletes: 0, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw8", offer: "10% Off Cleats", sponsor: "Kigali Sports Co.", type: "One-time use", state: "DRAFT" as RewardState, expires: "—", created: "May 26, 2026", athletes: 0, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw9", offer: "Season-Opener Combo", sponsor: "Silver Spring Grill", type: "One-time use", state: "SCHEDULED" as RewardState, expires: "Sep 30, 2026", created: "May 27, 2026", athletes: 5, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw10", offer: "Free Gym Day Pass", sponsor: "BTG Events", type: "Event check-in", state: "SCHEDULED" as RewardState, expires: "Oct 12, 2026", created: "May 28, 2026", athletes: 3, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw11", offer: "15% Off Team Kits", sponsor: "Under Armour", type: "Campaign code", state: "DRAFT" as RewardState, expires: "—", created: "May 29, 2026", athletes: 0, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw12", offer: "Signed Ball Raffle", sponsor: "Kigali Sports Co.", type: "Sweepstakes entry", state: "PENDING_LEGAL" as RewardState, expires: "—", created: "May 30, 2026", athletes: 0, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw13", offer: "Family Meal Deal", sponsor: "Silver Spring Grill", type: "One-time use", state: "DRAFT" as RewardState, expires: "—", created: "Jun 1, 2026", athletes: 0, scans: 0, claims: 0, redeemed: 0 },
  { id: "rw14", offer: "Back-to-School Bundle", sponsor: "Under Armour", type: "Lead capture", state: "SCHEDULED" as RewardState, expires: "Sep 5, 2026", created: "Jun 2, 2026", athletes: 4, scans: 0, claims: 0, redeemed: 0 },
];

/* ---- 11. Fan / Reward Analytics — Guided Story (spec 2026-09-17) ----

   One dataset per range. Chapter 1's scans/claims/redemptions KPIs are
   DERIVED from `funnel`, and `series` ends on the funnel's claim/redeem
   counts, so chapters can never disagree on the same metric. Athlete rows
   (base = 30d) are scaled by `athleteFactor`; the 30d base sums match the
   30d funnel (claims 4,300 / redeemed 1,870) for cross-chapter coherence. */

export type RangeKey = "7d" | "30d" | "90d";

export type AnalyticsDataset = {
  label: string;
  /** scan → landing → claim → redeem. §16 stores each as its own event row. */
  funnel: { stage: string; value: number; blurb: string }[];
  /** vs the previous period of the same length. */
  deltas: { scans: string; claims: string; redeemed: string; revenue: string };
  /** Whole dollars; ATTRIBUTED (modeled), never claimed as verified. */
  revenue: number;
  /** Cumulative: a = redemptions, b = claims. Last point matches `funnel`. */
  series: { label: string; a: number; b: number }[];
  /** Ranked by redemptions — what fans used, not what they grabbed. */
  offers: { offer: string; count: number }[];
  /** Multiplier on athleteLeaderboard base counts for this range. */
  athleteFactor: number;
};

const FUNNEL_BLURBS = [
  "fan opened the QR",
  "reward page loaded",
  "reward saved to phone",
  "shown at the venue",
];

const funnelStages = (
  scan: number,
  landing: number,
  claim: number,
  redeem: number,
) =>
  [
    { stage: "Scan", value: scan, blurb: FUNNEL_BLURBS[0] },
    { stage: "Landing", value: landing, blurb: FUNNEL_BLURBS[1] },
    { stage: "Claim", value: claim, blurb: FUNNEL_BLURBS[2] },
    { stage: "Redeem", value: redeem, blurb: FUNNEL_BLURBS[3] },
  ];

export const analyticsRanges: Record<RangeKey, AnalyticsDataset> = {
  "7d": {
    label: "Last 7 days",
    funnel: funnelStages(2_140, 1_690, 1_180, 510),
    deltas: { scans: "6.1%", claims: "5.4%", redeemed: "4.2%", revenue: "5.0%" },
    revenue: 14_200,
    series: [
      { label: "Mon", a: 45, b: 120 },
      { label: "Tue", a: 120, b: 310 },
      { label: "Wed", a: 200, b: 495 },
      { label: "Thu", a: 275, b: 660 },
      { label: "Fri", a: 350, b: 840 },
      { label: "Sat", a: 435, b: 1_030 },
      { label: "Sun", a: 510, b: 1_180 },
    ],
    offers: [
      { offer: "20% Off Under Armour", count: 225 },
      { offer: "$5 Off Any Meal", count: 150 },
      { offer: "Free Drink", count: 85 },
    ],
    athleteFactor: 0.284,
  },
  "30d": {
    /* Scans/claims/redeems match rewardFunnel (and the rewards desk's header
       math) — 8,200 / 4,300 / 1,870 — so the two screens can't disagree. */
    label: "Last 30 days",
    funnel: funnelStages(8_200, 6_410, 4_300, 1_870),
    deltas: { scans: "18.2%", claims: "15.7%", redeemed: "12.4%", revenue: "20.6%" },
    revenue: 52_500,
    series: [
      { label: "May 1", a: 60, b: 95 },
      { label: "May 8", a: 320, b: 520 },
      { label: "May 15", a: 780, b: 1_390 },
      { label: "May 22", a: 1_320, b: 2_760 },
      { label: "May 31", a: 1_870, b: 4_300 },
    ],
    offers: [
      { offer: "20% Off Under Armour", count: 820 },
      { offer: "$5 Off Any Meal", count: 560 },
      { offer: "Free Drink", count: 310 },
    ],
    athleteFactor: 1,
  },
  "90d": {
    label: "Last 90 days",
    funnel: funnelStages(21_900, 17_300, 11_600, 4_980),
    deltas: { scans: "41.3%", claims: "36.8%", redeemed: "33.5%", revenue: "38.9%" },
    revenue: 139_800,
    series: [
      { label: "Mar 15", a: 700, b: 1_650 },
      { label: "Mar 31", a: 1_350, b: 3_210 },
      { label: "Apr 15", a: 2_250, b: 5_340 },
      { label: "Apr 30", a: 3_220, b: 7_620 },
      { label: "May 15", a: 4_130, b: 9_700 },
      { label: "May 31", a: 4_980, b: 11_600 },
    ],
    offers: [
      { offer: "20% Off Under Armour", count: 2_190 },
      { offer: "$5 Off Any Meal", count: 1_480 },
      { offer: "Free Drink", count: 840 },
    ],
    athleteFactor: 2.66,
  },
};

/* §9 screen 11 / §22 — the athlete half of analytics. Base counts are the
   30d period; claims sum 4,300 and redemptions sum 1,870 = the 30d funnel.
   `source` labels views/engagement data quality per §22 — claims/redeems
   are always ours (§16 Postgres events). */
export type AthleteLeaderRow = {
  name: string;
  sport: string;
  views: number;
  engagement: number; // %
  claims: number;
  redeemed: number;
  score: number; // §14 Content Value Score
  source: "VERIFIED_API" | "SELF_REPORTED" | "ESTIMATED";
};

export const athleteLeaderboard: AthleteLeaderRow[] = [
  { name: "Maya Torres", sport: "Basketball · Georgetown", views: 212_400, engagement: 8.4, claims: 1_510, redeemed: 910, score: 96, source: "VERIFIED_API" },
  { name: "Jaylen Okafor", sport: "Football · Howard", views: 148_200, engagement: 6.1, claims: 1_050, redeemed: 480, score: 88, source: "VERIFIED_API" },
  { name: "Riley Chen", sport: "Soccer · Maryland", views: 96_500, engagement: 5.2, claims: 780, redeemed: 270, score: 82, source: "SELF_REPORTED" },
  { name: "Dre Williams", sport: "Track · Morgan State", views: 71_300, engagement: 4.6, claims: 560, redeemed: 140, score: 77, source: "ESTIMATED" },
  { name: "Sofia Marino", sport: "Volleyball · GWU", views: 55_100, engagement: 3.9, claims: 400, redeemed: 70, score: 74, source: "ESTIMATED" },
];

export const topLocations = [
  { place: "Washington, DC", pct: 24 },
  { place: "Baltimore, MD", pct: 18 },
  { place: "Silver Spring, MD", pct: 12 },
  { place: "Atlanta, GA", pct: 9 },
  { place: "Kigali, RW", pct: 7 },
];

/* ---- 12. Sponsor ROI Report (mockup screen 12) ---- */
export const roiReport = {
  campaign: "Player of the Week",
  presentedBy: "Under Armour",
  period: "May 1 \u2013 May 31, 2026",
  roi: "2.73X",
  left: [
    { label: "Investment", value: "$19,200", source: "VERIFIED_MANUAL" as const },
    // Rollups of per-athlete figures the athletes reported themselves, so they
    // inherit SELF_REPORTED — a total cannot be more verified than its parts.
    // Taxonomy §4.2. To make these verified, verify each athlete's contribution.
    { label: "Total Views", value: "823,400", source: "SELF_REPORTED" as const },
    { label: "Engagements", value: "42,815", source: "SELF_REPORTED" as const },
    // F-4 · both come from SponsorX's own reward funnel, not an outside
    // platform, so they are VERIFIED_SYSTEM — the strongest label, because we
    // recorded the events ourselves and can audit them. Taxonomy §2.
    { label: "Leads Generated", value: "4,300", source: "VERIFIED_SYSTEM" as const },
    { label: "Rewards Redeemed", value: "1,870", source: "VERIFIED_SYSTEM" as const },
    { label: "Revenue Attributed", value: "$52,500", source: "ATTRIBUTED" as const },
  ],
  right: [
    { label: "Media Value", value: "$32,936", source: "ESTIMATED" as const },
    // Derived from Investment ÷ the rollups above, so they take the weakest
    // input — taxonomy §4.1. Verified investment ÷ self-reported views is not
    // a verified cost.
    { label: "Cost per View (CPV)", value: "$0.023", source: "SELF_REPORTED" as const },
    { label: "Cost per Engagement", value: "$0.45", source: "SELF_REPORTED" as const },
  ],
};

export const roiSeries = [
  { label: "May 1", a: 0.4 },
  { label: "May 8", a: 0.9 },
  { label: "May 15", a: 1.5 },
  { label: "May 22", a: 2.1 },
  { label: "May 31", a: 2.73 },
];

/* ==========================================================================
   Roadmap A1 additions — data for the ten screens built on fixtures.

   Same rule as everything above: shapes mirror the V2 Prisma models (guide
   §03) so Block B is a substitution, not a rewrite. Amounts in cents.
   ========================================================================== */

/* ---- (public)/join — Athlete application, §11 · §39 front door ----
   Section data and flow logic live in src/lib/join-flow.ts (P1-ART-07 wizard,
   2026-09-21). Agreement is click-wrap against v0.4 draft — G-05 stopped
   being a gate on 2026-09-15, so the old "blocked until counsel" copy that
   lived here is retired with the block. */

/* ---- athlete/orders/[id] — Campaign Order, §12 · guide §08 ---- */

/**
 * Terms shared by the Campaign Order view. Deliverable specs are derived from
 * the invitation in-page; these are the parts common to every order. The
 * agreement body is deliberately a placeholder: guide §08 blocks acceptance
 * until counsel approves the Campaign Order template.
 */
export const orderTerms = {
  agreementVersion: "Campaign Order · draft (counsel review pending)",
  paymentSchedule:
    "Earnings status is tracked in SponsorX; funds move outside the system in Phase 1 (§26). No tax ID or bank details are collected.",
  clauses: [
    "Scope of deliverables and due dates",
    "Compensation and earnings status",
    "Usage rights and term",
    "Category exclusivity, where applicable",
    "Content approval and revision process (§21)",
    "Cancellation and under-delivery",
  ],
};

/* ---- admin/applications — review queue + AthleteScore snapshot (§14) ---- */

export type ApplicationState = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

/**
 * §14 Content Value Score is rules-based in Phase 1 (`method: "rules-v1"`),
 * stored as a factor snapshot so a score can be explained after the fact.
 * Factors: engagement, content quality, audience, reliability, geography, fit,
 * sponsor performance.
 */
export const applications = [
  {
    id: "app_1",
    name: "Amara Okafor",
    slug: "amara-okafor",
    sport: "Track & Field",
    region: "Silver Spring, MD",
    submittedAt: "2 hours ago",
    state: "SUBMITTED" as ApplicationState,
    isMinor: false,
    guardianVerified: null as boolean | null,
    followers: 21_400,
    flags: [] as string[],
    score: {
      total: 65,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 72 },
        { label: "Content quality", value: 68 },
        { label: "Audience", value: 54 },
        { label: "Reliability", value: 60 },
        { label: "Geography", value: 80 },
        { label: "Fit", value: 66 },
      ],
    },
  },
  {
    id: "app_2",
    name: "Nia Mutesi",
    slug: "nia-mutesi",
    sport: "Volleyball",
    region: "Kigali, RW",
    submittedAt: "1 day ago",
    state: "UNDER_REVIEW" as ApplicationState,
    isMinor: true,
    guardianVerified: false,
    followers: 8_900,
    flags: ["Guardian verification pending"],
    score: {
      total: 58,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 61 },
        { label: "Content quality", value: 70 },
        { label: "Audience", value: 40 },
        { label: "Reliability", value: 55 },
        { label: "Geography", value: 62 },
        { label: "Fit", value: 60 },
      ],
    },
  },
  {
    id: "app_3",
    name: "Jalen Brooks",
    slug: "jalen-brooks",
    sport: "Football",
    region: "Baltimore, MD",
    submittedAt: "2 days ago",
    state: "UNDER_REVIEW" as ApplicationState,
    isMinor: false,
    guardianVerified: null,
    followers: 44_800,
    flags: ["Competing apparel deal declared — check conflicts (§26)"],
    score: {
      total: 71,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 66 },
        { label: "Content quality", value: 74 },
        { label: "Audience", value: 78 },
        { label: "Reliability", value: 70 },
        { label: "Geography", value: 68 },
        { label: "Fit", value: 70 },
      ],
    },
  },
  {
    id: "app_4",
    name: "Leila Haddad",
    slug: "leila-haddad",
    sport: "Soccer",
    region: "Rockville, MD",
    submittedAt: "4 days ago",
    state: "APPROVED" as ApplicationState,
    isMinor: false,
    guardianVerified: null,
    followers: 33_100,
    flags: [] as string[],
    score: {
      total: 69,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 71 },
        { label: "Content quality", value: 72 },
        { label: "Audience", value: 64 },
        { label: "Reliability", value: 68 },
        { label: "Geography", value: 70 },
        { label: "Fit", value: 69 },
      ],
    },
  },
  {
    id: "app_5",
    name: "Devon Price",
    slug: "devon-price",
    sport: "Football",
    region: "Alexandria, VA",
    submittedAt: "6 days ago",
    state: "REJECTED" as ApplicationState,
    isMinor: false,
    guardianVerified: null as boolean | null,
    followers: 3_900,
    flags: [
      "Category conflict — active exclusivity with a competing apparel brand (§26)",
    ] as string[],
    score: {
      total: 38,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 41 },
        { label: "Content quality", value: 35 },
        { label: "Audience", value: 22 },
        { label: "Reliability", value: 48 },
        { label: "Geography", value: 74 },
        { label: "Fit", value: 18 },
      ],
    },
  },
  {
    id: "app_6",
    name: "Tyler Nguyen",
    slug: "tyler-nguyen",
    sport: "Soccer",
    region: "Rockville, MD",
    submittedAt: "3 days ago",
    state: "SUBMITTED" as ApplicationState,
    isMinor: true,
    guardianVerified: false as boolean | null,
    followers: 12_800,
    flags: [
      "Guardian authorization pending — cannot go ACTIVE until verified (§4)",
    ] as string[],
    score: {
      total: 61,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 66 },
        { label: "Content quality", value: 63 },
        { label: "Audience", value: 47 },
        { label: "Reliability", value: 58 },
        { label: "Geography", value: 82 },
        { label: "Fit", value: 60 },
      ],
    },
  },
];

export const APPLICATION_COPY: Record<ApplicationState, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/* ---- admin/approvals — content approval workspace (§21) ---- */

/**
 * The deliverables awaiting a decision, with the creative-asset reference that
 * lives in the private R2 bucket (signed URLs only — never public, guide §11).
 */
export type ReviewContentItem = {
  id: string;
  campaign: string;
  sponsor: string;
  title: string;
  dueDate: string;
  state: DeliverableState;
  revisionRequested: boolean;
  athlete: string;
  assetKind: "video" | "image";
  version: number;
  submittedAt: string;
  /** Hours since submission — drives the aging flag and "waiting longest". */
  waitingHours: number;
  /** Cleared rows only — when the deliverable left the review desks. */
  clearedAt?: string;
};

/** Review-desk fields for Shammah's rows, keyed by deliverable id — his rows
 *  derive from `deliverables` so the athlete portal stays the single source. */
const QUEUE_META: Record<
  string,
  Pick<ReviewContentItem, "assetKind" | "version" | "submittedAt" | "waitingHours">
> = {
  del_1: { assetKind: "video", version: 2, submittedAt: "9 hours ago", waitingHours: 9 },
  del_2: { assetKind: "video", version: 3, submittedAt: "1 day ago", waitingHours: 26 },
};

export const contentReviewQueue: ReviewContentItem[] = [
  ...deliverables
    .filter((d) => d.state === "BTG_REVIEW" || d.state === "SPONSOR_REVIEW" || d.state === "DRAFT_SUBMITTED")
    .map((d) => ({
      ...d,
      athlete: "Shammah Kwizera",
      ...(QUEUE_META[d.id] ?? {
        assetKind: "video" as const,
        version: 2,
        submittedAt: "1 day ago",
        waitingHours: 26,
      }),
    })),
  /* The rest of the network's queue — these rows exist only on the admin
     desk; athlete-portal pages read `deliverables` and never see them. */
  {
    id: "del_q3",
    campaign: "Community Campaign",
    sponsor: "Silver Spring Grill",
    title: "Community day recap — photo set",
    dueDate: "May 16",
    state: "DRAFT_SUBMITTED",
    revisionRequested: false,
    athlete: "Amara Diallo",
    assetKind: "image",
    version: 1,
    submittedAt: "3 hours ago",
    waitingHours: 3,
  },
  {
    id: "del_q4",
    campaign: "Skills Lab Series",
    sponsor: "BTG Sports Talk",
    title: "Skills lab session — cut 2",
    dueDate: "May 14",
    state: "BTG_REVIEW",
    revisionRequested: false,
    athlete: "Jordan Okafor",
    assetKind: "video",
    version: 3,
    submittedAt: "2 days ago",
    waitingHours: 50,
  },
  {
    id: "del_q5",
    campaign: "Local Blitz — Spring",
    sponsor: "Silver Spring Grill",
    title: "Story drop + swipe-up",
    dueDate: "May 19",
    state: "DRAFT_SUBMITTED",
    revisionRequested: false,
    athlete: "Maya Chen",
    assetKind: "image",
    version: 1,
    submittedAt: "6 hours ago",
    waitingHours: 6,
  },
  {
    id: "del_q6",
    campaign: "Player of the Week",
    sponsor: "Under Armour",
    title: "Training montage — week 5",
    dueDate: "May 15",
    state: "SPONSOR_REVIEW",
    revisionRequested: false,
    athlete: "Leo Barros",
    assetKind: "video",
    version: 2,
    submittedAt: "18 hours ago",
    waitingHours: 18,
  },
];

/** When each of Shammah's cleared deliverables left the review desks. */
const CLEARED_AT: Record<string, string> = { del_4: "May 10", del_5: "May 7" };

/** Recently cleared content — past both reviews (APPROVED and beyond, §21). */
export const contentCleared: ReviewContentItem[] = [
  ...deliverables
    .filter((d) => d.state === "APPROVED" || d.state === "PUBLISHED" || d.state === "VERIFIED")
    .map((d) => ({
      ...d,
      athlete: "Shammah Kwizera",
      assetKind: "video" as const,
      version: 2,
      submittedAt: "May 8",
      waitingHours: 0,
      clearedAt: CLEARED_AT[d.id] ?? "May 10",
    })),
  {
    id: "del_c3",
    campaign: "Community Campaign",
    sponsor: "Silver Spring Grill",
    title: "Sponsor shoutout reel",
    dueDate: "May 12",
    state: "APPROVED",
    revisionRequested: false,
    athlete: "Amara Diallo",
    assetKind: "video",
    version: 2,
    submittedAt: "May 11",
    waitingHours: 0,
    clearedAt: "May 12",
  },
  {
    id: "del_c4",
    campaign: "Skills Lab Series",
    sponsor: "BTG Sports Talk",
    title: "Community day recap — ep. 1",
    dueDate: "May 5",
    state: "VERIFIED",
    revisionRequested: false,
    athlete: "Jordan Okafor",
    assetKind: "image",
    version: 1,
    submittedAt: "May 3",
    waitingHours: 0,
    clearedAt: "May 5",
  },
];

/* ---- admin/finance & athlete/earnings — Earning rows + Zoho refs ---- */

/**
 * Per-order earning rows (Earning model, §21). Status only — no tax ID, no bank
 * details (§26, Addendum A6). `reference` holds a Zoho/payment reference where
 * one exists, never a credential.
 */
export const earningItems = [
  { id: "ern_1", athlete: "Shammah Kwizera", campaign: "Player of the Week", jobId: "SX-03", jobName: "Athlete Reel", amount: 15_000, state: "ELIGIBLE" as EarningState, reference: null as string | null, updatedAt: "May 16" },
  { id: "ern_2", athlete: "Shammah Kwizera", campaign: "Player of the Week", jobId: "SX-06", jobName: "Content Day", amount: 32_000, state: "APPROVED_FOR_PAYOUT" as EarningState, reference: "ZB-2026-0412", updatedAt: "May 14" },
  { id: "ern_3", athlete: "Shammah Kwizera", campaign: "Road to College", jobId: "SX-01", jobName: "Story Drop", amount: 4_000, state: "PENDING" as EarningState, reference: null, updatedAt: "May 18" },
  { id: "ern_4", athlete: "Marcus Reed", campaign: "Player of the Week", jobId: "SX-07", jobName: "Monthly Ambassador", amount: 65_000, state: "PAID" as EarningState, reference: "ZB-2026-0388", updatedAt: "May 2" },
  { id: "ern_5", athlete: "Jalen Brooks", campaign: "Player of the Week", jobId: "SX-05", jobName: "Local Appearance", amount: 28_000, state: "HELD" as EarningState, reference: null, updatedAt: "May 10" },
  { id: "ern_6", athlete: "Amara Okafor", campaign: "Local Blitz — Spring", jobId: "SX-02", jobName: "Sponsored Post", amount: 9_000, state: "DISPUTED" as EarningState, reference: null, updatedAt: "May 9" },
  { id: "ern_7", athlete: "Shammah Kwizera", campaign: "Skills Lab Series", jobId: "SX-02", jobName: "Sponsored Post", amount: 12_000, state: "HELD" as EarningState, reference: null, updatedAt: "May 17" },
];

export const EARNING_COPY: Record<EarningState, string> = {
  PENDING: "Pending",
  ELIGIBLE: "Eligible",
  APPROVED_FOR_PAYOUT: "Approved for payout",
  PAID: "Paid",
  HELD: "Held",
  DISPUTED: "Disputed",
};

/**
 * Sponsor invoices live in Zoho Books; SponsorX holds only the reference and
 * the status Zoho reports. Inbound only — SponsorX never writes invoices (§18).
 */
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";
export const sponsorInvoices = [
  { id: "inv_zb_1", sponsor: "Under Armour", campaign: "Player of the Week", ref: "ZB-2026-0412", amount: 1_920_000, status: "PAID" as InvoiceStatus, issuedAt: "May 1" },
  { id: "inv_zb_2", sponsor: "Silver Spring Grill", campaign: "Local Blitz — Spring", ref: "ZB-2026-0431", amount: 280_000, status: "SENT" as InvoiceStatus, issuedAt: "May 8" },
  { id: "inv_zb_3", sponsor: "Kigali Sports Co.", campaign: "Community Campaign", ref: "ZB-2026-0440", amount: 500_000, status: "OVERDUE" as InvoiceStatus, issuedAt: "Apr 24" },
  { id: "inv_zb_4", sponsor: "BTG Sports Talk", campaign: "Road to College", ref: "ZB-2026-0455", amount: 75_000, status: "DRAFT" as InvoiceStatus, issuedAt: "—" },
];

export const INVOICE_COPY: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
};

/* ---- admin (§23) — command center: integration health + activity ---- */

/**
 * §23 requires an integration-health view. These systems are the stack in
 * CLAUDE.md; Zoho is never on a request path (queued), so "syncing" is normal
 * and not an error state.
 */
export type HealthStatus = "OK" | "SYNCING" | "DEGRADED" | "DOWN";
export const integrationHealth = [
  { system: "Clerk", detail: "Auth + MFA", status: "OK" as HealthStatus },
  { system: "Postgres", detail: "Products · queue · audit log", status: "OK" as HealthStatus },
  { system: "Worker queue", detail: "0 jobs waiting · 0 failed", status: "OK" as HealthStatus },
  { system: "Zoho CRM + Books", detail: "Last sync 4 min ago · 2 queued", status: "SYNCING" as HealthStatus },
  { system: "Cloudflare R2", detail: "Public CDN + private signed", status: "OK" as HealthStatus },
];

export const HEALTH_COPY: Record<HealthStatus, string> = {
  OK: "Operational",
  SYNCING: "Syncing",
  DEGRADED: "Degraded",
  DOWN: "Down",
};

/** §23 activity feed — recent events across the marketplace. */
export const adminActivity = [
  { at: "2h", text: "Amara Okafor submitted an application", kind: "application" as const },
  { at: "5h", text: "Under Armour — Player of the Week: 2 deliverables entered BTG review", kind: "content" as const },
  { at: "1d", text: "Invoice ZB-2026-0412 marked paid in Zoho Books", kind: "finance" as const },
  { at: "1d", text: "Jalen Brooks flagged for a competing apparel deal", kind: "conflict" as const },
  { at: "2d", text: "Leila Haddad application approved", kind: "application" as const },
];

/* ==========================================================================
   Sponsor portal redesign fixtures (spec 2026-09-11).

   Same discipline as everything above: every figure is retrievable —
   MetricDaily, RewardEvent (+resolve-geo), Deliverable, Zoho Books/CRM, or a
   platform API — and carries its provenance. Curated constants (benchmarks,
   market CPM) are ESTIMATED and say so. Amounts in cents.
   ========================================================================== */

/* ---- /sponsor hero — MetricDaily daily cumulative, May 1–31 ---- */

const heroDay = (i: number) => {
  // Smooth ease with a gentle organic wobble; lands exactly on the totals.
  const t = (i + 1) / 31;
  const ease = t * t * (3 - 2 * t);
  const wobble = 1 + 0.05 * Math.sin(i * 1.7) * (1 - t);
  return {
    label: `May ${i + 1}`,
    a: Math.round(823_400 * ease * wobble),
    b: Math.round(42_815 * ease * wobble),
  };
};

export const sponsorHero = {
  views: 823_400,
  deltaPct: 12.5,
  target: 1_200_000,
  pacingPct: 104,
  projectedTotal: "1.31M",
  series: Array.from({ length: 31 }, (_, i) => heroDay(i)),
  /** Dashed tail — linear extrapolation of the May run-rate (ESTIMATED). */
  projection: [
    { label: "Jun 4", a: 878_000 },
    { label: "Jun 8", a: 924_000 },
    { label: "Jun 11", a: 967_000 },
    { label: "Jun 15", a: 1_018_000 },
  ],
  breakEvenIndex: 13,
  breakEvenLabel: "broke even · May 14",
};

/** Computed callouts — RewardEvent + MetricDaily queries, written as copy. */
export const sponsorInsights = [
  { icon: "⚡", text: "Engagement spiked 2.1× on May 18 — Shammah's Week 5 reel" },
  { icon: "📈", text: "Weekend scans beat weekdays by 34%" },
  { icon: "⏱", text: "Half of fans redeem within 26h of scanning" },
];

/** MetricDaily.source distribution — provenance metadata, not a metric. */
export const metricTrust = [
  { label: "verified API", pct: 58, className: "bg-success" },
  { label: "verified manual", pct: 24, className: "bg-primary" },
  { label: "attributed", pct: 11, className: "bg-admin" },
  { label: "estimated", pct: 7, className: "bg-surface-2" },
];

/** Zoho Books — contracted vs invoiced-and-paid to date. */
export const sponsorBudget = { contracted: 4_750_000, spent: 3_025_000 };

/** Daily engagement counts for the bento sparkline (last 8 MetricDaily rows). */
export const engagementSpark = [980, 1_240, 1_105, 1_610, 1_465, 1_890, 2_040, 2_215];

/**
 * Per-campaign display extension keyed by sponsorCampaigns id — keeps the
 * original array intact for /admin. Views from MetricDaily; pacing compares
 * delivery progress against elapsed campaign time (Deliverable dates).
 */
export const sponsorCampaignsX: Record<
  string,
  { views: number; monogram: string; endsIn: string; pacing: "ON_TRACK" | "BEHIND" }
> = {
  c1: { views: 312_540, monogram: "PW", endsIn: "ends in 12 days", pacing: "ON_TRACK" },
  c2: { views: 148_900, monogram: "LB", endsIn: "reporting", pacing: "ON_TRACK" },
  c3: { views: 96_200, monogram: "CC", endsIn: "45 days left", pacing: "BEHIND" },
  c4: { views: 201_300, monogram: "SL", endsIn: "completed", pacing: "ON_TRACK" },
  c5: { views: 64_460, monogram: "RC", endsIn: "staffing", pacing: "ON_TRACK" },
};

/** MetricDaily grouped by deliverable→athlete, top 3 by views. */
export const topAthletes = [
  { rank: 1, name: "Shammah Kwizera", initials: "SK", views: 312_540, flag: null as string | null },
  { rank: 2, name: "Marcus Reed", initials: "MR", views: 268_100, flag: null },
  { rank: 3, name: "Jalen Brooks", initials: "JB", views: 149_000, flag: "under-delivering" },
];

/* ---- ROI report (c1) ---- */

export const roiGauge = {
  value: "2.73×",
  /** Ring sweep — 2.73 on a 0–4× demo scale. */
  sweep: 0.68,
  invested: 1_920_000,
  attributed: 5_250_000,
  mediaValue: 3_293_600,
};

/** Return multiple over time; crosses 1.0× at breakEvenIndex. */
export const roiTimeline = {
  series: [
    { label: "May 1", a: 0.1 },
    { label: "May 5", a: 0.35 },
    { label: "May 9", a: 0.68 },
    { label: "May 14", a: 1.0 },
    { label: "May 18", a: 1.42 },
    { label: "May 22", a: 1.9 },
    { label: "May 26", a: 2.31 },
    { label: "May 31", a: 2.73 },
  ],
  breakEvenIndex: 3,
  breakEvenLabel: "1.0× · May 14",
};

/** MetricDaily grouped by deliverable→NilJob (SX taxonomy). */
export const formatPerformance = [
  { label: "Reels", sub: "SX-03", value: 412_000, display: "412K", tone: "primary" as const },
  { label: "Posts", sub: "SX-02", value: 218_400, display: "218K", tone: "soft" as const },
  { label: "Stories", sub: "SX-01", value: 133_000, display: "133K", tone: "soft" as const },
  { label: "Appearances", sub: "SX-05", value: 60_000, display: "60K ▼", tone: "warn" as const },
];
export const formatInsight = "Reels deliver 3.1× the views-per-dollar of stories";

/** MetricDaily grouped by deliverable→platform. VERIFIED_MANUAL until OAuth. */
export const platformSplit = {
  segments: [
    { label: "Instagram", value: 428_200, color: "var(--sx-primary)" },
    { label: "TikTok", value: 264_100, color: "var(--sx-accent)" },
    { label: "YouTube", value: 131_100, color: "var(--sx-primary-soft)" },
  ],
  leaderPct: "52%",
  leader: "Instagram",
  insight: "TikTok engagement rate is 2.4× Instagram's — despite fewer views",
};

/** RewardEvent × resolve-geo (city-level, no IP stored). */
export const geoMarkets = [
  { label: "Washington DC", value: 24, display: "24%" },
  { label: "Baltimore", value: 18, display: "18%" },
  { label: "Silver Spring", value: 12, display: "12%" },
  { label: "Atlanta", value: 9, display: "9%" },
  { label: "Kigali", value: 7, display: "7%" },
];
export const geoInsight = "54% of redemptions within 25mi of DC — city-level only, no IP stored";

/** RewardEvent funnel with latency + lead push (consent-gated → Zoho CRM). */
export const funnelDetail = {
  stages: [
    { label: "Scans", value: 8_200 },
    { label: "Landing", value: 6_410 },
    { label: "Claims", value: 4_300 },
    { label: "Redeemed", value: 1_870 },
  ],
  overallPct: 23,
  medianRedeemHours: 26,
  leadsPushed: 4_300,
};

/** Computed from spend (Zoho) ÷ MetricDaily / RewardEvent counts.
    benchDeltaPct compares against BTG-curated category medians (ESTIMATED). */
export const efficiency = [
  { label: "Cost per view", value: "$0.023", benchDeltaPct: -39 as number | null },
  { label: "Cost per engagement", value: "$0.45", benchDeltaPct: -18 as number | null },
  { label: "Cost per redemption", value: "$10.27", benchDeltaPct: -24 as number | null },
  { label: "Cost per lead", value: "$4.47", benchDeltaPct: null as number | null },
];

/** MetricDaily per deliverable, top 3 — extends the old topContent shape. */
export const topContentX = [
  { rank: 1, title: "Week 5 — Highlight Reel", athlete: "Shammah Kwizera", initials: "SK", format: "Reel", platform: "Instagram", views: 185_000, engagementRate: 7.1 },
  { rank: 2, title: "Week 4 — Interview", athlete: "Marcus Reed", initials: "MR", format: "Reel", platform: "TikTok", views: 162_000, engagementRate: 6.4 },
  { rank: 3, title: "Week 3 — Game Winner", athlete: "Jalen Brooks", initials: "JB", format: "Post", platform: "Instagram", views: 149_000, engagementRate: 5.2 },
];

export const roiRecommendation = {
  body: "Reels at the Creator tier drove your best views-per-dollar. Shift the appearance budget into 2 more reels and DC-area rewards for a projected +22% return.",
  liftPct: 22,
};

/** Delivery block for the report — Deliverable + MetricDaily counts. */
export const roiDelivery = {
  views: 823_400,
  engagements: 42_815,
  deliverablesDone: 18,
  deliverablesTotal: 24,
  onTimePct: 94,
  leads: 4_300,
};

/* --------------------------------------------------------------------------
   A2 admin operations board (spec 2026-09-11 A2 §2). Every number names its
   Block B retrieval path. Money in cents, like everything above.
   -------------------------------------------------------------------------- */

export const adminOps = {
  /** Σ CampaignOrder.total launched this quarter — Postgres */
  gmvQuarterCents: 128_450_000,
  gmvDeltaPct: 18,
  liveCampaigns: 12,
  /** count Athlete SUBMITTED/UNDER_REVIEW; aging = createdAt > 48h */
  queues: [
    { label: "Applications waiting", count: 7, aging: 2, agingLabel: "2 > 48h", href: "/admin/applications" },
    { label: "Approvals due", count: 5, aging: 0, agingLabel: "", href: "/admin/approvals" },
  ],
  /** median(CampaignInvite.createdAt − CampaignBrief.submittedAt) — Postgres */
  medianMatchHours: 26,
  /** booked = Postgres; invoiced/collected = Zoho Books */
  bookedCents: 128_450_000,
  invoicedCents: 96_200_000,
  collectedCents: 78_900_000,
  campaignsOnTrack: 9,
  campaignsBehind: 3,
  /** count Athlete ACTIVE, weekly snapshots — Postgres */
  networkSize: 148,
  networkGrowth: [122, 126, 131, 133, 138, 141, 148],
};

export const adminPipeline = {
  /** count Athlete by state, this quarter — Postgres */
  stages: [
    { label: "Submitted", value: 42 },
    { label: "Under review", value: 19 },
    { label: "Approved", value: 12 },
  ],
  medianReviewHours: 31,
  approvalRatePct: 63,
  /** AthleteScore.total bands, current queue — Postgres */
  scoreBands: [
    { label: "80–100", value: 4, display: "4" },
    { label: "60–79", value: 11, display: "11" },
    { label: "40–59", value: 3, display: "3" },
    { label: "< 40", value: 1, display: "1" },
  ],
};

export const adminApprovalsX = {
  /** count Deliverable by review state — Postgres */
  medianTurnaroundHours: 9,
  approvalRatePct: 88,
};

export const adminFinanceX = {
  /** collected / invoiced — Zoho Books */
  collectionRatePct: 82,
  /** invoice aging buckets, cents — Zoho Books */
  aging: [
    { label: "Current", value: 5_210_000, display: "$52,100" },
    { label: "1–30 days", value: 1_730_000, display: "$17,300" },
    { label: "31–60 days", value: 640_000, display: "$6,400" },
    { label: "> 60 days", value: 210_000, display: "$2,100" },
  ],
  /** Σ Earning by state, cents — Postgres */
  earningsFlow: [
    { label: "Pending", value: 1_840_000 },
    { label: "Eligible", value: 2_760_000 },
    { label: "Approved for payout", value: 840_000 },
    { label: "Paid", value: 4_625_000 },
  ],
};

/* --------------------------------------------------------------------------
   A2 athlete milestone hero (spec 2026-09-11 A2 §2).
   -------------------------------------------------------------------------- */

export const athleteCareer = {
  /** Σ Earning state ∈ {APPROVED, PAID} — Postgres */
  careerEarningsCents: 4_625_000,
  approvedCents: 840_000,
  nextPayout: "Friday",
  /**
   * approved / (approved + eligible). Draft plan value was 68; the honest
   * figure against adminFinanceX.earningsFlow (approved 840_000, eligible
   * 2_760_000 — this demo athlete is the platform's only earner so far, per
   * the Paid-bucket match with careerEarningsCents below) is
   * round(840_000 / (840_000 + 2_760_000) * 100) = 23.
   */
  payoutRingPct: 23,
  /** Deliverable due vs submitted timestamps — Postgres */
  onTimeRatePct: 96,
  /** Σ AthleteSocial.followers — VERIFIED_MANUAL → platform APIs (sync-social-metrics) */
  followers: 128_400,
  followersSource: "VERIFIED_MANUAL" as const,
  engagementRatePct: 4.8,
  openInvites: 2,
  openInviteValueCents: 1_900_000,
  nextExpiry: "2d 14h",
};

/** Cents earned per month YTD — Σ Earning by month, Postgres */
export const athleteEarningsTrend = [
  180_000, 240_000, 310_000, 420_000, 380_000, 510_000, 640_000, 720_000, 830_000,
];

/* --------------------------------------------------------------------------
   A2 property showcase hero (spec 2026-09-11 A2 §2).
   -------------------------------------------------------------------------- */

export const propertyShowcase = {
  /** MetricDaily rollup, season-to-date — EST until verified. Matches the
   *  canonical "Est. Views / Season" 2.5M in `property.stats` above. */
  estSeasonViews: 2_500_000,
  /** Curated market CPM constant — EST · curated */
  curatedCpmCents: 1_300,
  /** estSeasonViews / 1000 × curatedCpmCents = 2_500 × 1_300 — EST · curated */
  impliedMediaValueCents: 3_250_000,
  /** booked / total inventory slots — Postgres */
  slotsBooked: 17,
  slotsTotal: 25,
  sellThroughPct: 68,
  /** count roster athletes — Postgres */
  rosterCount: 14,
  avgEngagementPct: 4.2,
};

/* --------------------------------------------------------------------------
   A2 public landing counters (spec 2026-09-11 A2 §2). Replaces the page's
   previously hardcoded hero stat tiles — every counter is a Block B count/sum
   with a named source, per the stats-must-be-retrievable rule.
   -------------------------------------------------------------------------- */

export const networkStats = [
  { label: "Athletes in the network", value: 148, prefix: "", source: "Postgres · Athlete ACTIVE" },
  { label: "Campaigns delivered", value: 86, prefix: "", source: "Postgres · Campaign completed" },
  { label: "Attributed fan value", value: 2_300_000, prefix: "$", source: "MetricDaily rollup" },
  { label: "Fan rewards redeemed", value: 41_280, prefix: "", source: "RewardEvent · REDEEM" },
];

/* --------------------------------------------------------------------------
   SponsorX NEXT — student portal fixtures (P1-FE-19, NEXT spec §5, §8).

   Models these will substitute for are Stage 9 (gated): Student,
   SalesAttribution, StudentPointAccrual, Publication, Edition, AdSlot.
   Deliberate shapes, worth keeping when Block B arrives:

   - Sales rows are the immutable SalesAttribution ledger — value frozen at
     close, never edited, survives graduation (spec §5.1).
   - Points are integers with reasons, never cents, never near an $ sign — a
     parent reading points as dollars is a legal problem (spec §5.5, §9).
   - Assignment states reuse DeliverableState: it is already the editorial
     workflow (P1-FE-20), and a second enum would drift from the first.
   -------------------------------------------------------------------------- */

export const student = {
  displayName: "Jordan Reyes",
  firstName: "Jordan",
  school: "Northside High",
  region: "Silver Spring, MD",
  /** Publication.name for the student's propertyId — Postgres (Stage 9) */
  publication: "The Northside Current",
  /** Student.masthead — Postgres (Stage 9) */
  masthead: ["SALES", "WRITER"],
  gradYear: 2027,
  state: "ACTIVE" as const,
  advisor: "Ms. D. Okafor",
  /** The /s/[code] resolver slug — Postgres (Stage 9) */
  salesCode: "JORDAN-NHS",
};

export const studentEdition = {
  /** Edition.label — Postgres (Stage 9) */
  label: "Fall 2026",
  state: "SELLING" as const,
  /** Edition.closeDate — the ad deadline, not the print date */
  closeDate: "Oct 9",
  daysToClose: 16,
  publishTarget: "Nov 3",
  /** Edition.thresholdCents — minimum viable edition (spec §5.2) */
  thresholdCents: 650_000,
  /** Σ AdSlot sold, whole edition, all students — Postgres (Stage 9).
   *  Derived: equals the sum of SOLD slot values in `editionPages` below;
   *  the edition-fixtures test pins the two together. */
  committedCents: 530_000,
  /** AdSlot counts — Postgres (Stage 9) */
  slotsTotal: 24,
  slotsSold: 11,
  slotsReserved: 4,
};

/** Editorial-language copy for DeliverableState in the student's own view.
 *  Same machine as everywhere else; the advisor is the reviewer here. */
export const STUDENT_ASSIGNMENT_COPY: Record<DeliverableState, string> = {
  NOT_STARTED: "Not started",
  DRAFT_SUBMITTED: "Draft submitted",
  BTG_REVIEW: "Advisor review",
  SPONSOR_REVIEW: "Sponsor preview",
  APPROVED: "Approved for print",
  PUBLISHED: "Printed",
  VERIFIED: "Confirmed",
};

export type AssignmentKind = "ARTICLE" | "INTERVIEW" | "PHOTO" | "DESIGN";

export const studentAssignments = [
  {
    id: "asg-01",
    kind: "ARTICLE" as AssignmentKind,
    title: "Under the Friday lights — girls' soccer's unbeaten run",
    section: "Sports feature",
    due: "Sep 26",
    state: "DRAFT_SUBMITTED" as DeliverableState,
    /** StudentPointAccrual.reason ARTICLE → 50 (spec §5.5) */
    points: 50,
    brief:
      "1,200 words on the unbeaten streak. Lead with the captain; the athletic director quote is confirmed for Thursday.",
  },
  {
    id: "asg-02",
    kind: "INTERVIEW" as AssignmentKind,
    title: "Q&A: the new athletic director's first season",
    section: "People",
    due: "Sep 30",
    state: "NOT_STARTED" as DeliverableState,
    /** StudentPointAccrual.reason INTERVIEW → 25 */
    points: 25,
    brief:
      "Twenty minutes, recorded. Ask about the field renovation and what changes for winter sports.",
  },
  {
    id: "asg-03",
    kind: "PHOTO" as AssignmentKind,
    title: "Homecoming build week — candids from the shop hall",
    section: "Photo essay",
    due: "Oct 2",
    state: "NOT_STARTED" as DeliverableState,
    points: 25,
    brief:
      "Eight to twelve frames, horizontal preferred. Float builders, banner painting, the parade line-up rehearsal.",
  },
  {
    id: "asg-04",
    kind: "INTERVIEW" as AssignmentKind,
    title: "Sit-down: Amara Whitfield, the Issue 03 feature",
    section: "Feature support",
    due: "Oct 3",
    state: "SPONSOR_REVIEW" as DeliverableState,
    points: 25,
    brief:
      "Supporting quotes for the magazine feature. Her guardian consent covers the feature; the sponsor previews placement only, never edits copy.",
  },
  {
    id: "asg-05",
    kind: "ARTICLE" as AssignmentKind,
    title: "How the concession stand funds the season",
    section: "Money & program",
    due: "Sep 24",
    state: "APPROVED" as DeliverableState,
    points: 50,
    brief:
      "Follow one Friday's takings from the till to the equipment order. Numbers confirmed by the booster treasurer.",
  },
  {
    id: "asg-06",
    kind: "PHOTO" as AssignmentKind,
    title: "Season opener gallery — varsity football vs. Eastbrook",
    section: "Photo essay",
    due: "Sep 12",
    state: "PUBLISHED" as DeliverableState,
    points: 25,
    brief: "Ran across pages 6–7 of the digital preview edition.",
  },
];

/** Immutable SalesAttribution rows — value frozen at close (spec §5.1).
 *  Recorded by SponsorX when the sponsor pays, never self-reported. */
export const studentSales = [
  {
    id: "sale-03",
    business: "Summit Physical Therapy",
    slot: "Half page",
    slotCode: "P11-HALF",
    valueCents: 50_000,
    closedOn: "Sep 18",
  },
  {
    id: "sale-02",
    business: "Kim's Auto Care",
    slot: "Half page",
    slotCode: "P07-HALF",
    valueCents: 50_000,
    closedOn: "Sep 12",
  },
  {
    id: "sale-01",
    business: "Rosa's Bakery",
    slot: "Quarter page + coupon",
    slotCode: "P04-QTR",
    valueCents: 45_000,
    closedOn: "Sep 3",
  },
];

/** Weekly closed-sales cents, season to date — Σ SalesAttribution by week */
export const studentSalesTrend = [0, 45_000, 45_000, 95_000, 95_000, 145_000];

export type ProspectStage = "CONTACTED" | "MEETING" | "SUBMITTED" | "REJECTED";

export const PROSPECT_COPY: Record<ProspectStage, string> = {
  CONTACTED: "Contacted",
  MEETING: "Meeting set",
  SUBMITTED: "With SponsorX",
  REJECTED: "Not accepted",
};

/** The student's own pipeline. SUBMITTED means the Sponsor Acceptance Check
 *  (spec §5.6) is running — commercial ops decides, not the student. */
export const studentProspects = [
  {
    id: "pro-01",
    business: "Delgado's Pizzeria",
    contact: "Mr. Delgado",
    stage: "MEETING" as ProspectStage,
    slot: "Half page",
    askCents: 50_000,
    note: "Thursday 4:30pm at the shop. Bring the Fall rate card and the coupon example.",
    lastTouch: "yesterday",
  },
  {
    id: "pro-02",
    business: "Iron Path Gym",
    contact: "Dana (front desk)",
    stage: "SUBMITTED" as ProspectStage,
    slot: "Half page",
    askCents: 50_000,
    note: "Owner said yes verbally; acceptance check running.",
    lastTouch: "2 days ago",
  },
  {
    id: "pro-03",
    business: "Maple Cleaners",
    contact: "voicemail left",
    stage: "CONTACTED" as ProspectStage,
    slot: "Quarter page",
    askCents: 25_000,
    note: "Call back after 3pm — owner picks up then.",
    lastTouch: "4 days ago",
  },
  {
    id: "pro-04",
    business: "Peak Energy Drinks",
    contact: "regional rep",
    stage: "REJECTED" as ProspectStage,
    slot: "Full page",
    askCents: 100_000,
    /** Spec §5.6 — a reason code, and no loss of eligible sales credit */
    reasonCode: "CATEGORY_EXCLUSIVE",
    reason:
      "The school holds a beverage exclusivity you couldn't have known about. Your sales credit is unaffected.",
    redirect: "Open category nearby: fitness & recreation.",
    note: "",
    lastTouch: "Sep 15",
  },
];

/* --------------------------------------------------------------------------
   The edition flatplan — P1-FE-21, spec §5.2. One source for the page map:
   the admin screen renders it, and studentEdition's committed/slot numbers
   are pinned to it by tests so the two surfaces cannot drift.

   AdSlot truths worth keeping when Stage 9 substitutes the real table:
   - a slot's sale value is frozen at close and may differ from rack (Rosa's
     quarter carried a coupon add-on: $450 against a $250 rack);
   - RESERVED names who it is held for, because a hold without a name is
     just an open slot someone is afraid to sell;
   - the back cover is quantity one, on one edition, unsellable after close.
   -------------------------------------------------------------------------- */

export type AdSlotState = "SOLD" | "RESERVED" | "OPEN";
export type AdSlotKind = "FULL" | "HALF" | "QUARTER" | "BACK_COVER";

/** Rack prices per position kind — cents. Sale values may differ. */
export const SLOT_RACK_CENTS: Record<AdSlotKind, number> = {
  QUARTER: 25_000,
  HALF: 50_000,
  FULL: 80_000,
  BACK_COVER: 100_000,
};

export type EditionSlot = {
  code: string;
  kind: AdSlotKind;
  state: AdSlotState;
  /** Value at close, cents — SOLD only. */
  soldCents?: number;
  sponsor?: string;
  /** Who a RESERVED slot is held for, and why. */
  holdFor?: string;
};

export type EditionPage = {
  page: number;
  /** Editorial working title — shown on the plan. */
  title: string;
  editorial?: boolean;
  slots: EditionSlot[];
};

export const editionPages: EditionPage[] = [
  { page: 1, title: "Cover", editorial: true, slots: [] },
  {
    page: 2,
    title: "Inside front",
    slots: [
      { code: "P02-FULL", kind: "FULL", state: "SOLD", soldCents: 80_000, sponsor: "Northside Pediatrics" },
    ],
  },
  { page: 3, title: "Season openers", editorial: true, slots: [] },
  {
    page: 4,
    title: "Fall sports calendar",
    slots: [
      { code: "P04-HALF", kind: "HALF", state: "RESERVED", holdFor: "Iron Path Gym · acceptance check running" },
      { code: "P04-QTR", kind: "QUARTER", state: "SOLD", soldCents: 45_000, sponsor: "Rosa's Bakery" },
      { code: "P04-QTRB", kind: "QUARTER", state: "OPEN" },
    ],
  },
  {
    page: 5,
    title: "Coach Q&A",
    slots: [
      { code: "P05-HALF", kind: "HALF", state: "SOLD", soldCents: 50_000, sponsor: "Maple Hardware" },
      { code: "P05-HALFB", kind: "HALF", state: "OPEN" },
    ],
  },
  { page: 6, title: "Feature — Under the Friday lights", editorial: true, slots: [] },
  {
    page: 7,
    title: "Feature continued",
    slots: [
      { code: "P07-HALF", kind: "HALF", state: "SOLD", soldCents: 50_000, sponsor: "Kim's Auto Care" },
      { code: "P07-HALFB", kind: "HALF", state: "OPEN" },
    ],
  },
  {
    page: 8,
    title: "Girls' soccer",
    slots: [
      { code: "P08-HALF", kind: "HALF", state: "RESERVED", holdFor: "Delgado's Pizzeria · meeting Thu 4:30" },
      { code: "P08-HALFB", kind: "HALF", state: "SOLD", soldCents: 50_000, sponsor: "Silver Spring Smiles Dental" },
    ],
  },
  {
    page: 9,
    title: "Cross country",
    slots: [
      { code: "P09-HALF", kind: "HALF", state: "OPEN" },
      { code: "P09-QTRA", kind: "QUARTER", state: "SOLD", soldCents: 25_000, sponsor: "Corner Smoothie Co." },
      { code: "P09-QTRB", kind: "QUARTER", state: "SOLD", soldCents: 25_000, sponsor: "Pitchside Barbers" },
    ],
  },
  {
    page: 10,
    title: "Homecoming preview",
    slots: [
      { code: "P10-FULL", kind: "FULL", state: "SOLD", soldCents: 80_000, sponsor: "First Ridge Credit Union" },
    ],
  },
  {
    page: 11,
    title: "Marching band",
    slots: [
      { code: "P11-HALF", kind: "HALF", state: "SOLD", soldCents: 50_000, sponsor: "Summit Physical Therapy" },
      { code: "P11-HALFB", kind: "HALF", state: "RESERVED", holdFor: "Booster Club co-op ad" },
    ],
  },
  { page: 12, title: "Photo essay — build week", editorial: true, slots: [] },
  { page: 13, title: "Photo essay continued", editorial: true, slots: [] },
  {
    page: 14,
    title: "Student voices",
    slots: [
      { code: "P14-HALF", kind: "HALF", state: "OPEN" },
      { code: "P14-QTRA", kind: "QUARTER", state: "SOLD", soldCents: 25_000, sponsor: "The Study Spot Café" },
    ],
  },
  {
    page: 15,
    title: "Winter sports lookahead",
    slots: [{ code: "P15-FULL", kind: "FULL", state: "OPEN" }],
  },
  {
    page: 16,
    title: "Concessions & program",
    slots: [
      { code: "P16-HALF", kind: "HALF", state: "SOLD", soldCents: 50_000, sponsor: "GreenLine Landscaping" },
      { code: "P16-HALFB", kind: "HALF", state: "OPEN" },
    ],
  },
  { page: 17, title: "Records & standings", editorial: true, slots: [] },
  { page: 18, title: "Alumni corner", editorial: true, slots: [] },
  { page: 19, title: "Masthead & credits", editorial: true, slots: [] },
  {
    page: 20,
    title: "Inside back",
    slots: [
      { code: "P20-HALF", kind: "HALF", state: "RESERVED", holdFor: "Northside PTA" },
      { code: "P20-QTR", kind: "QUARTER", state: "OPEN" },
    ],
  },
];

/** The singleton. Rendered apart from the spreads, framed. */
export const editionBackCover: EditionSlot = {
  code: "BACK-01",
  kind: "BACK_COVER",
  state: "OPEN",
};

/* --------------------------------------------------------------------------
   Advisor desk — P1-FE-20, NEXT spec §3, §7. One school's view: student
   applications reviewed exactly as a network manager reviews athlete ones
   (StudentState mirrors AthleteState, spec §5.1), and the content queue in
   ApprovalsDesk's own vocabulary — reused unchanged, per the acceptance.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Revenue splits — P1-FE-23, spec §5.7. RevenueSplit attaches to the Edition:
   a payeeKind, a basis-points share, a computed amount. Deliberately NOT the
   Earning shape — Earning means athlete NIL compensation and finance
   reconciles payouts from it; these are allocations of edition revenue, and
   the two must not look alike (the P1-FE-23 acceptance) or share a table
   (§5.7). Amounts are always derived from bps at render time, never stored
   here — a transcribed amount is how a split drifts from its own rule.
   -------------------------------------------------------------------------- */

export type SplitPayeeKind =
  | "SPONSORX"
  | "SCHOOL"
  | "STUDENT_POOL"
  | "EDITORIAL_FUND";

export const editionSplits: Array<{
  payeeKind: SplitPayeeKind;
  /** Basis points of edition revenue — Σ must be 10,000 (tested). */
  bps: number;
  payee: string;
  blurb: string;
}> = [
  {
    payeeKind: "SPONSORX",
    bps: 4_000,
    payee: "SponsorX operations",
    blurb: "Production, print, sales operations and the platform.",
  },
  {
    payeeKind: "SCHOOL",
    bps: 3_000,
    payee: "Northside High",
    blurb: "The school's share — paid to the program, not a person.",
  },
  {
    payeeKind: "STUDENT_POOL",
    bps: 2_000,
    payee: "Student pool",
    blurb:
      "Funds the points program. Never paid to a student directly — points are recognition, not wages (§5.5).",
  },
  {
    payeeKind: "EDITORIAL_FUND",
    bps: 1_000,
    payee: "Editorial fund",
    blurb: "Cameras, recorders, section budgets — the newsroom's gear money.",
  },
];

/* --------------------------------------------------------------------------
   Rights ledger — P1-FE-29, spec §5.3. One table answers the one question the
   production gate asks: what may we do with this asset? Shapes worth keeping
   when P9-FE-09 substitutes ContentRight:

   - Print and digital are SEPARATE permissions — a digital-first edition can
     clear while print rights are still outstanding.
   - BTG's own editorial content defaults mayReuseCommercially FALSE (V3 §6):
     editorial use is not a licence to resell journalism inside a campaign.
   - Evidence is exactly one of acceptanceId (consent-based) or licenseRef
     (negotiated) — a right with both or neither is not evidence (tested).
   -------------------------------------------------------------------------- */

export type RightsGrantorKind =
  | "STUDENT"
  | "ATHLETE"
  | "GUARDIAN"
  | "BTG"
  | "THIRD_PARTY";

export type ContentRightRow = {
  id: string;
  asset: string;
  assetKind: "photo" | "video" | "article" | "artwork";
  grantorKind: RightsGrantorKind;
  grantor: string;
  mayPublishDigital: boolean;
  mayPublishPrint: boolean;
  mayPromote: boolean;
  mayReuseCommercially: boolean;
  startsAt: string;
  endsAt: string | null;
  acceptanceId?: string;
  licenseRef?: string;
};

export const contentRights: ContentRightRow[] = [
  {
    id: "cr-01",
    asset: "Under the Friday lights — feature text",
    assetKind: "article",
    grantorKind: "STUDENT",
    grantor: "Jordan Reyes",
    mayPublishDigital: true,
    mayPublishPrint: true,
    mayPromote: true,
    mayReuseCommercially: false,
    startsAt: "Sep 23",
    endsAt: null,
    acceptanceId: "acc_7f31d",
  },
  {
    id: "cr-02",
    asset: "Amara Whitfield — feature portrait set",
    assetKind: "photo",
    grantorKind: "GUARDIAN",
    grantor: "R. Whitfield (guardian)",
    mayPublishDigital: true,
    mayPublishPrint: true,
    mayPromote: true,
    mayReuseCommercially: false,
    startsAt: "Sep 18",
    endsAt: "Jun 30, 2027",
    acceptanceId: "acc_2ba90",
  },
  {
    id: "cr-03",
    asset: "Season opener gallery (12 frames)",
    assetKind: "photo",
    grantorKind: "STUDENT",
    grantor: "Jordan Reyes",
    mayPublishDigital: true,
    mayPublishPrint: false,
    mayPromote: true,
    mayReuseCommercially: false,
    startsAt: "Sep 11",
    endsAt: null,
    acceptanceId: "acc_91c44",
  },
  {
    id: "cr-04",
    asset: "Drumline profile photos",
    assetKind: "photo",
    grantorKind: "STUDENT",
    grantor: "Omar Diallo",
    mayPublishDigital: true,
    mayPublishPrint: true,
    mayPromote: false,
    mayReuseCommercially: false,
    startsAt: "Sep 22",
    endsAt: null,
    acceptanceId: "acc_c1d02",
  },
  {
    id: "cr-05",
    asset: "Edition masthead artwork",
    assetKind: "artwork",
    grantorKind: "BTG",
    grantor: "SponsorX editorial",
    mayPublishDigital: true,
    mayPublishPrint: true,
    mayPromote: true,
    /* V3 §6 — BTG content defaults FALSE here, deliberately. */
    mayReuseCommercially: false,
    startsAt: "Sep 1",
    endsAt: null,
    licenseRef: "BTG-ED-2026-03",
  },
  {
    id: "cr-06",
    asset: "Stadium aerial (cover background)",
    assetKind: "photo",
    grantorKind: "THIRD_PARTY",
    grantor: "K. Osei Photography",
    mayPublishDigital: true,
    mayPublishPrint: true,
    mayPromote: false,
    mayReuseCommercially: false,
    startsAt: "Sep 15",
    endsAt: "Dec 31",
    licenseRef: "LIC-2026-0142",
  },
];

/** Assets the gate is waiting on — each names what is missing and who can
 *  grant it. The editions page derives its rightsCleared gate from this. */
export const clearanceQueue = [
  {
    id: "cq-01",
    asset: "Amara Whitfield — highlight reel (1:48)",
    assetKind: "video" as const,
    missing: "Print + promotion consent",
    grantor: "R. Whitfield (guardian)",
    grantorKind: "GUARDIAN" as RightsGrantorKind,
    requestedOn: "Sep 20",
    note: "Digital consent recorded; the print/promo clause needs the guardian's separate initials.",
  },
  {
    id: "cq-02",
    asset: "Homecoming build week candids",
    assetKind: "photo" as const,
    missing: "Creator consent — photographer not yet enrolled",
    grantor: "Maya Chen (applicant)",
    grantorKind: "STUDENT" as RightsGrantorKind,
    requestedOn: "Sep 22",
    note: "Shot before her application was approved; consent lands with her enrolment.",
  },
  {
    id: "cq-03",
    asset: "Season opener gallery — print use",
    assetKind: "photo" as const,
    missing: "Print permission",
    grantor: "Jordan Reyes",
    grantorKind: "STUDENT" as RightsGrantorKind,
    requestedOn: "Sep 23",
    note: "Digital cleared (cr-03); print was not in the original acceptance and needs a fresh one.",
  },
];

/** SUBMITTED | UNDER_REVIEW | APPROVED — the slice an advisor works daily.
 *  Full StudentState adds DRAFT/ACTIVE/INACTIVE/SUSPENDED (Stage 9). */
export type StudentApplicationState = "SUBMITTED" | "UNDER_REVIEW" | "APPROVED";

export const STUDENT_APPLICATION_COPY: Record<StudentApplicationState, string> = {
  SUBMITTED: "New — awaiting review",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
};

export const studentApplications = [
  {
    id: "sapp-01",
    name: "Maya Chen",
    gradYear: 2028,
    masthead: ["PHOTOGRAPHER"],
    state: "SUBMITTED" as StudentApplicationState,
    submitted: "Sep 22",
    note: "Already shoots JV games on her own camera; portfolio link attached.",
  },
  {
    id: "sapp-02",
    name: "DeShawn Carter",
    gradYear: 2027,
    masthead: ["SALES"],
    state: "UNDER_REVIEW" as StudentApplicationState,
    submitted: "Sep 20",
    note: "Recommended by Coach Alvarez. Wants the winter season; asked about the sales code on day one.",
  },
  {
    id: "sapp-03",
    name: "Priya Nair",
    gradYear: 2029,
    masthead: ["WRITER", "VIDEO"],
    state: "SUBMITTED" as StudentApplicationState,
    submitted: "Sep 23",
    note: "Freshman — strong writing sample on the girls' soccer run.",
  },
  {
    id: "sapp-04",
    name: "Leo Martinez",
    gradYear: 2028,
    masthead: ["DESIGNER"],
    state: "APPROVED" as StudentApplicationState,
    submitted: "Sep 15",
    note: "Approved Sep 18 — onboarding with the Fall layout team.",
  },
];

/** The school's content queue in ReviewContentItem shape so ApprovalsDesk is
 *  reused unchanged: campaign carries the section, athlete carries the
 *  student, sponsor is "Editorial" unless a paid feature previews placement.
 *  Jordan's rows mirror studentAssignments states one for one. */
export const advisorContentQueue: ReviewContentItem[] = [
  {
    id: "adv-01",
    campaign: "Sports feature",
    sponsor: "Editorial",
    title: "Under the Friday lights — girls' soccer's unbeaten run",
    dueDate: "Sep 26",
    state: "DRAFT_SUBMITTED",
    revisionRequested: false,
    athlete: "Jordan Reyes",
    assetKind: "image",
    version: 1,
    submittedAt: "Sep 23, 9:12 AM",
    waitingHours: 30,
  },
  {
    id: "adv-02",
    campaign: "Photo essay",
    sponsor: "Editorial",
    title: "Cross country season gallery — dawn practice",
    dueDate: "Sep 28",
    state: "DRAFT_SUBMITTED",
    revisionRequested: true,
    athlete: "Tessa Bloom",
    assetKind: "image",
    version: 2,
    submittedAt: "Sep 21, 4:40 PM",
    waitingHours: 62,
  },
  {
    id: "adv-03",
    campaign: "Feature support",
    sponsor: "First Ridge Credit Union",
    title: "Sit-down: Amara Whitfield, the Issue 03 feature",
    dueDate: "Oct 3",
    state: "SPONSOR_REVIEW",
    revisionRequested: false,
    athlete: "Jordan Reyes",
    assetKind: "video",
    version: 2,
    submittedAt: "Sep 22, 1:05 PM",
    waitingHours: 18,
  },
  {
    id: "adv-04",
    campaign: "People",
    sponsor: "Editorial",
    title: "Marching band profile: the drumline's summer",
    dueDate: "Sep 30",
    state: "BTG_REVIEW",
    revisionRequested: false,
    athlete: "Omar Diallo",
    assetKind: "image",
    version: 1,
    submittedAt: "Sep 22, 8:30 AM",
    waitingHours: 26,
  },
  {
    id: "adv-05",
    campaign: "Money & program",
    sponsor: "Editorial",
    title: "How the concession stand funds the season",
    dueDate: "Sep 24",
    state: "APPROVED",
    revisionRequested: false,
    athlete: "Jordan Reyes",
    assetKind: "image",
    version: 3,
    submittedAt: "Sep 20, 11:00 AM",
    waitingHours: 0,
    clearedAt: "Sep 23",
  },
  {
    id: "adv-06",
    campaign: "Photo essay",
    sponsor: "Editorial",
    title: "Season opener gallery — varsity football vs. Eastbrook",
    dueDate: "Sep 12",
    state: "PUBLISHED",
    revisionRequested: false,
    athlete: "Jordan Reyes",
    assetKind: "image",
    version: 1,
    submittedAt: "Sep 10, 3:20 PM",
    waitingHours: 0,
    clearedAt: "Sep 11",
  },
];

/** The §5.5 earn vocabulary — StudentPointAccrual.reason with its fixed
 *  value. VIEWS_BONUS is the editor's call per piece, so its value is null
 *  here and the accrual row carries whatever was awarded. */
export const POINT_RULES: Array<{
  reason: string;
  points: number | null;
  label: string;
  how: string;
}> = [
  { reason: "ARTICLE", points: 50, label: "Article approved", how: "A written piece clears advisor review for the edition." },
  { reason: "INTERVIEW", points: 25, label: "Interview delivered", how: "A recorded interview lands and is used by a piece." },
  { reason: "APPOINTMENT", points: 25, label: "Sales meeting held", how: "You sit down with a business — whether or not it closes." },
  { reason: "SALES_500", points: 100, label: "Every $500 closed", how: "Recorded by SponsorX when your closed sales cross each $500 mark." },
  { reason: "VIEWS_BONUS", points: null, label: "Views bonus", how: "Editor's call when a digital piece travels — value set per piece." },
];

/** StudentPointAccrual rows — reasons from the spec §5.5 vocabulary.
 *  Integers. Not cents. Nothing here may render with a currency sign. */
export const studentPoints = {
  balance: 300,
  accruals: [
    { id: "pt-06", reason: "SALES_500", label: "Second $500 in closed sales", points: 100, on: "Sep 18" },
    { id: "pt-05", reason: "ARTICLE", label: "Concession stand feature approved", points: 50, on: "Sep 14" },
    { id: "pt-04", reason: "SALES_500", label: "First $500 in closed sales", points: 100, on: "Sep 12" },
    { id: "pt-03", reason: "INTERVIEW", label: "Coach Alvarez pre-season interview", points: 25, on: "Sep 8" },
    { id: "pt-02", reason: "APPOINTMENT", label: "Sales meeting held — Rosa's Bakery", points: 25, on: "Sep 1" },
  ],
};
