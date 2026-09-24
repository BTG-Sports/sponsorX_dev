import { z } from "zod";

/**
 * Environment, validated once at boot. Anything that reads configuration goes
 * through this object — never process.env directly — so a missing or malformed
 * variable fails loudly at startup instead of deep inside a request.
 *
 * Defaults match docker-compose.yml so `docker compose up -d` followed by
 * `npm run dev -w @sponsorx/backend` works with no .env at all. DATABASE_URL
 * has no default on purpose: pointing at the wrong database silently is worse
 * than refusing to start (same stance as frontend/src/server/db.ts).
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  /* Clerk authenticates; Postgres authorises (Addendum A4). No default: an
     API that silently starts without the ability to verify a caller would
     answer every request as anonymous, which looks like a permissions bug
     rather than a missing variable. */
  /* Email (G-04 chose Resend, P3-INT-01). Optional on purpose, unlike the
     Clerk keys: a developer machine and CI must be able to boot the worker,
     drain the outbox and run every other job with no email credentials at
     all. A send attempted without a key fails that one job loudly and
     retries, rather than preventing the process from starting. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("SponsorX <noreply@sponsorx.net>"),

  /* Where a notification tells someone to go. It has to be configuration
     rather than a constant because the same email is sent from a developer
     machine, from staging and from production, and a link to the wrong one is
     how an applicant ends up staring at a sign-in page that does not know
     them (P3-BE-07). */
  APP_URL: z.string().default("http://localhost:3000"),

  /* Public application intake (P3-BE-13).

     THE TENANT. /join is a public form: the applicant has no session, so
     nothing about the request says which tenant they are applying to. Phase 1
     is a single managed marketplace, so the answer is configuration rather
     than inference — and making it explicit is what keeps a second tenant a
     config change instead of a rewrite.

     THE SECRET. An applicant returns to their own application through a
     signed link, not a login. The signature is all that stands between a
     stranger and someone else's application, so a default is development-only
     and production must set it — see the refinement below. */
  PUBLIC_INTAKE_TENANT_ID: z.string().default("seed_tenant_btg"),
  INTAKE_TOKEN_SECRET: z.string().default("dev-intake-secret-not-for-production"),

  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is not set"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is not set"),

  // Local dev talks to MinIO (docker-compose.yml); staging/production talk to
  // Cloudflare R2 with the same S3 API. Only the endpoint and credentials
  // change — code paths stay identical (.claude/stack-decision.md).
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().default("sponsorx"),
  S3_SECRET_ACCESS_KEY: z.string().default("sponsorx-dev-secret"),
  S3_BUCKET_PUBLIC: z.string().default("sponsorx-public"),
  S3_BUCKET_PRIVATE: z.string().default("sponsorx-private"),

  /* The GeoLite2 City database, for P6-BE-05.
     
     Optional on purpose. The file is a licensed MaxMind download that cannot
     be committed, so a checkout without it must still boot — the geo job
     then reports that it has no database and leaves city/region null, which
     is a missing dimension on a chart rather than a broken deploy. */
  GEOLITE2_CITY_PATH: z.string().optional(),

  /* Shared secret for inbound Zoho webhooks (P7-BE-04, §18).
  
     Optional in the schema so a local checkout runs, but the production guard
     below refuses to boot without it: the invoice webhook is a public route,
     and an unsigned one is an unauthenticated write into the finance mirror. */
  ZOHO_WEBHOOK_SECRET: z.string().optional(),

  /* The Zoho CRM sync — P8-INT-01..07, field-mapping §8.2.

     Worker credentials. Optional so every other job runs without them; a
     Zoho job on a worker without them fails and retries rather than being
     dropped. EXPECTED_ORG_ID pins which org the token may reach: staging
     holds the SponsorX-Dev sandbox's token and its id, so a production
     token pasted into staging by mistake is refused on the first call. */
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  ZOHO_REFRESH_TOKEN: z.string().optional(),
  ZOHO_API_DOMAIN: z.string().default("https://www.zohoapis.com"),
  ZOHO_ACCOUNTS_URL: z.string().default("https://accounts.zoho.com"),
  ZOHO_EXPECTED_ORG_ID: z.string().optional(),

  /* Inbound (P8-INT-03). The Notifications API channel: Zoho echoes the
     token and channel id back on every callback, and the route refuses any
     callback where either is wrong — or where they are not configured. The
     worker keeps the channel subscribed when NOTIFY_URL is set. */
  ZOHO_NOTIFY_TOKEN: z.string().min(16).optional(),
  ZOHO_NOTIFY_CHANNEL_ID: z.string().regex(/^\d+$/).optional(),
  ZOHO_NOTIFY_URL: z.string().url().optional(),

  /* Which Railway environment this is (P3-DATA-01). Railway injects it; a
     developer machine has none. Needed because NODE_ENV cannot tell staging
     from production — both run "production". */
  RAILWAY_ENVIRONMENT_NAME: z.string().optional(),

  /* The pilot cohort import's production gate (P3-DATA-01): a comma-separated
     list of cohort file fingerprints (sha256) allowed to run in production.
     A fingerprint is added here by a person after that exact file has run
     cleanly on staging — which is what "staging first" means in practice. */
  COHORT_IMPORT_APPROVED_SHA256: z.string().default(""),
});

/* A development default that reached production would make every continuation
   link forgeable by anyone who has read this repository. Refusing to boot is
   the only safe failure: a warning gets missed, and the damage is silent. */
const parsed = schema.parse(process.env);
if (parsed.NODE_ENV === "production" && !parsed.ZOHO_WEBHOOK_SECRET) {
  throw new Error(
    "ZOHO_WEBHOOK_SECRET is not set. The Zoho invoice webhook is a public " +
      "route, so without a shared secret anyone who finds the URL can write " +
      "into the invoice mirror. Refusing to boot rather than accepting " +
      "unsigned payloads.",
  );
}
if (
  parsed.NODE_ENV === "production" &&
  parsed.INTAKE_TOKEN_SECRET === "dev-intake-secret-not-for-production"
) {
  throw new Error(
    "INTAKE_TOKEN_SECRET is still the development default. It signs the links " +
      "applicants use to return to their own application, so in production it " +
      "must be a real secret.",
  );
}

export const env = parsed;
