import * as THREE from "three";

/* --------------------------------------------------------------------------
   Landing 3D scene — framework-free three.js app (P1-ART-08).

   React only creates the <canvas> and calls start()/dispose(); everything WebGL
   lives here so it never couples to React internals (the reason we use vanilla
   three.js and not react-three-fiber — see spec §7). Task 6 renders a centered,
   brand-lit sphere; scroll/morph/environments are layered on in later tasks.
   -------------------------------------------------------------------------- */

export interface LandingSceneOpts {
  dprCap?: number;
  onReady?: () => void;
}

export class LandingSceneApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ball: THREE.Mesh;
  private raf = 0;
  private onReady?: () => void;

  constructor(canvas: HTMLCanvasElement, opts: LandingSceneOpts = {}) {
    this.onReady = opts.onReady;

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

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0xf97a1f, roughness: 0.6, metalness: 0.1 }),
    );
    this.scene.add(this.ball);

    this.resize();
    window.addEventListener("resize", this.resize);
  }

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
      this.ball.rotation.y += 0.005;
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
