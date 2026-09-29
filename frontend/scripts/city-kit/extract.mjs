// Step 1 — extract the .unitypackage.
//
// A .unitypackage is a gzipped tar of <guid>/{asset,asset.meta,pathname}.
// We pull the small `pathname` sidecars first to build guid -> asset path, then
// extract only the members we need (meshes, materials, prefabs, textures,
// shader graphs) through a tar list file, and hard-link/copy them into
// CITY_WORK/cyber/<path relative to Assets/LeartesStudios/Cyberpunk/>.
//
// GNU tar (Git for Windows) reads "d:/..." as host:path unless --force-local;
// bsdtar (Windows System32) has no such flag, so we detect the flavour.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CITY_PACKAGE, CITY_WORK, PKG_PREFIX, WORK, log, rel, writeJson, readJson } from "./lib.mjs";

const WANT = /\.(fbx|obj|mat|prefab|tga|png|hdr|exr|shadergraph|shadersubgraph)$/i;

function tarFlavour() {
  const r = spawnSync("tar", ["--version"], { encoding: "utf8" });
  if (r.error) throw new Error(`tar not found on PATH: ${r.error.message}`);
  return /GNU tar/i.test(r.stdout || "") ? "gnu" : "bsd";
}

function runTar(args) {
  const r = spawnSync("tar", args, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    // tar exits non-zero when a listed member is missing; report and continue.
    log("extract", `tar exit ${r.status}: ${(r.stderr || "").trim().split("\n").slice(-3).join(" | ")}`);
  }
}

function linkOrCopy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.linkSync(src, dst);
  } catch {
    fs.copyFileSync(src, dst);
  }
}

export function extract({ pkg = CITY_PACKAGE, force = false } = {}) {
  if (!fs.existsSync(pkg)) throw new Error(`CITY_PACKAGE not found: ${pkg}`);
  fs.mkdirSync(WORK.upkg, { recursive: true });
  const flavour = tarFlavour();
  const base = flavour === "gnu" ? ["--force-local"] : [];
  log("extract", `package ${pkg}`);
  log("extract", `work ${CITY_WORK} (tar: ${flavour})`);

  // 1. guid -> pathname
  let map;
  if (!force && fs.existsSync(WORK.guidMap)) {
    map = readJson(WORK.guidMap);
    log("extract", `guid_map.json reused (${Object.keys(map).length} entries)`);
  } else {
    const t0 = Date.now();
    const wild = flavour === "gnu" ? ["--wildcards"] : [];
    runTar([...base, ...wild, "-xzf", pkg, "-C", WORK.upkg, "*/pathname"]);
    map = {};
    for (const guid of fs.readdirSync(WORK.upkg)) {
      const p = path.join(WORK.upkg, guid, "pathname");
      if (!fs.existsSync(p)) continue;
      const name = fs.readFileSync(p, "utf8").split(/\r?\n/)[0].trim();
      if (name) map[guid] = name;
    }
    writeJson(WORK.guidMap, map);
    log("extract", `guid_map.json: ${Object.keys(map).length} entries in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // 2. the members we need
  const want = Object.entries(map).filter(([, n]) => n.startsWith(PKG_PREFIX) && WANT.test(n));
  const missing = want.filter(([g]) => !fs.existsSync(path.join(WORK.upkg, g, "asset")));
  if (missing.length) {
    const t0 = Date.now();
    const listFile = path.join(CITY_WORK, "tar_list.txt");
    fs.writeFileSync(listFile, missing.flatMap(([g]) => [`${g}/asset`, `${g}/asset.meta`]).join("\n") + "\n");
    log("extract", `extracting ${missing.length} assets ...`);
    runTar([...base, "-xzf", pkg, "-C", WORK.upkg, "-T", listFile]);
    log("extract", `tar done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } else {
    log("extract", `all ${want.length} wanted assets already in upkg/`);
  }

  // 3. lay them out as cyber/<rel path>
  let placed = 0,
    skipped = 0,
    bytes = 0;
  for (const [g, name] of want) {
    const src = path.join(WORK.upkg, g, "asset");
    if (!fs.existsSync(src)) {
      skipped++;
      continue;
    }
    const dst = path.join(WORK.cyber, rel(name));
    if (!fs.existsSync(dst)) linkOrCopy(src, dst);
    const meta = src + ".meta";
    if (fs.existsSync(meta) && !fs.existsSync(dst + ".meta")) linkOrCopy(meta, dst + ".meta");
    bytes += fs.statSync(dst).size;
    placed++;
  }
  log("extract", `${placed} files in cyber/ (${(bytes / 1048576).toFixed(0)} MB), ${skipped} missing from the package`);
  return { map, placed, skipped };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("extract.mjs")) {
  extract({ force: process.argv.includes("--force") });
}
