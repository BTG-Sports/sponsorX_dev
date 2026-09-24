import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { ROLES } from "../src/auth/policy";
import { ATHLETE_STATES_FOR_TEST } from "../src/domain/athlete-state";
import { BRIEF_STATES } from "../src/domain/brief-state";
import { CAMPAIGN_STATES } from "../src/domain/campaign-state";
import { INVITE_STATES, OPEN_INVITE_STATES } from "../src/domain/invite-state";
import { PRICED_TIERS } from "../src/domain/pricing";
import { EMAIL_TEMPLATES } from "../worker/jobs/send-email.mts";

/* --------------------------------------------------------------------------
   Alignment — every vocabulary that exists twice.

   Prisma enums, TypeScript unions, Zod contracts and a SQL index all carry
   copies of the same lists. Each copy is there for a reason — the domain rule
   must not import a database client, the contract must be publishable — but a
   copy that drifts is worse than no copy at all: the type system keeps
   agreeing while the database refuses the write.

   So the schema is read as text and compared. These are the pairs that have
   no compiler keeping them honest.
   -------------------------------------------------------------------------- */

const SCHEMA = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

function prismaEnum(name: string): string[] {
  const match = SCHEMA.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!match) throw new Error(`no Prisma enum ${name}`);
  return match[1]!.split(/\s+/).filter(Boolean);
}

describe("Prisma enums and their TypeScript copies", () => {
  it.each([
    ["Role", () => [...ROLES]],
    ["AthleteState", () => [...ATHLETE_STATES_FOR_TEST]],
    ["BriefState", () => [...BRIEF_STATES]],
    ["CampaignState", () => [...CAMPAIGN_STATES]],
    ["InviteState", () => [...INVITE_STATES]],
  ])("%s matches, in order", (name, get) => {
    expect(get()).toEqual(prismaEnum(name));
  });
});

describe("subsets are deliberate, never accidental", () => {
  it("only ever writes a MetricSource the database knows", () => {
    const metric = prismaEnum("MetricSource");
    for (const value of ["SELF_REPORTED", "VERIFIED_MANUAL"]) {
      expect(metric).toContain(value);
    }
  });

  it("prices three of the four tiers and leaves ANCHOR out", () => {
    /* ANCHOR's multiplier is negotiated, so it has no derived floor. If it
       ever appears here, every Anchor athlete silently acquires a computed
       minimum price nobody agreed. */
    const tiers = prismaEnum("AthleteTier");
    expect(tiers).toContain("ANCHOR");
    expect([...PRICED_TIERS]).toEqual(["EMERGING", "CREATOR", "PREMIUM"]);
    expect([...PRICED_TIERS]).not.toContain("ANCHOR");
  });
});

describe("the open-invite states and the partial index agree", () => {
  it("indexes exactly the states the domain calls open", () => {
    /* If these disagree, either two live offers become possible or a
       re-invitation after an expiry is wrongly refused. */
    const sql = readFileSync(
      new URL("../prisma/sql/invite_one_open.sql", import.meta.url), "utf8");
    for (const state of OPEN_INVITE_STATES) expect(sql).toContain(`'${state}'`);
    const indexed = sql.match(/state IN \(([^)]*)\)/)![1]!
      .split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(indexed).toEqual([...OPEN_INVITE_STATES]);
  });
});

