"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BookingList } from "@/components/appointments/booking-list";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { ClinicSessionSchedule, SessionPreset, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import { addDays, errorMessage, formatDayShort, formatSession } from "@/lib/format";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

const DAYS_SHOWN = 14;

interface Range {
  clinicId: UUID;
  today: string;
  to: string;
  presets: SessionPreset[];
}

/** "3 booked · 2 vaccination, 1 general checkup" — the session at a glance. */
function sessionSummary(session: ClinicSessionSchedule): string {
  const live = session.appointments.filter((item) => item.status !== "missed");
  if (live.length === 0) return "No bookings yet";
  const vaccination = live.filter((item) => item.visitReason === "vaccination").length;
  const checkup = live.length - vaccination;
  const parts = [
    vaccination > 0 && `${vaccination} vaccination`,
    checkup > 0 && `${checkup} general checkup`,
  ].filter(Boolean);
  return `${live.length} booked · ${parts.join(", ")}`;
}

/**
 * Who is coming, and why. Parents can't cancel or move a booking; the doctor
 * can cancel a session or a whole day, and every parent affected is told.
 */
export default function DoctorAppointmentsPage() {
  const toast = useToast();
  const [range, setRange] = useState<Range | null>(null);
  const [schedule, setSchedule] = useState<ClinicSessionSchedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        if (!staff?.clinicId) return;
        setRange({
          clinicId: staff.clinicId,
          today: window.today,
          to: addDays(window.today, DAYS_SHOWN - 1),
          presets: window.sessionPresets,
        });
      })
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  const refresh = useCallback(() => {
    if (!range) return Promise.resolve();
    return getBrowserApi()
      .appointments.listClinicSchedule(range.clinicId, range.today, range.to)
      .then(setSchedule)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [range, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // New bookings and arrivals from any device appear as they happen.
  useLiveRefresh("appointments", range?.clinicId, refresh);

  /** Cancels, says how many parents were told, and pushes their notices now. */
  async function cancel(action: () => Promise<number>, what: string) {
    try {
      const cancelled = await action();
      toast(
        cancelled === 0
          ? `${what} cancelled`
          : `${what} cancelled — ${cancelled} ${cancelled === 1 ? "parent" : "parents"} told`,
        "success"
      );
      void getBrowserApi().notifications.dispatchPending();
      await refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  }

  const byDate = new Map<string, ClinicSessionSchedule[]>();
  for (const session of schedule ?? []) {
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Appointments</h1>
        <p className="text-sm text-foreground-muted">
          Who is coming, and why — today and the next two weeks. Cancelling a session
          or day tells every parent booked in it.
        </p>
      </header>

      <div className="flex flex-col gap-6 px-5 py-3">
        {schedule === null && loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : schedule === null ? (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : byDate.size === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="No sessions scheduled"
            description="Open a session from the Availability tab."
          />
        ) : (
          [...byDate.entries()].map(([date, sessions]) => (
            <section key={date} className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
              <div className="col-span-full flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">
                  {date === range?.today ? "Today" : formatDayShort(date)}
                </h2>
                {range && (
                  <ConfirmButton
                    variant="ghost"
                    label="Cancel day"
                    confirmLabel={
                      sessions.some((item) => item.bookedCount > 0)
                        ? "Tap again — parents will be told"
                        : "Tap again to cancel day"
                    }
                    onConfirm={() =>
                      cancel(
                        () => getBrowserApi().appointments.closeDay(range.clinicId, date),
                        formatDayShort(date)
                      )
                    }
                  />
                )}
              </div>

              {sessions.map((session) => (
                <Card key={session.sessionId} className="flex flex-col gap-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatSession(session, range?.presets)}
                    </p>
                    <p className="text-sm text-foreground-muted">{sessionSummary(session)}</p>
                  </div>

                  <BookingList appointments={session.appointments} />

                  <ConfirmButton
                    variant="ghost"
                    label="Cancel session"
                    confirmLabel={
                      session.bookedCount > 0
                        ? `Tap again — ${session.bookedCount} ${session.bookedCount === 1 ? "parent" : "parents"} will be told`
                        : "Tap again to cancel"
                    }
                    onConfirm={() =>
                      cancel(
                        () => getBrowserApi().appointments.cancelSession(session.sessionId),
                        "Session"
                      )
                    }
                  />
                </Card>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
