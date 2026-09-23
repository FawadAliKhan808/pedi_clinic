"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * A slim notice while the device is offline, so a queue that stops moving is
 * explained rather than silently stale. Live screens refetch on reconnect.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );

  if (online) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(0.5rem+env(safe-area-inset-top))]"
    >
      <p className="flex items-center gap-2 whitespace-nowrap rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] font-semibold text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
        <WifiOff aria-hidden className="size-4" />
        Offline · showing the last update
      </p>
    </div>
  );
}
