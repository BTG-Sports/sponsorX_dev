/**
 * Seeding and reading Postgres for the Phase 1 loop specs — P3/P4/P5/P7-QA-01.
 *
 * Same habit as fan-db.ts: raw `pg` against the database the API uses, every
 * row a spec owns carries an `e2e_<spec>_` prefix, and each spec removes what
 * it made — BEFORE it seeds as well as after, so a run killed half way never
 * leaves state the next run trips over (the 2026-09-28 walks' big lesson:
 * they failed on data their own earlier runs had consumed).
 *
 * THE TENANT is the one the public intake writes to (PUBLIC_INTAKE_TENANT_ID,
 * default `seed_tenant_btg`). Phase 1 is a single managed marketplace, so BTG
 * staff, sponsors and athletes share it — and P3's applicant arrives there
 * whether the spec likes it or not. CI's database is migrated and otherwise
 * empty, so the base (tenant, the SX-01…07 catalogue, the sponsor packages,
 * the Campaign Order v1 agreement) is upserted by `ensureBase()`; locally it
 * already exists and the upserts change nothing. Shared base rows are never
 * deleted.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";

import { hashAgreementBody } from "../../backend/src/domain/agreement-hash";
import { NIL_JOBS } from "../../backend/src/domain/nil-jobs";
import { SPONSOR_PACKAGES } from "../../backend/src/domain/sponsor-packages";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export const TENANT = process.env.PUBLIC_INTAKE_TENANT_ID ?? "seed_tenant_btg";

export function pool(): pg.Pool {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
}

/** One statement on a short-lived pool — specs are not hot paths. */
export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = pool();
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.end();
  }
}

/** Several statements in one transaction. */
export async function tx(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const db = pool();
  const c = await db.connect();
  try {
    await c.query("begin");
    await fn(c);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
    await db.end();
  }
}

const AGREEMENT_FILE = path.resolve(__dirname, "../../backend/agreements/CAMPAIGN_ORDER.v1.txt");

/**
 * The tenant and its reference data — what `seed-catalogue.mts` and
 * `npm run agreement:register` put in every environment. Idempotent.
 */
export async function ensureBase(): Promise<void> {
  await tx(async (c) => {
    await c.query(`insert into "Tenant"(id, name) values ($1, 'BTG Sports Group') on conflict (id) do nothing`, [TENANT]);
    for (const job of NIL_JOBS) {
      await c.query(
        `insert into "NilJob"(id, "tenantId", name, "baseLow", "baseHigh", "sellLow", "sellHigh",
                              "sellFloorEmerging", "sellFloorCreator", "sellFloorPremium")
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (id) do nothing`,
        [job.id, TENANT, job.name, job.baseLow, job.baseHigh, job.sellLow, job.sellHigh,
         job.sellFloorEmerging, job.sellFloorCreator, job.sellFloorPremium],
      );
    }
    for (const pkg of SPONSOR_PACKAGES) {
      await c.query(
        `insert into "SponsorPackage"(id, "tenantId", code, name, "priceLow", "priceHigh",
                                      "athleteCountMin", "athleteCountMax", "lineItems",
                                      includes, exclusivity, "durationWeeks", active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,true)
         on conflict ("tenantId", code) do nothing`,
        [`pkg_${TENANT}_${pkg.code.toLowerCase()}`, TENANT, pkg.code, pkg.name,
         pkg.priceLow, pkg.priceHigh, pkg.athleteCountMin, pkg.athleteCountMax,
         JSON.stringify(pkg.lineItems), JSON.stringify(pkg.includes),
         pkg.exclusivity, pkg.durationWeeks],
      );
    }
    const bodyHash = hashAgreementBody(readFileSync(AGREEMENT_FILE, "utf8"));
    await c.query(
      `insert into "Agreement"(id, "tenantId", kind, version, "bodyHash", "effectiveAt")
       values ($1, $2, 'CAMPAIGN_ORDER', 1, $3, now() - interval '1 day')
       on conflict ("tenantId", kind, version) do nothing`,
      [`e2e_agreement_co_v1_${TENANT}`, TENANT, bodyHash],
    );
    const [row] = (await c.query<{ bodyHash: string }>(
      `select "bodyHash" from "Agreement" where "tenantId" = $1 and kind = 'CAMPAIGN_ORDER' and version = 1`,
      [TENANT],
    )).rows;
    if (row?.bodyHash !== bodyHash) {
      /* The page refuses to show an order whose text no longer hashes to the
         issued row — correctly. Say why instead of failing three steps later. */
      throw new Error(
        `CAMPAIGN_ORDER v1 in ${TENANT} is registered with ${row?.bodyHash}, but the file hashes to ${bodyHash}. ` +
          `Something rewrote the issued hash (a crashed walk?) — restore it before running the loop specs.`,
      );
    }
  });
}

