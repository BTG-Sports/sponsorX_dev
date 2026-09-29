/* --------------------------------------------------------------------------
   City poster / fallback background (P1-ART-09).

   Rendered immediately (server) for a fast LCP and used as the permanent
   fallback whenever the 3D city does not run — reduced-motion, no-JS,
   no-WebGL, a low-perf device, or the FPS watchdog pulling the scene. The
   WebGL canvas later fades in over this. A night-sky composition in the
   brand colours: a cool primary-blue cast high on the left (the skyscraper
   side), a warm accent-orange glow low on the right (the venue floodlights)
   and a faint horizon band, all on `--sx-bg`. Purely decorative → aria-hidden,
   fixed, behind everything. Ported from the P1-ART-08 landing poster.
   -------------------------------------------------------------------------- */

export function CityPoster() {
  return (
    <div
      aria-hidden="true"
      data-city-poster="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          "radial-gradient(80% 60% at 78% 92%, rgba(249,122,31,.18), transparent 55%)," +
          "radial-gradient(70% 55% at 20% 8%, rgba(46,155,245,.14), transparent 60%)," +
          "radial-gradient(120% 30% at 50% 70%, rgba(46,155,245,.06), transparent 70%)," +
          "var(--sx-bg)",
      }}
    >
      {/* Swap for a baked still of the city once the render exists:
          <img src="/img/city/poster.webp" alt="" className="h-full w-full object-cover opacity-60" /> */}
    </div>
  );
}
