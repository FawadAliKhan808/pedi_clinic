"use client";

import { Check, Clock, Copy, Plus, Sun, Sunset, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { BackToMore } from "@/components/admin/back-to-more";
import { BookingList } from "@/components/appointments/booking-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import type { ClinicSessionSchedule, SessionPreset, UUID } from "@/lib/api";
import { getBrowserApi } from "@/lib/api/browser";
import {
  addDays,
  cn,
  errorMessage,
  formatClock,
  formatDayShort,
  formatTimeRange,
  parseClockInput,
  weekStart,
} from "@/lib/format";
import { useLiveRefresh } from "@/lib/realtime/use-live-refresh";

const DAYS_SHOWN = 14;

const sameTimes = (
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string }
) => a.startTime.slice(0, 5) === b.startTime.slice(0, 5) && a.endTime.slice(0, 5) === b.endTime.slice(0, 5);

/**
 * One row on the selected day: a preset (Morning, Evening) whether or not it's
 * open, or a custom session that is. A session shows up exactly once.
 */
interface Slot {
  key: string;
  label: string | null;
  startTime: string;
  endTime: string;
  presetIndex: number | null;
  session: ClinicSessionSchedule | null;
}

export default function AvailabilityPage() {
  const toast = useToast();
  const [clinicId, setClinicId] = useState<UUID | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [presets, setPresets] = useState<SessionPreset[]>([]);
  // Every session in the 14 days shown, so the day strip can show which days are open.
  const [schedule, setSchedule] = useState<ClinicSessionSchedule[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

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
    if (!clinicId || !today) return Promise.resolve();
    return getBrowserApi()
      .appointments.listClinicSchedule(clinicId, today, addDays(today, DAYS_SHOWN - 1))
      .then(setSchedule)
      .catch((caught) => {
        const message = errorMessage(caught);
        setLoadError(message);
        toast(message, "error");
      });
  }, [clinicId, today, toast]);

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
      `${label} opened for ${formatDayShort(date)}`
    );
  }

  const days = today
    ? Array.from({ length: DAYS_SHOWN }, (_, index) => addDays(today, index))
    : [];
  const sessionsOn = (day: string) => (schedule ?? []).filter((session) => session.date === day);
  const daySessions = date ? sessionsOn(date) : [];
  const bookedOnDay = daySessions.reduce((sum, session) => sum + session.bookedCount, 0);

  const slots: Slot[] = [
    ...presets.map((preset, index) => ({
      key: `preset-${preset.label}`,
      label: preset.label,
      startTime: preset.startTime,
      endTime: preset.endTime,
      presetIndex: index,
      session: daySessions.find((session) => sameTimes(session, preset)) ?? null,
    })),
    ...daySessions
      .filter((session) => !presets.some((preset) => sameTimes(session, preset)))
      .map((session) => ({
        key: session.sessionId,
        label: null,
        startTime: session.startTime,
        endTime: session.endTime,
        presetIndex: null,
        session,
      })),
  ].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-1">
          <BackToMore />
          <h1 className="text-2xl font-bold text-foreground">Availability</h1>
        </div>
        <p className="text-sm text-foreground-muted">
          Pick a day, then open the sessions parents can book. Walk-ins still come any time.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto px-5 pb-1 pt-2" role="group" aria-label="Day">
        {days.map((day) => {
          const open = sessionsOn(day);
          const selected = date === day;
          const weekday = new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                setDate(day);
                setCustomOpen(false);
              }}
              aria-pressed={selected}
              aria-label={`${formatDayShort(day)}: ${open.length === 0 ? "no sessions" : `${open.length} open`}`}
              className={cn(
                "flex min-h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 transition-colors",
                selected
                  ? "border-primary-600 bg-primary-600 text-foreground-on-primary"
                  : "border-border bg-surface-raised text-foreground hover:border-primary-300"
              )}
            >
              <span className={cn("text-xs font-semibold uppercase", !selected && "text-foreground-muted")}>
                {day === today ? "Today" : weekday}
              </span>
              <span className="text-lg font-bold leading-none tabular-nums">
                {Number(day.slice(8, 10))}
              </span>
              <span className="flex h-1.5 gap-1" aria-hidden>
                {open.map((session) => (
                  <span
                    key={session.sessionId}
                    className={cn(
                      "size-1.5 rounded-full",
                      session.bookedCount > 0
                        ? selected ? "bg-accent-200" : "bg-accent-500"
                        : selected ? "bg-neutral-0" : "bg-primary-600"
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="flex items-center gap-4 px-5 pb-2 text-xs text-foreground-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary-600" /> Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent-500" /> Has bookings
        </span>
      </p>

      {date && clinicId && (
        <div className="flex flex-col gap-3 px-5 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-lg font-bold text-foreground">
              {date === today ? `Today, ${formatDayShort(date)}` : formatDayShort(date)}
            </h2>
            {schedule && (
              <p className="text-sm text-foreground-muted">
                {daySessions.length === 0
                  ? "Closed for bookings"
                  : `${daySessions.length} open · ${bookedOnDay} ${bookedOnDay === 1 ? "child" : "children"} booked`}
              </p>
            )}
          </div>

          {schedule === null && loadError ? (
            <ErrorState message={loadError} onRetry={() => window.location.reload()} />
          ) : schedule === null ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <div className="grid gap-3 @2xl:grid-cols-2">
              {slots.map((slot) => (
                <SlotCard
                  key={slot.key}
                  slot={slot}
                  icon={
                    slot.presetIndex === null ? (
                      <Clock aria-hidden className="size-5" />
                    ) : slot.presetIndex === 0 ? (
                      <Sun aria-hidden className="size-5" />
                    ) : (
                      <Sunset aria-hidden className="size-5" />
                    )
                  }
                  onOpen={() =>
                    addSession(slot.startTime, slot.endTime, slot.label ?? `${formatTimeRange(slot.startTime, slot.endTime)} session`)
                  }
                  onCancel={(session) =>
                    change(
                      () => getBrowserApi().appointments.cancelSession(session.sessionId),
                      (cancelled) =>
                        cancelled === 0
                          ? "Session cancelled"
                          : `Session cancelled — ${cancelled} ${cancelled === 1 ? "parent" : "parents"} told`
                    ).then(() => undefined)
                  }
                />
              ))}
            </div>
          )}

          {customOpen ? (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-foreground">Custom time on {formatDayShort(date)}</p>
                <button
                  type="button"
                  aria-label="Close custom time"
                  onClick={() => setCustomOpen(false)}
                  className="flex size-10 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-sunken"
                >
                  <X className="size-5" />
                </button>
              </div>
              <CustomSessionForm
                onAdd={async (start, end) => {
                  const added = await addSession(start, end, `${formatTimeRange(start, end)} session`);
                  if (added) setCustomOpen(false);
                  return added;
                }}
              />
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border font-semibold text-foreground-muted hover:border-primary-300 hover:text-foreground"
            >
              <Plus className="size-4" />
              Add a custom time
            </button>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant="secondary"
              className="flex-1 px-3 text-sm"
              onClick={() => {
                const target = weekStart(date);
                void change(
                  () => getBrowserApi().appointments.copyWeek(clinicId, addDays(target, -7), target),
                  (created) =>
                    created === 0
                      ? "Nothing new to copy from last week"
                      : `${created} session${created === 1 ? "" : "s"} copied from last week`
                );
              }}
            >
              <Copy className="size-4" />
              Copy last week into this week
            </Button>
            {daySessions.length > 0 && (
              <ConfirmButton
                className="flex-1 px-3 text-sm"
                label="Close this day"
                confirmLabel={bookedOnDay > 0 ? "Tap again — booked parents will be told" : "Tap again to close"}
                onConfirm={() =>
                  change(
                    () => getBrowserApi().appointments.closeDay(clinicId, date),
                    (cancelled) =>
                      cancelled === 0
                        ? `${formatDayShort(date)} closed`
                        : `${formatDayShort(date)} closed — ${cancelled} ${cancelled === 1 ? "parent" : "parents"} told`
                  ).then(() => undefined)
                }
              />
            )}
          </div>
        </div>
      )}

      {!date && !loadError && (
        <div className="px-5 py-3">
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {!date && loadError && (
        <div className="px-5 py-3">
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        </div>
      )}
    </div>
  );
}

/**
 * A session on the selected day. Not open: a dashed card with one "Open" tap.
 * Open: a solid card with who booked and a two-tap cancel.
 */
function SlotCard({
  slot,
  icon,
  onOpen,
  onCancel,
}: {
  slot: Slot;
  icon: ReactNode;
  onOpen: () => Promise<boolean>;
  onCancel: (session: ClinicSessionSchedule) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const times = formatTimeRange(slot.startTime, slot.endTime);
  const { session } = slot;

  if (!session) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-foreground-muted">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{slot.label ?? "Custom"}</p>
          <p className="text-sm text-foreground-muted">{times} · Not open</p>
        </div>
        <Button
          className="shrink-0 px-4 text-sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await onOpen();
            setBusy(false);
          }}
        >
          Open
        </Button>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-3 border-primary-300 dark:border-primary-800">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-foreground-on-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{slot.label ?? "Custom"}</p>
          <p className="text-sm text-foreground-muted">{times}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
          <Check className="size-3.5" />
          Open
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground">
        {session.bookedCount === 0
          ? "No bookings yet"
          : `${session.bookedCount} ${session.bookedCount === 1 ? "child" : "children"} booked`}
      </p>
      {session.bookedCount > 0 && <BookingList appointments={session.appointments} />}
      <ConfirmButton
        variant="ghost"
        label="Cancel session"
        confirmLabel={
          session.bookedCount > 0
            ? `Tap again — ${session.bookedCount} ${session.bookedCount === 1 ? "parent" : "parents"} will be told`
            : "Tap again to cancel"
        }
        onConfirm={() => onCancel(session)}
      />
    </Card>
  );
}

type Period = "am" | "pm";

/**
 * Any other session: type the time ("5", "5:30" — a number pad on phones) and
 * tap AM/PM beside it. Typing "pm" or a 24-hour time also works and moves the
 * toggle to match. Each field shows how it was read, so a typo is caught
 * before anything is saved.
 */
function CustomSessionForm({
  onAdd,
}: {
  onAdd: (startTime: string, endTime: string) => Promise<boolean>;
}) {
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [startPeriod, setStartPeriod] = useState<Period>("pm");
  const [endPeriod, setEndPeriod] = useState<Period>("pm");
  const [busy, setBusy] = useState(false);

  const start = parseClockInput(startText, startPeriod);
  const end = parseClockInput(endText, endPeriod);
  const endBeforeStart = start !== null && end !== null && end <= start;
  const ready = start !== null && end !== null && !endBeforeStart;

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
      {/* grid-cols-1, not an automatic column: a text input's built-in width
          would otherwise stretch the column past a 320 px phone. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TimeWithPeriod
          id="custom-start"
          label="From"
          text={startText}
          period={startPeriod}
          parsed={start}
          onTextChange={setStartText}
          onPeriodChange={setStartPeriod}
        />
        <TimeWithPeriod
          id="custom-end"
          label="To"
          text={endText}
          period={endPeriod}
          parsed={end}
          onTextChange={setEndText}
          onPeriodChange={setEndPeriod}
          error={endBeforeStart ? "Must be after the start" : undefined}
        />
      </div>
      <Button type="submit" loading={busy} disabled={!ready}>
        <Plus className="size-4" />
        {ready ? `Open ${formatTimeRange(start, end)}` : "Open session"}
      </Button>
    </form>
  );
}

/** A time box with a one-tap AM/PM toggle glued to its right edge. */
function TimeWithPeriod({
  id,
  label,
  text,
  period,
  parsed,
  onTextChange,
  onPeriodChange,
  error,
}: {
  id: string;
  label: string;
  text: string;
  period: Period;
  parsed: string | null;
  onTextChange: (text: string) => void;
  onPeriodChange: (period: Period) => void;
  error?: string;
}) {
  const unreadable = text.trim() !== "" && parsed === null;
  const message = error ?? (unreadable ? "Type a time like 5 or 5:30" : undefined);
  const hint = !text.trim()
    ? "e.g. 5 or 5:30"
    : parsed
      ? `Reads as ${formatClock(parsed)}`
      : undefined;

  function handleText(value: string) {
    onTextChange(value);
    // Typed am/pm moves the toggle, so the two never disagree.
    const typed = value.trim().toLowerCase().match(/(a|p)m?$/)?.[1];
    if (typed) onPeriodChange(typed === "a" ? "am" : "pm");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="flex">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="5:30"
          value={text}
          onChange={(event) => handleText(event.target.value)}
          aria-invalid={Boolean(message)}
          aria-describedby={`${id}-note`}
          className={cn(
            "min-h-12 min-w-0 flex-1 rounded-l-lg border border-r-0 bg-surface px-4 text-base tabular-nums text-foreground",
            "placeholder:text-neutral-400 focus:outline-2 focus:outline-offset-1 focus:outline-primary-500",
            message ? "border-danger" : "border-border"
          )}
        />
        <button
          type="button"
          onClick={() => onPeriodChange(period === "am" ? "pm" : "am")}
          aria-label={`${label} time is ${period.toUpperCase()}. Tap to switch to ${period === "am" ? "PM" : "AM"}`}
          className={cn(
            "min-h-12 w-16 shrink-0 rounded-r-lg border text-base font-bold tracking-wide transition-colors active:scale-95",
            period === "am"
              ? "border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
              : "border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-200"
          )}
        >
          {period.toUpperCase()}
        </button>
      </div>
      <p
        id={`${id}-note`}
        className={cn("text-sm", message ? "text-danger" : "text-foreground-muted")}
      >
        {message ?? hint}
      </p>
    </div>
  );
}
