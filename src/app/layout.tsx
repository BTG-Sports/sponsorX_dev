import type { Metadata } from "next";
import { Poppins } from "next/font/google";
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
    // suppressHydrationWarning: the pre-paint script below may set data-theme
    // on <html> before React hydrates, and the JSX never declares it (vendored
    // guide preventing-flash-before-hydration.md, Themes section).
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
  );
}
