/* --------------------------------------------------------------------------
   Shader warm-up (P1-ART-11) — compile everything before the first frame.

   three compiles a material's program the first time it is drawn and then
   blocks the main thread until the driver has finished (a `getProgramInfoLog`
   in `WebGLProgram.onFirstUse`). Measured on the landing city: 48 programs,
   ~13 s of freeze split over two frames, the loader's counter stuck at one
   number the whole time. `WebGLRenderer.compile` only *issues* the compiles,
   and with `KHR_parallel_shader_compile` the driver works in the background
   while `program.isReady()` can be polled without blocking. So: issue every
   program, poll, report progress to the loader, and only then draw.

   Rules the program cache imposes, or the warm-up compiles the wrong
   variants and the first frame stalls anyway:

   1. The bound render target is part of the program key (tone mapping and
      output colour space differ between the screen and an offscreen buffer).
      The desktop tier draws the scene into the post chain's input buffer, so
      the scene is compiled with that buffer bound, and the screen is bound
      only for the single pass that renders to it.
   2. Post-processing passes swap materials at render time (a mipmap blur
      alternates two), so `collectPassMaterials` walks a pass's object graph
      for every material it can reach, skipping scenes, textures and the
      renderer, and `planPassCompiles` splits them by target.
   3. The environment map's prefilter (PMREM) runs synchronously inside the
      scene compile and blocks on its own shaders, so `warmUpEnvironment`
      issues those first from a throwaway generator. The geometry's
      attributes are in the key too (`hasPositionAttribute`), so the
      materials are compiled on a mesh with the planes' position and uv
      attributes and nothing more — three's own
      `compileEquirectangularShader` uses an empty geometry and produces a
      variant the prefilter never uses.

   Texture uploads are the other first-frame cost (the desktop kit decodes
   to ~230 MB); `uploadTextures` pushes them to the GPU in byte-bounded
   batches, one per animation frame, so the loader keeps animating.

   Pure with respect to React and R3F — the scene component calls `warmUp`.
   This module imports `three`, so it must stay out of the poster bundle.
   -------------------------------------------------------------------------- */
import * as THREE from "three";

/** The slice of `WebGLRenderer` the polling needs — structural, so tests
 *  can drive it with a fake. */
export interface CompileRenderer {
  compile(scene: THREE.Object3D, camera: THREE.Camera): Set<THREE.Material>;
  /** three types this as `unknown`; `programOf` narrows it. */
  properties: { get(material: THREE.Material): unknown };
}

/** The compiled program three keeps for a material, if any. */
function programOf(renderer: CompileRenderer, material: THREE.Material): { isReady(): boolean } | undefined {
  const props = renderer.properties.get(material) as { currentProgram?: { isReady?: unknown } } | undefined;
  const program = props?.currentProgram;
  return program && typeof program.isReady === "function" ? (program as { isReady(): boolean }) : undefined;
}

/** What `warmUp` needs beyond that. */
export type WarmUpRenderer = CompileRenderer & {
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  initTexture(texture: THREE.Texture): void;
};

export interface CompileOptions {
  /** How often to poll program readiness, in ms. */
  pollMs?: number;
}

/** Poll until every material's program is ready. `onProgress` gets 0
 *  first, then the fraction ready (monotone), then 1. Drains `pending`. */
export function waitForMaterials(
  renderer: CompileRenderer,
  pending: Set<THREE.Material>,
  onProgress: (fraction: number) => void,
  { pollMs = 16 }: CompileOptions = {},
): Promise<void> {
  const total = pending.size;
  if (total === 0) {
    onProgress(1);
    return Promise.resolve();
  }
  onProgress(0);
  return new Promise((resolve) => {
    let reported = 0;
    const poll = () => {
      for (const material of [...pending]) {
        const program = programOf(renderer, material);
        // No program: the material was disposed or never needed one.
        if (program === undefined || program.isReady()) pending.delete(material);
      }
      const fraction = (total - pending.size) / total;
      if (fraction > reported) {
        reported = fraction;
        onProgress(fraction);
      }
      if (pending.size === 0) resolve();
      else setTimeout(poll, pollMs);
    };
    poll();
  });
}

/** Issue the compiles for every material under `scene`, then poll until all
 *  their programs are ready. Resolves when the scene can be drawn without a
 *  compile stall. */
export function compileWithProgress(
  renderer: CompileRenderer,
  scene: THREE.Object3D,
  camera: THREE.Camera,
  onProgress: (fraction: number) => void,
  options: CompileOptions = {},
): Promise<void> {
  return waitForMaterials(renderer, renderer.compile(scene, camera), onProgress, options);
}

