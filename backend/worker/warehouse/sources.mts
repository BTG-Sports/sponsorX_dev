/**
 * What the warehouse copies from the product — 3S1-DATA-01
 * (documentation/SponsorX-Warehouse-Schema.md §2, §3).
 *
 * AN ALLOW-LIST, ON PURPOSE (user, 2026-10-12). Each table names exactly the
 * columns copied. A column added to the product later is not copied until
 * someone adds it here, so personal data cannot drift into the warehouse; the
 * design keeps it out entirely (no email, legal name, phone, birth date, fan
 * email, reward-code string, billing details or audit before/after).
 * `tests/warehouse-ingest.test.ts` fails if a known personal column appears.
 *
 * TWO MODES.
 *   APPEND — tables only ever added to (events). Read from the watermark,
 *     with an overlap so late writes and late in-place updates (a click's
 *     city, filled by the geo job) are caught; one raw row per source row.
 *   VERSIONED — everything else. Most have no `updatedAt`, so they are read
 *     in full and a new raw version is stored only when the row's content
 *     changed. That keeps the history the product overwrites in place.
 */

export type Source =
  | { table: string; mode: "VERSIONED"; columns: readonly string[]; where?: string }
  | { table: string; mode: "APPEND"; columns: readonly string[]; timeColumn: string; where?: string };

/** The audit actions the warehouse's facts read (design §4–§7); nothing else, and never before/after. */
export const AUDIT_ACTIONS_COPIED = [
  "deliverable.verify",
  "deliverable.requestRevision",
  "deliverable.systemRevision",
  "campaign.launch",
  "campaign.complete",
  "order.cancel",
  "marketplaceOrder.cancelled",
] as const;

/**
 * Columns read only to compute a derived value, then dropped before anything
 * is written. The athlete's birth date leaves the product only as `is_minor`.
 */
export const TRANSIENT_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  Athlete: ["birthDate", "majorityAge"],
};

