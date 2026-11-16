"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { adjustmentProblem, dollarsToCents, earningMovedLine, earningRefusal, referenceProblem, type EarningMove } from "@/lib/earning-actions";

/* POL-FE-53 (app review B2) — Finance approves, holds, releases, pays and
   adjusts a campaign earning (POST /earnings/:id/transition, /adjustment).
   The API decides who may and which move is legal. */

type Result = { ok: boolean; message: string };
const valid = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
const MOVES: EarningMove["to"][] = ["APPROVED_FOR_PAYOUT", "PAID", "HELD", "ELIGIBLE"];

async function post(path: string, body: unknown, ok: string): Promise<Result> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now. Nothing changed — try again in a minute." };
  }
  if (!res.ok) return { ok: false, message: earningRefusal(res.status, await res.json().catch(() => null)) };
  revalidatePath("/finance");
  revalidatePath("/admin/finance");
  return { ok: true, message: ok };
}

export async function moveEarningAction(id: string, to: EarningMove["to"], reference?: string): Promise<Result> {
  if (!valid(id) || !MOVES.includes(to)) return { ok: false, message: "That move isn't offered here." };
  if (to === "PAID") {
    const problem = referenceProblem(reference ?? "");
    if (problem) return { ok: false, message: problem };
  }
  return post(`/earnings/${encodeURIComponent(id)}/transition`, { to, ...(to === "PAID" ? { reference: (reference ?? "").trim() } : {}) }, earningMovedLine(to));
}

export async function adjustEarningAction(id: string, amount: string, reason: string): Promise<Result> {
  if (!valid(id)) return { ok: false, message: "That earning isn't offered here." };
  const problem = adjustmentProblem(amount, reason);
  if (problem) return { ok: false, message: problem };
  return post(`/earnings/${encodeURIComponent(id)}/adjustment`, { adjustment: dollarsToCents(amount), reason: reason.trim() }, "Adjustment recorded.");
}
