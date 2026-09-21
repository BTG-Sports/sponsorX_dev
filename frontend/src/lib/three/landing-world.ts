import * as THREE from "three";
import { CHAPTERS, SECTION_COUNT, type Chapter } from "@/lib/landing-chapters";
import { chapterAt, clamp01 } from "@/lib/landing-scene-math";
import {
  soccerGround,
  basketballGround,
  baseballGround,
  footballGround,
} from "./landing-textures";

/* --------------------------------------------------------------------------
   Stacked vertical world (P1-ART-08). Six stadium "levels" stacked down the Y
   axis with dark rock strata (the underground) between them, built from
   primitives + procedural textures. The ball falls down this shaft, landing in
   each stadium and morphing in the dark between; the camera follows it down.
   Tunable constants up top — expect to eyeball GAP / camera / fog.
   -------------------------------------------------------------------------- */

export const GAP = 26; // vertical distance between consecutive stadium floors
export const REST_ABOVE = 1.0; // ball-centre height above the floor when landed (radius≈1 → sits on it)
export const SKY = 9; // how high above level 0 the ball starts (its "sky")
const GROUND = 60; // ground plane size
const STAND_R = 22; // stadium stand-ring radius

// Fog framing: open at a stadium, collapsed to a near-black void mid-transition
// (only the morphing ball stays visible), which hides the stadium swap.
const FOG_OPEN_NEAR = 10;
const FOG_OPEN_FAR = 34;
const FOG_VOID_NEAR = 0.5;
const FOG_VOID_FAR = 6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const accentHex = (ch: Chapter) => (ch.accent === "orange" ? 0xf97a1f : 0x2e9bf5);

export const groundY = (i: number) => -i * GAP;
export const restY = (i: number) => groundY(i) + REST_ABOVE;

/** Ball world-Y across the whole scroll: falls from the sky into level 0, holds
 *  on each floor while its content is read (local 0.2–0.8), then falls through
 *  the earth into the next floor. Continuous and reversible. */
export function ballWorldY(p: number): number {
  const n = SECTION_COUNT;
  const P = clamp01(p) * n;
  const c = Math.min(n - 1, Math.floor(P));
  const local = P - c;
  const HOLD_A = 0.2;
  const HOLD_B = 0.8;
  const GAP_LEN = 1 - HOLD_B + HOLD_A; // 0.4 of a chapter spans a fall

  if (local >= HOLD_A && local <= HOLD_B) return restY(c);

  if (local < HOLD_A) {
    if (c === 0) return lerp(restY(0) + SKY, restY(0), smooth(local / HOLD_A));
    const t = smooth((local + (1 - HOLD_B)) / GAP_LEN); // second half of the gap fall
    return lerp(restY(c - 1), restY(c), t);
  }
  // local > HOLD_B — departing c toward c+1
  if (c === n - 1) return restY(c);
  const t = smooth((local - HOLD_B) / GAP_LEN); // first half of the gap fall
  return lerp(restY(c), restY(c + 1), t);
}

export class LandingWorld {
  private group = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  /** Per-level fade targets: materials + lights fade out as you leave a stadium
   *  and in as you arrive, so the previous world vanishes during the transition. */
  private levels: { mats: THREE.Material[]; lights: { light: THREE.PointLight; base: number }[] }[] =
    CHAPTERS.map(() => ({ mats: [], lights: [] }));

  constructor(private scene: THREE.Scene) {
    scene.fog = new THREE.Fog(0x05070a, 10, 34);
    scene.add(this.group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.34));
    CHAPTERS.forEach((ch, i) => this.buildLevel(ch, i));
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** Track a material for disposal AND register it to fade with level i. */
  private levelMat(i: number, m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    m.transparent = true;
    this.track(m);
    this.levels[i].mats.push(m);
    return m;
  }

  private groundTexture(ch: Chapter): THREE.Texture | null {
    switch (ch.id) {
      case "soccer": return this.track(soccerGround());
      case "basketball": return this.track(basketballGround());
      case "baseball": return this.track(baseballGround());
      case "football": return this.track(footballGround());
      default: return null; // hero / finale: plain platform
    }
  }

