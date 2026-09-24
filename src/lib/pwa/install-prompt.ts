"use client";

import { useSyncExternalStore } from "react";

/** Chrome/Android's deferred install prompt. Not in the TS DOM lib. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
/** True once the browser reports the app was installed from this tab. */
let justInstalled = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

// Registered when this module first loads (it's imported from the root
// layout), because Chrome fires the event once, early, and never again.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    justInstalled = true;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The captured install prompt, if the browser offered one. */
export function useInstallPrompt(): BeforeInstallPromptEvent | null {
  return useSyncExternalStore(
    subscribe,
    () => deferredPrompt,
    () => null
  );
}

/**
 * Whether the app was just installed from this browser tab (the native
 * `appinstalled` event). Browsers can't open the new app themselves, so the
 * tab uses this to send the parent to their home screen.
 */
export function useJustInstalled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => justInstalled,
    () => false
  );
}

/** Shows the browser's own install dialog. Each captured prompt works once. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;

  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome === "accepted";
}
