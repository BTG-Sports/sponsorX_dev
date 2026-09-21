import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* --------------------------------------------------------------------------
   Landing glTF asset loader (P1-ART-08).

   Loads Tripo models from /models/landing, normalizes each to a consistent
   centered size (Tripo output has arbitrary scale/pivot), caches by filename,
   and — critically — falls back to a tinted sphere on any load error so the
   scene always runs, even before art lands or if a file is missing/undecodable.
   Meshopt is wired up; Draco is not (dev assets are uncompressed). If a model
   renders as a flat sphere at runtime, it needs a decoder — see the plan.
   -------------------------------------------------------------------------- */

const BASE = "/models/landing/";
/** Normalized half-extent: every model is scaled so its largest side ≈ 2 units. */
const TARGET_RADIUS = 1;

export class LandingAssets {
  private loader = new GLTFLoader();
  private cache = new Map<string, THREE.Object3D>();
  private pending = new Map<string, Promise<THREE.Object3D>>();

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  /** Wrap in a group, recenter, and scale to the target size. */
  private normalize(obj: THREE.Object3D): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const group = new THREE.Group();
    group.add(obj);
    group.scale.setScalar((TARGET_RADIUS * 2) / maxDim);
    return group;
  }

  /** A tinted sphere stand-in (fallback + hero/immediate placeholder). */
  placeholder(color: number): THREE.Object3D {
    return new THREE.Mesh(
      new THREE.SphereGeometry(TARGET_RADIUS, 48, 48),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 }),
    );
  }

  /** Load a model (cached). Resolves to a normalized object, or a tinted sphere
   *  on any error — never rejects, so callers don't need try/catch. */
  load(file: string, fallbackColor: number): Promise<THREE.Object3D> {
    const cached = this.cache.get(file);
    if (cached) return Promise.resolve(cached);
    const inflight = this.pending.get(file);
    if (inflight) return inflight;

    const p = new Promise<THREE.Object3D>((resolve) => {
      this.loader.load(
        BASE + file,
        (gltf) => {
          const o = this.normalize(gltf.scene);
          this.cache.set(file, o);
          resolve(o);
        },
        undefined,
        () => {
          const o = this.placeholder(fallbackColor);
          this.cache.set(file, o);
          resolve(o);
        },
      );
    });
    this.pending.set(file, p);
    return p;
  }
}
