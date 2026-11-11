import type { Metadata } from "next";
import localFont from "next/font/local";
import { ClerkProvider } from "@clerk/nextjs";

import { PageTransition } from "@/components/page-transition";
import "./globals.css";

/* The fonts are committed under app/fonts and loaded with next/font/local,
   so `next build` needs no network. next/font/google downloaded them from
   Google Fonts on every build, and a failed download failed the build
   (CI, 2026-11-11). Same files Google served: the Latin subset, woff2.
   Licences: app/fonts/OFL-*.txt (SIL Open Font Licence 1.1). */
const poppins = localFont({
  variable: "--font-poppins",
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
  ],
  fallback: ["system-ui", "Arial", "sans-serif"],
});

/* The two magazine faces for /next/about (design spec 2026-09-30 §2):
   Bebas Neue for cover lines and spread headlines, Source Serif 4 for body
   text on paper. Exposed as `font-mag` / `font-mag-serif` (globals.css
   @theme); nothing outside `.sx-mag` uses them. `preload: false` because
   only /next/about draws them; the browser fetches the files when
   `font-mag` / `font-mag-serif` is first used. */
const bebas = localFont({
  variable: "--font-bebas",
  src: [{ path: "./fonts/bebas-neue-400.woff2", weight: "400", style: "normal" }],
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
  preload: false,
});
/* Source Serif 4 is a variable font: one file per style covers 400 and 600. */
const sourceSerif = localFont({
  variable: "--font-source-serif",
  src: [
    { path: "./fonts/source-serif-4-roman.woff2", weight: "400 600", style: "normal" },
    { path: "./fonts/source-serif-4-italic.woff2", weight: "400 600", style: "italic" },
  ],
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
  preload: false,
});

export const metadata: Metadata = {
  title: "SponsorX — BTG Sports Group",
  description:
    "Sponsorship operating system: sponsors buy packages, athletes deliver, fans redeem.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /* ClerkProvider wraps <html>, not the body — it needs to be the outermost
       element so Clerk's own components can render anywhere in the tree
       (P2-INT-01). It authenticates only; tenant and roles come from Postgres
       via src/server/identity.ts, never from a session claim (Addendum A4). */
    <ClerkProvider
      /* Our own sign-in screen, not Clerk's hosted account portal. Matches the
         signInUrl in src/proxy.ts so client-side and proxy redirects agree. */
      signInUrl="/login"
      /* Match the BTG palette rather than shipping Clerk's default purple.
         Set through `variables` instead of the @clerk/themes package, because
         B0 forbids adding a dependency for something a few tokens can do. */
      appearance={{
        variables: {
          colorPrimary: "#2E9BF5",
          colorBackground: "#0A0C10",
          borderRadius: "0.5rem",
        },
      }}
      /* The widget's headline defaults to the Clerk *application name* —
         "My Application" on an unclaimed dev instance — on the most-seen
         screen of the product. Brand it here rather than trusting every
         environment's dashboard setting. */
      localization={{
        signIn: {
          start: {
            title: "Sign in to SponsorX",
            subtitle: "Welcome back — pick up where you left off",
            /* the combined sign-in/sign-up flow (new instances' default)
               renders these, not title/subtitle */
            titleCombined: "Sign in to SponsorX",
            subtitleCombined: "Welcome back — pick up where you left off",
          },
        },
      }}
    >
      {/* One theme, dark (2026-10-14: the day/night toggle was removed, and a
          visitor's old "sx-theme" choice is no longer read). Client code
          still writes attributes on <html> that the JSX never declares —
          the landing loader's data-sx-booted, the proposal print's
          data-theme (lib/print-light.ts) — hence suppressHydrationWarning. */}
      <html
        lang="en"
        className={`${poppins.variable} ${bebas.variable} ${sourceSerif.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          {children}
          {/* The public site's page transition (P1-ART-12). Here, above the
              route groups, so it survives the move between (home) and
              (public); inert everywhere else. */}
          <PageTransition />
        </body>
      </html>
    </ClerkProvider>
  );
}
