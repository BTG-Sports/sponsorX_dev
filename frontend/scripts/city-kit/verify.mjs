// Verification of a final kit GLB: node names intact, every tier mesh present
// (plus its __lod when the palette asks for one), and world-space bounds that
// match the Blender export report (i.e. quantisation kept the geometry in
// metres at the origin). Run standalone:
//
//   node scripts/city-kit/verify.mjs public/models/city/city-kit.glb
import fs from "node:fs";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { WORK, log, readJson, readPalette } from "./lib.mjs";

const EXPECT = { SM_Building_04: [18.83, 7.56, 14.55], SM_Fence: [0.12, 1.97, 2.81] };

export async function verifyGlb(io, file, palette, report) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const tier = /lite/.test(file) ? "lite" : "desktop";
  const names = new Set(root.listNodes().map((n) => n.getName()));
  const problems = [];
  for (const [id, e] of Object.entries(palette)) {
    if (!e.tiers.includes(tier)) {
      if (names.has(id)) problems.push(`${id} should not be in the ${tier} kit`);
      continue;
    }
    if (!names.has(id)) problems.push(`${id} missing`);
    if (e.lod && !names.has(id + "__lod")) problems.push(`${id}__lod missing`);
  }
  for (const n of names) if (!palette[n.replace(/__lod$/, "")]) problems.push(`unexpected node ${n}`);

  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const id = node.getName().replace(/__lod$/, "");
    const b = getBounds(node);
    const dims = b.max.map((v, i) => v - b.min[i]);
    const ref = EXPECT[id] && !node.getName().endsWith("__lod") ? EXPECT[id] : report?.meshes?.[id]?.dims;
    if (!ref) continue;
    const tol = (v) => Math.max(0.03, 0.02 * Math.abs(v));
    const okDims = dims.every((d, i) => Math.abs(d - ref[i]) <= tol(ref[i]));
    const rmin = report?.meshes?.[id]?.min;
    const okMin = !rmin || node.getName().endsWith("__lod") || b.min.every((v, i) => Math.abs(v - rmin[i]) <= tol(rmin[i]));
    if (!okDims || !okMin) problems.push(`${node.getName()} bounds ${JSON.stringify(dims.map((d) => +d.toFixed(2)))} min ${JSON.stringify(b.min.map((d) => +d.toFixed(2)))} vs ${JSON.stringify(ref)} / ${JSON.stringify(rmin)}`);
    if (EXPECT[id] && !node.getName().endsWith("__lod")) log("verify", `${node.getName()} ${dims.map((d) => d.toFixed(2)).join(" x ")} m (expected ${EXPECT[id].join(" x ")})`);
  }
  const exts = root.listExtensionsUsed().map((e) => e.extensionName);
  if (problems.length) throw new Error(`verify ${file}:\n  ` + problems.join("\n  "));
  log("verify", `${file}: ${names.size} nodes, names intact, bounds match; extensions ${exts.join(", ")}`);
  return { nodes: [...names], extensions: exts };
}

if (process.argv[1]?.endsWith("verify.mjs")) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error("usage: verify.mjs <kit.glb>");
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const report = fs.existsSync(WORK.report) ? readJson(WORK.report) : null;
  await verifyGlb(io, file, readPalette(), report);
}
