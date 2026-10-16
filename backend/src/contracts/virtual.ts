import { z } from "./zod";

import { CREATIVE_TYPES, ENVIRONMENTS, PLACEMENT_KINDS, ZONE_LEVELS } from "../domain/virtual-rules";

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
  rackPriceCents: z.int(),
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
