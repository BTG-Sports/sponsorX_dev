/* --------------------------------------------------------------------------
   BTG SponsorX wordmark (Roadmap A0).

   The official brand lockup — "BTG SPONSOR X · Athlete Network. Brand Impact."
   — lives in raw-assets/logo/ and is copied to /public. It has a metallic /
   gradient treatment, so it is a raster asset, not type. Rendered as a plain
   <img> to stay host-portable: no dependency on next/image's optimizer, which
   CLAUDE.md flags as a host-specific primitive to adopt only deliberately.

   Size it by height from the caller, e.g. <Logo className="h-7" />. The
   browser-tab favicon is the circular BTG badge (src/app/icon.png).
   -------------------------------------------------------------------------- */

export function Logo({ className = "h-7" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- deliberate: keep the brand logo host-portable, no next/image optimizer
    <img
      src="/sponsorx-title.png"
      alt="BTG SponsorX — Athlete Network. Brand Impact."
      className={`w-auto ${className}`}
    />
  );
}
