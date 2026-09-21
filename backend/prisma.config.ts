import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration — backend copy.
 *
 * The schema and migrations moved here from the repo root when the repo was
 * split into frontend/ and backend/ workspaces; this package is their owner.
 * The frontend keeps its own prisma.config.ts pointing at THIS schema (one
 * source of truth) and receives its own generated client via the second
 * generator block in prisma/schema.prisma.
 *
 * `url` is read straight from process.env rather than prisma/config's `env()`
 * helper: `env()` resolves eagerly and throws, so with DATABASE_URL unset every
 * prisma command — including `validate` and `generate`, which need no
 * database — would fail. The empty string keeps offline commands working and
 * any command that truly needs a connection still fails loudly.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
  },

  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
