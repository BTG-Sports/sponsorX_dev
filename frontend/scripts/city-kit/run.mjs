#!/usr/bin/env node
// City-kit pipeline orchestrator (P1-ART-09).
//
//   npm run city:kit -w @sponsorx/frontend -- [--tier desktop|lite|both] [--skip-extract] [--skip-blender]
//
// extract -> resolve -> Blender export (raw GLB + report + env.hdr) -> optimize
// per tier -> manifest. See README.md in this folder.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { ALIAS, BLENDER, BUDGET_MB, CITY_PACKAGE, CITY_WORK, HERE, OUT, WORK, fmtMB, fwd, log, meshIdOf, readJson, readPalette, writeJson } from "./lib.mjs";
import { extract } from "./extract.mjs";
import { resolve } from "./resolve.mjs";
import { optimize } from "./optimize.mjs";
import { writeManifest } from "./manifest.mjs";
import { verifyGlb } from "./verify.mjs";

function parseArgs(argv) {
  const a = { tier: "both", skipExtract: false, skipBlender: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--tier") a.tier = argv[++i];
    else if (x.startsWith("--tier=")) a.tier = x.slice(7);
    else if (x === "--skip-extract") a.skipExtract = true;
    else if (x === "--skip-blender") a.skipBlender = true;
    else if (x === "-h" || x === "--help") {
      console.log("usage: run.mjs [--tier desktop|lite|both] [--skip-extract] [--skip-blender]");
      process.exit(0);
    } else throw new Error(`unknown argument ${x}`);
  }
  if (!["desktop", "lite", "both"].includes(a.tier)) throw new Error(`--tier must be desktop|lite|both, got ${a.tier}`);
  return a;
}

function findFbx(id) {
  const dir = path.join(WORK.cyber, "Meshes");
  const files = fs.readdirSync(dir).filter((f) => /\.(fbx|obj)$/i.test(f) && meshIdOf(f) === id);
  files.sort((a, b) => (a.includes("@") ? 1 : 0) - (b.includes("@") ? 1 : 0) || a.localeCompare(b));
  return files[0] ? path.join(dir, files[0]) : null;
}

/** Build build/export-job.json for bl_export.py from the palette + resolved materials. */
function buildJob(palette, resolved) {
  const cyber = (r) => {
    const a = path.join(WORK.cyber, r);
    return fs.existsSync(a) ? fwd(a) : null;
  };
  const meshes = [];
  const missing = [];
  for (const [id, e] of Object.entries(palette)) {
    const file = findFbx(id);
    if (!file) {
      missing.push(id);
      continue;
    }
    const renderer = resolved.prefabs[id]?.renderers.find((r) => meshIdOf(r.mesh) === id);
    meshes.push({ id, file: fwd(file), lod: !!e.lod, tiers: e.tiers, textureSize: e.textureSize, prefabMaterials: renderer?.materials ?? null });
  }
  if (missing.length) throw new Error(`palette meshes without an FBX in ${WORK.cyber}/Meshes: ${missing.join(", ")}`);

  const materials = {};
  for (const [name, m] of Object.entries(resolved.mats)) {
    const live = {};
    for (const [role, r] of Object.entries(m.live)) {
      const p = cyber(r);
      if (p) live[role] = p;
    }
    const colors = { ...m.colors };
    for (const [k, v] of Object.entries(m.props)) if (Array.isArray(v)) colors[k] = v;
    materials[name] = { shader: m.shader, shaderKnown: m.shaderKnown, live, floats: m.floats, colors, props: m.props, flags: m.flags };
  }
  materials.__grey__ = { shader: "synthetic", shaderKnown: false, live: {}, floats: {}, colors: { _BaseColor: [0.5, 0.5, 0.5, 1] }, props: {}, flags: {} };

  const texDir = path.join(WORK.cyber, "Art", "Textures");
  const env = {
    candidates: ["T_Cubemap_Blue.HDR", "BACKGROUND_SKY.HDR", "T_Cubemap_Yellow.HDR", "T_CubeMap01.HDR"].map((f) => fwd(path.join(texDir, f))),
    out: fwd(path.join(OUT.textures, "env.hdr")),
    size: [1024, 512],
  };
  const job = {
    meshes,
    materials,
    alias: ALIAS,
    maxTexture: 2048,
    out: { glb: fwd(WORK.rawGlb), report: fwd(WORK.report), texDir: fwd(WORK.texDir) },
    env,
  };
  writeJson(WORK.job, job);
  return job;
}

function runBlender() {
  if (!fs.existsSync(BLENDER) && BLENDER !== "blender") throw new Error(`BLENDER not found: ${BLENDER}`);
  const script = path.join(HERE, "bl_export.py");
  log("blender", `${BLENDER} -b --python ${script} -- ${WORK.job}`);
  const t0 = Date.now();
  const r = spawnSync(BLENDER, ["-b", "--python", script, "--", WORK.job], { encoding: "utf8", maxBuffer: 1 << 30 });
  const secs = (Date.now() - t0) / 1000;
  fs.writeFileSync(WORK.blenderLog, (r.stdout || "") + "\n--- stderr ---\n" + (r.stderr || ""));
  const lines = (r.stdout || "").split("\n").filter((l) => l.startsWith("[bl_export]"));
  for (const l of lines.filter((l) => /FAILED|NOT written|report ->|exported|materials,/.test(l))) console.log("  " + l);
  if (r.status !== 0 || !fs.existsSync(WORK.report)) {
    const tail = ((r.stderr || "") + "\n" + (r.stdout || "")).split("\n").slice(-25).join("\n");
    throw new Error(`Blender failed (exit ${r.status}); log: ${WORK.blenderLog}\n${tail}`);
  }
  log("blender", `done in ${secs.toFixed(0)}s (log: ${WORK.blenderLog})`);
  return secs;
}

