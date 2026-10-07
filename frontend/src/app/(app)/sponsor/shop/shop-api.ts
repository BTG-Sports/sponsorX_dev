import { apiFetch } from "@/server/api";
import { refusalFrom } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — the one write path the shop, cart, checkout and order
   server actions share. It adds no authority: the sponsor's own Clerk token
   is forwarded and the API applies the matrix (cart / reservation /
   marketplaceOrder write — SPONSOR_ADMIN only; an analyst gets a 403, said
   plainly). A refusal comes back as a message plus EVERY reason the API gave,
   and an unreachable API as "nothing changed", never as a thrown error that
   would lose what the buyer typed.
   -------------------------------------------------------------------------- */

export type WriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; reasons: string[];
      /** The API's `error.code` when it sent one (2S5-FE-11 reads "busy" on a 503). Undefined otherwise. */
      code?: string };

export async function shopWrite<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  /** Extra headers — checkout's place-order forwards the signer's evidence (2S4-FE-02). */
  headers?: Record<string, string>,
): Promise<WriteResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(headers ? { headers } : {}) });
  } catch {
    return { ok: false, status: 0, message: "The API is unreachable — nothing changed. Try again in a minute.", reasons: [] };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (res.ok) return { ok: true, data: parsed as T };
  const code = (parsed as { error?: { code?: unknown } } | null)?.error?.code;
  return { ok: false, status: res.status, ...refusalFrom(res.status, parsed), ...(typeof code === "string" ? { code } : {}) };
}
