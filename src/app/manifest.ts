import type { MetadataRoute } from "next";

/**
 * Web app manifest (served at /manifest.webmanifest). With it and the service worker in
 * public/sw.js, phones offer "Add to Home Screen" / "Install app", and the app opens full screen
 * on the dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "10K Pool HQ",
    short_name: "10K Pool HQ",
    description: "NFL spread pick'em for friend groups.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["sports", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
