import { apiFetch, fetchActor } from "@/server/api";
import type { ApiPointsRead, ApiSalesRead, ApiStudent, ProspectSummary } from "@/lib/students-live";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   P9-FE-01 / -10 — the student portal's live read. A signed-in STUDENT reads
   their own record and its code, sales, prospects and points by the
   studentId /me returns (their own link, matrix §15.2 `own`). BTG admins
   previewing the portal are not a student, so they keep the fixture screens.
   An outage throws to the error boundary; a refused part is null, shown as
   such.

   Every list part is read SERVER-PAGED (2026-09-29): the caller passes the
   API query for the page it shows; without one it asks for a single row
   (`TOTALS_ONLY`) — enough for the home tiles, whose figures are the API's
   database sums and counts (totalCents, balance, page.total, the prospect
   state counts), never a fold over every row.
   -------------------------------------------------------------------------- */

export type ApiStudentProspect = {
  id: string;
  businessName: string;
  category: string;
  state: "SUBMITTED" | "ACCEPTED" | "REJECTED";
  reasonCode: string | null;
  redirectCategories: string[];
  decidedAt: string | null;
  createdAt: string;
};

export type LiveStudent =
  | { kind: "unlinked" }
  | {
      kind: "student";
      student: ApiStudent;
      code: string | null;
      sales: (ApiSalesRead & { page: PageInfo }) | null;
      points: (ApiPointsRead & { page: PageInfo }) | null;
      prospects: { prospects: ApiStudentProspect[]; page: PageInfo; summary: ProspectSummary } | null;
    };

type Part = "code" | "sales" | "points" | "prospects";
type ListPart = Exclude<Part, "code">;

/** One row: the sums and counts ride along with any page. */
export const TOTALS_ONLY = "?page=1&size=1";

async function part<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

export async function liveStudent(parts: Part[] = [], queries: Partial<Record<ListPart, string>> = {}): Promise<LiveStudent | null> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.roles.includes("STUDENT")) return null;
  const id = who.actor.studentId;
  if (!id) return { kind: "unlinked" };
  const base = `/students/${encodeURIComponent(id)}`;
  const want = (p: Part) => parts.includes(p);
  const [student, code, sales, points, prospects] = await Promise.all([
    part<ApiStudent>(base),
    want("code") ? part<{ code: string | null }>(`${base}/code`) : null,
    want("sales") ? part<Extract<LiveStudent, { kind: "student" }>["sales"]>(`${base}/sales${queries.sales ?? TOTALS_ONLY}`) : null,
    want("points") ? part<Extract<LiveStudent, { kind: "student" }>["points"]>(`${base}/points${queries.points ?? TOTALS_ONLY}`) : null,
    want("prospects") ? part<Extract<LiveStudent, { kind: "student" }>["prospects"]>(`${base}/prospects${queries.prospects ?? TOTALS_ONLY}`) : null,
  ]);
  if (!student) return { kind: "unlinked" };
  return {
    kind: "student",
    student,
    code: code?.code ?? null,
    sales,
    points,
    prospects,
  };
}

/** This deployment's origin, for links a student hands out (/s/[code]). */
export async function requestOrigin(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
