/* --------------------------------------------------------------------------
   City preload (P1-ART-11) — streams the scene's files with byte progress
   and hands them to three.js so the loaders never fetch them again.

   three's FileLoader checks `THREE.Cache` by URL before it fetches; both
   the GLTFLoader (the kit) and the RGBELoader (the HDR, via
   DataTextureLoader) go through it with `responseType: "arraybuffer"`. So:
   fetch each file here with a ReadableStream, report bytes as they arrive,
   and `Cache.add(url, arrayBuffer)`. When the scene then mounts, drei's
   `useGLTF` / `<Environment files>` resolve from memory — no second
   download, and the loader's number was the real download.

   This module imports `three`, so it must only ever be dynamic-imported —
   from city-backdrop.tsx after the capability gate — to keep three out of
   the poster-only bundle (same rule as city-scene.tsx).

   A file that is not there (404) or fails to stream is reported complete
   and left out of the cache; asset-guard.tsx then renders the scene
   without it, exactly as before.
   -------------------------------------------------------------------------- */
import { Cache } from "three";

import type { PreloadFile } from "@/lib/city/assets";
import { byteFraction, type ByteItem } from "@/lib/city/loading";

/** Fetch every file, streaming, and cache the bytes for three's loaders.
 *  `onProgress` receives the combined 0..1 fraction; resolves when all are
 *  finished (successfully or not). Never rejects. */
export async function preloadCityFiles(
  files: readonly PreloadFile[],
  onProgress: (fraction: number) => void,
): Promise<void> {
  Cache.enabled = true;

  const items: ByteItem[] = files.map((f) => ({ loaded: 0, estimate: f.estimate }));
  const report = () => onProgress(byteFraction(items));

  await Promise.all(
    files.map(async (file, i) => {
      const item = items[i];
      try {
        if (Cache.get(file.url) !== undefined) {
          item.done = true;
          report();
          return;
        }
        const res = await fetch(file.url);
        if (!res.ok || !res.body) {
          item.done = true;
          report();
          return;
        }
        const len = Number(res.headers.get("content-length"));
        if (Number.isFinite(len) && len > 0) item.total = len;

        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          item.loaded += value.byteLength;
          report();
        }
        const buf = new Uint8Array(item.loaded);
        let offset = 0;
        for (const c of chunks) {
          buf.set(c, offset);
          offset += c.byteLength;
        }
        Cache.add(file.url, buf.buffer);
      } catch {
        // Network error mid-stream: the scene's own loader will retry (and
        // asset-guard handles a hard failure). Do not hold the loader up.
      } finally {
        item.done = true;
        report();
      }
    }),
  );
}
