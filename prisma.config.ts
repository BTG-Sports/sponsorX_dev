import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration (P2-BE-01, Guide §01 and §02).
 *
 * Prisma 7 no longer infers these paths — each is set explicitly here.
 * The generated client output path is declared in the `generator client`
 * block of `prisma/schema.prisma` (Prisma 7 sets output on the generator,
 * not in this file): it writes to `src/generated/prisma`, per Guide §02,
 * and that directory is gitignored.
 *
 * The schema itself is deliberately a skeleton — datasource and generator
 * only. Authoring the tables, the tenant marker and the eight §21 state
 * machines is P2-BE-02, a five-day task of its own.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
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
