"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { VisitStatus } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { useDefaultClinicId, useLiveRefresh } from "./use-live-refresh";

const ACTIVE = new Set<VisitStatus>(["waiting", "called", "in_consultation", "skipped"]);

/**
 * When one of this parent's children is seen and the doctor completes the
 * visit, open its summary — wherever in the app the parent is. Only reacts to
 * a change it watched happen (active → completed while the app was open), so
 * reopening the app later doesn't jump to an old summary.
 */
export function useCompletedVisitRedirect(): void {
  const router = useRouter();
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const activeRef = useRef<Set<string> | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    getBrowserApi()
      .auth.getCurrentUserId()
      .then((userId) => setSignedIn(Boolean(userId)))
      .catch(() => undefined);
  }, []);

  const clinicId = useDefaultClinicId(signedIn);

  useLiveRefresh("queue", clinicId, () =>
    getBrowserApi()
      .queue.getParentQueueView()
      .then((entries) => {
        const previouslyActive = activeRef.current;
        activeRef.current = new Set(
          entries.filter((entry) => ACTIVE.has(entry.status)).map((entry) => entry.visitId)
        );
        if (!previouslyActive) return; // first look: just remember what's active

        const finished = entries.find(
          (entry) => previouslyActive.has(entry.visitId) && entry.status === "completed"
        );
        if (finished && pathnameRef.current !== `/visits/${finished.visitId}`) {
          router.push(`/visits/${finished.visitId}`);
        }
      })
      .catch(() => undefined)
  );
}
