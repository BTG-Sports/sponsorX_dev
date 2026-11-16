"use client";

import { useState, type ReactNode } from "react";

import { Glyph } from "@/components/athlete-inventory/glyphs";

/* --------------------------------------------------------------------------
   POL-FE-86 — the athlete's "see it as a sponsor" (/athlete/listings/[id]/
   preview): the shop's own card (ShopListingCard, untouched — it IS what
   sponsors get) set in a shop window, so the athlete sees it where sponsors
   meet it. A Desktop ↔ Phone switch resizes the window (the grid inside
   follows the window's own width, a container query). The neighbours are
   blank placeholders, never made-up listings.
   -------------------------------------------------------------------------- */

type Device = "desktop" | "phone";

export function PreviewWindow({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Device>("desktop");
  return (
    <div className="sx-pv-stage">
      <div role="group" aria-label="Show on" className="sx-pv-devices sx-iv-rise">
        {(["desktop", "phone"] as const).map((dv) => (
          <button key={dv} type="button" aria-pressed={device === dv} onClick={() => setDevice(dv)} className="sx-pv-device">
            <Glyph ui={dv === "desktop" ? "grid" : "rows"} className="size-4" />
            {dv === "desktop" ? "Desktop" : "Phone"}
          </button>
        ))}
      </div>

      <div className="sx-pv-window sx-iv-rise" data-device={device} style={{ "--d": "0.1s" } as React.CSSProperties}>
        <div className="sx-pv-chrome" aria-hidden="true">
          <span className="sx-pv-lights">
            <span />
            <span />
            <span />
          </span>
          <span className="sx-pv-address">
            <Glyph ui="lock" className="size-3" /> SponsorX · Shop
          </span>
        </div>
        <div className="sx-pv-shop">
          <div className="sx-pv-shop-head" aria-hidden="true">
            <span className="sx-pv-shop-title">Shop</span>
            <span className="sx-pv-search">
              <Glyph ui="eye" className="size-3.5" /> Search athletes and items
            </span>
          </div>
          <ul className="sx-pv-grid" aria-label="In the shop">
            {children}
            <li className="sx-pv-ghost" aria-hidden="true">
              <span />
              <span />
              <span />
            </li>
            <li className="sx-pv-ghost" aria-hidden="true">
              <span />
              <span />
              <span />
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
