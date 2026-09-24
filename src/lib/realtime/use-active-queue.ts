"use client";

import { useCallback, useEffect, useState } from "react";
import type { UUID, VisitStatus } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { useLiveRefresh } from "./use-live-refresh";

const ACTIVE: VisitStatus[] = ["waiting", "called", "in_consultation"];

/**
 * How many children are in the clinic's queue right now (waiting, called, or
 * with the doctor), kept live over the queue channel — for the nav's dot.
 */
export function useActiveQueueCount(): number {
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch(() => undefined);
  }, []);

  const refresh = useCallback(() => {
    if (!clinicId) return;
    return getBrowserApi()
      .queue.getDoctorQueue(clinicId)
      .then((entries) => setCount(entries.filter((entry) => ACTIVE.includes(entry.status)).length))
      .catch(() => undefined);
  }, [clinicId]);

  useLiveRefresh("queue", clinicId, refresh);

  return count;
}
