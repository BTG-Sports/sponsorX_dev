"use server";

import { dashboardLink, type DashboardLink } from "@/lib/dashboard-link";

import { fetchActor } from "./api";
import { portalFor } from "./portal";

/* --------------------------------------------------------------------------
   Where the signed-in visitor's dashboard is — for the public site's
   Login / Get Started buttons (components/my-dashboard.tsx). A server action
   rather than a server render, so the landing page stays static: only a
   visitor Clerk already says is signed in ever calls it.

   The same answer /portal acts on: the Clerk session (an expired one is
   anonymous) and the Postgres roles behind GET /me. Anything short of a
   linked account — signed out, expired, unprovisioned, or the API down —
   is null, and the buttons stay Login / Get Started.
   -------------------------------------------------------------------------- */

export async function myDashboard(): Promise<DashboardLink | null> {
  const result = await fetchActor().catch(() => null);
  if (!result || result.status !== "linked") return null;
  return dashboardLink(portalFor(result.actor.roles), result.actor.roles);
}
