/**
 * Build the analytical model from the raw copies — 3S1-DATA-02
 * (documentation/SponsorX-Warehouse-Schema.md §4–§7).
 *
 * The SQL files in `transforms/`, in name order, inside ONE transaction: the
 * model is either rebuilt whole or left as it was, so a reader never sees a
 * fact without its dimensions. Run after every ingestion (user, 2026-10-13:
 * "right after each hourly copy"); the whole model is rebuilt each time while
 * the data is small. Keys are computed from each row's own identity (dw.k),
 * so a rebuild on unchanged data produces the same rows.
 */
import { readdirSync, readFileSync } from "node:fs";
import type pg from "pg";

const DIR = new URL("./transforms/", import.meta.url);
const TABLES = ["dim_sponsor", "dim_property", "dim_athlete", "dim_campaign", "dim_inventory", "dim_market",
  "fact_campaign_daily", "fact_marketplace_order_line", "snap_ledger_daily", "snap_payment_status_daily"] as const;

export async function buildWarehouse(db: pg.ClientBase): Promise<Record<string, number>> {
  await db.query("BEGIN");
  try {
    for (const name of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(new URL(name, DIR), "utf8"));
    }
    const counts: Record<string, number> = {};
    for (const t of TABLES) counts[t] = Number((await db.query(`SELECT count(*) AS n FROM dw.${t}`)).rows[0].n);
    await db.query("COMMIT");
    return counts;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
