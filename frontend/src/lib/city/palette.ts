/* --------------------------------------------------------------------------
   Cyberpunk city — the kit palette (P1-ART-09).

   The subset of the Leartes kit the city is built from. This is the export
   list for scripts/city-kit (only these meshes go into city-kit.glb) and the
   allow-list the layout test checks placements against. Keys are kit mesh ids
   (keys of kit-manifest.json `meshes`); the value says which GLB tiers carry
   it and whether a decimated far variant (`<id>__lod`) is exported.
   -------------------------------------------------------------------------- */

export type Tier = "desktop" | "lite";

export interface PaletteEntry {
  tiers: Tier[];
  /** Export a decimated `<id>__lod` variant (ratio ≈ 0.12) for the skyline. */
  lod?: boolean;
  /** Texture cap for this mesh's materials in the desktop kit (lite halves it). */
  textureSize: 1024 | 512 | 256;
}

const BOTH: Tier[] = ["desktop", "lite"];
const DESKTOP: Tier[] = ["desktop"];

export const PALETTE: Record<string, PaletteEntry> = {
  // ground
  SM_Module_4x4_06: { tiers: BOTH, textureSize: 1024 },
  SM_Park_Pavement: { tiers: BOTH, textureSize: 1024 },
  SM_Gravel_Pavement: { tiers: BOTH, textureSize: 512 },
  SM_Sewer_Cover_01: { tiers: DESKTOP, textureSize: 256 },
  // buildings
  SM_Building_02: { tiers: BOTH, lod: true, textureSize: 1024 },
  SM_Building_04: { tiers: BOTH, lod: true, textureSize: 1024 },
  SM_Building03_Base_01: { tiers: BOTH, textureSize: 1024 },
  SM_Building03_Base_02: { tiers: BOTH, textureSize: 1024 },
  SM_Building03_Base_03: { tiers: DESKTOP, textureSize: 1024 },
  SM_Building03_Base_04: { tiers: DESKTOP, textureSize: 1024 },
  SM_Building03_Front_01: { tiers: BOTH, textureSize: 512 },
  SM_Building03_Top_01: { tiers: BOTH, lod: true, textureSize: 1024 },
  SM_Building03_Top_02: { tiers: BOTH, textureSize: 1024 },
  SM_Building03_Top_03: { tiers: DESKTOP, textureSize: 1024 },
  SM_Building03_Top_04: { tiers: DESKTOP, textureSize: 1024 },
  SM_Building03_Props: { tiers: DESKTOP, textureSize: 512 },
  // rooftop dressing
  SM_Vents_01: { tiers: BOTH, textureSize: 512 },
  SM_Vents_02: { tiers: DESKTOP, textureSize: 512 },
  SM_Vents_03: { tiers: DESKTOP, textureSize: 512 },
  SM_AC_Unit_01: { tiers: BOTH, textureSize: 256 },
  SM_AC_Unit_02: { tiers: DESKTOP, textureSize: 256 },
  SM_Tower_01: { tiers: BOTH, textureSize: 512 },
  SM_Tower_02: { tiers: BOTH, textureSize: 512 },
  SM_Tower_03: { tiers: BOTH, textureSize: 512 },
  SM_PowerUnit_01: { tiers: DESKTOP, textureSize: 256 },
  SM_Outlet: { tiers: DESKTOP, textureSize: 256 },
  SM_PipeB_Long: { tiers: DESKTOP, textureSize: 256 },
  SM_PipeB_Clamp: { tiers: DESKTOP, textureSize: 256 },
  // street furniture and props
  SM_Street_Light_01: { tiers: BOTH, textureSize: 512 },
  SM_Street_Light_02: { tiers: BOTH, textureSize: 512 },
  SM_Bench_01: { tiers: BOTH, textureSize: 256 },
  SM_Bench_02: { tiers: DESKTOP, textureSize: 256 },
  SM_Barrier_01: { tiers: DESKTOP, textureSize: 256 },
  SM_Barrier_02: { tiers: DESKTOP, textureSize: 256 },
  SM_Barrier_04: { tiers: DESKTOP, textureSize: 256 },
  SM_Crate_01: { tiers: DESKTOP, textureSize: 256 },
  SM_Crate_03: { tiers: DESKTOP, textureSize: 256 },
  SM_Box_01: { tiers: DESKTOP, textureSize: 256 },
  SM_Barrel: { tiers: DESKTOP, textureSize: 256 },
  SM_TrashBin_02_Combined: { tiers: DESKTOP, textureSize: 256 },
  SM_Vending_Machine: { tiers: BOTH, textureSize: 512 },
  SM_ATM: { tiers: DESKTOP, textureSize: 512 },
  SM_Standing_Billboard: { tiers: BOTH, textureSize: 512 },
  SM_Sign_01: { tiers: DESKTOP, textureSize: 512 },
  SM_Sign_04: { tiers: BOTH, textureSize: 512 },
  SM_Banner_01: { tiers: DESKTOP, textureSize: 512 },
  SM_Hologram_Poster: { tiers: BOTH, textureSize: 512 },
  SM_Flower_Pot_01: { tiers: DESKTOP, textureSize: 256 },
  SM_Flower_Pot_02: { tiers: BOTH, textureSize: 256 },
  SM_Motorbike: { tiers: DESKTOP, textureSize: 512 },
  SM_Drone: { tiers: DESKTOP, textureSize: 512 },
  SM_Tree1: { tiers: BOTH, textureSize: 512 },
  SM_Tree2: { tiers: BOTH, textureSize: 512 },
  SM_Fence: { tiers: BOTH, textureSize: 512 },
  SM_Fence_Post: { tiers: BOTH, textureSize: 256 },
  SM_Fence_Post_Angle: { tiers: BOTH, textureSize: 256 },
  SM_Big_Gate_03: { tiers: BOTH, textureSize: 512 },
  SM_Steel_Column: { tiers: BOTH, textureSize: 256 },
  SM_Column_02: { tiers: DESKTOP, textureSize: 256 },
  SM_Stand_02: { tiers: DESKTOP, textureSize: 256 },
  // noodle kiosk
  SM_Noodle_Base: { tiers: BOTH, textureSize: 512 },
  SM_Noodle_Top: { tiers: BOTH, textureSize: 512 },
  SM_Floor: { tiers: DESKTOP, textureSize: 512 },
  SM_Stool: { tiers: DESKTOP, textureSize: 256 },
  SM_Hologram_Noodle: { tiers: DESKTOP, textureSize: 256 },
  SM_Hologram_Burger: { tiers: DESKTOP, textureSize: 256 },
  SM_Hologram_Pizza: { tiers: DESKTOP, textureSize: 256 },
  SM_Curtain_01: { tiers: DESKTOP, textureSize: 256 },
};

export const PALETTE_IDS = Object.keys(PALETTE);

export function inTier(mesh: string, tier: Tier): boolean {
  const e = PALETTE[mesh];
  return !!e && e.tiers.includes(tier);
}
