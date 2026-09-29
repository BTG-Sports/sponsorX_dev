// Step 4 — gltf-transform: raw GLB -> the committed per-tier kits.
//
// For each tier: drop the nodes the palette does not put in that tier, dedup +
// prune, convert every texture to WebP resized to the largest palette
// `textureSize` of the meshes that use it (lite halves that, floor 128), then
// meshopt (EXT_meshopt_compression, level medium) which quantizes positions /
// normals / uvs (KHR_mesh_quantization). Nodes keep their names —
// `SM_Building_04`, `SM_Building_04__lod` — and, after quantization, carry the
// dequantisation translation/scale, so consumers must instance through the
// node's matrix rather than the raw geometry.
import fs from "node:fs";
import path from "node:path";
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { compressTexture, dedup, listTextureSlots, meshopt, prune } from "@gltf-transform/functions";
import sharp from "sharp";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { OUT, WORK, fmtMB, log } from "./lib.mjs";

export const baseId = (name) => name.replace(/__lod$/, "");

function textureUsers(tex) {
  const ids = new Set();
  for (const mat of tex.listParents()) {
    if (mat.propertyType !== PropertyType.MATERIAL) continue;
    for (const prim of mat.listParents()) {
      if (prim.propertyType !== PropertyType.PRIMITIVE) continue;
      for (const mesh of prim.listParents()) {
        if (mesh.propertyType !== PropertyType.MESH) continue;
        for (const node of mesh.listParents()) if (node.propertyType === PropertyType.NODE) ids.add(baseId(node.getName()));
      }
    }
  }
  return [...ids];
}

/**
 * Per-texture size cap and quality.
 *  shrink 0: the palette caps (lite halves them, floor 128)
 *  shrink 1: also halve non-hero (non-building) textures, floor 128
 *  shrink 2: also halve hero normal/ORM/emissive maps; hero base colour never below 256
 */
export function texturePolicy({ slots, users, tier, palette, shrink }) {
  const isBase = slots.some((s) => /baseColor/i.test(s));
  const isNormal = slots.some((s) => /normal/i.test(s));
  const hero = users.some((id) => /^SM_Building/.test(id));
  let cap = users.length ? Math.max(...users.map((id) => palette[id]?.textureSize ?? 256)) : 256;
  if (tier === "lite") cap = Math.max(128, cap / 2);
  if (shrink >= 1 && !hero) cap = Math.max(128, cap / 2);
  if (shrink >= 2 && hero && !isBase) cap = Math.max(128, cap / 2);
  if (hero && isBase) cap = Math.max(256, cap);
  const quality = isNormal ? 85 : isBase ? 80 : 75;
  return { cap, quality, hero, isBase };
}

function countTris(root) {
  let tris = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : prim.getAttribute("POSITION")?.getCount() ?? 0;
      tris += Math.floor(n / 3);
    }
  }
  return tris;
}

export async function optimize({ tier, palette, rawGlb = WORK.rawGlb, outFile, shrink = 0 }) {
  outFile ??= path.join(OUT.models, tier === "lite" ? "city-kit-lite.glb" : "city-kit.glb");
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  // gltf-transform repeats per-primitive warnings (e.g. "Skipping TEXCOORD_0;
  // out of [0,1] range" for every tiled-UV mesh); collapse them into counts.
  const notes = new Map();
  const logger = {
    debug() {},
    info(m) {
      notes.set(m, (notes.get(m) ?? 0) + 1);
    },
    warn(m) {
      notes.set(m, (notes.get(m) ?? 0) + 1);
    },
    error(m) {
      console.error(m);
    },
  };
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder })
    .setLogger(logger);
  const doc = await io.read(rawGlb);
  doc.setLogger(logger);
  const root = doc.getRoot();

  // 1. tier filter — node names are the palette ids (+ "__lod")
  const dropped = [];
  for (const node of root.listNodes()) {
    const e = palette[baseId(node.getName())];
    if (!e || !e.tiers.includes(tier)) {
      dropped.push(node.getName());
      node.dispose();
    }
  }

  // 2. cleanup — the FBX carries all-white COLOR_0 (Unity shader masks) and
  //    glTF viewers would multiply base colour by it; drop it, then dedup/prune.
  let colorAttrs = 0;
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const sem of prim.listSemantics())
        if (/^(COLOR|TANGENT)/.test(sem)) {
          prim.setAttribute(sem, null);
          colorAttrs++;
        }
  await doc.transform(dedup(), prune({ keepAttributes: false, keepLeaves: false }));

  // 3. textures -> WebP, sized per palette
  const textures = [];
  for (const tex of root.listTextures()) {
    const users = textureUsers(tex);
    const slots = listTextureSlots(tex);
    const { cap, quality, hero } = texturePolicy({ slots, users, tier, palette, shrink });
    await compressTexture(tex, { encoder: sharp, targetFormat: "webp", resize: [cap, cap], quality });
    textures.push({ name: tex.getName(), cap, quality, hero, slots, users, bytes: tex.getImage().byteLength });
  }
  // compressTexture() converts the images but, unlike textureCompress(), does not
  // declare the extension the WebP images require.
  if (textures.length) doc.createExtension(EXTTextureWebP).setRequired(true);

  // 4. geometry: reorder + quantize (positions 14 bit, normals 10, uv 12) + meshopt
  await doc.transform(
    meshopt({ encoder: MeshoptEncoder, level: "medium", quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );

  // 5. write
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await io.write(outFile, doc);

  const nodes = root.listNodes().map((n) => n.getName());
  const stats = {
    tier,
    shrink,
    file: outFile,
    bytes: fs.statSync(outFile).size,
    nodes,
    dropped,
    tris: countTris(root),
    images: textures.length,
    imageBytes: textures.reduce((s, t) => s + t.bytes, 0),
    textures,
  };
  if (colorAttrs) log("optimize", `${tier}: dropped ${colorAttrs} COLOR/TANGENT vertex attributes`);
  for (const [m, n] of notes) log("optimize", `${tier}: ${m}${n > 1 ? ` (x${n})` : ""}`);
  log("optimize", `${tier}: ${fmtMB(stats.bytes)}, ${nodes.length} nodes, ${stats.tris} tris, ${stats.images} images (${fmtMB(stats.imageBytes)}), shrink ${shrink}`);
  return stats;
}
