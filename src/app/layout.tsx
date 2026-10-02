import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "10K Pool HQ", template: "%s · 10K Pool HQ" },
  description: "NFL spread pick'em for friend groups.",
  applicationName: "10K Pool HQ",
  // iPhone "Add to Home Screen": open full screen with our icon and name.
  appleWebApp: { capable: true, title: "10K Pool HQ", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the per-request CSP nonce also opts every route into dynamic rendering, which the
  // nonce requires (a prerendered page would ship scripts tagged with a stale nonce).
  await headers();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <OfflineBanner />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