/** Rate-limit counters the specs legitimately exceed (every public intake in
 *  a run comes from the web server's one address). Only `ratelimit:<prefix>*`
 *  keys, and only when Redis is there — without it the limiter fails open. */
export async function clearRateLimit(prefix: string): Promise<void> {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const { createRequire } = await import("node:module");
  /* ioredis is a backend dependency, not a root one — borrow it rather than
     add a second copy for three commands. */
  const require = createRequire(path.resolve(__dirname, "../../backend/package.json"));
  type RedisClient = {
    connect(): Promise<void>;
    keys(pattern: string): Promise<string[]>;
    del(...keys: string[]): Promise<number>;
    disconnect(): void;
  };
  const Redis = require("ioredis") as new (url: string, opts: Record<string, unknown>) => RedisClient;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2_000 });
  try {
    await redis.connect();
    const keys = await redis.keys(`ratelimit:${prefix}*`);
    if (keys.length) await redis.del(...keys);
  } catch {
    /* No Redis → the limiter fails open, nothing to clear. */
  } finally {
    redis.disconnect();
  }
}

export type Owned = {
  athleteIds?: string[];
  sponsorIds?: string[];
  briefIds?: string[];
  campaignIds?: string[];
  guardianIds?: string[];
};

/**
 * Delete everything hanging off a spec's own athletes / sponsors / briefs /
 * campaigns, leaves first, in one transaction. The spec passes the roots; the
 * rows the product created on the way (invites, orders, deliverables,
 * earnings, acceptances, audit and outbox rows) are found from them, so a run
 * that died half way is cleaned up just the same.
 */
