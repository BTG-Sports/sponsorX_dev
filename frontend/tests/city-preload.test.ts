import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, FileLoader } from "three";

import { preloadCityFiles } from "../src/components/city/city-preload";

/* P1-ART-11 — the loading screen streams the scene's files itself and hands
   the bytes to three's cache so the scene's loaders never download them
   again. three keys that cache by loader kind (`file:` + url for the
   FileLoader that GLTFLoader and RGBELoader use), so the preload must store
   under exactly that key — otherwise every file downloads twice and the
   loader's number lies. */

const URL_GLB = "/models/city/test-kit.glb";
const BYTES = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);

describe("preloadCityFiles", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Cache.clear();
    fetchMock = vi.fn(async () => new Response(BYTES.slice(), { status: 200, headers: { "content-length": String(BYTES.length) } }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Cache.clear();
  });

  it("reports byte progress up to 1 and resolves", async () => {
    const seen: number[] = [];
    await preloadCityFiles([{ url: URL_GLB, estimate: BYTES.length }], (f) => seen.push(f));
    expect(seen[seen.length - 1]).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stores the bytes where three's FileLoader looks, so the loader does not fetch again", async () => {
    await preloadCityFiles([{ url: URL_GLB, estimate: BYTES.length }], () => {});

    const loaded = await new Promise<ArrayBuffer>((resolve, reject) => {
      new FileLoader().setResponseType("arraybuffer").load(URL_GLB, (data) => resolve(data as ArrayBuffer), undefined, reject);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(loaded)).toEqual(BYTES);
  });

  it("skips the download when the bytes are already cached under three's key", async () => {
    await preloadCityFiles([{ url: URL_GLB, estimate: BYTES.length }], () => {});
    await preloadCityFiles([{ url: URL_GLB, estimate: BYTES.length }], () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
