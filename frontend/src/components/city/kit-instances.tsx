/* --------------------------------------------------------------------------
   Kit instances (P1-ART-09) — every kit-mesh placement in the layout, drawn
   as GPU instances.

   Loads the tier's GLB (`/models/city/city-kit.glb` or `city-kit-lite.glb`,
   Meshopt-compressed — drei's `useGLTF(url, false, true)` wires
   three-stdlib's MeshoptDecoder into the GLTFLoader). Nodes in the GLB are
   named by kit mesh id (`SM_Building_04`), decimated variants `<id>__lod`. For
   each distinct node referenced by the layout (resolved for `lod: "far"`), the
   node's mesh primitives are collected and one `THREE.InstancedMesh` is built
   per primitive, sharing the GLB's geometry and material, with one instance
   matrix per placement (position · yaw about +Y · scale). Procedural `box:`
   placements are the venues module's job and are skipped here.

   Materials are the GLB's own; any with an emissive map gets its intensity
   raised once so the signage and windows read through Bloom. Layout mesh ids
   the GLB does not carry are logged once in dev and otherwise ignored, so a
   layout ahead of the kit export still renders everything it can.

   A missing or failed GLB renders nothing (see asset-guard.tsx).
   -------------------------------------------------------------------------- */

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import type { Tier } from "@/lib/city/palette";
import type { CityLayout, Placement } from "@/lib/city/types";

import { AssetErrorBoundary, devWarnOnce, useAssetAvailable } from "./asset-guard";

/** What drei hands back for one URL: the parsed glTF plus its name → object
 *  maps. Derived from the hook so no direct dependency on three-stdlib. */
type Kit = ReturnType<typeof useGLTF<string>>;

export const KIT_URL: Record<Tier, string> = {
  desktop: "/models/city/city-kit.glb",
  lite: "/models/city/city-kit-lite.glb",
};

const EMISSIVE_BOOST: Record<Tier, number> = { desktop: 2.2, lite: 1.6 };
const DEG = Math.PI / 180;

/** Materials already boosted — the GLB is cached by drei, so this runs once
 *  per material for the page's life even if the world re-mounts. */
const boosted = new WeakSet<THREE.Material>();

export interface KitInstancesProps {
  layout: CityLayout;
  tier: Tier;
  /** Fires once the kit is on screen — or once it is known there is none to
   *  wait for (missing file, failed parse). The scene's fade-in and FPS
   *  watchdog key off this rather than the first (empty) frame. */
  onSettled?: () => void;
}

export function KitInstances({ layout, tier, onSettled }: KitInstancesProps) {
  const url = KIT_URL[tier];
  const status = useAssetAvailable(url);

  useEffect(() => {
    if (status === "missing") onSettled?.();
  }, [status, onSettled]);

  if (status !== "ok") return null;
  return (
    <AssetErrorBoundary label={`kit ${url}`} onFail={onSettled}>
      <LoadedKit url={url} layout={layout} tier={tier} onSettled={onSettled} />
    </AssetErrorBoundary>
  );
}

function LoadedKit({ url, layout, tier, onSettled }: KitInstancesProps & { url: string }) {
  // Draco off (the kit is not Draco-encoded), Meshopt on.
  const gltf = useGLTF(url, false, true);
  const meshes = useMemo(() => buildInstances(gltf, layout, tier), [gltf, layout, tier]);

  useEffect(() => () => disposeAll(meshes), [meshes]);

  // Runs after the instanced meshes have committed to the scene graph.
  useEffect(() => {
    onSettled?.();
  }, [onSettled]);

  return (
    <group name="city-kit">
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  );
}

/* ---- pure helpers ---------------------------------------------------------- */

/** Which GLB node a placement draws: the `__lod` variant for far placements
 *  when the GLB has it, else the base node, else null (not in this kit). */
function resolveNode(gltf: Kit, p: Placement): string | null {
  if (p.lod === "far" && gltf.nodes[`${p.mesh}__lod`]) return `${p.mesh}__lod`;
  if (gltf.nodes[p.mesh]) return p.mesh;
  return null;
}

function buildInstances(gltf: Kit, layout: CityLayout, tier: Tier): THREE.InstancedMesh[] {
  const groups = new Map<string, Placement[]>();
  const missing = new Set<string>();

  for (const p of layout.placements) {
    if (p.mesh.startsWith("box:")) continue;
    const node = resolveNode(gltf, p);
    if (!node) {
      missing.add(p.mesh);
      continue;
    }
    const list = groups.get(node);
    if (list) list.push(p);
    else groups.set(node, [p]);
  }

  if (missing.size) {
    devWarnOnce(
      `kit-missing:${tier}`,
      `[city] ${missing.size} layout mesh id(s) are not in the ${tier} kit GLB and were skipped:`,
      [...missing].sort().join(", "),
    );
  }

  // Materials are shared across primitives; boost each emissive one once.
  gltf.scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mat = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mat) ? mat : [mat]) boostEmissive(m, EMISSIVE_BOOST[tier]);
  });

  gltf.scene.updateMatrixWorld(true);

  const out: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scl = new THREE.Vector3();
  const local = new THREE.Matrix4();

  for (const [name, placements] of groups) {
    const node = gltf.nodes[name];

    const prims: THREE.Mesh[] = [];
    node.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) prims.push(o as THREE.Mesh);
    });

    for (const prim of prims) {
      // The primitive's full transform inside the GLB. The kit is authored at
      // the origin, but KHR_mesh_quantization puts a dequantisation
      // translation/scale on each node, so this is never the identity and must
      // sit between the placement transform and the quantized geometry.
      local.copy(prim.matrixWorld);
      const hasLocal = !isIdentity(local);

      const inst = new THREE.InstancedMesh(prim.geometry, prim.material, placements.length);
      inst.name = `${name}:${prim.name || prims.indexOf(prim)}`;
      inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      placements.forEach((p, i) => {
        pos.set(p.position[0], p.position[1], p.position[2]);
        euler.set(0, p.yaw * DEG, 0);
        quat.setFromEuler(euler);
        if (typeof p.scale === "number") scl.set(p.scale, p.scale, p.scale);
        else scl.set(p.scale[0], p.scale[1], p.scale[2]);
        matrix.compose(pos, quat, scl);
        if (hasLocal) matrix.multiply(local);
        inst.setMatrixAt(i, matrix);
      });

      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = true;
      inst.computeBoundingSphere();
      out.push(inst);
    }
  }

  return out;
}

function boostEmissive(m: THREE.Material, intensity: number) {
  if (boosted.has(m)) return;
  boosted.add(m);
  const std = m as THREE.MeshStandardMaterial;
  if (std.emissiveMap) std.emissiveIntensity = intensity;
}

function isIdentity(m: THREE.Matrix4): boolean {
  const e = m.elements;
  for (let i = 0; i < 16; i++) {
    const want = i % 5 === 0 ? 1 : 0;
    if (Math.abs(e[i] - want) > 1e-6) return false;
  }
  return true;
}

/** Releases the instance buffers. Geometry and materials belong to the cached
 *  GLB (drei's useGLTF) and stay alive for the page. */
function disposeAll(meshes: THREE.InstancedMesh[]) {
  for (const m of meshes) m.dispose();
}
