"use client";

/**
 * Tracks whether the app can be installed and how, for the dashboard install hint.
 *
 * - "prompt": Chrome/Edge/Android fired `beforeinstallprompt`; we can show our own Install button.
 * - "ios": iPhone/iPad Safari, which has no prompt API; we show "Share → Add to Home Screen".
 * - "hidden": already installed, dismissed, or the browser cannot install.
 */
export type InstallMode = "prompt" | "ios" | "hidden";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const DISMISS_KEY = "pickem:install-hint-dismissed";

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // keep the event so our button can show the browser's dialog
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode): just keep showing the hint
  }
}

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS reports a Mac user agent, so a touch-capable "Macintosh" is an iPad.
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function getSnapshot(): InstallMode {
  if (isStandalone() || isDismissed()) return "hidden";
  if (deferred) return "prompt";
  if (isIos(navigator.userAgent, navigator.maxTouchPoints)) return "ios";
  return "hidden";
}

export function getServerSnapshot(): InstallMode {
  return "hidden";
}

export function dismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore: the hint simply comes back next visit
  }
  emit();
}

export async function promptInstall() {
  const event = deferred;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  deferred = null; // a prompt event can only be used once
  emit();
}
