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
  if (!between(p.rackPriceCents, LIMITS.priceCents)) out.push("The price is $1 to $1,000,000, in cents.");
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
