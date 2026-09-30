/* --------------------------------------------------------------------------
   Flight store (P1-ART-09) — the one number that drives the fly-through.

   `progress` is scroll position over the scroll track, 0..1. The scroll
   track writes it on every Lenis scroll event; the camera rig reads it in
   useFrame (`useFlight.getState()`, no React render) and each overlay stop
   subscribes to it and writes its own opacity through a ref. Nothing
   re-renders on scroll.
   -------------------------------------------------------------------------- */
import { create } from "zustand";

export interface FlightState {
  /** 0 at the top of the track (the plaza), 1 at the bottom (the skyscraper). */
  progress: number;
  setProgress: (progress: number) => void;
}

export const useFlight = create<FlightState>((set) => ({
  progress: 0,
  setProgress: (progress) => set({ progress }),
}));
