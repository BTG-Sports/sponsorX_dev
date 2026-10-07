import { createHmac } from "node:crypto";

import { z } from "zod";

import { authorizedPartiesFrom } from "./authorized-parties";
import { DEFAULT_LEGACY_LINKS_ACCEPTED_UNTIL, DEFAULT_LINK_TTL_DAYS } from "../lib/link-kinds";
import { stripeConfigProblem } from "./stripe-guard";

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
  /* 2S8-SEC-02 — every `*_PREVIOUS` below is the rotation overlap: the old
     value, still ACCEPTED (never used to sign) until it is deleted. Comma
     list allowed. See lib/rotating-secret.ts and
     documentation/SponsorX-Secrets-Rotation.md. */
  INTAKE_TOKEN_SECRET_PREVIOUS: z.string().optional(),
  /* 2S8-PMO-02, owner decision 4 (2026-10-06) — how long an emailed or
     handed-out link lives: intake, onboarding, sign-up, sponsor-request,
     hand-off and reactivation links (lib/signed-link.ts).
     Unsubscribe links never expire. */
  LINK_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(DEFAULT_LINK_TTL_DAYS),
  /* Links issued before the decision carry no date. They are accepted until
     this instant and refused after it, so none outlives the rule by more
     than its own lifetime: the default is the decision date plus 14 days. */
  LEGACY_LINKS_ACCEPTED_UNTIL: z.coerce.date().default(new Date(DEFAULT_LEGACY_LINKS_ACCEPTED_UNTIL)),

  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is not set"),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is not set"),
  /* How far a machine's clock may be from Clerk's before a session token is
     refused as "not active yet" (Clerk's own default is 5 s). A developer
     whose PC clock drifts can set this for a local run; unset elsewhere. */
  CLERK_CLOCK_SKEW_MS: z.coerce.number().int().nonnegative().optional(),
  /* 2S8-PMO-02, owner decision 3 — the web origins whose Clerk sessions this
     API accepts (the token's `azp`), comma-separated. Unset: APP_URL's
     origin, plus the local web origins outside production
     (config/authorized-parties.ts). A malformed entry refuses to boot. */
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),

  // Local dev talks to MinIO (docker-compose.yml); staging/production talk to
  // Cloudflare R2 with the same S3 API. Only the endpoint and credentials
  // change — code paths stay identical (.claude/stack-decision.md).
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().default("sponsorx"),
  S3_SECRET_ACCESS_KEY: z.string().default("sponsorx-dev-secret"),
  S3_BUCKET_PUBLIC: z.string().default("sponsorx-public"),
  S3_BUCKET_PRIVATE: z.string().default("sponsorx-private"),
  /* Where the PUBLIC bucket is served from (the CDN) — set on Railway since
     2026-09-21; the local default is MinIO's path-style URL. Public objects
     are linked, never signed (storage.ts). */
  R2_PUBLIC_BASE_URL: z.string().default("http://localhost:9000/sponsorx-public"),

  /* 2S4-BE-09 — each sponsor's spending limit (programme owner, 2026-10-02).
     An order within it is approved automatically; above it, it waits for BTG.
     It starts at $5,000 and, after each order completed without a refund or
     an upheld delivery problem, becomes twice the sponsor's largest completed
     order (never below the start), up to the cap of $25,000. Replaces the
     fixed $1,000 threshold and the first-order hold of 2S4-BE-05. */
  MARKETPLACE_SPENDING_LIMIT_START_CENTS: z.coerce.number().int().min(0).default(500_000),
  MARKETPLACE_SPENDING_LIMIT_CAP_CENTS: z.coerce.number().int().min(0).default(2_500_000),
  /* 2S4-BE-03 — a buyer fee on marketplace orders, in basis points. 0 until
     BTG sets one: no fee is invented here (commission is 2S5-BE-01). */
  MARKETPLACE_BUYER_FEE_BPS: z.coerce.number().int().min(0).max(5_000).default(0),

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
  ZOHO_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),

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
  ZOHO_NOTIFY_TOKEN_PREVIOUS: z.string().optional(),
  ZOHO_NOTIFY_CHANNEL_ID: z.string().regex(/^\d+$/).optional(),
  ZOHO_NOTIFY_URL: z.string().url().optional(),

  /* The secret the web server presents when it forwards a fan's address
     (P8-SEC-03, lib/client-ip.ts). Unset: forwarded addresses are ignored
     and the socket address is used. Set the same value on web and api. */
  SPONSORX_EDGE_KEY: z.string().min(24).optional(),
  SPONSORX_EDGE_KEY_PREVIOUS: z.string().optional(),

  /* Which Railway environment this is (P3-DATA-01). Railway injects it; a
     developer machine has none. Needed because NODE_ENV cannot tell staging
     from production — both run "production". */
  RAILWAY_ENVIRONMENT_NAME: z.string().optional(),

  /* The pilot cohort import's production gate (P3-DATA-01): a comma-separated
     list of cohort file fingerprints (sha256) allowed to run in production.
     A fingerprint is added here by a person after that exact file has run
     cleanly on staging — which is what "staging first" means in practice. */
  COHORT_IMPORT_APPROVED_SHA256: z.string().default(""),

  /* 2S5 — which payment provider takes card payments and sends payouts.
     "standin" is a test provider for staging and local only: its pages are
     SponsorX's own, clearly labelled, and it moves no money. "none" means no
     provider is connected yet — the buttons say so and nothing is charged or
     sent. Unset: "none" in Railway production, "standin" everywhere else.
     "stripe" (2S5-INT-01 / -03, Stripe chosen under 2S0-PMO-03) is the real
     one: hosted Checkout, Connect Express payout accounts, transfers. */
  PAYMENT_PROVIDER: z.enum(["standin", "none", "stripe"]).optional(),
  /* 2S5-INT-01 — Stripe. Required when PAYMENT_PROVIDER=stripe; a live key is
     refused outside Railway production and a test key inside it
     (config/stripe-guard.ts). Never logged. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /* The signing secret of the platform webhook endpoint (checkout, refunds,
     disputes, transfers) — and, mid-rotation, the old one (2S8-SEC-02). */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),
  /* 2S5-INT-03 — payees' accounts are Accounts v2, whose changes Stripe
     sends as THIN events to an event destination with its own signing
     secret (v2.core.account…). Optional at boot, but without it a payee's
     payout account never turns READY. Same URL as the platform endpoint. */
  STRIPE_THIN_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_THIN_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),
  /* The signing secret of the CONNECT snapshot endpoint (events on payees'
     connected accounts: capability.updated, payout.failed). Optional. Stripe
     signs each endpoint with its own secret; all may point at the same URL. */
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),
  /* On api and web for completeness; hosted Checkout does not need it. */
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  /* The country new payout accounts are opened in (ISO 3166-1 alpha-2). */
  STRIPE_CONNECT_COUNTRY: z.string().length(2).default("US"),
  /* Signs the stand-in provider's links. Development default is fine: the
     stand-in is refused in production (below). */
  STANDIN_PROVIDER_SECRET: z.string().default("dev-standin-provider-secret"),
  STANDIN_PROVIDER_SECRET_PREVIOUS: z.string().optional(),
  /* Days after an order is fulfilled before its money can be requested as a
     payout (2S5-BE-04's "configured holding period"). */
  PAYOUT_HOLD_DAYS: z.coerce.number().int().min(0).max(90).default(0),
  /* 2S5-BE-06 / -08 — the programme owner's automatic-approval rule
     (2026-10-02). A payout (or a Phase 1 earning) under the limit, with every
     check passed, is approved as the system — unless the payee's payout
     account changed within the review days, or the payee's automatic
     approvals in the window, counting this one, reach the cap. */
  PAYOUT_AUTO_APPROVE_LIMIT_CENTS: z.coerce.number().int().min(0).default(200_000),
  PAYOUT_ACCOUNT_CHANGE_REVIEW_DAYS: z.coerce.number().int().min(0).max(90).default(7),
  PAYOUT_AUTO_APPROVE_WINDOW_DAYS: z.coerce.number().int().min(0).max(90).default(7),
  PAYOUT_AUTO_APPROVE_WINDOW_CAP_CENTS: z.coerce.number().int().min(0).default(500_000),
  /* 2S5-BE-07 — staging's stand-in provider can be told to fail every payout
     it sends, with one failure kind, so the retry story can be run end to
     end. Unset: it pays. Ignored by any other provider. */
  STANDIN_PAYOUT_FAILURE: z.enum(["TEMPORARY", "ACCOUNT", "OTHER"]).optional(),
  /* 2S5-INT-02 — a provider webhook is refused when its signed timestamp is
     further than this from now: a replayed delivery, even correctly signed,
     is turned away (its event id would make it a no-op anyway). */
  PAYMENT_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /* 2S8-QA-02 — how long a call to the payment provider may take before it
     is given up on (and rolled back, for the queue to retry). */
  PAYMENT_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(10).max(120_000).default(15_000),
  /* 2S8-QA-02 — the stand-in pretends to be down, for outage testing on
     staging: a comma list of checkout | payout | refund, each optionally
     ":timeout" (hang until PAYMENT_PROVIDER_TIMEOUT_MS). Unset: it is up. */
  STANDIN_OUTAGE: z.string().max(200).optional(),

  /* 2S1-BE-16 / 2S1-OPS-01 — BTG's support mailbox. The contact form's
     messages are queued to this address, and it is shown wherever a person
     might be stuck (the guardian request page, decline and rejection emails,
     account pages). It works the same whether BTG picks Zoho Desk (which
     takes mail in as tickets) or a shared mailbox. SUPPORT_MAILBOX_READY says
     whether 2S1-OPS-01 has set the mailbox up: until it is "true" the pages
     say the address is being set up. */
  SUPPORT_EMAIL: z.string().email().default("support@sponsorx.net"),
  SUPPORT_MAILBOX_READY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

