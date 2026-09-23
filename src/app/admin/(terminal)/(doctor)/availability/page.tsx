"use client";

import { CalendarRange, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  TimeSelect,
  minutesOfDay,
  toClockTime,
  type TimeParts,
} from "@/components/appointments/time-select";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { ClinicSessionSchedule, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  addDays,
  cn,
  errorMessage,
  formatClock,
  formatDayShort,
  formatTimeRange,
  weekStart,
} from "@/lib/format";

const DAYS_SHOWN = 14;

export default function AvailabilityPage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [sessions, setSessions] = useState<ClinicSessionSchedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        setClinicId(staff?.clinicId ?? null);
        setToday(window.today);
        setDate(window.today);
        setSlotMinutes(window.slotMinutes);
      })
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId || !date) return Promise.resolve();
    return getBrowserApi()
      .appointments.listClinicSchedule(clinicId, date, date)
      .then(setSessions)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [clinicId, date, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs a doctor change, then pushes any "your appointment changed" notices. */
  async function change<T>(
    action: () => Promise<T>,
    success: string | ((result: T) => string)
  ) {
    try {
      const result = await action();
      toast(typeof success === "string" ? success : success(result), "success");
      void getBrowserApi().notifications.dispatchPending();
      await refresh();
    } catch (caught) {
      toast(errorMessage(caught), "error");
    }
  }

  const days = today
    ? Array.from({ length: DAYS_SHOWN }, (_, index) => addDays(today, index))
    : [];

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Availability</h1>
        <p className="text-sm text-foreground-muted">
          Slots you open here are for appointments. Everything else stays open for
          walk-ins.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 py-2">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => setDate(day)}
            aria-pressed={date === day}
            className={cn(
              "min-h-12 shrink-0 rounded-lg border-2 px-3 text-sm font-semibold",
              date === day
                ? "border-primary-600 bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
                : "border-border text-foreground"
            )}
          >
            {day === today ? "Today" : formatDayShort(day)}
          </button>
        ))}
      </div>

      {date && clinicId && (
        <div className="grid gap-3 px-5 py-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
          <div className="col-span-full flex gap-2 md:max-w-lg">
            <Button
              variant="secondary"
              className="flex-1 px-3 text-sm"
              onClick={() => {
                const target = weekStart(date);
                void change(
                  () =>
                    getBrowserApi().appointments.copyWeek(
                      clinicId,
                      addDays(target, -7),
                      target
                    ),
                  (created) =>
                    created === 0
                      ? "Nothing new to copy from last week"
                      : `${created} session${created === 1 ? "" : "s"} copied from last week`
                );
              }}
            >
              <Copy className="size-4" />
              Copy last week
            </Button>
            <ConfirmButton
              className="flex-1 px-3 text-sm"
              label="Mark day closed"
              confirmLabel="Tap again to close"
              onConfirm={() =>
                change(
                  () => getBrowserApi().appointments.closeDay(clinicId, date),
                  `${formatDayShort(date)} closed — parents notified`
                )
              }
            />
          </div>

          {sessions === null && loadError ? (
          <div className="col-span-full">
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          </div>
        ) : sessions === null ? (
            <Skeleton className="h-24 w-full" />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<CalendarRange className="size-8" />}
              title="No sessions"
              description={`Add a session below to open appointments on ${formatDayShort(date)}.`}
            />
          ) : (
            sessions.map((session) => (
              <Card key={session.sessionId} className="flex flex-col gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {formatTimeRange(session.startTime, session.endTime)}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {session.bookedCount} of {session.maxBookings} slots booked ·{" "}
                    {slotMinutes}-minute appointments
                  </p>
                </div>
                <ConfirmButton
                  variant="ghost"
                  label="Cancel session"
                  confirmLabel={
                    session.bookedCount > 0
                      ? `Tap again — ${session.bookedCount} parent(s) will be told`
                      : "Tap again to cancel"
                  }
                  onConfirm={() =>
                    change(
                      () => getBrowserApi().appointments.cancelSession(session.sessionId),
                      "Session cancelled"
                    )
                  }
                />
              </Card>
            ))
          )}

          <AddSessionForm
            key={date}
            slotMinutes={slotMinutes}
            onAdd={(startTime, endTime) =>
              change(
                () =>
                  getBrowserApi().appointments.createSession({
                    clinicId,
                    date,
                    startTime,
                    endTime,
                  }),
                "Session added"
              )
            }
          />
        </div>
      )}
    </div>
  );
}

const DEFAULT_START: TimeParts = { hour: 10, minute: 0, period: "am" };
const DEFAULT_END: TimeParts = { hour: 12, minute: 0, period: "pm" };

/**
 * Start and end in whole slots (hour, :00/:30, AM/PM). The number of
 * appointments follows from the length — 10:00 AM to 12:00 PM is four
 * 30-minute appointments — so there's nothing else to type.
 */
function AddSessionForm({
  slotMinutes,
  onAdd,
}: {
  slotMinutes: number;
  onAdd: (startTime: string, endTime: string) => Promise<void>;
}) {
  const [start, setStart] = useState<TimeParts>(DEFAULT_START);
  const [end, setEnd] = useState<TimeParts>(DEFAULT_END);
  const [busy, setBusy] = useState(false);

  const duration = minutesOfDay(end) - minutesOfDay(start);
  const slots = duration > 0 ? Math.floor(duration / slotMinutes) : 0;
  const times = Array.from({ length: slots }, (_, index) => {
    const total = minutesOfDay(start) + index * slotMinutes;
    return formatClock(`${Math.floor(total / 60)}:${total % 60}`);
  });

  return (
    <Card className="flex flex-col gap-4">
      <p className="font-semibold text-foreground">Add a session</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TimeSelect label="Starts" value={start} slotMinutes={slotMinutes} onChange={setStart} />
        <TimeSelect label="Ends" value={end} slotMinutes={slotMinutes} onChange={setEnd} />
      </div>

      {slots > 0 ? (
        <div className="rounded-lg bg-surface-sunken px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">
            {slots} appointment{slots === 1 ? "" : "s"} of {slotMinutes} minutes
          </p>
          <p className="text-foreground-muted">
            {times.length <= 4
              ? times.join(", ")
              : `${times.slice(0, 3).join(", ")} … ${times[times.length - 1]}`}
          </p>
        </div>
      ) : (
        <p role="alert" className="text-sm text-danger">
          The end time must be after the start time.
        </p>
      )}

      <Button
        loading={busy}
        disabled={slots === 0}
        onClick={async () => {
          setBusy(true);
          await onAdd(toClockTime(start), toClockTime(end));
          setBusy(false);
        }}
      >
        Add session
      </Button>
    </Card>
  );
}
