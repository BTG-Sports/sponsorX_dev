import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// next/font self-hosts at build time, so this carries no host coupling.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    >
      {/* suppressHydrationWarning: the pre-paint script below may set
          data-theme on <html> before React hydrates, and the JSX never
          declares it (vendored guide preventing-flash-before-hydration.md,
          Themes section). */}
      <html
        lang="en"
        className={`${poppins.variable} h-full antialiased`}
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
        </body>
      </html>
    </ClerkProvider>
  );
}