/* ---- post-processing passes ------------------------------------------------ */

const MAX_DEPTH = 8;

function isMaterial(v: unknown): v is THREE.Material {
  return typeof v === "object" && v !== null && (v as THREE.Material).isMaterial === true;
}

function isTexture(v: unknown): v is THREE.Texture {
  return typeof v === "object" && v !== null && (v as THREE.Texture).isTexture === true;
}

/** Objects the walk must not enter: they are huge, or they hold materials
 *  that belong to other render paths (a scene's meshes). */
function isForeign(v: object): boolean {
  const o = v as Record<string, unknown>;
  return (
    o.isObject3D === true ||
    o.isTexture === true ||
    o.isRenderTarget === true ||
    o.isWebGLRenderTarget === true ||
    o.isWebGLRenderer === true ||
    o.isBufferGeometry === true ||
    ArrayBuffer.isView(v) ||
    v instanceof ArrayBuffer ||
    v instanceof Map ||
    v instanceof Set ||
    (typeof Node !== "undefined" && v instanceof Node)
  );
}

/** Every material reachable from the given passes: each pass's fullscreen
 *  material and anything nested in its effects and sub-passes. Cycle-safe. */
export function collectPassMaterials(passes: readonly unknown[]): THREE.Material[] {
  const out: THREE.Material[] = [];
  const found = new Set<THREE.Material>();
  const visited = new WeakSet<object>();
  const add = (m: THREE.Material) => {
    if (found.has(m)) return;
    found.add(m);
    out.push(m);
  };
  const visit = (value: unknown, depth: number): void => {
    if (value === null || typeof value !== "object") return;
    if (isMaterial(value)) {
      add(value);
      return;
    }
    if (visited.has(value) || depth > MAX_DEPTH || isForeign(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1);
      return;
    }
    // postprocessing exposes the fullscreen material through a prototype
    // getter, which Object.keys does not see.
    const fullscreen = (value as { fullscreenMaterial?: unknown }).fullscreenMaterial;
    if (isMaterial(fullscreen)) add(fullscreen);
    for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key], depth + 1);
  };
  for (const pass of passes) visit(pass, 0);
  return out;
}

export interface PassCompilePlan {
  /** Compiled with an offscreen buffer bound. */
  offscreen: THREE.Material[];
  /** Compiled with the screen bound — the final pass's own material. */
  onscreen: THREE.Material[];
}

/** Split a composer's pass materials by the target they will render to.
 *  Disabled passes are skipped. */
export function planPassCompiles(passes: readonly unknown[]): PassCompilePlan {
  const offscreen: THREE.Material[] = [];
  const onscreen: THREE.Material[] = [];
  const seen = new Set<THREE.Material>();
  for (const pass of passes) {
    const p = pass as { enabled?: boolean; renderToScreen?: boolean; fullscreenMaterial?: unknown };
    if (p.enabled === false) continue;
    const screenMaterial = p.renderToScreen === true && isMaterial(p.fullscreenMaterial) ? p.fullscreenMaterial : null;
    for (const m of collectPassMaterials([pass])) {
      if (seen.has(m)) continue;
      seen.add(m);
      (m === screenMaterial ? onscreen : offscreen).push(m);
    }
  }
  return { offscreen, onscreen };
}

/** The fullscreen triangle postprocessing draws its passes with. Taken from
 *  a pass's own screen mesh when one exists, so the compiled program sees
 *  the same vertex attributes; else the same triangle rebuilt. */
