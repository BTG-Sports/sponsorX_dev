import { z } from "./zod";

import { CREATIVE_MIMES, CREATIVE_TYPES, ENVIRONMENTS, PLACEMENT_KINDS, ZONE_LEVELS } from "../domain/virtual-rules";

/* --------------------------------------------------------------------------
   The virtual registry on the wire — 4S1-BE-01/02/03
   (documentation/SponsorX-Virtual-Registry.md). Rules live in
   domain/virtual-rules.ts; these shapes only say what may be sent.
   -------------------------------------------------------------------------- */

const externalId = z.string().max(64).describe("The world owner's ID: 1–64 letters, digits, '.', '_' or '-'. Never changes, never reused.");
const when = z.iso.datetime().nullable().optional();

export const WorldInput = z
  .object({
    propertyId: z.string().min(1).max(200).describe("The VIRTUAL property (world operator) that owns it"),
    externalId,
    name: z.string().max(200),
    environment: z.enum(ENVIRONMENTS),
    runtime: z.string().max(80).nullable().optional().describe("What it runs on, e.g. \"Unity 6\" — for people; no rule reads it"),
    runtimeVersion: z.string().max(80).nullable().optional(),
  })
  .strict()
  .meta({ id: "VirtualWorldInput", description: "Register a virtual world in one environment (4S1-BE-01)." });

export const WorldPatch = z
  .object({
    name: z.string().max(200).optional(),
    runtime: z.string().max(80).nullable().optional(),
    runtimeVersion: z.string().max(80).nullable().optional(),
    status: z.literal("RETIRED").optional().describe("Retire it for good: its zones retire and its placements go off sale"),
  })
  .strict()
  .meta({ id: "VirtualWorldPatch", description: "Rename a world, record its runtime, or retire it (4S1-BE-01)." });

export const ZonesInput = z
  .object({
    zones: z.array(z.object({
      externalId,
      name: z.string().max(200),
      level: z.enum(ZONE_LEVELS),
      parentExternalId: z.string().max(64).nullable().optional().describe("The parent's external ID; none for directly under the world"),
      status: z.enum(["ACTIVE", "RETIRED"]).optional(),
    }).strict()).min(1).max(500),
  })
  .strict()
  .meta({ id: "VirtualZonesInput", description: "Upsert a world's districts, venues and zones by external ID (4S1-BE-01)." });

const spec = {
  widthPx: z.int(),
  heightPx: z.int(),
  creativeTypes: z.array(z.enum(CREATIVE_TYPES)).min(1).max(3),
  maxBytes: z.int(),
  maxVideoSeconds: z.int().nullable().optional(),
  capacity: z.int().optional(),
  viewabilityRule: z.string().max(60).optional(),
  rackPriceCents: z.int().describe("The list price per week, in cents; a booked window costs this × days ÷ 7"),
  availableFrom: when,
  availableUntil: when,
};

export const PlacementInput = z
  .object({ externalId, name: z.string().max(200), kind: z.enum(PLACEMENT_KINDS), zoneExternalId: z.string().max(64).nullable().optional(), ...spec })
  .strict()
  .meta({ id: "VirtualPlacementInput", description: "Register a surface, as a DRAFT (4S1-BE-02)." });

export const PlacementPatch = z
  .object({ name: z.string().max(200).optional(), ...Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v.optional()])) })
  .strict()
  .meta({ id: "VirtualPlacementPatch", description: "Change a placement: name, price, capacity and dates any time before it retires; specs only while a DRAFT (4S1-BE-02)." });

export const WindowInput = z
  .object({
    campaignId: z.string().min(1).max(200).describe("A DRAFT campaign the caller may write; the window falls within its dates"),
    startsAt: z.iso.datetime().describe("Midnight UTC, the first day"),
    endsAt: z.iso.datetime().describe("Midnight UTC, the day after the last"),
  })
  .strict()
  .meta({ id: "PlacementWindowInput", description: "Book a placement for whole days inside a campaign (4S1-BE-04)." });

export const WindowRelease = z.object({ reason: z.string().max(600).describe("Why, 3 to 500 characters") }).strict()
  .meta({ id: "PlacementWindowRelease", description: "Give a booked window back while its campaign is still a draft (4S1-BE-04)." });

const MIMES = [...new Set(Object.values(CREATIVE_MIMES).flat())] as [string, ...string[]];

export const CreativeUploadInput = z
  .object({ contentType: z.enum(MIMES), bytes: z.int().describe("The file's exact size; signed into the upload") })
  .strict()
  .meta({ id: "VirtualCreativeUploadInput", description: "Ask for a direct upload of a window's creative to the private bucket (4S2-BE-02)." });

export const CreativeRegisterInput = z
  .object({
    r2Key: z.string().min(1).max(300),
    creativeType: z.enum(CREATIVE_TYPES),
    widthPx: z.int().optional().describe("A video's width; an image's is read from the file"),
    heightPx: z.int().optional().describe("A video's height; an image's is read from the file"),
    durationSeconds: z.int().nullable().optional().describe("A video's length, in seconds"),
  })
  .strict()
  .meta({ id: "VirtualCreativeRegisterInput", description: "Register an uploaded file as the window's next creative version, checked against the placement (4S2-BE-02)." });

export const DeploymentInput = z
  .object({ assetId: z.string().min(1).max(200), startsAt: z.iso.datetime().optional(), endsAt: z.iso.datetime().optional() })
  .strict()
  .meta({ id: "CreativeDeploymentInput", description: "Deploy a validated creative version on its booked window, for the window's dates or narrower ones (4S2-BE-01)." });

export const DeploymentEnd = z.object({ reason: z.string().max(600) }).strict()
  .meta({ id: "CreativeDeploymentEnd", description: "End a deployment, with the reason (4S2-BE-01)." });
