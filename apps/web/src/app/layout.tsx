import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Unbounded } from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";
import { AccountNotice } from "@/components/layout/account-notice";
import { Intro } from "@/components/layout/intro";
import { INTRO_KEY } from "@/lib/utils";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

const display = Unbounded({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AsterraPools | Built for the flow of every market", template: "%s · AsterraPools" },
  description:
    "AsterraPools builds liquidity on Robinhood Chain. DLMM bins and DAMM curves for every kind of pool, LP positions as NFTs and one smart router across every venue.",
  openGraph: { siteName: "AsterraPools", type: "website" },
  twitter: { card: "summary_large_image", site: "@PulseOfAster", creator: "@PulseOfAster" },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://testnet.asterrapools.tech"),
};

export const viewport: Viewport = {
  themeColor: [{ color: "#06080c" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes sets the class before paint; suppress the expected attribute mismatch
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* runs before first paint: the intro plays once per browser session */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{sessionStorage.getItem("${INTRO_KEY}")&&(document.documentElement.dataset.intro="seen")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <Intro />
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <AccountNotice />
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
