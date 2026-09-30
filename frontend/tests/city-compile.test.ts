import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  collectPassMaterials,
  collectSceneTextures,
  compileWithProgress,
  planPassCompiles,
  uploadTextures,
  type CompileRenderer,
} from "../src/lib/city/compile";

/* P1-ART-11 — shader warm-up. The landing page must never draw a frame that
   blocks on shader compilation, so every material is compiled through the
   renderer's non-blocking path first, and the loader's counter follows the
   programs as they become ready. These tests drive a fake renderer. */

/** A renderer whose programs become ready one per `readyEveryMs`. */
function fakeRenderer(materials: THREE.Material[], readyEveryMs: number) {
  const readyAt = new Map<THREE.Material, number>();
  const start = Date.now();
  materials.forEach((m, i) => readyAt.set(m, start + readyEveryMs * (i + 1)));
  const compile = vi.fn(() => new Set(materials));
  const renderer: CompileRenderer = {
    compile,
    properties: {
      get: (m: THREE.Material) => ({
        currentProgram: { isReady: () => Date.now() >= (readyAt.get(m) ?? 0) },
      }),
    },
  };
  return { renderer, compile };
}

describe("compileWithProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("issues the compile once, reports monotone progress and resolves at 1", async () => {
    const mats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial(), new THREE.ShaderMaterial()];
    const { renderer, compile } = fakeRenderer(mats, 100);
    const seen: number[] = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const done = compileWithProgress(renderer, scene, camera, (f) => seen.push(f), { pollMs: 10 });
    await vi.advanceTimersByTimeAsync(350);
    await done;

    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith(scene, camera);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    // three programs became ready one at a time, so 1/3 and 2/3 were reported.
    expect(seen).toContain(1 / 3);
    expect(seen).toContain(2 / 3);
  });

  it("resolves at once when there is nothing to compile", async () => {
    const { renderer } = fakeRenderer([], 100);
    const seen: number[] = [];
    await compileWithProgress(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), (f) => seen.push(f));
    expect(seen).toEqual([1]);
  });

  it("treats a material without a program (disposed) as ready", async () => {
    const m = new THREE.MeshStandardMaterial();
    const renderer: CompileRenderer = {
      compile: () => new Set([m]),
      properties: { get: () => ({}) },
    };
    const seen: number[] = [];
    const done = compileWithProgress(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), (f) => seen.push(f), { pollMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    await done;
    expect(seen[seen.length - 1]).toBe(1);
  });
});

describe("collectPassMaterials", () => {
  it("finds the fullscreen material and every material nested in a pass's effects and sub-passes", () => {
    const top = new THREE.ShaderMaterial();
    const lum = new THREE.ShaderMaterial();
    const down = new THREE.ShaderMaterial();
    const up = new THREE.ShaderMaterial();
    // Shapes mirror postprocessing: an EffectPass with a merged material,
    // whose Bloom effect owns a luminance pass and a mipmap-blur pass that
    // swaps between two materials at render time.
    const blurPass = { render() {}, fullscreenMaterial: down, downsamplingMaterial: down, upsamplingMaterial: up };
    const luminancePass = { render() {}, fullscreenMaterial: lum };
    const bloom = { luminancePass, blurPass, name: "BloomEffect" };
    const effectPass = { render() {}, fullscreenMaterial: top, effects: [bloom], renderer: { isWebGLRenderer: true } };
    // The render pass points at the main scene, whose meshes carry their own
    // materials — those belong to the scene's compile, not the passes'.
    const sceneMaterial = new THREE.MeshStandardMaterial();
    const mainScene = new THREE.Scene();
    mainScene.add(new THREE.Mesh(new THREE.BufferGeometry(), sceneMaterial));
    const renderPass = { render() {}, fullscreenMaterial: null, mainScene };

    const found = collectPassMaterials([renderPass, effectPass]);
    expect(new Set(found)).toEqual(new Set([top, lum, down, up]));
    expect(found).not.toContain(sceneMaterial);
  });

  it("plans the final pass's own material for the screen and everything else offscreen", () => {
    const top = new THREE.ShaderMaterial();
    const lum = new THREE.ShaderMaterial();
    const smaa = new THREE.ShaderMaterial();
    const disabled = new THREE.ShaderMaterial();
    const passes = [
      { render() {}, fullscreenMaterial: null, renderToScreen: false },
      { render() {}, fullscreenMaterial: smaa, renderToScreen: false },
      { render() {}, fullscreenMaterial: disabled, renderToScreen: false, enabled: false },
      { render() {}, fullscreenMaterial: top, renderToScreen: true, effects: [{ luminancePass: { render() {}, fullscreenMaterial: lum } }] },
    ];
    const plan = planPassCompiles(passes);
    expect(plan.onscreen).toEqual([top]);
    expect(new Set(plan.offscreen)).toEqual(new Set([smaa, lum]));
  });

  it("does not loop on cyclic references", () => {
    const m = new THREE.ShaderMaterial();
    const a: Record<string, unknown> = { render() {}, fullscreenMaterial: m };
    a.self = a;
    a.parentPass = { render() {}, child: a };
    expect(collectPassMaterials([a])).toEqual([m]);
  });
});

/** A texture-shaped object of a given size, without allocating pixels. */
function fakeTexture(width: number, height: number): THREE.Texture {
  const t = new THREE.Texture();
  t.image = { width, height };
  return t;
}

describe("collectSceneTextures", () => {
  it("finds each texture on any material under the scene once, arrays included", () => {
    const map = fakeTexture(64, 64);
    const normal = fakeTexture(64, 64);
    const other = fakeTexture(32, 32);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map, normalMap: normal })));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map })));
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), [new THREE.MeshBasicMaterial({ map: other }), new THREE.MeshBasicMaterial()]));
    scene.add(new THREE.PointLight());
    expect(new Set(collectSceneTextures(scene))).toEqual(new Set([map, normal, other]));
    expect(collectSceneTextures(scene)).toHaveLength(3);
  });
});

describe("uploadTextures", () => {
  it("uploads every texture, yielding a frame whenever a batch would exceed the byte budget", async () => {
    const textures = [1024, 1024, 1024, 256, 1024].map((s) => fakeTexture(s, s));
    const init = vi.fn();
    const yields = vi.fn(async () => {});
    const seen: number[] = [];
    // 1024² with mips ≈ 5.6 MB; a 10 MB budget takes one per batch, and the
    // 256² rides along with the third: batches [1] [2] [3, 256] [4].
    await uploadTextures({ initTexture: init }, textures, (f) => seen.push(f), { bytesPerFrame: 10 * 1024 * 1024, yieldFrame: yields });
    expect(init).toHaveBeenCalledTimes(5);
    expect(init.mock.calls.map((c) => c[0])).toEqual(textures);
    expect(yields).toHaveBeenCalledTimes(3);
    expect(seen[0]).toBe(0);
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it("reports 1 at once with nothing to upload", async () => {
    const seen: number[] = [];
    await uploadTextures({ initTexture: vi.fn() }, [], (f) => seen.push(f), { yieldFrame: async () => {} });
    expect(seen).toEqual([1]);
  });
});
