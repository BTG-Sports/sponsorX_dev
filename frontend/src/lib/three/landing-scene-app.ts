import * as THREE from "three";
import { chapterAt } from "@/lib/landing-scene-math";
import { SECTION_COUNT } from "@/lib/landing-chapters";
import { LandingAssets } from "./landing-assets";
import { LandingBallRig } from "./landing-ball-rig";
import { LandingWorld, ballWorldY } from "./landing-world";

const CAM_UP = 1.3; // camera height above the ball
const CAM_DIST = 4.2; // camera distance back from the ball (closer = bigger ball)

/* --------------------------------------------------------------------------
   Landing 3D scene — framework-free three.js app (P1-ART-08).

   React only creates the <canvas> and calls start()/dispose(); everything WebGL
   lives here so it never couples to React internals (the reason we use vanilla
   three.js and not react-three-fiber — see spec §7). This adds scroll-scrubbing:
   one smoothed 0..1 progress drives ball spin + a subtle camera parallax and
   reports the active chapter. Morph/environments layer on in later tasks.
   -------------------------------------------------------------------------- */

export interface LandingSceneOpts {
  dprCap?: number;
  onReady?: () => void;
  /** Called (only on change) with the active chapter index — drives the rail. */
  onChapter?: (index: number) => void;
  /** Called once if sustained FPS is too low — caller tears down to the poster. */
  onDegrade?: () => void;
}

export class LandingSceneApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private assets = new LandingAssets();
  private rig: LandingBallRig;
  private world: LandingWorld;
  private clock = new THREE.Clock();
  private raf = 0;

  private targetProgress = 0;
  private smoothProgress = 0;
  private lastChapter = -1;

  private onReady?: () => void;
  private onChapter?: (index: number) => void;
  private onDegrade?: () => void;
  private fpsEma = 60;
  private lowFpsFor = 0;
  private degraded = false;

  constructor(canvas: HTMLCanvasElement, opts: LandingSceneOpts = {}) {
    this.onReady = opts.onReady;
    this.onChapter = opts.onChapter;
    this.onDegrade = opts.onDegrade;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.dprCap ?? 2));

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
    this.camera.position.set(0, CAM_UP, CAM_DIST);

    // Lighting lives in the world (ambient + per-level accent lights) so each
    // stadium glows and the earth gaps stay dark.
    this.rig = new LandingBallRig(this.scene, this.assets);
    this.world = new LandingWorld(this.scene);

    this.onScroll();
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("scroll", this.onScroll, { passive: true });
  }

  private onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.targetProgress = max > 0 ? window.scrollY / max : 0;
  };

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  start(): void {
    let first = true;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.clock.getDelta();

      // Frame-rate-independent ease toward the scroll target (the scrub feel).
      this.smoothProgress += (this.targetProgress - this.smoothProgress) * Math.min(1, dt * 4);

      // Ball falls down the vertical shaft; spin + spin-and-swap morph ride on top.
      const by = ballWorldY(this.smoothProgress);
      this.rig.setWorldY(by);
      this.rig.update(this.smoothProgress, dt);
      this.world.update();

      // Camera follows the ball; during the between-stadium drop it pulls in
      // close and over-centre so it dives *through the hole* with the ball
      // (seamless underground pass), then swings back out at each stadium.
      const at = chapterAt(this.smoothProgress);
      let gap = 0;
      if (at.local < 0.2 && at.index > 0) gap = 1 - at.local / 0.2;
      else if (at.local > 0.8 && at.index < SECTION_COUNT - 1) gap = (at.local - 0.8) / 0.2;
      const g = gap * gap * (3 - 2 * gap); // smoothstep
      const dist = CAM_DIST + (1.6 - CAM_DIST) * g;
      const up = CAM_UP + (0.4 - CAM_UP) * g;
      this.camera.position.set(
        Math.sin(this.smoothProgress * Math.PI * 2) * 0.25 * (1 - g),
        by + up,
        dist,
      );
      this.camera.lookAt(0, by, 0);

      if (at.index !== this.lastChapter) {
        this.lastChapter = at.index;
        this.onChapter?.(at.index);
      }

      this.renderer.render(this.scene, this.camera);
      if (first) {
        first = false;
        this.onReady?.();
      } else if (dt > 0) {
        // FPS watchdog: if we can't hold ~40fps for ~2s, degrade to the poster.
        this.fpsEma = this.fpsEma * 0.9 + (1 / dt) * 0.1;
        this.lowFpsFor = this.fpsEma < 40 ? this.lowFpsFor + dt : 0;
        if (this.lowFpsFor > 2 && !this.degraded) {
          this.degraded = true;
          this.onDegrade?.();
        }
      }
    };
    loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("scroll", this.onScroll);
    this.rig.dispose();
    this.world.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}
