/** POL-BE-104 — a team's own details page (property portal). */
import { z } from "./zod";

const text = (max: number) => z.string().trim().min(1).max(max);

export const PropertyContactInput = z
  .object({
    description: text(2000).nullable().optional(),
    contactName: text(200).optional(),
    contactPhone: text(40).nullable().optional(),
  })
  .strict()
  .meta({ id: "PropertyContactInput", description: "Saved at once: the public description, and the main contact's name and phone (null clears). The contact's email isn't changed here." });

export const PropertyManagerInput = z
  .object({ name: text(120).nullable().optional(), jobTitle: text(120).nullable().optional(), phone: text(40).nullable().optional() })
  .strict()
  .meta({ id: "PropertyManagerInput", description: "The manager's own name, job title and phone (null clears one)." });

export const PropertyIdentityInput = z
  .object({
    name: text(200).optional(),
    city: text(120).nullable().optional(),
    stateCode: z.string().length(2).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .meta({
    id: "PropertyIdentityInput",
    description: "A new name, city, state and/or the type's details (validated as at sign-up: a team's legalEntityName, league, sport…). Takes effect at once when every safety check passes; held for BTG with the reasons when one fails.",
  });

export const PropertyChangeRejectInput = z
  .object({ reason: text(1000) })
  .strict()
  .meta({ id: "PropertyChangeRejectInput", description: "Why BTG rejected the change — the team reads it." });
