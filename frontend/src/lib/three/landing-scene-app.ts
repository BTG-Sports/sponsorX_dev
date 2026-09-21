import * as THREE from "three";
import { chapterAt } from "@/lib/landing-scene-math";
import { LandingAssets } from "./landing-assets";
import { LandingBallRig } from "./landing-ball-rig";

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
}

export class LandingSceneApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private assets = new LandingAssets();
  private rig: LandingBallRig;
  private clock = new THREE.Clock();
  private raf = 0;

  private targetProgress = 0;
  private smoothProgress = 0;
  private lastChapter = -1;

  private onReady?: () => void;
  private onChapter?: (index: number) => void;

  constructor(canvas: HTMLCanvasElement, opts: LandingSceneOpts = {}) {
    this.onReady = opts.onReady;
    this.onChapter = opts.onChapter;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.dprCap ?? 2));

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const blue = new THREE.DirectionalLight(0x63b4f8, 2.0);
    blue.position.set(-4, 5, 5);
    const orange = new THREE.DirectionalLight(0xf97a1f, 2.5);
    orange.position.set(5, -3, 3);
    this.scene.add(blue, orange);

    this.rig = new LandingBallRig(this.scene, this.assets);

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

      // Ball spin + spin-and-swap morph, keyed to the smoothed scroll.
      this.rig.update(this.smoothProgress, dt);

      // Subtle camera parallax so the ball feels seated in space.
      this.camera.position.x = Math.sin(this.smoothProgress * Math.PI * 2) * 0.15;
      this.camera.lookAt(0, 0, 0);

      const { index } = chapterAt(this.smoothProgress);
      if (index !== this.lastChapter) {
        this.lastChapter = index;
        this.onChapter?.(index);
      }

      this.renderer.render(this.scene, this.camera);
      if (first) {
        first = false;
        this.onReady?.();
      }
    };
    loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("scroll", this.onScroll);
    this.rig.dispose();
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
