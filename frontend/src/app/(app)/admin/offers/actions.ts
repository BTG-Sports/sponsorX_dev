"use server";

import { revalidatePath } from "next/cache";

import {
  checksQuery, offerRefusal, type ApiOfferAthlete, type ApiOfferChecks, type OfferBody,
} from "@/lib/admin-offers-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S2-FE-03 (BTG half) — the Offers desk's calls. The API applies the matrix
   (offer write: BTG admins and campaign managers, own tenant) and every rule;
   these only carry the request and say a refusal in BTG's words.

     POST  /offers                                       create a DRAFT
     PATCH /offers/:id                                   edit a DRAFT
     POST  /offers/:id/send | /withdraw | /revise
     POST  /offers/:id/change-requests/:requestId/keep   { note }
     GET   /offers/athletes?q=                           the athlete picker
     GET   /inventory                                    the athlete's items
     GET   /campaigns/:id/offer-checks?…                 the live checks
   -------------------------------------------------------------------------- */

export type DeskWrite = { ok: true; id: string } | { ok: false; message: string };

const PATH = "/admin/offers";
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

const enc = encodeURIComponent;
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 200;

function settle(id: string) {
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
}

/** Save a new draft. */
export async function createOfferAction(body: OfferBody): Promise<DeskWrite> {
  const r = await call("/offers", { method: "POST", body: JSON.stringify(body) });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: offerRefusal(r.res.status, r.body, "The draft wasn't saved") };
  const id = String((r.body as { id?: unknown } | null)?.id ?? "");
  settle(id);
  return { ok: true, id };
}

/** Save an edit to a draft — every term but the campaign and the athlete. */
export async function updateOfferAction(id: string, body: OfferBody): Promise<DeskWrite> {
  if (!okId(id)) return { ok: false, message: "Unknown offer." };
  const { campaignId: _c, athleteId: _a, ...patch } = body;
  void _c;
  void _a;
  const r = await call(`/offers/${enc(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!r) return { ok: false, message: unreachable };
  settle(id);
  return r.res.ok ? { ok: true, id } : { ok: false, message: offerRefusal(r.res.status, r.body, "The draft wasn't saved") };
}

/** Send a draft: its terms are fixed from here and the athlete (or guardian) is emailed. */
export async function sendOfferAction(id: string): Promise<DeskWrite> {
  if (!okId(id)) return { ok: false, message: "Unknown offer." };
  const r = await call(`/offers/${enc(id)}/send`, { method: "POST" });
  if (!r) return { ok: false, message: unreachable };
  settle(id);
  return r.res.ok ? { ok: true, id } : { ok: false, message: offerRefusal(r.res.status, r.body, "The offer wasn't sent") };
}

export async function withdrawOfferAction(id: string): Promise<DeskWrite> {
  if (!okId(id)) return { ok: false, message: "Unknown offer." };
  const r = await call(`/offers/${enc(id)}/withdraw`, { method: "POST" });
  if (!r) return { ok: false, message: unreachable };
  settle(id);
  return r.res.ok ? { ok: true, id } : { ok: false, message: offerRefusal(r.res.status, r.body, "The offer wasn't withdrawn") };
}

/** Withdraw a sent offer and copy it into a new draft — `id` is the draft's. */
export async function reviseOfferAction(id: string): Promise<DeskWrite> {
  if (!okId(id)) return { ok: false, message: "Unknown offer." };
  const r = await call(`/offers/${enc(id)}/revise`, { method: "POST" });
  if (!r) return { ok: false, message: unreachable };
  settle(id);
  if (!r.res.ok) return { ok: false, message: offerRefusal(r.res.status, r.body, "The offer wasn't revised") };
  const draft = String((r.body as { draft?: { id?: unknown } } | null)?.draft?.id ?? "");
  revalidatePath(`${PATH}/${draft}`);
  return { ok: true, id: draft };
}

/**
 * Keep the offer as it is: BTG's reply answers every change request still
 * open on it (usually one), and is emailed to the athlete with each.
 */
export async function keepOfferAction(id: string, requestIds: string[], note: string): Promise<DeskWrite> {
  if (!okId(id) || !Array.isArray(requestIds) || !requestIds.length || !requestIds.every(okId)) return { ok: false, message: "Unknown change request." };
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, message: "Write a reply — the athlete is emailed it exactly as written." };
  if (text.length > 2000) return { ok: false, message: "A reply is at most 2,000 characters." };
  for (const requestId of requestIds) {
    const r = await call(`/offers/${enc(id)}/change-requests/${enc(requestId)}/keep`, { method: "POST", body: JSON.stringify({ note: text }) });
    if (!r) return { ok: false, message: unreachable };
    if (!r.res.ok) {
      settle(id);
      return { ok: false, message: offerRefusal(r.res.status, r.body, "The reply wasn't sent") };
    }
  }
  settle(id);
  return { ok: true, id };
}

/* ------------------------------------------------------- the form's reads */

export async function searchOfferAthletesAction(q: string): Promise<{ ok: true; athletes: ApiOfferAthlete[] } | { ok: false; message: string }> {
  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const r = await call(`/offers/athletes${term ? `?q=${enc(term)}` : ""}`, { method: "GET" });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: offerRefusal(r.res.status, r.body, "Athletes couldn't be searched") };
  return { ok: true, athletes: ((r.body as { athletes?: ApiOfferAthlete[] } | null)?.athletes ?? []) };
}

export type ItemOption = { id: string; title: string; priceCents: number; jobId: string | null };

/** The athlete's own active inventory items — GET /inventory, narrowed to them. */
export async function athleteItemsAction(athleteId: string): Promise<{ ok: true; items: ItemOption[] } | { ok: false; message: string }> {
  if (!okId(athleteId)) return { ok: true, items: [] };
  const r = await call("/inventory", { method: "GET" });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: offerRefusal(r.res.status, r.body, "The athlete's inventory couldn't be read") };
  const items = ((r.body as { items?: Array<ItemOption & { athleteId: string | null; active: boolean }> } | null)?.items ?? [])
    .filter((i) => i.athleteId === athleteId && i.active)
    .map((i) => ({ id: i.id, title: i.title, priceCents: i.priceCents, jobId: i.jobId ?? null }));
  return { ok: true, items };
}

export async function offerChecksAction(
  campaignId: string,
  f: { athleteId?: string | null; jobId?: string | null; inventoryItemId?: string | null; compensation?: number | null; sellPrice?: number | null },
): Promise<{ ok: true; checks: ApiOfferChecks } | { ok: false; message: string }> {
  if (!okId(campaignId)) return { ok: false, message: "Pick a campaign." };
  const q = checksQuery(f);
  const r = await call(`/campaigns/${enc(campaignId)}/offer-checks${q ? `?${q}` : ""}`, { method: "GET" });
  if (!r) return { ok: false, message: unreachable };
  if (!r.res.ok) return { ok: false, message: offerRefusal(r.res.status, r.body, "The checks couldn't run") };
  return { ok: true, checks: r.body as ApiOfferChecks };
}

