"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — procedural venues (P1-ART-09).

   The parts of the environment the asset kit cannot provide, each rendered
   from its spec in the layout: the basketball court, the soccer pitch, the
   baseball field, the plaza pedestal, the skyscraper's crown and warning
   light, the hologram gantry and the overhead cables. This maps
   `layout.venues` by kind to the component that draws it and adds the
   cables; every venue is MeshStandardMaterial over canvas textures and
   merged geometry, a handful of draw calls each (see each file's header).

   `textureSize` is the longest canvas edge — 2048 for the desktop tier; pass
   1024 for lite to halve texture memory. The matching collision boxes come
   from lib/city/venue-boxes.ts, which the layout already spreads into its
   placements.
   -------------------------------------------------------------------------- */
import type { CityLayout, VenueSpec } from "@/lib/city/types";

import { BaseballField } from "./baseball-field";
import { BasketballCourt } from "./basketball-court";
import { Cables } from "./cables";
import { GantryScreen } from "./gantry";
import { Pedestal } from "./pedestal";
import { SkyscraperExtras } from "./skyscraper";
import { SoccerPitch } from "./soccer-pitch";
import type { TextureSize } from "./venue-utils";

function unknownVenue(v: never): never {
  throw new Error(`Unknown venue kind: ${JSON.stringify(v)}`);
}

function renderVenue(v: VenueSpec, key: string, textureSize: TextureSize) {
  switch (v.kind) {
    case "basketball":
      return <BasketballCourt key={key} spec={v} textureSize={textureSize} />;
    case "soccer":
      return <SoccerPitch key={key} spec={v} textureSize={textureSize} />;
    case "baseball":
      return <BaseballField key={key} spec={v} textureSize={textureSize} />;
    case "pedestal":
      return <Pedestal key={key} spec={v} />;
    case "skyscraper":
      return <SkyscraperExtras key={key} spec={v} />;
    case "gantry":
      return <GantryScreen key={key} spec={v} textureSize={textureSize} />;
    default:
      return unknownVenue(v);
  }
}

export function Venues({ layout, textureSize = 2048 }: { layout: CityLayout; textureSize?: TextureSize }) {
  return (
    <>
      {layout.venues.map((v, i) => renderVenue(v, `${v.kind}:${i}`, textureSize))}
      <Cables cables={layout.cables} />
    </>
  );
}
