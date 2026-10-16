import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SOURCES, TRANSIENT_COLUMNS } from "../worker/warehouse/sources.mts";

/* --------------------------------------------------------------------------
   3S1-DATA-01 — warehouse ingestion: product data copied into the
   warehouse's `raw` layer on a schedule, safe to re-run
   (documentation/SponsorX-Warehouse-Schema.md §2).

   Two ways a table is copied:
     - APPEND (event tables only ever added to): rows since the watermark,
       re-reading a 48-hour overlap so late writes and late updates (a click's
       city) are caught; one raw row per source row, updated in place.
     - VERSIONED (everything else, most with no updatedAt): read in full; a
       new raw version only when the row's content hash differs from the
       latest one; a row gone from the product gets a deleted version.
   Columns are an ALLOW-LIST (user, 2026-10-12): a column added to the product
   is not copied until someone lists it, so personal data cannot drift in.
   -------------------------------------------------------------------------- */

/** Columns that must never reach the warehouse (design §3: no personal data). */
const NEVER = [
  "email", "legalName", "phone", "birthDate", "fanEmail", "token", "qrKey", "billingName", "billingEmail",
  "billingReference", "paymentReference", "reference", "achievements", "reviewerNotes", "restrictionNotes",
  "publishedUrl", "caption", "consentVersion", "consentPurpose", "sponsorContactVersion", "before", "after",
  "signupRejectNote", "decisionNote", "failureReason", "providerRef", "destinationUrl", "notes",
];

describe("3S1-DATA-01 · the allow-list", () => {
  it("copies no personal or secret column from any table", () => {
    for (const s of SOURCES) {
      for (const c of s.columns) expect(NEVER, `${s.table}.${c}`).not.toContain(c);
    }
  });

  it("every table carries its id and tenant, and names its mode", () => {
    for (const s of SOURCES) {
      expect(s.columns, s.table).toEqual(expect.arrayContaining(["id", "tenantId"]));
      expect(["APPEND", "VERSIONED"], s.table).toContain(s.mode);
      if (s.mode === "APPEND") expect(s.columns, s.table).toContain(s.timeColumn);
    }
  });

  it("covers every source the signed design reads", () => {
    const tables = SOURCES.map((s) => s.table);
    for (const t of [
      "Sponsor", "Property", "Athlete", "Campaign", "CampaignBrief", "CampaignOrder", "NilJob", "Deliverable",
      "TrackingLink", "Reward", "RewardToken", "RewardEvent", "LinkEvent", "EditionEvent", "Edition", "AdSlot",
      "MetricDaily", "AuditLog", "Earning", "CampaignInvoice", "MarketplaceOrder", "MarketplaceOrderLine",
      "OrderLineFinancials", "InventoryItem", "LedgerEntry", "PaymentAttempt", "Payout", "RefundDue",
    ]) expect(tables, t).toContain(t);
  });

  it("an athlete's birth date is read only to work out is_minor, never stored", () => {
    expect(TRANSIENT_COLUMNS.Athlete).toEqual(["birthDate", "majorityAge"]);
    expect(SOURCES.find((s) => s.table === "Athlete")!.columns).not.toContain("birthDate");
  });

  it("the worker runs it hourly, only where a warehouse is configured", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toContain("process.env.WAREHOUSE_DATABASE_URL");
    expect(worker).toMatch(/warehouseTimer = setInterval\(/);
    expect(worker).toContain("WAREHOUSE_INGEST_INTERVAL_MS = 60 * 60 * 1000");
  });
});

/* ── against two real databases ─────────────────────────────────────────── */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

