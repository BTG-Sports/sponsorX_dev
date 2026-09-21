# Tripo Asset Prompts — SponsorX 3D Landing

Companion to the [design spec](../specs/2026-09-22-landing-3d-scrollytelling-design.md) and
[implementation plan](2026-09-22-landing-3d-scrollytelling.md). Generate every 3D asset the
landing scene needs in **Tripo**, then run the post-processing checklist at the bottom before
dropping files into the repo.

Assets: **4 sport balls**, **1 brand "X"** (finale morph target), **4 environment sets**
(each = a hero prop + optional set piece). The hero orb (section 0) is procedural in
three.js, not Tripo.

---

## Global settings (apply to every generation)

- **Output format:** glTF / **GLB** (embedded), Y-up, real-world-ish scale (a ball ≈ 0.24 m).
- **Topology:** game-ready, clean quad topology, **watertight**, single centered object,
  **no ground plane, no backdrop, no baked shadows, no extra props** unless the prompt asks.
- **Textures:** PBR (base color + normal + roughness/metallic), **1–2K max**. Matte-to-satin
  finish — avoid blown-out speculars; the scene lights the model.
- **Style keyword to include:** *"clean stylized realism, premium product-render look,
  physically plausible materials, subtle wear, neutral studio lighting baked out."*
- **Avoid:** logos/brand text (except the X asset), text of any kind, crowds, people, motion
  blur, cartoon/toy proportions, transparent glass unless specified.
- After generating, **regenerate the one detail that's wrong** rather than settling — these are
  hero objects on a near-black stage where flaws show.

---

## 1. Sport balls (4)

Each is a hero object, spun and lit live. Prioritize correct real-world markings and proportions.

### 1a. Soccer ball  → `ball-soccer.glb`
```
A regulation soccer ball, classic 32-panel truncated-icosahedron pattern of white
pentagons and black hexagons, matte-satin synthetic leather with subtle seam stitching
and faint scuff wear. Perfectly spherical, centered, real proportions (~22 cm). Clean
stylized realism, premium product-render look, physically plausible materials, neutral
studio lighting baked out. Single object, no ground, no shadow, no background, no text.
```

### 1b. Basketball  → `ball-basketball.glb`
```
A regulation basketball, deep orange pebbled rubber surface with realistic dimpled
grain, eight black seam channels, matte finish with light court wear. Perfectly
spherical, centered, real proportions (~24 cm). Clean stylized realism, premium
product-render look, physically plausible materials, neutral studio lighting baked out.
Single object, no ground, no shadow, no background, no text.
```

### 1c. Baseball  → `ball-baseball.glb`
```
A regulation baseball, off-white leather with two curved rows of red waxed-thread
stitching, subtle leather grain and faint dirt scuff. Perfectly spherical, centered,
real proportions (~7.4 cm). Clean stylized realism, premium product-render look,
physically plausible materials, neutral studio lighting baked out. Single object, no
ground, no shadow, no background, no text.
```

### 1d. American football  → `ball-football.glb`
```
A regulation American football, prolate spheroid (pointed at both ends), pebbled brown
leather, white lace stitching along one seam and two white stripes near the ends, matte
finish. Centered on its long axis horizontal, real proportions (~28 cm long). Clean
stylized realism, premium product-render look, physically plausible materials, neutral
studio lighting baked out. Single object, no ground, no shadow, no background, no text.
```
> **Note for the morph:** the football is the one non-spherical ball. Model it clean; the
> squash-to-prolate transition is animated in three.js from the basketball/baseball sphere,
> so keep its pivot at the exact center and its long axis on **X**.

---

## 2. Brand "X" — finale morph target  → `brand-x.glb`
```
A bold three-dimensional letter X, extruded geometric sans-serif (Poppins-like heavy
weight), beveled edges, split-tone material: one diagonal stroke electric blue
(#2E9BF5), the other warm orange (#F97A1F), clean satin finish. Centered, front-facing,
symmetrical. Clean stylized realism, premium product-render look, neutral studio lighting
baked out. Single object, no ground, no shadow, no background.
```
> If Tripo struggles with the two-tone split, generate a neutral light-grey X and tint the
> two strokes with vertex/material colors in three.js instead.

---

## 3. Environment sets (4)

One per sport. Tripo excels at discrete **props**, not big scenes — so each "set" is a
**hero prop** (always generate) plus an optional **set piece**. The floor plane, painted
lines and fog are procedural in three.js; these models add the recognizable sport landmark
behind the ball. Model at real scale, prop resting at origin, its base on Y=0.

