# city-kit — the landing-page city asset pipeline (P1-ART-09)

Turns the Leartes *Modular Stylized Cyberpunk Street* Unity package into the
two GLBs, the environment map and the manifest the landing page's 3D city is
built from. Design: `docs/superpowers/specs/2026-09-29-landing-cyberpunk-city-design.md`
(“Assets and pipeline”). The export list is `src/lib/city/palette.ts`.

```
npm run city:kit -w @sponsorx/frontend                 # everything, both tiers
npm run city:kit -w @sponsorx/frontend -- --tier lite  # one tier
npm run city:kit -w @sponsorx/frontend -- --skip-extract --skip-blender   # re-optimise only
```

| env | default | meaning |
|---|---|---|
| `CITY_PACKAGE` | `<repo>/Landing Page 3D Objects/Modular Stylized Cyberpunk Street v.1.0.unitypackage` | the .unitypackage |
| `CITY_WORK` | Claude session scratchpad if present, else `<tmp>/sponsorx-city-kit` | extracted package + raw build (≈ 6 GB) |
| `BLENDER` | `C:/Program Files/Blender Foundation/Blender 4.5/blender.exe` | Blender 4.5 with the bundled glTF add-on |

Requires GNU or bsd `tar` on PATH, Node 22+, Blender 4.5.

## Outputs (committed)

- `public/models/city/city-kit.glb` — every palette mesh with `desktop` in its tiers (budget 14 MB)
- `public/models/city/city-kit-lite.glb` — `lite` meshes only, textures halved (budget 6 MB)
- `public/textures/city/env.hdr` — the pack's blue equirect sky, 1024×512 Radiance HDR
- `src/lib/city/kit-manifest.json` — bounds (three.js Y-up metres), tris and materials per mesh; `lod: true` where a `__lod` node exists

Both GLBs use `KHR_mesh_quantization` + `EXT_meshopt_compression` (level
medium) and WebP textures (`EXT_texture_webp`): load with three's `GLTFLoader`
plus `setMeshoptDecoder(MeshoptDecoder)`. **Every mesh is a root node named by
its palette id** (`SM_Building_04`, and `SM_Building_04__lod` for the
decimated far variant). Quantisation leaves a dequantisation translation/scale
on the node, so instance through the node (its `matrix`), not the bare
geometry; bounds in the manifest are world-space metres.

## Steps

1. **extract.mjs** — the package is a gzipped tar of `<guid>/{asset,asset.meta,pathname}`.
   Extract the `pathname` sidecars → `guid_map.json`, then only the meshes,
   materials, prefabs, textures and shader graphs via a tar list file
   (`--force-local` on GNU tar, which otherwise reads `d:/…` as a host), and
   hard-link them into `CITY_WORK/cyber/<path under Assets/LeartesStudios/Cyberpunk/>`.
2. **resolve.mjs** — `.mat` → texture roles → `materials.json`. A `.mat` keeps
   `m_TexEnvs` entries for every shader it has *ever* used, so the shader
   graph's property list decides which entries are live and the property's
   display name gives the role (`Material 01 Base Colour` → B, `… ORM` → ORM,
   `EmissionTexture` → E, `Opacity Mask` → O…); unknown shaders fall back to
   the file-name suffix. Prefab `MeshRenderer.m_Materials` gives slot order.
   Alpha-mask = the shader's `Opacity Mask?` toggle or fence/leaf/curtain by
   name; holograms (`S_HologramMaster`) are blended at 70 %, double-sided.
3. **bl_export.py** (Blender, headless) — per palette mesh: import the FBX,
   keep LOD0 (joined, named `<id>`) and LOD2 as `<id>__lod` when the palette
   says `lod: true`, drop LOD1 / convex hulls / `UCX_`, bake the importer's
   0.01 × 90° parent transform so nodes are identity at the origin. Slots map
   to `.mat` names via the prefab order when the count matches, else
   `MI_`/`MM_` → `M_` plus the alias table in `lib.mjs`; unresolved slots get
   flat grey and are listed, never dropped. Materials are Principled BSDF:
   `_B` sRGB base, `_N` normal (OpenGL +Y, no flip), one non-colour `_ORM`
   image through *Separate Color* → R occlusion (via the exporter's
   `glTF Material Output` group), G roughness, B metallic — exactly glTF's
   packing so the exporter re-uses the single image; `_E` emissive at
   strength clamp(`_EmissiveIntensity`, 1, 6); `_O` → `Math:Round` → Alpha,
   which the exporter turns into `alphaMode: MASK`, cutoff 0.5. Textures are
   pre-scaled to the largest palette `textureSize` of their users (≤ 2048)
   and re-saved as PNG in `build/tex/` because the exporter re-reads an
   unmodified image from its original file. Writes `build/city-kit.raw.glb`
   and `build/export-report.json`, and `env.hdr` from the first 2:1 HDR.
4. **optimize.mjs** (gltf-transform API) — per tier: drop out-of-tier nodes,
   strip the FBX's all-white `COLOR_0` (Unity shader masks that glTF viewers
   would multiply into the base colour), `dedup` + `prune`,
   `compressTexture` → WebP resized to the palette cap of
   the meshes using the texture (lite halves, floor 128), then `meshopt`
   (reorder + quantize 14/10/12 bits + EXT_meshopt_compression; UVs outside
   [0,1] — the tiling ground/wall materials — stay float32 because normalised
   16-bit cannot hold them). If a tier is over budget the caps step down:
   first non-building textures, then building normal/ORM/emissive maps; a
   building's base colour never goes below 256.
5. **manifest.mjs** — regenerate `kit-manifest.json` from the export report
   (LOD0-only bounds), keeping non-palette meshes as they were.
6. **verify.mjs** — node names, per-tier membership, and world-space bounds of
   the final GLBs against the report (`SM_Building_04` ≈ 18.83 × 7.56 × 14.55 m,
   `SM_Fence` ≈ 0.12 × 1.97 × 2.81 m). Also runs standalone on any kit GLB.

The run prints a per-tier table (size, budget, nodes, tris, images, image
bytes, shrink level), the unresolved slots and the base-colour fallbacks.
`build/blender.log` has Blender's full output.
