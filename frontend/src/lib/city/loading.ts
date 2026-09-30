/* --------------------------------------------------------------------------
   Landing loading screen (P1-ART-11) — the pure maths.

   The loader shows one number, 0..100, and it must be honest: 100 only when
   the city can actually be shown. The number is a weighted sum of three
   tasks, each 0..1:

     assets   the tier's kit GLB and the environment HDR, by bytes streamed
     scene    the three.js chunk loaded (0.4), then the first drawn frame of
              the city (1)
     content  the page's fonts and window `load`

   On the poster path (no WebGL, reduced motion, a low-perf device) there is
   no scene to wait for, so the backdrop marks `assets` and `scene` complete
   at once and the loader finishes on `content` alone.

   `byteFraction` folds several downloads into one fraction. A response
   without a Content-Length (a compressing proxy) falls back to the caller's
   estimate — the known file sizes — so the bar still moves rather than
   sitting at 0 until the file lands.
   -------------------------------------------------------------------------- */

export type LoadTask = "assets" | "scene" | "content";

export type LoadTasks = Record<LoadTask, number>;

/** Share of the bar each task owns. Sums to 1. */
export const TASK_WEIGHT: LoadTasks = { assets: 0.55, scene: 0.35, content: 0.1 };

/** Scene progress once its JS chunk has arrived but nothing is drawn yet. */
export const SCENE_MODULE_LOADED = 0.4;

export const INITIAL_TASKS: LoadTasks = { assets: 0, scene: 0, content: 0 };

/** Every task complete — what the poster path and the safety timeout write. */
export const COMPLETE_TASKS: LoadTasks = { assets: 1, scene: 1, content: 1 };

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Weighted overall progress, 0..1. */
export function overallProgress(tasks: LoadTasks): number {
  let sum = 0;
  for (const key of Object.keys(TASK_WEIGHT) as LoadTask[]) {
    sum += TASK_WEIGHT[key] * clamp01(tasks[key]);
  }
  return clamp01(sum);
}

export interface ByteItem {
  loaded: number;
  /** Content-Length when the server sent one. */
  total?: number;
  /** Fallback size when it did not. */
  estimate: number;
  /** Finished (however it ended — a 404 counts as done). */
  done?: boolean;
}

/** Fraction of all bytes across several downloads. A finished item counts
 *  as its full size whatever was actually received (a 404 body is tiny). */
export function byteFraction(items: readonly ByteItem[]): number {
  if (items.length === 0) return 1;
  let loaded = 0;
  let total = 0;
  for (const it of items) {
    const size = Math.max(1, it.total ?? it.estimate);
    total += size;
    loaded += it.done ? size : Math.min(size, Math.max(0, it.loaded));
  }
  return total === 0 ? 1 : clamp01(loaded / total);
}

/** Moves the displayed value toward the real one. Never overshoots, never
 *  lags more than a frame once the target is reached, and snaps when the
 *  gap is below a third of a percent so the counter does not stall at 99. */
export function easeDisplayed(displayed: number, target: number, dtSeconds: number, rate = 6): number {
  if (target <= displayed) return target;
  const next = displayed + (target - displayed) * Math.min(1, dtSeconds * rate);
  return target - next < 0.003 ? target : next;
}

export interface FinishInput {
  /** The real, weighted progress. */
  target: number;
  /** What the counter currently shows. */
  displayed: number;
  /** Milliseconds since the loader mounted. */
  elapsedMs: number;
  /** Minimum time on screen so the animation reads and nothing flashes. */
  minShowMs: number;
}

/** May the loader leave? Only when everything is truly loaded, the counter
 *  has caught up, and it has been on screen long enough. */
export function canFinish({ target, displayed, elapsedMs, minShowMs }: FinishInput): boolean {
  return target >= 1 && displayed >= 1 && elapsedMs >= minShowMs;
}
