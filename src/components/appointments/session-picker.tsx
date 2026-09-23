"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { SelectableCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { AvailabilitySession, UUID } from "@/lib/api";
import { cn, formatClock, formatDayShort, formatTimeRange } from "@/lib/format";

/**
 * Pick a date that has an open session, then a session on it. Only sessions
 * with a free slot are offered; the server still has the final say (it
 * refuses with SESSION_FULL if a slot went in the meantime).
 */
export function SessionPicker({
  sessions,
  selectedSessionId,
  onSelect,
  excludeSessionId,
}: {
  sessions: AvailabilitySession[];
  selectedSessionId: UUID | null;
  onSelect: (session: AvailabilitySession) => void;
  excludeSessionId?: UUID;
}) {
  const open = sessions.filter(
    (session) =>
      session.id !== excludeSessionId && session.bookedCount < session.maxBookings
  );
  const dates = [...new Set(open.map((session) => session.date))];

  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate =
    pickedDate && dates.includes(pickedDate) ? pickedDate : dates[0] ?? null;

  if (dates.length === 0) {
    return (
      <EmptyState
        title="No open sessions"
        description="There are no appointment slots left in the booking window. Please check again later, or come in and take a token."
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

      {/* Two columns when there is room — a full page, not the narrow drawer. */}
      <div className="grid gap-3 @lg:grid-cols-2">
        {open
          .filter((session) => session.date === selectedDate)
          .map((session) => {
            const left = session.maxBookings - session.bookedCount;
            return (
              <SelectableCard
                key={session.id}
                selected={selectedSessionId === session.id}
                onSelect={() => onSelect(session)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {formatTimeRange(session.startTime, session.endTime)}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {session.nextFreeTime && (
                        <>
                          Your time:{" "}
                          <strong className="text-foreground">
                            {formatClock(session.nextFreeTime)}
                          </strong>{" "}
                          ·{" "}
                        </>
                      )}
                      {left} {left === 1 ? "slot" : "slots"} left
                    </p>
                  </div>
                  {selectedSessionId === session.id && (
                    <Check className="size-5 text-primary-600" />
                  )}
                </div>
              </SelectableCard>
            );
          })}
      </div>
    </div>
  );
}