/** The warehouse test database: TEST_WAREHOUSE_DATABASE_URL, or `<test db>_warehouse` beside it, created if missing. */
async function warehouseUrl(): Promise<string> {
  if (process.env.TEST_WAREHOUSE_DATABASE_URL) return process.env.TEST_WAREHOUSE_DATABASE_URL;
  const url = new URL(seededDb.TEST_DATABASE_URL);
  const name = `${url.pathname.slice(1)}_warehouse`;
  const admin = new pg.Client({ connectionString: seededDb.TEST_DATABASE_URL });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(!hasDatabase)("3S1-DATA-01 · ingestion", { timeout: 120_000 }, async () => {
  const { ingestWarehouse, INGEST_LOCK_KEY } = await import("../worker/warehouse/ingest.mts");
  const product = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, options: "-c TimeZone=UTC" });
  const warehouse = new pg.Pool({ connectionString: await warehouseUrl(), options: "-c TimeZone=UTC" });
  const T = "wi_tenant";
  const q = async (sql: string, params: unknown[] = []) => (await product.query(sql, params)).rows;
  const w = async (sql: string, params: unknown[] = []) => (await warehouse.query(sql, params)).rows;
  const count = async (table: string) => Number((await w(`SELECT count(*)::int AS n FROM raw."${table}" WHERE tenant_id = $1`, [T]))[0]!.n);

  async function cleanProduct() {
    for (const t of ["LinkEvent", "TrackingLink", "RewardEvent", "RewardToken", "Reward", "MetricDaily", "Deliverable", "LedgerEntry",
      "CampaignOrder", "Campaign", "NilJob", "Athlete", "Sponsor"]) {
      await product.query(`DELETE FROM "${t}" WHERE "tenantId" = $1`, [T]);
    }
    await product.query(`DELETE FROM "AuditLog" WHERE "tenantId" = $1`, [T]);
    await product.query(`DELETE FROM "Tenant" WHERE id = $1`, [T]);
  }

  beforeAll(async () => {
    await cleanProduct();
    await warehouse.query("DROP SCHEMA IF EXISTS raw CASCADE");
    await warehouse.query("DROP TABLE IF EXISTS public.warehouse_migrations");
    await q(`INSERT INTO "Tenant" (id, name) VALUES ($1, 'Warehouse ingest')`, [T]);
    await q(`INSERT INTO "Sponsor" (id, "tenantId", name, ownership, "updatedAt") VALUES ('wi_sp', $1, 'Rosa''s Tacos', 'BTG', now())`, [T]);
    await q(`INSERT INTO "Athlete" (id, "tenantId", slug, "legalName", "displayName", email, "birthDate", sport, "stateCode", city, "ageBand", state, "countryCode", "majorityAge")
             VALUES ('wi_ath', $1, 'wi-ath', 'Jo Secret Reed', 'Jo', 'jo@private.invalid', '2010-05-01', 'Soccer', 'MD', 'Baltimore', '16_17', 'ACTIVE', 'US', 18)`, [T]);
    await q(`INSERT INTO "NilJob" (id, "tenantId", name, "baseLow", "baseHigh", "sellLow", "sellHigh", "sellFloorEmerging", "sellFloorCreator", "sellFloorPremium")
             VALUES ('wi_job', $1, 'Story Drop', 25, 50, 75, 125, 60, 75, 90), ('wi_job_spare', $1, 'Spare', 1, 2, 3, 4, 1, 1, 1)`, [T]);
    await q(`INSERT INTO "Campaign" (id, "tenantId", "sponsorId", name, budget, "startDate", "endDate", state, "updatedAt")
             VALUES ('wi_cmp', $1, 'wi_sp', 'Fall tacos', 100000, '2026-09-01', '2026-12-31', 'ACTIVE', now())`, [T]);
    await q(`INSERT INTO "CampaignOrder" (id, "tenantId", "campaignId", "athleteId", "jobId", compensation, "sellPrice", "usageRights", "dueDate", state, "acceptedAt")
             VALUES ('wi_ord', $1, 'wi_cmp', 'wi_ath', 'wi_job', 10000, 20000, '90 days', '2026-11-01', 'ACTIVE', '2026-09-05')`, [T]);
    await q(`INSERT INTO "Deliverable" (id, "tenantId", "orderId", title, "dueDate", state, "publishedUrl", "publishedAt", platform)
             VALUES ('wi_dlv', $1, 'wi_ord', 'Reel', '2026-10-01', 'PUBLISHED', 'https://instagram.com/p/private', '2026-09-20', 'INSTAGRAM')`, [T]);
    await q(`INSERT INTO "MetricDaily" (id, "tenantId", "deliverableId", day, views, engagements, source) VALUES ('wi_md', $1, 'wi_dlv', '2026-09-21', 100, 5, 'VERIFIED_MANUAL')`, [T]);
    await q(`INSERT INTO "Reward" (id, "tenantId", "campaignId", "offerText", terms, "expiresAt", state) VALUES ('wi_rw', $1, 'wi_cmp', 'Free taco', 't', '2026-12-31', 'ACTIVE')`, [T]);
    await q(`INSERT INTO "RewardToken" (id, "tenantId", "rewardId", "athleteId", token) VALUES ('wi_tok', $1, 'wi_rw', 'wi_ath', 'wi-secret-token-value')`, [T]);
    await q(`INSERT INTO "RewardEvent" (id, "tenantId", "tokenId", type, at, "fanEmail") VALUES ('wi_ev1', $1, 'wi_tok', 'SCAN', now() - interval '2 hours', NULL),
             ('wi_ev2', $1, 'wi_tok', 'CLAIM', now() - interval '1 hour', 'fan@private.invalid')`, [T]);
    await q(`INSERT INTO "TrackingLink" (id, "tenantId", code, "deliverableId", "destinationUrl") VALUES ('wi_lnk', $1, 'wi-code', 'wi_dlv', 'https://rosas.invalid')`, [T]);
    await q(`INSERT INTO "LinkEvent" (id, "tenantId", "linkId", at) VALUES ('wi_click', $1, 'wi_lnk', now() - interval '30 minutes')`, [T]);
    await q(`INSERT INTO "LedgerEntry" (id, "tenantId", "journalId", "entryType", account, "partyType", "partyId", "partyTenantId", "debitCents", "creditCents", status)
             VALUES ('wi_led', $1, 'wi_j', 'BOOKING', 'ATHLETE_PAYABLE', 'ATHLETE', 'wi_ath', $1, 0, 10000, 'PENDING')`, [T]);
    await q(`INSERT INTO "AuditLog" (id, "tenantId", action, entity, "entityId", after) VALUES
             ('wi_a1', $1, 'deliverable.verify', 'Deliverable', 'wi_dlv', '{"note":"private"}'),
             ('wi_a2', $1, 'user.provision', 'User', 'u1', '{"email":"x@private.invalid"}')`, [T]);
  });

  afterAll(async () => {
    await cleanProduct();
    await product.end();
    await warehouse.end();
  });

  it("a first run copies every listed table into raw, and logs the run", async () => {
    const out = await ingestWarehouse({ product, warehouse });
    expect(out.status).toBe("ok");
    expect(await count("Athlete")).toBe(1);
    expect(await count("RewardEvent")).toBe(2);
    expect(await count("LinkEvent")).toBe(1);
    expect(await count("LedgerEntry")).toBe(1);
    expect(await count("NilJob")).toBe(2);
    const runs = await w(`SELECT status, rows FROM raw._ingest_run ORDER BY id DESC LIMIT 1`);
    expect(runs[0]).toMatchObject({ status: "ok" });
    expect(runs[0]!.rows.Athlete).toBeDefined();
  });

  it("copies no personal data: the minor flag, never the birth date, name, email, token or audit detail", async () => {
    const [ath] = await w(`SELECT _row FROM raw."Athlete" WHERE id = 'wi_ath'`);
    expect(ath!._row).toMatchObject({ id: "wi_ath", displayName: "Jo", stateCode: "MD", is_minor: true });
    const everything = JSON.stringify(await w(`
      SELECT _row FROM raw."Athlete" UNION ALL SELECT _row FROM raw."RewardToken" UNION ALL SELECT _row FROM raw."RewardEvent"
      UNION ALL SELECT _row FROM raw."Deliverable" UNION ALL SELECT _row FROM raw."AuditLog"`));
    for (const secret of ["Jo Secret Reed", "jo@private.invalid", "2010-05-01", "wi-secret-token-value", "fan@private.invalid", "instagram.com/p/private", "private"]) {
      expect(everything, secret).not.toContain(secret);
    }
  });

  it("copies only the audit actions the design reads", async () => {
    expect((await w(`SELECT id FROM raw."AuditLog" WHERE tenant_id = $1`, [T])).map((r) => r.id)).toEqual(["wi_a1"]);
  });

  it("a re-run on unchanged data adds nothing", async () => {
    /* Scoped to this test's tenant: other test files write to the same
       product database while this runs. */
    const tables = SOURCES.map((s) => s.table);
    const snapshot = async () => Promise.all(tables.map((t) => count(t)));
    const before = await snapshot();
    expect((await ingestWarehouse({ product, warehouse })).status).toBe("ok");
    expect(await snapshot()).toEqual(before);
  });

  it("a row changed in place gets exactly one new version; the old one is kept", async () => {
    await q(`UPDATE "LedgerEntry" SET status = 'AVAILABLE' WHERE id = 'wi_led'`);
    await q(`UPDATE "MetricDaily" SET views = 120 WHERE id = 'wi_md'`);
    await ingestWarehouse({ product, warehouse });
    await ingestWarehouse({ product, warehouse });
    const versions = await w(`SELECT _row->>'status' AS status FROM raw."LedgerEntry" WHERE id = 'wi_led' ORDER BY _version_id`);
    expect(versions.map((r) => r.status)).toEqual(["PENDING", "AVAILABLE"]);
    expect((await w(`SELECT (_row->>'views')::int v FROM raw."MetricDaily" WHERE id = 'wi_md' ORDER BY _version_id`)).map((r) => r.v)).toEqual([100, 120]);
  });

  it("a row gone from the product gets a deleted version, once", async () => {
    await q(`DELETE FROM "NilJob" WHERE id = 'wi_job_spare'`);
    await ingestWarehouse({ product, warehouse });
    await ingestWarehouse({ product, warehouse });
    expect((await w(`SELECT _deleted FROM raw."NilJob" WHERE id = 'wi_job_spare' ORDER BY _version_id`)).map((r) => r._deleted)).toEqual([false, true]);
  });

  it("an event updated late (a click's city) is updated in raw, not duplicated", async () => {
    await q(`UPDATE "LinkEvent" SET city = 'Baltimore', region = 'MD' WHERE id = 'wi_click'`);
    /* The watermark is the newest click in the whole product database, and other test files running
       alongside insert clicks dated weeks ahead (anomalies, attribution) — past this one by more than
       the overlap, so it would not be re-read. Pin the watermark to this click: the question here is
       whether a click updated inside the overlap is re-read, not what else the database holds. */
    await w(`UPDATE raw._watermark SET last_at = (SELECT _at FROM raw."LinkEvent" WHERE id = 'wi_click') WHERE table_name = 'LinkEvent'`);
    await ingestWarehouse({ product, warehouse });
    const rows = await w(`SELECT _row->>'city' AS city FROM raw."LinkEvent" WHERE id = 'wi_click'`);
    expect(rows).toEqual([{ city: "Baltimore" }]);
  });

  it("while a run holds the lock, another steps aside instead of overlapping", async () => {
    const holder = await warehouse.connect();
    try {
      await holder.query("SELECT pg_advisory_lock($1)", [INGEST_LOCK_KEY]);
      expect(await ingestWarehouse({ product, warehouse })).toEqual({ status: "skipped", reason: "another ingestion run is in progress" });
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK_KEY]);
      holder.release();
    }
    expect((await ingestWarehouse({ product, warehouse })).status).toBe("ok");
  });
});