export async function purge(owned: Owned): Promise<void> {
  const athletes = owned.athleteIds ?? [];
  const sponsors = owned.sponsorIds ?? [];
  await tx(async (c) => {
    const ids = async (sql: string, params: unknown[]) =>
      (await c.query<{ id: string }>(sql, params)).rows.map((r) => r.id);

    const briefs = [
      ...(owned.briefIds ?? []),
      ...(await ids(`select id from "CampaignBrief" where "sponsorId" = any($1)`, [sponsors])),
    ];
    const campaigns = [
      ...(owned.campaignIds ?? []),
      ...(await ids(
        `select id from "Campaign" where "sponsorId" = any($1) or "briefId" = any($2)`,
        [sponsors, briefs],
      )),
    ];
    const orders = await ids(
      `select id from "CampaignOrder" where "campaignId" = any($1) or "athleteId" = any($2)`,
      [campaigns, athletes],
    );
    /* P4-BE-12 — a campaign staffing itself sends formal offers; an accepted
       one names its order, so offers go before orders. */
    const offers = await ids(
      `select id from "Offer" where "campaignId" = any($1) or "athleteId" = any($2)`,
      [campaigns, athletes],
    );
    const acceptances = await ids(
      `select "acceptanceId" as id from "CampaignOrder" where id = any($1) and "acceptanceId" is not null
       union select id from "AgreementAcceptance" where "athleteId" = any($2)`,
      [orders, athletes],
    );
    const deliverables = await ids(`select id from "Deliverable" where "orderId" = any($1)`, [orders]);
    const links = await ids(`select id from "TrackingLink" where "deliverableId" = any($1)`, [deliverables]);
    const invites = await ids(
      `select id from "CampaignInvite" where "campaignId" = any($1) or "athleteId" = any($2)`,
      [campaigns, athletes],
    );
    const earnings = await ids(
      `select id from "Earning" where "orderId" = any($1) or "athleteId" = any($2)`,
      [orders, athletes],
    );
    const guardians = [
      ...(owned.guardianIds ?? []),
      ...(await ids(`select "guardianId" as id from "Athlete" where id = any($1) and "guardianId" is not null`, [athletes])),
    ];

    await c.query(`delete from "LinkEvent" where "linkId" = any($1)`, [links]);
    await c.query(`delete from "TrackingLink" where id = any($1)`, [links]);
    await c.query(`delete from "MetricDaily" where "deliverableId" = any($1)`, [deliverables]);
    await c.query(`delete from "CreativeAsset" where "deliverableId" = any($1)`, [deliverables]);
    await c.query(`delete from "Deliverable" where id = any($1)`, [deliverables]);
    await c.query(`delete from "Earning" where id = any($1)`, [earnings]);
    await c.query(`delete from "OfferChangeRequest" where "offerId" = any($1)`, [offers]);
    /* An accepted offer's exclusivity is a restriction on the athlete (2S2-BE-02). */
    await c.query(`delete from "BrandRestriction" where "athleteId" = any($1) or "sourceOfferId" = any($2)`, [athletes, offers]);
    await c.query(`delete from "Offer" where id = any($1)`, [offers]);
    await c.query(`delete from "CampaignOrder" where id = any($1)`, [orders]);
    await c.query(`delete from "AgreementAcceptance" where id = any($1)`, [acceptances]);
    await c.query(`delete from "CampaignInvite" where id = any($1)`, [invites]);
    await c.query(`delete from "CampaignInvoice" where "campaignId" = any($1)`, [campaigns]);
    await c.query(`delete from "ReportFile" where "campaignId" = any($1)`, [campaigns]);
    await c.query(
      `delete from "RewardEvent" where "tokenId" in (select t.id from "RewardToken" t join "Reward" r on r.id = t."rewardId" where r."campaignId" = any($1))`,
      [campaigns],
    );
    await c.query(
      `delete from "RewardToken" where "rewardId" in (select id from "Reward" where "campaignId" = any($1)) or "athleteId" = any($2)`,
      [campaigns, athletes],
    );
    await c.query(`delete from "Reward" where "campaignId" = any($1)`, [campaigns]);
    await c.query(`delete from "SyncTask" where "campaignId" = any($1) or "briefId" = any($2)`, [campaigns, briefs]);
    await c.query(`delete from "CampaignStaffingSkip" where "campaignId" = any($1) or "athleteId" = any($2)`, [campaigns, athletes]);
    await c.query(`delete from "Campaign" where id = any($1)`, [campaigns]);
    await c.query(`delete from "CampaignBrief" where id = any($1)`, [briefs]);
    await c.query(`update "User" set "sponsorId" = null where "sponsorId" = any($1)`, [sponsors]);
    await c.query(`delete from "SponsorContact" where "sponsorId" = any($1)`, [sponsors]);
    await c.query(`delete from "Sponsor" where id = any($1)`, [sponsors]);
    await c.query(`update "User" set "athleteId" = null where "athleteId" = any($1)`, [athletes]);
    await c.query(`delete from "AthleteSocial" where "athleteId" = any($1)`, [athletes]);
    await c.query(`delete from "AthleteScore" where "athleteId" = any($1)`, [athletes]);
    await c.query(`delete from "AthleteRate" where "athleteId" = any($1)`, [athletes]);
    await c.query(`delete from "Athlete" where id = any($1)`, [athletes]);
    await c.query(`update "User" set "guardianId" = null where "guardianId" = any($1)`, [guardians]);
    await c.query(
      `delete from "Guardian" g where g.id = any($1)
         and not exists (select 1 from "Athlete" a where a."guardianId" = g.id)`,
      [guardians],
    );

    const everything = [
      ...athletes, ...sponsors, ...briefs, ...campaigns, ...orders, ...deliverables,
      ...invites, ...earnings, ...guardians, ...links, ...offers,
    ];
    await c.query(`delete from "AuditLog" where "entityId" = any($1)`, [everything]);
    /* Queued side effects (notification emails, Zoho syncs) that name these
       rows — undispatched in CI (no worker), and never worth a real send. */
    if (everything.length) {
      await c.query(`delete from "OutboxJob" where payload::text like any($1)`, [
        everything.map((id) => `%${id}%`),
      ]);
    }
  });
}

