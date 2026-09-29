// Step 2 — resolve Unity materials and prefabs.
//
// .mat files keep an m_TexEnvs entry for every texture property the material
// has EVER had, including properties of shaders it no longer uses (a material
// copied from M_ATM and re-pointed at the hologram shader still lists the ATM
// maps). So we parse each .shadergraph's property list and only trust texture
// properties the material's current shader actually declares ("live"); the
// property's display name gives the role. When the shader is unknown (built-in
// HDRP shaders) we fall back to the file-name suffix (_B/_N/_ORM/_E/_O...) and
// prefer candidates whose name contains the material's own name.
//
// Output: CITY_WORK/materials.json
//   shaders: { S_Name: { guid, props: { ref: { name, kind, role } } } }
//   mats:    { M_Name: { file, guid, shader, shaderKnown, textures: {role: [rel...]},
//              live: {role: rel}, floats, colors, props, flags } }
//   prefabs: { name: { renderers: [{ mesh: rel, materials: [M_Name|null] }],
//              meshes: [...], materials: [...] } }
import fs from "node:fs";
import path from "node:path";
import { WORK, log, rel, readJson, writeJson } from "./lib.mjs";

/** Role from a shader-graph property display name. */
export function roleFromDisplay(name) {
  const s = name.toLowerCase().replace(/[\s_()\-]/g, "");
  if (/second|material02|main2|backside|paintmask|tilingmask|grunge|hologramtexture|texturecube|stars|^(red|green|blue)/.test(s))
    return "OTHER";
  if (/opacity|alpha|mask/.test(s)) return "O";
  if (/normal/.test(s)) return "N";
  if (/orm/.test(s)) return "ORM";
  if (/emiss|emission/.test(s)) return "E";
  if (/rough|gloss/.test(s)) return "R";
  if (/metal/.test(s)) return "M";
  if (/(^|[^a-z])ao|occlusion/.test(s)) return "AO";
  if (/base|albedo|diffuse|colou?r|maintex|basetex/.test(s)) return "B";
  return "OTHER";
}

/** Role from a texture file-name suffix (fallback when the shader is unknown). */
export function roleFromSuffix(file) {
  const b = path.basename(file).replace(/\.[^.]+$/, "");
  const m = b.match(/_(B|N|ORM|E|O|M|R|AO|A|H|AORM)$/i);
  return m ? m[1].toUpperCase() : "OTHER";
}

function parseShaderGraph(text) {
  const props = {};
  for (const block of text.split(/\r?\n\s*\r?\n/)) {
    const type = block.match(/"m_Type":\s*"([^"]+)"/)?.[1];
    if (!type || !/ShaderProperty$/.test(type)) continue;
    const name = block.match(/"m_Name":\s*"([^"]*)"/)?.[1] ?? "";
    const ref = block.match(/"m_OverrideReferenceName":\s*"([^"]+)"/)?.[1] || block.match(/"m_DefaultReferenceName":\s*"([^"]*)"/)?.[1];
    if (!ref) continue;
    const kind = type.split(".").pop().replace("ShaderProperty", "");
    props[ref] = { name, kind, role: kind === "Texture2D" ? roleFromDisplay(name) : null };
  }
  return props;
}

const tokenOf = (n) => n.replace(/^(M_|MI_|MM_)/, "").replace(/[\s_\-]/g, "").toLowerCase();

/** Order candidates so the one carrying the material's own name comes first. */
function preferByToken(list, matName) {
  const tok = tokenOf(matName);
  const score = (p) => (tok && tokenOf(path.basename(p)).includes(tok) ? 0 : 1);
  return [...new Set(list)].sort((a, b) => score(a) - score(b));
}

