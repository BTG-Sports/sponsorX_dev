/* --------------------------------------------------------------------------
   Load store (P1-ART-11) — the three tasks the landing loader sums.

   Written by the city backdrop (`assets` as bytes stream in, `scene` when
   the chunk lands and when the first city frame is drawn — or both set
   complete at once on the poster path) and by the loader itself
   (`content`). The loader subscribes and shows `overallProgress`.

   `reset()` runs when the loader mounts, so a client-side return to the
   home starts from 0 again (the bytes are already in three's cache, so
   `assets` jumps straight back to 1 — which is honest).
   -------------------------------------------------------------------------- */
import { create } from "zustand";

import { clamp01, INITIAL_TASKS, type LoadTask, type LoadTasks } from "./loading";

export interface LoadState {
  tasks: LoadTasks;
  /** Set one task's progress, 0..1. Never lets a task go backwards. */
  setTask: (task: LoadTask, value: number) => void;
  /** Mark every task done — the safety timeout and the poster path. */
  completeAll: () => void;
  reset: () => void;
}

export const useLoad = create<LoadState>((set) => ({
  tasks: { ...INITIAL_TASKS },
  setTask: (task, value) =>
    set((s) => {
      const v = clamp01(value);
      if (v <= s.tasks[task]) return s;
      return { tasks: { ...s.tasks, [task]: v } };
    }),
  completeAll: () => set({ tasks: { assets: 1, scene: 1, content: 1 } }),
  reset: () => set({ tasks: { ...INITIAL_TASKS } }),
}));
