"use client";

import { useEffect } from "react";

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
