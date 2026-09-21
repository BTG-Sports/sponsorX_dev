import * as THREE from "three";
import { CHAPTERS } from "@/lib/landing-chapters";
import { morphState } from "@/lib/landing-scene-math";
import { LandingAssets } from "./landing-assets";

/* --------------------------------------------------------------------------
   Ball rig (P1-ART-08) — the centered hero object across all chapters.

   Owns one object per chapter (hero = procedural glowing orb; sports/finale =
   Tripo models via LandingAssets). Each frame, update() reads morphState and
   runs the spin-and-swap: the outgoing ball shrinks/spins out, the incoming
   ball grows/spins in, a blue→orange flash light peaks mid-swap, and the
   football gets a squash emphasis as it forms. Models load lazily with an
   instant tinted-sphere placeholder so nothing pops in blank.
   -------------------------------------------------------------------------- */

const ACCENT_HEX: Record<"blue" | "orange", number> = {
  blue: 0x2e9bf5,
  orange: 0xf97a1f,
};

const smoothstep = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export class LandingBallRig {
  private group = new THREE.Group();
  private flash: THREE.PointLight;
  private objects: (THREE.Object3D | null)[] = CHAPTERS.map(() => null);
  private spin = 0;

  constructor(private scene: THREE.Scene, private assets: LandingAssets) {
    scene.add(this.group);
    this.flash = new THREE.PointLight(0xffffff, 0, 10, 2);
    this.flash.position.set(0, 0, 2.6);
    scene.add(this.flash);
    this.ensure(0);
    this.ensure(1);
  }

  /** Make sure chapter `index` has an object (placeholder now, model when loaded).
   *  The display object is a WRAPPER group the morph scales — the inner model
   *  keeps its own normalization scale, so scaling for the swap never resets it. */
  private ensure(index: number): void {
    if (index < 0 || index >= CHAPTERS.length || this.objects[index]) return;
    const ch = CHAPTERS[index];
    const accent = ACCENT_HEX[ch.accent];

    const wrapper = new THREE.Group();
    wrapper.visible = false;
    this.objects[index] = wrapper;
    this.group.add(wrapper);

    if (!ch.ball) {
      // Hero: procedural glowing brand orb.
      wrapper.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(1, 48, 48),
          new THREE.MeshStandardMaterial({
            color: 0x0a0c10,
            emissive: accent,
            emissiveIntensity: 0.9,
            roughness: 0.3,
            metalness: 0.0,
          }),
        ),
      );
      return;
    }

    // Sport / finale: placeholder immediately, swap to the model inside the wrapper.
    const ph = this.assets.placeholder(accent);
    wrapper.add(ph);
    this.assets.load(ch.ball, accent).then((model) => {
      if (this.objects[index] !== wrapper) return; // superseded
      wrapper.remove(ph);
      wrapper.add(model);
    });
  }

  /** Move the whole ball (and its flash light) to a world-Y as it falls the shaft. */
  setWorldY(y: number): void {
    this.group.position.y = y;
    this.flash.position.set(0, y, 2.6);
  }

  private show(index: number, scale: number, sx = scale, sy = scale): void {
    const o = this.objects[index];
    if (!o) return;
    o.visible = scale > 0.001;
    o.scale.set(Math.max(0.0001, sx), Math.max(0.0001, sy), Math.max(0.0001, scale));
    o.rotation.y = this.spin;
  }

  update(progress: number, dt: number): void {
    const { from, to, t } = morphState(progress);
    this.ensure(from);
    this.ensure(to);
    if (to !== from) this.ensure(to + 1); // preload the one after

    // Base idle spin, ramped hard during a swap.
    this.spin += (0.4 + t * 6) * dt;

    // Reset anything not involved this frame.
    for (let i = 0; i < this.objects.length; i++) {
      if (i !== from && i !== to) this.show(i, 0);
    }

    if (t === 0) {
      this.show(from, 1);
      this.flash.intensity = 0;
      return;
    }

    const fromScale = 1 - smoothstep(t);
    const toScale = smoothstep(Math.max(0, (t - 0.35) / 0.65));
    this.show(from, fromScale);

    if (CHAPTERS[to].squash) {
      // Football forms with a squash: wide-and-short easing to its prolate shape.
      this.show(to, toScale, toScale * 1.12, toScale * 0.82);
    } else {
      this.show(to, toScale);
    }

    // Flash peaks mid-swap, blue on the way in → orange on the way out.
    this.flash.intensity = Math.sin(t * Math.PI) * 7;
    this.flash.color.setHex(t < 0.5 ? 0x2e9bf5 : 0xf97a1f);
  }

  dispose(): void {
    this.scene.remove(this.flash);
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
