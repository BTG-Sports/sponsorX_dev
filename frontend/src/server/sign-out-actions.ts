"use server";

import { cookies } from "next/headers";

import { WARD_COOKIE } from "@/server/api";

/* --------------------------------------------------------------------------
   2S8-SEC-02 — what signing out clears on OUR side. Clerk's signOut() ends
   the session; this drops the cookies SponsorX itself set for that person
   (today: which minor a guardian is acting for), so the next person on a
   shared device starts clean. Called by the portal user menu before
   signOut().
   -------------------------------------------------------------------------- */

export async function clearSessionCookiesAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(WARD_COOKIE);
}
