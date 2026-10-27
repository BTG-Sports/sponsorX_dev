/* --------------------------------------------------------------------------
   BTG's controls for the home page's Featured athletes panel — P8-FE-10, on
   GET / POST /athletes/{id}/home-page (P8-BE-08).

   The backend decides who is listed: active, all twelve public profile
   fields filled (photo included), a minor only once BTG approves (no age on
   file counts as a minor), never one BTG removed — then pinned athletes
   first and at most four. This file turns its answer into words for BTG's
   athlete page: whether the athlete is on the panel now, and if not, every
   reason, naming the missing fields; and which buttons apply.

   Pure, so the panel and its tests share it.
   -------------------------------------------------------------------------- */

/** As HOME_REQUIRED in backend domain/home-featured-rules.ts, in its order. */
export const HOME_FIELDS = [
  "photo", "displayName", "sport", "position", "level", "school", "city", "state",
  "achievements", "contentCapabilities", "brandInterests", "socialFollowers",
] as const;
export type HomeField = (typeof HOME_FIELDS)[number];
export type HomeBlock = "not_active" | "incomplete" | "minor_not_approved" | "removed";
export type HomeAction = "pin" | "unpin" | "remove" | "restore" | "approve" | "unapprove";

/** The API's `HomeFeatureStatus`. */
export type HomeFeatureStatus = {
  athleteId: string;
  onHomePage: boolean;
  eligible: boolean;
  blocks: HomeBlock[];
  missing: HomeField[];
  minor: boolean;
  pinned: boolean;
  removed: boolean;
  approved: boolean;
  photoUrl: string | null;
};

const FIELD_WORDS: Record<HomeField, string> = {
  photo: "photo",
  displayName: "display name",
  sport: "sport",
  position: "position",
  level: "level",
  school: "school",
  city: "city",
  state: "state",
  achievements: "achievements",
  contentCapabilities: "content they can make",
  brandInterests: "brand interests",
  socialFollowers: "a social account with followers",
};

/** "Missing: photo, school" — the fields, in the API's order. */
export function missingLine(missing: readonly HomeField[]): string {
  const words = HOME_FIELDS.filter((f) => missing.includes(f)).map((f) => FIELD_WORDS[f]);
  return words.length ? `Missing: ${words.join(", ")}` : "";
}

/** Every reason the athlete is off the panel, in plain words. */
export function blockLines(s: Pick<HomeFeatureStatus, "blocks" | "missing">): string[] {
  const lines: string[] = [];
  if (s.blocks.includes("removed")) lines.push("Removed from the home page by BTG");
  if (s.blocks.includes("not_active")) lines.push("Not an active athlete");
  if (s.blocks.includes("incomplete")) lines.push(missingLine(s.missing) || "Profile incomplete");
  /* The API counts no age on file as a minor; say so rather than claim they are under 18. */
  if (s.blocks.includes("minor_not_approved")) lines.push("Under 18 or no age on file — waiting for approval");
  return lines;
}

export type HomeHeadline = { tone: "accent" | "neutral" | "warn"; label: string; hint: string };

/** Where the athlete stands, one line. */
export function homeHeadline(s: HomeFeatureStatus): HomeHeadline {
  if (s.onHomePage) {
    return { tone: "accent", label: s.pinned ? "On the home page · pinned" : "On the home page", hint: "Shown in the Featured athletes panel now." };
  }
  if (s.eligible) {
    return {
      tone: "neutral",
      label: "Qualifies · not in the top four",
      hint: "The panel shows four: pinned athletes first, then the latest verified post. Pin this athlete to show them.",
    };
  }
  return { tone: "warn", label: "Not on the home page", hint: blockLines(s).join(" · ") };
}

export type HomeButton = { action: HomeAction; label: string; disabled?: string };

/** The buttons that apply now. Approval is only for a minor (or no age on file). */
export function homeButtons(s: HomeFeatureStatus): HomeButton[] {
  const out: HomeButton[] = [];
  out.push(
    s.pinned
      ? { action: "unpin", label: "Unpin" }
      : { action: "pin", label: "Pin to home page", ...(s.removed ? { disabled: "Restore this athlete first." } : {}) },
  );
  out.push(s.removed ? { action: "restore", label: "Restore" } : { action: "remove", label: "Remove from home page" });
  if (s.minor) out.push(s.approved ? { action: "unapprove", label: "Withdraw approval" } : { action: "approve", label: "Approve for home page" });
  return out;
}

/** What BTG is told after a button. */
export const DONE_WORDS: Record<HomeAction, string> = {
  pin: "Pinned. Pinned athletes show first.",
  unpin: "Unpinned.",
  remove: "Removed from the home page. They stay off until restored.",
  restore: "Restored. They show again when they qualify.",
  approve: "Approved for the home page.",
  unapprove: "Approval withdrawn. They're off the home page until approved again.",
};
