/**
 * The Prisma client — backend copy, same construction as
 * frontend/src/server/db.ts and for the same reasons.
 *
 * Prisma 7 takes no connection URL in schema.prisma; the client is built with
 * the `PrismaPg` driver adapter, which owns a `pg` pool fed from DATABASE_URL.
 * One URL, no pooled/direct split — Railway Postgres is a direct connection.
 * If pgbouncer ever fronts it, reintroduce DIRECT_URL for `prisma migrate`
 * and keep the pooled URL here.
 *
 * The global singleton survives tsx watch-mode reloads, which would otherwise
 * leak a pg pool per restart.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

/**
 * 2S8-OPS-02 — every session the API opens runs in UTC, whatever the
 * database's own setting. Timestamp columns hold UTC as `timestamp without
 * time zone`, so a column default of CURRENT_TIMESTAMP (or any bare `now()`)
 * writes the SESSION's wall-clock time. The database is pinned to UTC too
 * (migration 20261005100000); this makes the API right even on one that is not.
 */
const UTC_SESSION = "-c TimeZone=UTC";

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, options: UTC_SESSION });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
