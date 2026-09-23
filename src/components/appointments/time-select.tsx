"use client";

import { useId } from "react";
import { cn } from "@/lib/format";

/** A wall-clock time in 12-hour parts, as the doctor picks it. */
export interface TimeParts {
  hour: number; // 1–12
  minute: number; // a multiple of the slot length
  period: "am" | "pm";
}

/** "HH:MM" (24-hour) for the API, e.g. { 2, 30, pm } → "14:30". */
export function toClockTime({ hour, minute, period }: TimeParts): string {
  const hours24 = (hour % 12) + (period === "pm" ? 12 : 0);
  return `${String(hours24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Minutes from midnight — for durations and ordering. */
export function minutesOfDay(parts: TimeParts): number {
  return ((parts.hour % 12) + (parts.period === "pm" ? 12 : 0)) * 60 + parts.minute;
}

const selectClass =
  "min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-primary-500";

/**
 * Hour, minute and AM/PM as three dropdowns. Minutes only offer whole slots
 * (":00" and ":30" for 30-minute slots), so an off-grid time can't be picked.
 */
export function TimeSelect({
  label,
  value,
  slotMinutes,
  onChange,
}: {
  label: string;
  value: TimeParts;
  slotMinutes: number;
  onChange: (value: TimeParts) => void;
}) {
  const id = useId();
  const minutes = Array.from(
    { length: Math.max(1, Math.floor(60 / slotMinutes)) },
    (_, index) => index * slotMinutes
  );

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-foreground">{label}</legend>
      <div className="flex gap-1.5">
        <label htmlFor={`${id}-hour`} className="sr-only">
          {label} hour
        </label>
        <select
          id={`${id}-hour`}
          value={value.hour}
          onChange={(event) => onChange({ ...value, hour: Number(event.target.value) })}
          className={selectClass}
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
            <option key={hour} value={hour}>
              {hour}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-minute`} className="sr-only">
          {label} minutes
        </label>
        <select
          id={`${id}-minute`}
          value={value.minute}
          onChange={(event) => onChange({ ...value, minute: Number(event.target.value) })}
          className={selectClass}
        >
          {minutes.map((minute) => (
            <option key={minute} value={minute}>
              :{String(minute).padStart(2, "0")}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-period`} className="sr-only">
          {label} AM or PM
        </label>
        <select
          id={`${id}-period`}
          value={value.period}
          onChange={(event) =>
            onChange({ ...value, period: event.target.value as TimeParts["period"] })
          }
          className={cn(selectClass, "uppercase")}
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>
      </div>
    </fieldset>
  );
}
