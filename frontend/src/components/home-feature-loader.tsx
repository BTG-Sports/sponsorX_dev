"use client";

import { useEffect, useState } from "react";

import { HomeFeaturePanel } from "@/components/home-feature-panel";
import type { HomeFeatureStatus } from "@/lib/home-feature";
import { getHomeFeatureAction } from "@/server/home-feature-actions";

/* --------------------------------------------------------------------------
   The "Home page" section, fetched on demand — P8-FE-10.

   For client islands that open one athlete at a time: the applications
   desk's review drawer, which is the Network Manager's way to an athlete
   (BTG's athlete page, /admin/new-signups, is BTG admins' alone). It reads
   GET /athletes/{id}/home-page through a server action; when the API refuses
   (any role but BTG admin and the Network Manager) or can't be reached,
   nothing is drawn.
   -------------------------------------------------------------------------- */

export function HomeFeatureLoader({ athleteId, name }: { athleteId: string; name: string }) {
  const [status, setStatus] = useState<HomeFeatureStatus | null | "loading">("loading");

  useEffect(() => {
    let live = true;
    getHomeFeatureAction(athleteId)
      .catch(() => null)
      .then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [athleteId]);

  if (status === "loading") {
    return <p className="text-xs text-muted" aria-live="polite">Checking the home page…</p>;
  }
  return status ? <HomeFeaturePanel initial={status} name={name} /> : null;
}