export const SOURCES: readonly Source[] = [
  /* ── who ─────────────────────────────────────────────────────────────── */
  { table: "Sponsor", mode: "VERSIONED", columns: ["id", "tenantId", "name", "ownership", "categories", "schoolPropertyId", "updatedAt"] },
  { table: "Property", mode: "VERSIONED", columns: ["id", "tenantId", "name", "kind", "city", "stateCode"] },
  {
    table: "Athlete", mode: "VERSIONED",
    columns: ["id", "tenantId", "displayName", "sport", "position", "level", "school", "gradYear", "tier", "ageBand",
      "city", "stateCode", "countryCode", "propertyId", "state", "createdAt"],
  },
  { table: "NilJob", mode: "VERSIONED", columns: ["id", "tenantId", "name", "baseLow", "baseHigh", "sellLow", "sellHigh", "sellFloorEmerging", "sellFloorCreator", "sellFloorPremium"] },

  /* ── managed campaigns ───────────────────────────────────────────────── */
  { table: "Campaign", mode: "VERSIONED", columns: ["id", "tenantId", "sponsorId", "briefId", "name", "budget", "startDate", "endDate", "state", "updatedAt"] },
  {
    table: "CampaignBrief", mode: "VERSIONED",
    columns: ["id", "tenantId", "sponsorId", "objective", "budget", "packageId", "startDate", "endDate", "sports", "stateCodes", "categories", "state", "autoApproved", "createdAt", "updatedAt"],
  },
  {
    table: "CampaignOrder", mode: "VERSIONED",
    columns: ["id", "tenantId", "campaignId", "athleteId", "jobId", "compensation", "sellPrice", "dueDate", "projectedImpressions", "impliedCpm", "projectionSource", "state", "acceptedAt"],
  },
  { table: "Deliverable", mode: "VERSIONED", columns: ["id", "tenantId", "orderId", "title", "dueDate", "state", "publishedAt", "platform"] },
  { table: "MetricDaily", mode: "VERSIONED", columns: ["id", "tenantId", "deliverableId", "day", "views", "engagements", "source", "createdAt", "updatedAt"] },
  { table: "Earning", mode: "VERSIONED", columns: ["id", "tenantId", "athleteId", "orderId", "gross", "adjustment", "state", "taxYear", "paidAt"] },
  { table: "CampaignInvoice", mode: "VERSIONED", columns: ["id", "tenantId", "campaignId", "status", "amount", "currency", "issuedAt", "dueAt", "paidAt"] },

  /* ── fans ────────────────────────────────────────────────────────────── */
  {
    table: "Reward", mode: "VERSIONED",
    columns: ["id", "tenantId", "campaignId", "singleUse", "expiresAt", "state", "eligibility", "redemptionCap", "redemptionCount", "venueCity", "venueStateCode"],
  },
  { table: "RewardToken", mode: "VERSIONED", columns: ["id", "tenantId", "rewardId", "athleteId", "refusedRedeems", "lastRefusedRedeemAt"] },
  { table: "TrackingLink", mode: "VERSIONED", columns: ["id", "tenantId", "deliverableId"] },
  { table: "RewardEvent", mode: "APPEND", timeColumn: "at", columns: ["id", "tenantId", "tokenId", "type", "at", "city", "region", "singleUse"] },
  { table: "LinkEvent", mode: "APPEND", timeColumn: "at", columns: ["id", "tenantId", "linkId", "at", "city", "region"] },

  /* ── NEXT editions ───────────────────────────────────────────────────── */
  { table: "Edition", mode: "VERSIONED", columns: ["id", "tenantId", "publicationId", "label", "closeDate", "publishTarget", "printDate", "state"] },
  { table: "AdSlot", mode: "VERSIONED", columns: ["id", "tenantId", "editionId", "slotCode", "kind", "priceCents", "quantity", "campaignId", "soldCents", "soldAt"] },
  { table: "EditionEvent", mode: "APPEND", timeColumn: "at", columns: ["id", "tenantId", "editionId", "targetKind", "targetRef", "type", "at", "city", "region"] },

  /* ── marketplace and money ───────────────────────────────────────────── */
  {
    table: "InventoryItem", mode: "VERSIONED",
    columns: ["id", "tenantId", "athleteId", "propertyId", "jobId", "title", "kind", "priceCents", "quantity", "active", "version", "categories", "createdAt", "updatedAt"],
  },
  {
    table: "MarketplaceOrder", mode: "VERSIONED",
    columns: ["id", "tenantId", "sponsorId", "state", "currency", "subtotalCents", "feesCents", "totalCents", "requiresApproval",
      "contractedAt", "fulfilledAt", "paidAt", "refundedAt", "refundCause", "createdAt", "updatedAt"],
  },
  {
    table: "MarketplaceOrderLine", mode: "VERSIONED",
    columns: ["id", "tenantId", "orderId", "listingId", "inventoryItemId", "itemTenantId", "propertyId", "sellerAthleteId", "quantity", "startsOn", "endsOn", "unitPriceCents", "lineTotalCents"],
  },
  {
    table: "OrderLineFinancials", mode: "VERSIONED",
    columns: ["id", "tenantId", "orderId", "lineId", "grossCents", "discountCents", "netCents", "platformFeeCents", "managementFeeCents", "processingCents",
      "propertyShareCents", "referralCents", "reserveCents", "availableCents", "teamShareBps", "teamAvailableCents", "teamReserveCents", "athleteId", "computedAt"],
  },
  {
    table: "LedgerEntry", mode: "VERSIONED",
    columns: ["id", "tenantId", "journalId", "entryType", "orderId", "lineId", "account", "partyType", "partyId", "partyTenantId", "debitCents", "creditCents", "status", "createdAt"],
  },
  { table: "PaymentAttempt", mode: "VERSIONED", columns: ["id", "tenantId", "orderId", "sponsorId", "amountCents", "provider", "state", "refundedCents", "createdAt", "updatedAt"] },
  {
    table: "Payout", mode: "VERSIONED",
    columns: ["id", "tenantId", "payeeType", "payeeId", "payeeTenantId", "amountCents", "state", "requestedAt", "decidedAt", "sentAt", "paidAt", "failedAt", "returnedAt", "approvedAutomatically", "createdAt", "updatedAt"],
  },
  {
    table: "RefundDue", mode: "VERSIONED",
    columns: ["id", "tenantId", "orderId", "lineId", "sponsorId", "amountCents", "cause", "state", "sentAt", "campaignId", "editionId", "createdAt", "updatedAt"],
  },

  /* ── the change history the facts date things by ────────────────────── */
  {
    table: "AuditLog", mode: "APPEND", timeColumn: "at",
    columns: ["id", "tenantId", "action", "entity", "entityId", "at"],
    where: `"action" IN (${AUDIT_ACTIONS_COPIED.map((a) => `'${a}'`).join(", ")})`,
  },
];
