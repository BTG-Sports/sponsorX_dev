import { apiFetch, fetchActor } from "@/server/api";
import type { ApiEdition } from "@/lib/editions-live";
import { pickEdition } from "@/lib/editions-live";

/* --------------------------------------------------------------------------
   The NEXT admin screens' shared live read (P9-FE-03, -04, -05): the
   editions in the caller's scope and the one the screen opens on (?edition=).
   null → the screen keeps its fixtures (not signed in, or a role outside the
   NEXT desk). Anything else the API says is thrown to the error boundary —
   an outage is never dressed as an empty edition.
   -------------------------------------------------------------------------- */

export const NEXT_DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "FINANCE", "ADVISOR", "STUDENT"];

export type LiveEditions = {
  roles: string[];
  editions: ApiEdition[];
  current: ApiEdition | null;
  /** The API refused the edition list for this role (matrix §15.3). */
  refused: boolean;
};

export async function liveEditions(wanted: string | undefined, roles = NEXT_DESK_ROLES): Promise<LiveEditions | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => roles.includes(r))) return null;
  const res = await apiFetch("/editions");
  /* SALES and FINANCE hold no edition read in the matrix (§15.3) — FINANCE
     reads splits and SALES sells slots, but neither can list an edition.
     Flagged, not worked around: a 403 here is "outside your scope", shown
     as such, never an outage. */
  if (res.status === 403) return { roles: who.actor.roles, editions: [], current: null, refused: true };
  if (!res.ok) throw new Error(`Editions unavailable (${res.status}).`);
  const { editions } = (await res.json()) as { editions: ApiEdition[] };
  return { roles: who.actor.roles, editions, current: pickEdition(editions, wanted), refused: false };
}

/** The request's clock, read once in a server module so render stays pure. */
export function requestTime(): number {
  return Date.now();
}

export async function readJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const res = await apiFetch(path);
  if (res.status === 403) return { status: 403, body: null };
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return { status: res.status, body: (await res.json()) as T };
}

/** Empty-state copy when there is no edition to open. */
export function noEditionHint(live: LiveEditions, fallback: string): { title: string; hint: string } {
  return live.refused
    ? {
        title: "Editions are outside your role's scope",
        hint: "The RBAC matrix (§15.3) gives edition reads to BTG admin, advisors and students — ask BTG admin to open this screen.",
      }
    : { title: "No edition yet", hint: fallback };
}
