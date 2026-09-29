// Step 5 — regenerate src/lib/city/kit-manifest.json.
//
// Same shape as before ({ generatedFrom, units, axes, meshes, materials }):
// palette meshes take their LOD0-only bounds / tris / slot materials from the
// Blender export report (plus `lod: true` when a `<id>__lod` node was
// exported); every other mesh keeps its existing entry. `materials` is
// rebuilt from the resolved .mat data, listing the live texture per role.
import fs from "node:fs";
import path from "node:path";
import { CITY_PACKAGE, OUT, WORK, log, readJson } from "./lib.mjs";

export function writeManifest({ report = readJson(WORK.report), resolved = readJson(WORK.materials), file = OUT.manifest } = {}) {
  const prev = fs.existsSync(file) ? readJson(file) : { meshes: {}, materials: {} };
  const meshes = {};
  for (const [id, m] of Object.entries(prev.meshes ?? {})) {
    // `lod` is recomputed below from the fresh export report.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lod, ...rest } = m;
    meshes[id] = rest;
  }
  let updated = 0;
  for (const [id, r] of Object.entries(report.meshes ?? {})) {
    if (r.error) continue;
    meshes[id] = {
      file: path.basename(r.file),
      dims: r.dims,
      min: r.min,
      max: r.max,
      tris: r.tris,
      materials: r.materials,
      ...(r.lod ? { lod: true } : {}),
    };
    updated++;
  }
  const materials = {};
  for (const [name, m] of Object.entries(resolved.mats)) {
    materials[name] = {
      shader: m.shader,
      textures: Object.fromEntries(Object.entries(m.textures).map(([k, v]) => [k, v[0]])),
      emissiveIntensity: m.floats._EmissiveIntensity ?? null,
      emissiveColor: m.colors._EmissiveColor ?? null,
      baseColor: m.colors._BaseColor ?? null,
    };
  }
  const out = {
    generatedFrom: prev.generatedFrom ?? path.basename(CITY_PACKAGE),
    units: "meters",
    axes: "three.js Y-up",
    meshes,
    materials,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  log("manifest", `${file}: ${Object.keys(meshes).length} meshes (${updated} from the export), ${Object.keys(materials).length} materials`);
  return out;
}

if (process.argv[1]?.endsWith("manifest.mjs")) writeManifest();
