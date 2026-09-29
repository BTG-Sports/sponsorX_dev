# Landing page 3D background — cyberpunk city environment

**Date:** 2026-09-29 · **Surface:** public home `/` (`frontend/src/app/(public)/page.tsx`)
**Status:** built 2026-09-29/30 (programme owner's brief, 2026-09-29) · **Task:** `P1-ART-09`
**Assets:** `Landing Page 3D Objects/Modular Stylized Cyberpunk Street v.1.0.unitypackage`
(Leartes Studios, HDRP, 195 meshes in metres, 133 materials, 499 textures)

## Brief

A cyberpunk-style 3D environment behind the landing page, built from the Leartes
street kit, that contains **all six** of these, with **no overlapping objects**:

1. a full cyberpunk city
2. a plaza with a pedestal at its centre
3. an open basketball court
4. an open soccer field
5. an open baseball field
6. a skyscraper

This pass delivers the **environment only**. It renders from one fixed viewpoint
behind the existing page content. Nothing in this spec is about motion.

## Site plan

Units are metres, three.js Y-up, +X east, −Z north. The city is a **boulevard
running north from a plaza to a skyscraper**, with the three sports venues on
alternating sides and city blocks filling every other frontage. Everything sits
on a 4 m tile grid (the kit's ground modules are 4 × 4 m).

| Zone | Rectangle (x, z) | Contents |
|---|---|---|
| **Pedestal Plaza** | x −28…28, z +8…+48 | Park paving; **pedestal at (0, 0, +28)** — three octagonal tiers (r 3.2 / 2.4 / 1.6 m, top at 1.4 m) in kit concrete with emissive trim rings, and above the dais a full 3D letter **X hologram** (2.6 m, translucent blue with scrolling scan lines and a glowing outline) turning slowly on a projector cone — the header's fixed viewpoint sits low on the paving looking up at it; four trees at the corners; a ring of eight street lights (r 14); eight benches in facing pairs; two standing holo-billboards; four hologram pylons; a **gate pair** (kit `Big_Gate_03`) at x ±13, z +6 marking the boulevard mouth. North and side edges are walled by storefront kits and apartment blocks. |
| **Boulevard** | road x −8…8, sidewalks to ±12, z +8…−176 | Asphalt tiles, park-paving sidewalks, street lights every 12 m on both sides (alternating), manholes, barriers, crates, trash, vending machines and ATMs against the frontages, cables strung across between rooftops, hovering drones (static). |
| **Basketball lot** (west) | x −56…−12, z −48…−4 | Gravel apron; **court 28 × 15 m** centred (−34, −26), long axis east–west; dark acrylic surface with neon (accent-orange) lines, keys and three-point arcs; two hoops (3.05 m rim, 1.8 × 1.05 backboard); 4 m chain-link fence (two stacked kit rows) with a gate on the street side; four floodlight masts; four benches; two vending machines by the gate. |
| **Commercial strip A** (east) | x 12…64, z −48…−4 | Two storefront kits facing the street, the noodle-stand kit between them (base, top, floor, stools, holograms), apartment block behind. |
| **Soccer lot** (east) | x 12…64, z −108…−56 | **Pitch 40 × 20 m** (five-a-side) centred (38, −82), long axis east–west; turf with white lines, centre circle, penalty areas; two 3 × 2 m goals; 4 m fence with a street-side gate; four masts; benches along the north fence. |
| **Residential block B** (west) | x −64…−12, z −108…−56 | Two apartment blocks (`Building_04` × 1.5) and a storefront kit, rooftops dressed with AC units, vents, pipes and masts. |
| **Baseball lot** (west) | x −72…−12, z −176…−116 | Sandlot wedge: **home plate at (−22, −126)**, foul lines along −X and −Z, **bases 27.43 m** apart, mound at 18.44 m, dirt diamond, grass outfield; 6 m backstop arc behind home; **outfield fence arc r 50 m** (two kit fence rows) with foul poles (`Tower_02`) at both ends; dugout benches on the street side of the first-base line. |
| **Commercial block C** (east) | x 12…64, z −176…−116 | The kit's 38 m tower at street scale, two storefront kits, an apartment block. |
| **Forecourt** | x −32…32, z −196…−176 | Park paving, gate pair, planters, benches, a SponsorX hologram screen on a gantry spanning the road end (posts at x ±10). |
| **Skyscraper** | centre (0, 0, −226) | `Building_02` uniformly scaled × 3.4 → **≈128 m tall**, 38 × 56 m footprint; crown of three masts; two flanking towers (× 2.0, ≈75 m) at (−52, −232) and (52, −238). |
| **City fill** | second row \|x\| 64…100 along the boulevard; skyline ring \|x\| 80…200 or z < −270 or z > +90 | Deterministic seeded generator places apartment blocks, storefront upper floors and towers (far ring uses decimated LODs) on the grid with ≥ 3 m gaps, avoiding every reserved zone above. ~120 buildings desktop, ~50 mobile. |

**Landmark anchors** (`LANDMARKS` in `layout.ts`): plaza pedestal, basketball
centre, soccer centre, baseball home plate, skyscraper base. Exported as data so
any later work can reference them.

## No overlap — enforced by a test

`frontend/src/lib/city/layout.ts` is the single source of truth: a list of
placements `{ mesh, position, yaw, scale, kit?, layer }` plus the procedural
venue pieces expressed as boxes. `collision.ts` turns each placement into a
world AABB from the measured bounds in `kit-manifest.json` (rotated by yaw,
scaled). `frontend/tests/city-layout.test.ts` asserts:

- no two placements' boxes intersect, except parts of the **same kit**
  (storefront kit pieces are authored around a shared pivot and interlock by
  design) and the **ground layer** (tiles under objects; tiles never overlap
  each other);
- every placement lies inside the site (x ±200, z −340…+140) and on the grid
  where the layer requires it;
- the venues have the stated dimensions and the pedestal is at the plaza centre;
- the skyscraper is ≥ 100 m tall;
- the seeded city fill also passes (it runs inside the test).

## Assets and pipeline

`frontend/scripts/city-kit/` (Node + Blender 4.5 headless), run with
`CITY_PACKAGE=<path to .unitypackage> npm run city:kit -w @sponsorx/frontend`:

1. **extract** — tar the package's `pathname` sidecars, copy FBX, `.mat`,
   `.prefab` and textures out by GUID (a tar list file; `--force-local`).
2. **resolve** — `.mat` → texture GUIDs → files → roles by suffix
   (`_B` base, `_N` normal, `_ORM` occlusion/roughness/metallic = glTF packing,
   `_E` emissive, `_O` opacity). Prefab `m_Materials` gives slot order.
3. **export** (Blender) — import each mesh the layout uses, build Principled
   materials from the resolved textures, apply a decimated LOD for far-ring
   meshes, export one glTF with shared textures.
4. **optimize** (gltf-transform) — dedup, prune, resize (1024 hero materials,
   512 props, 256 tiny), WebP, meshopt; a second pass at 512/256 for the
   mobile kit.

Outputs (committed): `frontend/public/models/city/city-kit.glb` (target ≤ 12 MB),
`city-kit-lite.glb` (≤ 6 MB), `frontend/public/textures/city/env.hdr` (the pack's
blue cubemap at 512 px, for reflections) and `frontend/src/lib/city/kit-manifest.json`.
Venue surfaces (court, pitch, diamond) are procedural canvas textures, not files.

## Rendering

- **React Three Fiber 9.8 + drei 10.7 + @react-three/postprocessing 3.1** on
  three 0.186 (Fiber's peer range now includes React 19.3; the 2026-09-22
  vanilla-three decision no longer applies).
- One `InstancedMesh` per kit mesh (drei `<Instances>`), fed from `layout.ts`.
- Night lighting: hemisphere + one cool directional (no shadows), emissive maps
  boosted for bloom, five point lights (three venues, pedestal, tower crown),
  exponential fog in the brand near-black, the pack's cubemap as environment.
- Post (desktop): Bloom (mipmap), SMAA, Vignette, light Noise. Mobile: none.
- DPR cap 1.75 desktop / 1.4 mobile; `powerPreference: high-performance`.

## Page integration

`<CityBackdrop />` is the first child of the home page: a client component that
runs the capability gate (WebGL, `prefers-reduced-motion`, coarse-and-low-core
devices → poster only), then `next/dynamic`-imports the scene with `ssr: false`
**inside the client boundary** (Next 16 forbids `ssr:false` in Server
Components). The canvas is `position: fixed; inset: 0; z-index: -10;
pointer-events: none`, fades in over the poster gradient after its first frame,
and a vertical scrim fades to `--sx-bg` toward the bottom of the viewport so the
city shows behind the hero and the sections below stay readable. `?orbit=1`
enables orbit controls and pointer events for review. An FPS watchdog (< 24 fps
over 3 s) unmounts the scene and leaves the poster.

## Out of scope

Camera or scroll behaviour, ambient animation (drones, holograms), page copy
changes, the Tripo balls from the earlier branch.

## Verification

`npm run build` (with the dev server stopped), frontend vitest (layout, collision,
capability), eslint, a Playwright smoke that loads `/` and finds the canvas, and
a visual review of the scene at `/?orbit=1` against this plan.
