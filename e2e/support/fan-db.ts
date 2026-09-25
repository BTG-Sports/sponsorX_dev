/**
 * Seeding and reading the fan funnel for the E2E suite — P6-QA-01/02.
 *
 * The redeem specs drive the REAL stack (web → API → Postgres), so they seed
 * a reward token straight into the database the API uses and read the
 * RewardEvent rows back. Everything is prefixed `e2e_` and removed after.
 *
 * Needs DATABASE_URL (CI's e2e job has a migrated Postgres and runs the API);
 * without it the specs skip, with the reason, rather than pass vacuously.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";

export const hasDatabase = Boolean(process.env.DATABASE_URL);

function pool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
}

const T = "e2e_fan_tenant";

/* Tokens this process seeded — cleanup removes only these, so specs running
   side by side never delete each other's rows. */
const seeded: string[] = [];

export async function seedToken(label: string): Promise<string> {
  const db = pool();
  const token = `e2e-${label}-${randomBytes(12).toString("base64url")}`;
  const id = `e2e_${label}_${randomBytes(4).toString("hex")}`;
  try {
    await db.query(`insert into "Tenant"(id,name) values($1,'E2E fan tenant') on conflict (id) do nothing`, [T]);
    await db.query(`insert into "Sponsor"(id,"tenantId",name) values('e2e_fan_sponsor',$1,'E2E Sponsor') on conflict (id) do nothing`, [T]);
    await db.query(
      `insert into "Athlete"(id,"tenantId",slug,"legalName","displayName",email,sport,"stateCode","ageBand",state,"contentCapabilities","brandInterests","restrictedCategories")
       values('e2e_fan_athlete',$1,'e2e-fan-athlete','E2E Athlete','E2E','e2e@example.invalid','Soccer','MD','18_PLUS','ACTIVE','{}','{}','{}') on conflict (id) do nothing`, [T]);
    await db.query(
      `insert into "Campaign"(id,"tenantId","sponsorId",name,budget,"startDate","endDate",state)
       values('e2e_fan_campaign',$1,'e2e_fan_sponsor','E2E Campaign',1,now(),now()+interval '30 day','ACTIVE') on conflict (id) do nothing`, [T]);
    await db.query(
      `insert into "Reward"(id,"tenantId","campaignId","offerText",terms,"expiresAt",state)
       values($1,$2,'e2e_fan_campaign','E2E free slice','One per fan',now()+interval '7 day','ACTIVE')`, [`${id}_r`, T]);
    await db.query(
      `insert into "RewardToken"(id,"tenantId","rewardId",token,"athleteId") values($1,$2,$3,$4,'e2e_fan_athlete')`,
      [`${id}_t`, T, `${id}_r`, token]);
    seeded.push(id);
    return token;
  } finally {
    await db.end();
  }
}

/** Funnel events for a token, by type — never the fan's address. */
export async function eventCounts(token: string): Promise<Record<string, number>> {
  const db = pool();
  try {
    const { rows } = await db.query<{ type: string; n: number }>(
      `select e.type, count(*)::int as n from "RewardEvent" e
         join "RewardToken" t on t.id = e."tokenId" where t.token = $1 group by e.type`, [token]);
    return Object.fromEntries(rows.map((r) => [r.type, r.n]));
  } finally {
    await db.end();
  }
}

export async function cleanup(): Promise<void> {
  if (!hasDatabase || seeded.length === 0) return;
  const db = pool();
  const tokens = seeded.map((id) => `${id}_t`);
  const rewards = seeded.map((id) => `${id}_r`);
  try {
    await db.query(`delete from "RewardEvent" where "tokenId" = any($1)`, [tokens]);
    await db.query(`delete from "OutboxJob" where "tenantId" = $1 and payload::text like any($2)`,
      [T, tokens.map((t) => `%${t}%`)]);
    await db.query(`delete from "RewardToken" where id = any($1)`, [tokens]);
    await db.query(`delete from "Reward" where id = any($1)`, [rewards]);
    seeded.length = 0;
  } finally {
    await db.end();
  }
}
