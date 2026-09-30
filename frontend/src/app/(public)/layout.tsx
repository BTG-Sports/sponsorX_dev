import { LandingLoader } from "@/components/landing-loader";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

/* The public pages share the home's boot screen (P1-ART-11): a hard load or
   refresh of any of them shows it once, waiting on the page's own fonts and
   load (there is no city here). Client-side moves between them — and to or
   from the home — get the page transition instead (P1-ART-12, mounted in
   the root layout). Without JS the loader never shows. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <noscript>
        <style>{`.sx-loader{display:none!important}`}</style>
      </noscript>
      <LandingLoader city={false} />
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}