### 3a. Soccer  → `env-soccer-goal.glb` (hero prop)
```
A stylized soccer goal: white tubular metal frame with a fine white net, viewed as a
single freestanding unit, subtle realistic sag in the netting. Clean stylized realism,
matte materials, neutral studio lighting baked out. Centered, base on the ground line,
no pitch, no background, no text, no shadow.
```
Optional set piece → `env-soccer-corner.glb`:
```
A stylized corner-flag post with a small triangular flag and a short arc of painted
pitch line on grass, minimal, low detail. Clean stylized realism, matte materials.
Single cluster, centered, no background, no shadow, no text.
```

### 3b. Basketball  → `env-basketball-hoop.glb` (hero prop)
```
A stylized basketball hoop assembly: transparent-tinted rectangular backboard with a
painted inner square, orange rim, and a white chain-look net, on a padded stanchion pole.
Freestanding, clean stylized realism, matte-to-satin materials, neutral studio lighting
baked out. Centered, base on the ground, no court, no background, no shadow, no text.
```
Optional set piece → `env-basketball-floor.glb`:
```
A small segment of glossy hardwood basketball court flooring with a painted key arc and
free-throw line, warm maple tone, subtle plank seams. Low, flat set piece. Clean stylized
realism. Centered, no walls, no background, no shadow, no text.
```

### 3c. Baseball  → `env-baseball-set.glb` (hero prop)
```
A stylized baseball home-plate area: white home plate and a batter's box outline on
infield dirt, with a simple chain-link backstop arc behind. Compact freestanding cluster,
clean stylized realism, matte materials, neutral studio lighting baked out. Centered, no
stadium, no background, no shadow, no people, no text.
```
Optional set piece → `env-baseball-base.glb`:
```
A single stylized white baseball base (bag) on a small patch of infield dirt, clean
stylized realism, matte rubber material. Centered, no background, no shadow, no text.
```

### 3d. Football  → `env-football-goalposts.glb` (hero prop)
```
Stylized American-football goalposts: single-pole yellow uprights (tuning-fork shape),
freestanding, clean metal satin material, subtle realism. Centered, base on the ground,
no field, no stadium, no background, no shadow, no text.
```
Optional set piece → `env-football-yardline.glb`:
```
A small segment of green artificial-turf football field with white yard-line markings and
a large white yard number, flat low set piece, subtle turf texture. Clean stylized
realism. Centered, no walls, no background, no shadow, no text.
```

---

## 4. Post-processing checklist (before committing any asset)

Run per file. Tools: `gltf-transform` (or `gltfpack` for meshopt), Blender for cleanup.

- [ ] **Recenter pivot** at geometry center (balls) / base-at-origin (props). Football long axis on **X**.
- [ ] **Decimate** if over budget — balls ≤ ~40–60k tris, env props ≤ ~150k tris.
- [ ] **Compress geometry:** Draco *or* meshopt (`gltf-transform draco in.glb out.glb` / `gltfpack -cc`).
- [ ] **Resize textures** to ≤ 2K (prefer 1K); convert to **KTX2/Basis** where the loader supports it.
- [ ] **Strip** cameras, lights, animations, unused nodes/materials Tripo may embed.
- [ ] **Target file size:** each ball ≤ ~1–2 MB, each env set ≤ ~3–4 MB compressed.
- [ ] **Sanity-check in a glTF viewer** on a near-black background with a single key light.
- [ ] Name exactly as above and place in **`frontend/public/models/landing/`** (or the R2
      bucket if the plan's asset-hosting decision lands on R2).

## 5. Asset manifest (what the code expects)

| File | Used by section | Notes |
|---|---|---|
| `ball-soccer.glb` | Ch.1 | sphere, spins |
| `ball-basketball.glb` | Ch.2 | sphere, spins |
| `ball-baseball.glb` | Ch.3 | sphere, spins |
| `ball-football.glb` | Ch.4 | prolate; squash target from sphere |
| `brand-x.glb` | Finale | morph target; blue/orange split |
| `env-soccer-goal.glb` | Ch.1 | hero prop |
| `env-basketball-hoop.glb` | Ch.2 | hero prop |
| `env-baseball-set.glb` | Ch.3 | hero prop |
| `env-football-goalposts.glb` | Ch.4 | hero prop |
| `env-*-*.glb` (set pieces) | resp. chapters | optional richness |

The hero orb (section 0) and the blue/orange bloom are procedural — no asset needed.
