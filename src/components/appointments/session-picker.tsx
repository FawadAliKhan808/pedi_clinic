"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/feedback";
import type { AvailabilitySession, ClockTime } from "@/lib/api";
import { cn, formatClock, formatDayShort, formatTimeRange } from "@/lib/format";

/** The exact appointment someone picked: a session and one of its free times. */
export interface SlotSelection {
  session: AvailabilitySession;
  slotTime: ClockTime;
}

/**
 * After a live refresh: the same selection against the fresh sessions, or
 * null if that time was just taken (or its session cancelled).
 */
export function reconcileSelection(
  selection: SlotSelection | null,
  sessions: AvailabilitySession[]
): SlotSelection | null {
  if (!selection) return null;
  const fresh = sessions.find((session) => session.id === selection.session.id);
  return fresh?.freeSlots.includes(selection.slotTime)
    ? { session: fresh, slotTime: selection.slotTime }
    : null;
}

/**
 * Pick a date, then one of the free 30-minute times in any of that day's
 * sessions. Only free times are offered; the server still has the final say
 * (SLOT_TAKEN if someone took it in the meantime).
 */
export function SessionPicker({
  sessions,
  selection,
  onSelect,
}: {
  sessions: AvailabilitySession[];
  selection: SlotSelection | null;
  onSelect: (selection: SlotSelection) => void;
}) {
  const open = sessions.filter((session) => session.freeSlots.length > 0);
  const dates = [...new Set(open.map((session) => session.date))];

  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate =
    pickedDate && dates.includes(pickedDate) ? pickedDate : dates[0] ?? null;

  if (dates.length === 0) {
    return (
      <EmptyState
        title="No open times"
        description="There are no appointment times left in the booking window. Please check again later, or come in and take a token."
      />
    );
  }

  return (
    <div className="@container flex flex-col gap-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            onClick={() => setPickedDate(date)}
            aria-pressed={selectedDate === date}
            className={cn(
              "min-h-12 shrink-0 rounded-lg border-2 px-4 text-sm font-semibold",
              selectedDate === date
                ? "border-primary-600 bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
                : "border-border text-foreground"
            )}
          >
            {formatDayShort(date)}
          </button>
        ))}
      </div>

      {open
        .filter((session) => session.date === selectedDate)
        .map((session) => (
          <section key={session.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold text-foreground">
                {formatTimeRange(session.startTime, session.endTime)}
              </h3>
              <p className="text-sm text-foreground-muted">
                {session.freeSlots.length}{" "}
                {session.freeSlots.length === 1 ? "time" : "times"} free
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label={`Times between ${formatTimeRange(session.startTime, session.endTime)}`}
              className="grid grid-cols-3 gap-2 @md:grid-cols-4 @xl:grid-cols-6"
            >
              {session.freeSlots.map((slot) => {
                const selected =
                  selection?.session.id === session.id && selection.slotTime === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onSelect({ session, slotTime: slot })}
                    className={cn(
                      "min-h-12 rounded-lg border-2 px-2 text-sm font-semibold tabular-nums",
                      selected
                        ? "border-primary-600 bg-primary-600 text-foreground-on-primary"
                        : "border-border text-foreground hover:border-primary-400"
                    )}
                  >
                    {formatClock(slot)}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
