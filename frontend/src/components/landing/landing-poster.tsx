/* --------------------------------------------------------------------------
   Landing poster / fallback background (P1-ART-08).

   Rendered immediately (server) for a fast LCP and used as the permanent
   fallback whenever the 3D scene does not run — reduced-motion, no-JS,
   no-WebGL, or a low-perf device. The three.js canvas later cross-fades over
   this. Purely decorative → aria-hidden, fixed, behind everything.
   -------------------------------------------------------------------------- */

export function LandingPoster() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          "radial-gradient(80% 60% at 78% 92%, rgba(249,122,31,.18), transparent 55%)," +
          "radial-gradient(70% 55% at 20% 8%, rgba(46,155,245,.12), transparent 60%)," +
          "var(--sx-bg)",
      }}
    >
      {/* Swap for a baked still once landing art lands:
          <img src="/img/landing/poster-hero.webp" alt="" className="h-full w-full object-cover opacity-60" /> */}
    </div>
  );
}
