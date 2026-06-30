import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ask.alimuhammadi.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Citation-Grounded RAG — answers you can verify, line by line",
  description:
    "A retrieval-augmented Q&A engine over the U.S. founding documents: hybrid retrieval (BM25 + embeddings + RRF), native verifiable citations, abstains when the sources don't support an answer, and an eval harness that scores it.",
  openGraph: {
    title: "Citation-Grounded RAG",
    description:
      "Hybrid retrieval + native citations + an abstain path, measured with an eval harness. Every claim links to its source.",
    url: siteUrl,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Citation-Grounded RAG",
    description:
      "Every claim links to its source — or the engine abstains. Hybrid retrieval, native citations, measured by an eval harness.",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f2" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-paper text-ink">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <div className="grain-layer" aria-hidden />
        <div className="depth-layer" aria-hidden />
        <div className="lift-layer" aria-hidden />
        <MotionProvider>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
