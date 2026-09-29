// Shared configuration for the city-kit pipeline (P1-ART-09).
//
// Environment:
//   CITY_PACKAGE  path to the Leartes .unitypackage (default: the copy in
//                 "<repo>/Landing Page 3D Objects/")
//   CITY_WORK     scratch directory for the extracted package and the raw
//                 glTF build (default: the Claude session scratchpad when it
//                 exists, so already-extracted files are reused; otherwise
//                 <os tmp>/sponsorx-city-kit)
//   BLENDER       Blender 4.5 executable
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND = path.resolve(HERE, "..", "..");
export const REPO = path.resolve(FRONTEND, "..");

const SCRATCH =
  "C:/Users/GANIEL~1/AppData/Local/Temp/claude/d--iCARRe-Solutions-sponsorX-dev/c93d8836-f357-400c-b0fa-9e583b50d735/scratchpad";

export const CITY_PACKAGE =
  process.env.CITY_PACKAGE ||
  path.join(REPO, "Landing Page 3D Objects", "Modular Stylized Cyberpunk Street v.1.0.unitypackage");

export const CITY_WORK =
  process.env.CITY_WORK || (fs.existsSync(SCRATCH) ? SCRATCH : path.join(os.tmpdir(), "sponsorx-city-kit"));

export const BLENDER = process.env.BLENDER || defaultBlender();

/** Package-internal prefix that every asset we care about lives under. */
export const PKG_PREFIX = "Assets/LeartesStudios/Cyberpunk/";

export const OUT = {
  models: path.join(FRONTEND, "public", "models", "city"),
  textures: path.join(FRONTEND, "public", "textures", "city"),
  manifest: path.join(FRONTEND, "src", "lib", "city", "kit-manifest.json"),
  palette: path.join(FRONTEND, "src", "lib", "city", "palette.ts"),
};

export const WORK = {
  upkg: path.join(CITY_WORK, "upkg"),
  guidMap: path.join(CITY_WORK, "guid_map.json"),
  cyber: path.join(CITY_WORK, "cyber"),
  materials: path.join(CITY_WORK, "materials.json"),
  build: path.join(CITY_WORK, "build"),
  job: path.join(CITY_WORK, "build", "export-job.json"),
  rawGlb: path.join(CITY_WORK, "build", "city-kit.raw.glb"),
  report: path.join(CITY_WORK, "build", "export-report.json"),
  texDir: path.join(CITY_WORK, "build", "tex"),
  blenderLog: path.join(CITY_WORK, "build", "blender.log"),
};

/** Blender material slot name -> .mat name, for the slots that do not simply
 *  strip MI_/MM_ -> M_. `__grey__` is a synthetic flat mid-grey material. */
export const ALIAS = {
  M_Windows_Emissive_01: "M_Window_Emissive_01",
  M_Hologram_Burger: "M_HologramBurger",
  M_Hologram_Noodle: "M_HologramNoodle",
  M_Hologram_Pizza: "M_HologramPizza",
  M_Holograms_Drone: "M_HologramDrone",
  M_Standing_Billboard: "M_Standing_Bilboard",
  M_Glass: "M_WindowGlasses",
  M_CubeMap_01: "00_Cube",
  M_CubeMap_02: "00_CubeMap_02",
  WorldGridMaterial: "__grey__",
};

/** Size budgets for the committed GLBs (MB, decimal). */
export const BUDGET_MB = { desktop: 14, lite: 6 };

function defaultBlender() {
  const candidates = [
    "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe",
    "/Applications/Blender.app/Contents/MacOS/Blender",
    "/usr/bin/blender",
  ];
  return candidates.find((c) => fs.existsSync(c)) || "blender";
}

/** Strip the package prefix so paths match the `cyber/` tree. */
export function rel(pathname) {
  const p = pathname.replace(/\\/g, "/");
  if (p.startsWith(PKG_PREFIX)) return p.slice(PKG_PREFIX.length);
  return p.replace(/^Assets\//, "");
}

/** Mesh id from an FBX/OBJ file name: `SM_Module_4x4_06@000001A9A17CE400.fbx` -> `SM_Module_4x4_06`. */
export function meshIdOf(file) {
  return path
    .basename(file.replace(/\\/g, "/"))
    .replace(/@[0-9A-Fa-f]+/, "")
    .replace(/\.(fbx|obj)$/i, "");
}

/**
 * Read `PALETTE` from src/lib/city/palette.ts without a TypeScript toolchain.
 * Returns { id: { tiers: string[], lod: boolean, textureSize: number } }.
 */
export function readPalette(file = OUT.palette) {
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf("export const PALETTE");
  if (start < 0) throw new Error(`PALETTE not found in ${file}`);
  const body = src.slice(start, src.indexOf("\n};", start));
  const out = {};
  for (const m of body.matchAll(/^\s*(SM_[A-Za-z0-9_]+)\s*:\s*\{([^}]*)\}/gm)) {
    const [, id, b] = m;
    const t = b.match(/tiers:\s*([A-Z_]+|\[[^\]]*\])/)?.[1] ?? "BOTH";
    let tiers;
    if (t === "BOTH") tiers = ["desktop", "lite"];
    else if (t === "DESKTOP") tiers = ["desktop"];
    else if (t === "LITE") tiers = ["lite"];
    else tiers = [...t.matchAll(/"(desktop|lite)"/g)].map((x) => x[1]);
    out[id] = {
      tiers,
      lod: /lod:\s*true/.test(b),
      textureSize: Number(b.match(/textureSize:\s*(\d+)/)?.[1] ?? 512),
    };
  }
  if (!Object.keys(out).length) throw new Error(`no PALETTE entries parsed from ${file}`);
  return out;
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, data, indent = 1) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, indent));
}

export function fmtMB(bytes) {
  return (bytes / 1e6).toFixed(2) + " MB";
}

export function log(step, ...rest) {
  console.log(`[city-kit${step ? ":" + step : ""}]`, ...rest);
}

export function fwd(p) {
  return p.replace(/\\/g, "/");
}
