"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { WARD_COOKIE, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 — which of a guardian's minors the athlete portal acts for
   (2S1-BE-11). The choice is a cookie this server reads and forwards to the
   API as `x-sponsorx-ward`; the API decides whether it is really theirs —
   a ward that isn't means no ward at all, never another child. Checked here
   against the guardian's own list too, so a stale choice is simply cleared.
   -------------------------------------------------------------------------- */

export async function chooseWardAction(athleteId: string): Promise<{ ok: boolean }> {
  if (typeof athleteId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(athleteId)) return { ok: false };
  const me = await fetchActor();
  const wards = me.status === "linked" ? me.actor.wards ?? [] : [];
  const jar = await cookies();
  if (!wards.some((w) => w.athleteId === athleteId)) {
    jar.delete(WARD_COOKIE);
    return { ok: false };
  }
  jar.set(WARD_COOKIE, athleteId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
  revalidatePath("/athlete", "layout");
  return { ok: true };
}