describe("every declared email template can actually be rendered", () => {
  it("has a worker entry for each one", () => {
    const declared = readFileSync(
      new URL("../src/lib/email.ts", import.meta.url), "utf8")
      .match(/export type EmailTemplate =([\s\S]*?);/)![1]!
      .match(/"([a-z]+\.[A-Za-z]+)"/g)!.map((s) => s.replace(/"/g, ""));
    for (const template of declared) {
      expect(EMAIL_TEMPLATES[template], `${template} has no worker template`).toBeTypeOf("function");
    }
  });
});

describe("every job that is enqueued has somewhere to go", () => {
  /* The failure this prevents: a domain function enqueues a name the worker
     never works, the drain marks it dispatched, and the event expires unread.
     The drain now refuses to dispatch an unhandled name, so the outbox row
     waits instead — this asserts the two lists are the ones we think. */
  const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");

  it("only dispatches names it registers a handler for", () => {
    const handled = worker.match(/const HANDLED_JOBS = new Set<string>\(\[([\s\S]*?)\]\)/)![1]!
      .match(/"([a-z.A-Z]+)"/g)!.map((s) => s.replace(/"/g, ""));
    const worked = [...worker.matchAll(/boss\.work<[^>]*>\("([a-z.A-Z]+)"/g)].map((m) => m[1]);
    expect(handled.sort()).toEqual(worked.sort());
  });

  it("filters undeliverable rows in SQL, not after the LIMIT", () => {
    /* Filtering after LIMIT would starve the queue: undeliverable rows are
       the oldest, so they would fill every batch forever. */
    expect(worker).toContain('AND name = ANY($2::text[])');
  });
});

describe("a job with a handler is actually dispatched", () => {
  /* The invariant the worker's own comment states: "Every name here must
     have a matching boss.work() registration below." Asserting THAT, rather
     than the literal contents of the set, is what actually protects the
     drain — the previous version pinned the exact string and so had to be
     edited every time a handler shipped, which makes it a chore rather than
     a guard. The failure it exists to catch is a name added to HANDLED_JOBS
     with no consumer: the drain would then mark those rows dispatched and
     the work would expire unread. */
  it("every handled job name has a boss.work registration", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    const block = worker.match(/HANDLED_JOBS = new Set<string>\(\[([\s\S]*?)\]\)/);
    expect(block).not.toBeNull();

    const handled = [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(handled.length).toBeGreaterThan(0);

    for (const name of handled) {
      expect(worker).toContain(`boss.work<`);
      expect(worker).toContain(`("${name}"`);
    }
  });

  it("still drains notify.invitationSent, which was waiting on P4-INT-01", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toContain('"notify.invitationSent"');
    expect(worker).toContain('boss.work<InvitationJob>("notify.invitationSent"');
  });

  it("drains zoho.pushCampaign — rows queued before P8-INT-01 are not stranded", () => {
    /* Launches enqueued the Deal push under this name for weeks before the
       sync shipped. It is consumed by the same handler as zoho.pushDeal. */
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toContain('boss.work<DealJob>("zoho.pushCampaign"');
  });

  it("still has no handler for zoho.pushAthlete, so those rows keep waiting", () => {
    /* The athlete custom module is outside P8-INT-01's four objects. Until
       it is built the rows must accumulate in the outbox, not expire. */
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).not.toContain('("zoho.pushAthlete"');
  });
});

describe("every resource the domain scopes on has a builder", () => {
  /* whereFor() throws ScopeNotImplementedError for a resource with no
     builder, and it throws at REQUEST TIME, not compile time. Three functions
     shipped calling it for campaignOrder and athleteRate, which had none — so
     accepting an order 500'd and no test noticed, because each function was
     tested with its database mocked.

     This reads the domain as text and checks the two lists against each
     other, which is the only thing that can catch it without a database. */
  it("has a builder for each one", () => {
    const domain = execSync("cat src/domain/*.ts").toString();
    const used = new Set(
      [...domain.matchAll(/whereFor\(\s*actor,\s*"([a-zA-Z]+)"/g)].map((m) => m[1]!),
    );
    expect(used.size).toBeGreaterThan(0);

    const scope = readFileSync(new URL("../src/auth/scope.ts", import.meta.url), "utf8");
    const builders = scope.slice(scope.indexOf("const BUILDERS"));
    for (const resource of [...used].sort()) {
      expect(
        new RegExp(`\\b${resource}: \\(actor, scope\\)|\\b${resource}: tenantScoped`).test(builders),
        `whereFor() is called for "${resource}" but scope.ts has no builder — it will throw at request time`,
      ).toBe(true);
    }
  });
});

describe("one tenant, two processes", () => {
  it("makes the worker read the same variable the API does", () => {
    /* These were two literals that happened to match. The first environment
       to set one of them would have sent every application to a tenant with
       no catalogue and no users — a data bug in appearance, a configuration
       bug in fact. */
    const seed = readFileSync(
      new URL("../worker/jobs/seed-environment.mts", import.meta.url), "utf8");
    expect(seed).toContain("process.env.PUBLIC_INTAKE_TENANT_ID");

    const env = readFileSync(new URL("../src/config/env.ts", import.meta.url), "utf8");
    const apiDefault = env.match(/PUBLIC_INTAKE_TENANT_ID: z\.string\(\)\.default\("([^"]+)"\)/)![1];
    const workerDefault = seed.match(/PUBLIC_INTAKE_TENANT_ID \?\? "([^"]+)"/)![1];
    expect(workerDefault).toBe(apiDefault);
  });
});

describe("the domain is reachable", () => {
  /* Three B1 tasks closed with no endpoint, and B3 repeated it. A domain
     function nothing can call is a capability the board claims and the
     product does not have. */
  const routes = ["applications", "guardians", "campaigns", "deliverables", "rewards", "earnings", "metrics", "zoho-webhooks"]
    .map((f) => readFileSync(new URL(`../src/routes/v1/${f}.ts`, import.meta.url), "utf8"))
    .join("\n");

  it.each([
    "submitApplication", "patchApplication", "readOwnApplication",
    "approveApplication", "requestChanges", "rejectApplication", "beginReview",
    "linkGuardian", "verifyGuardian", "readGuardianReadiness", "acceptAgreement",
    "recordSocials",
    "createBrief", "transitionBrief", "eligibleForBrief",
    "createCampaignFromBrief", "transitionCampaign",
    "inviteAthlete", "transitionInvite",
    "setAthleteTier", "setAthleteRate", "readRateCard",
    "createOrder", "transitionOrder", "acceptOrder",
    /* B5 — deliverables, the approval chain and creative assets. */
    "launchCampaign",
    "submitDraft", "startBtgReview", "sendToSponsorReview", "requestRevision",
    "approveDeliverable", "markPublished", "verifyPublished",
    "presignCreativeUpload", "registerCreativeAsset",
    /* B6 — the fan funnel and tracking links. */
    "createReward", "transitionReward", "issueRewardToken", "rewardFunnel",
    "recordScan", "recordLanding", "recordClaim", "redeemToken",
    "createTrackingLink", "codesForCampaign", "clicksForLink",
    "resolveCode", "recordClick",
    /* P6-SEC-03 — the fan's one-tap unsubscribe. */
    "withdrawFanConsent",
    /* B7 — earnings. createEarningForOrder and maybeMakeEligible are
       deliberately absent: they are called from inside acceptOrder and
       verifyPublished respectively, not from a route of their own. */
    "readEarning", "transitionEarning", "adjustEarning",
    /* B7 — metrics and the sponsor report. */
    "recordMetric", "metricsForDeliverable", "metricsForCampaign",
    "metricsForAthlete", "assembleSponsorReport",
    /* P7-BE-04 — the Zoho invoice mirror. `ingestZohoInvoice` is absent
       deliberately: it is called by the worker job, not by a route. */
    "invoicesForCampaign", "paymentStatusForCampaign",
    /* B7 — operations dashboard reads (P7-DATA-04, P7-DATA-05). */
    "deliveryHealth", "underDeliveringCampaigns", "networkMetrics", "jobEconomics",
  ])("%s is called by a route", (fn) => {
    expect(routes).toContain(fn);
  });
});
