"use client";

import { useEffect } from "react";

// Side effect: start listening for `beforeinstallprompt` on every page, not just the dashboard,
// because browsers fire it once, often before the dashboard's install hint has loaded.
import "@/components/pwa/install-store";

/**
 * Registers public/sw.js (offline page + installability). Production only: in development a
 * service worker would outlive code changes and make hot reload confusing.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => console.warn("service worker registration failed", error));
  }, []);
  return null;
}
