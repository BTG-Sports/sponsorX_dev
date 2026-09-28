"use server";

import { headers } from "next/headers";

import { edgeHeadersFrom } from "@/server/edge";

/* --------------------------------------------------------------------------
   P9-FE-08 — "That's me": the athlete's own claim on a FEATURED profile
   (POST /public/athletes/:slug/claim). PUBLIC, no login — the claimant is not
   anyone's user yet. The visitor's address is forwarded (P8-SEC-03) so the
   API's claim rate limit counts the visitor, not this server.

   The API never says whether the name matched the school roster — that
   answer is for the advisor, not an anonymous caller — so neither does this.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type ClaimResult = { ok: true } | { ok: false; message: string };

export async function claimProfileAction(
  slug: string,
  input: { name: string; email: string; birthDate: string },
): Promise<ClaimResult> {
  const name = typeof input?.name === "string" ? input.name.trim().slice(0, 200) : "";
  const email = typeof input?.email === "string" ? input.email.trim().slice(0, 200) : "";
  const birth = typeof input?.birthDate === "string" ? input.birthDate.trim() : "";
  if (!/^[a-z0-9-]{1,120}$/i.test(slug)) return { ok: false, message: "This profile can't be claimed." };
  if (!name) return { ok: false, message: "Your full legal name, as your school has it." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "An email we can reach you (or a parent) at." };
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return { ok: false, message: "That date of birth isn't valid." };
  try {
    const res = await fetch(`${API_URL}/api/v1/public/athletes/${encodeURIComponent(slug)}/claim`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", ...edgeHeadersFrom(await headers()) },
      body: JSON.stringify({ claimantName: name, claimantEmail: email, birthDate: birth || null }),
    });
    if (res.status === 429) return { ok: false, message: "Too many claims from here — try again in an hour." };
    if (res.status === 404) return { ok: false, message: "This profile can no longer be claimed." };
    if (!res.ok) return { ok: false, message: `Your claim didn't go through (HTTP ${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, message: "We couldn't reach SponsorX — try again in a minute." };
  }
}
