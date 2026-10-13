import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   3S1-DATA-02 — the daily campaign fact, its dimensions, the marketplace fact
   and the two money snapshots, built from the raw copies
   (documentation/SponsorX-Warehouse-Schema.md §4–§8, signed 2026-10-12).

   Done when: "warehouse metrics reconcile to transactional campaign, order
   and payment totals within defined tolerance" — the design sets every
   tolerance at zero.

   User's choices (2026-10-13): rebuilt right after each hourly copy; the
   whole model rebuilt each time while the data is small; money snapshots
   start the day copying began, earlier days absent rather than invented.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

async function warehouseUrl(suffix: string): Promise<string> {
  const url = new URL(seededDb.TEST_DATABASE_URL);
  const name = `${url.pathname.slice(1)}_${suffix}`;
  const admin = new pg.Client({ connectionString: seededDb.TEST_DATABASE_URL });
  await admin.connect();
  if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name])).rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!hasDatabase)("3S1-DATA-02 · the model", { timeout: 180_000 }, async () => {
  const { ingestWarehouse } = await import("../worker/warehouse/ingest.mts");
  const { reconcileWarehouse } = await import("../worker/warehouse/reconcile.mts");
  const product = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, options: "-c TimeZone=UTC" });
  const warehouse = new pg.Pool({ connectionString: await warehouseUrl("warehouse_model"), options: "-c TimeZone=UTC" });
  const T = "wm_t";
  const w = async (sql: string, params: unknown[] = []) => (await warehouse.query(sql, params)).rows;
  const today = new Date().toISOString().slice(0, 10);

  /** Insert fixture rows without foreign-key checks (superuser; the test owns these rows). */
  async function seed(sql: string) {
    const c = await product.connect();
    try {
      await c.query("SET session_replication_role = replica");
      await c.query(sql);
    } finally {
      await c.query("SET session_replication_role = DEFAULT");
      c.release();
    }
  }

  const TABLES = ["AuditLog", "RefundDue", "Payout", "PaymentAttempt", "LedgerEntry", "OrderLineFinancials", "MarketplaceOrderLine", "MarketplaceOrder",
    "InventoryItem", "CampaignInvoice", "Earning", "EditionEvent", "AdSlot", "Edition", "Publication", "LinkEvent", "TrackingLink", "RewardEvent",
    "RewardToken", "Reward", "MetricDaily", "Deliverable", "CampaignOrder", "Campaign", "CampaignBrief", "NilJob", "Athlete", "Property", "Sponsor"];
  async function clean() {
    await seed(TABLES.map((t) => `DELETE FROM "${t}" WHERE "tenantId" = '${T}';`).join("\n") + `DELETE FROM "Tenant" WHERE id = '${T}';`);
  }

  /** One fact row's measures, by its natural keys. */
  async function fact(date: string, athlete: string | null, channel: string, inventory: string | null) {
    const rows = await w(`
      SELECT f.* FROM dw.fact_campaign_daily f
        JOIN dw.dim_date d ON d.date_key = f.date_key
        JOIN dw.dim_campaign c ON c.campaign_key = f.campaign_key
        JOIN dw.dim_channel ch ON ch.channel_key = f.channel_key
        LEFT JOIN dw.dim_athlete a ON a.athlete_key = f.athlete_key
        LEFT JOIN dw.dim_inventory i ON i.inventory_key = f.inventory_key
       WHERE c.campaign_id = 'wm_c1' AND d.date = $1 AND ch.channel_code = $2
         AND ($3::text IS NULL AND f.athlete_key = 0 OR a.athlete_id = $3)
         AND ($4::text IS NULL AND f.inventory_key = 0 OR i.source_id = $4)`, [date, channel, athlete, inventory]);
    expect(rows.length, `${date} ${athlete} ${channel} ${inventory}`).toBe(1);
    return rows[0]!;
  }

  beforeAll(async () => {
    await clean();
    await warehouse.query("DROP SCHEMA IF EXISTS raw CASCADE; DROP SCHEMA IF EXISTS stg CASCADE; DROP SCHEMA IF EXISTS dw CASCADE; DROP SCHEMA IF EXISTS sem CASCADE; DROP TABLE IF EXISTS public.warehouse_migrations");
    await seed(`
      INSERT INTO "Tenant" (id, name) VALUES ('${T}', 'Warehouse model');
      INSERT INTO "Sponsor" (id, "tenantId", name, ownership, categories, "updatedAt") VALUES ('wm_sp', '${T}', 'Rosa''s Tacos', 'BTG', '{FOOD}', now());
      INSERT INTO "Property" (id, "tenantId", slug, name, kind, city, "stateCode") VALUES ('wm_prop', '${T}', 'wm-prop', 'Lakeside High', 'SCHOOL', 'Baltimore', 'MD');
      INSERT INTO "Athlete" (id, "tenantId", slug, "legalName", "displayName", sport, tier, "ageBand", city, "stateCode", "propertyId", state, "countryCode", "majorityAge")
        VALUES ('wm_a1', '${T}', 'wm-a1', 'Sam Lee', 'Sam', 'Soccer', 'CREATOR', '18_PLUS', 'Baltimore', 'MD', 'wm_prop', 'ACTIVE', 'US', 18),
               ('wm_a2', '${T}', 'wm-a2', 'Jo Reed', 'Jo', 'Soccer', 'EMERGING', '16_17', ' austin ', 'TX', NULL, 'ACTIVE', 'US', 18);
      -- Its own job for social work. The in-person job is the catalogue's 'SX-05' (the product's
      -- APPEARANCE_JOBS): orders reference it without this test creating or deleting the shared row.
      INSERT INTO "NilJob" (id, "tenantId", name, "baseLow", "baseHigh", "sellLow", "sellHigh", "sellFloorEmerging", "sellFloorCreator", "sellFloorPremium")
        VALUES ('wm_job', '${T}', 'Story Drop', 25, 50, 75, 125, 60, 75, 90);
      INSERT INTO "CampaignBrief" (id, "tenantId", "sponsorId", objective, budget, "startDate", "endDate", categories, "stateCodes", sports, state, "updatedAt")
        VALUES ('wm_b1', '${T}', 'wm_sp', 'Awareness', 500000, '2026-09-01', '2026-12-31', '{FOOD}', '{MD,TX}', '{Soccer}', 'CAMPAIGN_CREATED', now());
      INSERT INTO "Campaign" (id, "tenantId", "sponsorId", "briefId", name, budget, "startDate", "endDate", state, "updatedAt")
        VALUES ('wm_c1', '${T}', 'wm_sp', 'wm_b1', 'Fall tacos', 500000, '2026-09-01', '2026-12-31', 'ACTIVE', now());
      INSERT INTO "CampaignOrder" (id, "tenantId", "campaignId", "athleteId", "jobId", compensation, "sellPrice", "usageRights", "dueDate", state, "acceptedAt") VALUES
        ('wm_o1', '${T}', 'wm_c1', 'wm_a1', 'wm_job', 10000, 20000, '90 days', '2026-09-30', 'ACTIVE', '2026-09-05 10:00'),
        ('wm_o2', '${T}', 'wm_c1', 'wm_a1', 'SX-05', 20000, 40000, '90 days', '2026-09-30', 'ACTIVE', '2026-09-05 11:00'),
        ('wm_o3', '${T}', 'wm_c1', 'wm_a2', 'wm_job', 8000, 15000, '90 days', '2026-09-30', 'CANCELLED', '2026-09-06 09:00');
      INSERT INTO "Deliverable" (id, "tenantId", "orderId", title, "dueDate", state, "publishedUrl", "publishedAt", platform) VALUES
        ('wm_d1', '${T}', 'wm_o1', 'Reel', '2026-09-20', 'VERIFIED', 'https://instagram.com/p/x', '2026-09-18 15:00', 'INSTAGRAM'),
        ('wm_d2', '${T}', 'wm_o2', 'Store visit', '2026-09-25', 'NOT_STARTED', NULL, NULL, NULL),
        ('wm_d3', '${T}', 'wm_o3', 'Story', '2026-09-22', 'NOT_STARTED', NULL, NULL, NULL);
      INSERT INTO "MetricDaily" (id, "tenantId", "deliverableId", day, views, engagements, source) VALUES
        ('wm_m1', '${T}', 'wm_d1', '2026-09-19', 1000, 50, 'VERIFIED_API'),
        ('wm_m2', '${T}', 'wm_d1', '2026-09-19', 1500, 90, 'SELF_REPORTED'),
        ('wm_m3', '${T}', 'wm_d1', '2026-09-20', 400, 20, 'VERIFIED_MANUAL');
      INSERT INTO "Reward" (id, "tenantId", "campaignId", "offerText", terms, "expiresAt", state, "venueCity", "venueStateCode") VALUES
        ('wm_r1', '${T}', 'wm_c1', 'Free taco', 't', '2026-12-31', 'ACTIVE', 'Arlington', 'VA'),
        ('wm_r2', '${T}', 'wm_c1', 'Free drink', 't', '2026-12-31', 'ACTIVE', NULL, NULL);
      INSERT INTO "RewardToken" (id, "tenantId", "rewardId", "athleteId", token) VALUES
        ('wm_t1', '${T}', 'wm_r1', 'wm_a1', 'wm-tok-1'), ('wm_t2', '${T}', 'wm_r2', 'wm_a2', 'wm-tok-2'), ('wm_t3', '${T}', 'wm_r2', NULL, 'wm-tok-3');
      INSERT INTO "RewardEvent" (id, "tenantId", "tokenId", type, at) VALUES
        ('wm_e1', '${T}', 'wm_t1', 'SCAN', '2026-09-21 18:00'), ('wm_e2', '${T}', 'wm_t1', 'SCAN', '2026-09-21 18:05'),
        ('wm_e3', '${T}', 'wm_t1', 'LANDING', '2026-09-21 18:05'), ('wm_e4', '${T}', 'wm_t1', 'CLAIM', '2026-09-21 18:06'),
        ('wm_e5', '${T}', 'wm_t1', 'REDEEM', '2026-09-22 12:00'), ('wm_e6', '${T}', 'wm_t2', 'SCAN', '2026-09-21 19:00'),
        ('wm_e7', '${T}', 'wm_t3', 'SCAN', '2026-09-23 10:00');
      INSERT INTO "TrackingLink" (id, "tenantId", code, "deliverableId", "destinationUrl") VALUES ('wm_l1', '${T}', 'wm-code', 'wm_d1', 'https://rosas.invalid');
      INSERT INTO "LinkEvent" (id, "tenantId", "linkId", at) VALUES ('wm_k1', '${T}', 'wm_l1', '2026-09-18 16:00'), ('wm_k2', '${T}', 'wm_l1', '2026-09-18 17:00');
      INSERT INTO "Publication" (id, "tenantId", name) VALUES ('wm_pub', '${T}', 'Lakeside News');
      INSERT INTO "Edition" (id, "tenantId", "publicationId", label, "closeDate", "publishTarget", "thresholdCents", state)
        VALUES ('wm_ed', '${T}', 'wm_pub', 'Fall', '2026-09-01', '2026-09-20', 100000, 'PUBLISHED_DIGITAL');
      INSERT INTO "AdSlot" (id, "tenantId", "editionId", "slotCode", kind, "priceCents", "campaignId", "soldCents", "soldAt")
        VALUES ('wm_s1', '${T}', 'wm_ed', 'P3-HALF', 'HALF', 30000, 'wm_c1', 30000, '2026-09-08 09:00');
      INSERT INTO "EditionEvent" (id, "tenantId", "editionId", "targetKind", "targetRef", type, at) VALUES
        ('wm_v1', '${T}', 'wm_ed', 'AD_SLOT', 'wm_s1', 'QR_SCAN', '2026-09-24 10:00'),
        ('wm_v2', '${T}', 'wm_ed', 'AD_SLOT', 'wm_s1', 'LINK_CLICK', '2026-09-24 11:00'),
        ('wm_v3', '${T}', 'wm_ed', 'AD_SLOT', 'wm_s1', 'CTA_CLICK', '2026-09-25 11:00'),
        ('wm_v4', '${T}', 'wm_ed', 'ARTICLE', 'wm_art', 'LINK_CLICK', '2026-09-25 12:00');
      INSERT INTO "Earning" (id, "tenantId", "athleteId", "orderId", gross, adjustment, state, "taxYear", "paidAt")
        VALUES ('wm_ea1', '${T}', 'wm_a1', 'wm_o1', 10000, -500, 'PAID', 2026, '2026-10-01 08:00');
      INSERT INTO "CampaignInvoice" (id, "tenantId", "campaignId", "zohoInvoiceId", status, amount, currency, "issuedAt", "paidAt", "syncedAt")
        VALUES ('wm_inv', '${T}', 'wm_c1', 'z-wm', 'paid', 75000, 'USD', '2026-09-02 09:00', '2026-09-15 09:00', now());
      INSERT INTO "InventoryItem" (id, "tenantId", "propertyId", title, kind, "priceCents", version, categories, "updatedAt")
        VALUES ('wm_ii', '${T}', 'wm_prop', 'Courtside banner', 'BANNER', 50000, 2, '{}', now());
      INSERT INTO "MarketplaceOrder" (id, "tenantId", "sponsorId", "reservationId", state, currency, "subtotalCents", "feesCents", "totalCents", "requiresApproval",
          "contractedAt", "paidAt", "createdAt", "updatedAt")
        VALUES ('wm_mo', '${T}', 'wm_sp', 'wm_res', 'PAID', 'USD', 50000, 0, 50000, false, '2026-10-02 09:00', '2026-10-03 09:00', '2026-10-01 09:00', now());
      INSERT INTO "MarketplaceOrderLine" (id, "tenantId", "orderId", "listingId", "inventoryItemId", "itemTenantId", "propertyId", title, quantity, "startsOn", "endsOn", "unitPriceCents", "lineTotalCents")
        VALUES ('wm_ml', '${T}', 'wm_mo', 'wm_lst', 'wm_ii', '${T}', 'wm_prop', 'Courtside banner', 1, '2026-10-10', '2026-11-10', 50000, 50000);
      INSERT INTO "OrderLineFinancials" (id, "tenantId", "orderId", "lineId", "grossCents", "discountCents", "netCents", "platformFeeCents", "managementFeeCents",
          "processingCents", "propertyShareCents", "referralCents", "reserveCents", "availableCents", rules, "computedAt")
        VALUES ('wm_fin', '${T}', 'wm_mo', 'wm_ml', 50000, 5000, 45000, 5000, 0, 1500, 38500, 0, 3850, 34650, '{}', now());
      INSERT INTO "RefundDue" (id, "tenantId", "orderId", "lineId", "sponsorId", "amountCents", cause, state, "sentAt", "sentBy", method, "sentOn", reference, "updatedAt")
        VALUES ('wm_rd', '${T}', 'wm_mo', 'wm_ml', 'wm_sp', 5000, 'CANCELLATION_AGREED', 'SENT', '2026-10-05 09:00', 'wm_staff', 'CARD', '2026-10-05', 'rf-1', now());
      INSERT INTO "LedgerEntry" (id, "tenantId", "journalId", "entryType", account, "partyType", "partyId", "partyTenantId", "debitCents", "creditCents", status) VALUES
        ('wm_le1', '${T}', 'wm_j', 'BOOKING', 'ATHLETE_PAYABLE', 'ATHLETE', 'wm_a1', '${T}', 0, 10000, 'PENDING'),
        ('wm_le2', '${T}', 'wm_j', 'BOOKING', 'PROPERTY_PAYABLE', 'PROPERTY', 'wm_prop', '${T}', 0, 20000, 'AVAILABLE');
      INSERT INTO "PaymentAttempt" (id, "tenantId", "orderId", "sponsorId", "amountCents", provider, state, "updatedAt") VALUES
        ('wm_pa1', '${T}', 'wm_mo', 'wm_sp', 50000, 'stripe', 'SUCCEEDED', now()), ('wm_pa2', '${T}', 'wm_mo', 'wm_sp', 1000, 'stripe', 'PENDING', now());
      INSERT INTO "Payout" (id, "tenantId", "payeeType", "payeeId", "payeeTenantId", "amountCents", state, "updatedAt")
        VALUES ('wm_po', '${T}', 'PROPERTY', 'wm_prop', '${T}', 20000, 'REQUESTED', now());
      INSERT INTO "AuditLog" (id, "tenantId", action, entity, "entityId", at) VALUES
        ('wm_au1', '${T}', 'deliverable.requestRevision', 'Deliverable', 'wm_d1', '2026-09-17 09:00'),
        ('wm_au2', '${T}', 'deliverable.verify', 'Deliverable', 'wm_d1', '2026-09-19 09:00'),
        ('wm_au3', '${T}', 'order.cancel', 'CampaignOrder', 'wm_o3', '2026-09-10 09:00'),
        ('wm_au4', '${T}', 'campaign.launch', 'Campaign', 'wm_c1', '2026-09-03 09:00');
    `);
    const out = await ingestWarehouse({ product, warehouse });
    expect(out.status).toBe("ok");
  });

  afterAll(async () => {
    await clean();
    await product.end();
    await warehouse.end();
  });

  it("builds the model after the copy, and logs what it built, how long it took, and the double-check", async () => {
    const [run] = await w(`SELECT status, built, build_ms, reconcile FROM raw._ingest_run ORDER BY id DESC LIMIT 1`);
    expect(run!.status).toBe("ok");
    expect(run!.built.fact_campaign_daily).toBeGreaterThan(0);
    expect(run!.build_ms).toBeGreaterThanOrEqual(0);
    expect(run!.reconcile).toMatchObject({ ok: true, failed: [] });
  });

  it("the hourly double-check compares like with like: a change made during the run is not a false alarm", async () => {
    const out = await ingestWarehouse({
      product, warehouse,
      /* After the copy, before the build and the check: someone books more. */
      onCopied: async () => { await product.query(`UPDATE "CampaignOrder" SET "sellPrice" = 22000 WHERE id = 'wm_o1'`); },
    });
    try {
      expect(out.status).toBe("ok");
      if (out.status === "ok") expect(out.reconciled).toEqual({ ok: true, failed: [] });
      /* Checked against the app as it is NOW, the warehouse is behind — as expected until the next run. */
      expect((await reconcileWarehouse({ product, warehouse, tenantId: T })).ok).toBe(false);
    } finally {
      await product.query(`UPDATE "CampaignOrder" SET "sellPrice" = 20000 WHERE id = 'wm_o1'`);
      await ingestWarehouse({ product, warehouse });
    }
  });

  it("the daily balance record is a diary: past days are never rewritten", async () => {
    await w(`INSERT INTO dw.snap_ledger_daily VALUES (20261011, $1, $1, 'ATHLETE', 'wm_marker', 'ATHLETE_PAYABLE', 'PENDING', 1, 0, 1, -1)`, [T]);
    expect((await ingestWarehouse({ product, warehouse })).status).toBe("ok");
    expect(await w(`SELECT party_id FROM dw.snap_ledger_daily WHERE date_key = 20261011 AND tenant_id = $1`, [T])).toEqual([{ party_id: "wm_marker" }]);
    await w(`DELETE FROM dw.snap_ledger_daily WHERE party_id = 'wm_marker'`);
  });

  it("dimensions: names, current values, campaign targets, channel and market rules", async () => {
    const [c] = await w(`SELECT name, sponsor_id, budget_cents, brief_categories, brief_state_codes, launched_on::text FROM dw.dim_campaign WHERE campaign_id = 'wm_c1'`);
    expect(c).toMatchObject({ name: "Fall tacos", sponsor_id: "wm_sp", budget_cents: "500000", brief_categories: ["FOOD"], brief_state_codes: ["MD", "TX"], launched_on: "2026-09-03" });
    const [a2] = await w(`SELECT display_name, tier, is_minor, city, state_code FROM dw.dim_athlete WHERE athlete_id = 'wm_a2'`);
    expect(a2).toMatchObject({ display_name: "Jo", tier: "EMERGING", is_minor: true, city: " austin ", state_code: "TX" });
    expect((await w(`SELECT region FROM dw.dim_market WHERE state_code = 'TX' AND city = 'Austin'`))[0]).toMatchObject({ region: "SOUTH" });
    expect((await w(`SELECT list_low_cents, list_high_cents, format FROM dw.dim_inventory WHERE inventory_kind = 'NIL_JOB' AND source_id = 'wm_job'`))[0])
      .toMatchObject({ list_low_cents: "7500", list_high_cents: "12500", format: "wm_job" });
    /* An order's job that the catalogue doesn't have still gets its own line. */
    expect(await w(`SELECT count(*)::int n FROM dw.dim_inventory WHERE inventory_kind = 'NIL_JOB' AND source_id = 'SX-05'`)).toEqual([{ n: 1 }]);
    expect(await w(`SELECT count(*)::int n FROM dw.dim_date`)).toEqual([{ n: expect.any(Number) }]);
  });

  it("delivery, views and corrections land on their own days and channels", async () => {
    expect(await fact("2026-09-20", "wm_a1", "SOCIAL_INSTAGRAM", "wm_job")).toMatchObject({ deliverables_due: 1, views_verified_manual: "400", engagements_verified_manual: "20" });
    expect(await fact("2026-09-18", "wm_a1", "SOCIAL_INSTAGRAM", "wm_job")).toMatchObject({ deliverables_published: 1 });
    expect(await fact("2026-09-19", "wm_a1", "SOCIAL_INSTAGRAM", "wm_job")).toMatchObject({ deliverables_verified: 1, views_verified_api: "1000", views_self_reported: "1500", engagements_self_reported: "90" });
    expect(await fact("2026-09-17", "wm_a1", "SOCIAL_INSTAGRAM", "wm_job")).toMatchObject({ revisions_requested: 1 });
    expect(await fact("2026-09-25", "wm_a1", "IN_PERSON", "SX-05")).toMatchObject({ deliverables_due: 1 });
    expect(await fact("2026-09-22", "wm_a2", "UNPUBLISHED", "wm_job")).toMatchObject({ deliverables_due: 1 });
  });

  it("the fan funnel: per day, the job only when the athlete holds one, the venue's market before the athlete's", async () => {
    const venue = await fact("2026-09-21", "wm_a1", "REWARD_QR", null);
    expect(venue).toMatchObject({ qr_scans: 2, qr_landings: 1, qr_claims: 1 });
    const [m] = await w(`SELECT state_code, city FROM dw.dim_market WHERE market_key = $1`, [venue.market_key]);
    expect(m).toEqual({ state_code: "VA", city: "Arlington" });
    expect(await fact("2026-09-22", "wm_a1", "REWARD_QR", null)).toMatchObject({ qr_redemptions: 1 });
    const a2 = await fact("2026-09-21", "wm_a2", "REWARD_QR", "wm_job");
    expect(a2).toMatchObject({ qr_scans: 1 });
    expect((await w(`SELECT state_code FROM dw.dim_market WHERE market_key = $1`, [a2.market_key]))[0]).toEqual({ state_code: "TX" });
    expect(await fact("2026-09-23", null, "REWARD_QR", null)).toMatchObject({ qr_scans: 1, market_key: "0" });
    expect(await fact("2026-09-18", "wm_a1", "TRACKING_LINK", "wm_job")).toMatchObject({ link_clicks: 2 });
  });

  it("NEXT editions: the slot's sale, print scans and digital engagement on that campaign", async () => {
    expect(await fact("2026-09-08", null, "EDITION_PRINT", "wm_s1")).toMatchObject({ ad_slot_sold_cents: "30000" });
    expect(await fact("2026-09-24", null, "EDITION_PRINT", "wm_s1")).toMatchObject({ edition_print_scans: 1 });
    expect(await fact("2026-09-24", null, "EDITION_DIGITAL", "wm_s1")).toMatchObject({ edition_digital_engagements: 1 });
    expect(await fact("2026-09-25", null, "EDITION_DIGITAL", "wm_s1")).toMatchObject({ edition_digital_engagements: 1 });
  });

  it("money on its own day: bookings, a cancellation, earnings, invoicing", async () => {
    expect(await fact("2026-09-05", "wm_a1", "CAMPAIGN", "wm_job")).toMatchObject({ booked_sell_cents: "20000", booked_compensation_cents: "10000" });
    expect(await fact("2026-09-05", "wm_a1", "CAMPAIGN", "SX-05")).toMatchObject({ booked_sell_cents: "40000" });
    expect(await fact("2026-09-06", "wm_a2", "CAMPAIGN", "wm_job")).toMatchObject({ booked_sell_cents: "15000", booked_compensation_cents: "8000" });
    expect(await fact("2026-09-10", "wm_a2", "CAMPAIGN", "wm_job")).toMatchObject({ cancelled_sell_cents: "15000" });
    expect(await fact("2026-10-01", "wm_a1", "CAMPAIGN", "wm_job")).toMatchObject({ earnings_paid_cents: "9500" });
    expect(await fact("2026-09-02", null, "CAMPAIGN", null)).toMatchObject({ invoiced_cents: "75000" });
    expect(await fact("2026-09-15", null, "CAMPAIGN", null)).toMatchObject({ invoice_paid_cents: "75000" });
  });

  it("each row carries the sponsor and the athlete's property", async () => {
    const row = await fact("2026-09-05", "wm_a1", "CAMPAIGN", "wm_job");
    expect((await w(`SELECT sponsor_id FROM dw.dim_sponsor WHERE sponsor_key = $1`, [row.sponsor_key]))[0]).toEqual({ sponsor_id: "wm_sp" });
    expect((await w(`SELECT property_id FROM dw.dim_property WHERE property_key = $1`, [row.property_key]))[0]).toEqual({ property_id: "wm_prop" });
  });

  it("the semantic layer computes ratios over sums", async () => {
    const [s] = await w(`SELECT views_verified, claim_rate, redemption_rate, booked_net_cents FROM sem.campaign_summary WHERE campaign_id = 'wm_c1'`);
    expect(s).toMatchObject({ views_verified: "1400", booked_net_cents: "60000" });
    expect(Number(s!.claim_rate)).toBe(1);
    expect(Number(s!.redemption_rate)).toBe(1);
  });

  it("an odd date in a record (far outside 2020–2035) is added to the date table instead of stopping the build", async () => {
    /* A view count entered for a day in 1999 — a table read in full every hour. */
    await seed(`INSERT INTO "MetricDaily" (id, "tenantId", "deliverableId", day, views, engagements, source) VALUES ('wm_m_odd', '${T}', 'wm_d1', '1999-06-01', 5, 0, 'VERIFIED_API')`);
    try {
      expect((await ingestWarehouse({ product, warehouse })).status).toBe("ok");
      expect(await fact("1999-06-01", "wm_a1", "SOCIAL_INSTAGRAM", "wm_job")).toMatchObject({ views_verified_api: "5" });
    } finally {
      await seed(`DELETE FROM "MetricDaily" WHERE id = 'wm_m_odd'`);
      await ingestWarehouse({ product, warehouse });
    }
  });

  it("the marketplace line, with its milestones, split and refund", async () => {
    const [l] = await w(`SELECT net_cents, refunded_cents, placed_date_key, contracted_date_key, paid_date_key, fulfilled_date_key, order_state FROM dw.fact_marketplace_order_line WHERE line_id = 'wm_ml'`);
    expect(l).toMatchObject({ net_cents: "45000", refunded_cents: "5000", placed_date_key: 20261001, contracted_date_key: 20261002, paid_date_key: 20261003, fulfilled_date_key: null, order_state: "PAID" });
  });

  it("money snapshots start the day copying began, from that day's state", async () => {
    const ledger = await w(`SELECT d.date::text, s.account, s.status, s.balance_cents FROM dw.snap_ledger_daily s JOIN dw.dim_date d USING (date_key) WHERE s.tenant_id = $1 ORDER BY 1, 2`, [T]);
    expect(ledger).toEqual([
      { date: today, account: "ATHLETE_PAYABLE", status: "PENDING", balance_cents: "-10000" },
      { date: today, account: "PROPERTY_PAYABLE", status: "AVAILABLE", balance_cents: "-20000" },
    ]);
    const open = await w(`SELECT subject_type, subject_id, state, is_closed FROM dw.snap_payment_status_daily WHERE tenant_id = $1 ORDER BY 2`, [T]);
    expect(open).toEqual([
      { subject_type: "PAYMENT_ATTEMPT", subject_id: "wm_pa2", state: "PENDING", is_closed: false },
      { subject_type: "PAYOUT", subject_id: "wm_po", state: "REQUESTED", is_closed: false },
    ]);
  });

  it("reconciles exactly with the app, check by check", async () => {
    const out = await reconcileWarehouse({ product, warehouse, tenantId: T });
    const failed = out.checks.filter((c) => !c.ok);
    expect(failed).toEqual([]);
    expect(out.checks.map((c) => c.check)).toEqual(expect.arrayContaining([
      "booked", "compensation", "earnings_paid", "invoiced", "invoice_paid", "marketplace_net", "ledger", "payments_open", "fan_funnel", "clicks", "views",
    ]));
    expect(out.ok).toBe(true);
  });

  it("a rebuild on unchanged data changes nothing", async () => {
    const hash = async () => (await w(`SELECT md5(string_agg(f::text, '|' ORDER BY f::text)) h FROM (SELECT date_key, campaign_key, athlete_key, channel_key, inventory_key, market_key, sponsor_key, property_key,
      booked_sell_cents, views_verified_api, qr_scans FROM dw.fact_campaign_daily WHERE tenant_id = $1) f`, [T]))[0]!.h;
    const before = await hash();
    expect((await ingestWarehouse({ product, warehouse })).status).toBe("ok");
    expect(await hash()).toBe(before);
  });

  it("history: an athlete's new tier is a new version; earlier facts keep the old one", async () => {
    /* A day passes: the copy taken so far is dated yesterday. Two changes on
       one day collapse to that day's last state, by design. */
    await warehouse.query(`UPDATE raw."Athlete" SET _ingested_at = _ingested_at - interval '1 day' WHERE id = 'wm_a1'`);
    await product.query(`UPDATE "Athlete" SET tier = 'PREMIUM' WHERE id = 'wm_a1'`);
    await product.query(`UPDATE "LedgerEntry" SET status = 'AVAILABLE' WHERE id = 'wm_le1'`);
    expect((await ingestWarehouse({ product, warehouse })).status).toBe("ok");
    /* Ordered by the date itself, not its text: "-infinity" sorts differently as text under different collations. */
    const versions = await w(`SELECT tier, a.valid_from::text AS valid_from, valid_to::text, is_current FROM dw.dim_athlete a WHERE athlete_id = 'wm_a1' ORDER BY a.valid_from`);
    expect(versions.map((v) => [v.tier, v.is_current])).toEqual([["CREATOR", false], ["PREMIUM", true]]);
    expect(versions[1]!.valid_from).toBe(today);
    const old = await fact("2026-09-05", "wm_a1", "CAMPAIGN", "wm_job");
    expect((await w(`SELECT tier FROM dw.dim_athlete WHERE athlete_key = $1`, [old.athlete_key]))[0]).toEqual({ tier: "CREATOR" });
    expect((await w(`SELECT status FROM dw.snap_ledger_daily s JOIN dw.dim_date d USING (date_key) WHERE s.tenant_id = $1 AND s.account = 'ATHLETE_PAYABLE' AND d.date = $2`, [T, today])))
      .toEqual([{ status: "AVAILABLE" }]);
  });

  it("reconciliation catches drift between the app and the warehouse", async () => {
    await product.query(`UPDATE "CampaignOrder" SET "sellPrice" = 21000 WHERE id = 'wm_o1'`);
    const out = await reconcileWarehouse({ product, warehouse, tenantId: T });
    expect(out.ok).toBe(false);
    expect(out.checks.filter((c) => !c.ok)).toEqual([expect.objectContaining({ check: "booked", key: "wm_c1", warehouse: 75000, product: 76000 })]);
    await product.query(`UPDATE "CampaignOrder" SET "sellPrice" = 20000 WHERE id = 'wm_o1'`);
  });
});
