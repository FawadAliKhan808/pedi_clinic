"use client";

import { CalendarRange, Copy, Plus, Sun, Sunset } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BookingList } from "@/components/appointments/booking-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import type { ClinicSessionSchedule, SessionPreset, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  addDays,
  cn,
  errorMessage,
  formatClock,
  formatDayShort,
  formatSession,
  formatTimeRange,
  parseClockInput,
  weekStart,
} from "@/lib/format";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

const DAYS_SHOWN = 14;

export default function AvailabilityPage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [presets, setPresets] = useState<SessionPreset[]>([]);
  const [sessions, setSessions] = useState<ClinicSessionSchedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const api = getBrowserApi();
    Promise.all([api.auth.getStaffRole(), api.appointments.getBookingWindow()])
      .then(([staff, window]) => {
        setClinicId(staff?.clinicId ?? null);
        setToday(window.today);
        setDate(window.today);
        setPresets(window.sessionPresets);
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

  // Parents booking or cancelling show up here as it happens.
  useLiveRefresh("appointments", clinicId, refresh);

  /** Runs a doctor change, then pushes any "your appointment changed" notices. */
  async function change<T>(
    action: () => Promise<T>,
    success: string | ((result: T) => string)
  ): Promise<boolean> {
    try {
      const result = await action();
      toast(typeof success === "string" ? success : success(result), "success");
      void getBrowserApi().notifications.dispatchPending();
      await refresh();
      return true;
    } catch (caught) {
      toast(errorMessage(caught), "error");
      return false;
    }
  }

  function addSession(startTime: string, endTime: string, label: string) {
    if (!clinicId || !date) return Promise.resolve(false);
    return change(
      () => getBrowserApi().appointments.createSession({ clinicId, date, startTime, endTime }),
      `${label} added for ${formatDayShort(date)}`
    );
  }

  const days = today
    ? Array.from({ length: DAYS_SHOWN }, (_, index) => addDays(today, index))
    : [];

  // A preset that's already open that day shows as added rather than as a button to press again.
  const isOpen = (preset: SessionPreset) =>
    (sessions ?? []).some(
      (session) =>
        session.startTime.slice(0, 5) === preset.startTime.slice(0, 5) &&
        session.endTime.slice(0, 5) === preset.endTime.slice(0, 5)
    );

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <h1 className="text-2xl font-bold text-foreground">Availability</h1>
        <p className="text-sm text-foreground-muted">
          Open the sessions parents can book. Any number of children can book a session;
          walk-ins still come any time.
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
          <Card className="col-span-full flex flex-col gap-4">
            <div>
              <p className="font-semibold text-foreground">
                Open a session on {date === today ? "today" : formatDayShort(date)}
              </p>
              <p className="text-sm text-foreground-muted">One tap adds it straight away.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {presets.map((preset, index) => {
                const Icon = index === 0 ? Sun : Sunset;
                const added = isOpen(preset);
                return (
                  <PresetButton
                    key={preset.label}
                    icon={<Icon aria-hidden className="size-5" />}
                    label={`${preset.label} (${formatTimeRange(preset.startTime, preset.endTime)})`}
                    added={added}
                    onAdd={() => addSession(preset.startTime, preset.endTime, preset.label)}
                  />
                );
              })}
            </div>

            <CustomSessionForm
              onAdd={(start, end) =>
                addSession(start, end, `${formatTimeRange(start, end)} session`)
              }
            />

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="secondary"
                className="flex-1 px-3 text-sm"
                onClick={() => {
                  const target = weekStart(date);
                  void change(
                    () =>
                      getBrowserApi().appointments.copyWeek(clinicId, addDays(target, -7), target),
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
                  ).then(() => undefined)
                }
              />
            </div>
          </Card>

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
              description={`Nothing open on ${formatDayShort(date)} yet — use a button above.`}
            />
          ) : (
            sessions.map((session) => (
              <Card key={session.sessionId} className="flex flex-col gap-2">
                <div>
                  <p className="font-semibold text-foreground">{formatSession(session, presets)}</p>
                  <p className="text-sm text-foreground-muted">
                    {session.bookedCount === 0
                      ? "No bookings yet"
                      : `${session.bookedCount} ${session.bookedCount === 1 ? "child" : "children"} booked`}
                  </p>
                </div>
                <BookingList appointments={session.appointments} />
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
                    ).then(() => undefined)
                  }
                />
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PresetButton({
  icon,
  label,
  added,
  onAdd,
}: {
  icon: ReactNode;
  label: string;
  added: boolean;
  onAdd: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={added ? "secondary" : "primary"}
      loading={busy}
      disabled={added}
      onClick={async () => {
        setBusy(true);
        await onAdd();
        setBusy(false);
      }}
      className="justify-start"
    >
      {icon}
      <span className="truncate">{added ? `${label} — open` : label}</span>
    </Button>
  );
}

/**
 * Any other session, typed plainly: "5pm", "5:30 pm" or "17:30". Each field
 * shows how it was read, so a typo is caught before anything is saved.
 */
function CustomSessionForm({
  onAdd,
}: {
  onAdd: (startTime: string, endTime: string) => Promise<boolean>;
}) {
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [busy, setBusy] = useState(false);

  const start = parseClockInput(startText);
  const end = parseClockInput(endText);
  const endBeforeStart = start !== null && end !== null && end <= start;
  const ready = start !== null && end !== null && !endBeforeStart;

  function hint(text: string, parsed: string | null): string {
    if (!text.trim()) return "e.g. 5pm, 5:30 pm or 17:30";
    return parsed ? `Reads as ${formatClock(parsed)}` : "Add am or pm, e.g. 5pm";
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready || !start || !end) return;
        setBusy(true);
        const added = await onAdd(start, end);
        setBusy(false);
        if (added) {
          setStartText("");
          setEndText("");
        }
      }}
    >
      <p className="text-sm font-semibold text-foreground">Or a custom time</p>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="From"
          inputMode="text"
          autoComplete="off"
          value={startText}
          onChange={(event) => setStartText(event.target.value)}
          hint={hint(startText, start)}
          error={startText.trim() && start === null ? hint(startText, start) : undefined}
        />
        <TextField
          label="To"
          inputMode="text"
          autoComplete="off"
          value={endText}
          onChange={(event) => setEndText(event.target.value)}
          hint={hint(endText, end)}
          error={
            endText.trim() && end === null
              ? hint(endText, end)
              : endBeforeStart
                ? "Must be after the start"
                : undefined
          }
        />
      </div>
      <Button type="submit" variant="secondary" loading={busy} disabled={!ready}>
        <Plus className="size-4" />
        Add custom session
      </Button>
    </form>
  );
}
