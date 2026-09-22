"use client";

import { useEffect } from "react";
// Side effect: starts listening for Chrome's one-shot install prompt as early
// as possible, since this component is mounted from the root layout.
import "@/lib/pwa/install-prompt";

/**
 * Registers the app-shell service worker. Skipped in development so Next's
 * fast refresh isn't fighting a cache-first worker for static assets.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  }, []);

  return null;
}
