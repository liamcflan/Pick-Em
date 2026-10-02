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

/** "Install Pick-Em" card on the dashboard; hidden once installed or dismissed. */
export function InstallHint() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (mode === "hidden") return null;

  return (
    <section
      aria-labelledby="install-hint-title"
      data-testid="install-hint"
      className="flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 id="install-hint-title" className="font-medium">
          Install Pick-Em
        </h2>
        <p className="text-muted-foreground">
          {mode === "ios"
            ? "Tap the Share button, then “Add to Home Screen”, to open Pick-Em like an app."
            : "Add Pick-Em to your home screen to open it like an app."}
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
