"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Error boundary for public pages (home, sign-in, status). Signed-in pages have their own. */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md flex-1 space-y-3 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        This page didn&apos;t load. The status page shows whether the site is set up correctly.
        {error.digest ? (
          <span className="block pt-1 text-xs">Reference: {error.digest}</span>
        ) : null}
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/status">Site status</Link>
        </Button>
      </div>
    </main>
  );
}
