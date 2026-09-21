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
   exhausts the connection pool within a few minutes. Cache it on globalThis so
   a reload reuses one client; in production the module is evaluated once and
   this is a plain singleton either way. */
const globalForDb = globalThis as unknown as { db?: PrismaClient };

function client(): PrismaClient {
  globalForDb.db ??= createClient();
  return globalForDb.db;
}

/* Constructed on first use, not on import (P2-INT-01).

   `next build` imports every route module to collect its configuration, so
   building anything that transitively imports this file used to require a live
   `DATABASE_URL` — which no developer machine has, because Railway Postgres is
   private-networking only. Eagerly calling createClient() here therefore broke
   the build rather than the query. Behind this proxy the throw still happens,
   but at the first real database call, which is where a missing connection
   string is actually a problem and where the error message makes sense. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const value = Reflect.get(client(), property, receiver);
    return typeof value === "function" ? value.bind(client()) : value;
  },
});