/* A development default that reached production would make every continuation
   link forgeable by anyone who has read this repository. Refusing to boot is
   the only safe failure: a warning gets missed, and the damage is silent. */
const parsed = schema.parse(process.env);
if (parsed.MARKETPLACE_SPENDING_LIMIT_CAP_CENTS < parsed.MARKETPLACE_SPENDING_LIMIT_START_CENTS) {
  throw new Error(
    "MARKETPLACE_SPENDING_LIMIT_CAP_CENTS is below MARKETPLACE_SPENDING_LIMIT_START_CENTS. " +
      "A sponsor's limit starts at the start figure and only rises to the cap, so the cap must be at least the start.",
  );
}
/* 2S0-SEC-01 — the two buckets are the whole of the separation between files
   the world may read (the public CDN bucket: logos, published assets) and
   files nobody may read without a signed, audited link (the private bucket:
   ID documents, guardianship proof, agreements, support attachments). Both
   are plain variables, so one copied into the other would publish every
   verification document at R2_PUBLIC_BASE_URL. Refused everywhere. */
if (parsed.S3_BUCKET_PUBLIC.trim().toLowerCase() === parsed.S3_BUCKET_PRIVATE.trim().toLowerCase()) {
  throw new Error(
    "S3_BUCKET_PUBLIC and S3_BUCKET_PRIVATE name the same bucket. The public bucket is world-readable, " +
      "so verification documents would be served to anyone. Refusing to boot.",
  );
}
const privateBucketIn = (base: string, bucket: string) => {
  try {
    const u = new URL(base);
    const b = bucket.trim().toLowerCase();
    /* Path style (…/<bucket>, as MinIO serves it) or virtual-hosted style (<bucket>.<host>). */
    return u.pathname.toLowerCase().split("/").includes(b) || u.hostname.toLowerCase().startsWith(`${b}.`);
  } catch {
    return false;
  }
};
if (privateBucketIn(parsed.R2_PUBLIC_BASE_URL, parsed.S3_BUCKET_PRIVATE)) {
  throw new Error(
    "R2_PUBLIC_BASE_URL points at the private bucket. Public URLs are built from it without a signature. Refusing to boot.",
  );
}
if (parsed.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production" && parsed.PAYMENT_PROVIDER === "standin") {
  throw new Error(
    "PAYMENT_PROVIDER=standin in production. The stand-in provider marks cards " +
      "paid and payouts sent without moving any money; it exists for staging " +
      "only. Refusing to boot.",
  );
}
/* 2S5-INT-01 — Stripe's keys: present when Stripe is the provider, and the
   right mode for the environment (a live key only in production). */