export function resolve() {
  const guidMap = readJson(WORK.guidMap);
  const pathToGuid = Object.fromEntries(Object.entries(guidMap).map(([g, n]) => [rel(n), g]));
  const assetFile = (r) => {
    const a = path.join(WORK.cyber, r);
    if (fs.existsSync(a)) return a;
    const g = pathToGuid[r];
    const b = g && path.join(WORK.upkg, g, "asset");
    return b && fs.existsSync(b) ? b : null;
  };
  const basenameOf = (guid) => (guidMap[guid] ? path.basename(guidMap[guid]) : null);

  // --- shader graphs -------------------------------------------------------
  const shaders = {};
  for (const [guid, name] of Object.entries(guidMap)) {
    if (!/\.shadergraph$/i.test(name)) continue;
    const f = assetFile(rel(name));
    if (!f) continue;
    shaders[path.basename(name)] = { guid, props: parseShaderGraph(fs.readFileSync(f, "utf8")) };
  }

  // --- materials -----------------------------------------------------------
  const matsDir = path.join(WORK.cyber, "Art", "Materials");
  const mats = {};
  for (const f of fs.readdirSync(matsDir)) {
    if (!f.endsWith(".mat")) continue;
    const body = fs.readFileSync(path.join(matsDir, f), "utf8");
    const name = body.match(/m_Name: (.+)/)?.[1]?.trim() || f.replace(/\.mat$/, "");
    const guid = pathToGuid[`Art/Materials/${f}`] ?? null;
    const shaderGuid = body.match(/m_Shader: \{fileID: [^,]+, guid: ([0-9a-f]{32})/)?.[1];
    const shader = (shaderGuid && basenameOf(shaderGuid)) || shaderGuid || "unknown";
    const sg = shaders[shader];
    const shaderKnown = !!sg;

    const floats = {};
    for (const m of body.matchAll(/^\s+- ([A-Za-z0-9_]+): (-?[\d.]+(?:[eE][-+]?\d+)?)\s*$/gm)) floats[m[1]] = parseFloat(m[2]);
    const colors = {};
    for (const m of body.matchAll(/^\s+- ([A-Za-z0-9_]+): \{r: ([-\d.eE+]+), g: ([-\d.eE+]+), b: ([-\d.eE+]+), a: ([-\d.eE+]+)\}/gm))
      colors[m[1]] = [+m[2], +m[3], +m[4], +m[5]];

    // display-named scalar/colour props of the live shader
    const props = {};
    if (sg) {
      for (const [ref, p] of Object.entries(sg.props)) {
        if (ref in floats) props[p.name] = floats[ref];
        else if (ref in colors) props[p.name] = colors[ref];
      }
    }

    const textures = {};
    const stale = [];
    const texRe = /- ([A-Za-z0-9_]+):\r?\n\s+m_Texture: \{fileID: \d+, guid: ([0-9a-f]{32})/g;
    for (const m of body.matchAll(texRe)) {
      const tp = guidMap[m[2]];
      if (!tp) continue; // texture outside the package
      const r = rel(tp);
      let role;
      if (sg) {
        const p = sg.props[m[1]];
        if (!p || p.kind !== "Texture2D") {
          stale.push(r);
          continue;
        }
        role = p.role;
      } else {
        role = roleFromSuffix(r);
      }
      (textures[role] ||= []).push(r);
    }
    if (!sg) for (const k of Object.keys(textures)) textures[k] = preferByToken(textures[k], name);
    const live = {};
    for (const k of Object.keys(textures)) live[k] = textures[k][0];

    const hologram = /^S_Hologram/.test(shader);
    const maskToggle = props["Opacity Mask?"] === 1 || floats._AlphaCutoffEnable === 1;
    const alphaMask = !!live.O && (maskToggle || /^M_(Fence|Fence_\d+|Leaf_?\d*|Curtain)/i.test(name));
    const doubleSided = hologram || floats._DoubleSidedEnable === 1 || /^M_(Leaf|Fence)/i.test(name);
    mats[name] = {
      file: f,
      guid,
      shader,
      shaderKnown,
      textures,
      live,
      stale,
      floats,
      colors,
      props,
      flags: { hologram, alphaMask, doubleSided, maskToggle: !!maskToggle },
    };
  }

  // --- prefabs -------------------------------------------------------------
  const prefDir = path.join(WORK.cyber, "Prefabs");
  const prefabs = {};
  for (const f of fs.readdirSync(prefDir)) {
    if (!f.endsWith(".prefab")) continue;
    const body = fs.readFileSync(path.join(prefDir, f), "utf8");
    const filters = new Map(); // gameObject -> mesh rel
    const renders = new Map(); // gameObject -> [material names]
    for (const d of body.split(/^--- !u!/m).slice(1)) {
      const h = d.match(/^(\d+) &(-?\d+)/);
      if (!h) continue;
      const go = d.match(/m_GameObject: \{fileID: (-?\d+)\}/)?.[1];
      if (h[1] === "33") {
        const g = d.match(/m_Mesh: \{fileID: -?\d+, guid: ([0-9a-f]{32})/)?.[1];
        if (g) filters.set(go, guidMap[g] ? rel(guidMap[g]) : g);
      } else if (h[1] === "23") {
        const block = d.match(/m_Materials:\r?\n((?:\s+- \{[^\n]*\r?\n)+)/)?.[1] ?? "";
        const names = [...block.matchAll(/guid: ([0-9a-f]{32})/g)].map((m) => {
          const n = basenameOf(m[1]);
          return n ? n.replace(/\.mat$/, "") : null;
        });
        renders.set(go, names);
      }
    }
    const renderers = [];
    for (const [go, mesh] of filters) renderers.push({ mesh, materials: renders.get(go) ?? [] });
    prefabs[f.replace(/\.prefab$/, "")] = {
      renderers,
      meshes: [...new Set(renderers.map((r) => r.mesh))],
      materials: [...new Set(renderers.flatMap((r) => r.materials).filter(Boolean))],
    };
  }

  const out = { shaders, mats, prefabs };
  writeJson(WORK.materials, out);

  const known = Object.values(mats).filter((m) => m.shaderKnown).length;
  const noBase = Object.entries(mats)
    .filter(([, m]) => !m.live.B)
    .map(([n]) => n);
  log("resolve", `${Object.keys(shaders).length} shader graphs, ${Object.keys(mats).length} materials (${known} on a known shader), ${Object.keys(prefabs).length} prefabs`);
  log("resolve", `materials without a live base-colour map (${noBase.length}): ${noBase.join(", ")}`);
  return out;
}

if (process.argv[1]?.endsWith("resolve.mjs")) resolve();
