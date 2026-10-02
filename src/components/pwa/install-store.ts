"use client";

/**
 * Tracks whether the app can be installed and how, for the dashboard install hint.
 *
 * - "prompt": Chrome/Edge/Android fired `beforeinstallprompt`; we can show our own Install button.
 * - "ios": iPhone/iPad Safari, which has no prompt API; we show "Share → Add to Home Screen".
 * - "hidden": a desktop or laptop, already installed, dismissed, the browser cannot install, or
 *   the visitor has not interacted with the page yet. Desktop Chrome also offers installation,
 *   but the hint is only worth the space on a phone or tablet.
 *
 * The hint waits for the first tap, scroll or key press: asking before someone has engaged is
 * pushy, and a card that paints during page load would also become the page's largest paint.
 */
export type InstallMode = "prompt" | "ios" | "hidden";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export const DISMISS_KEY = "pickem:install-hint-dismissed";

let deferred: BeforeInstallPromptEvent | null = null;
let engaged = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const ENGAGEMENT_EVENTS = ["pointerdown", "keydown", "scroll"] as const;
function onEngage() {
  engaged = true;
  for (const type of ENGAGEMENT_EVENTS) window.removeEventListener(type, onEngage, true);
  emit();
}

if (typeof window !== "undefined") {
  for (const type of ENGAGEMENT_EVENTS) {
    window.addEventListener(type, onEngage, { capture: true, passive: true });
  }
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

/** Phone or tablet: iOS/iPadOS, or a user agent that says Android or Mobile. */
export function isMobileDevice(userAgent: string, maxTouchPoints: number): boolean {
  return isIos(userAgent, maxTouchPoints) || /Android|Mobi/i.test(userAgent);
}

export type InstallInputs = {
  userAgent: string;
  maxTouchPoints: number;
  engaged: boolean;
  standalone: boolean;
  dismissed: boolean;
  canPrompt: boolean;
};

/** Which hint to show, if any. Pure, so the rules are unit-tested. */
export function installMode(i: InstallInputs): InstallMode {
  if (!isMobileDevice(i.userAgent, i.maxTouchPoints)) return "hidden";
  if (!i.engaged || i.standalone || i.dismissed) return "hidden";
  if (i.canPrompt) return "prompt";
  if (isIos(i.userAgent, i.maxTouchPoints)) return "ios";
  return "hidden";
}

export function getSnapshot(): InstallMode {
  return installMode({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    engaged,
    standalone: isStandalone(),
    dismissed: isDismissed(),
    canPrompt: deferred !== null,
  });
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
