import * as THREE from "three";
import { CHAPTERS, SECTION_COUNT, type Chapter } from "@/lib/landing-chapters";
import { chapterAt, clamp01 } from "@/lib/landing-scene-math";
import {
  soccerGround,
  basketballGround,
  baseballGround,
  footballGround,
  dotSprite,
  ribbonTexture,
} from "./landing-textures";

/* --------------------------------------------------------------------------
   Stacked vertical world (P1-ART-08). Six stadium levels stacked down Y; the
   ball falls the shaft and the camera follows. Each level is a lively stadium
   built from primitives + procedural textures + CPU-animated effects (crowd,
   floodlights + light shafts, atmosphere particles, a ball spotlight-halo +
   landing shockwave, a scrolling LED ribbon, swaying banners) — all tinted to
   the sport's accent and fading with the level so transitions stay dark.
   No custom shaders (built-in materials only) → nothing that fails at runtime.
   -------------------------------------------------------------------------- */

export const GAP = 26;
export const REST_ABOVE = 1.0;
export const SKY = 9;
const GROUND = 60;
const STAND_R = 22;

const FOG_OPEN_NEAR = 10;
const FOG_OPEN_FAR = 34;
const FOG_VOID_NEAR = 0.3;
const FOG_VOID_FAR = 3.5;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const accentHex = (ch: Chapter) => (ch.accent === "orange" ? 0xf97a1f : 0x2e9bf5);

export const groundY = (i: number) => -i * GAP;
export const restY = (i: number) => groundY(i) + REST_ABOVE;

export function ballWorldY(p: number): number {
  const n = SECTION_COUNT;
  const P = clamp01(p) * n;
  const c = Math.min(n - 1, Math.floor(P));
  const local = P - c;
  const HOLD_A = 0.2;
  const HOLD_B = 0.8;
  const GAP_LEN = 1 - HOLD_B + HOLD_A;
  if (local >= HOLD_A && local <= HOLD_B) return restY(c);
  if (local < HOLD_A) {
    if (c === 0) return lerp(restY(0) + SKY, restY(0), smooth(local / HOLD_A));
    return lerp(restY(c - 1), restY(c), smooth((local + (1 - HOLD_B)) / GAP_LEN));
  }
  if (c === n - 1) return restY(c);
  return lerp(restY(c), restY(c + 1), smooth((local - HOLD_B) / GAP_LEN));
}

type Level = { mats: THREE.Material[]; lights: { light: THREE.PointLight; base: number }[] };

export class LandingWorld {
  private group = new THREE.Group();
  private disposables: { dispose: () => void }[] = [];
  private levels: Level[] = CHAPTERS.map(() => ({ mats: [], lights: [] }));

  // animated effect registers
  private fades: { mat: THREE.Material; i: number; base: number }[] = [];
  private flashes: { s: THREE.Sprite; i: number; phase: number }[] = [];
  private halos: { m: THREE.Object3D; i: number }[] = [];
  private shocks: { m: THREE.Mesh; mat: THREE.Material; i: number }[] = [];
  private ribbons: { tex: THREE.Texture; i: number }[] = [];
  private banners: { m: THREE.Object3D; i: number; phase: number; baseRotY: number }[] = [];
  private particles: THREE.Points | null = null;

  private dot = this.track(dotSprite());

