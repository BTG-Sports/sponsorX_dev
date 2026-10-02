import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

/* The repo-root .env, as every other backend script reads it
   (`node --env-file-if-exists=../.env`, package.json). Prisma's own CLI
   cannot take that flag, so without this `npm run prisma:deploy` on a
   fresh checkout failed with "Connection url is empty" although .env held
   the URL (found following the developer handoff, P8-PMO-05). Only when
   DATABASE_URL is unset: an explicit value — CI, `npm run db:test` — wins,
   exactly as with --env-file. No .env, no change. */
const rootEnv = fileURLToPath(new URL("../.env", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

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
