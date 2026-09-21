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
});

export const env = schema.parse(process.env);
