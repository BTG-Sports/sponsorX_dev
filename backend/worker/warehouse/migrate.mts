/**
 * The warehouse's own schema changes — 3S1-DATA-01.
 *
 * Plain SQL files in `worker/warehouse/migrations`, applied in name order,
 * each once, recorded in `public.warehouse_migrations`. Run at the start of
 * every ingestion, so a new file reaches the warehouse with the next run and
 * nobody has to remember a separate step. The warehouse is its own database
 * (design D2), so Prisma's migrations never touch it.
 */
import { readdirSync, readFileSync } from "node:fs";
import type pg from "pg";

const DIR = new URL("./migrations/", import.meta.url);

export async function migrateWarehouse(db: pg.ClientBase): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS public.warehouse_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ name: string }>(`SELECT name FROM public.warehouse_migrations`)).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await db.query("BEGIN");
    try {
      await db.query(readFileSync(new URL(name, DIR), "utf8"));
      await db.query(`INSERT INTO public.warehouse_migrations (name) VALUES ($1)`, [name]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    applied.push(name);
  }
  return applied;
}
