"use client";

import { useSyncExternalStore } from "react";

/** Chrome/Android's deferred install prompt. Not in the TS DOM lib. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
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
