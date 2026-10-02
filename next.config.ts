import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Do not advertise the framework in responses.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Browsers must always re-check the service worker so fixes reach installed apps.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  images: {
    // Logos are served from Supabase Storage; the host is set per environment.
    remotePatterns: [
      { protocol: "https", hostname: "a.espncdn.com" }, // team logos
      ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost }] : []),
    ],
  },
};

export default nextConfig;
