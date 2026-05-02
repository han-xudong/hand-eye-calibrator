import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { siteDescription, siteKeywords, siteName, siteOgImage, siteUrl } from "./site-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: siteKeywords,
  authors: [{ name: "Xudong Han", url: "https://github.com/han-xudong" }],
  creator: "Xudong Han",
  publisher: "Xudong Han",
  alternates: {
    canonical: "/",
  },
  category: "technology",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: siteName,
    description: siteDescription,
    images: [
      {
        url: siteOgImage,
        width: 1400,
        height: 910,
        alt: "Hand-Eye Calibrator interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: [siteOgImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
