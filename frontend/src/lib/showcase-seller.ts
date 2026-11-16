import type { ShowcaseSeller } from "@/components/athlete-inventory/item-showcase";
import type { ApiMyProfile } from "./profile-live";
import { reach, type PublicAthlete } from "./public-athlete";

/* --------------------------------------------------------------------------
   POL-FE-83 / POL-FE-85 — "Offered by" and "Who you're working with" on an
   item's sponsor-facing showcase, from the athlete's own profile
   (GET /athletes/me) and, once live, the public answer sponsors get
   (GET /public/athletes/:slug). Shared by /athlete/inventory/[id] and
   /athlete/listings/[id]. Null without a profile; reach and track record
   left out when the public read is missing — never a guess.
   -------------------------------------------------------------------------- */

export function showcaseSeller(me: ApiMyProfile | null, pub: PublicAthlete | null): ShowcaseSeller | null {
  if (!me) return null;
  const r = pub ? reach(pub.socials) : null;
  return {
    name: me.displayName,
    roleLine: [me.position, me.sport].filter(Boolean).join(" · "),
    school: me.school,
    place: [me.city, me.stateCode].filter(Boolean).join(", ") || null,
    photoUrl: pub?.photoUrl ?? me.photoUrl ?? null,
    live: me.state === "ACTIVE",
    reach: r && r.total > 0 ? { total: r.total, verified: r.allVerified } : null,
    track: pub?.track ? { campaigns: pub.track.campaignsCompleted, postsLive: pub.track.postsLive, brands: pub.track.brands } : null,
  };
}