function screenGeometry(passes: readonly unknown[]): THREE.BufferGeometry {
  for (const pass of passes) {
    const screen = (pass as { screen?: { geometry?: THREE.BufferGeometry } }).screen;
    if (screen?.geometry) return screen.geometry;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
}

function sceneOf(materials: readonly THREE.Material[], geometry: THREE.BufferGeometry): THREE.Scene {
  const scene = new THREE.Scene();
  for (const m of materials) {
    const mesh = new THREE.Mesh(geometry, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  return scene;
}

/** What the warm-up needs from a postprocessing `EffectComposer`. */
export interface ComposerLike {
  passes: readonly unknown[];
  inputBuffer: THREE.WebGLRenderTarget;
}

/* ---- environment map ------------------------------------------------------ */

/** The private surface of three's PMREMGenerator the pre-issue relies on
 *  (r186). Every member is checked before use; when the shape changes the
 *  warm-up degrades to the equirect shader only. */
interface PmremInternals {
  _setSize?: (cubeSize: number) => void;
  _allocateTargets?: () => THREE.WebGLRenderTarget;
  _equirectMaterial?: THREE.Material | null;
  _blurMaterial?: THREE.Material | null;
  _ggxMaterial?: THREE.Material | null;
}

/** A triangle with the attributes the prefilter's planes carry — a
 *  position (the key's `hasPositionAttribute`) and uvs, no normals — so the
 *  program key matches what the prefilter will ask for. */
function prefilterGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  return g;
}

export interface EnvironmentWarmUp {
  /** Whether the blur shaders could be pre-issued (the private surface
   *  matched); false means only the equirect shader was. */
  complete: boolean;
  /** Free the throwaway generator — only after the scene compile has taken
   *  its own references to the programs, or they are destroyed with it. */
  dispose(): void;
}

/** Issue the prefilter's shaders (equirect → cube-UV, then the two blurs)
 *  from a throwaway generator, so that when the renderer's own generator
 *  prefilters `scene.environment` during the scene compile, every program it
 *  needs is already in three's program cache and ready. Without this the
 *  prefilter runs synchronously inside `compile()` and blocks on its shaders
 *  — measured at 4.7 s + 0.7 s on the landing city, because it was the
 *  first thing compiled on the context and paid the driver's start-up cost.
 *
 *  The programs are keyed by the blur defines, which derive from the input
 *  size, so the generator is sized from the real texture; by whether a
 *  render target is bound (one is, when prefiltering), so one is bound; and
 *  by the geometry's attributes, so the mesh has the planes' position. */
export async function warmUpEnvironment(
  gl: WarmUpRenderer,
  texture: THREE.Texture,
  boundTarget: THREE.WebGLRenderTarget,
  camera: THREE.Camera,
  onProgress: (fraction: number) => void,
  makeGenerator: () => THREE.PMREMGenerator,
): Promise<EnvironmentWarmUp> {
  const pmrem = makeGenerator();
  const priv = pmrem as unknown as PmremInternals;
  const previous = gl.getRenderTarget();
  const materials: THREE.Material[] = [];
  let targets: THREE.WebGLRenderTarget | null = null;
  let complete = false;
  let pending = new Set<THREE.Material>();
  try {
    // Creates the equirect material (and issues a variant we do not use).
    pmrem.compileEquirectangularShader();
    if (priv._equirectMaterial) materials.push(priv._equirectMaterial);

    const image = texture.image as { width?: number } | undefined;
    if (typeof priv._setSize === "function" && typeof priv._allocateTargets === "function" && image?.width) {
      priv._setSize(image.width / 4);
      targets = priv._allocateTargets();
      for (const m of [priv._blurMaterial, priv._ggxMaterial]) if (m) materials.push(m);
      complete = materials.length > 1;
    }

    gl.setRenderTarget(boundTarget);
    pending = gl.compile(sceneOf(materials, prefilterGeometry()), camera);
  } finally {
    gl.setRenderTarget(previous);
  }
  await waitForMaterials(gl, pending, onProgress);
  return {
    complete,
    dispose() {
      targets?.dispose();
      pmrem.dispose();
    },
  };
}

/* ---- textures ------------------------------------------------------------- */

/** Every texture referenced by a material under `scene`, once each. */
export function collectSceneTextures(scene: THREE.Object3D): THREE.Texture[] {
  const out: THREE.Texture[] = [];
  const seen = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(m as unknown as Record<string, unknown>)) {
        if (isTexture(value) && !seen.has(value)) {
          seen.add(value);
          out.push(value);
        }
      }
    }
  });
  return out;
}

/** Rough GPU footprint of a texture, mip chain included. */
function textureBytes(t: THREE.Texture): number {
  const image = t.image as { width?: number; height?: number } | undefined;
  const w = image?.width ?? 512;
  const h = image?.height ?? 512;
  return w * h * 4 * (t.generateMipmaps ? 4 / 3 : 1);
}

