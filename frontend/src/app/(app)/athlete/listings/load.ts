import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import type { ApiRestriction } from "@/lib/inventory-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S3-FE-02 — what "What BTG checks" needs beyond the listing and the item,
   read as the signed-in athlete:

     GET /athletes/me        `state` — approved (APPROVED / ACTIVE) or not
     GET /restrictions       the PROHIBITED categories ("won't work with")
     GET /payouts/account    `status` — NOT_SET_UP · NEEDS_INFO · READY

   Each is best-effort: a refused or failed read leaves its row out (null),
   it never invents a tick. Shared by /athlete/listings, …/new and …/[id].
   -------------------------------------------------------------------------- */

export type SellerContext = {
  athleteState: string | null;
  displayName: string | null;
  wontPromote: string[] | null;
  payout: "NOT_SET_UP" | "NEEDS_INFO" | "READY" | null;
};

async function json<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function sellerContext(): Promise<SellerContext> {
  const [me, restrictions, payout] = await Promise.all([
    json<{ state?: string; displayName?: string }>("/athletes/me"),
    json<{ restrictions: ApiRestriction[] }>("/restrictions"),
    json<{ status?: SellerContext["payout"] }>("/payouts/account"),
  ]);
  const wont = restrictions
    ? [...new Set(restrictions.restrictions.filter((r) => r.type === "PROHIBITED").map((r) => categoryLabel(r.category as BrandCategory).toLowerCase()))]
    : null;
  return {
    athleteState: me?.state ?? null,
    displayName: me?.displayName ?? null,
    wontPromote: wont,
    payout: payout?.status ?? null,
  };
}