export async function seedSponsor(id: string, name: string): Promise<void> {
  await q(`insert into "Sponsor"(id, "tenantId", name) values ($1, $2, $3)`, [id, TENANT, name]);
}

export type SeedAthlete = {
  id: string;
  name: string;
  /** Cents per job, e.g. { "SX-01": 3000 }. */
  rates?: Record<string, number>;
  tier?: "EMERGING" | "CREATOR" | "PREMIUM" | "ANCHOR";
  sport?: string;
  stateCode?: string;
};

/**
 * An athlete as P3 leaves one: ACTIVE, adult, with a rate card. The arrays
 * are `'{}'`, never NULL — the matching conflict filter is
 * `NOT (restrictedCategories && categories)`, and NULL would silently drop
 * the athlete from every brief with a category.
 */
export async function seedAthlete(a: SeedAthlete): Promise<void> {
  await tx(async (c) => {
    await c.query(
      `insert into "Athlete"(id, "tenantId", slug, "legalName", "displayName", email, sport, city, "stateCode",
                             "birthDate", "ageBand", state, tier, "contentCapabilities", "brandInterests", "restrictedCategories")
       values ($1, $2, $3, $4, $4, $5, $6, 'Silver Spring', $7, '2003-04-01', '18_PLUS', 'ACTIVE', $8, '{}', '{}', '{}')`,
      [a.id, TENANT, a.id.replace(/_/g, "-"), a.name, `${a.id}@example.invalid`,
       a.sport ?? "Soccer", a.stateCode ?? "MD", a.tier ?? "CREATOR"],
    );
    for (const [jobId, amount] of Object.entries(a.rates ?? {})) {
      await c.query(
        `insert into "AthleteRate"(id, "tenantId", "athleteId", "jobId", amount) values ($1, $2, $3, $4, $5)`,
        [`${a.id}_rate_${jobId}`, TENANT, a.id, jobId, amount],
      );
    }
  });
}

/** A campaign as P4 leaves one: the brief became it, invitations went out. */
export async function seedCampaign(c: {
  id: string;
  sponsorId: string;
  name: string;
  state?: string;
  budgetCents?: number;
}): Promise<void> {
  await q(
    `insert into "Campaign"(id, "tenantId", "sponsorId", name, budget, "startDate", "endDate", state)
     values ($1, $2, $3, $4, $5, now() - interval '7 day', now() + interval '60 day', $6::"CampaignState")`,
    [c.id, TENANT, c.sponsorId, c.name, c.budgetCents ?? 1_000_000, c.state ?? "STAFFING"],
  );
}

/** An invitation the athlete has already accepted (P4's outcome). */
export async function seedAcceptedInvite(i: {
  id: string;
  campaignId: string;
  athleteId: string;
  jobId: string;
  offeredCents: number;
}): Promise<void> {
  await q(
    `insert into "CampaignInvite"(id, "tenantId", "campaignId", "athleteId", "jobId", offered, state,
                                  "sentAt", "viewedAt", "respondedAt", "expiresAt")
     values ($1, $2, $3, $4, $5, $6, 'ACCEPTED', now() - interval '3 day', now() - interval '2 day',
             now() - interval '2 day', now() + interval '4 day')`,
    [i.id, TENANT, i.campaignId, i.athleteId, i.jobId, i.offeredCents],
  );
}

/** Newest audit rows for an entity, oldest first. */
export async function auditActions(entityId: string): Promise<string[]> {
  const rows = await q<{ action: string }>(
    `select action from "AuditLog" where "entityId" = $1 order by at asc, id asc`,
    [entityId],
  );
  return rows.map((r) => r.action);
}
