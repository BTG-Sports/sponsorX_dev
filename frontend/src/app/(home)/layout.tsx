import { SiteHeader } from "@/components/site-chrome";

/* --------------------------------------------------------------------------
   Home route group — the public header without the shared footer. The
   landing page is one viewport-high fly-through whose last stop carries
   the footer inside its stage (the owner wants the closing section and
   the footer visible without scrolling), so the footer is rendered there
   and not here. Every other public page stays in (public) and keeps the
   layout footer.

   `data-sx-landing` scopes the loading screen's entrance (`.sx-reveal`,
   globals.css) to this route: the header fades in with the hero once the
   loader (P1-ART-11) sets `html[data-sx-loaded]`. Opacity only on the
   header — a transform on a sticky ancestor would pin it to its own box.
   -------------------------------------------------------------------------- */

export default function HomeLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-sx-landing="" className="contents">
      <div className="sx-reveal-fade sticky top-0 z-20" style={{ "--sx-reveal-delay": "0.55s" } as React.CSSProperties}>
        <SiteHeader />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
