"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Screens seen in this app session. Module state lives as long as the page
 * does, so it survives client-side navigation and starts again at 0 on a full
 * load — which is exactly "did the parent get here from inside the app?".
 * (The browser's history length can't tell: it also counts whatever was open
 * before, e.g. WhatsApp's link.)
 */
let screensSeen = 0;

/** Counts each screen shown by the parent shell. */
export function useCountScreen(): void {
  const pathname = usePathname();
  useEffect(() => {
    screensSeen += 1;
  }, [pathname]);
}

/**
 * Back that stays inside the app: returns to the previous app screen when
 * there is one, otherwise goes to `fallback` (e.g. a visit opened from a
 * notification goes to Last visits).
 */
export function useAppBack(fallback: string): () => void {
  const router = useRouter();
  return () => {
    if (screensSeen > 1) router.back();
    else router.replace(fallback);
  };
}
