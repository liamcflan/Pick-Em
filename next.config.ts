import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  // Do not advertise the framework in responses.
  poweredByHeader: false,
  images: {
    // Logos are served from Supabase Storage; the host is set per environment.
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : [],
  },
};

export default nextConfig;
