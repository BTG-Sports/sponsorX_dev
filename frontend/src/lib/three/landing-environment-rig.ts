import * as THREE from "three";
import { CHAPTERS } from "@/lib/landing-chapters";
import type { ChapterAt } from "@/lib/landing-scene-math";
import { LandingAssets } from "./landing-assets";

/* --------------------------------------------------------------------------
   Environment rig (P1-ART-08) — the world behind the ball, per chapter.

   Procedural base always present: scene fog, a dark floor, a faint grid, and an
   accent light that lerps blue↔orange as chapters change. When per-sport Tripo
   environment models exist in /models/landing they load lazily and fade in/out
   across the morph band; until then the procedural base carries the mood, so the
   scene looks intentional before that art is generated (spec §8, option B).
   -------------------------------------------------------------------------- */

const FOG_COLOR = 0x05070a;
const ACCENT = (i: number): number =>
  CHAPTERS[i].accent === "orange" ? 0xf97a1f : 0x2e9bf5;

export class LandingEnvironmentRig {
  private group = new THREE.Group();
  private floor: THREE.Mesh;
  private grid: THREE.GridHelper;
  private accentLight: THREE.PointLight;
  private envObjects: (THREE.Object3D | null)[] = CHAPTERS.map(() => null);
  private requested = new Set<number>();

  constructor(private scene: THREE.Scene, private assets: LandingAssets) {
    scene.fog = new THREE.Fog(FOG_COLOR, 6, 16);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.95, metalness: 0 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -1.4;

    this.grid = new THREE.GridHelper(60, 60, 0x2e9bf5, 0x162033);
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.14;
    this.grid.position.y = -1.39;

    this.accentLight = new THREE.PointLight(0xf97a1f, 6, 30, 2);
    this.accentLight.position.set(0, 2, 3);

    this.group.add(this.floor, this.grid, this.accentLight);
    scene.add(this.group);
  }

  private ensureEnv(index: number): void {
    if (index < 0 || index >= CHAPTERS.length || this.requested.has(index)) return;
    this.requested.add(index);
    const env = CHAPTERS[index].env;
    if (!env) return;
    this.assets.tryLoad(env).then((obj) => {
      if (!obj) return; // model not generated yet — procedural base stays
      obj.position.y = -1.3;
      obj.visible = false;
      this.envObjects[index] = obj;
      this.group.add(obj);
    });
  }

  update(at: ChapterAt): void {
    const { index, local } = at;
    this.ensureEnv(index);
    this.ensureEnv(index + 1);

    // Blend the accent from this chapter to the next across the morph tail.
    const next = Math.min(index + 1, CHAPTERS.length - 1);
    const band = 0.7;
    const tt = local > band ? (local - band) / (1 - band) : 0;
    const color = new THREE.Color(ACCENT(index)).lerp(new THREE.Color(ACCENT(next)), tt);
    this.accentLight.color.copy(color);
    (this.grid.material as THREE.LineBasicMaterial).color.copy(color).multiplyScalar(0.4);

    // Cross-fade env models (once any exist): current full, next grows in on the tail.
    for (let i = 0; i < this.envObjects.length; i++) {
      const o = this.envObjects[i];
      if (!o) continue;
      const s = i === index ? 1 : i === next && tt > 0 ? tt : 0;
      o.visible = s > 0.001;
      o.scale.setScalar(Math.max(0.0001, s));
    }
  }

  dispose(): void {
    this.scene.fog = null;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.scene.remove(this.group);
  }
}
