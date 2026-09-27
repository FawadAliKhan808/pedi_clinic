"use client";

import { useEffect, useState } from "react";
import { EndOfDayView } from "@/components/analytics/end-of-day-view";
import { TrendsView } from "@/components/analytics/trends-view";
import { Segmented } from "@/components/charts/chart-card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/format";
import { BackToMore } from "@/components/admin/back-to-more";

type View = "day" | "trends";

export default function AnalyticsPage() {
  const toast = useToast();
  const [context, setContext] = useState<{ clinicId: UUID; today: string } | null>(null);
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    // The booking window carries the clinic's own "today" (Asia/Kolkata).
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        if (staff?.clinicId) setContext({ clinicId: staff.clinicId, today: window.today });
      })
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div>
          <div className="flex items-center gap-1">
            <BackToMore />
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          </div>
          <p className="text-sm text-foreground-muted">Only you can see these numbers.</p>
        </div>
        <Segmented<View>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "End of day" },
            { value: "trends", label: "Trends" },
          ]}
        />
      </header>

      <div className="flex w-full max-w-6xl flex-col gap-4 px-5 py-3">
        {!context && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : !context ? (
          <Skeleton className="h-64 w-full" />
        ) : view === "day" ? (
          <EndOfDayView
            clinicId={context.clinicId}
            today={context.today}
            date={day ?? context.today}
            onDateChange={setDay}
          />
        ) : (
          <TrendsView clinicId={context.clinicId} today={context.today} />
        )}
      </div>
    </div>
  );
}