/** Compare the export's LOD0 bounds against the committed manifest (all-objects bounds). */
function checkDims(report, palette) {
  const prev = fs.existsSync(OUT.manifest) ? readJson(OUT.manifest).meshes : {};
  const expect = { SM_Building_04: [18.83, 7.56, 14.55], SM_Fence: [0.12, 1.97, 2.81] };
  const problems = [];
  for (const id of Object.keys(palette)) {
    const r = report.meshes[id];
    if (!r || r.error) {
      problems.push(`${id}: ${r?.error ?? "missing from export"}`);
      continue;
    }
    const ref = expect[id] ?? prev[id]?.dims;
    if (!ref) continue;
    for (let i = 0; i < 3; i++) {
      const tol = Math.max(0.02, 0.02 * Math.abs(ref[i]));
      if (Math.abs(r.dims[i] - ref[i]) > tol) problems.push(`${id}: dims ${JSON.stringify(r.dims)} vs reference ${JSON.stringify(ref)}`);
    }
  }
  for (const [id, ref] of Object.entries(expect)) {
    const r = report.meshes[id];
    if (!r || r.error) throw new Error(`hard check: ${id} missing from the export`);
    const ok = r.dims.every((d, i) => Math.abs(d - ref[i]) <= Math.max(0.02, 0.02 * ref[i]));
    if (!ok) throw new Error(`hard check failed: ${id} dims ${JSON.stringify(r.dims)} expected ~${JSON.stringify(ref)} (unit scale / axis problem?)`);
    log("check", `${id} dims ${JSON.stringify(r.dims)} ~ ${JSON.stringify(ref)} ok`);
  }
  if (problems.length) log("check", `bounds differing >2% from the committed manifest:\n  ` + [...new Set(problems)].join("\n  "));
  else log("check", "all palette bounds within 2% of the committed manifest");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tiers = args.tier === "both" ? ["desktop", "lite"] : [args.tier];
  log("", `package: ${CITY_PACKAGE}`);
  log("", `work:    ${CITY_WORK}`);
  log("", `blender: ${BLENDER}`);
  fs.mkdirSync(WORK.build, { recursive: true });

  if (args.skipExtract) {
    if (!fs.existsSync(WORK.guidMap) || !fs.existsSync(path.join(WORK.cyber, "Meshes")))
      throw new Error(`--skip-extract but ${CITY_WORK} has no guid_map.json / cyber/Meshes — run without it first`);
    log("extract", "skipped");
  } else extract();

  const resolved = resolve();
  const palette = readPalette();
  const job = buildJob(palette, resolved);
  log("job", `${job.meshes.length} palette meshes (${job.meshes.filter((m) => m.lod).length} with __lod), ${job.meshes.filter((m) => m.prefabMaterials).length} with prefab slot order`);

  let blenderSecs = null;
  if (args.skipBlender) {
    if (!fs.existsSync(WORK.rawGlb) || !fs.existsSync(WORK.report)) throw new Error("--skip-blender but no raw GLB / report in build/");
    log("blender", `skipped, reusing ${WORK.rawGlb}`);
  } else blenderSecs = runBlender();
  const report = readJson(WORK.report);

  if (report.unresolved.length) log("blender", `UNRESOLVED material slots (exported flat grey):\n  ` + report.unresolved.map((u) => `${u.mesh} slot "${u.slot}" (tried ${u.tried})`).join("\n  "));
  else log("blender", "every material slot resolved");
  if (report.fallback.length) log("blender", `materials built without a base-colour map:\n  ` + report.fallback.map((f) => `${f.material} [${f.shader ?? ""}] ${f.why}`).join("\n  "));
  if (report.env) log("env", report.env.written ? `written ${report.env.out} from ${path.basename(report.env.source)} ${report.env.size.join("x")}` : `not written — ${report.env.reason}`);
  checkDims(report, palette);

  const results = [];
  for (const tier of tiers) {
    let shrink = 0;
    let stats;
    for (;;) {
      stats = await optimize({ tier, palette, shrink });
      if (stats.bytes <= BUDGET_MB[tier] * 1e6 || shrink >= 2) break;
      log("optimize", `${tier} over the ${BUDGET_MB[tier]} MB budget — lowering non-hero texture caps (shrink ${shrink + 1})`);
      shrink++;
    }
    results.push(stats);
  }

  writeManifest({ report, resolved });

  // verification: node names + bounds from the final GLBs
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  for (const s of results) await verifyGlb(io, s.file, palette, report);

  console.log("\n| tier | file | size | budget | nodes | tris | images | image bytes | shrink |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const s of results)
    console.log(`| ${s.tier} | ${path.relative(OUT.models, s.file)} | ${fmtMB(s.bytes)} | ${BUDGET_MB[s.tier]} MB ${s.bytes <= BUDGET_MB[s.tier] * 1e6 ? "ok" : "OVER"} | ${s.nodes.length} | ${s.tris} | ${s.images} | ${fmtMB(s.imageBytes)} | ${s.shrink} |`);
  if (blenderSecs != null) console.log(`\nBlender step: ${blenderSecs.toFixed(0)}s (${JSON.stringify(report.timing)})`);
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
