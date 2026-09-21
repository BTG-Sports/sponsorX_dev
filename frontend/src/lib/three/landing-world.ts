import * as THREE from "three";
import { CHAPTERS, SECTION_COUNT, type Chapter } from "@/lib/landing-chapters";
import { clamp01 } from "@/lib/landing-scene-math";
import {
  soccerGround,
  basketballGround,
  baseballGround,
  footballGround,
  rockWall,
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
const HOLE_R = 2.2; // radius of the central hole the ball drops through

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

  constructor(private scene: THREE.Scene) {
    scene.fog = new THREE.Fog(0x05070a, 10, 34);
    scene.add(this.group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    CHAPTERS.forEach((ch, i) => this.buildLevel(ch, i));
    this.buildEarth();
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** A flat square floor with a central round hole for the ball to drop through,
   *  with UVs remapped to 0..1 so the baked court texture still maps correctly. */
  private floorGeometry(size: number, holeR: number): THREE.ShapeGeometry {
    const h = size / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-h, -h);
    shape.lineTo(h, -h);
    shape.lineTo(h, h);
    shape.lineTo(-h, h);
    shape.lineTo(-h, -h);
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 32);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) + h) / size, (pos.getY(i) + h) / size);
    }
    uv.needsUpdate = true;
    return geo;
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

    // ground / court — a square with a central hole the ball drops through
    const map = this.groundTexture(ch);
    const floor = new THREE.Mesh(
      this.track(this.floorGeometry(GROUND, HOLE_R)),
      this.track(
        new THREE.MeshStandardMaterial({
          map: map ?? undefined,
          color: map ? 0xffffff : ch.kind === "finale" ? 0x14151d : 0x0a0c10,
          roughness: 0.92,
          metalness: 0,
          side: THREE.DoubleSide, // acts as a ceiling once the camera is below it
          emissive: ch.kind === "finale" ? accent : 0x000000,
          emissiveIntensity: ch.kind === "finale" ? 0.25 : 0,
        }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = y;
    this.group.add(floor);

    // dark collar around the hole so it reads as a pit/shaft, not a cut-out
    const collar = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(HOLE_R, HOLE_R * 0.9, 3.5, 32, 1, true)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x07060a, roughness: 1, side: THREE.DoubleSide })),
    );
    collar.position.y = y - 1.6;
    this.group.add(collar);

    // stand ring (open cylinder bowl)
    const stands = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(STAND_R, STAND_R * 0.86, 7, 48, 1, true)),
      this.track(new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 1, side: THREE.BackSide })),
    );
    stands.position.y = y + 3.5;
    this.group.add(stands);

    // sport props
    this.addProps(ch, y, accent);

    // per-level accent light so stadiums glow and the gaps stay dark
    const key = new THREE.PointLight(accent, 90, 34, 2);
    key.position.set(6, y + 9, 6);
    this.group.add(key);
    const fill = new THREE.PointLight(0xbfd4ff, 30, 30, 2);
    fill.position.set(-7, y + 7, -4);
    this.group.add(fill);
  }

  private addProps(ch: Chapter, y: number, accent: number): void {
    const mat = (color: number, rough = 0.7) =>
      this.track(new THREE.MeshStandardMaterial({ color, roughness: rough }));
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

  /** Dark rock walls filling the gaps between stadiums — the underground. */
  private buildEarth(): void {
    const rock = this.track(rockWall());
    for (let i = 0; i < SECTION_COUNT - 1; i++) {
      const top = groundY(i) - 0.5;
      const bottom = groundY(i + 1) + 7;
      const h = top - bottom;
      const wall = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(16, 16, h, 40, 1, true)),
        this.track(new THREE.MeshStandardMaterial({ map: rock, color: 0x3a2f1c, roughness: 1, side: THREE.BackSide })),
      );
      wall.position.y = (top + bottom) / 2;
      this.group.add(wall);
    }
  }

  update(): void {
    // reserved for depth-based fog/light tweaks; static for now.
  }

  dispose(): void {
    this.scene.fog = null;
    for (const d of this.disposables) d.dispose();
    this.scene.remove(this.group);
  }
}
