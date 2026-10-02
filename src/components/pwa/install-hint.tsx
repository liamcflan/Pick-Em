"use client";

import { useSyncExternalStore } from "react";

import {
  dismiss,
  getServerSnapshot,
  getSnapshot,
  promptInstall,
  subscribe,
} from "@/components/pwa/install-store";
import { Button } from "@/components/ui/button";

/**
 * "Install 10K Pool HQ" card on the dashboard; hidden once installed or dismissed.
 *
 * It can only appear after hydration (the server cannot know the platform), so it floats over the
 * bottom of the screen instead of sitting in the page flow, where it would shift the dashboard
 * down (CLS) and become the page's largest paint.
 */
export function InstallHint() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (mode === "hidden") return null;

  return (
    <section
      aria-labelledby="install-hint-title"
      data-testid="install-hint"
      className="bg-background fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md flex-col gap-3 rounded-lg border p-4 text-sm shadow-lg sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 id="install-hint-title" className="font-medium">
          Install 10K Pool HQ
        </h2>
        <p className="text-muted-foreground">
          {mode === "ios"
            ? "Tap the Share button, then “Add to Home Screen”, to open 10K Pool HQ like an app."
            : "Add 10K Pool HQ to your home screen to open it like an app."}
        </p>
      </div>
      <div className="flex gap-2">
        {mode === "prompt" ? (
          <Button size="sm" onClick={() => void promptInstall()}>
            Install
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </section>
  );
}
