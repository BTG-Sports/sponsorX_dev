import type { Metadata } from "next";
import { Bebas_Neue, Poppins, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { PageTransition } from "@/components/page-transition";
import "./globals.css";

// next/font self-hosts at build time, so this carries no host coupling.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/* The two magazine faces for /next/about (design spec 2026-09-30 §2):
   Bebas Neue for cover lines and spread headlines, Source Serif 4 for body
   text on paper. Exposed as `font-mag` / `font-mag-serif` (globals.css
   @theme); nothing outside `.sx-mag` uses them. */
const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
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
      {/* suppressHydrationWarning: the pre-paint script below may set
          data-theme on <html> before React hydrates, and the JSX never
          declares it (vendored guide preventing-flash-before-hydration.md,
          Themes section). */}
      <html
        lang="en"
        className={`${poppins.variable} ${bebas.variable} ${sourceSerif.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          <script
            // Applies the stored theme before first paint; dark needs no attribute.
            dangerouslySetInnerHTML={{
              __html: `try{if(localStorage.getItem("sx-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`,
            }}
          />
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
