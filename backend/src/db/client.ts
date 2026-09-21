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

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
