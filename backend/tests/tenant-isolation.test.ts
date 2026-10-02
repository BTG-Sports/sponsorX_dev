import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-SEC-02 — no query can reach another tenant's data, proven by test.

   Not a review of the queries: a real API over a real database, attacked.
   Tenant A is seeded with one of everything along the §39 loop — sponsor,
   brief, campaign, athlete, NIL job, rate, invitation, order, deliverable,
   metric, tracking link, reward, token, earning, invoice, guardian,
   agreement. Tenant B gets its own staff, sponsor and athlete. Then EVERY
   route the API mounts is called as each of tenant B's users, with tenant
   A's ids in the path and, for writes, a body that is valid — so the call
   reaches the scope check instead of stopping at validation.

   Three things must hold, for every route and every tenant-B actor:
     1. the answer is not a success (403 / 404 / 409 / 422 — never 2xx);
     2. nothing tenant A owns appears in the response;
     3. nothing tenant A owns changed — a fingerprint of every tenant-A row
        in every table is identical before and after the whole sweep.

   A positive control runs the same GETs as tenant A's own admin and expects
   them to succeed, so a sweep that "passes" because the ids are wrong
   cannot pass.

   The public routes (/public/*, the Zoho webhooks, /openapi.json) are
   excluded by design: they carry no tenant-bound actor, and their access is
   a bearer token or a signature — tested in their own suites.

   Skipped without a database, with a reason. CI has one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({
  limit: async () => {},
  rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
  RateLimitedError: class extends Error {},
}));
/* Authentication is Clerk's job and is not under test: the caller's Clerk id
   comes from a header. Everything after that — resolving the actor from
   Postgres, roles, tenant, scope — is the production code path. */
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@tenant-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const A = {
  tenant: "ti_tenant_a", sponsor: "ti_sponsor_a", contact: "ti_contact_a", brief: "ti_brief_a",
  campaign: "ti_campaign_a", athlete: "ti_athlete_a", job: "ti_job_a", rate: "ti_rate_a",
  invite: "ti_invite_a", order: "ti_order_a", deliverable: "ti_deliv_a", asset: "ti_asset_a",
  link: "ti_link_a", reward: "ti_reward_a", token: "ti_token_a", earning: "ti_earning_a",
  invoice: "ti_invoice_a", guardian: "ti_guardian_a", agreement: "ti_agreement_a", admin: "ti_admin_a",
  publication: "ti_pub_a", edition: "ti_edition_a", slot: "ti_slot_a",
  school: "ti_school_a", student: "ti_student_a", code: "ti_code_a", prospect: "ti_prospect_a",
  asset: "ti_asset_ed_a", claim: "ti_claim_a", onboarding: "ti_onboarding_a",
  /* Phase 2 batch 3 — an athlete's item, a school's item with a listing awaiting approval, a sent offer. */
  item: "ti_item_a", schoolItem: "ti_item_school_a", listing: "ti_listing_a", offer: "ti_offer_a",
  /* 2S2-FE-03 — the athlete's change request on that offer, unanswered. */
  changeRequest: "ti_offer_change_a",
  /* Phase 2 batch 4 — a restriction, the sponsor's cart with a line. */
  restriction: "ti_restriction_a", cart: "ti_cart_a", cartLine: "ti_cart_line_a",
  /* Phase 2 batch 5 — a hold and the order it became. */
  reservation: "ti_reservation_a", mktOrder: "ti_mkt_order_a",
  /* 2S4-FE-02 — the sponsor's acceptance of the order terms that order was placed under. */
  mktAcceptance: "ti_mkt_acceptance_a",
  /* Phase 2 batch 6 — a commission rule. */
  rule: "ti_rule_a",
  /* 2S5-BE-04 — a payout request from tenant A's athlete. */
  payout: "ti_payout_a",
  /* 2S3-BE-05 — a listing tenant A's athlete sells with no team. */
  athleteListing: "ti_listing_ath_a",
  /* 2S1-BE-18 — a word on tenant A's restricted list. */
  restrictedWord: "ti_restricted_word_a",
  /* 2S1-BE-05 — a business asking tenant A's BTG to sponsor. */
  inquiry: "ti_inquiry_a",
  inquiryDocument: "ti_inquiry_doc_a",
  /* 2S1-BE-12 — a row of tenant A's age-of-majority table. */
  ageRow: "ti_age_row_a",
  /* 2S7-FE-02 — an order still owing payment whose card payment failed (BTG's console). */
  dueReservation: "ti_reservation_due_a", dueOrder: "ti_mkt_order_due_a", failedAttempt: "ti_attempt_failed_a",
  /* 2S4-BE-06 / -07 — a sold line of that order, marked delivered and waiting
     for the sponsor; 2S2-BE-05 — tenant A's school inviting tenant A's athlete. */
  mktLine: "ti_mkt_line_a", delivery: "ti_delivery_a", teamInvite: "ti_team_invite_a",
  /* 2S1-BE-13 — a rejected tenant-A account asking to come back; 2S1-BE-15 — a request to become its guardian, waiting. */
  closure: "ti_closure_a", handoff: "ti_handoff_a",
} as const;
const B = {
  tenant: "ti_tenant_b", sponsor: "ti_sponsor_b", athlete: "ti_athlete_b",
  school: "ti_school_b", student: "ti_student_b", guardian: "ti_guardian_b",
} as const;

/**
 * 2S8-SEC-01 — an OUTSIDE organisation. Not seeded by hand: tenant A's BTG
 * admin approves its onboarding through the production path, which
 * provisions tenant E, its Property and its PROPERTY_MGR (2S1-BE-04). The ids
 * are generated, so they are filled in when the approval returns.
 */
const E = { tenant: "", property: "", manager: "", onboarding: "ti_onboarding_e", name: "TI External Academy" };
const E_MANAGER = "ti_e_manager"; // signs in as ti_e_manager@tenant-test.invalid, the primary contact
/** Tenant A's own non-staff users — they attack the outside tenant too. */
const A_ACTORS = [
  { id: "ti_a_sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: "ti_sponsor_a" },
  { id: "ti_a_athlete", roles: ["ATHLETE"], athleteId: "ti_athlete_a" },
] as const;

/** Tenant B's users: every kind of actor who could try to reach across. */
const B_ACTORS = [
  { id: "ti_b_admin", roles: ["BTG_ADMIN"] },
  { id: "ti_b_super_like", roles: ["CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE", "SALES"] },
  { id: "ti_b_sponsor", roles: ["SPONSOR_ADMIN"], sponsorId: B.sponsor },
  { id: "ti_b_athlete", roles: ["ATHLETE"], athleteId: B.athlete },
  /* SponsorX NEXT (P9-BE-05) — "the tenant-isolation tests grown" (spec §7). */
  { id: "ti_b_student", roles: ["STUDENT"], studentId: B.student, propertyId: B.school },
  { id: "ti_b_advisor", roles: ["ADVISOR"], propertyId: B.school },
  /* 2S8-SEC-01 — the outside-party roles Phase 2 adds accounts for. */
  { id: "ti_b_property_mgr", roles: ["PROPERTY_MGR"], propertyId: B.school },
  { id: "ti_b_analyst", roles: ["SPONSOR_ANALYST"], sponsorId: B.sponsor },
  { id: "ti_b_guardian", roles: ["GUARDIAN"], guardianId: B.guardian },
] as const;

/** Which tenant-A id a path parameter takes, by the noun in front of it. */
const PARAM_FOR: Record<string, string> = {
  applications: A.athlete, athletes: A.athlete, campaigns: A.campaign, orders: A.order,
  briefs: A.brief, invitations: A.invite, deliverables: A.deliverable, earnings: A.earning,
  guardians: A.guardian, rewards: A.reward, "tracking-links": A.link,
  publications: A.publication, editions: A.edition,
  students: A.student, prospects: A.prospect, sponsors: A.sponsor,
  "edition-assets": A.asset, claims: A.claim, properties: A.school, onboarding: A.onboarding,
  inventory: A.item, listings: A.listing, offers: A.offer, roster: A.athlete,
  /* POST /offers/{id}/change-requests/{requestId}/keep (2S2-FE-03). */
  "change-requests": A.changeRequest,
  restrictions: A.restriction, lines: A.cartLine,
  reservations: A.reservation, "marketplace-orders": A.mktOrder, "commission-rules": A.rule,
  payouts: A.payout, "sponsor-requests": A.inquiry, "restricted-words": A.restrictedWord,
  /* GET /sponsor-requests/{id}/documents/{documentId} (2S1-BE-17). */
  documents: A.inquiryDocument,
  /* DELETE /signup-rules/age-table/{id} (2S1-BE-12). */
  "age-table": A.ageRow,
  /* GET /deliverables/{id}/assets/{version}/url (P5-FE-04) — a creative
     version number, under tenant A's deliverable. */
  assets: "1",
  /* GET /reward-tokens/{id}/qr-url (P6-FE-01). */
  "reward-tokens": A.token,
  /* 2S4-BE-06 / -07 — the seller's sold line, the sponsor's answer and BTG's
     desk all take an order-line id; 2S2-BE-05 — an invitation. */
  sales: A.mktLine, deliveries: A.mktLine, "delivery-issues": A.mktLine, "team-invitations": A.teamInvite,
  /* P3-BE-16 — no tenant-A change is seeded: an unknown id must answer
     exactly as another tenant's would, so a made-up one is the right probe. */
  "profile-changes": "pc_not_yours",
  /* 2S1-BE-13 / 2S1-BE-15. */
  "account-closures": A.closure, "guardian-handoffs": A.handoff,
};

/**
 * A VALID body for every write, so the call reaches the scope check. A route
 * that answered 400 would prove only that validation runs first — so a 400
 * fails this suite, and the fix is a body here, not a looser assertion.
 */
const BODY: Record<string, unknown> = {
  "POST /restricted-words": { word: "ti-made-up-word", kind: "ADULT" },
  "POST /restricted-words/test": { text: "TI Secret probe text" },
  /* 2S1-BE-09 / -10 / -12 — New sign-ups and the sign-up rules. */
  "POST /signups/athletes/{id}/reject": { note: "Isolation sweep" },
  "POST /signups/guardians/{id}/reject": { note: "Isolation sweep" },
  "PUT /signup-rules/age-table": { countryCode: "US", regionCode: "AL", age: 19 },
  "PUT /signup-rules/settings": { staffConfirmMinors: false },
  "POST /applications/intake/guardian": { legalName: "Sweep Guardian", email: "sweep-guardian@b.invalid", relationship: "PARENT" },
  "POST /applications/intake/documents": { kind: "GOVERNMENT_ID", filename: "id.pdf", contentType: "application/pdf", bytes: 1000 },
  "POST /sponsor-requests/{id}/decision": { decision: "APPROVE", categories: ["RESTAURANT"], newSponsor: true },
  "PUT /athletes/{id}/tier": { tier: "CREATOR" },
  "POST /athletes/{id}/rates": { jobId: A.job, amount: 20000 },
  "POST /campaigns/{id}/orders": {
    athleteId: A.athlete, jobId: A.job, compensation: 20000, sellPrice: 40000,
    usageRights: "Organic social, 90 days", dueDate: "2026-12-01",
  },
  "PATCH /orders/{id}": { compensation: 21000 },
  "POST /orders/{id}/transition": { to: "CANCELLED" },
  "POST /orders/{id}/accept": { agreementId: A.agreement, bodyHashShown: "x".repeat(64) },
  "POST /briefs": {
    sponsorId: A.sponsor, objective: "Cross-tenant brief", budget: 100000,
    startDate: "2026-10-01", endDate: "2026-11-01", sports: [], stateCodes: [], categories: [],
  },
  "POST /briefs/{id}/transition": { to: "CLOSED", reason: "Isolation sweep" },
  "POST /briefs/{id}/campaign": { name: "Stolen campaign" },
  "POST /campaigns/{id}/transition": { to: "CANCELLED" },
  "POST /campaigns/{id}/invitations": { athleteId: A.athlete, jobId: A.job, offered: 20000 },
  "POST /invitations/{id}/respond": { to: "DECLINED" },
  "POST /applications/{id}/approve": {},
  "POST /applications/{id}/request-changes": { reviewerNotes: "Please add a photo." },
  "POST /applications/{id}/reject": { reviewerNotes: "Not eligible." },
  "POST /deliverables/{id}/submit": {},
  "POST /deliverables/{id}/btg-review": { decision: "APPROVE" },
  "POST /deliverables/{id}/sponsor-review": { decision: "APPROVE" },
  "POST /deliverables/{id}/revision": { reason: "Again, please." },
  "POST /deliverables/{id}/approve": {},
  "POST /deliverables/{id}/published": { publishedUrl: "https://example.com/p" },
  "POST /deliverables/{id}/verify": {},
  "POST /deliverables/{id}/uploads": { filename: "a.jpg", contentType: "image/jpeg", bytes: 1000 },
  "POST /deliverables/{id}/assets": { r2Key: `deliverables/${A.deliverable}/a.jpg` },
  "POST /deliverables/{id}/metrics": { day: "2026-10-02", source: "SELF_REPORTED", views: 10, engagements: 1 },
  "POST /deliverables/{id}/tracking-link": { destinationUrl: "https://example.com" },
  "POST /earnings/{id}/transition": { to: "ELIGIBLE" },
  "POST /earnings/{id}/adjustment": { adjustment: -100, reason: "cross-tenant" },
  "POST /athletes/{id}/guardian": { legalName: "X", email: "x@x.invalid", relationship: "PARENT" },
  "PUT /athletes/{id}/socials": { socials: [{ platform: "INSTAGRAM", handle: "stolen" }] },
  "POST /athletes/{id}/profile-changes": { identity: { displayName: "Stolen Name" } },
  /* 2S1-BE-13 / 2S1-BE-15. POST /me/close is the actor's own account, so an empty body (refused: confirm is required) keeps the sweep from closing tenant B's logins. */
  "POST /account-closures/{id}/reactivation-decision": { decision: "DECLINE", note: "cross-tenant" },
  "POST /guardian-handoffs/{id}/decision": { decision: "HAND_OFF" },
  "POST /guardian-handoffs/{id}/staff-decision": { decision: "CONFIRM" },
  "POST /guardians/{id}/verify": { method: "DOCUMENT" },
  "POST /agreements/accept": { agreementId: A.agreement, bodyHashShown: "x".repeat(64) },
  "POST /campaigns/{id}/rewards": { offerText: "Free taco", terms: "One per fan", expiresAt: "2026-12-01T00:00:00.000Z" },
  "POST /rewards/{id}/transition": { to: "PAUSED" },
  "POST /rewards/{id}/tokens": { athleteId: A.athlete },
  "POST /campaigns/{id}/launch": {},
  "POST /publications": { name: "TI B masthead", propertyId: null },
  "POST /publications/{id}/editions": {
    label: "Stolen edition", closeDate: "2026-12-01T00:00:00.000Z",
    publishTarget: "2026-12-15T00:00:00.000Z", thresholdCents: 1000,
  },
  "POST /editions/{id}/conditions": { contentReady: true },
  "POST /editions/{id}/transition": { to: "CANCELLED" },
  "POST /editions/{id}/slots": { slotCode: "STOLEN", kind: "HALF", priceCents: 100 },
  "POST /editions/{id}/sales": { campaignId: A.campaign },
  "POST /students": {
    propertyId: A.school, legalName: "Stolen", displayName: "Stolen", masthead: ["WRITER"],
  },
  "POST /students/{id}/transition": { to: "SUSPENDED" },
  "POST /students/{id}/guardian": { legalName: "X", email: "x@x.invalid", relationship: "PARENT" },
  "POST /students/{id}/code": {},
  "POST /students/{id}/points": { reason: "ARTICLE" },
  "POST /students/{id}/prospects": { businessName: "Stolen Deli", category: "RESTAURANT" },
  "POST /prospects/{id}/decision": { decision: "REJECT", reasonCode: "OTHER" },
  "POST /sponsors/{id}/assigned-student": { studentId: null },
  "POST /editions/{id}/assets": { kind: "ARTICLE", title: "Stolen", sourceKind: "BTG" },
  "POST /edition-assets/{id}/rights": { grantorKind: "BTG", grantorRef: "x", licenseRef: "L-1", startsAt: "2026-01-01T00:00:00.000Z" },
  "POST /edition-assets/{id}/campaign": { campaignId: A.campaign },
  "POST /consents": { agreementId: A.agreement, subjectKind: "ATHLETE", subjectId: A.athlete, bodyHashShown: "x".repeat(64) },
  "POST /featured-athletes": { displayName: "Stolen", sport: "Soccer", propertyId: A.school },
  "POST /claims/{id}/verify": {},
  "POST /claims/{id}/reject": {},
  "POST /properties/{id}/roster": { entries: [{ legalName: "Stolen Name" }] },
  "POST /editions/{id}/contributions": { studentId: A.student, kind: "FEATURE" },
  "POST /onboarding/{id}/decision": { decision: "REJECT", notes: "cross-tenant" },
  "POST /campaigns/{id}/report/render": {},
  "PUT /me/notification-preferences": { event: "invitation.sent", channel: "EMAIL", muted: true },
  "POST /inventory": { title: "Sweep item", kind: "OTHER", priceCents: 500 },
  "PATCH /inventory/{id}": { priceCents: 999 },
  "POST /team/roster": { legalName: "Sweep Athlete", displayName: "SWEEP", email: "roster-sweep@b.invalid", sport: "Soccer" },
  "PATCH /team/roster/{id}": { teamShareBps: 1 },
  "POST /listings": { inventoryItemId: A.schoolItem, title: "Stolen listing" },
  "PATCH /listings/{id}": { title: "Renamed" },
  "POST /listings/{id}/transition": { to: "ARCHIVED" },
  "POST /listings/{id}/decision": { decision: "APPROVE" },
  /* 2S3-BE-06 — BTG pauses or ends a live listing, with a reason. */
  "POST /listings/{id}/btg-action": { action: "PAUSE", reason: "Isolation sweep" },
  "POST /offers": {
    campaignId: A.campaign, athleteId: A.athlete, jobId: A.job, brief: "Stolen", compensation: 20000, sellPrice: 40000,
    deliverables: [{ title: "Post", dueDate: "2027-06-01T00:00:00.000Z" }], usageRights: "90 days", disclosures: [], expiresAt: "2027-05-01T00:00:00.000Z",
  },
  "POST /offers/{id}/respond": { decision: "DECLINE" },
  /* 2S2-FE-03 — BTG's answers to a change request, and editing a draft. */
  "POST /offers/{id}/change-requests/{requestId}/keep": { note: "It stands." },
  "POST /offers/{id}/revise": {},
  "PATCH /offers/{id}": { brief: "Stolen brief" },
  "PUT /branding": { displayName: "Sweep brand" },
  "POST /branding/logo": { contentType: "image/png", bytes: 10 },
  "POST /restrictions": { athleteId: A.athlete, category: "CRYPTO", type: "PROHIBITED" },
  "PUT /sponsors/{id}/categories": { categories: ["APPAREL"] },
  "POST /cart/lines": { listingId: A.listing, quantity: 1, startsOn: "2027-01-01T00:00:00.000Z", endsOn: "2027-01-02T00:00:00.000Z" },
  "PATCH /cart/lines/{id}": { quantity: 2 },
  /* 2S4-FE-02 — a whole contract gate (terms accepted, billing confirmed), so the call reaches the hold's scope check. */
  "POST /marketplace-orders": { reservationId: A.reservation, agreementId: A.agreement, bodyHashShown: "x".repeat(64), billing: { name: "Sweep Billing", email: "sweep@b.invalid" } },
  "POST /marketplace-orders/{id}/decision": { decision: "APPROVE" },
  "POST /marketplace-orders/{id}/transition": { to: "CANCELLED" },
  "POST /commission-rules": { kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 100, priority: 0 },
  "POST /commission-rules/{id}/revise": { bps: 1 },
  "POST /payouts/{id}/decision": { decision: "APPROVE" },
  "POST /payouts/account/link": { returnPath: "/athlete" },
  /* 2S4-BE-06 / -07 / -08 — sellers' orders and delivery. */
  "POST /sales/{id}/proof": { contentType: "image/jpeg", bytes: 1000 },
  "POST /sales/{id}/delivered": { note: "Sweep delivery note" },
  "POST /deliveries/{id}/problem": { note: "Sweep problem" },
  "POST /delivery-issues/{id}/resolve": { decision: "CONFIRM", note: "Sweep decision" },
  /* 2S2-BE-05 — inviting tenant A's athlete, and answering tenant A's invitation. */
  "POST /team/invitations": { athleteId: A.athlete, teamShareBps: 100 },
  "POST /team-invitations/{id}/respond": { decision: "ACCEPT" },
};

describe.skipIf(!hasDatabase)("P8-SEC-02 · tenant B cannot reach tenant A through any route", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { DOCUMENTED_PATHS } = await import("../src/contracts/registry");
  const { decideOnboarding } = await import("../src/domain/onboarding");

  let base = "";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  const results: { route: string; actor: string; status: number }[] = [];
  let before = "";

  /** Every row tenant A owns, in every table that has a tenant. */
  async function fingerprint(tenant: string = A.tenant): Promise<string> {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns
        WHERE column_name = 'tenantId' AND table_schema = 'public' ORDER BY table_name`,
    );
    const h = createHash("sha256");
    for (const { table_name } of tables) {
      /* The positive control's own reads are allowed to leave a trace: a
         private-file read is audited, and tenant A's admin making it is
         tenant A acting on itself (2S1-BE-17, the proof-of-business link). */
      const own = table_name === "AuditLog" ? `AND NOT ("action" = 'storage.privateDownloadGrant' AND "actorId" = '${A.admin}')` : "";
      const rows = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT * FROM "${table_name}" WHERE "tenantId" = $1 ${own} ORDER BY 1`, tenant,
      );
      h.update(table_name).update(JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
    }
    return h.digest("hex");
  }

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    /* The outside tenants tenant A's approvals provisioned, found through their Property. */
    const outside = (await prisma.$queryRawUnsafe<{ tenantId: string }[]>(
      `SELECT p."tenantId" FROM "PropertyOnboarding" o JOIN "Property" p ON p.id = o."propertyId" WHERE o."tenantId" = $1 AND p."tenantId" <> $1
       UNION SELECT "tenantId" FROM "User" WHERE email = $2 AND "tenantId" <> $1`, A.tenant, `${E_MANAGER}@tenant-test.invalid`,
    )).map((r) => r.tenantId);
    /* PayoutLine carries no tenantId of its own — it goes with its payout. */
    await prisma.$executeRawUnsafe(
      `DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, [A.tenant, B.tenant, ...outside],
    );
    /* Children before parents; a failure just means another pass. */
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, [A.tenant, B.tenant, ...outside],
        ).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [A.tenant, B.tenant, ...outside] } } });
  }

  async function seed() {
    await wipe();
    const t = A.tenant;
    await prisma.tenant.createMany({ data: [{ id: A.tenant, name: "TI Tenant A" }, { id: B.tenant, name: "TI Tenant B" }] });
    await prisma.sponsor.createMany({ data: [
      { id: A.sponsor, tenantId: t, name: "TI Secret Sponsor A" },
      { id: B.sponsor, tenantId: B.tenant, name: "TI Sponsor B" },
    ] });
    await prisma.sponsorContact.create({ data: { id: A.contact, tenantId: t, sponsorId: A.sponsor, name: "TI Secret Contact", email: "secret@a.invalid", isPrimary: true } });
    await prisma.guardian.create({ data: { id: A.guardian, tenantId: t, legalName: "TI Secret Guardian", email: "g@a.invalid", relationship: "PARENT" } });
    await prisma.athlete.createMany({ data: [
      { id: A.athlete, tenantId: t, slug: "ti-athlete-a", legalName: "TI Secret Athlete", displayName: "TISA", email: "ath@a.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: B.athlete, tenantId: B.tenant, slug: "ti-athlete-b", legalName: "TI Athlete B", displayName: "TIB", email: "ath@b.invalid", sport: "Soccer", stateCode: "VA", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.nilJob.create({ data: { id: A.job, tenantId: t, name: "TI Job", baseLow: 10000, baseHigh: 20000, sellLow: 20000, sellHigh: 40000, sellFloorEmerging: 15000, sellFloorCreator: 20000, sellFloorPremium: 30000 } });
    await prisma.athleteRate.create({ data: { id: A.rate, tenantId: t, athleteId: A.athlete, jobId: A.job, amount: 20000 } });
    await prisma.campaignBrief.create({ data: { id: A.brief, tenantId: t, sponsorId: A.sponsor, objective: "TI secret objective", budget: 500000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), sports: [], stateCodes: [], categories: [], state: "APPROVED" } });
    await prisma.campaign.create({ data: { id: A.campaign, tenantId: t, sponsorId: A.sponsor, name: "TI Secret Campaign", budget: 500000, startDate: new Date("2026-10-01"), endDate: new Date("2026-11-30"), state: "STAFFING" } });
    await prisma.campaignInvite.create({ data: { id: A.invite, tenantId: t, campaignId: A.campaign, athleteId: A.athlete, jobId: A.job, offered: 20000, expiresAt: new Date(Date.now() + 7 * 864e5) } });
    await prisma.campaignOrder.create({ data: { id: A.order, tenantId: t, campaignId: A.campaign, athleteId: A.athlete, jobId: A.job, compensation: 20000, sellPrice: 40000, usageRights: "90 days", dueDate: new Date("2026-11-15") } });
    await prisma.deliverable.create({ data: { id: A.deliverable, tenantId: t, orderId: A.order, title: "TI secret post", dueDate: new Date("2026-11-15") } });
    await prisma.trackingLink.create({ data: { id: A.link, tenantId: t, code: "tiseca", deliverableId: A.deliverable, destinationUrl: "https://a.invalid" } });
    await prisma.reward.create({ data: { id: A.reward, tenantId: t, campaignId: A.campaign, offerText: "TI secret offer", terms: "t", expiresAt: new Date("2026-12-31") } });
    await prisma.rewardToken.create({ data: { id: A.token, tenantId: t, rewardId: A.reward, token: "ti-secret-token-a", athleteId: A.athlete } });
    await prisma.earning.create({ data: { id: A.earning, tenantId: t, athleteId: A.athlete, orderId: A.order, gross: 20000, taxYear: 2026 } });
    await prisma.campaignInvoice.create({ data: { id: A.invoice, tenantId: t, campaignId: A.campaign, zohoInvoiceId: "ti_zinv_a", status: "sent", amount: 500000 } });
    await prisma.agreement.create({ data: { id: A.agreement, tenantId: t, kind: "ATHLETE_TERMS", version: 1, bodyHash: "x".repeat(64), effectiveAt: new Date("2026-01-01") } });
    await prisma.user.create({ data: { id: A.admin, tenantId: t, clerkId: A.admin, email: "admin@a.invalid", roles: ["BTG_ADMIN"] } });
    /* SponsorX NEXT (Stage 9 Batch A) — a masthead, a SELLING edition, one open slot. */
    await prisma.publication.create({ data: { id: A.publication, tenantId: t, name: "TI Secret Masthead" } });
    await prisma.edition.create({ data: { id: A.edition, tenantId: t, publicationId: A.publication, label: "TI Secret Edition", closeDate: new Date(Date.now() + 30 * 864e5), publishTarget: new Date(Date.now() + 45 * 864e5), thresholdCents: 100000, state: "SELLING" } });
    await prisma.adSlot.create({ data: { id: A.slot, tenantId: t, editionId: A.edition, slotCode: "TI-SECRET-HALF", kind: "HALF", priceCents: 50000 } });
    /* SponsorX NEXT students (Batch B) — a school, an ACTIVE student with a code, a prospect; and tenant B's own. */
    await prisma.property.createMany({ data: [
      { id: A.school, tenantId: t, slug: "ti-school-a", name: "TI Secret School", kind: "SCHOOL" },
      { id: B.school, tenantId: B.tenant, slug: "ti-school-b", name: "TI School B", kind: "SCHOOL" },
    ] });
    await prisma.student.createMany({ data: [
      { id: A.student, tenantId: t, propertyId: A.school, legalName: "TI Secret Student", displayName: "TISS", masthead: ["WRITER"], state: "ACTIVE" },
      { id: B.student, tenantId: B.tenant, propertyId: B.school, legalName: "TI Student B", displayName: "TISB", masthead: ["WRITER"], state: "ACTIVE" },
    ] });
    await prisma.studentCode.create({ data: { id: A.code, tenantId: t, studentId: A.student, code: "ti-secret-code-a" } });
    await prisma.studentProspect.create({ data: { id: A.prospect, tenantId: t, studentId: A.student, businessName: "TI Secret Deli", category: "RESTAURANT" } });
    /* Batch C — an edition asset and a claim on a profile. */
    await prisma.editionAsset.create({ data: { id: A.asset, tenantId: t, editionId: A.edition, kind: "ARTICLE", title: "TI Secret Article", sourceKind: "BTG" } });
    await prisma.propertyOnboarding.create({ data: { id: A.onboarding, tenantId: t, orgType: "TEAM", orgName: "TI Secret Org", state: "PENDING_REVIEW" } });
    await prisma.inventoryItem.createMany({ data: [
      { id: A.item, tenantId: t, athleteId: A.athlete, title: "TI Secret Item", kind: "OTHER", priceCents: 5000 },
      { id: A.schoolItem, tenantId: t, propertyId: A.school, title: "TI Secret Banner", kind: "SIGNAGE", priceCents: 9000 },
    ] });
    await prisma.listing.create({ data: { id: A.listing, tenantId: t, propertyId: A.school, inventoryItemId: A.schoolItem, title: "TI Secret Listing", description: "TI secret listing description", state: "PENDING_APPROVAL" } });
    /* 2S3-BE-05 — sold by the athlete with no team, published, so every catalogue and search read is swept against it. */
    await prisma.listing.create({ data: { id: A.athleteListing, tenantId: t, sellerAthleteId: A.athlete, inventoryItemId: A.item, title: "TI Secret Athlete Listing", description: "TI secret athlete listing description", state: "PUBLISHED", publishedAt: new Date(),
      /* 2S3-BE-06 — went live on its own, so BTG's "Published automatically" read is swept for leaks too. */
      publishedAutomatically: true } });
    await prisma.offer.create({ data: {
      id: A.offer, tenantId: t, campaignId: A.campaign, athleteId: A.athlete, jobId: A.job, brief: "TI Secret brief", compensation: 20000, sellPrice: 40000,
      deliverables: [{ title: "Post", dueDate: "2027-06-01T00:00:00.000Z" }], usageRights: "90 days", disclosures: [], expiresAt: new Date(Date.now() + 30 * 864e5),
      state: "SENT", sentAt: new Date(), termsHash: "t".repeat(64),
    } });
    await prisma.offerChangeRequest.create({ data: { id: A.changeRequest, tenantId: t, offerId: A.offer, requestedBy: "ti_a_athlete", note: "TI Secret change note" } });
    await prisma.tenantBranding.create({ data: { tenantId: t, displayName: "TI Secret Brand", primaryColor: "#123456" } });
    await prisma.brandRestriction.create({ data: { id: A.restriction, tenantId: t, athleteId: A.athlete, category: "GAMBLING", type: "PROHIBITED", reason: "TI Secret reason" } });
    /* Far-future expiry: the cart sweep (2S4-BE-01) is platform-wide, and
       another file runs it a day ahead while this sweep is fingerprinting. */
    await prisma.cart.create({ data: { id: A.cart, tenantId: t, sponsorId: A.sponsor, expiresAt: new Date(Date.now() + 3650 * 864e5) } });
    await prisma.commissionRule.create({ data: { id: A.rule, tenantId: t, ruleKey: "ti_rule_key_a", version: 1, kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 1234, priority: 0, effectiveFrom: new Date("2026-01-01"), note: "TI Secret rule" } });
    /* Far-future: the reservation sweep is platform-wide too. */
    await prisma.reservation.create({ data: { id: A.reservation, tenantId: t, sponsorId: A.sponsor, cartId: A.cart, expiresAt: new Date(Date.now() + 3650 * 864e5) } });
    await prisma.agreementAcceptance.create({ data: { id: A.mktAcceptance, tenantId: t, agreementId: A.agreement, userId: A.admin, bodyHash: "x".repeat(64), ip: "203.0.113.9", userAgent: "TI Secret agent" } });
    await prisma.marketplaceOrder.create({ data: {
      id: A.mktOrder, tenantId: t, sponsorId: A.sponsor, reservationId: A.reservation, subtotalCents: 14000, feesCents: 0, totalCents: 14000,
      requiresApproval: true, approvalReasons: ["TI Secret reason"],
      acceptanceId: A.mktAcceptance, billingName: "TI Secret Billing", billingEmail: "ti-secret-billing@a.invalid", billingReference: "TI Secret PO",
      lines: { create: [
        { id: A.mktLine, tenantId: t, listingId: A.listing, inventoryItemId: A.schoolItem, itemTenantId: t, propertyId: A.school, title: "TI Secret line", quantity: 1, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-01-02"), unitPriceCents: 9000, lineTotalCents: 9000 },
        { tenantId: t, listingId: A.athleteListing, inventoryItemId: A.item, itemTenantId: t, sellerAthleteId: A.athlete, title: "TI Secret athlete line", quantity: 1, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-01-02"), unitPriceCents: 5000, lineTotalCents: 5000 },
      ] },
    } });
    await prisma.orderLineDelivery.create({ data: {
      id: A.delivery, tenantId: t, orderId: A.mktOrder, lineId: A.mktLine, sponsorId: A.sponsor, propertyId: A.school, propertyTenantId: t,
      state: "DELIVERED", deliveredAt: new Date(), deliveredByName: "TI Secret Seller", note: "TI Secret delivery note",
      confirmDueAt: new Date(Date.now() + 3650 * 864e5),
    } });
    await prisma.teamInvitation.create({ data: { id: A.teamInvite, tenantId: t, propertyId: A.school, athleteId: A.athlete, athleteTenantId: t, teamShareBps: 1500 } });
    await prisma.reservation.create({ data: { id: A.dueReservation, tenantId: t, sponsorId: A.sponsor, cartId: A.cart, state: "CONVERTED", convertedAt: new Date(), expiresAt: new Date(Date.now() + 3650 * 864e5) } });
    await prisma.marketplaceOrder.create({ data: {
      id: A.dueOrder, tenantId: t, sponsorId: A.sponsor, reservationId: A.dueReservation, state: "AWAITING_PAYMENT",
      subtotalCents: 7000, feesCents: 0, totalCents: 7000, requiresApproval: false, approvalReasons: [],
    } });
    await prisma.paymentAttempt.create({ data: {
      id: A.failedAttempt, tenantId: t, orderId: A.dueOrder, sponsorId: A.sponsor, amountCents: 7000, provider: "standin",
      state: "FAILED", failureReason: "TI Secret decline",
    } });
    await prisma.payout.create({ data: {
      id: A.payout, tenantId: t, payeeType: "ATHLETE", payeeId: A.athlete, payeeTenantId: t, amountCents: 4321,
      decisionNote: "TI Secret payout note", lines: { create: [{ orderId: A.mktOrder, amountCents: 4321 }] },
    } });
    await prisma.cartLine.create({ data: { id: A.cartLine, tenantId: t, cartId: A.cart, listingId: A.listing, quantity: 1, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-01-02"), unitPriceCents: 9000 } });
    await prisma.inquiry.create({ data: {
      id: A.inquiry, tenantId: t, companyName: "TI Secret Café", lastName: "TI Secret Requester", email: "ti-secret-requester@a.invalid",
      message: "Sponsor brief\nBrand category: TI Secret coffee", categoryText: "TI Secret coffee", source: "web-form",
    } });
    await prisma.inquiryDocument.create({ data: {
      id: A.inquiryDocument, tenantId: t, inquiryId: A.inquiry, kind: "PROOF_OF_BUSINESS", filename: "ti-secret-license.pdf",
      contentType: "application/pdf", bytes: 100, r2Key: "sponsor-requests/ti_inquiry_a/ti_inquiry_doc_a/ti-secret-license.pdf", uploadedAt: new Date(),
    } });
    /* 2S1-BE-13 / 2S1-BE-15 — far-future retention: the purge sweep is platform-wide. */
    await prisma.accountClosure.create({ data: {
      id: A.closure, tenantId: t, subjectKind: "ATHLETE", subjectId: A.athlete, cause: "REJECTED", reason: "TI Secret reason",
      retainUntil: new Date(Date.now() + 3650 * 864e5), contactEmail: "ath@a.invalid", displayName: "TI Secret Closed",
      reactivationRequestedAt: new Date(), reactivationRequestNote: "TI Secret request",
    } });
    await prisma.guardianHandoff.create({ data: {
      id: A.handoff, tenantId: t, athleteId: A.athlete, fromGuardianId: A.guardian, requesterName: "TI Secret New Guardian",
      requesterEmail: "ti-secret-newg@a.invalid", relationship: "PARENT", state: "WAITING", emailConfirmedAt: new Date(), submittedAt: new Date(),
    } });
    /* GET /guardian-handoffs/{id}/documents/{documentId}: the "documents" probe id, as a real handoff document of tenant A. */
    await prisma.guardianHandoffDocument.create({ data: {
      id: A.inquiryDocument, tenantId: t, handoffId: A.handoff, kind: "GUARDIAN_ID", filename: "ti-secret-id.png",
      contentType: "image/png", bytes: 100, r2Key: `guardian-handoffs/${A.handoff}/${A.inquiryDocument}/ti-secret-id.png`, uploadedAt: new Date(),
    } });
    await prisma.ageOfMajority.create({ data: { id: A.ageRow, tenantId: t, countryCode: "ZZ", regionCode: "", age: 18 } });
    await prisma.restrictedWord.create({ data: { id: A.restrictedWord, tenantId: t, word: "TI Secret word", normalized: "ti secret word", kind: "OTHER_ILLEGAL", addedBy: A.admin } });
    await prisma.athleteClaim.create({ data: { id: A.claim, tenantId: t, athleteId: A.athlete, claimantName: "TI Secret Claimant", claimantEmail: "secret@a.invalid", rosterMatched: true } });
    await prisma.guardian.create({ data: { id: B.guardian, tenantId: B.tenant, legalName: "TI Guardian B", email: "g@b.invalid", relationship: "PARENT" } });
    for (const u of B_ACTORS) {
      await prisma.user.create({ data: {
        id: u.id, tenantId: B.tenant, clerkId: u.id, email: `${u.id}@b.invalid`, roles: [...u.roles],
        sponsorId: "sponsorId" in u ? u.sponsorId : null, athleteId: "athleteId" in u ? u.athleteId : null,
        studentId: "studentId" in u ? u.studentId : null, propertyId: "propertyId" in u ? u.propertyId : null,
        guardianId: "guardianId" in u ? u.guardianId : null,
      } });
    }
    for (const u of A_ACTORS) {
      await prisma.user.create({ data: {
        id: u.id, tenantId: t, clerkId: u.id, email: `${u.id}@a.invalid`, roles: [...u.roles],
        sponsorId: "sponsorId" in u ? u.sponsorId : null, athleteId: "athleteId" in u ? u.athleteId : null,
      } });
    }

    /* 2S8-SEC-01 — tenant A's admin approves an outside school; approval provisions tenant E. */
    await prisma.propertyOnboarding.create({ data: {
      id: E.onboarding, tenantId: t, orgType: "SCHOOL", orgName: E.name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Erin Vale", email: `${E_MANAGER}@tenant-test.invalid`, role: "Athletic director", primary: true }],
      details: { district: "TI District", athleticDirector: "Erin Vale", sports: ["Soccer"] },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const admin = { userId: A.admin, tenantId: t, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
    const approved = await decideOnboarding(admin, E.onboarding, "APPROVE");
    E.property = approved.propertyId!;
    const provisioned = await prisma.property.findUniqueOrThrow({ where: { id: E.property }, select: { tenantId: true } });
    E.tenant = provisioned.tenantId;
    E.manager = (await prisma.user.findFirstOrThrow({ where: { tenantId: E.tenant }, select: { id: true } })).id;
  }

  /** The routes a tenant-bound actor can call: documented, not public. */
  const routes = () =>
    DOCUMENTED_PATHS.map((r) => ({ method: r.split(" ")[0]!, path: r.split(" ")[1]! }))
      .filter(({ path }) => !/^\/(public|webhooks|openapi\.json)/.test(path) && path !== "/" && path !== "/me");

  const concrete = (path: string, params: Record<string, string> = PARAM_FOR) =>
    path.replace(/\/([a-z-]+)\/\{(\w+)\}/g, (_m, noun: string) => `/${noun}/${params[noun] ?? "unknown"}`);

  async function hit(method: string, path: string, clerk: string, params: Record<string, string> = PARAM_FOR) {
    const key = `${method} ${path}`;
    const res = await fetch(`${base}/api/v1${concrete(path, params)}`, {
      method,
      headers: { "x-test-clerk": clerk, "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(BODY[key] ?? {}),
    });
    return { status: res.status, text: await res.text() };
  }

  beforeAll(async () => {
    await seed();
    before = await fingerprint();
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("covers the whole tenant-bound API", () => {
    expect(routes().length).toBeGreaterThanOrEqual(55);
    for (const r of routes()) {
      if (r.path.includes("{")) {
        expect(concrete(r.path), `no tenant-A id for ${r.path}`).not.toContain("unknown");
      }
    }
  });

  it("positive control: tenant A's own admin reaches tenant A's records", async () => {
    const reads = routes().filter((r) => r.method === "GET" && r.path.includes("{"));
    const ok = [];
    for (const r of reads) if ((await hit("GET", r.path, A.admin)).status === 200) ok.push(r.path);
    /* Nearly all of them; a few need data the seed deliberately omits. */
    expect(ok.length).toBeGreaterThanOrEqual(Math.floor(reads.length * 0.7));
  });

  it("every route, as every tenant-B actor: never a success, never a tenant-A value", async () => {
    const secrets = [
      ...Object.values(A).filter((v) => v !== A.tenant),
      "TI Secret", "secret@a.invalid", "ti-secret-token-a", "TI secret",
    ];
    const failures: string[] = [];
    /* Tenant B's every role, and the outside organisation's own manager. */
    for (const actor of [...B_ACTORS, { id: E_MANAGER }]) {
      for (const r of routes()) {
        const key = `${r.method} ${r.path}`;
        const { status, text } = await hit(r.method, r.path, actor.id);
        results.push({ route: key, actor: actor.id, status });
        /* A route that names a tenant-A record — in its path or its body —
           must refuse. A bare list route answers tenant B with tenant B's
           own rows, which is correct; for those only the leak check applies. */
        const aimsAtA = r.path.includes("{") || JSON.stringify(BODY[key] ?? {}).includes("ti_");
        if (aimsAtA && status < 400) failures.push(`${actor.id} ${key} → ${status}: ${text.slice(0, 160)}`);
        if (aimsAtA && status === 400) failures.push(`${actor.id} ${key} → 400 (stopped at validation; needs a valid BODY): ${text.slice(0, 200)}`);
        /* A 500 is not a refusal: the call crashed before or instead of the
           scope check, so it proves nothing about isolation. */
        if (status >= 500) failures.push(`${actor.id} ${key} → ${status} (crashed, not refused): ${text.slice(0, 200)}`);
        const leaked = secrets.filter((s) => text.includes(s));
        if (leaked.length) failures.push(`${actor.id} ${key} → leaked ${leaked.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("list endpoints answer tenant B with tenant B's rows only", async () => {
    for (const path of ["/applications", "/operations/delivery-health", "/operations/network-metrics", "/operations/job-economics", "/operations/board", "/payments/failed"]) {
      const { status, text } = await hit("GET", path, "ti_b_admin");
      expect(status).toBe(200);
      expect(text).not.toContain("ti_athlete_a");
      expect(text).not.toContain("TI Secret");
    }
  });

  it("2S7-FE-02 · tenant A's own admin sees tenant A's failed payment on the console", async () => {
    const { status, text } = await hit("GET", "/payments/failed", A.admin);
    expect(status, text).toBe(200);
    expect(JSON.parse(text).payments).toEqual([expect.objectContaining({ orderId: A.dueOrder, sponsorName: "TI Secret Sponsor A", failureReason: "TI Secret decline" })]);
  });

  it("2S8-SEC-01 · the outside organisation is its own tenant, and its manager reaches it", async () => {
    expect(E.tenant).not.toBe(A.tenant);
    const me = await hit("GET", "/me", E_MANAGER);
    expect(JSON.parse(me.text)).toMatchObject({ tenantId: E.tenant, roles: ["PROPERTY_MGR"], propertyId: E.property });
    const mine = await hit("GET", "/properties/mine", E_MANAGER);
    expect(mine.status).toBe(200);
    expect(JSON.parse(mine.text).property).toMatchObject({ id: E.property, name: E.name });
  });

  it("2S8-SEC-01 · and no other tenant's sponsor, athlete, property or admin role reaches the outside tenant", async () => {
    const beforeE = await fingerprint(E.tenant);
    /* Aim every path parameter the outside tenant owns at it; the rest stay on tenant A. */
    const params = { ...PARAM_FOR, properties: E.property, onboarding: E.onboarding };
    const secrets = [E.tenant, E.property, E.manager, E.name, `${E_MANAGER}@`];
    const failures: string[] = [];
    const attackers = [{ id: A.admin }, ...A_ACTORS, ...B_ACTORS];
    for (const actor of attackers) {
      for (const r of routes()) {
        const aimsAtE = r.path.startsWith("/properties/{");
        /* Reads everywhere, and every write aimed at the outside tenant. Tenant A's
           own writes are not replayed here — they are its own to make. */
        if (r.method !== "GET" && !aimsAtE) continue;
        const { status, text } = await hit(r.method, r.path, actor.id, params);
        if (aimsAtE && status < 400) failures.push(`${actor.id} ${r.method} ${r.path} → ${status}: ${text.slice(0, 160)}`);
        if (status >= 500) failures.push(`${actor.id} ${r.method} ${r.path} → ${status} (crashed, not refused)`);
        /* BTG's own records of its own decision — the onboarding it reviewed and
           the audit row of the approval, which names what it provisioned — may
           name the organisation to tenant A's admin. Nobody else, nowhere else. */
        /* And, as E's OPERATOR, tenant A's admin reads E's marketplace records —
           inventory and listings — by design (the `operated` scope, matrix §18). */
        const own = actor.id === A.admin && (r.path.startsWith("/onboarding") || r.path === "/audit-log"
          || r.path.startsWith("/inventory") || r.path.startsWith("/listings"));
        const leaked = own ? [] : secrets.filter((x) => text.includes(x));
        if (leaked.length) failures.push(`${actor.id} ${r.method} ${r.path} → leaked ${leaked.join(", ")}`);
      }
    }
    expect(failures).toEqual([]);
    expect(await fingerprint(E.tenant)).toBe(beforeE);
  }, 120_000);

  it("and nothing tenant A owns changed, in any table", async () => {
    expect(await fingerprint()).toBe(before);
  });
});
