import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