export interface UploadOptions {
  /** Upload budget per batch, in bytes. */
  bytesPerFrame?: number;
  /** Waits for the next frame between batches; defaults to rAF. */
  yieldFrame?: () => Promise<void>;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/** Push textures to the GPU in byte-bounded batches, one per frame, so no
 *  single frame carries them all. `onProgress` is by bytes, 0..1. */
export async function uploadTextures(
  gl: Pick<WarmUpRenderer, "initTexture">,
  textures: readonly THREE.Texture[],
  onProgress: (fraction: number) => void,
  { bytesPerFrame = 24 * 1024 * 1024, yieldFrame = nextFrame }: UploadOptions = {},
): Promise<void> {
  const total = textures.reduce((a, t) => a + textureBytes(t), 0);
  if (total === 0) {
    onProgress(1);
    return;
  }
  onProgress(0);
  let done = 0;
  let inBatch = 0;
  for (const t of textures) {
    if (inBatch > 0 && inBatch + textureBytes(t) > bytesPerFrame) {
      await yieldFrame();
      inBatch = 0;
    }
    gl.initTexture(t);
    const bytes = textureBytes(t);
    inBatch += bytes;
    done += bytes;
    onProgress(done / total);
  }
}

/* ---- the whole warm-up ---------------------------------------------------- */

interface Step {
  share: number;
  run: (report: (fraction: number) => void) => Promise<void>;
}

/** Run steps in order, folding each one's 0..1 into its share of the whole. */
async function runSteps(steps: readonly Step[], onProgress: (fraction: number) => void): Promise<void> {
  const total = steps.reduce((a, s) => a + s.share, 0);
  let done = 0;
  for (const step of steps) {
    await step.run((f) => onProgress((done + step.share * f) / total));
    done += step.share;
    onProgress(done / total);
  }
}

const ENV_SHARE = 0.2;
const SCENE_SHARE = 0.45;
const TEXTURE_SHARE = 0.2;
const PASS_SHARE = 0.15;

/** Compile the environment prefilter, the scene and, when there is one, the
 *  post chain — each against the render target it will actually draw into
 *  — and upload the textures, reporting 0..1. Resolves when the first frame
 *  can be drawn without a shader stall. `makeGenerator` builds the
 *  throwaway PMREM generator (the scene passes `() => new
 *  PMREMGenerator(gl)`); without it the prefilter is left to the scene
 *  compile. */
export async function warmUp(
  gl: WarmUpRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  composer: ComposerLike | null,
  onProgress: (fraction: number) => void,
  makeGenerator?: () => THREE.PMREMGenerator,
): Promise<void> {
  const plan = composer ? planPassCompiles(composer.passes) : { offscreen: [], onscreen: [] };
  const passCount = plan.offscreen.length + plan.onscreen.length;
  const env = scene.environment;
  const prefilter = env !== null && env.mapping !== THREE.CubeUVReflectionMapping && makeGenerator ? { env, makeGenerator } : null;
  const previous = gl.getRenderTarget();
  // The scene draws into the composer's buffer when there is one; the
  // prefilter always draws into a target of its own.
  const sceneTarget = composer ? composer.inputBuffer : null;
  const offscreenTarget = sceneTarget ?? new THREE.WebGLRenderTarget(1, 1);
  let envWarm: EnvironmentWarmUp | null = null;

  const steps: Step[] = [];
  if (prefilter) {
    steps.push({
      share: ENV_SHARE,
      run: async (report) => {
        envWarm = await warmUpEnvironment(gl, prefilter.env, offscreenTarget, camera, report, prefilter.makeGenerator);
      },
    });
  }
  steps.push({
    share: SCENE_SHARE,
    run: async (report) => {
      gl.setRenderTarget(sceneTarget);
      try {
        await compileWithProgress(gl, scene, camera, report);
      } finally {
        gl.setRenderTarget(previous);
      }
      // The renderer's own generator now holds the prefilter programs.
      envWarm?.dispose();
      envWarm = null;
    },
  });
  steps.push({
    share: TEXTURE_SHARE,
    run: (report) => uploadTextures(gl, collectSceneTextures(scene), report),
  });
  if (composer && passCount > 0) {
    const geometry = screenGeometry(composer.passes);
    const offDone = plan.offscreen.length / passCount;
    steps.push({
      share: PASS_SHARE,
      run: async (report) => {
        try {
          gl.setRenderTarget(composer.inputBuffer);
          await compileWithProgress(gl, sceneOf(plan.offscreen, geometry), camera, (f) => report(f * offDone));
          gl.setRenderTarget(null);
          await compileWithProgress(gl, sceneOf(plan.onscreen, geometry), camera, (f) =>
            report(offDone + f * (1 - offDone)),
          );
        } finally {
          gl.setRenderTarget(previous);
        }
      },
    });
  }

  try {
    await runSteps(steps, onProgress);
  } finally {
    (envWarm as EnvironmentWarmUp | null)?.dispose();
    if (sceneTarget === null) offscreenTarget.dispose();
  }
  onProgress(1);
}
