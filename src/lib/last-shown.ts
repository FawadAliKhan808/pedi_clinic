import { useEffect } from "react";

/**
 * What each screen last showed in this browser tab, so going back to a tab
 * shows it at once (no skeleton) while a fresh copy loads behind it.
 *
 * Browser-only in practice: it's written from effects, which never run on the
 * server, so a server render always starts empty. Sign-out reloads the page,
 * which empties it; sign-in calls `forgetShown` so one account never sees
 * another's last screen.
 */
const shown = new Map<string, unknown>();

/** What this tab last showed under `key`, or undefined on a first visit. */
export function lastShown<T>(key: string): T | undefined {
  return shown.get(key) as T | undefined;
}

/** Remembers `value` under `key` whenever it changes; null and undefined are skipped. */
export function useRememberShown(key: string, value: unknown): void {
  useEffect(() => {
    if (value !== null && value !== undefined) shown.set(key, value);
  }, [key, value]);
}

/** Forgets every screen. Call on sign-in. */
export function forgetShown(): void {
  shown.clear();
}
