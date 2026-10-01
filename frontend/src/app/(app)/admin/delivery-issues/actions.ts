"use server";

import { revalidatePath } from "next/cache";

import { deskRefusal } from "@/lib/delivery-issues-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S4-FE-04 (BTG half) — the Delivery issues desk's writes (BTG admin; the
   API applies the matrix — orderDelivery approve — and sends the emails):

     POST /delivery-issues/:lineId/resolve  { decision: CONFIRM | REFUND, note }
     POST /delivery-issues/:lineId/remind   the seller and the team's manager
     GET  /deliveries/:lineId/proof         a 5-minute audited link to the photo
   -------------------------------------------------------------------------- */

export type DeskWrite = { ok: true } | { ok: false; message: string };

const PATH = "/admin/delivery-issues";
const unreachable = "The API is unreachable — nothing changed. Try again in a minute.";

async function call(path: string, init: RequestInit): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    return { res, body };
  } catch {
    return null;
  }
}

export async function resolveIssueAction(lineId: string, decision: "CONFIRM" | "REFUND", note: string): Promise<DeskWrite> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  if (decision !== "CONFIRM" && decision !== "REFUND") return { ok: false, message: "Choose confirm or refund." };
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, message: "Add a note — the sponsor and the seller both read it." };
  const r = await call(`/delivery-issues/${encodeURIComponent(lineId)}/resolve`, { method: "POST", body: JSON.stringify({ decision, note: text.slice(0, 2000) }) });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${lineId}`);
  return r.res.ok ? { ok: true } : { ok: false, message: deskRefusal(r.res.status, r.body, "The decision wasn't saved") };
}

export async function remindSellerAction(lineId: string): Promise<DeskWrite> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const r = await call(`/delivery-issues/${encodeURIComponent(lineId)}/remind`, { method: "POST" });
  if (!r) return { ok: false, message: unreachable };
  revalidatePath(PATH);
  return r.res.ok ? { ok: true } : { ok: false, message: deskRefusal(r.res.status, r.body, "The reminder wasn't sent") };
}

export async function proofLinkAction(lineId: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (typeof lineId !== "string" || !lineId) return { ok: false, message: "Unknown order line." };
  const r = await call(`/deliveries/${encodeURIComponent(lineId)}/proof`, { method: "GET" });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: deskRefusal(r.res.status, r.body, "The photo couldn't be opened") };
  return { ok: true, url: String((r.body as { url?: unknown } | null)?.url ?? "") };
}
