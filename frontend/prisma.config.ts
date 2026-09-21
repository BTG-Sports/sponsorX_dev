import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration (P2-BE-01, Guide §01 and §02) — frontend copy.
 *
 * The schema and migrations MOVED to the backend workspace when the repo was
 * split into frontend/ and backend/. There is one schema
 * (../backend/prisma/schema.prisma) and it carries a second `generator
 * frontend` block that writes this workspace's client to
 * src/generated/prisma (gitignored). This config points the frontend's
 * `prisma generate` at that shared schema so `next build` still produces the
 * client it imports as @/generated/prisma — no schema is duplicated.
 *
 * Migrations are OWNED by the backend and are not run from here; the path is
 * declared only so `prisma` CLI invocations from this workspace resolve
 * against the same directory rather than erroring.
 */
export default defineConfig({
  schema: "../backend/prisma/schema.prisma",

  migrations: {
    path: "../backend/prisma/migrations",
  },

  // Prisma 7 moved the Migrate connection URL out of schema.prisma and into
  // this file — `url` in a datasource block is now a validation error.
  //
  // Read straight from process.env rather than prisma/config's `env()` helper:
  // `env()` resolves eagerly and throws, so with DATABASE_URL still unset every
  // prisma command — including `validate` and `generate`, which need no
  // database — would fail. DATABASE_URL arrives with the Railway Postgres
  // (P0-OPS-01 → P2-OPS-01); until then the empty string keeps the offline
  // commands working and any command that truly needs a connection still fails
  // loudly.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
