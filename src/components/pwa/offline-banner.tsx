"use client";

import { useOnline } from "@/components/pwa/use-online";

/** Thin banner across the top of every page while the device has no connection. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    >
      You&apos;re offline. Scores won&apos;t update and picks can&apos;t be saved until you
      reconnect.
    </div>
  );
}