const stripeProblem = stripeConfigProblem(parsed);
if (stripeProblem) throw new Error(stripeProblem);
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
/* 2S8-SEC-02 — a rotation overlap must not quietly re-admit the public
   development default. */
if (
  parsed.NODE_ENV === "production" &&
  (parsed.INTAKE_TOKEN_SECRET_PREVIOUS ?? "").split(",").some((s) => s.trim() === "dev-intake-secret-not-for-production")
) {
  throw new Error(
    "INTAKE_TOKEN_SECRET_PREVIOUS contains the development default. The previous " +
      "value is still accepted, so in production it must be the real old secret.",
  );
}

/* 2S8-SEC-02 — the stand-in provider on STAGING (NODE_ENV=production, not
   Railway "production") signed its links with the development default unless
   someone set STANDIN_PROVIDER_SECRET, so anyone who had read this repository
   could forge a link that marks a payout account ready or a checkout paid.
   Rather than refuse to boot a staging that may never have set it, an unset
   secret is DERIVED from INTAKE_TOKEN_SECRET — already guaranteed real in
   production — under its own label, so it is unguessable with no Railway
   change. Setting STANDIN_PROVIDER_SECRET explicitly still wins (runbook). */
const STANDIN_DEV_DEFAULT = "dev-standin-provider-secret";
const standinSecret =
  parsed.NODE_ENV === "production" && parsed.STANDIN_PROVIDER_SECRET === STANDIN_DEV_DEFAULT
    ? createHmac("sha256", parsed.INTAKE_TOKEN_SECRET).update("sponsorx:standin-provider-secret:v1").digest("base64url")
    : parsed.STANDIN_PROVIDER_SECRET;

export const env = {
  ...parsed,
  STANDIN_PROVIDER_SECRET: standinSecret,
  /* 2S8-PMO-02 — resolved once, so a malformed list fails here, at boot. */
  clerkAuthorizedParties: authorizedPartiesFrom(parsed.CLERK_AUTHORIZED_PARTIES, parsed.APP_URL, parsed.NODE_ENV),
};