  private buildLevel(ch: Chapter, i: number): void {
    const y = groundY(i);
    const accent = accentHex(ch);

    // ground / court — a solid textured floor. The previous floor is hidden
    // during transitions by fading this whole level out (see update()).
    const map = this.groundTexture(ch);
    const floor = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(GROUND, GROUND)),
      this.levelMat(
        i,
        new THREE.MeshStandardMaterial({
          map: map ?? undefined,
          color: map ? 0xffffff : ch.kind === "finale" ? 0x14151d : 0x0a0c10,
          roughness: 0.92,
          metalness: 0,
          side: THREE.DoubleSide,
          emissive: ch.kind === "finale" ? accent : 0x000000,
          emissiveIntensity: ch.kind === "finale" ? 0.25 : 0,
        }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = y;
    this.group.add(floor);

    // stand ring (open cylinder bowl)
    const stands = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(STAND_R, STAND_R * 0.86, 7, 48, 1, true)),
      this.levelMat(i, new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 1, side: THREE.BackSide })),
    );
    stands.position.y = y + 3.5;
    this.group.add(stands);

    // sport props
    this.addProps(ch, i, y, accent);

    // per-level accent light so stadiums glow and the gaps stay dark; the light
    // fades with the level so a departed stadium doesn't illuminate the void.
    const key = new THREE.PointLight(accent, 90, 34, 2);
    key.position.set(6, y + 9, 6);
    this.group.add(key);
    this.levels[i].lights.push({ light: key, base: 90 });
    const fill = new THREE.PointLight(0xbfd4ff, 30, 30, 2);
    fill.position.set(-7, y + 7, -4);
    this.group.add(fill);
    this.levels[i].lights.push({ light: fill, base: 30 });
  }

  private addProps(ch: Chapter, i: number, y: number, accent: number): void {
    const mat = (color: number, rough = 0.7) =>
      this.levelMat(i, new THREE.MeshStandardMaterial({ color, roughness: rough }));
    const box = (w: number, h: number, d: number) => this.track(new THREE.BoxGeometry(w, h, d));
    const add = (m: THREE.Object3D) => this.group.add(m);

    if (ch.id === "basketball") {
      const pole = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.15, 0.15, 6)), mat(0x2a2f3a));
      pole.position.set(0, y + 3, -9);
      const board = new THREE.Mesh(box(3, 1.8, 0.15), mat(0xf4f5f7, 0.4));
      board.position.set(0, y + 5, -8.6);
      const rim = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.6, 0.06, 12, 24)), mat(accent, 0.5));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, y + 4.3, -8.2);
      add(pole); add(board); add(rim);
    } else if (ch.id === "soccer") {
      const postM = mat(0xf4f5f7, 0.5);
      const L = new THREE.Mesh(box(0.2, 3, 0.2), postM); L.position.set(-3, y + 1.5, -10);
      const R = new THREE.Mesh(box(0.2, 3, 0.2), postM); R.position.set(3, y + 1.5, -10);
      const bar = new THREE.Mesh(box(6.2, 0.2, 0.2), postM); bar.position.set(0, y + 3, -10);
      add(L); add(R); add(bar);
    } else if (ch.id === "football") {
      const postM = mat(0xf9d71c, 0.5);
      const base = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.14, 0.14, 4)), postM);
      base.position.set(0, y + 2, -11);
      const bar = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.12, 0.12, 6)), postM);
      bar.rotation.z = Math.PI / 2; bar.position.set(0, y + 4, -11);
      const uL = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.12, 0.12, 4)), postM);
      uL.position.set(-3, y + 6, -11);
      const uR = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.12, 0.12, 4)), postM);
      uR.position.set(3, y + 6, -11);
      add(base); add(bar); add(uL); add(uR);
    } else if (ch.id === "baseball") {
      const baseM = mat(0xf4f5f7, 0.5);
      const positions: [number, number][] = [[0, 4], [4, 0], [0, -4], [-4, 0]];
      for (const [bx, bz] of positions) {
        const b = new THREE.Mesh(box(0.8, 0.15, 0.8), baseM);
        b.position.set(bx, y + 0.08, bz);
        add(b);
      }
    }
  }

  /** A level's visibility 0..1: full during its own chapter, fading out into the
   *  gap after it and in from the gap before it. Hero never fades in (visible on
   *  load); finale never fades out. At a chapter boundary both neighbours reach 0
   *  → a genuine dark void, so the previous floor is gone before the next appears. */
  private levelOpacity(progress: number, i: number): number {
    const f = clamp01(progress) * SECTION_COUNT;
    const x = f - i;
    if (x <= 0 || x >= 1) return 0;
    let o = 1;
    if (i > 0 && x < 0.2) o = x / 0.2;
    if (i < SECTION_COUNT - 1 && x > 0.8) o = 1 - (x - 0.8) / 0.2;
    return clamp01(o);
  }

  /** Fade levels in/out and collapse the fog to a void between stadiums, so the
   *  transition is a genuine "travel through darkness" with no previous floor. */
  update(progress: number): void {
    for (let i = 0; i < this.levels.length; i++) {
      const o = this.levelOpacity(progress, i);
      for (const m of this.levels[i].mats) m.opacity = o;
      for (const l of this.levels[i].lights) l.light.intensity = l.base * o;
    }
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      const { index, local } = chapterAt(progress);
      let gap = 0;
      if (local < 0.2 && index > 0) gap = 1 - local / 0.2;
      else if (local > 0.8 && index < SECTION_COUNT - 1) gap = (local - 0.8) / 0.2;
      const g = gap * gap * (3 - 2 * gap);
      fog.near = FOG_OPEN_NEAR + (FOG_VOID_NEAR - FOG_OPEN_NEAR) * g;
      fog.far = FOG_OPEN_FAR + (FOG_VOID_FAR - FOG_OPEN_FAR) * g;
    }
  }

  dispose(): void {
    this.scene.fog = null;
    for (const d of this.disposables) d.dispose();
    this.scene.remove(this.group);
  }
}
