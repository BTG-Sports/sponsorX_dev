/**
 * The virtual world vocabulary and its rules — 4S1-BE-01/02
 * (documentation/SponsorX-Virtual-Taxonomy.md, SponsorX-Virtual-Registry.md).
 * Pure: no database, so the registry, its routes and tests share one source.
 */

export const ENVIRONMENTS = ["STAGING", "PRODUCTION"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const ZONE_LEVELS = ["DISTRICT", "VENUE", "ZONE"] as const;
export type ZoneLevel = (typeof ZONE_LEVELS)[number];

export const PLACEMENT_KINDS = ["BILLBOARD", "LED_SCREEN", "NAMING_RIGHTS", "BRANDED_ROOM", "COURT", "TUNNEL", "KIOSK"] as const;
export type PlacementKind = (typeof PLACEMENT_KINDS)[number];

export const CREATIVE_TYPES = ["IMAGE", "VIDEO", "LOGO"] as const;
export type CreativeType = (typeof CREATIVE_TYPES)[number];

/** The inventory kind a sellable placement becomes (4S1-BE-03). Not one an owner can pick: SponsorX makes it. */
export const VIRTUAL_PLACEMENT_KIND = "VIRTUAL_PLACEMENT";

/** An external ID: the world owner's, 1–64 letters, digits, `.` `_` `-` (World Contract §3). */
export const EXTERNAL_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** The creative each kind may take (Taxonomy §3). */
export const KIND_CREATIVE: Record<PlacementKind, readonly CreativeType[]> = {
  BILLBOARD: ["IMAGE"],
  LED_SCREEN: ["IMAGE", "VIDEO"],
  NAMING_RIGHTS: ["LOGO"],
  BRANDED_ROOM: ["IMAGE"],
  COURT: ["LOGO", "IMAGE"],
  TUNNEL: ["IMAGE", "VIDEO"],
  KIOSK: ["IMAGE"],
};

/**
 * What counts as "seen", versioned (`@1`). The rule engine that applies them
 * to telemetry is 4S5-BE-01; a placement names its rule from the start so its
 * sales say what they promised.
 */
export const VIEWABILITY_RULES: Record<string, { minVisiblePct: number; minDwellMs: number; label: string }> = {
  "display-50pct-1s@1": { minVisiblePct: 50, minDwellMs: 1000, label: "Half of it on screen for 1 second" },
  "video-50pct-2s@1": { minVisiblePct: 50, minDwellMs: 2000, label: "Half of it on screen for 2 seconds" },
  "naming-any-1s@1": { minVisiblePct: 1, minDwellMs: 1000, label: "Any of it on screen for 1 second" },
};

/** The rule a kind gets when none is given. */
export const DEFAULT_RULE: Record<PlacementKind, string> = {
  BILLBOARD: "display-50pct-1s@1",
  LED_SCREEN: "video-50pct-2s@1",
  NAMING_RIGHTS: "naming-any-1s@1",
  BRANDED_ROOM: "display-50pct-1s@1",
  COURT: "display-50pct-1s@1",
  TUNNEL: "video-50pct-2s@1",
  KIOSK: "display-50pct-1s@1",
};

/** A level's allowed parents; null is the world itself (Taxonomy §1). */
export const ALLOWED_PARENTS: Record<ZoneLevel, ReadonlyArray<ZoneLevel | null>> = {
  DISTRICT: [null],
  VENUE: [null, "DISTRICT"],
  ZONE: [null, "DISTRICT", "VENUE"],
};

export const LIMITS = {
  px: { min: 16, max: 16_384 },
  bytes: { min: 1_024, max: 200 * 1024 * 1024 },
  videoSeconds: { min: 1, max: 300 },
  capacity: { min: 1, max: 20 },
  priceCents: { min: 100, max: 100_000_000 },
} as const;

export type PlacementSpec = {
  kind: PlacementKind;
  widthPx: number;
  heightPx: number;
  creativeTypes: CreativeType[];
  maxBytes: number;
  maxVideoSeconds?: number | null;
  capacity?: number;
  viewabilityRule?: string;
  rackPriceCents: number;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
};

const between = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max;

/** Everything wrong with a placement's spec, in plain words; empty when it is fine. */
export function placementProblems(p: PlacementSpec): string[] {
  const out: string[] = [];
  const allowed = KIND_CREATIVE[p.kind];
  if (!allowed) return [`"${p.kind}" is not a placement kind.`];
  if (!between(p.widthPx, LIMITS.px) || !between(p.heightPx, LIMITS.px)) out.push(`Width and height are whole pixels, ${LIMITS.px.min} to ${LIMITS.px.max}.`);
  if (!p.creativeTypes.length) out.push("Name at least one creative type.");
  const wrong = p.creativeTypes.filter((t) => !allowed.includes(t));
  if (wrong.length) out.push(`A ${p.kind.toLowerCase().replace(/_/g, " ")} takes ${allowed.join(" or ")}, not ${wrong.join(", ")}.`);
  if (new Set(p.creativeTypes).size !== p.creativeTypes.length) out.push("Each creative type once.");
  if (!between(p.maxBytes, LIMITS.bytes)) out.push("The largest file is 1 KB to 200 MB.");
  const video = p.creativeTypes.includes("VIDEO");
  if (video && (p.maxVideoSeconds == null || !between(p.maxVideoSeconds, LIMITS.videoSeconds))) out.push("A placement that takes video says its longest video, 1 to 300 seconds.");
  if (!video && p.maxVideoSeconds != null) out.push("Only a placement that takes video has a longest video.");
  if (p.capacity !== undefined && !between(p.capacity, LIMITS.capacity)) out.push(`Capacity is ${LIMITS.capacity.min} to ${LIMITS.capacity.max} sponsors at once.`);
  if (p.viewabilityRule !== undefined && !VIEWABILITY_RULES[p.viewabilityRule]) out.push(`No viewability rule "${p.viewabilityRule}". Available: ${Object.keys(VIEWABILITY_RULES).join(", ")}.`);
  if (!between(p.rackPriceCents, LIMITS.priceCents)) out.push("The list price per week is $1 to $1,000,000, in cents.");
  if (p.availableFrom && p.availableUntil && p.availableUntil <= p.availableFrom) out.push("Available until comes after available from.");
  return out;
}

/** Why a zone may not sit under this parent, or null when it may. */
export function nestingProblem(level: ZoneLevel, parentLevel: ZoneLevel | null): string | null {
  return ALLOWED_PARENTS[level].includes(parentLevel)
    ? null
    : `A ${level.toLowerCase()} sits under ${ALLOWED_PARENTS[level].map((l) => (l ? `a ${l.toLowerCase()}` : "the world")).join(" or ")}, not ${parentLevel ? `a ${parentLevel.toLowerCase()}` : "the world"}.`;
}

/** Why a placement may not go on sale yet, in plain words; empty when it may (4S1-BE-03). */
export function publishProblems(p: { state: string; worldStatus: string; environment: string; zoneStatus: string | null; propertyApproved: boolean }): string[] {
  const out: string[] = [];
  if (p.state !== "DRAFT") out.push(p.state === "AVAILABLE" ? "It is already on sale." : "A retired placement cannot go on sale again.");
  if (p.environment !== "PRODUCTION") out.push("Only a production world's placements are sold; staging is for testing.");
  if (p.worldStatus !== "ACTIVE") out.push("Its world is retired.");
  if (p.zoneStatus && p.zoneStatus !== "ACTIVE") out.push("Its zone is retired.");
  if (!p.propertyApproved) out.push("The world's owner has not been approved to sell yet (onboarding).");
  return out;
}

/** The inventory item's description: the specs a buyer needs, in one line. */
export function specLine(p: { kind: string; widthPx: number; heightPx: number; creativeTypes: string[]; maxVideoSeconds: number | null; capacity: number; viewabilityRule: string }): string {
  const rule = VIEWABILITY_RULES[p.viewabilityRule]?.label ?? p.viewabilityRule;
  return [
    `${p.kind.toLowerCase().replace(/_/g, " ")}, ${p.widthPx}×${p.heightPx} px`,
    `takes ${p.creativeTypes.map((t) => t.toLowerCase()).join(" or ")}${p.maxVideoSeconds ? ` (video up to ${p.maxVideoSeconds} s)` : ""}`,
    `${p.capacity === 1 ? "one sponsor at a time" : `${p.capacity} sponsors at a time`}`,
    `counted as seen: ${rule.toLowerCase()}`,
  ].join("; ") + ".";
}

/* ───────────────────────────── booking windows (4S1-BE-04) ───────────────────────────── */

const DAY_MS = 86_400_000;
export const BOOKING_DAYS = { min: 1, max: 365 } as const;

const midnight = (d: Date) => d.getTime() % DAY_MS === 0;
export const daysIn = (startsAt: Date, endsAt: Date) => Math.round((endsAt.getTime() - startsAt.getTime()) / DAY_MS);

/** The price frozen onto a window: the list price is per week, so it is the weekly price × days ÷ 7, to the cent. */
export const windowPrice = (rackPriceCentsPerWeek: number, days: number) => Math.max(1, Math.round((rackPriceCentsPerWeek * days) / 7));

/** Everything that stops this booking, in plain words; empty when it may be booked (the overlap itself is the database's). */
export function bookingProblems(b: {
  startsAt: Date; endsAt: Date;
  placement: { state: string; availableFrom: Date | null; availableUntil: Date | null };
  campaign: { state: string; startDate: Date; endDate: Date };
}): string[] {
  const out: string[] = [];
  if (!midnight(b.startsAt) || !midnight(b.endsAt)) out.push("A window is whole days: it starts and ends at midnight UTC.");
  const days = daysIn(b.startsAt, b.endsAt);
  if (b.endsAt <= b.startsAt) out.push("A window ends after it starts.");
  else if (days < BOOKING_DAYS.min || days > BOOKING_DAYS.max) out.push(`A window is ${BOOKING_DAYS.min} to ${BOOKING_DAYS.max} days.`);
  if (b.placement.state !== "AVAILABLE") out.push(b.placement.state === "DRAFT" ? "The placement is not on sale yet." : "The placement is retired.");
  if (b.placement.availableFrom && b.startsAt < b.placement.availableFrom) out.push("The placement is not available that early.");
  if (b.placement.availableUntil && b.endsAt > b.placement.availableUntil) out.push("The placement is not available that late.");
  if (b.campaign.state !== "DRAFT") out.push(`A campaign that is ${b.campaign.state} cannot buy more placements.`);
  /* The campaign's dates are whole days too: its last day counts. */
  const flightEnd = new Date(Date.UTC(b.campaign.endDate.getUTCFullYear(), b.campaign.endDate.getUTCMonth(), b.campaign.endDate.getUTCDate() + 1));
  const flightStart = new Date(Date.UTC(b.campaign.startDate.getUTCFullYear(), b.campaign.startDate.getUTCMonth(), b.campaign.startDate.getUTCDate()));
  if (b.startsAt < flightStart || b.endsAt > flightEnd) out.push("The window falls outside the campaign's dates.");
  return out;
}

/** The first slot (1..capacity) free for the whole window, given the BOOKED windows that overlap it; null when full. */
export function freeSlot(capacity: number, overlapping: Array<{ slot: number }>): number | null {
  const taken = new Set(overlapping.map((w) => w.slot));
  for (let s = 1; s <= capacity; s += 1) if (!taken.has(s)) return s;
  return null;
}

/* ───────────────────────────── creative (4S2-BE-02) ───────────────────────────── */

/** The file types each creative type may be (Taxonomy §3). A logo is a PNG, for its transparency. */
export const CREATIVE_MIMES: Record<CreativeType, readonly string[]> = {
  IMAGE: ["image/png", "image/jpeg", "image/webp"],
  VIDEO: ["video/mp4"],
  LOGO: ["image/png"],
};

/**
 * Everything that stops a creative going on this placement, in plain words;
 * empty when it fits. The width, height and size are what SponsorX read from
 * the stored file (an image's pixels, every file's bytes); a video's size and
 * length are as declared.
 */
export function creativeProblems(
  placement: { kind: string; widthPx: number; heightPx: number; creativeTypes: string[]; maxBytes: number; maxVideoSeconds: number | null },
  asset: { creativeType: CreativeType; mime: string; widthPx: number; heightPx: number; bytes: number; durationSeconds?: number | null },
): string[] {
  const out: string[] = [];
  const kind = placement.kind.toLowerCase().replace(/_/g, " ");
  if (!placement.creativeTypes.includes(asset.creativeType)) out.push(`This ${kind} takes ${placement.creativeTypes.map((t) => t.toLowerCase()).join(" or ")}, not ${asset.creativeType.toLowerCase()}.`);
  if (!CREATIVE_MIMES[asset.creativeType]?.includes(asset.mime)) out.push(`A ${asset.creativeType.toLowerCase()} is ${CREATIVE_MIMES[asset.creativeType]?.join(", ")}, not ${asset.mime}.`);
  if (asset.widthPx !== placement.widthPx || asset.heightPx !== placement.heightPx) out.push(`It must be exactly ${placement.widthPx}×${placement.heightPx} px; this is ${asset.widthPx}×${asset.heightPx}.`);
  if (asset.bytes > placement.maxBytes) out.push(`It must be at most ${Math.round(placement.maxBytes / 1024)} KB; this is ${Math.round(asset.bytes / 1024)} KB.`);
  if (asset.creativeType === "VIDEO") {
    if (asset.durationSeconds == null || asset.durationSeconds < 1) out.push("Say how long the video is, in seconds.");
    else if (placement.maxVideoSeconds != null && asset.durationSeconds > placement.maxVideoSeconds) out.push(`A video here runs at most ${placement.maxVideoSeconds} s; this runs ${asset.durationSeconds} s.`);
  }
  return out;
}

/** Why a deployment's dates do not fit its booked window, or null. */
export function deploymentDatesProblem(d: { startsAt: Date; endsAt: Date }, w: { startsAt: Date; endsAt: Date }): string | null {
  if (d.endsAt <= d.startsAt) return "A deployment ends after it starts.";
  if (d.startsAt < w.startsAt || d.endsAt > w.endsAt) return "A deployment runs inside its booked window.";
  return null;
}
