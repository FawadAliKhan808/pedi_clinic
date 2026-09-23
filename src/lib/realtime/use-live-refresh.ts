"use client";

import { useEffect, useRef, useState } from "react";
import type { UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";

type LiveChannel = "queue" | "appointments" | "pharmacy";

/**
 * Re-runs `refresh` whenever the clinic's `channel` reports a change (and on
 * reconnect or when the app comes back into view). Subscribes once per
 * clinic and channel; `refresh` can change freely between renders.
 */
export function useLiveRefresh(
  channel: LiveChannel,
  clinicId: UUID | null | undefined,
  refresh: () => unknown
): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!clinicId) return;
    const realtime = getBrowserApi().realtime;
    const onChange = () => void refreshRef.current();
    switch (channel) {
      case "queue":
        return realtime.subscribeToQueue(clinicId, onChange);
      case "appointments":
        return realtime.subscribeToAppointments(clinicId, onChange);
      case "pharmacy":
        return realtime.subscribeToPharmacyFeed(clinicId, onChange);
    }
  }, [channel, clinicId]);
}

/**
 * The clinic a parent's screens belong to (single-clinic MVP: the one the
 * booking window reports). Null until known, or if it can't be loaded — the
 * screen still works, just without live updates.
 */
export function useDefaultClinicId(enabled = true): UUID | null {
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  useEffect(() => {
    // Signed-out visitors can't read it; ask again once they're signed in.
    if (!enabled) return;
    getBrowserApi()
      .appointments.getBookingWindow()
      .then((window) => setClinicId(window.clinicId))
      .catch(() => undefined);
  }, [enabled]);
  return enabled ? clinicId : null;
}