  constructor(private scene: THREE.Scene) {
    scene.fog = new THREE.Fog(0x05070a, FOG_OPEN_NEAR, FOG_OPEN_FAR);
    scene.add(this.group);
    scene.add(new THREE.AmbientLight(0xffffff, 0.34));
    CHAPTERS.forEach((ch, i) => this.buildLevel(ch, i));
    this.buildParticles();
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T {
    this.disposables.push(x);
    return x;
  }

  /** Register material to fade fully with its level (used for solid geometry). */
  private levelMat<T extends THREE.Material>(i: number, m: T): T {
    m.transparent = true;
    this.track(m);
    this.levels[i].mats.push(m);
    return m;
  }

  /** Register a translucent material that keeps a base opacity but still fades. */
  private fadeMat<T extends THREE.Material>(i: number, m: T, base: number): T {
    m.transparent = true;
    this.track(m);
    this.fades.push({ mat: m, i, base });
    return m;
  }

  private groundTexture(ch: Chapter): THREE.Texture | null {
    switch (ch.id) {
      case "soccer": return this.track(soccerGround());
      case "basketball": return this.track(basketballGround());
      case "baseball": return this.track(baseballGround());
      case "football": return this.track(footballGround());
      default: return null;
    }
  }

  private buildLevel(ch: Chapter, i: number): void {
    const y = groundY(i);
    const accent = accentHex(ch);

    // floor
    const map = this.groundTexture(ch);
    const floor = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(GROUND, GROUND)),
      this.levelMat(i, new THREE.MeshStandardMaterial({
        map: map ?? undefined,
        color: map ? 0xffffff : ch.kind === "finale" ? 0x14151d : 0x0a0c10,
        roughness: 0.92,
        metalness: 0,
        side: THREE.DoubleSide,
        emissive: ch.kind === "finale" ? accent : 0x000000,
        emissiveIntensity: ch.kind === "finale" ? 0.25 : 0,
      })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = y;
    this.group.add(floor);

    // stand ring
    const stands = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(STAND_R, STAND_R * 0.86, 7, 48, 1, true)),
      this.levelMat(i, new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 1, side: THREE.BackSide })),
    );
    stands.position.y = y + 3.5;
    this.group.add(stands);

    this.addProps(ch, i, y, accent);
    this.addLights(i, y, accent);
    this.addCrowd(i, y);
    this.addFloodlights(i, y, accent);
    this.addRibbon(i, y, accent);
    this.addBanners(i, y, accent);
    this.addHaloAndShock(i, y, accent);
  }

  private addLights(i: number, y: number, accent: number): void {
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

  /** Dense ring of dim crowd dots on the stands + a few animated camera flashes. */
  private addCrowd(i: number, y: number): void {
    const N = 700;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const warm = new THREE.Color(0xffcc88);
    const cool = new THREE.Color(0x88aaff);
    for (let k = 0; k < N; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = STAND_R * (0.9 + Math.random() * 0.12);
      pos[k * 3] = Math.cos(a) * r;
      pos[k * 3 + 1] = y + 1 + Math.random() * 5.5;
      pos[k * 3 + 2] = Math.sin(a) * r;
      const c = Math.random() > 0.5 ? warm : cool;
      const d = 0.25 + Math.random() * 0.3;
      col[k * 3] = c.r * d; col[k * 3 + 1] = c.g * d; col[k * 3 + 2] = c.b * d;
    }
    const g = this.track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, this.levelMat(i, new THREE.PointsMaterial({
      map: this.dot, size: 0.28, sizeAttenuation: true, vertexColors: true, depthWrite: false,
    })));
    this.group.add(pts);

    for (let f = 0; f < 8; f++) {
      const a = Math.random() * Math.PI * 2;
      const s = new THREE.Sprite(this.track(new THREE.SpriteMaterial({
        map: this.dot, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      })));
      s.position.set(Math.cos(a) * STAND_R, y + 1 + Math.random() * 5, Math.sin(a) * STAND_R);
      s.scale.setScalar(1.4);
      this.group.add(s);
      this.flashes.push({ s, i, phase: Math.random() });
    }
  }

  /** Four corner floodlight towers with emissive heads and additive light shafts. */
  private addFloodlights(i: number, y: number, accent: number): void {
    const corners: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [sx, sz] of corners) {
      const px = sx * STAND_R * 0.72;
      const pz = sz * STAND_R * 0.72;
      const tower = new THREE.Mesh(
        this.track(new THREE.CylinderGeometry(0.2, 0.3, 13)),
        this.levelMat(i, new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 1 })),
      );
      tower.position.set(px, y + 6.5, pz);
      const head = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(2.2, 1.1, 0.5)),
        this.levelMat(i, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.4 })),
      );
      head.position.set(px, y + 12.5, pz);
      head.lookAt(0, y + 2, 0);
      const cone = new THREE.Mesh(
        this.track(new THREE.ConeGeometry(4.2, 12, 20, 1, true)),
        this.fadeMat(i, new THREE.MeshBasicMaterial({
          color: accent, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        }), 0.06),
      );
      cone.position.set(px * 0.6, y + 6.5, pz * 0.6);
      cone.lookAt(0, y - 2, 0);
      cone.rotateX(-Math.PI / 2);
      this.group.add(tower, head, cone);
    }
  }

  /** Scrolling emissive LED ribbon around the top of the stands. */
  private addRibbon(i: number, y: number, accent: number): void {
    const tex = this.track(ribbonTexture());
    const ribbon = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(STAND_R * 0.98, STAND_R * 0.98, 1, 64, 1, true)),
      this.fadeMat(i, new THREE.MeshBasicMaterial({
        map: tex, color: accent, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      }), 0.9),
    );
    ribbon.position.y = y + 6.6;
    this.group.add(ribbon);
    this.ribbons.push({ tex, i });
  }

  /** A few gently swaying accent banners around the perimeter. */
  private addBanners(i: number, y: number, accent: number): void {
    const M = 8;
    for (let b = 0; b < M; b++) {
      const a = (b / M) * Math.PI * 2;
      const holder = new THREE.Group();
      holder.position.set(Math.cos(a) * (STAND_R * 0.8), y + 4, Math.sin(a) * (STAND_R * 0.8));
      const flag = new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(2.4, 3.4)),
        this.fadeMat(i, new THREE.MeshStandardMaterial({
          color: accent, roughness: 0.8, side: THREE.DoubleSide, emissive: accent, emissiveIntensity: 0.15,
        }), 0.9),
      );
      flag.position.y = -1;
      holder.add(flag);
      holder.rotation.y = -a;
      this.group.add(holder);
      this.banners.push({ m: holder, i, phase: b, baseRotY: -a });
    }
  }

  /** Glowing ground halo (spotlight pool) under the ball + landing shockwave ring. */
  private addHaloAndShock(i: number, y: number, accent: number): void {
    const halo = new THREE.Mesh(
      this.track(new THREE.RingGeometry(1.4, 2.8, 48)),
      this.fadeMat(i, new THREE.MeshBasicMaterial({
        color: accent, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }), 0.5),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = y + 0.03;
    this.group.add(halo);
    this.halos.push({ m: halo, i });

    const shockMat = this.track(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    const shock = new THREE.Mesh(this.track(new THREE.RingGeometry(0.6, 0.9, 48)), shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.y = y + 0.05;
    shock.visible = false;
    this.group.add(shock);
    this.shocks.push({ m: shock, mat: shockMat, i });
  }

  /** Ambient dust drifting through the whole shaft. */
  private buildParticles(): void {
    const N = 400;
    const pos = new Float32Array(N * 3);
    const bottom = groundY(SECTION_COUNT - 1) - 6;
    const top = SKY + 4;
    for (let k = 0; k < N; k++) {
      pos[k * 3] = (Math.random() - 0.5) * 24;
      pos[k * 3 + 1] = bottom + Math.random() * (top - bottom);
      pos[k * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    const g = this.track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(g, this.track(new THREE.PointsMaterial({
      map: this.dot, color: 0x9fc0ff, size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    this.scene.add(this.particles);
  }

  private levelOpacity(progress: number, i: number): number {
    const f = clamp01(progress) * SECTION_COUNT;
    const x = f - i;
    if (x <= 0 || x >= 1) return 0;
    let o = 1;
    if (i > 0 && x < 0.2) o = (x - 0.14) / 0.06;
    if (i < SECTION_COUNT - 1 && x > 0.8) o = 1 - (x - 0.8) / 0.06;
    return clamp01(o);
  }

  update(progress: number, time: number): void {
    const { index, local } = chapterAt(progress);

    // solid geometry + lights fade with their level
    const op: number[] = [];
    for (let i = 0; i < this.levels.length; i++) {
      const o = this.levelOpacity(progress, i);
      op[i] = o;
      for (const m of this.levels[i].mats) m.opacity = o;
      for (const l of this.levels[i].lights) l.light.intensity = l.base * o;
    }
    // translucent effect materials keep their base * level opacity
    for (const f of this.fades) f.mat.opacity = f.base * op[f.i];
    // crowd camera flashes (sharp occasional spikes)
    for (const fl of this.flashes) {
      const tw = Math.pow(Math.max(0, Math.sin(time * 3 + fl.phase * 6.283)), 24);
      fl.s.material.opacity = tw * op[fl.i];
    }
    // halo breathing pulse
    for (const h of this.halos) {
      const s = 1 + 0.08 * Math.sin(time * 2 + h.i);
      h.m.scale.set(s, s, s);
    }
    // ribbon scroll
    for (const r of this.ribbons) r.tex.offset.x = (time * 0.05) % 1;
    // banner sway
    for (const b of this.banners) b.m.rotation.y = b.baseRotY + 0.16 * Math.sin(time * 1.5 + b.phase);
    // landing shockwave on the active level
    for (const s of this.shocks) {
      if (s.i === index && local > 0.12 && local < 0.45) {
        const t = (local - 0.12) / 0.33;
        const sc = 0.6 + t * 7;
        s.m.scale.set(sc, sc, sc);
        s.m.visible = true;
        s.mat.opacity = (1 - t) * 0.8 * op[s.i];
      } else {
        s.m.visible = false;
      }
    }
    // drifting dust
    if (this.particles) this.particles.rotation.y = time * 0.02;

    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      let gap = 0;
      if (local < 0.2 && index > 0) gap = Math.min(1, (0.2 - local) / 0.06);
      else if (local > 0.8 && index < SECTION_COUNT - 1) gap = Math.min(1, (local - 0.8) / 0.06);
      const g = gap * gap * (3 - 2 * gap);
      fog.near = FOG_OPEN_NEAR + (FOG_VOID_NEAR - FOG_OPEN_NEAR) * g;
      fog.far = FOG_OPEN_FAR + (FOG_VOID_FAR - FOG_OPEN_FAR) * g;
    }
  }

  dispose(): void {
    this.scene.fog = null;
    if (this.particles) this.scene.remove(this.particles);
    for (const d of this.disposables) d.dispose();
    this.scene.remove(this.group);
  }
}
