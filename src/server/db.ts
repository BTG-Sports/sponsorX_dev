/**
 * The Prisma client (P2-BE-05, Guide §02).
 *
 * Prisma 7 no longer takes a connection URL in `schema.prisma` — the client is
 * constructed with a **driver adapter**. `PrismaPg` owns a `pg` pool and the
 * connection string comes from the environment, which is why `prisma.config.ts`
 * reads `DATABASE_URL` for Migrate and this file reads it for the runtime.
 *
 * One `DATABASE_URL`, no pooled/direct split: Railway Postgres is a direct
 * connection (Guide §10). If pgbouncer is ever put in front of it, reintroduce
 * `DIRECT_URL` for `prisma migrate` and keep the pooled URL here — the hazard is
 * real, it just is not present today.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The web and worker services both receive it " +
        "from Railway; locally, export it before running anything that touches " +
        "the database.",
    );
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/* Next dev reloads modules on every edit, and a fresh PrismaClient per reload
   exhausts the connection pool within a few minutes. Cache it on globalThis in
   development; in production the module is evaluated once and this is a plain
   singleton. */
const globalForDb = globalThis as unknown as { db?: PrismaClient };

export const db: PrismaClient = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;
