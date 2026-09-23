"use client";

import { CalendarRange, Copy, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { ClinicSessionSchedule, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  addDays,
  cn,
  errorMessage,
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
  const [sessions, setSessions] = useState<ClinicSessionSchedule[] | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        setClinicId(staff?.clinicId ?? null);
        setToday(window.today);
        setDate(window.today);
      })
      .catch((caught) => toast(errorMessage(caught), "error"));
  }, [toast]);

  const refresh = useCallback(() => {
    if (!clinicId || !date) return Promise.resolve();
    return getBrowserApi()
      .appointments.listClinicSchedule(clinicId, date, date)
      .then(setSessions)
      .catch((caught) => toast(errorMessage(caught), "error"));
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

          {sessions === null ? (
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
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatTimeRange(session.startTime, session.endTime)}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {session.bookedCount} of {session.maxBookings} booked
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label="One fewer appointment slot"
                      disabled={session.maxBookings <= session.bookedCount}
                      onClick={() =>
                        void change(
                          () =>
                            getBrowserApi().appointments.updateSessionCapacity(
                              session.sessionId,
                              session.maxBookings - 1
                            ),
                          "Slots updated"
                        )
                      }
                      className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground disabled:opacity-40"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-8 text-center font-semibold tabular-nums text-foreground">
                      {session.maxBookings}
                    </span>
                    <button
                      aria-label="One more appointment slot"
                      onClick={() =>
                        void change(
                          () =>
                            getBrowserApi().appointments.updateSessionCapacity(
                              session.sessionId,
                              session.maxBookings + 1
                            ),
                          "Slots updated"
                        )
                      }
                      className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
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
            onAdd={(startTime, endTime, maxBookings) =>
              change(
                () =>
                  getBrowserApi().appointments.createSession({
                    clinicId,
                    date,
                    startTime,
                    endTime,
                    maxBookings,
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

function AddSessionForm({
  onAdd,
}: {
  onAdd: (startTime: string, endTime: string, maxBookings: number) => Promise<void>;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [max, setMax] = useState("");
  const [busy, setBusy] = useState(false);

  const maxBookings = Math.trunc(Number(max));
  const ready = start && end && max !== "" && maxBookings >= 0;

  return (
    <Card className="flex flex-col gap-4">
      <p className="font-semibold text-foreground">Add a session</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Starts"
          type="time"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
        <TextField
          label="Ends"
          type="time"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
      <TextField
        label="Appointment slots"
        inputMode="numeric"
        placeholder="e.g. 6"
        hint="How many of this session's patients can book ahead."
        value={max}
        onChange={(event) => setMax(event.target.value)}
      />
      <Button
        loading={busy}
        disabled={!ready}
        onClick={async () => {
          setBusy(true);
          await onAdd(start, end, maxBookings);
          setBusy(false);
          setStart("");
          setEnd("");
          setMax("");
        }}
      >
        Add session
      </Button>
    </Card>
  );
}
