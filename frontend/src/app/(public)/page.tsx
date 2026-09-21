import { LandingPoster } from "@/components/landing/landing-poster";
import { LandingSceneMount } from "@/components/landing/landing-scene-mount";
import { LandingContent } from "@/components/landing/landing-content";

/* --------------------------------------------------------------------------
   SponsorX network landing — §9 screen 1 (P1-ART-08 redesign).

   Immersive "follow the ball" scroll experience: a centered 3D ball spins and
   morphs through four sports while per-sport environments cross-fade behind it;
   2D chapter content frames it. This file stays a server component — it renders
   the static poster + real DOM content (LCP-safe, SEO-safe, and the permanent
   fallback). The three.js scene layer is added in Task 6 (client, ssr:false).
   Design: docs/superpowers/specs/2026-09-22-landing-3d-scrollytelling-design.md
   -------------------------------------------------------------------------- */

export default function HomePage() {
  return (
    <>
      <LandingPoster />
      <LandingSceneMount />
      <LandingContent />
    </>
  );
}
