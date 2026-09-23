"use client";

import { ChevronRight, Pill } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DispenseSheet } from "@/components/admin/dispense-sheet";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { PharmacyFeedEntry, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage, formatAge, visitReasonLabels } from "@/lib/format";

export default function PharmacyFeedPage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [entries, setEntries] = useState<PharmacyFeedEntry[] | null>(null);
  const [dispensing, setDispensing] = useState<PharmacyFeedEntry | null>(null);

  useEffect(() => {
    getBrowserApi()
      .auth.getStaffRole()
      .then((staff) => setClinicId(staff?.clinicId ?? null))
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId) return Promise.resolve();
    return getBrowserApi()
      .pharmacy.getFeed(clinicId)
      .then(setEntries)
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [clinicId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!clinicId) return;
    // Visits land here the moment the doctor completes them.
    return getBrowserApi().realtime.subscribeToPharmacyFeed(clinicId, () => {
      void refresh();
    });
  }, [clinicId, refresh]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Pharmacy</h1>
        <SignOutButton redirectTo="/admin/login" variant="icon" className="md:hidden" />
      </header>

      <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {entries === null ? (
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
