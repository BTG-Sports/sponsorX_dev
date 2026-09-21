import { redirect } from "next/navigation";

/* Statically this route would prerender as a 1-second meta refresh; dynamic
   makes it an instant 307. */
export const dynamic = "force-dynamic";

/* The Reward Creator (§9 screen 10) now runs as a modal over the rewards
   list, not a page of its own (2026-09-16). This route survives so the nav
   history, the campaign builder's "Design the full reward" link and any saved
   bookmarks keep working — ?new=1 opens the creator on load. */

export default function RewardCreatorRedirect() {
  redirect("/admin/rewards?new=1");
}
