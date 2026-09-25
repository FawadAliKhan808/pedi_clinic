"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { SelectableCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import type { AvailabilitySession, SessionPreset, UUID } from "@/lib/api";
import { cn, formatDayShort, formatSession } from "@/lib/format";

/**
 * Pick a day that has an open session, then the session — the same card
 * choice as picking a child or a reason at check-in. Sessions have no
 * capacity, so every open one can be booked.
 */
export function SessionPicker({
  sessions,
  presets,
  selectedSessionId,
  onSelect,
  blockedDates = {},
}: {
  sessions: AvailabilitySession[];
  presets?: SessionPreset[];
  selectedSessionId: UUID | null;
  onSelect: (session: AvailabilitySession) => void;
  /** Days that can't be booked, with why (e.g. the child already has a booking). */
  blockedDates?: Record<string, string>;
}) {
  const open = sessions;
  const dates = [...new Set(open.map((session) => session.date))];

  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const selectedDate =
    pickedDate && dates.includes(pickedDate) ? pickedDate : dates[0] ?? null;

  if (dates.length === 0) {
    return (
      <EmptyState
        title="No open sessions"
        description="The doctor hasn't opened any sessions in the booking window yet. Please check again later, or come in and take a token."
      />
    );
  }

  return (
    <div className="@container flex flex-col gap-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dates.map((date) => {
          const blocked = blockedDates[date];
          return (
            <button
              key={date}
              type="button"
              onClick={() => setPickedDate(date)}
              aria-pressed={selectedDate === date}
              className={cn(
                "flex min-h-12 shrink-0 flex-col items-center justify-center rounded-lg border-2 px-4 text-sm font-semibold",
                selectedDate === date
                  ? "border-primary-600 bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200"
                  : "border-border text-foreground",
                blocked && "border-dashed text-foreground-muted"
              )}
            >
              {formatDayShort(date)}
              {blocked && <span className="text-[11px] font-medium">{blocked}</span>}
            </button>
          );
        })}
      </div>

      {selectedDate && blockedDates[selectedDate] ? (
        <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-foreground-muted">
          {blockedDates[selectedDate]} — only one appointment per child per day. Pick another day.
        </p>
      ) : (
      <div className="grid gap-3 @lg:grid-cols-2">
        {open
          .filter((session) => session.date === selectedDate)
          .map((session) => (
            <SelectableCard
              key={session.id}
              selected={selectedSessionId === session.id}
              onSelect={() => onSelect(session)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{formatSession(session, presets)}</p>
                {selectedSessionId === session.id && (
                  <Check className="size-5 shrink-0 text-primary-600" />
                )}
              </div>
            </SelectableCard>
          ))}
      </div>
      )}
    </div>
  );
}
