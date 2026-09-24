"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserApi } from "@/lib/api/browser";

/**
 * Keeps the (server-rendered) owner dashboard live: when an install,
 * notification opt-in, registration, rating or token changes anywhere, it
 * re-renders the page with fresh numbers — no reload. Bursts of changes are
 * folded into one refresh.
 */
export function OwnerLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = getBrowserApi().realtime.subscribeToOwnerOverview(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [router]);

  return null;
}
