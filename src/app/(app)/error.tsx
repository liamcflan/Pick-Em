"use client";

import { useEffect } from "react";

import { useOnline } from "@/components/pwa/use-online";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for signed-in pages. The common cause on a phone is a dropped connection during
 * navigation, so say that plainly when the browser is offline and offer a retry either way.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const online = useOnline();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md space-y-3 py-12 text-center">
      <h1 className="text-xl font-semibold">
        {online ? "Something went wrong" : "You're offline"}
      </h1>
      <p className="text-muted-foreground text-sm">
        {online
          ? "This page didn't load. Try again, and if it keeps happening let your commissioner know."
          : "This page needs a connection. It will load once you're back online."}
        {error.digest ? (
          <span className="block pt-1 text-xs">Reference: {error.digest}</span>
        ) : null}
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
