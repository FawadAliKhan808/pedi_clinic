"use client";

import { ChevronRight, Pill } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DispenseSheet } from "@/components/admin/dispense-sheet";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { PharmacyFeedEntry, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, formatWeight, visitReasonLabels } from "@/lib/format";
import { lastShown, useRememberShown } from "@/lib/last-shown";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

export default function PharmacyFeedPage() {
  const toast = useToast();
  // Coming back to the feed shows it at once while a fresh copy loads.
  const [clinicId, setClinicId] = useState<UUID | null>(() => lastShown<UUID>("staff-clinic") ?? null);
  const [entries, setEntries] = useState<PharmacyFeedEntry[] | null>(
    () => lastShown<PharmacyFeedEntry[]>("pharmacy-feed") ?? null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dispensing, setDispensing] = useState<PharmacyFeedEntry | null>(null);
  useRememberShown("staff-clinic", clinicId);
  useRememberShown("pharmacy-feed", entries);

  useEffect(() => {
    getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    return getBrowserApi()
      .pharmacy.getFeed(clinicId)
      .then(setEntries)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [clinicId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Visits land here the moment the doctor completes them.
  useLiveRefresh("pharmacy", clinicId, refresh);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pharmacy</h1>
          {entries && entries.length > 0 && (
            <p className="text-sm text-foreground-muted">
              {entries.length} {entries.length === 1 ? "visit" : "visits"} waiting, oldest first
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {entries === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : entries === null ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<Pill className="size-8" />}
            title="Nothing waiting"
            description="Visits appear here the moment the doctor completes them."
          />
        ) : (
          entries.map((entry) => (
            <button
              key={entry.orderId}
              type="button"
              onClick={() => setDispensing(entry)}
              className="text-left"
            >
              <Card className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-lg font-bold tabular-nums text-foreground">
                  {entry.seq}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate font-semibold text-foreground">
                    {entry.childName}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {formatAge(entry.childDob)} · {visitReasonLabels[entry.reason]}
                    {entry.weightKg !== null && (
                      <>
                        {" · "}
                        <span className="font-semibold text-foreground">
                          {formatWeight(entry.weightKg)}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {entry.storageKeys.length > 0
                      ? `${entry.storageKeys.length} prescription photo${
                          entry.storageKeys.length === 1 ? "" : "s"
                        }`
                      : "No prescription photo"}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-foreground-muted" />
              </Card>
            </button>
          ))
        )}
      </div>

      {dispensing && clinicId && (
        <DispenseSheet
          clinicId={clinicId}
          entry={dispensing}
          onClose={() => setDispensing(null)}
          onDispensed={() => void refresh()}
        />
      )}
    </div>
  );
}
